import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject, listProjectFiles, upsertProjectFile, sanitizeProjectPath, createRun, updateRun, addLog, addActivity } from "@/lib/db/repo";
import { handleApiError, jsonError, readJson } from "@/lib/api";
import { generateCompletion } from "@/lib/ai/providers";
import { parseGeneratedFiles, estimateTokens } from "@/lib/runs/prompts";
import { getApkPromptContext } from "@/lib/apk/context";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(40_000),
      }),
    )
    .max(20)
    .optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let runId: string | null = null;
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return jsonError("Project not found", 404);
    const parsed = chatSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Invalid chat message", 422, parsed.error.issues);

    const apkContext = getApkPromptContext(id);
    const files = listProjectFiles(id);
    let context = files
      .slice(0, 40)
      .map((file) => `### ${file.path}\n${file.content.slice(0, 20_000)}`)
      .join("\n\n");
    if (context.length > 100_000) context = `${context.slice(0, 100_000)}\n[context truncated]`;

    const system = [
      "You are the Replica Studio project assistant.",
      "Help the user research, design, build, test, and prepare their application replica.",
      "Respect clean-room rules: never copy proprietary source, copy, assets, or logos; never bypass auth, paywalls, or access controls.",
      "You can create or modify project files through controlled backend tools.",
      'To write a file, output a block exactly like: <file path="relative/path">content</file>',
      "Paths must be relative, stay inside the project, and cannot be .env files.",
      "Do not claim a file was saved unless it appears in a <file> block.",
      "",
      `Project: ${project.name}`,
      project.targetUrl ? `Target: ${project.targetUrl}` : "",
      project.description ? `Description: ${project.description}` : "",
      project.features ? `Features:\n${project.features}` : "",
      project.techStack ? `Preferred stack: ${project.techStack}` : "",
      "",
      apkContext || "",
      "Current project files:",
      context || "(empty project)",
    ]
      .filter(Boolean)
      .join("\n");

    const run = createRun({
      projectId: id,
      type: "chat",
      title: `Assistant chat — ${project.name}`,
      status: "running",
      startedAt: new Date().toISOString(),
      input: { message: parsed.data.message },
    });
    runId = run.id;
    addLog({ runId, level: "info", message: "Loading project context for assistant chat" });
    if (apkContext) addLog({ runId, level: "info", message: "Attached static APK analysis context" });

    const result = await generateCompletion({
      system,
      messages: [
        ...(parsed.data.history || []),
        { role: "user", content: parsed.data.message },
      ],
    });

    const saved: string[] = [];
    for (const file of parseGeneratedFiles(result.content).slice(0, 25)) {
      try {
        const safePath = sanitizeProjectPath(file.path);
        upsertProjectFile(id, safePath, file.content);
        saved.push(safePath);
        addLog({ runId, level: "success", message: `Assistant saved ${safePath}` });
      } catch (error) {
        addLog({
          runId,
          level: "warn",
          message: `Skipped invalid assistant file path: ${
            error instanceof Error ? error.message : "unknown"
          }`,
        });
      }
    }

    updateRun(run.id, {
      status: "completed",
      output: result.content,
      demo: result.demo,
      estimatedTokens: estimateTokens(system + parsed.data.message),
      completedAt: new Date().toISOString(),
    });
    addActivity({
      projectId: id,
      runId: run.id,
      type: "chat.completed",
      message: `Assistant replied${saved.length ? ` and saved ${saved.length} file(s)` : ""}`,
    });

    const displayResponse =
      result.content.replace(/<file\s+path\s*=\s*["'][^"']+["']\s*>[\s\S]*?<\/file>/gi, "").trim() ||
      (saved.length
        ? `Saved ${saved.length} file(s): ${saved.map((file) => `\`${file}\``).join(", ")}`
        : result.content);

    return NextResponse.json({
      response: displayResponse,
      files: saved,
      demo: result.demo,
      runId: run.id,
    });
  } catch (error) {
    if (runId) {
      updateRun(runId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Assistant failed",
        completedAt: new Date().toISOString(),
      });
      addLog({
        runId,
        level: "error",
        message: error instanceof Error ? error.message : "Assistant failed",
      });
    }
    return handleApiError(error);
  }
}
