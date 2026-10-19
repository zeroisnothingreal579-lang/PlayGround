import { NextResponse } from "next/server";
import { deleteRun, getProject, getRun, listLogs, listSteps } from "@/lib/db/repo";
import { handleApiError, jsonError } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const run = getRun(id);
    if (!run) return jsonError("Run not found", 404);
    return NextResponse.json({
      run,
      steps: listSteps(id),
      logs: listLogs(id),
      project: run.projectId ? getProject(run.projectId) : null,
    });
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
    if (!getRun(id)) return jsonError("Run not found", 404);
    deleteRun(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
