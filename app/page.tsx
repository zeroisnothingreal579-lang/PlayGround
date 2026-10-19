import Link from "next/link";
import {
  ArrowRight,
  Blocks,
  CheckCircle2,
  Clock3,
  FileCode2,
  FolderKanban,
  GitBranch,
  Play,
  Plus,
  Sparkles,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import {
  getSettings,
  getSkillRunStats,
  getWorkspaceStats,
  listActivities,
  listProjects,
  listRuns,
  listSteps,
} from "@/lib/db/repo";
import { getRepositoryOrder, loadSkillPack } from "@/lib/skills/loader";
import { formatNumber, timeAgo } from "@/lib/utils";
import type { SkillSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [projects, runs, activities, stats] = await Promise.all([
    Promise.resolve(listProjects(4)),
    Promise.resolve(listRuns({ limit: 8 })),
    Promise.resolve(listActivities(6)),
    Promise.resolve(getWorkspaceStats()),
  ]);

  const settings = getSettings();
  let skills: SkillSummary[] = [];
  let skillWarning: string | null = null;
  try {
    const pack = await loadSkillPack({ repoUrl: settings.repoUrl });
    const skillStats = getSkillRunStats();
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
      commit: skill.commit,
      dependencies: skill.dependencies,
      fileCount: skill.files.length,
      scriptCount: skill.scripts.length,
      lastRunAt: skillStats[skill.slug]?.lastRunAt ?? null,
      lastRunStatus: skillStats[skill.slug]?.lastRunStatus ?? null,
        runCount: skillStats[skill.slug]?.runCount ?? 0,
      }));
    skillWarning = pack.warning || null;
  } catch (error) {
    skillWarning = error instanceof Error ? error.message : "Skills could not be loaded";
  }

  const activeRuns = runs.filter((run) =>
    ["running", "queued", "paused"].includes(run.status),
  );
  const recentRuns = runs.filter((run) => !["running", "queued", "paused"].includes(run.status));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Replica Studio"
        title="Welcome back"
        description="Turn a reference app into a working replica: research it, plan it, build it, test it, and prepare it to ship."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/pipeline">
                <Workflow />
                Run full pipeline
              </Link>
            </Button>
            <Button asChild>
              <Link href="/projects/new">
                <Plus />
                New project
              </Link>
            </Button>
          </>
        }
      />

      {skillWarning ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{skillWarning}</p>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace stats">
        {[
          {
            label: "Projects",
            value: stats.projects,
            icon: FolderKanban,
            detail: "in your workspace",
          },
          {
            label: "Workflow runs",
            value: stats.runs,
            icon: Sparkles,
            detail: `${stats.completed} completed`,
          },
          {
            label: "Generated files",
            value: stats.files,
            icon: FileCode2,
            detail: "saved to projects",
          },
          {
            label: "Skills available",
            value: skills.length,
            icon: Blocks,
            detail: skills.length === 11 ? "all 11 loaded" : "from repository",
          },
        ].map((metric) => (
          <Card key={metric.label} className="overflow-hidden">
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {metric.label}
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">
                  {formatNumber(metric.value)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/50 p-2">
                <metric.icon className="h-4 w-4 text-primary" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {activeRuns.length > 0 ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Active workflows</CardTitle>
                  <CardDescription>Live progress from the queue</CardDescription>
                </div>
                <Badge variant="default">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  {activeRuns.length} active
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeRuns.map((run) => {
                  const steps = listSteps(run.id);
                  const completed = steps.filter((step) => step.status === "completed").length;
                  const progress = steps.length ? (completed / steps.length) * 100 : 0;
                  return (
                    <Link
                      key={run.id}
                      href={`/runs/${run.id}`}
                      className="block rounded-lg border border-border bg-background/40 p-4 transition-colors hover:border-border/80 hover:bg-secondary/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{run.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {steps.length
                              ? `${completed}/${steps.length} steps completed`
                              : "Starting execution"}
                          </p>
                        </div>
                        <StatusBadge status={run.status} />
                      </div>
                      <Progress value={progress} className="mt-3 h-1.5" />
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Recent projects</CardTitle>
                <CardDescription>Continue where you left off</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/projects">
                  View all <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title="No projects yet"
                  description="Create a project to give the skills a target, context, and a place to save artifacts."
                  action={
                    <Button asChild>
                      <Link href="/projects/new">
                        <Plus />
                        Create your first project
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <div className="divide-y divide-border">
                  {projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="flex items-center gap-3 py-3.5 transition-colors first:pt-0 last:pb-0 hover:text-primary"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-secondary/60 text-sm font-semibold text-muted-foreground">
                        {project.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{project.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {project.targetUrl || project.description || "No target URL yet"}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                        {timeAgo(project.updatedAt)}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Recent activity</CardTitle>
                <CardDescription>Runs, projects, and saved outputs</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Activity will appear here as you run skills.
                </p>
              ) : (
                <ul className="space-y-4">
                  {activities.map((item) => (
                    <li key={item.id} className="flex items-start gap-3">
                      <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-secondary/60">
                        {item.type.includes("completed") ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        ) : item.type.includes("failed") ? (
                          <TriangleAlert className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground/90">{item.message}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {timeAgo(item.createdAt)}
                        </p>
                      </div>
                      {item.runId ? (
                        <Link
                          href={`/runs/${item.runId}`}
                          className="text-xs text-muted-foreground hover:text-primary"
                        >
                          View
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="border-primary/20 bg-[radial-gradient(circle_at_top_right,rgba(190,242,100,0.08),transparent_60%)]">
            <CardHeader>
              <div className="mb-1 grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Plus className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Create a new project</CardTitle>
              <CardDescription>
                Add the target app, requirements, stack, and design preferences. Every skill reads
                from this brief.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/projects/new">
                  Start a project <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Available skills</CardTitle>
                <CardDescription>Loaded from the repository</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/skills">All</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {skills.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No skills loaded. Open Settings to sync the repository.
                </p>
              ) : (
                skills.slice(0, 6).map((skill, index) => (
                  <Link
                    key={skill.slug}
                    href={`/skills/${skill.slug}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary"
                  >
                    <span className="w-5 text-center text-[10px] tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs text-foreground/90">
                        {skill.slug}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {skill.description.split(".")[0]}
                      </span>
                    </span>
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                ))
              )}
              <div className="pt-2">
                <Button asChild variant="outline" className="w-full">
                  <Link href="/pipeline">
                    <Play />
                    Plan the full pipeline
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workflow progress</CardTitle>
              <CardDescription>
                {stats.completed} completed · {stats.failed} failed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-semibold">
                  {stats.runs ? Math.round((stats.completed / stats.runs) * 100) : 0}%
                </span>
                <span className="text-xs text-muted-foreground">success rate</span>
              </div>
              <Progress
                value={stats.runs ? (stats.completed / stats.runs) * 100 : 0}
                className="mt-3"
              />
              <div className="mt-4 space-y-2">
                {recentRuns.slice(0, 3).map((run) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="flex items-center justify-between gap-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <span className="truncate">{run.title}</span>
                    <StatusBadge status={run.status} />
                  </Link>
                ))}
                {recentRuns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No completed runs yet.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
