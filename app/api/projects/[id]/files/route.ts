import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteProjectFile,
  getProject,
  getProjectFile,
  listProjectFiles,
  upsertProjectFile,
} from "@/lib/db/repo";
import { handleApiError, jsonError, readJson } from "@/lib/api";

const fileSchema = z.object({
  path: z.string().min(1).max(400),
  content: z.string().max(2_000_000),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!getProject(id)) return jsonError("Project not found", 404);
    const url = new URL(request.url);
    const filePath = url.searchParams.get("path");
    if (filePath) {
      const file = getProjectFile(id, filePath);
      if (!file) return jsonError("File not found", 404);
      return NextResponse.json({ file });
    }
    return NextResponse.json({
      files: listProjectFiles(id, url.searchParams.get("content") === "true"),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!getProject(id)) return jsonError("Project not found", 404);
    const parsed = fileSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Invalid file payload", 422, parsed.error.issues);
    const file = upsertProjectFile(id, parsed.data.path, parsed.data.content);
    return NextResponse.json({ file }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!getProject(id)) return jsonError("Project not found", 404);
    const filePath = new URL(request.url).searchParams.get("path");
    if (!filePath) return jsonError("A file path is required", 422);
    deleteProjectFile(id, filePath);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
