"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Blocks,
  BookOpen,
  Clock3,
  FileCode2,
  GitBranch,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { SkillSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";

export function SkillsLibrary({
  skills,
  order,
  source,
  commit,
  repoUrl,
  warning,
}: {
  skills: SkillSummary[];
  order: string[];
  source: string;
  commit: string | null;
  repoUrl: string;
  warning?: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const ordered = useMemo(() => {
    const rank = new Map(order.map((slug, index) => [slug, index]));
    return [...skills].sort(
      (a, b) =>
        (rank.get(a.slug) ?? 999) - (rank.get(b.slug) ?? 999) || a.slug.localeCompare(b.slug),
    );
  }, [skills, order]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return ordered.filter((skill) => {
      const matchesQuery =
        !q ||
        skill.name.toLowerCase().includes(q) ||
        skill.slug.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "run" && skill.runCount > 0) ||
        (filter === "never" && skill.runCount === 0) ||
        (filter === "scripts" && skill.scriptCount > 0);
      return matchesQuery && matchesFilter;
    });
  }, [ordered, query, filter]);

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/skills?refresh=true");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not refresh skills");
      toast.success(`Loaded ${data.skills?.length ?? 0} skills from ${data.source}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh skills");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search skills…"
              className="pl-9"
              aria-label="Search skills"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter skills">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All skills</SelectItem>
              <SelectItem value="run">Has run history</SelectItem>
              <SelectItem value="never">Never run</SelectItem>
              <SelectItem value="scripts">Includes scripts</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            <GitBranch className="h-3 w-3" />
            {source}
            {commit ? ` @ ${commit.slice(0, 7)}` : ""}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Syncing…" : "Sync repository"}
          </Button>
        </div>
      </div>

      {warning ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {warning}
        </div>
      ) : null}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {filtered.length} of {ordered.length} skills ·{" "}
          <a href={repoUrl} target="_blank" rel="noreferrer" className="hover:text-primary">
            {repoUrl.replace("https://github.com/", "")}
          </a>
        </span>
        <span>Order is derived from repository dependencies</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Blocks}
          title="No matching skills"
          description="Try a different search or filter."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((skill, index) => (
            <Card key={skill.slug} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-secondary/60 font-mono text-xs text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/skills/${skill.slug}`}
                        className="block truncate font-mono text-sm font-medium hover:text-primary"
                      >
                        {skill.slug}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{skill.name}</p>
                    </div>
                  </div>
                  <Badge variant={skill.source === "github" ? "success" : "secondary"}>
                    {skill.source === "github" ? "GitHub" : skill.source}
                  </Badge>
                </div>

                <p className="mt-4 line-clamp-3 min-h-[3.75rem] text-sm text-muted-foreground">
                  {skill.description || "No description supplied by the repository."}
                </p>

                <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1">
                    <FileCode2 className="h-3 w-3" /> {skill.fileCount} files
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1">
                    <Clock3 className="h-3 w-3" /> {timeAgo(skill.lastRunAt)}
                  </span>
                  {skill.scriptCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1">
                      <ShieldCheck className="h-3 w-3" /> {skill.scriptCount} scripts
                    </span>
                  ) : null}
                  {skill.runCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1">
                      {skill.runCount} run{skill.runCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>

                {skill.lastRunStatus ? (
                  <div className="mt-3">
                    <StatusBadge status={skill.lastRunStatus} />
                  </div>
                ) : null}

                {skill.dependencies.length ? (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Needs:{" "}
                    <span className="font-mono text-foreground/70">
                      {skill.dependencies.join(", ")}
                    </span>
                  </p>
                ) : null}

                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-4">
                  <Button asChild size="sm">
                    <Link href={`/skills/${skill.slug}/run`}>
                      <Play /> Run skill
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/skills/${skill.slug}`}>
                      <BookOpen /> Instructions
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
