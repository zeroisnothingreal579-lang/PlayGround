import { describe, expect, it } from "vitest";
import {
  assertScriptApproved,
  getSandboxStatus,
  runInSandbox,
} from "@/lib/sandbox";
import { approveScript, createProject, updateSettings } from "@/lib/db/repo";
import type { Skill } from "@/lib/types";

const skill = {
  slug: "replica-test",
  name: "Test",
  scripts: ["scripts/check.py"],
  files: [
    { path: "scripts/check.py", content: "print('ok')", size: 11 },
    { path: "README.md", content: "docs", size: 4 },
  ],
} as unknown as Skill;

describe("sandbox safety gates", () => {
  it("reports unavailable when Docker execution is disabled", async () => {
    updateSettings({ sandboxMode: "disabled" });
    const status = getSandboxStatus(true);

    expect(status.available).toBe(false);
    expect(status.mode).toBe("disabled");
    expect(status.reason).toMatch(/unavailable/i);
    await expect(
      runInSandbox({ scriptContent: "print('x')", scriptName: "check.py" }),
    ).rejects.toThrow(/unavailable/i);
  });

  it("requires explicit approval before any script executes", async () => {
    updateSettings({ sandboxMode: "docker" });
    const project = createProject({ name: "Sandbox approvals" });

    expect(() =>
      assertScriptApproved({
        projectId: project.id,
        skill,
        scriptPath: "scripts/check.py",
      }),
    ).toThrow(/explicit approval/i);

    approveScript({
      projectId: project.id,
      skillSlug: skill.slug,
      scriptPath: "scripts/check.py",
    });

    const file = assertScriptApproved({
      projectId: project.id,
      skill,
      scriptPath: "scripts/check.py",
    });
    expect(file.content).toContain("print");
  });

  it("never executes a non-script or a file outside the skill", () => {
    const project = createProject({ name: "Sandbox ownership" });
    approveScript({
      projectId: project.id,
      skillSlug: skill.slug,
      scriptPath: "README.md",
    });

    expect(() =>
      assertScriptApproved({ projectId: project.id, skill, scriptPath: "README.md" }),
    ).toThrow(/classified as scripts/i);
    expect(() =>
      assertScriptApproved({ projectId: project.id, skill, scriptPath: "scripts/other.py" }),
    ).toThrow(/does not belong/i);
  });
});

describe("Docker sandbox integration", () => {
  it.skipIf(process.env.RUN_SANDBOX !== "1")(
    "runs Python with no network and a read-only work mount",
    async () => {
      updateSettings({ sandboxMode: "docker" });
      const status = getSandboxStatus(true);
      expect(status.available, status.reason).toBe(true);
      const result = await runInSandbox({
        scriptContent: [
          "import socket",
          "print('sandbox-ok')",
          "try:",
          "    open('/work/escape.txt', 'w')",
          "    print('WRITE_ALLOWED')",
          "except Exception:",
          "    print('READ_ONLY_OK')",
          "try:",
          "    socket.create_connection(('1.1.1.1', 80), timeout=1)",
          "    print('NETWORK_ALLOWED')",
          "except Exception:",
          "    print('NETWORK_BLOCKED')",
        ].join("\n"),
        scriptName: "scripts/check.py",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("sandbox-ok");
      expect(result.stdout).toContain("READ_ONLY_OK");
      expect(result.stdout).toContain("NETWORK_BLOCKED");
      expect(result.timedOut).toBe(false);
    },
    60000,
  );
});

describe("Docker sandbox timeout", () => {
  it.skipIf(process.env.RUN_SANDBOX !== "1")(
    "kills a script that exceeds the configured timeout",
    async () => {
      updateSettings({ sandboxMode: "docker", executionTimeoutMs: 1000 });
      getSandboxStatus(true);
      const started = Date.now();
      const result = await runInSandbox({
        scriptContent: "import time\ntime.sleep(30)\nprint('too late')",
        scriptName: "scripts/slow.py",
      });

      expect(result.timedOut).toBe(true);
      expect(result.exitCode === 0).toBe(false);
      expect(Date.now() - started).toBeLessThan(10000);
      expect(result.stdout).not.toContain("too late");
    },
    60000,
  );
});
