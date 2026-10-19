import { NextResponse } from "next/server";
import { listRuns } from "@/lib/db/repo";
import type { RunStatus, RunType } from "@/lib/types";
import { handleApiError } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const runs = listRuns({
      projectId: url.searchParams.get("projectId") || undefined,
      type: (url.searchParams.get("type") as RunType) || undefined,
      status: (url.searchParams.get("status") as RunStatus) || undefined,
      limit: Number(url.searchParams.get("limit")) || 50,
    });
    return NextResponse.json({ runs });
  } catch (error) {
    return handleApiError(error);
  }
}
