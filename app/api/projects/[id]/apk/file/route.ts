import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getApkUploadByProject, getProject } from "@/lib/db/repo";
import { handleApiError, jsonError } from "@/lib/api";
import { readApkStream } from "@/lib/apk/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return jsonError("Project not found", 404);
    const apk = getApkUploadByProject(id);
    if (!apk) return jsonError("No APK is attached to this project", 404);
    const stream = readApkStream(apk.storageKey);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": String(apk.sizeBytes),
        "Content-Disposition": `attachment; filename="app.apk"; filename*=UTF-8''${encodeURIComponent(apk.originalName)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
