"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Blocks,
  Check,
  ChevronRight,
  CircleDollarSign,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
  Settings,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { PipelinePlan, Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn, formatNumber } from "@/lib/utils";

interface SkillOption {
  slug: string;
  name: string;
  description: string;
  source: string;
  dependencies: string[];
}

export function PipelineForm({
  projects,
  skills,
  aiConfigured,
  aiLabel,
  warning,
  defaultProjectId,
}: {
  projects: Project[];
  skills: SkillOption[];
  aiConfigured: boolean;
  aiLabel: string;
  warning?: string | null;
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const initialProject =
    projects.find((project) => project.id === defaultProjectId) || projects[0];
  const [projectId, setProjectId] = useState(initialProject?.id || "");
  const [requirements, setRequirements] = useState("");
  const [targetUrl, setTargetUrl] = useState(initialProject?.targetUrl || "");
  const [selected, setSelected] = useState<string[]>(skills.map((skill) => skill.slug));
  const [plan, setPlan] = useState<PipelinePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planWarning, setPlanWarning] = useState<string | null>(null);
  const planRequest = useRef(0);

  const selectedProject = projects.find((project) => project.id === projectId);

  useEffect(() => {
    if (selectedProject) setTargetUrl(selectedProject.targetUrl || "");
  }, [selectedProject]);

  const buildPlan = useCallback(async () => {
    if (!projectId) return;
    const requestId = ++planRequest.current;
    setPlanning(true);
    setError(null);
    try {
      const response = await fetch("/api/pipelines/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          requirements,
          selectedSlugs: selected,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (requestId !== planRequest.current) return;
      if (!response.ok) throw new Error(data.error || "Could not build a pipeline plan");
      setPlan(data.plan);
      setPlanWarning(data.warning || null);
    } catch (planError) {
      if (requestId !== planRequest.current) return;
      setPlan(null);
      setPlanWarning(null);
      setError(planError instanceof Error ? planError.message : "Could not build plan");
    } finally {
      if (requestId === planRequest.current) setPlanning(false);
    }
  }, [projectId, requirements, selected]);

  useEffect(() => {
    if (!projectId) return;
    const timer = setTimeout(() => {
      void buildPlan();
    }, 400);
    return () => clearTimeout(timer);
    // Plan is intentionally built when the project or skill selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, selected, requirements]);

  async function start() {
    setError(null);
    if (!projectId) {
      setError("Select a project.");
      return;
    }
    if (requirements.trim().length < 3) {
      setError("Describe what the pipeline should produce.");
      return;
    }
    if (selected.length === 0) {
      setError("Select at least one skill.");
      return;
    }
    if (!aiConfigured) {
      setError("Configure an AI provider before starting the pipeline.");
      return;
    }
    setStarting(true);
    try {
      const response = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          requirements,
          targetUrl,
          selectedSlugs: selected,
          executionMode: "sequential",
          autoStart: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not start pipeline");
      toast.success("Pipeline started");
      router.push(`/runs/${data.run.id}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start pipeline");
      setStarting(false);
    }
  }

  function toggleSkill(slug: string) {
    setSelected((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    );
  }

  const estimated = useMemo(() => plan?.estimatedTokens || 0, [plan]);

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-14 text-center">
          <div className="mb-4 rounded-xl border border-border bg-secondary/60 p-3">
            <Blocks className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold">Create a project first</h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            The pipeline needs project context, requirements, and a place to save each step&apos;s
            output.
          </p>
          <Button asChild className="mt-5">
            <Link href="/projects/new">New project</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {warning ? (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            {warning}
          </div>
        ) : null}
        {!aiConfigured ? (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">AI provider not configured</p>
                <p className="mt-1 text-warning/80">
                  You can still plan and inspect dependencies. Starting the pipeline requires a
                  server-side provider key or demo mode.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/settings">
                    <Settings /> Open settings
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline brief</CardTitle>
            <CardDescription>
              Each step reads the previous steps&apos; saved artifacts. Provider:{" "}
              <span className="font-mono text-foreground/80">{aiLabel}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pipeline-project">Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger id="pipeline-project">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pipeline-url">Target application URL</Label>
                <Input
                  id="pipeline-url"
                  value={targetUrl}
                  onChange={(event) => setTargetUrl(event.target.value)}
                  placeholder="https://example.com"
                  type="url"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pipeline-requirements">User requirements</Label>
              <Textarea
                id="pipeline-requirements"
                value={requirements}
                onChange={(event) => setRequirements(event.target.value)}
                placeholder="What should this pipeline deliver? Scope, must-have flows, stack constraints, launch target, and anything explicitly out of scope."
                rows={7}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Only public pages or your own account. The pipeline will not bypass authentication,
                paywalls, or access controls.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Execution mode</Label>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm">
                <GitBranch className="h-4 w-4 text-primary" />
                Sequential, dependency-aware
                <Badge variant="secondary" className="ml-auto">
                  required
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Skills in this run</CardTitle>
              <CardDescription>
                Uncheck skills to run a subset. Prerequisites are added automatically.
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {selected.length}/{skills.length}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-1">
            {skills.map((skill, index) => {
              const checked = selected.includes(skill.slug);
              return (
                <button
                  key={skill.slug}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleSkill(skill.slug)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:bg-secondary/60",
                    checked && "border-border bg-secondary/30",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border border-border",
                      checked && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {checked ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="w-5 text-[10px] tabular-nums text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="truncate font-mono text-xs">{skill.slug}</span>
                    </span>
                    <span className="mt-0.5 block truncate pl-7 text-[11px] text-muted-foreground">
                      {skill.description.split(".")[0] || skill.name}
                    </span>
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="xl:sticky xl:top-20">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Workflow className="h-4 w-4 text-primary" /> Execution plan
              </CardTitle>
              <CardDescription>Derived from repository instructions</CardDescription>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => void buildPlan()} disabled={planning}>
              <RefreshCw className={planning ? "animate-spin" : ""} />
              <span className="sr-only">Refresh plan</span>
            </Button>
          </CardHeader>
          <CardContent>
            {planning && !plan ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="h-14 animate-pulse rounded-lg bg-secondary" />
                ))}
              </div>
            ) : !plan ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Add requirements and select skills to build a plan.
              </p>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      Steps
                    </p>
                    <p className="mt-1 text-xl font-semibold">{plan.steps.length}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      Est. input
                    </p>
                    <p className="mt-1 text-xl font-semibold">{formatNumber(estimated)}</p>
                    <p className="text-[10px] text-muted-foreground">tokens</p>
                  </div>
                </div>

                {plan.warnings.length ? (
                  <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[11px] text-warning">
                    {plan.warnings.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                ) : null}
                {planWarning ? (
                  <p className="mb-3 text-[11px] text-warning">{planWarning}</p>
                ) : null}

                <div className="space-y-2">
                  {plan.steps.map((step, index) => (
                    <div
                      key={step.skillSlug}
                      className="rounded-lg border border-border bg-background/40 p-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border bg-secondary/60 text-[10px] tabular-nums text-muted-foreground">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[11px]">{step.skillSlug}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {step.dependsOn.length
                              ? `Needs ${step.dependsOn.join(", ")}`
                              : "Starts from project context"}
                          </p>
                        </div>
                        {index < plan.steps.length - 1 ? (
                          <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Sparkles className="ml-auto h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <Separator className="my-4" />
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <span>Selected project</span>
                    <span className="max-w-[180px] truncate text-foreground/80">
                      {selectedProject?.name}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Execution</span>
                    <span className="text-foreground/80">Sequential</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Output handoff</span>
                    <span className="text-foreground/80">Saved per step</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1">
                      <CircleDollarSign className="h-3 w-3" /> Usage
                    </span>
                    <span className="max-w-[190px] text-right text-foreground/80">
                      ~{formatNumber(estimated)} input tokens + provider pricing
                    </span>
                  </div>
                </div>

                <Button
                  className="mt-5 w-full"
                  size="lg"
                  onClick={() => void start()}
                  disabled={
                    starting ||
                    !aiConfigured ||
                    requirements.trim().length < 3 ||
                    selected.length === 0
                  }
                >
                  {starting ? <Loader2 className="animate-spin" /> : <Play />}
                  {starting ? "Starting pipeline…" : "Start full pipeline"}
                  {!starting ? <ArrowRight /> : null}
                </Button>
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Pause, resume, cancel, retry, and skip controls are available on the run page.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
