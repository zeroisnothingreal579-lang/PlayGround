import JSZip from "jszip";
import { getApkAnalysisByProject, getProject, listProjectFiles } from "@/lib/db/repo";

export async function buildProjectZip(projectId: string): Promise<{
  buffer: Buffer;
  filename: string;
  fileCount: number;
}> {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");
  const files = listProjectFiles(projectId, true);
  const apk = project.apk;
  const apkAnalysis = apk ? getApkAnalysisByProject(projectId) : null;
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  let analysisFileCount = 0;
  if (apk) {
    zip.file(
      "replica/apk/apk-upload.json",
      JSON.stringify(
        {
          originalName: apk.originalName,
          sizeBytes: apk.sizeBytes,
          sha256: apk.sha256,
          analysisStatus: apkAnalysis?.status || "queued",
          note: "The APK binary is not included in this export.",
        },
        null,
        2,
      ),
    );
    analysisFileCount += 1;
    if (apkAnalysis?.status === "completed" && apkAnalysis.report) {
      zip.file("replica/apk/static-analysis.json", JSON.stringify(apkAnalysis.report, null, 2));
      zip.file("replica/apk/static-analysis.md", apkAnalysis.reportText || "");
      analysisFileCount += 2;
    }
  }
  zip.file(
    "replica-studio-manifest.json",
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        project: {
          id: project.id,
          name: project.name,
          targetKind: project.targetKind,
          targetUrl: project.targetUrl,
          apk: apk
            ? {
                originalName: apk.originalName,
                sizeBytes: apk.sizeBytes,
                sha256: apk.sha256,
                analysisStatus: apkAnalysis?.status || "queued",
              }
            : null,
          description: project.description,
          features: project.features,
          techStack: project.techStack,
          designPreferences: project.designPreferences,
          additionalRequirements: project.additionalRequirements,
        },
        files: files.map((file) => ({
          path: file.path,
          bytes: Buffer.byteLength(file.content, "utf8"),
          updatedAt: file.updatedAt,
        })),
        note: "Target application content was not copied. This archive contains generated work and static APK analysis metadata only; it does not include the APK binary.",
      },
      null,
      2,
    ),
  );
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const safeName =
    project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project";
  return {
    buffer,
    filename: `${safeName}-replica.zip`,
    fileCount: files.length + analysisFileCount,
  };
}
