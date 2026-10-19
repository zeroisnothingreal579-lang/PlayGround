import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/workspace/project-workspace";
import { getProject, listLogs, listProjectFiles, listRuns } from "@/lib/db/repo";
import { getSandboxStatus } from "@/lib/sandbox";
import { resolveAiConfig } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const files = listProjectFiles(id, true);
  const runs = listRuns({ projectId: id, limit: 40 });
  const logs = runs
    .slice(0, 8)
    .flatMap((run) =>
      listLogs(run.id, undefined, 200).map((log) => ({
        ...log,
        runTitle: run.title,
        runType: run.type,
      })),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-400);

  let ai = { configured: false, label: "not configured" };
  try {
    const config = resolveAiConfig();
    ai = {
      configured: true,
      label: `${config.provider}/${config.model}${config.demo ? " (demo)" : ""}`,
    };
  } catch {
    ai = { configured: false, label: "not configured" };
  }

  return (
    <ProjectWorkspace
      project={project}
      initialFiles={files}
      runs={runs}
      initialLogs={logs}
      sandbox={getSandboxStatus()}
      ai={ai}
    />
  );
}
