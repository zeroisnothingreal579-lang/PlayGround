import { notFound } from "next/navigation";
import { RunView } from "@/components/runs/run-view";
import { getProject, getRun, listLogs, listSteps } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) notFound();
  const project = run.projectId ? getProject(run.projectId) : null;
  return (
    <RunView
      initial={{
        run,
        steps: listSteps(id),
        logs: listLogs(id),
        project,
      }}
    />
  );
}
