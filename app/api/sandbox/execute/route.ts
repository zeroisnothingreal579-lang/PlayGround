import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addLog,
  createRun,
  getProject,
  getSettings,
  listProjectFiles,
  updateRun,
} from "@/lib/db/repo";
import { loadSkillPack } from "@/lib/skills/loader";
import { assertScriptApproved, getSandboxStatus, runInSandbox } from "@/lib/sandbox";
import { handleApiError, jsonError, readJson } from "@/lib/api";

const executeSchema = z.object({
  projectId: z.string().uuid(),
  skillSlug: z.string().max(120),
  scriptPath: z.string().max(400),
  args: z.array(z.string().max(500)).max(20).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = executeSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Invalid sandbox request", 422, parsed.error.issues);
    const project = getProject(parsed.data.projectId);
    if (!project) return jsonError("Project not found", 404);
    const status = getSandboxStatus(true);
    if (!status.available) {
      return jsonError(`Sandbox unavailable. ${status.reason}`, 409);
    }
    const settings = getSettings();
    const pack = await loadSkillPack({ repoUrl: settings.repoUrl });
    const skill = pack.skills.find((item) => item.slug === parsed.data.skillSlug);
    if (!skill) return jsonError("Skill not found in repository", 404);
    const file = assertScriptApproved({
      projectId: project.id,
      skill,
      scriptPath: parsed.data.scriptPath,
    });

    const run = createRun({
      projectId: project.id,
      type: "skill",
      title: `Sandbox: ${file.path.split("/").pop()} — ${project.name}`,
      skillSlug: skill.slug,
      executionMode: "sandbox",
      status: "running",
      startedAt: new Date().toISOString(),
      input: { scriptPath: file.path, args: parsed.data.args || [] },
    });
    addLog({
      runId: run.id,
      level: "info",
      message: `Sandbox run of ${file.path} (network disabled, read-only root)`,
    });

    let result;
    try {
      result = await runInSandbox({
        scriptContent: file.content,
        scriptName: file.path,
        args: parsed.data.args,
        projectFiles: listProjectFiles(project.id, true),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sandbox execution failed";
      updateRun(run.id, {
        status: "failed",
        error: message,
        completedAt: new Date().toISOString(),
      });
      addLog({ runId: run.id, level: "error", message });
      throw error;
    }

    const output = [
      `$ ${result.command}`,
      "",
      result.stdout,
      result.stderr ? `\nSTDERR:\n${result.stderr}` : "",
    ].join("\n");
    addLog({
      runId: run.id,
      level: result.exitCode === 0 && !result.timedOut ? "success" : "error",
      message: result.timedOut
        ? `Sandbox timed out after ${result.durationMs}ms`
        : `Sandbox exited with code ${result.exitCode}`,
    });
    updateRun(run.id, {
      status: result.exitCode === 0 && !result.timedOut ? "completed" : "failed",
      output,
      error: result.timedOut ? "Execution timed out" : result.exitCode === 0 ? null : result.stderr,
      completedAt: new Date().toISOString(),
    });

    return NextResponse.json({ runId: run.id, result });
  } catch (error) {
    return handleApiError(error);
  }
}
