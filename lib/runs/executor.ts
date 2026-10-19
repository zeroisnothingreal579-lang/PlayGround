import type { AiConfig, AiResult } from "@/lib/ai/providers";
import { generateCompletion } from "@/lib/ai/providers";
import type { Project, ProjectFile, Skill } from "@/lib/types";
import {
  addActivity,
  addLog,
  getProjectFile,
  getRun,
  listProjectFiles,
  updateRun,
  updateStep,
  upsertProjectFile,
  sanitizeProjectPath,
} from "@/lib/db/repo";
import { getApkPromptContext } from "@/lib/apk/context";
import {
  buildSkillPrompt,
  estimateTokens,
  parseGeneratedFiles,
  relevantFilesForStep,
} from "./prompts";

export class RunCancelledError extends Error {
  constructor() {
    super("Run cancelled by the user");
  }
}

const activeControllers = new Map<string, AbortController>();

export function abortRun(runId: string) {
  activeControllers.get(runId)?.abort(new Error("Run cancelled"));
}

export interface ExecuteSkillInput {
  runId: string;
  stepId?: string;
  skill: Skill;
  project: Project;
  task: string;
  attachedPaths?: string[];
  priorOutputs?: { skillSlug: string; output: string }[];
  config?: AiConfig;
  finalizeRun?: boolean;
}

export interface ExecuteSkillResult {
  output: string;
  ai: AiResult;
  files: string[];
}

function assertNotCancelled(runId: string) {
  const run = getRun(runId);
  if (run?.cancelRequested) throw new RunCancelledError();
}

export async function executeSkill(input: ExecuteSkillInput): Promise<ExecuteSkillResult> {
  const { runId, stepId, skill, project, task } = input;
  const finalizeRun = input.finalizeRun !== false;
  const controller = new AbortController();
  activeControllers.set(runId, controller);

  const log = (level: "info" | "warn" | "error" | "success" | "debug", message: string) => {
    addLog({ runId, stepId: stepId ?? null, level, message });
  };

  try {
    const now = new Date().toISOString();
    if (finalizeRun) {
      updateRun(runId, { status: "running", startedAt: now, error: null });
    }
    if (stepId) updateStep(stepId, { status: "running", startedAt: now, error: null });
    log("info", `Loaded skill “${skill.slug}” (${skill.source}, ${skill.files.length} files)`);

    assertNotCancelled(runId);

    let attached: ProjectFile[] = [];
    if (input.attachedPaths?.length) {
      attached = input.attachedPaths
        .map((filePath) => getProjectFile(project.id, filePath))
        .filter((file): file is ProjectFile => Boolean(file));
    } else {
      const allFiles = listProjectFiles(project.id);
      attached = relevantFilesForStep(allFiles, [skill.slug, ...skill.dependencies]);
    }
    if (attached.length) {
      log("info", `Attached ${attached.length} project file(s) as context`);
    } else {
      log("warn", "No project files matched; continuing with project metadata only");
    }

    const apkContext = getApkPromptContext(project.id);
    if (apkContext) {
      log("info", "Attached static APK analysis context");
    }
    const { system, user } = buildSkillPrompt({
      skill,
      project,
      task,
      attachedFiles: attached,
      priorOutputs: input.priorOutputs,
      apkContext,
    });
    const estimated = estimateTokens(system + user);
    if (finalizeRun) updateRun(runId, { estimatedTokens: estimated });
    log("debug", `Prompt estimated at ~${estimated.toLocaleString()} input tokens`);

    assertNotCancelled(runId);
    log("info", `Calling ${input.config?.provider || "configured provider"} · ${input.config?.model || "configured model"}`);
    const ai = await generateCompletion({
      system,
      messages: [{ role: "user", content: user }],
      config: input.config,
      signal: controller.signal,
    });

    if (ai.demo) {
      log("warn", "DEMO PREVIEW — no AI request was made. Output is not real model work.");
    } else {
      log(
        "success",
        `Model responded with ${ai.usage.outputTokens.toLocaleString()} output tokens`,
      );
    }

    assertNotCancelled(runId);
    const generated = parseGeneratedFiles(ai.content);
    const savedFiles: string[] = [];
    for (const file of generated) {
      try {
        const safePath = sanitizeProjectPath(file.path);
        upsertProjectFile(project.id, safePath, file.content);
        savedFiles.push(safePath);
        log("success", `Saved ${safePath} (${file.content.length.toLocaleString()} chars)`);
      } catch (error) {
        log(
          "warn",
          `Skipped unsafe or invalid file “${file.path}”: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    }

    let output = ai.content;
    if (savedFiles.length === 0) {
      const fallbackPath = `replica/outputs/${skill.slug}-${runId.slice(0, 8)}.md`;
      upsertProjectFile(project.id, fallbackPath, ai.content);
      savedFiles.push(fallbackPath);
      log("info", `Saved the response to ${fallbackPath}`);
      output = `${ai.content}\n\n_Saved to \`${fallbackPath}\`._`;
    }

    const completedAt = new Date().toISOString();
    if (stepId) {
      updateStep(stepId, {
        status: "completed",
        output: ai.content,
        error: null,
        tokensUsed: ai.usage.inputTokens + ai.usage.outputTokens,
        completedAt,
      });
    }
    if (finalizeRun) {
      updateRun(runId, {
        status: "completed",
        output: ai.content,
        error: null,
        demo: ai.demo,
        completedAt,
      });
      addActivity({
        projectId: project.id,
        runId,
        type: "run.completed",
        message: `${skill.name} completed${ai.demo ? " (demo preview)" : ""}`,
      });
    }
    log("success", `Skill ${skill.slug} completed`);
    return { output, ai, files: savedFiles };
  } catch (error) {
    const cancelled =
      error instanceof RunCancelledError ||
      (error instanceof Error && /cancel/i.test(error.message)) ||
      controller.signal.aborted;
    const message = cancelled
      ? "Cancelled by the user"
      : error instanceof Error
        ? error.message
        : "Unknown execution error";
    if (stepId) {
      updateStep(stepId, {
        status: cancelled ? "cancelled" : "failed",
        error: message,
        completedAt: new Date().toISOString(),
      });
    }
    if (finalizeRun) {
      updateRun(runId, {
        status: cancelled ? "cancelled" : "failed",
        error: message,
        completedAt: new Date().toISOString(),
      });
      addActivity({
        projectId: project.id,
        runId,
        type: cancelled ? "run.cancelled" : "run.failed",
        message: `${skill.name} ${cancelled ? "cancelled" : "failed"}: ${message}`,
      });
    }
    log(cancelled ? "warn" : "error", message);
    if (cancelled) throw new RunCancelledError();
    throw error;
  } finally {
    activeControllers.delete(runId);
  }
}
