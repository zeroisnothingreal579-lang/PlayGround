import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { getProject } from "@/lib/db/repo";
import { getApkMaxBytes } from "@/lib/apk/config";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project settings"
        title={`Edit ${project.name}`}
        description="Changes apply to future skill runs and pipeline plans."
      />
      <div className="max-w-4xl">
        <ProjectForm project={project} maxApkBytes={getApkMaxBytes()} />
      </div>
    </div>
  );
}
