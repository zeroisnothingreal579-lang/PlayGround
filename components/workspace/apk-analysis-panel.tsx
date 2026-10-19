"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Download,
  FileArchive,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { ApkAnalysis, ApkUpload } from "@/lib/types";
import { formatBytes } from "@/lib/apk/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

function statusVariant(status: ApkAnalysis["status"] | undefined) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "destructive" as const;
  if (status === "running") return "default" as const;
  return "warning" as const;
}

export function ApkAnalysisPanel({
  projectId,
  initialApk,
}: {
  projectId: string;
  initialApk?: ApkUpload | null;
}) {
  const [apk, setApk] = useState<ApkUpload | null>(initialApk || null);
  const [analysis, setAnalysis] = useState<ApkAnalysis | null>(initialApk?.analysis || null);
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/apk/analysis`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json();
    setApk(data.apk || null);
    setAnalysis(data.analysis || null);
  }, [projectId]);

  const active = analysis?.status === "queued" || analysis?.status === "running";

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  async function retry() {
    setRetrying(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/apk/analysis/retry`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not restart analysis");
      setAnalysis((current) =>
        current
          ? {
              ...current,
              status: "queued",
              progress: 0,
              stage: "Queued for static analysis",
              error: null,
            }
          : current,
      );
      toast.success("APK analysis re-queued");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restart analysis");
    } finally {
      setRetrying(false);
    }
  }

  if (!apk) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileArchive className="h-4 w-4 text-primary" /> Android target
          </CardTitle>
          <CardDescription>Private upload with static inspection</CardDescription>
        </div>
        <Badge variant={statusVariant(analysis?.status)}>
          {analysis?.status || "queued"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium">{apk.originalName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatBytes(apk.sizeBytes)} · SHA-256 {apk.sha256.slice(0, 12)}…
          </p>
        </div>

        {analysis ? (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  {analysis.stage || "Queued for static analysis"}
                </span>
                <span className="tabular-nums text-foreground/80">{analysis.progress}%</span>
              </div>
              <Progress value={analysis.progress} />
            </div>

            {analysis.packageName ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Package
                  </p>
                  <p className="mt-0.5 truncate font-mono">{analysis.packageName}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Version
                  </p>
                  <p className="mt-0.5 truncate">
                    {analysis.versionName || "—"}
                    {analysis.versionCode ? ` (${analysis.versionCode})` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Min SDK
                  </p>
                  <p className="mt-0.5">{analysis.minSdk || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Target SDK
                  </p>
                  <p className="mt-0.5">{analysis.targetSdk || "—"}</p>
                </div>
              </div>
            ) : null}

            {analysis.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {analysis.error}
              </p>
            ) : null}

            {analysis.logs.length ? (
              <div className="space-y-1 rounded-md border border-border/70 bg-background/50 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {analysis.logs.slice(-6).map((log, index) => (
                  <p key={`${log.at}-${index}`} className="break-words">
                    <span className="text-foreground/50">
                      {new Date(log.at).toLocaleTimeString()}
                    </span>{" "}
                    {log.message}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {analysis.status === "completed" ? (
                <>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/projects/${projectId}/apk/analysis/report?format=md`}>
                      <FileText /> Report
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/projects/${projectId}/apk/analysis/report`}>
                      <ShieldCheck /> JSON
                    </a>
                  </Button>
                </>
              ) : null}
              {analysis.status === "failed" ? (
                <Button size="sm" variant="outline" onClick={() => void retry()} disabled={retrying}>
                  {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />} Retry
                </Button>
              ) : null}
              <Button asChild size="sm" variant="ghost">
                <a href={`/api/projects/${projectId}/apk/file`}>
                  <Download /> APK
                </a>
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Analysis has not been queued yet.</p>
        )}

        <p className="border-t border-border pt-3 text-[10px] leading-relaxed text-muted-foreground">
          Static inspection only. The APK is not installed or executed, and runtime behavior is not
          observed.
        </p>
      </CardContent>
    </Card>
  );
}
