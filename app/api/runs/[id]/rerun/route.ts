import { NextResponse } from "next/server";
import {
  addActivity,
  addLog,
  createRun,
  getProject,
  getRun,
  getSettings,
} from "@/lib/db/repo";
import { loadSkillPack } from "@/lib/skills/loader";
import { resolveAiConfig } from "@/lib/ai/providers";
import { executeSkill } from "@/lib/runs/executor";
import { handleApiError, jsonError } from "@/lib/api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const original = getRun(id);
    if (!original) return jsonError("Run not found", 404);
    if (original.type !== "skill" || !original.skillSlug) {
      return jsonError("Only individual skill runs can be rerun. Use retry for pipeline steps.", 400);
    }
    if (!original.projectId) return jsonError("This run has no project to rerun against", 400);
    const project = getProject(original.projectId);
    if (!project) return jsonError("Project not found", 404);
    const input = (original.input || {}) as {
      task?: string;
      attachedPaths?: string[];
    };
    if (!input.task) return jsonError("The original run has no task to rerun", 400);

    const settings = getSettings();
    const pack = await loadSkillPack({ repoUrl: settings.repoUrl });
    const skill = pack.skills.find((item) => item.slug === original.skillSlug);
    if (!skill) return jsonError("Skill is no longer available in the repository", 404);

    const config = resolveAiConfig();
    const run = createRun({
      projectId: project.id,
      type: "skill",
      title: `${skill.name} — ${project.name} (rerun)`,
      skillSlug: skill.slug,
      requirements: input.task,
      executionMode: config.demo ? "demo" : "live",
      input: { task: input.task, attachedPaths: input.attachedPaths || [] },
      demo: config.demo,
      status: "queued",
    });
    addLog({ runId: run.id, level: "info", message: `Rerun of ${original.id.slice(0, 8)}` });
    addActivity({
      projectId: project.id,
      runId: run.id,
      type: "skill.started",
      message: `${skill.name} rerun started`,
    });
    void executeSkill({
      runId: run.id,
      skill,
      project,
      task: input.task,
      attachedPaths: input.attachedPaths,
      config,
      finalizeRun: true,
    }).catch(() => {
      // Failure is persisted by the executor.
    });
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return handleApiError(error);
  }
}
