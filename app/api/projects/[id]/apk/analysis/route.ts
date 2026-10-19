import { NextResponse } from "next/server";
import { getApkAnalysisByProject, getApkUploadByProject, getProject } from "@/lib/db/repo";
import { handleApiError, jsonError } from "@/lib/api";
import { ensureApkAnalysis } from "@/lib/apk/queue";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return jsonError("Project not found", 404);
    const apk = getApkUploadByProject(id);
    if (!apk) return NextResponse.json({ apk: null, analysis: null });
    ensureApkAnalysis(id);
    const full = getApkAnalysisByProject(id);
    const analysis = full
      ? {
          id: full.id,
          apkId: full.apkId,
          projectId: full.projectId,
          status: full.status,
          progress: full.progress,
          stage: full.stage,
          packageName: full.packageName,
          appLabel: full.appLabel,
          versionName: full.versionName,
          versionCode: full.versionCode,
          minSdk: full.minSdk,
          targetSdk: full.targetSdk,
          error: full.error,
          logs: full.logs,
          reportAvailable: full.reportAvailable,
          startedAt: full.startedAt,
          completedAt: full.completedAt,
          createdAt: full.createdAt,
          updatedAt: full.updatedAt,
        }
      : null;
    return NextResponse.json(
      { apk: project.apk || null, analysis },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
