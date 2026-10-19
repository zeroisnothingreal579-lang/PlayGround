import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  deleteApkUpload,
  getApkUploadByProject,
  getProject,
  replaceApkUpload,
  updateProject,
} from "@/lib/db/repo";
import { jsonError, handleApiError } from "@/lib/api";
import { scheduleApkAnalysis } from "@/lib/apk/queue";
import { getApkMaxBytes } from "@/lib/apk/config";
import {
  ApkUploadError,
  removeStoredApk,
  sanitizeApkFilename,
  storeApkStream,
  validateApkArchive,
  type StoredApk,
} from "@/lib/apk/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return jsonError("Project not found", 404);
    return NextResponse.json({ apk: project.apk || null });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let stored: StoredApk | null = null;
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return jsonError("Project not found", 404);

    const maxBytes = getApkMaxBytes();
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return jsonError(
        `APK exceeds the maximum upload size of ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
        413,
      );
    }

    const rawName = request.headers.get("x-apk-filename") || "";
    let filename: string;
    try {
      filename = sanitizeApkFilename(decodeURIComponent(rawName));
    } catch {
      return jsonError("Provide a valid .apk filename in the X-APK-Filename header.", 422);
    }

    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (
      contentType &&
      ![
        "application/vnd.android.package-archive",
        "application/octet-stream",
        "application/zip",
        "application/x-zip-compressed",
      ].includes(contentType.split(";")[0].trim())
    ) {
      return jsonError("Unsupported content type. Upload the APK as binary data.", 415);
    }

    stored = await storeApkStream({
      projectId: id,
      uploadId: randomUUID(),
      stream: request.body,
      maxBytes,
    });
    await validateApkArchive(stored.filePath);

    const { apk, previousStorageKey } = replaceApkUpload({
      projectId: id,
      originalName: filename,
      storageKey: stored.storageKey,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      mimeType: "application/vnd.android.package-archive",
    });
    if (previousStorageKey && previousStorageKey !== stored.storageKey) {
      await removeStoredApk(previousStorageKey).catch((error) =>
        console.error("[apk] could not remove replaced APK", error),
      );
    }
    if (project.targetKind === "website") {
      updateProject(id, { targetKind: project.targetUrl ? "both" : "apk" });
    }
    scheduleApkAnalysis(apk.id);
    const updated = getProject(id)!;
    return NextResponse.json(
      { apk: updated.apk || null, analysis: updated.apk?.analysis || null, project: updated },
      { status: 201 },
    );
  } catch (error) {
    if (stored) {
      await removeStoredApk(stored.storageKey).catch(() => undefined);
    }
    if (error instanceof ApkUploadError) return jsonError(error.message, error.status);
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return jsonError("Project not found", 404);
    const existing = getApkUploadByProject(id);
    if (!existing) return jsonError("No APK is attached to this project", 404);
    if (!project.targetUrl && project.targetKind === "apk") {
      return jsonError("Add a website URL before removing the only target input.", 409);
    }
    deleteApkUpload(id);
    updateProject(id, { targetKind: project.targetUrl ? "website" : project.targetKind });
    await removeStoredApk(existing.storageKey);
    return NextResponse.json({ ok: true, project: getProject(id) });
  } catch (error) {
    return handleApiError(error);
  }
}
