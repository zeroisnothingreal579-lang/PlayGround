import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addActivity,
  addLog,
  createRun,
  createStep,
  getProject,
  getSettings,
  listProjectFiles,
  updateRun,
} from "@/lib/db/repo";
import { loadSkillPack } from "@/lib/skills/loader";
import { planPipeline, PipelinePlanningError } from "@/lib/pipeline/planner";
import { startPipelineRun } from "@/lib/pipeline/runner";
import { handleApiError, jsonError, readJson } from "@/lib/api";
import { getApkPromptContext } from "@/lib/apk/context";

const pipelineSchema = z.object({
  projectId: z.string().uuid(),
  requirements: z.string().trim().min(3).max(50_000),
  targetUrl: z.string().trim().max(2000).optional().nullable(),
  selectedSlugs: z.array(z.string().max(120)).max(20).optional(),
  executionMode: z.enum(["sequential"]).optional(),
  autoStart: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = pipelineSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Invalid pipeline request", 422, parsed.error.issues);
    const project = getProject(parsed.data.projectId);
    if (!project) return jsonError("Project not found", 404);

    const settings = getSettings();
    const pack = await loadSkillPack({ repoUrl: settings.repoUrl });
    const apkContext = getApkPromptContext(project.id);
    const contextChars =
      listProjectFiles(project.id).reduce((total, file) => total + file.content.length, 0) +
      (apkContext?.length || 0);
    const plan = planPipeline({
      skills: pack.skills,
      readme: pack.readme,
      requirements: parsed.data.requirements,
      selectedSlugs: parsed.data.selectedSlugs,
      projectContextChars: contextChars,
    });

    const run = createRun({
      projectId: project.id,
      type: "pipeline",
      title: `Full pipeline — ${project.name}`,
      requirements: parsed.data.requirements,
      targetUrl: parsed.data.targetUrl || project.targetUrl,
      executionMode: parsed.data.executionMode || "sequential",
      plan,
      estimatedTokens: plan.estimatedTokens,
      status: "queued",
      input: {
        requirements: parsed.data.requirements,
        targetUrl: parsed.data.targetUrl || project.targetUrl,
        selectedSlugs: plan.order,
      },
    });

    for (const step of plan.steps) {
      createStep({
        runId: run.id,
        skillSlug: step.skillSlug,
        position: step.position,
        dependsOn: step.dependsOn,
        status: "pending",
      });
    }

    addLog({
      runId: run.id,
      level: "info",
      message: `Created dependency-aware plan with ${plan.steps.length} step(s) from ${pack.source}`,
    });
    addActivity({
      projectId: project.id,
      runId: run.id,
      type: "pipeline.created",
      message: `Pipeline planned — ${plan.steps.length} steps`,
    });

    if (parsed.data.autoStart) {
      startPipelineRun(run.id);
      updateRun(run.id, { status: "running" });
    }

    return NextResponse.json({ run, plan }, { status: 201 });
  } catch (error) {
    if (error instanceof PipelinePlanningError) return jsonError(error.message, 422);
    return handleApiError(error);
  }
}
