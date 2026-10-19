"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileText,
  Loader2,
  Play,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import type { Project, Skill } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FileSummary {
  path: string;
  content?: string;
}

export function SkillRunForm({
  skill,
  projects,
  ai,
  defaultProjectId,
}: {
  skill: Skill;
  projects: Project[];
  defaultProjectId?: string;
  ai: {
    configured: boolean;
    demo: boolean;
    provider: string;
    model: string;
    setupMessage: string;
  };
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(
    defaultProjectId || projects[0]?.id || "",
  );
  const [task, setTask] = useState("");
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [fileQuery, setFileQuery] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    setLoadingFiles(true);
    fetch(`/api/projects/${projectId}/files?content=true`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setFiles(data.files || []);
        setSelectedFiles([]);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const filteredFiles = useMemo(() => {
    const q = fileQuery.toLowerCase().trim();
    if (!q) return files;
    return files.filter((file) => file.path.toLowerCase().includes(q));
  }, [files, fileQuery]);

  const canRun = ai.configured && projects.length > 0 && task.trim().length >= 3;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!projectId) {
      setError("Select a project first.");
      return;
    }
    if (task.trim().length < 3) {
      setError("Describe the task you want this skill to perform.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/skills/${skill.slug}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          task,
          attachedPaths: selectedFiles,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not start skill run");
      toast.success(`${skill.slug} queued`);
      router.push(`/runs/${data.run.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not start run");
      setSubmitting(false);
    }
  }

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-14 text-center">
          <div className="mb-4 rounded-xl border border-border bg-secondary/60 p-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold">Create a project first</h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Skill runs need a project for context, attached files, and saved outputs.
          </p>
          <Button asChild className="mt-5">
            <Link href="/projects/new">New project</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!ai.configured ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">AI provider not configured</p>
              <p className="mt-1 text-warning/80">{ai.setupMessage}</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/settings">
                  <Settings /> Open settings
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : ai.demo ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-foreground">Demo preview mode</p>
              <p className="mt-1">
                No model call will be made. The run is labelled as a demo and writes only a demo
                artifact. Add a provider key and disable demo mode for real execution.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Execution brief</CardTitle>
              <CardDescription>
                The full SKILL.md instructions, this brief, and the attached files are sent to{" "}
                <span className="font-mono text-foreground/80">
                  {ai.provider}/{ai.model}
                </span>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="project">Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger id="project">
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
                <Label htmlFor="task">Task / prompt</Label>
                <Textarea
                  id="task"
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                  placeholder={`What should ${skill.slug} do for this project? Include scope, constraints, and the artifact you expect.`}
                  rows={9}
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Be specific. The skill follows its repository instructions, not a generic prompt.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Attach project files</CardTitle>
                <CardDescription>
                  Optional. If none are selected, relevant files are chosen automatically.
                </CardDescription>
              </div>
              <Badge variant="secondary">{selectedFiles.length} selected</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={fileQuery}
                  onChange={(event) => setFileQuery(event.target.value)}
                  placeholder="Filter files…"
                  className="pl-9"
                  aria-label="Filter project files"
                />
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-background/40 p-2">
                {loadingFiles ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">Loading files…</p>
                ) : files.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    This project has no saved files yet.
                  </p>
                ) : filteredFiles.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    No matching files.
                  </p>
                ) : (
                  filteredFiles.map((file) => {
                    const checked = selectedFiles.includes(file.path);
                    return (
                      <button
                        key={file.path}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() =>
                          setSelectedFiles((current) =>
                            checked
                              ? current.filter((item) => item !== file.path)
                              : [...current, file.path],
                          )
                        }
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-secondary",
                          checked && "bg-secondary/70",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-4 w-4 shrink-0 place-items-center rounded border border-border",
                            checked && "border-primary bg-primary text-primary-foreground",
                          )}
                        >
                          {checked ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="truncate font-mono">{file.path}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Skill profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Skill</span>
                <span className="font-mono text-xs">{skill.slug}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Source</span>
                <Badge variant={skill.source === "github" ? "success" : "secondary"}>
                  {skill.source}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Files</span>
                <span>{skill.files.length}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Scripts</span>
                <span>{skill.scripts.length}</span>
              </div>
              {skill.dependencies.length ? (
                <div className="border-t border-border pt-3">
                  <p className="mb-1.5 text-xs text-muted-foreground">Prerequisites</p>
                  <p className="font-mono text-[11px] text-foreground/75">
                    {skill.dependencies.join(", ")}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outputs</CardTitle>
              <CardDescription>
                The response is saved with the run. File blocks are written into the project.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>· AI response and full execution log</p>
              <p>· Generated or updated project files</p>
              <p>· Errors with retry and rerun controls</p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button type="submit" className="w-full" size="lg" disabled={!canRun || submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <Play />}
              {submitting
                ? "Starting…"
                : ai.demo
                  ? "Run demo preview"
                  : !ai.configured
                    ? "Configure AI to run"
                    : "Run skill"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" asChild>
              <Link href={`/skills/${skill.slug}`}>
                <ArrowLeft /> View instructions
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
