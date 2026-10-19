import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject, getSettings, listProjectFiles } from "@/lib/db/repo";
import { loadSkillPack } from "@/lib/skills/loader";
import { planPipeline, PipelinePlanningError } from "@/lib/pipeline/planner";
import { handleApiError, jsonError, readJson } from "@/lib/api";
import { getApkPromptContext } from "@/lib/apk/context";

const planSchema = z.object({
  projectId: z.string().uuid().optional(),
  requirements: z.string().max(50_000).optional(),
  selectedSlugs: z.array(z.string().max(120)).max(20).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = planSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Invalid plan request", 422, parsed.error.issues);
    const settings = getSettings();
    const pack = await loadSkillPack({ repoUrl: settings.repoUrl });
    let contextChars = 0;
    if (parsed.data.projectId) {
      const project = getProject(parsed.data.projectId);
      if (!project) return jsonError("Project not found", 404);
      contextChars =
        listProjectFiles(project.id).reduce((total, file) => total + file.content.length, 0) +
        (getApkPromptContext(project.id)?.length || 0);
    }
    const plan = planPipeline({
      skills: pack.skills,
      readme: pack.readme,
      requirements: parsed.data.requirements,
      selectedSlugs: parsed.data.selectedSlugs,
      projectContextChars: contextChars,
    });
    return NextResponse.json({
      plan,
      warning: pack.warning,
      source: pack.source,
      skillCount: pack.skills.length,
    });
  } catch (error) {
    if (error instanceof PipelinePlanningError) return jsonError(error.message, 422);
    return handleApiError(error);
  }
}
