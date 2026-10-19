"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  FileArchive,
  FileCode2,
  FilePlus2,
  FileText,
  FlaskConical,
  FolderOpen,
  Loader2,
  Pencil,
  Play,
  Plus,
  Save,
  Send,
  Sparkles,
  Terminal,
  Trash2,
  Workflow,
} from "lucide-react";
import type { ExecutionLog, Project, ProjectFile, WorkflowRun } from "@/lib/types";
import type { SandboxStatus } from "@/lib/sandbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Markdown } from "@/components/markdown";
import { CopyButton } from "@/components/copy-button";
import { ApkAnalysisPanel } from "@/components/workspace/apk-analysis-panel";
import { toast } from "sonner";
import { cn, formatDate, timeAgo } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  files?: string[];
  demo?: boolean;
}

interface LogWithRun extends ExecutionLog {
  runTitle: string;
  runType: string;
}

export function ProjectWorkspace({
  project,
  initialFiles,
  runs,
  initialLogs,
  sandbox,
  ai,
}: {
  project: Project;
  initialFiles: ProjectFile[];
  runs: WorkflowRun[];
  initialLogs: LogWithRun[];
  sandbox: SandboxStatus;
  ai: { configured: boolean; label: string };
}) {
  const router = useRouter();
  const [files, setFiles] = useState<ProjectFile[]>(initialFiles);
  const [selectedPath, setSelectedPath] = useState<string | null>(
    initialFiles.find((file) => file.path.endsWith("recon.md"))?.path ||
      initialFiles[0]?.path ||
      null,
  );
  const [editorValue, setEditorValue] = useState(
    initialFiles.find((file) => file.path.endsWith("recon.md"))?.content ||
      initialFiles[0]?.content ||
      "",
  );
  const [saving, setSaving] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "I can inspect this project, draft plans, and create or update project files. Ask for a change and I will use the controlled project file tools.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [logFilter, setLogFilter] = useState("all");
  const [planPath, setPlanPath] = useState<string | null>(null);
  const [testPath, setTestPath] = useState<string | null>(null);

  const selectedFile = files.find((file) => file.path === selectedPath) || null;
  const dirty = selectedFile ? selectedFile.content !== editorValue : false;
  const activeRuns = runs.filter((run) => ["running", "queued", "paused"].includes(run.status));
  const planFiles = useMemo(
    () =>
      files.filter(
        (file) =>
          file.path.startsWith("replica/") &&
          /\.(md|markdown|json|csv)$/i.test(file.path) &&
          !file.path.startsWith("replica/outputs/"),
      ),
    [files],
  );
  const testFiles = useMemo(
    () =>
      files.filter(
        (file) =>
          /(^|\/)(tests?|e2e)\//.test(file.path) ||
          /test-plan|bugs|bug-report|parity/i.test(file.path),
      ),
    [files],
  );
  const selectedPlan = planFiles.find((file) => file.path === planPath) || planFiles[0] || null;
  const selectedTest = testFiles.find((file) => file.path === testPath) || testFiles[0] || null;

  const filteredLogs = useMemo(
    () => (logFilter === "all" ? initialLogs : initialLogs.filter((log) => log.level === logFilter)),
    [initialLogs, logFilter],
  );

  const refreshFiles = useCallback(async (selectPath?: string) => {
    const response = await fetch(`/api/projects/${project.id}/files?content=true`);
    if (!response.ok) return;
    const data = await response.json();
    const nextFiles: ProjectFile[] = data.files || [];
    setFiles(nextFiles);
    if (selectPath) {
      const found = nextFiles.find((file) => file.path === selectPath);
      if (found) {
        setSelectedPath(found.path);
        setEditorValue(found.content);
      }
    }
  }, [project.id]);

  useEffect(() => {
    if (planFiles.length && !planPath) setPlanPath(planFiles[0].path);
  }, [planFiles, planPath]);

  useEffect(() => {
    if (testFiles.length && !testPath) setTestPath(testFiles[0].path);
  }, [testFiles, testPath]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatBusy]);

  function selectFile(file: ProjectFile) {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setSelectedPath(file.path);
    setEditorValue(file.content);
  }

  async function saveFile() {
    if (!selectedPath) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedPath, content: editorValue }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save file");
      await refreshFiles(selectedPath);
      toast.success("File saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save file");
    } finally {
      setSaving(false);
    }
  }

  async function createFile() {
    if (!newPath.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newPath, content: "" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not create file");
      await refreshFiles(data.file.path);
      setNewFileOpen(false);
      setNewPath("");
      toast.success("File created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create file");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFile() {
    if (!selectedPath) return;
    try {
      const response = await fetch(
        `/api/projects/${project.id}/files?path=${encodeURIComponent(selectedPath)}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not delete file");
      const remaining = files.filter((file) => file.path !== selectedPath);
      setFiles(remaining);
      setSelectedPath(remaining[0]?.path || null);
      setEditorValue(remaining[0]?.content || "");
      setDeleteOpen(false);
      toast.success("File deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete file");
    }
  }

  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    if (!chatInput.trim() || chatBusy) return;
    if (!ai.configured) {
      toast.error("Configure an AI provider in Settings first");
      return;
    }
    const message = chatInput.trim();
    setChatInput("");
    const history = messages
      .filter((_, index) => index > 0)
      .slice(-10)
      .map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: "user", content: message }]);
    setChatBusy(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Assistant request failed");
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.response,
          files: data.files,
          demo: data.demo,
        },
      ]);
      if (data.files?.length) {
        await refreshFiles(data.files[0]);
        toast.success(`Assistant saved ${data.files.length} file(s)`);
        router.refresh();
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Assistant request failed";
      setMessages((current) => [
        ...current,
        { role: "assistant", content: `**Error:** ${text}` },
      ]);
      toast.error(text);
    } finally {
      setChatBusy(false);
    }
  }

  const openBugs = useMemo(() => {
    const bugs = files.find((file) => /bugs|bug-report/i.test(file.path));
    if (!bugs) return { s1: 0, s2: 0 };
    return {
      s1: (bugs.content.match(/\bS1\b/g) || []).length,
      s2: (bugs.content.match(/\bS2\b/g) || []).length,
    };
  }, [files]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Project workspace</Badge>
            {activeRuns.length ? (
              <Badge variant="default">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                {activeRuns.length} active
              </Badge>
            ) : null}
            <Badge variant={sandbox.available ? "success" : "warning"}>
              Sandbox {sandbox.available ? "ready" : "off"}
            </Badge>
          </div>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.targetUrl ? (
              <a
                href={project.targetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-primary"
              >
                {project.targetUrl} <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            {project.targetUrl && project.apk ? (
              <span className="mx-2 text-border">·</span>
            ) : null}
            {project.apk ? (
              <span className="inline-flex items-center gap-1">
                <FileArchive className="h-3 w-3" /> {project.apk.originalName}
              </span>
            ) : !project.targetUrl ? (
              "No target attached"
            ) : null}
            <span className="mx-2 text-border">·</span>
            Updated {timeAgo(project.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${project.id}/edit`}>
              <Pencil /> Edit project
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/pipeline?project=${project.id}`}>
              <Workflow /> Full pipeline
            </Link>
          </Button>
          <Button asChild size="sm">
            <a href={`/api/projects/${project.id}/export`}>
              <Download /> Export ZIP
            </a>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <div className="overflow-x-auto pb-1">
          <TabsList>
            <TabsTrigger value="overview">
              <FolderOpen className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="files">
              <Code2 className="h-3.5 w-3.5" /> Files
              <span className="text-[10px] text-muted-foreground">{files.length}</span>
            </TabsTrigger>
            <TabsTrigger value="assistant">
              <Bot className="h-3.5 w-3.5" /> Assistant
            </TabsTrigger>
            <TabsTrigger value="plans">
              <BookOpen className="h-3.5 w-3.5" /> Plans
              <span className="text-[10px] text-muted-foreground">{planFiles.length}</span>
            </TabsTrigger>
            <TabsTrigger value="logs">
              <Terminal className="h-3.5 w-3.5" /> Logs
              <span className="text-[10px] text-muted-foreground">{initialLogs.length}</span>
            </TabsTrigger>
            <TabsTrigger value="tests">
              <FlaskConical className="h-3.5 w-3.5" /> Tests
            </TabsTrigger>
            <TabsTrigger value="runs">
              <Sparkles className="h-3.5 w-3.5" /> Runs
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Saved files", value: files.length, icon: FileCode2 },
              { label: "Workflow runs", value: runs.length, icon: Sparkles },
              {
                label: "Completed runs",
                value: runs.filter((run) => run.status === "completed").length,
                icon: CheckCircle2,
              },
              { label: "Active", value: activeRuns.length, icon: Loader2 },
            ].map((metric) => (
              <Card key={metric.label}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {metric.label}
                    </p>
                    <p className="mt-1 text-2xl font-semibold">{metric.value}</p>
                  </div>
                  <metric.icon className="h-4 w-4 text-primary" />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
            <div className="space-y-5">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">Project brief</CardTitle>
                    <CardDescription>The context every skill receives</CardDescription>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/projects/${project.id}/edit`}>
                      <Pencil /> Edit
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                  {[
                    ["Description", project.description],
                    ["Features", project.features],
                    ["Tech stack", project.techStack],
                    ["Design preferences", project.designPreferences],
                    ["Additional requirements", project.additionalRequirements],
                  ].map(([label, value]) => (
                    <div key={label} className={label === "Description" ? "sm:col-span-2" : ""}>
                      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {label}
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
                        {value || "—"}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent runs</CardTitle>
                </CardHeader>
                <CardContent>
                  {runs.length === 0 ? (
                    <EmptyState
                      icon={Sparkles}
                      title="No runs for this project"
                      description="Run a skill or the full pipeline to generate plans and files."
                      action={
                        <Button asChild size="sm">
                          <Link href="/skills">
                            <Play /> Browse skills
                          </Link>
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-2">
                      {runs.slice(0, 6).map((run) => (
                        <Link
                          key={run.id}
                          href={`/runs/${run.id}`}
                          className="flex items-center gap-3 rounded-lg border border-border bg-background/40 p-3 transition-colors hover:bg-secondary/40"
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary/60">
                            {run.type === "pipeline" ? (
                              <Workflow className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">{run.title}</span>
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">
                              {timeAgo(run.createdAt)}
                            </span>
                          </span>
                          <StatusBadge status={run.status} />
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-5">
              {project.apk ? (
                <ApkAnalysisPanel projectId={project.id} initialApk={project.apk} />
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Next actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button asChild className="w-full justify-start" variant="outline">
                    <Link href={`/skills/replica-recon/run?project=${project.id}`}>
                      <Play /> Run recon
                    </Link>
                  </Button>
                  <Button asChild className="w-full justify-start" variant="outline">
                    <Link href={`/pipeline?project=${project.id}`}>
                      <Workflow /> Start full pipeline
                    </Link>
                  </Button>
                  <Button asChild className="w-full justify-start" variant="outline">
                    <Link href="/runs">
                      <Sparkles /> Inspect workflow history
                    </Link>
                  </Button>
                  <Button asChild className="w-full justify-start" variant="outline">
                    <a href={`/api/projects/${project.id}/export`}>
                      <Download /> Export project ZIP
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Artifacts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {[
                    ["recon.md", files.some((file) => file.path.endsWith("recon.md"))],
                    ["architecture.md", files.some((file) => file.path.endsWith("architecture.md"))],
                    ["design tokens", files.some((file) => file.path.includes("design/tokens"))],
                    ["test plan", files.some((file) => /test-plan/i.test(file.path))],
                    ["brand", files.some((file) => /brand\./i.test(file.path))],
                    ["deploy checklist", files.some((file) => /deploy/i.test(file.path))],
                  ].map(([label, present]) => (
                    <div key={String(label)} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{label}</span>
                      {present ? (
                        <Badge variant="success">saved</Badge>
                      ) : (
                        <Badge variant="outline">missing</Badge>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Execution environment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">AI provider</span>
                    <span className="text-foreground/80">{ai.label}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Sandbox</span>
                    <Badge variant={sandbox.available ? "success" : "warning"}>
                      {sandbox.available ? "ready" : "unavailable"}
                    </Badge>
                  </div>
                  <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">
                    {sandbox.available
                      ? "Scripts run only after approval, with no network, a read-only root, and CPU/memory/time limits."
                      : sandbox.reason}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="files">
          <Card>
            <CardContent className="p-0">
              <div className="grid min-h-[560px] lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
                <div className="border-b border-border lg:border-b-0 lg:border-r">
                  <div className="flex items-center gap-2 border-b border-border p-3">
                    <p className="text-xs font-medium">File explorer</p>
                    <div className="ml-auto flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setNewFileOpen(true)}
                        aria-label="New file"
                      >
                        <FilePlus2 />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteOpen(true)}
                        disabled={!selectedFile}
                        aria-label="Delete file"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-[520px] overflow-y-auto p-2">
                    {files.length === 0 ? (
                      <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                        No files yet. Run a skill or create one manually.
                      </p>
                    ) : (
                      files.map((file) => (
                        <button
                          key={file.id}
                          onClick={() => selectFile(file)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-secondary",
                            selectedPath === file.path && "bg-secondary text-foreground",
                          )}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate font-mono">{file.path}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col">
                  <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                    <code className="min-w-0 flex-1 truncate text-xs text-foreground/85">
                      {selectedPath || "No file selected"}
                    </code>
                    {dirty ? <Badge variant="warning">Unsaved</Badge> : null}
                    {selectedFile ? <CopyButton value={editorValue} /> : null}
                    <Button size="sm" onClick={() => void saveFile()} disabled={!dirty || saving}>
                      {saving ? <Loader2 className="animate-spin" /> : <Save />}
                      Save
                    </Button>
                  </div>
                  {selectedFile ? (
                    <textarea
                      value={editorValue}
                      onChange={(event) => setEditorValue(event.target.value)}
                      spellCheck={false}
                      aria-label={`Edit ${selectedPath}`}
                      className="min-h-[500px] flex-1 resize-none bg-background/40 p-4 font-mono text-[12px] leading-relaxed text-foreground/90 outline-none focus:ring-1 focus:ring-inset focus:ring-ring"
                    />
                  ) : (
                    <div className="flex flex-1 items-center justify-center p-8">
                      <EmptyState
                        icon={FileCode2}
                        title="Select a file"
                        description="Choose a file to view and edit it, or create a new one."
                        action={
                          <Button size="sm" onClick={() => setNewFileOpen(true)}>
                            <Plus /> New file
                          </Button>
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assistant">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4 text-primary" /> Project assistant
                </CardTitle>
                <CardDescription>
                  Can read project context and write files through controlled backend tools.
                </CardDescription>
              </div>
              <Badge variant={ai.configured ? "success" : "warning"}>
                {ai.configured ? ai.label : "AI not configured"}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[420px] overflow-y-auto p-4">
                <div className="space-y-4">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex gap-3",
                        message.role === "user" && "justify-end",
                      )}
                    >
                      {message.role === "assistant" ? (
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-secondary/60">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                        </span>
                      ) : null}
                      <div
                        className={cn(
                          "max-w-[85%] rounded-xl border px-3.5 py-3 text-sm",
                          message.role === "user"
                            ? "border-primary/20 bg-primary/10"
                            : "border-border bg-background/50",
                        )}
                      >
                        <Markdown className="prose-sm">{message.content}</Markdown>
                        {message.demo ? (
                          <p className="mt-2 text-[10px] font-medium text-warning">
                            Demo preview — no model call was made.
                          </p>
                        ) : null}
                        {message.files?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {message.files.map((file) => (
                              <button
                                key={file}
                                onClick={() => void refreshFiles(file)}
                                className="rounded-md border border-border bg-secondary/50 px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-primary"
                              >
                                saved: {file}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {chatBusy ? (
                    <div className="flex items-center gap-2 pl-10 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      Thinking and checking project files…
                    </div>
                  ) : null}
                  <div ref={chatEndRef} />
                </div>
              </div>
              <form onSubmit={sendChat} className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Ask for the next artifact, a code change, or an explanation…"
                    rows={2}
                    className="min-h-[48px] resize-none"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendChat(event);
                      }
                    }}
                  />
                  <Button type="submit" size="icon" disabled={chatBusy || !chatInput.trim()}>
                    {chatBusy ? <Loader2 className="animate-spin" /> : <Send />}
                    <span className="sr-only">Send message</span>
                  </Button>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Files are saved only when the assistant returns valid file blocks. Unsafe paths
                  are rejected.
                </p>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans">
          {planFiles.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No plans saved yet"
              description="Run recon, architect, design, or the pipeline to generate plan artifacts."
              action={
                <Button asChild size="sm">
                  <Link href={`/skills/replica-recon/run?project=${project.id}`}>
                    <Play /> Run recon
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Generated plans</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {planFiles.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => setPlanPath(file.path)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-secondary",
                        selectedPlan?.path === file.path && "bg-secondary",
                      )}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono">{file.path}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="truncate font-mono text-sm">{selectedPlan?.path}</CardTitle>
                  {selectedPlan ? <CopyButton value={selectedPlan.content} /> : null}
                </CardHeader>
                <CardContent className="max-h-[600px] overflow-y-auto">
                  {selectedPlan ? (
                    /\.(md|markdown)$/i.test(selectedPlan.path) ? (
                      <Markdown className="prose-sm sm:prose-base">{selectedPlan.content}</Markdown>
                    ) : (
                      <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/85">
                        {selectedPlan.content}
                      </pre>
                    )
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Execution logs</CardTitle>
                <CardDescription>Recent logs across this project&apos;s runs</CardDescription>
              </div>
              <Select value={logFilter} onValueChange={setLogFilter}>
                <SelectTrigger className="w-36" aria-label="Filter logs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[560px] overflow-y-auto bg-background/50 p-4 font-mono text-[11px] leading-relaxed">
                {filteredLogs.length === 0 ? (
                  <p className="py-8 text-center font-sans text-sm text-muted-foreground">
                    No logs recorded for this project yet.
                  </p>
                ) : (
                  filteredLogs.map((log) => (
                    <div key={log.id} className="flex gap-2 border-b border-border/40 py-1.5">
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
                          "w-14 shrink-0 uppercase",
                          log.level === "error" && "text-destructive",
                          log.level === "warn" && "text-warning",
                          log.level === "success" && "text-success",
                          log.level === "debug" && "text-muted-foreground/60",
                          log.level === "info" && "text-primary/80",
                        )}
                      >
                        {log.level}
                      </span>
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground/85">
                        {log.message}
                      </span>
                      <Link
                        href={`/runs/${log.runId}`}
                        className="hidden shrink-0 font-sans text-[10px] text-muted-foreground hover:text-primary sm:block"
                      >
                        {log.runTitle.slice(0, 24)}
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tests" className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Sandbox
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {sandbox.available ? "Ready" : "Unavailable"}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">{sandbox.reason}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Test plan
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {testFiles.some((file) => /test-plan/i.test(file.path)) ? "Saved" : "Missing"}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Generated by replica-test
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Open S1 / S2
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {openBugs.s1} / {openBugs.s2}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  From saved bug reports, not a live test run
                </p>
              </CardContent>
            </Card>
          </div>

          {!sandbox.available ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
              Sandbox execution is not configured. Code generation, file export, and plan review
              still work. Automated test execution is unavailable until Docker and the sandbox
              image are available.
            </div>
          ) : null}

          {testFiles.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="No test artifacts yet"
              description="Run replica-test to generate a test plan and bug report."
              action={
                <Button asChild size="sm">
                  <Link href={`/skills/replica-test/run?project=${project.id}`}>
                    <Play /> Run replica-test
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Test artifacts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {testFiles.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => setTestPath(file.path)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-secondary",
                        selectedTest?.path === file.path && "bg-secondary",
                      )}
                    >
                      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono">{file.path}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="truncate font-mono text-sm">{selectedTest?.path}</CardTitle>
                  {selectedTest ? <CopyButton value={selectedTest.content} /> : null}
                </CardHeader>
                <CardContent className="max-h-[560px] overflow-y-auto">
                  {selectedTest ? (
                    /\.(md|markdown)$/i.test(selectedTest.path) ? (
                      <Markdown className="prose-sm sm:prose-base">{selectedTest.content}</Markdown>
                    ) : (
                      <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/85">
                        {selectedTest.content}
                      </pre>
                    )
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run a test-oriented skill</CardTitle>
              <CardDescription>
                Test execution remains explicit. Nothing runs automatically from the repository.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/skills/replica-test/run?project=${project.id}`}>
                  <Play /> Test skill
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/skills/replica-diff/run?project=${project.id}`}>
                  <Play /> Parity diff
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          {runs.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No workflow runs"
              description="Run a skill or pipeline against this project."
              action={
                <Button asChild size="sm">
                  <Link href="/skills">
                    <Play /> Browse skills
                  </Link>
                </Button>
              }
            />
          ) : (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {runs.map((run) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-secondary/30 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{run.title}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                        <span className="capitalize">{run.type}</span>
                        {run.skillSlug ? <span className="font-mono">{run.skillSlug}</span> : null}
                        <span>{formatDate(run.createdAt)}</span>
                        {run.demo ? <span className="text-warning">demo</span> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={run.status} />
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a project file</DialogTitle>
            <DialogDescription>
              Paths are relative to the project root. Absolute paths, parent traversal, and .env
              files are rejected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-file-path">File path</Label>
            <Input
              id="new-file-path"
              value={newPath}
              onChange={(event) => setNewPath(event.target.value)}
              placeholder="replica/notes.md"
              onKeyDown={(event) => {
                if (event.key === "Enter") void createFile();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFileOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void createFile()} disabled={!newPath.trim() || saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              Create file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedPath}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the file from this project. Run history is unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteFile();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
