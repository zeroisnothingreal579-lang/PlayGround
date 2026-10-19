import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { POST as controlRoute } from "@/app/api/runs/[id]/control/route";
import {
  approveScript,
  createProject,
  createRun,
  createStep,
  getRun,
  listSteps,
  updateSettings,
  updateStep,
} from "@/lib/db/repo";
import type { PipelinePlan } from "@/lib/types";
import { loadSkillPack } from "@/lib/skills/loader";

function pipelinePlan(): PipelinePlan {
  return {
    steps: [
      {
        skillSlug: "replica-recon",
        name: "Recon",
        position: 0,
        dependsOn: [],
        reason: "test",
      },
      {
        skillSlug: "replica-architect",
        name: "Architect",
        position: 1,
        dependsOn: ["replica-recon"],
        reason: "test",
      },
    ],
    order: ["replica-recon", "replica-architect"],
    warnings: [],
    estimatedTokens: 10,
    source: "bundled",
    createdAt: new Date().toISOString(),
  };
}

async function setupFailedRun() {
  await loadSkillPack({ force: true, skipGithub: true });
  const project = createProject({ name: "Control route" });
  const run = createRun({
    projectId: project.id,
    type: "pipeline",
    title: "Control route",
    plan: pipelinePlan(),
    requirements: "Test controls",
    status: "failed",
  });
  const first = createStep({
    runId: run.id,
    skillSlug: "replica-recon",
    position: 0,
    dependsOn: [],
    status: "failed",
  });
  const second = createStep({
    runId: run.id,
    skillSlug: "replica-architect",
    position: 1,
    dependsOn: ["replica-recon"],
    status: "completed",
  });
  updateStep(first.id, { error: "boom", completedAt: new Date().toISOString() });
  updateStep(second.id, {
    output: "stale output",
    completedAt: new Date().toISOString(),
    tokensUsed: 50,
  });
  return { project, run, first, second };
}

function controlRequest(runId: string, body: unknown) {
  return controlRoute(
    new Request(`http://localhost/api/runs/${runId}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: runId }) },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_MODEL;
});

describe("project API", () => {
  it("creates a valid project and rejects an invalid target URL", async () => {
    const ok = await createProjectRoute(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "API project", targetUrl: "https://example.com" }),
      }),
    );
    expect(ok.status).toBe(201);
    const payload = await ok.json();
    expect(payload.project.name).toBe("API project");

    const bad = await createProjectRoute(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bad", targetUrl: "javascript:alert(1)" }),
      }),
    );
    expect(bad.status).toBe(422);
  });
});

describe("pipeline control API", () => {
  it("retry resets the step and all downstream outputs before rerunning", async () => {
    const { project, run, first } = await setupFailedRun();
    let release: (() => void) | null = null;
    let started = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        started += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `new step ${started}\n<file path="replica/new-${started}.md">ok</file>`,
                },
              },
            ],
            usage: { prompt_tokens: 2, completion_tokens: 2 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-controls";
    process.env.AI_MODEL = "gpt-controls";

    const response = await controlRequest(run.id, { action: "retry", stepId: first.id });
    expect(response.status).toBe(200);

    await vi.waitFor(() => expect(started).toBe(1));
    const reset = listSteps(run.id);
    expect(reset[0].status).toBe("running");
    expect(reset[1].status).toBe("pending");
    expect(reset[1].output).toBeNull();
    expect(reset[1].tokensUsed).toBe(0);

    release!();
    await vi.waitFor(() => expect(started).toBe(2), { timeout: 5000 });
    release!();
    await vi.waitFor(() => expect(getRun(run.id)!.status).toBe("completed"), {
      timeout: 5000,
    });

    const finished = listSteps(run.id);
    expect(finished.every((step) => step.status === "completed")).toBe(true);
    expect(finished[1].output).toContain("new step 2");
    expect(finished[1].output).not.toContain("stale output");
    expect(project.id).toBe(run.projectId);
  });

  it("skip-and-continue marks the failed step skipped and completes downstream work", async () => {
    const { run, first } = await setupFailedRun();
    updateSettings({ allowDemoMode: true });

    const response = await controlRequest(run.id, { action: "continue", stepId: first.id });
    expect(response.status).toBe(200);

    await vi.waitFor(() => expect(getRun(run.id)!.status).toBe("completed"), {
      timeout: 5000,
    });
    const steps = listSteps(run.id);
    expect(steps[0].status).toBe("skipped");
    expect(steps[0].error).toMatch(/Skipped by the user/);
    expect(steps[1].status).toBe("completed");
    expect(getRun(run.id)!.status).toBe("completed");
  });

  it("cancels a queued pipeline even when no worker is active", async () => {
    const project = createProject({ name: "Stale pipeline" });
    const run = createRun({
      projectId: project.id,
      type: "pipeline",
      title: "Queued pipeline",
      plan: pipelinePlan(),
      requirements: "Test stale cancel",
      status: "queued",
    });
    createStep({
      runId: run.id,
      skillSlug: "replica-recon",
      position: 0,
      dependsOn: [],
      status: "pending",
    });

    const response = await controlRequest(run.id, { action: "cancel" });
    expect(response.status).toBe(200);
    const cancelled = getRun(run.id)!;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.error).toMatch(/Cancelled/);
    expect(cancelled.completedAt).toBeTruthy();

    const completed = createRun({
      projectId: project.id,
      type: "pipeline",
      title: "Finished pipeline",
      plan: pipelinePlan(),
      requirements: "Already done",
      status: "completed",
    });
    const rejected = await controlRequest(completed.id, { action: "cancel" });
    expect(rejected.status).toBe(400);
    expect(getRun(completed.id)!.status).toBe("completed");
  });

  it("rejects control actions on individual skill runs", async () => {
    const project = createProject({ name: "Skill control" });
    const run = createRun({
      projectId: project.id,
      type: "skill",
      title: "Skill",
      skillSlug: "replica-recon",
      status: "completed",
    });
    const response = await controlRequest(run.id, { action: "pause" });
    expect(response.status).toBe(400);
  });
});

describe("script approval API", () => {
  it("lists approvals for a project and skill", async () => {
    const { GET } = await import("@/app/api/sandbox/approve/route");
    const project = createProject({ name: "Approval API" });
    approveScript({
      projectId: project.id,
      skillSlug: "replica-recon",
      scriptPath: "replica-recon/sweep.py",
    });

    const response = await GET(
      new Request(
        `http://localhost/api/sandbox/approve?projectId=${project.id}&skillSlug=replica-recon`,
      ),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.approved).toEqual(["replica-recon/sweep.py"]);

    const bad = await GET(new Request("http://localhost/api/sandbox/approve"));
    expect(bad.status).toBe(422);
  });
});

describe("project files and assistant", () => {
  it("creates, updates, and reads project files through the API", async () => {
    const { POST, GET } = await import("@/app/api/projects/[id]/files/route");
    const project = createProject({ name: "File API" });
    const params = { params: Promise.resolve({ id: project.id }) };

    const created = await POST(
      new Request(`http://localhost/api/projects/${project.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "src/app.tsx", content: "export default 1" }),
      }),
      params,
    );
    expect(created.status).toBe(201);

    const updated = await POST(
      new Request(`http://localhost/api/projects/${project.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "src/app.tsx", content: "export default 2" }),
      }),
      params,
    );
    expect(updated.status).toBe(201);

    const list = await GET(
      new Request(`http://localhost/api/projects/${project.id}/files?content=true`),
      params,
    );
    const payload = await list.json();
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0].content).toBe("export default 2");

    const unsafe = await POST(
      new Request(`http://localhost/api/projects/${project.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: ".env.local", content: "SECRET=1" }),
      }),
      params,
    );
    expect(unsafe.status).toBe(400);

    const absolute = await POST(
      new Request(`http://localhost/api/projects/${project.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/etc/passwd", content: "nope" }),
      }),
      params,
    );
    expect(absolute.status).toBe(400);
  });

  it("runs the assistant in labelled demo mode and saves only valid files", async () => {
    const { POST } = await import("@/app/api/projects/[id]/chat/route");
    updateSettings({ allowDemoMode: true });
    const project = createProject({ name: "Chat API" });

    const response = await POST(
      new Request(`http://localhost/api/projects/${project.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Create a starter preview" }),
      }),
      { params: Promise.resolve({ id: project.id }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.demo).toBe(true);
    expect(payload.files).toContain("replica/demo-preview.md");
    expect(payload.response).toContain("Demo preview");

    const run = getRun(payload.runId)!;
    expect(run.status).toBe("completed");
    expect(run.type).toBe("chat");
    expect(run.demo).toBe(true);
    expect(listSteps(run.id)).toEqual([]);
  });
});
