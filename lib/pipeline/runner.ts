import type { PipelinePlan, Skill, WorkflowRun } from "@/lib/types";
import {
  addActivity,
  addLog,
  getProject,
  getRun,
  getSkillRow,
  listProjectFiles,
  listSteps,
  updateRun,
  updateStep,
} from "@/lib/db/repo";
import { executeSkill, RunCancelledError } from "@/lib/runs/executor";
import { resolveAiConfig } from "@/lib/ai/providers";
import { relevantFilesForStep } from "@/lib/runs/prompts";

const running = new Set<string>();

export function isPipelineRunning(runId: string) {
  return running.has(runId);
}

function log(runId: string, message: string, level: "info" | "warn" | "error" | "success" | "debug" = "info") {
  addLog({ runId, level, message });
}

function checkControl(runId: string): "continue" | "paused" | "cancelled" {
  const run = getRun(runId);
  if (!run) return "cancelled";
  if (run.cancelRequested) return "cancelled";
  if (run.pauseRequested) return "paused";
  return "continue";
}

function taskForStep(input: {
  run: WorkflowRun;
  skill: Skill;
  index: number;
  total: number;
  priorOutputs: { skillSlug: string; output: string }[];
}): string {
  const project = input.run.projectId ? getProject(input.run.projectId) : null;
  return [
    `Run the ${input.skill.slug} skill for this project as pipeline step ${input.index + 1} of ${input.total}.`,
    project?.targetUrl ? `Target application: ${project.targetUrl}` : "",
    input.run.requirements ? `User requirements:\n${input.run.requirements}` : "",
    input.priorOutputs.length
      ? `Upstream outputs supplied below. Reuse them instead of inventing results.`
      : "This is the first step; work from the project context provided.",
    "Save the durable artifacts this skill defines as <file> blocks so later steps can read them.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function runPipeline(runId: string): Promise<void> {
  if (running.has(runId)) return;
  running.add(runId);
  try {
    let run = getRun(runId);
    if (!run || run.type !== "pipeline") throw new Error("Pipeline run not found");
    if (run.status === "completed") return;

    const plan = run.plan as PipelinePlan | null;
    if (!plan?.steps?.length) throw new Error("This run has no pipeline plan");

    updateRun(runId, {
      status: "running",
      startedAt: run.startedAt || new Date().toISOString(),
      completedAt: null,
      error: null,
      pauseRequested: false,
      cancelRequested: false,
    });
    const staleSteps = listSteps(runId).filter((step) => step.status === "running");
    for (const stale of staleSteps) {
      updateStep(stale.id, {
        status: "pending",
        error: null,
        startedAt: null,
        completedAt: null,
      });
    }
    log(runId, `Pipeline started with ${plan.steps.length} skill(s)`, "info");
    addActivity({
      projectId: run.projectId,
      runId,
      type: "pipeline.started",
      message: `Pipeline started — ${plan.steps.length} steps`,
    });

    const completedOutputs: { skillSlug: string; output: string }[] = [];
    const stepsBefore = listSteps(runId);
    for (const step of stepsBefore) {
      if (step.status === "completed" && step.output) {
        completedOutputs.push({ skillSlug: step.skillSlug, output: step.output });
      }
    }

    for (;;) {
      const control = checkControl(runId);
      if (control === "cancelled") {
        updateRun(runId, {
          status: "cancelled",
          completedAt: new Date().toISOString(),
          error: "Cancelled by the user",
        });
        log(runId, "Pipeline cancelled", "warn");
        addActivity({
          projectId: run.projectId,
          runId,
          type: "pipeline.cancelled",
          message: "Pipeline cancelled",
        });
        return;
      }
      if (control === "paused") {
        updateRun(runId, { status: "paused" });
        log(runId, "Pipeline paused. Resume when ready.", "warn");
        return;
      }

      run = getRun(runId)!;
      const steps = listSteps(runId);
      const next = steps.find((step) => step.status === "pending" || step.status === "failed");
      if (!next) break;

      const project = run.projectId ? getProject(run.projectId) : null;
      if (!project) {
        updateRun(runId, {
          status: "failed",
          error: "The project for this run no longer exists.",
          completedAt: new Date().toISOString(),
        });
        log(runId, "Project not found; cannot continue", "error");
        return;
      }

      const skill = getSkillRow(next.skillSlug);
      if (!skill) {
        updateStep(next.id, {
          status: "failed",
          error: "Skill could not be loaded from the repository.",
          completedAt: new Date().toISOString(),
        });
        updateRun(runId, {
          status: "failed",
          error: `Skill ${next.skillSlug} is unavailable.`,
          completedAt: new Date().toISOString(),
        });
        log(runId, `Skill ${next.skillSlug} is unavailable`, "error");
        return;
      }

      const unsatisfied = next.dependsOn.filter((dependency) => {
        const dependencyStep = steps.find((step) => step.skillSlug === dependency);
        if (!dependencyStep) return false;
        return !["completed", "skipped"].includes(dependencyStep.status);
      });
      if (unsatisfied.length) {
        const blockedBy = unsatisfied.join(", ");
        updateStep(next.id, {
          status: "skipped",
          error: `Skipped because prerequisite step(s) did not complete: ${blockedBy}`,
          completedAt: new Date().toISOString(),
        });
        log(runId, `Skipped ${next.skillSlug}: prerequisite ${blockedBy} not complete`, "warn");
        continue;
      }

      log(runId, `Running ${next.skillSlug} (${next.position + 1}/${steps.length})`, "info");
      try {
        const config = resolveAiConfig();
        const allFiles = listProjectFiles(project.id);
        const attached = relevantFilesForStep(allFiles, [
          skill.slug,
          ...skill.dependencies,
        ]);
        const priorOutputs = completedOutputs
          .filter((item) => item.skillSlug !== skill.slug)
          .slice(-5);

        const result = await executeSkill({
          runId,
          stepId: next.id,
          skill,
          project,
          task: taskForStep({
            run,
            skill,
            index: next.position,
            total: steps.length,
            priorOutputs,
          }),
          attachedPaths: attached.map((file) => file.path),
          priorOutputs,
          config,
          finalizeRun: false,
        });
        completedOutputs.push({ skillSlug: skill.slug, output: result.output });
        updateRun(runId, {
          output: result.output,
          demo: result.ai.demo,
          error: null,
        });
        updateStep(next.id, { output: result.output });
        log(runId, `Completed ${next.skillSlug}`, "success");
      } catch (error) {
        if (error instanceof RunCancelledError) {
          updateRun(runId, {
            status: "cancelled",
            error: "Cancelled by the user",
            completedAt: new Date().toISOString(),
          });
          log(runId, "Pipeline cancelled during step execution", "warn");
          return;
        }
        const message = error instanceof Error ? error.message : "Unknown pipeline error";
        updateRun(runId, {
          status: "failed",
          error: `Step ${next.skillSlug} failed: ${message}`,
          completedAt: new Date().toISOString(),
        });
        addActivity({
          projectId: run.projectId,
          runId,
          type: "pipeline.failed",
          message: `Pipeline failed at ${next.skillSlug}: ${message}`,
        });
        log(runId, `Step ${next.skillSlug} failed: ${message}`, "error");
        return;
      }
    }

    const finalSteps = listSteps(runId);
    const skipped = finalSteps.filter((step) => step.status === "skipped");
    updateRun(runId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      error: null,
      output:
        finalSteps.filter((step) => step.output).at(-1)?.output ||
        run.output ||
        "Pipeline completed.",
    });
    log(
      runId,
      skipped.length
        ? `Pipeline completed with ${skipped.length} skipped step(s)`
        : "Pipeline completed successfully",
      skipped.length ? "warn" : "success",
    );
    addActivity({
      projectId: run.projectId,
      runId,
      type: "pipeline.completed",
      message: `Pipeline completed — ${finalSteps.length - skipped.length}/${finalSteps.length} steps`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline error";
    updateRun(runId, {
      status: "failed",
      error: message,
      completedAt: new Date().toISOString(),
    });
    log(runId, message, "error");
  } finally {
    running.delete(runId);
  }
}

export function startPipelineRun(runId: string) {
  if (running.has(runId)) return;
  void runPipeline(runId).catch((error) => {
    addLog({
      runId,
      level: "error",
      message: error instanceof Error ? error.message : "Pipeline crashed",
    });
  });
}

export function requestPause(runId: string) {
  updateRun(runId, { pauseRequested: true });
  addLog({ runId, level: "warn", message: "Pause requested; finishing the active step first." });
}

export function requestResume(runId: string) {
  const run = getRun(runId);
  if (!run) throw new Error("Run not found");
  updateRun(runId, { pauseRequested: false, status: "queued", error: null });
  addLog({ runId, level: "info", message: "Resuming pipeline." });
  startPipelineRun(runId);
}

export function requestCancel(runId: string) {
  updateRun(runId, { cancelRequested: true, pauseRequested: false });
  addLog({ runId, level: "warn", message: "Cancellation requested." });
}
