import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addActivity,
  addLog,
  getRun,
  listSteps,
  updateRun,
  updateStep,
} from "@/lib/db/repo";
import {
  isPipelineRunning,
  requestCancel,
  requestPause,
  requestResume,
  startPipelineRun,
} from "@/lib/pipeline/runner";
import { abortRun } from "@/lib/runs/executor";
import { handleApiError, jsonError, readJson } from "@/lib/api";

const controlSchema = z.object({
  action: z.enum(["start", "pause", "resume", "cancel", "retry", "continue"]),
  stepId: z.string().uuid().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const run = getRun(id);
    if (!run) return jsonError("Run not found", 404);
    if (run.type !== "pipeline") {
      if (parsedAction(await readJson(request)) === "cancel") {
        if (["completed", "failed", "cancelled"].includes(run.status)) {
          return jsonError("This run has already finished", 400);
        }
        requestCancel(id);
        abortRun(id);
        updateRun(id, {
          status: "cancelled",
          error: "Cancelled by the user",
          completedAt: new Date().toISOString(),
        });
        return NextResponse.json({ ok: true });
      }
      return jsonError("Only pipeline runs support this control", 400);
    }

    const parsed = controlSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Invalid control action", 422, parsed.error.issues);

    switch (parsed.data.action) {
      case "start": {
        if (run.status !== "queued") {
          return jsonError("Only a queued pipeline can be started", 400);
        }
        startPipelineRun(id);
        return NextResponse.json({ ok: true, action: "start" });
      }
      case "pause": {
        if (run.status !== "running") {
          return jsonError("Only a running pipeline can be paused", 400);
        }
        requestPause(id);
        if (!isPipelineRunning(id)) {
          updateRun(id, { status: "paused" });
        }
        return NextResponse.json({ ok: true, action: "pause" });
      }
      case "resume": {
        if (run.status !== "paused") {
          return jsonError("Only a paused pipeline can be resumed", 400);
        }
        requestResume(id);
        return NextResponse.json({ ok: true, action: "resume" });
      }
      case "cancel": {
        if (!["queued", "running", "paused"].includes(run.status)) {
          return jsonError("This pipeline has already finished", 400);
        }
        requestCancel(id);
        abortRun(id);
        if (!isPipelineRunning(id)) {
          updateRun(id, {
            status: "cancelled",
            error: "Cancelled by the user",
            completedAt: new Date().toISOString(),
          });
        }
        return NextResponse.json({ ok: true, action: "cancel" });
      }
      case "retry": {
        if (!parsed.data.stepId) return jsonError("stepId is required to retry", 422);
        const step = listSteps(id).find((candidate) => candidate.id === parsed.data.stepId);
        if (!step) return jsonError("Step not found", 404);
        if (!["failed", "cancelled", "skipped"].includes(step.status)) {
          return jsonError("Only failed, cancelled, or skipped steps can be retried", 400);
        }
        updateStep(step.id, {
          status: "pending",
          error: null,
          output: null,
          startedAt: null,
          completedAt: null,
          tokensUsed: 0,
        });
        for (const downstream of listSteps(id).filter(
          (candidate) => candidate.position > step.position,
        )) {
          updateStep(downstream.id, {
            status: "pending",
            error: null,
            output: null,
            startedAt: null,
            completedAt: null,
            tokensUsed: 0,
          });
        }
        updateRun(id, {
          status: "queued",
          output: null,
          error: null,
          pauseRequested: false,
          cancelRequested: false,
          completedAt: null,
        });
        addLog({ runId: id, stepId: step.id, level: "info", message: `Retrying ${step.skillSlug}` });
        startPipelineRun(id);
        return NextResponse.json({ ok: true, action: "retry" });
      }
      case "continue": {
        if (!parsed.data.stepId) return jsonError("stepId is required to continue", 422);
        const step = listSteps(id).find((candidate) => candidate.id === parsed.data.stepId);
        if (!step) return jsonError("Step not found", 404);
        if (step.status !== "failed") return jsonError("Only a failed step can be skipped", 400);
        updateStep(step.id, {
          status: "skipped",
          error: "Skipped by the user; downstream steps will run with incomplete input.",
          completedAt: new Date().toISOString(),
        });
        updateRun(id, {
          status: "queued",
          error: null,
          pauseRequested: false,
          cancelRequested: false,
          completedAt: null,
        });
        addLog({
          runId: id,
          stepId: step.id,
          level: "warn",
          message: `Skipped failed step ${step.skillSlug} at the user's request`,
        });
        addActivity({
          projectId: run.projectId,
          runId: id,
          type: "pipeline.continued",
          message: `Skipped failed step ${step.skillSlug} and continued`,
        });
        startPipelineRun(id);
        return NextResponse.json({ ok: true, action: "continue" });
      }
    }
  } catch (error) {
    return handleApiError(error);
  }
}

function parsedAction(body: unknown): string {
  return typeof body === "object" && body && "action" in body
    ? String((body as { action: unknown }).action)
    : "";
}
