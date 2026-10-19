import { NextResponse } from "next/server";
import { getApkUploadByProject, getProject, resetApkAnalysis } from "@/lib/db/repo";
import { handleApiError, jsonError } from "@/lib/api";
import { ensureApkAnalysis, scheduleApkAnalysis } from "@/lib/apk/queue";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return jsonError("Project not found", 404);
    const apk = getApkUploadByProject(id);
    if (!apk) return jsonError("No APK is attached to this project", 404);
    resetApkAnalysis(apk.id);
    ensureApkAnalysis(id);
    scheduleApkAnalysis(apk.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
