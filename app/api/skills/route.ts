import { NextResponse } from "next/server";
import { getSettings, getSkillRunStats } from "@/lib/db/repo";
import { getRepositoryOrder, loadSkillPack } from "@/lib/skills/loader";
import { handleApiError } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("refresh") === "true";
    const settings = getSettings();
    const result = await loadSkillPack({
      repoUrl: settings.repoUrl,
      force,
    });
    const stats = getSkillRunStats();
    const skills = result.skills.map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      source: skill.source,
      commit: skill.commit,
      dependencies: skill.dependencies,
      fileCount: skill.files.length,
      scriptCount: skill.scripts.length,
      lastRunAt: stats[skill.slug]?.lastRunAt ?? null,
      lastRunStatus: stats[skill.slug]?.lastRunStatus ?? null,
      runCount: stats[skill.slug]?.runCount ?? 0,
    }));
    return NextResponse.json({
      skills,
      source: result.source,
      repoUrl: result.repoUrl,
      commit: result.commit,
      warning: result.warning,
      checkedAt: result.checkedAt,
      order: getRepositoryOrder(result.skills, result.readme),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
