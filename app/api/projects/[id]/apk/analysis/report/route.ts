import { NextResponse } from "next/server";
import { getApkAnalysisByProject, getApkUploadByProject, getProject } from "@/lib/db/repo";
import { handleApiError, jsonError } from "@/lib/api";
import { ensureApkAnalysis } from "@/lib/apk/queue";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return jsonError("Project not found", 404);
    const apk = getApkUploadByProject(id);
    if (!apk) return jsonError("No APK is attached to this project", 404);
    ensureApkAnalysis(id);
    const analysis = getApkAnalysisByProject(id);
    if (!analysis) return jsonError("APK analysis is not available", 404);
    if (analysis.status !== "completed" || !analysis.report) {
      return jsonError(`APK analysis is not complete (status: ${analysis.status})`, 409);
    }

    const format = new URL(request.url).searchParams.get("format");
    const baseName = (apk.originalName || "apk").replace(/\.apk$/i, "");
    if (format === "md") {
      return new NextResponse(analysis.reportText || "# Static APK Analysis Report", {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(baseName)}-static-analysis.md"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(
      {
        apk: {
          originalName: apk.originalName,
          sizeBytes: apk.sizeBytes,
          sha256: apk.sha256,
        },
        report: analysis.report,
        reportText: analysis.reportText,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
