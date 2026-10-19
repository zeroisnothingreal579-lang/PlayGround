import { getApkAnalysisByProject, getApkUploadByProject, getProject } from "@/lib/db/repo";

const MAX_APK_CONTEXT_CHARS = 30_000;

export function getApkPromptContext(projectId: string): string | null {
  const project = getProject(projectId);
  if (!project || project.targetKind === "website") return null;
  const apk = getApkUploadByProject(projectId);
  if (!apk) return null;
  const analysis = apk.analysis;
  const header = [
    "STATIC APK ANALYSIS",
    "This context comes from static archive inspection only. The APK was not installed or executed.",
    "Do not claim to have viewed screens, clicked through the app, observed runtime behavior, or tested live functionality.",
    `Uploaded APK: ${apk.originalName} (${apk.sizeBytes.toLocaleString()} bytes, SHA-256 ${apk.sha256})`,
  ];
  if (!analysis) {
    return [...header, "Analysis status: missing."].join("\n");
  }
  if (analysis.status !== "completed") {
    return [
      ...header,
      `Analysis status: ${analysis.status} — ${analysis.stage || "in progress"}.`,
      analysis.error ? `Analysis error: ${analysis.error}` : "",
      "Do not invent APK contents while analysis is incomplete.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  const record = getApkAnalysisReport(projectId);
  const text = record?.reportText || "";
  return [
    ...header,
    `Package: ${analysis.packageName || "unknown"}`,
    `App label: ${analysis.appLabel || "unknown"}`,
    `Version: ${analysis.versionName || "unknown"} (${analysis.versionCode || "unknown"})`,
    `SDK: min ${analysis.minSdk || "unknown"}, target ${analysis.targetSdk || "unknown"}`,
    "",
    text.length > MAX_APK_CONTEXT_CHARS
      ? `${text.slice(0, MAX_APK_CONTEXT_CHARS)}\n[APK report truncated]`
      : text,
  ].join("\n");
}

function getApkAnalysisReport(projectId: string) {
  return getApkAnalysisByProject(projectId);
}
