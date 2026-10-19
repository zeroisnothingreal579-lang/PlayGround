import { NextResponse } from "next/server";
import { getSettings, getSkillRunStats, listRuns } from "@/lib/db/repo";
import { loadSkillPack } from "@/lib/skills/loader";
import { handleApiError, jsonError } from "@/lib/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const force = new URL(request.url).searchParams.get("refresh") === "true";
    const settings = getSettings();
    const result = await loadSkillPack({ repoUrl: settings.repoUrl, force });
    const skill = result.skills.find((item) => item.slug === slug);
    if (!skill) {
      return jsonError(`Skill “${slug}” was not found in the repository.`, 404);
    }
    const stats = getSkillRunStats()[slug];
    const history = listRuns({ type: "skill", limit: 20 }).filter(
      (run) => run.skillSlug === slug,
    );
    return NextResponse.json({
      skill,
      warning: result.warning,
      source: result.source,
      stats: stats || { lastRunAt: null, lastRunStatus: null, runCount: 0 },
      history,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
