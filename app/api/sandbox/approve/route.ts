import { NextResponse } from "next/server";
import { z } from "zod";
import { approveScript, getProject, getSettings, listApprovedScripts } from "@/lib/db/repo";
import { loadSkillPack } from "@/lib/skills/loader";
import { handleApiError, jsonError, readJson } from "@/lib/api";

const approvalSchema = z.object({
  projectId: z.string().uuid(),
  skillSlug: z.string().max(120),
  scriptPath: z.string().max(400),
});

const approvalQuerySchema = z.object({
  projectId: z.string().uuid(),
  skillSlug: z.string().max(120),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = approvalQuerySchema.safeParse({
      projectId: url.searchParams.get("projectId"),
      skillSlug: url.searchParams.get("skillSlug"),
    });
    if (!parsed.success) return jsonError("Invalid approval query", 422, parsed.error.issues);
    if (!getProject(parsed.data.projectId)) return jsonError("Project not found", 404);
    return NextResponse.json({
      approved: listApprovedScripts(parsed.data.projectId, parsed.data.skillSlug),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = approvalSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Invalid approval request", 422, parsed.error.issues);
    if (!getProject(parsed.data.projectId)) return jsonError("Project not found", 404);
    const settings = getSettings();
    const pack = await loadSkillPack({ repoUrl: settings.repoUrl });
    const skill = pack.skills.find((item) => item.slug === parsed.data.skillSlug);
    if (!skill) return jsonError("Skill not found in repository", 404);
    if (!skill.scripts.includes(parsed.data.scriptPath)) {
      return jsonError("That file is not a repository script for this skill", 400);
    }
    approveScript(parsed.data);
    return NextResponse.json({ ok: true, approvedAt: new Date().toISOString() });
  } catch (error) {
    return handleApiError(error);
  }
}
