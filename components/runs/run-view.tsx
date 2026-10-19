"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  FileCode2,
  FolderOpen,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Square,
  Terminal,
  TriangleAlert,
  Wand2,
  Workflow,
} from "lucide-react";
import type {
  ExecutionLog,
  Project,
  ProjectFile,
  WorkflowRun,
  WorkflowStep,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { Markdown } from "@/components/markdown";
import { EmptyState } from "@/components/empty-state";
import { CopyButton } from "@/components/copy-button";
import { toast } from "sonner";
import { cn, formatDate, formatNumber, timeAgo } from "@/lib/utils";

interface RunData {
  run: WorkflowRun;
  steps: WorkflowStep[];
  logs: ExecutionLog[];
  project: Project | null;
}

export function RunView({ initial }: { initial: RunData }) {
  const [data, setData] = useState<RunData>(initial);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const { run, steps, logs, project } = data;

  const loadFiles = useCallback(async () => {
    if (!project) return;
    setLoadingFiles(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/files?content=true`);
      if (!response.ok) throw new Error("Could not load files");
      const payload = await response.json();
      setFiles(payload.files || []);
    } catch {
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }, [project]);

  useEffect(() => {
    const source = new EventSource(`/api/runs/${run.id}/stream`);
    const onSnapshot = (event: MessageEvent) => {
      try {
        setData(JSON.parse(event.data) as RunData);
        setStreamError(false);
      } catch {
        // Ignore malformed snapshots.
      }
    };
    const onDone = () => source.close();
    const onError = () => {
      setStreamError(true);
      source.close();
    };
    source.addEventListener("snapshot", onSnapshot as EventListener);
    source.addEventListener("done", onDone);
    source.addEventListener("error", onError);
    return () => {
      source.removeEventListener("snapshot", onSnapshot as EventListener);
      source.removeEventListener("done", onDone);
      source.removeEventListener("error", onError);
      source.close();
    };
  }, [run.id]);

  useEffect(() => {
    if (project && ["completed", "failed", "cancelled"].includes(run.status)) {
      void loadFiles();
    }
  }, [project, run.status, loadFiles]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs.length]);

  const completedSteps = steps.filter((step) => ["completed", "skipped"].includes(step.status)).length;
  const progress = steps.length ? (completedSteps / steps.length) * 100 : run.status === "completed" ? 100 : 0;
  const isPipeline = run.type === "pipeline";
  const isActive = ["running", "queued", "paused"].includes(run.status);
  const selectedFile = files.find((file) => file.path === selectedPath) || null;
  const errors = useMemo(
    () => [
      ...(run.error ? [{ key: "run", title: "Run error", message: run.error, step: null }] : []),
      ...steps
        .filter((step) => step.error)
        .map((step) => ({
          key: step.id,
          title: step.skillSlug,
          message: step.error!,
          step,
        })),
    ],
    [run.error, steps],
  );

  async function control(action: string, stepId?: string) {
    setBusyAction(`${action}-${stepId || "run"}`);
    try {
      const response = await fetch(`/api/runs/${run.id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, stepId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Control action failed");
      toast.success(
        action === "pause"
          ? "Pause requested"
          : action === "cancel"
            ? "Cancellation requested"
            : action === "retry"
              ? "Retrying step"
              : action === "continue"
                ? "Continuing pipeline"
                : action === "resume"
                  ? "Resuming pipeline"
                  : "Pipeline starting",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Control action failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function rerun() {
    setBusyAction("rerun");
    try {
      const response = await fetch(`/api/runs/${run.id}/rerun`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not rerun");
      window.location.href = `/runs/${payload.run.id}`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rerun");
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/runs">
            <ArrowLeft /> Workflow runs
          </Link>
        </Button>
        {project ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/projects/${project.id}`}>
              <FolderOpen /> {project.name}
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={run.status} />
            <Badge variant="secondary">
              {isPipeline ? <Workflow className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />}
              {run.type}
            </Badge>
            {run.demo ? <Badge variant="warning">Demo preview — no AI call</Badge> : null}
            {run.skillSlug ? (
              <Link
                href={`/skills/${run.skillSlug}`}
                className="font-mono text-[11px] text-muted-foreground hover:text-primary"
              >
                {run.skillSlug}
              </Link>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{run.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" /> {formatDate(run.createdAt)}
            </span>
            <span>Started {timeAgo(run.startedAt)}</span>
            <span>~{formatNumber(run.estimatedTokens)} est. tokens</span>
            <span className="font-mono">{run.id.slice(0, 8)}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isPipeline && run.status === "queued" ? (
            <Button size="sm" onClick={() => void control("start")} disabled={Boolean(busyAction)}>
              {busyAction === "start-run" ? <Loader2 className="animate-spin" /> : <Play />}
              Start
            </Button>
          ) : null}
          {isPipeline && run.status === "running" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void control("pause")}
              disabled={Boolean(busyAction) || run.pauseRequested}
            >
              {busyAction === "pause-run" ? <Loader2 className="animate-spin" /> : <Pause />}
              {run.pauseRequested ? "Pausing…" : "Pause"}
            </Button>
          ) : null}
          {isPipeline && run.status === "paused" ? (
            <Button size="sm" onClick={() => void control("resume")} disabled={Boolean(busyAction)}>
              {busyAction === "resume-run" ? <Loader2 className="animate-spin" /> : <Play />}
              Resume
            </Button>
          ) : null}
          {isActive ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void control("cancel")}
              disabled={Boolean(busyAction)}
            >
              {busyAction === "cancel-run" ? <Loader2 className="animate-spin" /> : <Square />}
              Cancel
            </Button>
          ) : null}
          {run.type === "skill" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void rerun()}
              disabled={isActive || Boolean(busyAction)}
            >
              {busyAction === "rerun" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Rerun
            </Button>
          ) : null}
          {project ? (
            <Button asChild variant="secondary" size="sm">
              <a href={`/api/projects/${project.id}/export`}>
                <Download /> Export ZIP
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {streamError ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-warning">
          Live stream disconnected. Reload the page to reconnect. The run continues on the server.
        </div>
      ) : null}

      {isPipeline ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {completedSteps}/{steps.length} steps complete
              {steps.some((step) => step.status === "skipped") ? " (with skips)" : ""}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>
      ) : null}

      <div className={cn("grid gap-5", isPipeline ? "xl:grid-cols-[minmax(0,1fr)_minmax(330px,420px)]" : "")}>
        <div className="min-w-0 space-y-5">
          <Tabs defaultValue="response">
            <div className="overflow-x-auto pb-1">
              <TabsList>
                <TabsTrigger value="response">
                  <Wand2 className="h-3.5 w-3.5" /> AI response
                </TabsTrigger>
                <TabsTrigger value="files">
                  <FileCode2 className="h-3.5 w-3.5" /> Generated files
                  {files.length ? <span className="text-[10px] text-muted-foreground">{files.length}</span> : null}
                </TabsTrigger>
                <TabsTrigger value="logs">
                  <Terminal className="h-3.5 w-3.5" /> Logs
                  <span className="text-[10px] text-muted-foreground">{logs.length}</span>
                </TabsTrigger>
                <TabsTrigger value="errors">
                  <AlertCircle className="h-3.5 w-3.5" /> Errors
                  {errors.length ? (
                    <span className="rounded-full bg-destructive/20 px-1.5 text-[10px] text-destructive">
                      {errors.length}
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="response">
              <Card>
                <CardContent className="p-5">
                  {run.output ? (
                    <div>
                      <div className="mb-3 flex items-center justify-end">
                        <CopyButton value={run.output} label="Copy response" />
                      </div>
                      <Markdown className="prose-sm sm:prose-base">{run.output}</Markdown>
                    </div>
                  ) : isActive ? (
                    <div className="flex flex-col items-center py-16 text-center">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p className="mt-4 text-sm font-medium">
                        {run.status === "paused" ? "Pipeline paused" : "Waiting for model output"}
                      </p>
                      <p className="mt-1 max-w-md text-xs text-muted-foreground">
                        {run.status === "paused"
                          ? "Resume when ready. Completed step outputs are preserved."
                          : "The skill is reading its instructions and project context. Logs update live below."}
                      </p>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Wand2}
                      title={run.status === "cancelled" ? "Run cancelled" : "No response saved"}
                      description={
                        run.error ||
                        "This run did not produce an AI response. Check the errors tab and logs."
                      }
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="files">
              <Card>
                <CardContent className="p-0">
                  {!project ? (
                    <EmptyState icon={FolderOpen} title="No project attached to this run" />
                  ) : loadingFiles ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">Loading files…</p>
                  ) : files.length === 0 ? (
                    <EmptyState
                      icon={FileCode2}
                      title="No project files yet"
                      description="Files created by successful skill runs appear here."
                    />
                  ) : (
                    <div className="grid min-h-[420px] md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.4fr)]">
                      <div className="max-h-[560px] overflow-y-auto border-b border-border p-2 md:border-b-0 md:border-r">
                        {files.map((file) => (
                          <button
                            key={file.id}
                            onClick={() => setSelectedPath(file.path)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-secondary",
                              selectedPath === file.path && "bg-secondary text-foreground",
                            )}
                          >
                            <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate font-mono">{file.path}</span>
                          </button>
                        ))}
                      </div>
                      <div className="min-w-0 p-4">
                        {selectedFile ? (
                          <>
                            <div className="mb-3 flex items-center justify-between gap-2">
                              <code className="truncate text-xs text-foreground/85">
                                {selectedFile.path}
                              </code>
                              <div className="flex items-center gap-1">
                                <CopyButton value={selectedFile.content} />
                              </div>
                            </div>
                            <pre className="max-h-[480px] overflow-auto rounded-lg border border-border bg-background p-3 text-[11px] leading-relaxed text-foreground/85">
                              {selectedFile.content}
                            </pre>
                          </>
                        ) : (
                          <div className="flex h-full min-h-[300px] items-center justify-center">
                            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Copy className="h-3.5 w-3.5" /> Select a file to inspect it
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="logs">
              <Card>
                <CardContent className="p-0">
                  <div
                    ref={logRef}
                    className="log-scroll max-h-[520px] overflow-y-auto bg-background/60 p-4 font-mono text-[11px] leading-relaxed"
                  >
                    {logs.length === 0 ? (
                      <p className="text-muted-foreground">No logs yet.</p>
                    ) : (
                      logs.map((log) => (
                        <div key={log.id} className="flex gap-2 py-0.5">
                          <span className="shrink-0 text-muted-foreground/60">
                            {new Date(log.createdAt).toLocaleTimeString([], {
                              hour12: false,
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 uppercase",
                              log.level === "error" && "text-destructive",
                              log.level === "warn" && "text-warning",
                              log.level === "success" && "text-success",
                              log.level === "debug" && "text-muted-foreground/60",
                              log.level === "info" && "text-primary/80",
                            )}
                          >
                            {log.level.padEnd(7)}
                          </span>
                          <span className="whitespace-pre-wrap break-words text-foreground/85">
                            {log.message}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="errors">
              <Card>
                <CardContent className="p-5">
                  {errors.length === 0 ? (
                    <div className="flex flex-col items-center py-12 text-center">
                      <CheckCircle2 className="h-7 w-7 text-success" />
                      <p className="mt-3 text-sm font-medium">No errors recorded</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Failed steps and run-level errors appear here with recovery controls.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {errors.map((item) => (
                        <div
                          key={item.key}
                          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
                        >
                          <div className="flex items-start gap-3">
                            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-destructive">{item.title}</p>
                              <p className="mt-1 whitespace-pre-wrap break-words text-xs text-destructive/85">
                                {item.message}
                              </p>
                              {item.step ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void control("retry", item.step!.id)}
                                    disabled={Boolean(busyAction)}
                                  >
                                    <RotateCcw /> Retry step
                                  </Button>
                                  {item.step.status === "failed" ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => void control("continue", item.step!.id)}
                                      disabled={Boolean(busyAction)}
                                    >
                                      <SkipForward /> Skip & continue
                                    </Button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {isPipeline ? (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pipeline steps</CardTitle>
                <CardDescription>Dependency-aware order from the repository</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className="rounded-lg border border-border bg-background/40 p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border bg-secondary/60 text-[10px] tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/skills/${step.skillSlug}`}
                            className="truncate font-mono text-xs hover:text-primary"
                          >
                            {step.skillSlug}
                          </Link>
                          <StatusBadge status={step.status} />
                        </div>
                        {step.dependsOn.length ? (
                          <p className="mt-1 truncate text-[10px] text-muted-foreground">
                            after {step.dependsOn.join(", ")}
                          </p>
                        ) : null}
                        {step.status === "running" ? (
                          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-primary">
                            <Loader2 className="h-3 w-3 animate-spin" /> Executing…
                          </div>
                        ) : null}
                        {step.error ? (
                          <p className="mt-1.5 line-clamp-2 text-[10px] text-destructive">
                            {step.error}
                          </p>
                        ) : null}
                        {step.completedAt ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            finished {timeAgo(step.completedAt)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {step.status === "failed" ? (
                      <div className="mt-2 flex gap-1.5 pl-7">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px]"
                          onClick={() => void control("retry", step.id)}
                          disabled={Boolean(busyAction)}
                        >
                          <RotateCcw className="h-3 w-3" /> Retry
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px]"
                          onClick={() => void control("continue", step.id)}
                          disabled={Boolean(busyAction)}
                        >
                          <SkipForward className="h-3 w-3" /> Continue
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Run details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Execution mode</span>
                  <span>{run.executionMode}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Target URL</span>
                  <span className="max-w-[200px] truncate">{run.targetUrl || "—"}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Started</span>
                  <span>{timeAgo(run.startedAt)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Completed</span>
                  <span>{timeAgo(run.completedAt)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Est. tokens</span>
                  <span>{formatNumber(run.estimatedTokens)}</span>
                </div>
              </CardContent>
            </Card>

            {run.requirements ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Requirements</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {run.requirements}
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
