import Link from "next/link";
import { notFound } from "next/navigation";
import matter from "gray-matter";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  GitBranch,
  GitCommitHorizontal,
  Play,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { StatusBadge } from "@/components/status-badge";
import { SkillFiles } from "@/components/skills/skill-files";
import { getSettings, listProjects, listRuns, getSkillRunStats } from "@/lib/db/repo";
import { loadSkillPack } from "@/lib/skills/loader";
import { getSandboxStatus } from "@/lib/sandbox";
import { formatDate, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const settings = getSettings();
  const pack = await loadSkillPack({ repoUrl: settings.repoUrl });
  const skill = pack.skills.find((item) => item.slug === slug);
  if (!skill) notFound();
  const parsed = matter(skill.instructions);
  const history = listRuns({ type: "skill", limit: 30 }).filter(
    (run) => run.skillSlug === skill.slug,
  );
  const stats = getSkillRunStats()[skill.slug];
  const projects = listProjects();
  const sandbox = getSandboxStatus();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/skills">
            <ArrowLeft /> Skills Library
          </Link>
        </Button>
      </div>

      <PageHeader
        eyebrow="Skill instructions"
        title={skill.slug}
        description={skill.description || "No repository description supplied."}
        actions={
          <>
            <Button variant="outline" asChild>
              <a
                href={`${skill.repoUrl.replace(/\.git$/, "").replace(/\/$/, "")}/tree/main/${skill.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                <GitBranch /> Repository
              </a>
            </Button>
            <Button asChild>
              <Link href={`/skills/${skill.slug}/run`}>
                <Play /> Run skill
              </Link>
            </Button>
          </>
        }
      />

      {pack.warning ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {pack.warning}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" /> SKILL.md
              </CardTitle>
              <Badge variant="secondary">original instructions</Badge>
            </CardHeader>
            <CardContent>
              <Markdown className="prose-sm sm:prose-base">{parsed.content}</Markdown>
            </CardContent>
          </Card>

          <SkillFiles
            skillSlug={skill.slug}
            files={skill.files}
            scripts={skill.scripts}
            projects={projects}
            sandbox={sandbox}
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Load details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Source</span>
                <Badge variant={skill.source === "github" ? "success" : "secondary"}>
                  {skill.source}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Files</span>
                <span>{skill.files.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Scripts</span>
                <span className="inline-flex items-center gap-1">
                  {skill.scripts.length}
                  {skill.scripts.length ? <ShieldCheck className="h-3.5 w-3.5 text-warning" /> : null}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Loaded</span>
                <span>{timeAgo(skill.loadedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <GitCommitHorizontal className="h-3.5 w-3.5" /> Commit
                </span>
                <span className="font-mono text-xs">{skill.commit?.slice(0, 10) || "snapshot"}</span>
              </div>
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Dependencies</p>
                {skill.dependencies.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {skill.dependencies.map((dependency) => (
                      <Link
                        key={dependency}
                        href={`/skills/${dependency}`}
                        className="rounded-md border border-border bg-secondary/50 px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-primary"
                      >
                        {dependency}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    None detected from the instructions.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Execution history</CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <p className="mb-4 text-xs text-muted-foreground">
                  {stats.runCount} run{stats.runCount === 1 ? "" : "s"} · last{" "}
                  {timeAgo(stats.lastRunAt)}
                </p>
              ) : (
                <p className="mb-4 text-xs text-muted-foreground">Not run yet.</p>
              )}
              {history.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No executions recorded for this skill.
                </p>
              ) : (
                <div className="space-y-3">
                  {history.slice(0, 8).map((run) => (
                    <Link
                      key={run.id}
                      href={`/runs/${run.id}`}
                      className="block rounded-lg border border-border bg-background/40 p-3 transition-colors hover:bg-secondary/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs text-foreground/90">
                            {run.requirements || run.title}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <CalendarClock className="h-3 w-3" /> {formatDate(run.createdAt)}
                          </p>
                        </div>
                        <StatusBadge status={run.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
