"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Database,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { AppSettings } from "@/lib/types";
import type { SandboxStatus } from "@/lib/sandbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { formatNumber } from "@/lib/utils";

interface ProviderStatus {
  id: string;
  configured: boolean;
  model: string;
  keyEnv: string | null;
}

export function SettingsForm({
  settings,
  providers,
  keys,
  sandbox,
  storagePath,
  supabaseConfigured,
  stats,
  usageTokens,
}: {
  settings: AppSettings;
  providers: ProviderStatus[];
  keys: Record<string, boolean>;
  sandbox: SandboxStatus;
  storagePath: string;
  supabaseConfigured: boolean;
  stats: { projects: number; runs: number; completed: number; failed: number; files: number };
  usageTokens: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    repoUrl: settings.repoUrl,
    aiProvider: settings.aiProvider || "none",
    aiModel: settings.aiModel,
    executionTimeoutMs: settings.executionTimeoutMs,
    maxOutputTokens: settings.maxOutputTokens,
    sandboxMode: settings.sandboxMode,
    allowDemoMode: settings.allowDemoMode,
  });
  const [saving, setSaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sandboxState, setSandboxState] = useState(sandbox);

  const selectedProvider = providers.find((provider) => provider.id === form.aiProvider);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: form.repoUrl,
          aiProvider: form.aiProvider === "none" ? "" : form.aiProvider,
          aiModel: form.aiModel,
          executionTimeoutMs: Number(form.executionTimeoutMs),
          maxOutputTokens: Number(form.maxOutputTokens),
          sandboxMode: form.sandboxMode,
          allowDemoMode: form.allowDemoMode,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save settings");
      toast.success("Settings saved");
      if (form.repoUrl !== settings.repoUrl) {
        const sync = await fetch("/api/skills?refresh=true");
        const syncData = await sync.json().catch(() => ({}));
        if (sync.ok) {
          toast.success(`Repository synced: ${syncData.skills?.length ?? 0} skills`);
        } else {
          toast.error(syncData.error || "Repository sync failed");
        }
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  async function clearHistory() {
    setClearing(true);
    try {
      const response = await fetch("/api/settings/clear-history", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not clear history");
      toast.success("Workflow history cleared");
      setClearOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not clear history");
    } finally {
      setClearing(false);
    }
  }

  async function refreshSandbox() {
    setChecking(true);
    try {
      const response = await fetch("/api/sandbox?refresh=true");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check sandbox");
      setSandboxState(data.sandbox);
      toast[data.sandbox.available ? "success" : "warning"](
        data.sandbox.available ? "Sandbox ready" : "Sandbox unavailable",
        { description: data.sandbox.reason },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not check sandbox");
    } finally {
      setChecking(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-primary" /> Repository and AI
          </CardTitle>
          <CardDescription>
            Keys stay in server-side environment variables. This page only shows whether they are
            configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="repoUrl">GitHub repository URL</Label>
            <Input
              id="repoUrl"
              value={form.repoUrl}
              onChange={(event) => update("repoUrl", event.target.value)}
              placeholder="https://github.com/Jakeschincariol/replica-skill"
            />
            <p className="text-[11px] text-muted-foreground">
              The loader discovers every replica-*/SKILL.md and preserves the associated files and
              scripts. If GitHub is unreachable, the bundled snapshot is used.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="aiProvider">AI provider</Label>
              <Select
                value={form.aiProvider}
                onValueChange={(value) => update("aiProvider", value)}
              >
                <SelectTrigger id="aiProvider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Auto-detect from server keys</SelectItem>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.id}
                      {provider.id !== "demo" && !provider.configured ? " — key missing" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="aiModel">AI model</Label>
              <Input
                id="aiModel"
                value={form.aiModel}
                onChange={(event) => update("aiModel", event.target.value)}
                placeholder={selectedProvider?.model || "e.g. gpt-4.1-mini"}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-medium">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" /> Key configuration status
              </p>
              <Badge variant="secondary">values never shown</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(keys).map(([name, configured]) => (
                <div
                  key={name}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-card/40 px-2.5 py-2"
                >
                  <code className="truncate text-[11px] text-muted-foreground">{name}</code>
                  {configured ? (
                    <Badge variant="success">
                      <Check className="h-3 w-3" /> set
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <X className="h-3 w-3" /> not set
                    </Badge>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Add keys to <code className="text-foreground/80">.env.local</code> on the server, then
              restart. The application never returns key values to the browser.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/40 p-4">
            <div>
              <Label htmlFor="demo-mode" className="text-sm">
                Allow demo previews when no provider is configured
              </Label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Demo runs are explicitly labelled and never claim real AI execution.
              </p>
            </div>
            <Switch
              id="demo-mode"
              checked={form.allowDemoMode}
              onCheckedChange={(checked) => update("allowDemoMode", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" /> Project storage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Active store</span>
              <Badge variant="success">SQLite (durable)</Badge>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Database path
              </p>
              <code className="block break-all rounded-md border border-border bg-background/50 px-2.5 py-2 text-[11px] text-foreground/80">
                {storagePath}
              </code>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Projects, files, runs, steps, logs, and settings are stored server-side. Browser
              localStorage is only used for sidebar preference.
            </p>
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Supabase (optional)</span>
              <Badge variant={supabaseConfigured ? "default" : "outline"}>
                {supabaseConfigured ? "env configured" : "not configured"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Migration schema is included in <code>supabase/migrations/</code>. The personal MVP
              uses local SQLite by default; no fake cloud connection is reported.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" /> Sandbox
              </CardTitle>
              <CardDescription>Isolated execution for repository scripts</CardDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void refreshSandbox()}
              disabled={checking}
              aria-label="Refresh sandbox status"
            >
              <RefreshCw className={checking ? "animate-spin" : ""} />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant={sandboxState.available ? "success" : "warning"}>
                {sandboxState.available ? "ready" : "unavailable"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Mode</span>
              <span>{sandboxState.mode}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Image</span>
              <span className="max-w-[180px] truncate font-mono">{sandboxState.image}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-border bg-background/40 p-2">
                <p className="text-sm font-semibold">{sandboxState.limits.timeoutMs / 1000}s</p>
                <p className="text-[10px] text-muted-foreground">timeout</p>
              </div>
              <div className="rounded-md border border-border bg-background/40 p-2">
                <p className="text-sm font-semibold">{sandboxState.limits.memoryMb}MB</p>
                <p className="text-[10px] text-muted-foreground">memory</p>
              </div>
              <div className="rounded-md border border-border bg-background/40 p-2">
                <p className="text-sm font-semibold">{sandboxState.limits.cpus}</p>
                <p className="text-[10px] text-muted-foreground">CPU</p>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{sandboxState.reason}</p>
            <div className="space-y-2 pt-1">
              <Label htmlFor="sandboxMode">Sandbox mode</Label>
              <Select
                value={form.sandboxMode}
                onValueChange={(value) => update("sandboxMode", value)}
              >
                <SelectTrigger id="sandboxMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docker">Docker (recommended)</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Execution limits</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timeout">Sandbox timeout (ms)</Label>
              <Input
                id="timeout"
                type="number"
                min={1000}
                max={120000}
                value={form.executionTimeoutMs}
                onChange={(event) => update("executionTimeoutMs", Number(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxTokens">Max output tokens</Label>
              <Input
                id="maxTokens"
                type="number"
                min={256}
                max={64000}
                value={form.maxOutputTokens}
                onChange={(event) => update("maxOutputTokens", Number(event.target.value))}
              />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground sm:col-span-2">
              AI request timeouts and sandbox memory/CPU are configured with server environment
              variables. Sandbox scripts run with no network and a read-only root.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage</CardTitle>
            <CardDescription>Estimated from saved run metadata</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Runs</p>
              <p className="mt-1 text-xl font-semibold">{formatNumber(stats.runs)}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Est. input tokens
              </p>
              <p className="mt-1 text-xl font-semibold">{formatNumber(usageTokens)}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Files</p>
              <p className="mt-1 text-xl font-semibold">{formatNumber(stats.files)}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Failed runs
              </p>
              <p className="mt-1 text-xl font-semibold">{formatNumber(stats.failed)}</p>
            </div>
            <p className="text-[11px] text-muted-foreground sm:col-span-2">
              Provider pricing is not fetched. Actual billing depends on your provider and model.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-destructive" /> Danger zone
          </CardTitle>
          <CardDescription>
            Clear workflow runs, steps, logs, and activity. Projects and files are kept.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setClearOpen(true)}
          >
            <Trash2 /> Clear workflow history
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] text-muted-foreground">
          Need the full environment reference? See <code className="text-foreground/80">.env.example</code> in the repository.
        </p>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all workflow history?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes every run, step, log, and activity record. Projects and generated files
              stay intact. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void clearHistory();
              }}
              disabled={clearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearing ? <Loader2 className="animate-spin" /> : <AlertTriangle />}
              {clearing ? "Clearing…" : "Clear history"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
