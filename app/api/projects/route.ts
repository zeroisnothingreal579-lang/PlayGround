import { NextResponse } from "next/server";
import { z } from "zod";
import { createProject, listProjects } from "@/lib/db/repo";
import { handleApiError, jsonError, readJson } from "@/lib/api";

const projectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  targetKind: z.enum(["website", "apk", "both"]).optional(),
  targetUrl: z.string().trim().max(2000).optional().nullable(),
  description: z.string().max(20_000).optional(),
  features: z.string().max(30_000).optional(),
  techStack: z.string().max(10_000).optional(),
  designPreferences: z.string().max(10_000).optional(),
  additionalRequirements: z.string().max(20_000).optional(),
});

export async function GET() {
  try {
    return NextResponse.json({ projects: listProjects() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const parsed = projectSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Please check the project fields", 422, parsed.error.issues);
    }
    if (parsed.data.targetUrl) {
      try {
        const url = new URL(parsed.data.targetUrl);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
      } catch {
        return jsonError("Target URL must be a valid http(s) URL", 422);
      }
    }
    const targetKind =
      parsed.data.targetKind || (parsed.data.targetUrl ? "website" : "apk");
    if ((targetKind === "website" || targetKind === "both") && !parsed.data.targetUrl) {
      return jsonError("A website URL is required for the selected target type", 422);
    }
    const project = createProject({ ...parsed.data, targetKind });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
