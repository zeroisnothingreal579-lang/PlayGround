import { NextResponse } from "next/server";
import { clearHistory } from "@/lib/db/repo";
import { handleApiError } from "@/lib/api";

export async function POST() {
  try {
    clearHistory();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
