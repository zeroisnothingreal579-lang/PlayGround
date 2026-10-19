"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Search, Sparkles, Workflow } from "lucide-react";
import type { WorkflowRun } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber, timeAgo } from "@/lib/utils";

export function RunsList({
  runs,
  projects,
}: {
  runs: WorkflowRun[];
  projects: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return runs.filter((run) => {
      const matchesQuery =
        !q ||
        run.title.toLowerCase().includes(q) ||
        (run.skillSlug || "").toLowerCase().includes(q) ||
        (run.requirements || "").toLowerCase().includes(q);
      const matchesStatus = status === "all" || run.status === status;
      const matchesType = type === "all" || run.type === type;
      return matchesQuery && matchesStatus && matchesType;
    });
  }, [runs, query, status, type]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search runs…"
            className="pl-9"
            aria-label="Search workflow runs"
          />
        </div>
        <div className="flex gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="skill">Single skill</SelectItem>
              <SelectItem value="pipeline">Pipeline</SelectItem>
              <SelectItem value="chat">Assistant</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {runs.length} runs
        </p>
      </div>

      {runs.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No workflow runs yet"
          description="Run a skill or the full pipeline to build a durable execution history."
          action={
            <Link href="/skills" className="text-sm text-primary hover:underline">
              Browse skills
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching runs"
          description="Adjust the search or filters."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map((run) => (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-secondary/30 sm:flex-row sm:items-center sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-secondary/50">
                      {run.type === "pipeline" ? (
                        <Workflow className="h-4 w-4 text-primary" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{run.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="capitalize">{run.type}</span>
                        {run.skillSlug ? (
                          <span className="font-mono text-foreground/60">{run.skillSlug}</span>
                        ) : null}
                        {run.projectId ? <span>{projectMap.get(run.projectId) || "Project"}</span> : null}
                        <span>· {timeAgo(run.createdAt)}</span>
                        <span>· ~{formatNumber(run.estimatedTokens)} tokens</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 pl-11 sm:pl-0">
                    {run.demo ? <Badge variant="warning">Demo</Badge> : null}
                    <StatusBadge status={run.status} />
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
