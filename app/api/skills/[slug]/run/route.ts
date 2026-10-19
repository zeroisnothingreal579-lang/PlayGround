import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject, getSettings, createRun, addLog, addActivity } from "@/lib/db/repo";
import { loadSkillPack } from "@/lib/skills/loader";
import { resolveAiConfig, AiConfigurationError } from "@/lib/ai/providers";
import { executeSkill } from "@/lib/runs/executor";
import { handleApiError, jsonError, readJson } from "@/lib/api";

const runSchema = z.object({
  projectId: z.string().uuid(),
  task: z.string().trim().min(3).max(50_000),
  attachedPaths: z.array(z.string().max(400)).max(30).optional(),
  demo: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const parsed = runSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Invalid skill run request", 422, parsed.error.issues);

    const project = getProject(parsed.data.projectId);
    if (!project) return jsonError("Project not found", 404);

    const settings = getSettings();
    const pack = await loadSkillPack({ repoUrl: settings.repoUrl });
    const skill = pack.skills.find((item) => item.slug === slug);
    if (!skill) return jsonError(`Skill “${slug}” was not found in the repository.`, 404);

    let config;
    try {
      config = resolveAiConfig({
        allowDemo: parsed.data.demo || settings.allowDemoMode,
      });
    } catch (error) {
      if (error instanceof AiConfigurationError) return jsonError(error.message, 400);
      throw error;
    }

    const run = createRun({
      projectId: project.id,
      type: "skill",
      title: `${skill.name} — ${project.name}`,
      skillSlug: skill.slug,
      requirements: parsed.data.task,
      executionMode: config.demo ? "demo" : "live",
      input: {
        task: parsed.data.task,
        attachedPaths: parsed.data.attachedPaths || [],
        provider: config.provider,
        model: config.model,
      },
      demo: config.demo,
      status: "queued",
    });

    addLog({
      runId: run.id,
      level: "info",
      message: `Queued ${skill.slug} with ${config.provider}/${config.model}${config.demo ? " (demo preview)" : ""}`,
    });
    addActivity({
      projectId: project.id,
      runId: run.id,
      type: "skill.started",
      message: `${skill.name} started${config.demo ? " (demo)" : ""}`,
    });

    void executeSkill({
      runId: run.id,
      skill,
      project,
      task: parsed.data.task,
      attachedPaths: parsed.data.attachedPaths,
      config,
      finalizeRun: true,
    }).catch(() => {
      // The executor records the failure on the run and in the logs.
    });

    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return handleApiError(error);
  }
}
