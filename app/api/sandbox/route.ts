import { NextResponse } from "next/server";
import { getSandboxStatus } from "@/lib/sandbox";
import { handleApiError } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("refresh") === "true";
    return NextResponse.json({ sandbox: getSandboxStatus(force) });
  } catch (error) {
    return handleApiError(error);
  }
}
