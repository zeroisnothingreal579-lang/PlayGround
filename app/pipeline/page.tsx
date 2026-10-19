import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PipelineForm } from "@/components/pipeline/pipeline-form";
import { getSettings, listProjects } from "@/lib/db/repo";
import { getRepositoryOrder, loadSkillPack } from "@/lib/skills/loader";
import { resolveAiConfig } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Full Pipeline" };

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const settings = getSettings();
  const projects = listProjects();
  const query = await searchParams;
  const defaultProjectId = projects.some((project) => project.id === query.project)
    ? query.project
    : undefined;
  let error: string | null = null;
  let warning: string | undefined;
  let skills: {
    slug: string;
    name: string;
    description: string;
    source: string;
    dependencies: string[];
  }[] = [];

  try {
    const pack = await loadSkillPack({ repoUrl: settings.repoUrl });
    const order = getRepositoryOrder(pack.skills, pack.readme);
    const rank = new Map(order.map((slug, index) => [slug, index]));
    skills = [...pack.skills]
      .sort(
        (a, b) =>
          (rank.get(a.slug) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(b.slug) ?? Number.MAX_SAFE_INTEGER) || a.slug.localeCompare(b.slug),
      )
      .map((skill) => ({
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        dependencies: skill.dependencies,
      }));
    warning = pack.warning;
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "Skills could not be loaded";
  }

  let aiConfigured = false;
  let aiLabel = "not configured";
  try {
    const config = resolveAiConfig();
    aiConfigured = true;
    aiLabel = `${config.provider}/${config.model}${config.demo ? " (demo)" : ""}`;
  } catch {
    aiConfigured = false;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Orchestration"
        title="Full Pipeline"
        description="Run the Replica skills in a dependency-aware sequence. Each successful step saves its artifacts before the next begins."
        actions={
          <Button variant="outline" asChild>
            <Link href="/runs">Workflow runs</Link>
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
              <p className="font-semibold">The pipeline cannot be planned</p>
              <p className="mt-1 text-destructive/80">{error}</p>
              <p className="mt-2 text-destructive/70">
                No placeholder plan was created. Sync the repository in Settings and try again.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <PipelineForm
          projects={projects}
          skills={skills}
          aiConfigured={aiConfigured}
          aiLabel={aiLabel}
          warning={warning}
          defaultProjectId={defaultProjectId}
        />
      )}
    </div>
  );
}
