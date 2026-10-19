import { afterEach, describe, expect, it, vi } from "vitest";
import { abortRun, executeSkill } from "@/lib/runs/executor";
import {
  requestCancel,
  requestPause,
  requestResume,
  runPipeline,
} from "@/lib/pipeline/runner";
import { planPipeline } from "@/lib/pipeline/planner";
import { loadSkillPack } from "@/lib/skills/loader";
import {
  createProject,
  createRun,
  createStep,
  getProjectFile,
  getRun,
  listLogs,
  listProjectFiles,
  listSteps,
  updateRun,
  updateSettings,
} from "@/lib/db/repo";
import { parseGeneratedFiles } from "@/lib/runs/prompts";
import { sanitizeProjectPath as safeProjectPath } from "@/lib/db/repo";

function demoConfig() {
  return {
    provider: "demo" as const,
    model: "demo-preview",
    maxOutputTokens: 1024,
    timeoutMs: 5000,
    demo: true,
  };
}

describe("individual skill execution", () => {
  it("runs a skill, saves files, logs progress, and completes durably", async () => {
    const pack = await loadSkillPack({ force: true, skipGithub: true });
    const skill = pack.skills.find((candidate) => candidate.slug === "replica-recon")!;
    const project = createProject({ name: "Acme clone", targetUrl: "https://acme.test" });
    const run = createRun({
      projectId: project.id,
      type: "skill",
      title: "Recon",
      skillSlug: skill.slug,
      requirements: "Map the public pages",
      status: "queued",
    });

    const result = await executeSkill({
      runId: run.id,
      skill,
      project,
      task: "Map the public pages",
      config: demoConfig(),
    });

    expect(result.ai.demo).toBe(true);
    expect(result.files).toContain("replica/demo-preview.md");
    const saved = getProjectFile(project.id, "replica/demo-preview.md");
    expect(saved?.content).toContain("No model was called");

    const finished = getRun(run.id)!;
    expect(finished.status).toBe("completed");
    expect(finished.demo).toBe(true);
    expect(finished.completedAt).toBeTruthy();
    expect(finished.output).toContain("Demo preview");

    const logs = listLogs(run.id);
    expect(logs.some((entry) => entry.message.includes("Loaded skill"))).toBe(true);
    expect(logs.some((entry) => entry.level === "warn" && entry.message.includes("DEMO"))).toBe(
      true,
    );
    expect(logs.some((entry) => entry.level === "success")).toBe(true);
  });

  it("records cancellation instead of reporting success", async () => {
    const pack = await loadSkillPack({ force: true, skipGithub: true });
    const skill = pack.skills.find((candidate) => candidate.slug === "replica-recon")!;
    const project = createProject({ name: "Cancel test" });
    const run = createRun({
      projectId: project.id,
      type: "skill",
      title: "Recon",
      skillSlug: skill.slug,
      status: "queued",
    });
    updateRun(run.id, { cancelRequested: true });

    await expect(
      executeSkill({ runId: run.id, skill, project, task: "Do work", config: demoConfig() }),
    ).rejects.toThrow(/cancel/i);

    const finished = getRun(run.id)!;
    expect(finished.status).toBe("cancelled");
    expect(finished.completedAt).toBeTruthy();
    expect(listProjectFiles(project.id)).toHaveLength(0);
  });
});

describe("pipeline execution", () => {
  it("executes selected skills in dependency order and persists every step", async () => {
    const pack = await loadSkillPack({ force: true, skipGithub: true });
    const plan = planPipeline({
      skills: pack.skills,
      readme: pack.readme,
      selectedSlugs: ["replica-architect", "replica-recon"],
    });
    const project = createProject({ name: "Pipeline test", targetUrl: "https://acme.test" });
    const run = createRun({
      projectId: project.id,
      type: "pipeline",
      title: "Recon + architect",
      plan,
      requirements: "Plan the clone",
      status: "queued",
    });
    for (const step of plan.steps) {
      createStep({
        runId: run.id,
        skillSlug: step.skillSlug,
        position: step.position,
        dependsOn: step.dependsOn,
      });
    }
    updateSettings({ allowDemoMode: true });

    await runPipeline(run.id);

    const finished = getRun(run.id)!;
    expect(finished.status).toBe("completed");
    expect(finished.demo).toBe(true);
    expect(finished.error).toBeNull();

    const steps = listSteps(run.id);
    expect(steps).toHaveLength(plan.steps.length);
    expect(steps.every((step) => step.status === "completed")).toBe(true);
    expect(steps.map((step) => step.skillSlug)).toEqual(
      expect.arrayContaining(["replica-recon", "replica-architect"]),
    );
    expect(steps.every((step) => Boolean(step.completedAt))).toBe(true);
    expect(listProjectFiles(project.id).length).toBeGreaterThan(0);
  });

  it("fails the run when a planned skill is unavailable and never marks it complete", async () => {
    const project = createProject({ name: "Missing skill" });
    const plan = {
      steps: [
        {
          skillSlug: "replica-does-not-exist",
          name: "Missing",
          position: 0,
          dependsOn: [],
          reason: "test",
        },
      ],
      order: ["replica-does-not-exist"],
      warnings: [],
      estimatedTokens: 10,
      source: "bundled" as const,
      createdAt: new Date().toISOString(),
    };
    const run = createRun({
      projectId: project.id,
      type: "pipeline",
      title: "Broken pipeline",
      plan,
      status: "queued",
    });
    createStep({
      runId: run.id,
      skillSlug: "replica-does-not-exist",
      position: 0,
      dependsOn: [],
    });
    updateSettings({ allowDemoMode: true });

    await runPipeline(run.id);

    const finished = getRun(run.id)!;
    expect(finished.status).toBe("failed");
    expect(finished.error).toMatch(/unavailable/i);
    expect(listSteps(run.id)[0].status).toBe("failed");
  });

  it("requires a project and a plan", async () => {
    const standalone = createRun({
      type: "pipeline",
      title: "No project",
      plan: {
        steps: [
          {
            skillSlug: "replica-recon",
            name: "Recon",
            position: 0,
            dependsOn: [],
            reason: "test",
          },
        ],
        order: ["replica-recon"],
        warnings: [],
        estimatedTokens: 1,
        source: "bundled",
        createdAt: new Date().toISOString(),
      },
    });
    createStep({
      runId: standalone.id,
      skillSlug: "replica-recon",
      position: 0,
      dependsOn: [],
    });

    await runPipeline(standalone.id);
    expect(getRun(standalone.id)!.status).toBe("failed");
    expect(getRun(standalone.id)!.error).toMatch(/project/i);
  });
});

describe("generated file extraction and path safety", () => {
  it("extracts <file> blocks, including repeated paths only once", () => {
    const output = [
      "Some narrative",
      '<file path="replica/recon.md">',
      "# Recon",
      "</file>",
      '<file path="replica/recon.md">duplicate</file>',
      '<file path="src/app.tsx">export default function App() {}</file>',
    ].join("\n");

    const files = parseGeneratedFiles(output);
    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({ path: "replica/recon.md", content: "# Recon" });
    expect(files[1].path).toBe("src/app.tsx");
  });

  it("rejects traversal, absolute paths, and secret files", () => {
    expect(() => safeProjectPath("../../etc/passwd")).toThrow();
    expect(() => safeProjectPath("/etc/passwd")).toThrow();
    expect(() => safeProjectPath(".env")).toThrow();
    expect(() => safeProjectPath(".env.local")).toThrow();
    expect(safeProjectPath("./src/App.tsx")).toBe("src/App.tsx");
  });
});

describe("pipeline pause, resume, and cancel controls", () => {
  async function setupTwoStepRun() {
    const pack = await loadSkillPack({ force: true, skipGithub: true });
    const plan = {
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
      source: "bundled" as const,
      createdAt: new Date().toISOString(),
    };
    const project = createProject({ name: "Controls" });
    const run = createRun({
      projectId: project.id,
      type: "pipeline",
      title: "Controls",
      plan,
      requirements: "Test controls",
      status: "queued",
    });
    for (const step of plan.steps) {
      createStep({
        runId: run.id,
        skillSlug: step.skillSlug,
        position: step.position,
        dependsOn: step.dependsOn,
      });
    }
    expect(pack.skills.length).toBe(11);
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-controls";
    process.env.AI_MODEL = "gpt-controls";
    return { run, project };
  }

  function aiResponse(label: string) {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: `${label}\n<file path="replica/${label}.md">${label}</file>`,
            },
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_MODEL;
  });

  it("pauses after the active step, preserves it, resumes, and reports the final step output", async () => {
    const { run } = await setupTwoStepRun();
    let block = true;
    const pending: ((response: Response) => void)[] = [];
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls += 1;
        if (block) {
          return new Promise<Response>((resolve, reject) => {
            pending.push(resolve);
            init.signal?.addEventListener("abort", () =>
              reject(new Error("Request aborted")),
            );
          });
        }
        return aiResponse(`step-${calls}`);
      }),
    );

    const pipeline = runPipeline(run.id);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    requestPause(run.id);
    pending.shift()!(aiResponse("step-1"));
    await pipeline;

    const paused = getRun(run.id)!;
    expect(paused.status).toBe("paused");
    const pausedSteps = listSteps(run.id);
    expect(pausedSteps[0].status).toBe("completed");
    expect(pausedSteps[1].status).toBe("pending");

    block = false;
    requestResume(run.id);
    await vi.waitFor(() => expect(getRun(run.id)!.status).toBe("completed"), {
      timeout: 5000,
    });

    const finished = getRun(run.id)!;
    expect(finished.status).toBe("completed");
    expect(listSteps(run.id).every((step) => step.status === "completed")).toBe(true);
    expect(finished.output).toContain("step-2");
  });

  it("cancels an in-flight request and never marks remaining steps complete", async () => {
    const { run } = await setupTwoStepRun();
    const pending: ((response: Response) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        return new Promise<Response>((resolve, reject) => {
          pending.push(resolve);
          init.signal?.addEventListener("abort", () =>
            reject(new Error("Run cancelled")),
          );
        });
      }),
    );

    const pipeline = runPipeline(run.id);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    requestCancel(run.id);
    abortRun(run.id);
    await pipeline;

    const finished = getRun(run.id)!;
    expect(finished.status).toBe("cancelled");
    const steps = listSteps(run.id);
    expect(steps[0].status).toBe("cancelled");
    expect(steps[1].status).toBe("pending");
  });
});
