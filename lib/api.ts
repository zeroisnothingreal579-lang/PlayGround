import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError("Validation failed", 422, error.issues);
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  if (/not found/i.test(message)) return jsonError(message, 404);
  if (/configured|api key|provider/i.test(message)) return jsonError(message, 400);
  if (
    /valid json|invalid file path|may not leave|may not be written|too long|exceeds the|does not belong|classified as scripts|explicit approval|does not support/i.test(
      message,
    )
  ) {
    return jsonError(message, 400);
  }
  console.error("[api]", error);
  return jsonError(message, 500);
}

export async function readJson<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

export function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
