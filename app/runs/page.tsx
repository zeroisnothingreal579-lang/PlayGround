import Link from "next/link";
import { Workflow } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { RunsList } from "@/components/runs/runs-list";
import { listProjects, listRuns } from "@/lib/db/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workflow Runs" };

export default function RunsPage() {
  const runs = listRuns({ limit: 200 });
  const projects = listProjects().map((project) => ({ id: project.id, name: project.name }));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="History"
        title="Workflow Runs"
        description="Every individual skill and pipeline run, with durable logs, outputs, and recovery controls."
        actions={
          <Button asChild variant="outline">
            <Link href="/pipeline">
              <Workflow /> Run full pipeline
            </Link>
          </Button>
        }
      />
      <RunsList runs={runs} projects={projects} />
    </div>
  );
}
