import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteProject, getApkUploadByProject, getProject, updateProject } from "@/lib/db/repo";
import { removeStoredApk } from "@/lib/apk/storage";
import { handleApiError, jsonError, readJson } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  targetKind: z.enum(["website", "apk", "both"]).optional(),
  targetUrl: z.string().trim().max(2000).optional().nullable(),
  description: z.string().max(20_000).optional(),
  features: z.string().max(30_000).optional(),
  techStack: z.string().max(10_000).optional(),
  designPreferences: z.string().max(10_000).optional(),
  additionalRequirements: z.string().max(20_000).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return jsonError("Project not found", 404);
    return NextResponse.json({ project });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return jsonError("Please check the project fields", 422, parsed.error.issues);
    if (parsed.data.targetUrl) {
      try {
        const url = new URL(parsed.data.targetUrl);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
      } catch {
        return jsonError("Target URL must be a valid http(s) URL", 422);
      }
    }
    const current = getProject(id);
    if (!current) return jsonError("Project not found", 404);
    const targetKind = parsed.data.targetKind || current.targetKind;
    const targetUrl =
      parsed.data.targetUrl === undefined ? current.targetUrl : parsed.data.targetUrl;
    if ((targetKind === "website" || targetKind === "both") && !targetUrl) {
      return jsonError("A website URL is required for the selected target type", 422);
    }
    const project = updateProject(id, { ...parsed.data, targetKind, targetUrl });
    return NextResponse.json({ project });
  } catch (error) {
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
    const apk = getApkUploadByProject(id);
    deleteProject(id);
    if (apk) await removeStoredApk(apk.storageKey).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
