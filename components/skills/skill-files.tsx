"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileCode2,
  FileText,
  Loader2,
  Play,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { Project, SkillFile } from "@/lib/types";
import type { SandboxStatus } from "@/lib/sandbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn, formatNumber } from "@/lib/utils";

export function SkillFiles({
  skillSlug,
  files,
  scripts,
  projects,
  sandbox,
}: {
  skillSlug: string;
  files: SkillFile[];
  scripts: string[];
  projects: Project[];
  sandbox: SandboxStatus;
}) {
  const [preview, setPreview] = useState<SkillFile | null>(null);
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [busyScript, setBusyScript] = useState<string | null>(null);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [args, setArgs] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!projectId) {
      setApproved({});
      return;
    }
    let cancelled = false;
    fetch(
      `/api/sandbox/approve?projectId=${encodeURIComponent(projectId)}&skillSlug=${encodeURIComponent(skillSlug)}`,
    )
      .then((response) => (response.ok ? response.json() : { approved: [] }))
      .then((data) => {
        if (cancelled) return;
        setApproved(
          Object.fromEntries(
            ((data.approved || []) as string[]).map((scriptPath) => [scriptPath, true]),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setApproved({});
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, skillSlug]);

  const sorted = useMemo(
    () =>
      [...files].sort((a, b) => {
        const aScript = scripts.includes(a.path) ? 1 : 0;
        const bScript = scripts.includes(b.path) ? 1 : 0;
        return bScript - aScript || a.path.localeCompare(b.path);
      }),
    [files, scripts],
  );

  async function approve(scriptPath: string) {
    if (!projectId) {
      toast.error("Select a project first");
      return;
    }
    setBusyScript(scriptPath);
    try {
      const response = await fetch("/api/sandbox/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, skillSlug, scriptPath }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not approve script");
      setApproved((current) => ({ ...current, [scriptPath]: true }));
      toast.success("Script approved for sandbox execution");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve script");
    } finally {
      setBusyScript(null);
    }
  }

  async function execute(scriptPath: string) {
    if (!projectId) {
      toast.error("Select a project first");
      return;
    }
    if (!sandbox.available) {
      toast.error("Sandbox unavailable", { description: sandbox.reason });
      return;
    }
    setBusyScript(scriptPath);
    try {
      const argList = (args[scriptPath] || "")
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const response = await fetch("/api/sandbox/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, skillSlug, scriptPath, args: argList }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Sandbox execution failed");
      const result = data.result;
      setResults((current) => ({
        ...current,
        [scriptPath]: [
          result.stdout,
          result.stderr ? `STDERR:\n${result.stderr}` : "",
          result.timedOut ? "[timed out]" : `Exit code: ${result.exitCode}`,
        ]
          .filter(Boolean)
          .join("\n"),
      }));
      toast[result.exitCode === 0 ? "success" : "error"](
        result.exitCode === 0 ? "Sandbox run completed" : "Sandbox run failed",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sandbox execution failed");
    } finally {
      setBusyScript(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Repository files</CardTitle>
          <CardDescription>
            {files.length} files preserved from the skill folder. Instructions and support files
            are on the server; scripts never run automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {sorted.map((file) => {
            const isScript = scripts.includes(file.path);
            return (
              <button
                key={file.path}
                onClick={() => setPreview(file)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary"
              >
                {isScript ? (
                  <FileCode2 className="h-4 w-4 shrink-0 text-warning" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.path}</span>
                {isScript ? (
                  <Badge variant="warning">
                    <ShieldAlert className="h-3 w-3" /> script
                  </Badge>
                ) : null}
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatNumber(file.size)} B
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {scripts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Script execution</CardTitle>
            <CardDescription>
              Requires explicit approval. Runs in Docker with no network, a read-only root, CPU and
              memory limits, and a hard timeout.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={sandbox.available ? "success" : "warning"}>
                {sandbox.available ? "Sandbox ready" : "Sandbox unavailable"}
              </Badge>
              <span className="text-xs text-muted-foreground">{sandbox.reason}</span>
            </div>
            <div className="space-y-2">
              <Label>Project for approval and execution</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="max-w-sm">
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
              {projects.length === 0 ? (
                <p className="text-xs text-warning">Create a project before approving scripts.</p>
              ) : null}
            </div>

            {scripts.map((scriptPath) => (
              <div key={scriptPath} className="rounded-lg border border-border bg-background/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Terminal className="h-4 w-4 text-warning" />
                  <code className="min-w-0 flex-1 truncate text-xs">{scriptPath}</code>
                  {approved[scriptPath] ? (
                    <Badge variant="success">
                      <CheckCircle2 className="h-3 w-3" /> approved
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={args[scriptPath] || ""}
                    onChange={(event) =>
                      setArgs((current) => ({ ...current, [scriptPath]: event.target.value }))
                    }
                    placeholder="Arguments (optional)"
                    aria-label={`Arguments for ${scriptPath}`}
                  />
                  <Button
                    variant="outline"
                    onClick={() => void approve(scriptPath)}
                    disabled={busyScript === scriptPath || !projectId}
                  >
                    {busyScript === scriptPath ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <ShieldCheck />
                    )}
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void execute(scriptPath)}
                    disabled={
                      busyScript === scriptPath || !projectId || !approved[scriptPath] || !sandbox.available
                    }
                  >
                    {busyScript === scriptPath ? <Loader2 className="animate-spin" /> : <Play />}
                    Run
                  </Button>
                </div>
                {results[scriptPath] ? (
                  <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-border bg-background p-3 text-[11px] leading-relaxed text-foreground/80">
                    {results[scriptPath]}
                  </pre>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{preview?.path}</DialogTitle>
            <DialogDescription>
              Read-only repository content. {preview ? formatNumber(preview.size) : 0} bytes.
            </DialogDescription>
          </DialogHeader>
          <pre
            className={cn(
              "max-h-[65vh] overflow-auto rounded-lg border border-border bg-background p-4 text-[11px] leading-relaxed text-foreground/85",
            )}
          >
            {preview?.content}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
