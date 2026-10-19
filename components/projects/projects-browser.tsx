"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Download,
  ExternalLink,
  FolderKanban,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";

export function ProjectsBrowser({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return projects;
    return projects.filter((project) =>
      [project.name, project.description, project.targetUrl, project.techStack]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q)),
    );
  }, [projects, query]);

  async function deleteProject() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/projects/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete project");
      }
      toast.success("Project deleted");
      setDeleteTarget(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete project");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects…"
            className="pl-9"
            aria-label="Search projects"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {projects.length} project{projects.length === 1 ? "" : "s"}
        </p>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create a project with the target app, features, and design direction. Skills use it as their brief."
          action={
            <Button asChild>
              <Link href="/projects/new">
                <Plus />
                New project
              </Link>
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching projects"
          description="Try a different name, URL, or stack."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <Card key={project.id} className="group flex flex-col transition-colors hover:border-border/90">
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-secondary/60 text-sm font-semibold">
                    {project.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block truncate text-sm font-semibold hover:text-primary"
                    >
                      {project.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Updated {timeAgo(project.updatedAt)}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Project actions">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/projects/${project.id}`}>
                          <ExternalLink /> Open workspace
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/projects/${project.id}/edit`}>
                          <Pencil /> Edit details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={`/api/projects/${project.id}/export`}>
                          <Download /> Export ZIP
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setDeleteTarget(project)}
                      >
                        <Trash2 /> Delete project
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="mt-4 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
                  {project.description || "No description yet."}
                </p>

                {project.targetUrl ? (
                  <p className="mt-3 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{project.targetUrl}</span>
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground/60">No target URL</p>
                )}

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {project.techStack
                    ? project.techStack
                        .split(/[,\n]/)
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .slice(0, 3)
                        .map((item) => (
                          <span
                            key={item}
                            className="rounded-md border border-border bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {item}
                          </span>
                        ))
                    : null}
                </div>

                <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/projects/${project.id}`}>
                      Open <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/projects/${project.id}/edit`}>Edit</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project and its saved files. Existing workflow runs
              remain in run history without a project. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteProject();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
