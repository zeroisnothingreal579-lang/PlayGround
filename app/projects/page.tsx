import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ProjectsBrowser } from "@/components/projects/projects-browser";
import { listProjects } from "@/lib/db/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

export default function ProjectsPage() {
  const projects = listProjects();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Each project holds the brief, generated files, and complete workflow history."
        actions={
          <Button asChild>
            <Link href="/projects/new">
              <Plus />
              New project
            </Link>
          </Button>
        }
      />
      <ProjectsBrowser projects={projects} />
    </div>
  );
}
