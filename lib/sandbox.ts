import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getSettings, isScriptApproved } from "@/lib/db/repo";
import type { Skill } from "@/lib/types";

export interface SandboxStatus {
  available: boolean;
  mode: string;
  reason: string;
  dockerInstalled: boolean;
  image: string;
  imagePresent: boolean;
  limits: {
    timeoutMs: number;
    memoryMb: number;
    cpus: number;
    network: string;
  };
}

let cached: { at: number; status: SandboxStatus } | null = null;

function commandWorks(command: string, args: string[], timeout = 2500): boolean {
  try {
    const result = spawnSync(command, args, { timeout, encoding: "utf8" });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function getSandboxStatus(force = false): SandboxStatus {
  if (!force && cached && Date.now() - cached.at < 30_000) return cached.status;
  const settings = getSettings();
  const mode = settings.sandboxMode || process.env.SANDBOX_MODE || "docker";
  const dockerInstalled = commandWorks("docker", ["--version"]);
  const image =
    process.env.SANDBOX_IMAGE ||
    "python:3.12-alpine";
  const timeoutMs = Number(process.env.SANDBOX_TIMEOUT_MS) || settings.executionTimeoutMs || 15000;
  const memoryMb = Number(process.env.SANDBOX_MEMORY_MB) || 256;
  const cpus = Number(process.env.SANDBOX_CPUS) || 1;
  const limits = { timeoutMs, memoryMb, cpus, network: "none" };

  if (mode !== "docker") {
    const status: SandboxStatus = {
      available: false,
      mode,
      reason:
        "Sandbox execution is disabled. Code generation and ZIP export remain available; test execution is unavailable.",
      dockerInstalled,
      image,
      imagePresent: false,
      limits,
    };
    cached = { at: Date.now(), status };
    return status;
  }

  if (!dockerInstalled) {
    const status: SandboxStatus = {
      available: false,
      mode,
      reason:
        "Docker is not installed or not reachable. Code generation and ZIP export remain available; test execution is unavailable.",
      dockerInstalled,
      image,
      imagePresent: false,
      limits,
    };
    cached = { at: Date.now(), status };
    return status;
  }

  const daemon = commandWorks("docker", ["info"], 5000);
  const imagePresent = daemon && commandWorks("docker", ["image", "inspect", image], 4000);
  const status: SandboxStatus = {
    available: daemon && imagePresent,
    mode,
    reason: !daemon
      ? "Docker daemon is not reachable."
      : !imagePresent
        ? `Sandbox image ${image} is not present locally. Run: docker pull ${image}`
        : "Docker sandbox ready: no network, read-only root, CPU/memory/PID limits, hard timeout.",
    dockerInstalled,
    image,
    imagePresent,
    limits,
  };
  cached = { at: Date.now(), status };
  return status;
}

export interface SandboxResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  command: string;
}

const MAX_OUTPUT = 120_000;

function clip(value: string): string {
  return value.length > MAX_OUTPUT ? `${value.slice(0, MAX_OUTPUT)}\n[output truncated]` : value;
}

export async function runInSandbox(input: {
  scriptContent: string;
  scriptName: string;
  args?: string[];
  projectFiles?: { path: string; content: string }[];
}): Promise<SandboxResult> {
  const status = getSandboxStatus();
  if (!status.available) throw new Error(status.reason);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "replica-sandbox-"));
  fs.chmodSync(temp, 0o755);
  try {
    const scriptName = path.basename(input.scriptName || "script.py");
    fs.writeFileSync(path.join(temp, scriptName), input.scriptContent, "utf8");
    for (const file of input.projectFiles || []) {
      const safe = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
      if (safe.split("/").some((part) => part === ".." || part === "")) continue;
      const target = path.join(temp, "project", safe);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content, "utf8");
    }

    const image = status.image;
    const extension = path.extname(scriptName).toLowerCase();
    const interpreters: Record<string, string> = {
      ".py": "python3",
      ".sh": "sh",
      ".bash": "sh",
      ".js": "node",
      ".mjs": "node",
      ".cjs": "node",
    };
    const interpreter = interpreters[extension];
    if (!interpreter) {
      throw new Error(
        `Sandbox image ${image} does not support ${extension || "extensionless"} scripts. Use .py, .sh, .js, .mjs, or .cjs.`,
      );
    }
    if (interpreter === "node" && /python/i.test(image)) {
      throw new Error(
        `JavaScript scripts require a Node-based SANDBOX_IMAGE. The current image is ${image}.`,
      );
    }
    const args = (input.args || []).map((arg) => arg.slice(0, 500));
    const containerName = `replica-sandbox-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const dockerArgs = [
      "run",
      "--rm",
      "--name",
      containerName,
      "--network",
      "none",
      "--memory",
      `${status.limits.memoryMb}m`,
      "--cpus",
      String(status.limits.cpus),
      "--pids-limit",
      "128",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "-v",
      `${temp}:/work:ro`,
      "-w",
      "/work",
      image,
      interpreter,
      `/work/${scriptName}`,
      ...args,
    ];
    const command = `docker ${dockerArgs.join(" ")}`;
    const started = Date.now();
    return await new Promise<SandboxResult>((resolve) => {
      const child = spawn("docker", dockerArgs, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        spawnSync("docker", ["kill", containerName], { timeout: 3000 });
        child.kill("SIGKILL");
      }, status.limits.timeoutMs);
      child.stdout.on("data", (chunk) => {
        if (stdout.length < MAX_OUTPUT * 2) stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        if (stderr.length < MAX_OUTPUT * 2) stderr += String(chunk);
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({
          exitCode,
          stdout: clip(stdout),
          stderr: clip(stderr),
          timedOut,
          durationMs: Date.now() - started,
          command,
        });
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          exitCode: null,
          stdout: clip(stdout),
          stderr: clip(`${stderr}\n${error.message}`),
          timedOut,
          durationMs: Date.now() - started,
          command,
        });
      });
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

export function assertScriptApproved(input: {
  projectId: string;
  skill: Skill;
  scriptPath: string;
}) {
  const file = input.skill.files.find((candidate) => candidate.path === input.scriptPath);
  if (!file) throw new Error("Script does not belong to the loaded skill.");
  if (!input.skill.scripts.includes(input.scriptPath)) {
    throw new Error("Only files classified as scripts can be executed.");
  }
  if (
    !isScriptApproved({
      projectId: input.projectId,
      skillSlug: input.skill.slug,
      scriptPath: input.scriptPath,
    })
  ) {
    throw new Error(
      "Script execution requires explicit approval. Review the script and approve it first.",
    );
  }
  return file;
}
