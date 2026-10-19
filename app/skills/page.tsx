import Link from "next/link";
import { FolderKanban, RefreshCw, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SkillsLibrary } from "@/components/skills/skills-library";
import { getSettings, getSkillRunStats } from "@/lib/db/repo";
import { getRepositoryOrder, loadSkillPack } from "@/lib/skills/loader";
import type { SkillSummary } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Skills Library" };

export default async function SkillsPage() {
  const settings = getSettings();
  let error: string | null = null;
  let skills: SkillSummary[] = [];
  let order: string[] = [];
  let source = "unavailable";
  let commit: string | null = null;
  let warning: string | undefined;

  try {
    const pack = await loadSkillPack({ repoUrl: settings.repoUrl });
    const stats = getSkillRunStats();
    skills = pack.skills.map((skill) => ({
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
    order = getRepositoryOrder(pack.skills, pack.readme);
    source = pack.source;
    commit = pack.commit;
    warning = pack.warning;
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "Skills could not be loaded";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Repository"
        title="Skills Library"
        description="The eleven Replica skills, loaded from Jakeschincariol/replica-skill with their original instructions, scripts, and dependencies."
        actions={
          <Button variant="outline" asChild>
            <Link href="/pipeline">
              <FolderKanban />
              Plan pipeline
            </Link>
          </Button>
        }
      />

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive"
        >
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Skills could not be loaded</p>
              <p className="mt-1 text-destructive/80">{error}</p>
              <p className="mt-2 text-destructive/70">
                No placeholder skills were created. Check the repository URL and server network
                access in Settings, then reload this page.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/settings">
                  <RefreshCw /> Open settings
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <SkillsLibrary
          skills={skills}
          order={order}
          source={source}
          commit={commit}
          repoUrl={settings.repoUrl}
          warning={warning}
        />
      )}
    </div>
  );
}
