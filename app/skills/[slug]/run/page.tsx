import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SkillRunForm } from "@/components/skills/skill-run-form";
import { getSettings, listProjects } from "@/lib/db/repo";
import { loadSkillPack } from "@/lib/skills/loader";
import { resolveAiConfig, providerSetupMessage } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

export default async function SkillRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const settings = getSettings();
  const pack = await loadSkillPack({ repoUrl: settings.repoUrl });
  const skill = pack.skills.find((item) => item.slug === slug);
  if (!skill) notFound();
  const projects = listProjects();
  const defaultProjectId = projects.some((project) => project.id === query.project)
    ? query.project
    : undefined;

  let ai = {
    configured: false,
    demo: false,
    provider: settings.aiProvider || "none",
    model: settings.aiModel || "not selected",
    setupMessage: providerSetupMessage(),
  };
  try {
    const config = resolveAiConfig();
    ai = {
      configured: true,
      demo: config.demo,
      provider: config.provider,
      model: config.model,
      setupMessage: providerSetupMessage(),
    };
  } catch (error) {
    ai.setupMessage = error instanceof Error ? error.message : providerSetupMessage();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/skills/${skill.slug}`}>
            <ArrowLeft /> {skill.slug}
          </Link>
        </Button>
      </div>
      <PageHeader
        eyebrow="Individual skill execution"
        title={`Run ${skill.slug}`}
        description={skill.description || "Execute the repository instructions against a project."}
        actions={
          <Button variant="outline" asChild>
            <Link href="/skills">All skills</Link>
          </Button>
        }
      />
      {pack.warning ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {pack.warning}
        </div>
      ) : null}
      <SkillRunForm
        skill={skill}
        projects={projects}
        ai={ai}
        defaultProjectId={defaultProjectId}
      />
    </div>
  );
}
