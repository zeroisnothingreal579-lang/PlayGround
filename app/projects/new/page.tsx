import { PageHeader } from "@/components/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { getApkMaxBytes } from "@/lib/apk/config";

export const metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="New project"
        title="Create a replication project"
        description="Give the skills a clear target and scope. You can edit every field later."
      />
      <div className="max-w-4xl">
        <ProjectForm maxApkBytes={getApkMaxBytes()} />
      </div>
    </div>
  );
}
