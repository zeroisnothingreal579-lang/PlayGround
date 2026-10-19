import { getDb, nowIso, uid } from "./index";
import type {
  ActivityItem,
  ApkAnalysis,
  ApkAnalysisLog,
  ApkAnalysisStatus,
  ApkUpload,
  AppSettings,
  ExecutionLog,
  PipelinePlan,
  Project,
  ProjectFile,
  RunStatus,
  RunType,
  Skill,
  SkillFile,
  StepStatus,
  TargetKind,
  WorkflowRun,
  WorkflowStep,
} from "@/lib/types";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const PROJECT_SELECT = `
  SELECT p.*,
    u.id AS apk_id, u.original_name AS apk_original_name, u.size_bytes AS apk_size_bytes,
    u.sha256 AS apk_sha256, u.created_at AS apk_created_at, u.updated_at AS apk_updated_at,
    a.id AS analysis_id, a.status AS analysis_status, a.progress AS analysis_progress,
    a.stage AS analysis_stage, a.package_name AS analysis_package_name,
    a.app_label AS analysis_app_label, a.version_name AS analysis_version_name,
    a.version_code AS analysis_version_code, a.min_sdk AS analysis_min_sdk,
    a.target_sdk AS analysis_target_sdk, a.error AS analysis_error,
    a.logs_json AS analysis_logs_json, a.report_text AS analysis_report_text,
    a.started_at AS analysis_started_at, a.completed_at AS analysis_completed_at,
    a.created_at AS analysis_created_at, a.updated_at AS analysis_updated_at
  FROM projects p
  LEFT JOIN apk_uploads u ON u.project_id = p.id
  LEFT JOIN apk_analyses a ON a.apk_id = u.id
`;

function mapAnalysis(row: any): ApkAnalysis | null {
  if (!row.analysis_id) return null;
  return {
    id: row.analysis_id,
    apkId: row.apk_id,
    projectId: row.project_id ?? row.id,
    status: row.analysis_status as ApkAnalysisStatus,
    progress: Number(row.analysis_progress) || 0,
    stage: row.analysis_stage,
    packageName: row.analysis_package_name,
    appLabel: row.analysis_app_label,
    versionName: row.analysis_version_name,
    versionCode: row.analysis_version_code,
    minSdk: row.analysis_min_sdk,
    targetSdk: row.analysis_target_sdk,
    error: row.analysis_error,
    logs: parseJson<ApkAnalysisLog[]>(row.analysis_logs_json, []),
    reportAvailable: Boolean(row.analysis_report_text),
    startedAt: row.analysis_started_at,
    completedAt: row.analysis_completed_at,
    createdAt: row.analysis_created_at,
    updatedAt: row.analysis_updated_at,
  };
}

function mapProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    targetKind: (row.target_kind || "website") as TargetKind,
    targetUrl: row.target_url,
    description: row.description,
    features: row.features,
    techStack: row.tech_stack,
    designPreferences: row.design_preferences,
    additionalRequirements: row.additional_requirements,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    apk: row.apk_id
      ? {
          id: row.apk_id,
          projectId: row.id,
          originalName: row.apk_original_name,
          sizeBytes: Number(row.apk_size_bytes) || 0,
          sha256: row.apk_sha256,
          createdAt: row.apk_created_at,
          updatedAt: row.apk_updated_at,
          analysis: mapAnalysis(row),
        }
      : null,
  };
}

function mapFile(row: any): ProjectFile {
  return {
    id: row.id,
    projectId: row.project_id,
    path: row.path,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRun(row: any): WorkflowRun {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as RunType,
    status: row.status as RunStatus,
    skillSlug: row.skill_slug,
    title: row.title,
    requirements: row.requirements,
    targetUrl: row.target_url,
    executionMode: row.execution_mode,
    plan: parseJson<PipelinePlan | null>(row.plan_json, null),
    input: parseJson<Record<string, unknown> | null>(row.input_json, null),
    output: row.output,
    error: row.error,
    demo: Boolean(row.demo),
    estimatedTokens: row.estimated_tokens,
    pauseRequested: Boolean(row.pause_requested),
    cancelRequested: Boolean(row.cancel_requested),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function mapStep(row: any): WorkflowStep {
  return {
    id: row.id,
    runId: row.run_id,
    skillSlug: row.skill_slug,
    position: row.position,
    status: row.status as StepStatus,
    dependsOn: parseJson<string[]>(row.depends_on_json, []),
    input: parseJson<Record<string, unknown> | null>(row.input_json, null),
    output: row.output,
    error: row.error,
    tokensUsed: row.tokens_used,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function mapLog(row: any): ExecutionLog {
  return {
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    level: row.level,
    message: row.message,
    createdAt: row.created_at,
  };
}

function mapActivity(row: any): ActivityItem {
  return {
    id: row.id,
    projectId: row.project_id,
    runId: row.run_id,
    type: row.type,
    message: row.message,
    createdAt: row.created_at,
  };
}

function mapSkill(row: any): Skill {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    source: row.source,
    repoUrl: row.repo_url,
    commit: row.commit_sha,
    instructions: row.instructions,
    files: parseJson<SkillFile[]>(row.files_json, []),
    scripts: parseJson<string[]>(row.scripts_json, []),
    dependencies: parseJson<string[]>(row.dependencies_json, []),
    loadedAt: row.loaded_at,
  };
}

/* ------------------------------- projects ------------------------------- */

export interface ProjectInput {
  name: string;
  targetKind?: TargetKind;
  targetUrl?: string | null;
  description?: string;
  features?: string;
  techStack?: string;
  designPreferences?: string;
  additionalRequirements?: string;
}

export function listProjects(limit = 100): Project[] {
  return getDb()
    .prepare(`${PROJECT_SELECT} ORDER BY p.updated_at DESC LIMIT ?`)
    .all(limit)
    .map(mapProject);
}

export function getProject(id: string): Project | null {
  const row = getDb().prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(id);
  return row ? mapProject(row) : null;
}

export function createProject(input: ProjectInput): Project {
  const id = uid();
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO projects
       (id, name, target_kind, target_url, description, features, tech_stack, design_preferences,
        additional_requirements, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name.trim(),
      input.targetKind || (input.targetUrl?.trim() ? "website" : "apk"),
      input.targetUrl?.trim() || null,
      input.description?.trim() || "",
      input.features?.trim() || "",
      input.techStack?.trim() || "",
      input.designPreferences?.trim() || "",
      input.additionalRequirements?.trim() || "",
      now,
      now,
    );
  addActivity({
    projectId: id,
    type: "project.created",
    message: `Project “${input.name.trim()}” created`,
  });
  return getProject(id)!;
}

export function updateProject(id: string, input: Partial<ProjectInput>): Project | null {
  const current = getProject(id);
  if (!current) return null;
  getDb()
    .prepare(
      `UPDATE projects SET
        name = ?, target_kind = ?, target_url = ?, description = ?, features = ?, tech_stack = ?,
        design_preferences = ?, additional_requirements = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.name?.trim() || current.name,
      input.targetKind || current.targetKind,
      input.targetUrl === undefined ? current.targetUrl : input.targetUrl?.trim() || null,
      input.description === undefined ? current.description : input.description.trim(),
      input.features === undefined ? current.features : input.features.trim(),
      input.techStack === undefined ? current.techStack : input.techStack.trim(),
      input.designPreferences === undefined
        ? current.designPreferences
        : input.designPreferences.trim(),
      input.additionalRequirements === undefined
        ? current.additionalRequirements
        : input.additionalRequirements.trim(),
      nowIso(),
      id,
    );
  addActivity({
    projectId: id,
    type: "project.updated",
    message: `Project “${input.name?.trim() || current.name}” updated`,
  });
  return getProject(id);
}

export function deleteProject(id: string) {
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
}

/* ---------------------------------- APK --------------------------------- */

export interface ApkUploadRecord extends ApkUpload {
  storageKey: string;
  mimeType: string;
}

export interface ApkAnalysisRecord extends ApkAnalysis {
  manifest: Record<string, unknown> | null;
  structure: Record<string, unknown> | null;
  resources: Record<string, unknown> | null;
  report: Record<string, unknown> | null;
  reportText: string | null;
}

const APK_SELECT = `
  SELECT u.*,
    a.id AS analysis_id, a.status AS analysis_status, a.progress AS analysis_progress,
    a.stage AS analysis_stage, a.package_name AS analysis_package_name,
    a.app_label AS analysis_app_label, a.version_name AS analysis_version_name,
    a.version_code AS analysis_version_code, a.min_sdk AS analysis_min_sdk,
    a.target_sdk AS analysis_target_sdk, a.error AS analysis_error,
    a.logs_json AS analysis_logs_json, a.report_text AS analysis_report_text,
    a.started_at AS analysis_started_at, a.completed_at AS analysis_completed_at,
    a.created_at AS analysis_created_at, a.updated_at AS analysis_updated_at
  FROM apk_uploads u
  LEFT JOIN apk_analyses a ON a.apk_id = u.id
`;

function mapApkUpload(row: any): ApkUploadRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    originalName: row.original_name,
    sizeBytes: Number(row.size_bytes) || 0,
    sha256: row.sha256,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    analysis: mapAnalysis(row),
    storageKey: row.storage_key,
    mimeType: row.mime_type,
  };
}

export function getApkUploadByProject(projectId: string): ApkUploadRecord | null {
  const row = getDb().prepare(`${APK_SELECT} WHERE u.project_id = ?`).get(projectId);
  return row ? mapApkUpload(row) : null;
}

export function getApkUpload(id: string): ApkUploadRecord | null {
  const row = getDb().prepare(`${APK_SELECT} WHERE u.id = ?`).get(id);
  return row ? mapApkUpload(row) : null;
}

export function replaceApkUpload(input: {
  projectId: string;
  originalName: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
}): { apk: ApkUploadRecord; previousStorageKey: string | null } {
  const previous = getApkUploadByProject(input.projectId);
  const now = nowIso();
  const apkId = uid();
  const tx = getDb().transaction(() => {
    getDb().prepare("DELETE FROM apk_uploads WHERE project_id = ?").run(input.projectId);
    getDb()
      .prepare(
        `INSERT INTO apk_uploads
         (id, project_id, original_name, storage_key, size_bytes, sha256, mime_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        apkId,
        input.projectId,
        input.originalName,
        input.storageKey,
        input.sizeBytes,
        input.sha256,
        input.mimeType,
        now,
        now,
      );
    getDb()
      .prepare(
        `INSERT INTO apk_analyses
         (id, apk_id, project_id, status, progress, stage, logs_json, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', 0, 'Queued for static analysis', ?, ?, ?)`,
      )
      .run(
        uid(),
        apkId,
        input.projectId,
        JSON.stringify([{ at: now, level: "info", message: "APK uploaded; static analysis queued" }]),
        now,
        now,
      );
    getDb().prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now, input.projectId);
  });
  tx();
  return {
    apk: getApkUploadByProject(input.projectId)!,
    previousStorageKey: previous?.storageKey ?? null,
  };
}

export function deleteApkUpload(projectId: string): ApkUploadRecord | null {
  const existing = getApkUploadByProject(projectId);
  if (!existing) return null;
  getDb().prepare("DELETE FROM apk_uploads WHERE project_id = ?").run(projectId);
  getDb()
    .prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
    .run(nowIso(), projectId);
  return existing;
}

export function getApkAnalysis(apkId: string): ApkAnalysisRecord | null {
  const row = getDb().prepare("SELECT * FROM apk_analyses WHERE apk_id = ?").get(apkId);
  if (!row) return null;
  return mapAnalysisRecord(row);
}

export function getApkAnalysisByProject(projectId: string): ApkAnalysisRecord | null {
  const row = getDb().prepare("SELECT * FROM apk_analyses WHERE project_id = ?").get(projectId);
  if (!row) return null;
  return mapAnalysisRecord(row);
}

function mapAnalysisRecord(row: any): ApkAnalysisRecord {
  return {
    id: row.id,
    apkId: row.apk_id,
    projectId: row.project_id,
    status: row.status as ApkAnalysisStatus,
    progress: Number(row.progress) || 0,
    stage: row.stage,
    packageName: row.package_name,
    appLabel: row.app_label,
    versionName: row.version_name,
    versionCode: row.version_code,
    minSdk: row.min_sdk,
    targetSdk: row.target_sdk,
    error: row.error,
    logs: parseJson<ApkAnalysisLog[]>(row.logs_json, []),
    reportAvailable: Boolean(row.report_text),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    manifest: parseJson<Record<string, unknown> | null>(row.manifest_json, null),
    structure: parseJson<Record<string, unknown> | null>(row.structure_json, null),
    resources: parseJson<Record<string, unknown> | null>(row.resources_json, null),
    report: parseJson<Record<string, unknown> | null>(row.report_json, null),
    reportText: row.report_text,
  };
}

export function updateApkAnalysis(id: string, patch: Record<string, unknown>) {
  const allowed: Record<string, string> = {
    status: "status",
    progress: "progress",
    stage: "stage",
    packageName: "package_name",
    appLabel: "app_label",
    versionName: "version_name",
    versionCode: "version_code",
    minSdk: "min_sdk",
    targetSdk: "target_sdk",
    manifest: "manifest_json",
    structure: "structure_json",
    resources: "resources_json",
    report: "report_json",
    reportText: "report_text",
    error: "error",
    startedAt: "started_at",
    completedAt: "completed_at",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const column = allowed[key];
    if (!column) continue;
    sets.push(`${column} = ?`);
    if (["manifest", "structure", "resources", "report"].includes(key)) {
      values.push(value ? JSON.stringify(value) : null);
    } else {
      values.push(value ?? null);
    }
  }
  sets.push("updated_at = ?");
  values.push(nowIso(), id);
  getDb()
    .prepare(`UPDATE apk_analyses SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function appendApkAnalysisLog(
  id: string,
  level: ApkAnalysisLog["level"],
  message: string,
) {
  const row = getDb().prepare("SELECT logs_json FROM apk_analyses WHERE id = ?").get(id) as
    | { logs_json: string }
    | undefined;
  if (!row) return;
  const logs = parseJson<ApkAnalysisLog[]>(row.logs_json, []);
  logs.push({ at: nowIso(), level, message: message.slice(0, 2000) });
  getDb()
    .prepare("UPDATE apk_analyses SET logs_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(logs.slice(-200)), nowIso(), id);
}

export function listApkAnalysisApkIds(staleRunningMs = 0): string[] {
  const cutoff = new Date(Date.now() - staleRunningMs).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT apk_id FROM apk_analyses
       WHERE status = 'queued' OR (status = 'running' AND updated_at <= ?)
       ORDER BY created_at ASC`,
    )
    .all(cutoff) as { apk_id: string }[];
  return rows.map((row) => row.apk_id);
}

export function resetApkAnalysis(apkId: string) {
  getDb()
    .prepare(
      `UPDATE apk_analyses SET status = 'queued', progress = 0, stage = 'Queued for static analysis',
       error = NULL, started_at = NULL, completed_at = NULL,
       logs_json = ?, updated_at = ? WHERE apk_id = ?`,
    )
    .run(
      JSON.stringify([{ at: nowIso(), level: "info", message: "Analysis re-queued by the user" }]),
      nowIso(),
      apkId,
    );
}

/* --------------------------------- files -------------------------------- */

export function sanitizeProjectPath(rawPath: string): string {
  const path = rawPath.replace(/\\/g, "/").trim().replace(/^\.\//, "");
  if (
    !path ||
    path === "." ||
    path.startsWith("/") ||
    path.includes("\0") ||
    /^[A-Za-z]:/.test(path)
  ) {
    throw new Error("Invalid file path");
  }
  const parts = path.split("/");
  if (parts.some((part) => part === ".." || part === "")) {
    throw new Error("File path may not leave the project root");
  }
  if (path.length > 400) throw new Error("File path is too long");
  if (/(^|\/)\.env(\.|$)/.test(path)) {
    throw new Error("Environment files may not be written by the AI");
  }
  return path;
}

export function listProjectFiles(projectId: string, includeContent = true): ProjectFile[] {
  const columns = includeContent
    ? "*"
    : "id, project_id, path, '' as content, created_at, updated_at";
  return getDb()
    .prepare(`SELECT ${columns} FROM project_files WHERE project_id = ? ORDER BY path ASC`)
    .all(projectId)
    .map(mapFile);
}

export function getProjectFile(projectId: string, filePath: string): ProjectFile | null {
  const row = getDb()
    .prepare("SELECT * FROM project_files WHERE project_id = ? AND path = ?")
    .get(projectId, sanitizeProjectPath(filePath));
  return row ? mapFile(row) : null;
}

export function upsertProjectFile(
  projectId: string,
  rawPath: string,
  content: string,
): ProjectFile {
  const filePath = sanitizeProjectPath(rawPath);
  if (content.length > 2_000_000) throw new Error("File exceeds the 2 MB limit");
  const existing = getProjectFile(projectId, filePath);
  const now = nowIso();
  if (existing) {
    getDb()
      .prepare("UPDATE project_files SET content = ?, updated_at = ? WHERE id = ?")
      .run(content, now, existing.id);
  } else {
    getDb()
      .prepare(
        `INSERT INTO project_files (id, project_id, path, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(uid(), projectId, filePath, content, now, now);
  }
  getDb().prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now, projectId);
  return getProjectFile(projectId, filePath)!;
}

export function deleteProjectFile(projectId: string, filePath: string) {
  getDb()
    .prepare("DELETE FROM project_files WHERE project_id = ? AND path = ?")
    .run(projectId, sanitizeProjectPath(filePath));
}

/* -------------------------------- skills -------------------------------- */

export function listSkillRows(): Skill[] {
  return getDb()
    .prepare("SELECT * FROM skills ORDER BY slug ASC")
    .all()
    .map(mapSkill);
}

export function getSkillRow(slug: string): Skill | null {
  const row = getDb().prepare("SELECT * FROM skills WHERE slug = ?").get(slug);
  return row ? mapSkill(row) : null;
}

export function upsertSkill(skill: Skill) {
  getDb()
    .prepare(
      `INSERT INTO skills
       (slug, name, description, source, repo_url, commit_sha, instructions,
        files_json, scripts_json, dependencies_json, loaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         name = excluded.name, description = excluded.description,
         source = excluded.source, repo_url = excluded.repo_url,
         commit_sha = excluded.commit_sha, instructions = excluded.instructions,
         files_json = excluded.files_json, scripts_json = excluded.scripts_json,
         dependencies_json = excluded.dependencies_json, loaded_at = excluded.loaded_at`,
    )
    .run(
      skill.slug,
      skill.name,
      skill.description,
      skill.source,
      skill.repoUrl,
      skill.commit,
      skill.instructions,
      JSON.stringify(skill.files),
      JSON.stringify(skill.scripts),
      JSON.stringify(skill.dependencies),
      skill.loadedAt,
    );
}

export function deleteSkillsNotIn(slugs: string[]) {
  if (slugs.length === 0) return;
  const placeholders = slugs.map(() => "?").join(",");
  getDb().prepare(`DELETE FROM skills WHERE slug NOT IN (${placeholders})`).run(...slugs);
}

/* --------------------------------- runs --------------------------------- */

export function createRun(input: {
  projectId?: string | null;
  type: RunType;
  title: string;
  skillSlug?: string | null;
  requirements?: string | null;
  targetUrl?: string | null;
  executionMode?: string;
  plan?: PipelinePlan | null;
  input?: Record<string, unknown> | null;
  demo?: boolean;
  estimatedTokens?: number;
  status?: RunStatus;
  startedAt?: string | null;
}): WorkflowRun {
  const id = uid();
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO workflow_runs
       (id, project_id, type, status, skill_slug, title, requirements, target_url,
        execution_mode, plan_json, input_json, demo, estimated_tokens, started_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.projectId ?? null,
      input.type,
      input.status || "queued",
      input.skillSlug ?? null,
      input.title,
      input.requirements ?? null,
      input.targetUrl ?? null,
      input.executionMode || "standard",
      input.plan ? JSON.stringify(input.plan) : null,
      input.input ? JSON.stringify(input.input) : null,
      input.demo ? 1 : 0,
      input.estimatedTokens || 0,
      input.startedAt ?? null,
      now,
    );
  return getRun(id)!;
}

export function getRun(id: string): WorkflowRun | null {
  const row = getDb().prepare("SELECT * FROM workflow_runs WHERE id = ?").get(id);
  return row ? mapRun(row) : null;
}

export function listRuns(options: {
  projectId?: string;
  type?: RunType;
  status?: RunStatus;
  limit?: number;
} = {}): WorkflowRun[] {
  const where: string[] = [];
  const values: unknown[] = [];
  if (options.projectId) {
    where.push("project_id = ?");
    values.push(options.projectId);
  }
  if (options.type) {
    where.push("type = ?");
    values.push(options.type);
  }
  if (options.status) {
    where.push("status = ?");
    values.push(options.status);
  }
  const sql = `SELECT * FROM workflow_runs ${
    where.length ? `WHERE ${where.join(" AND ")}` : ""
  } ORDER BY created_at DESC LIMIT ?`;
  values.push(options.limit ?? 50);
  return getDb()
    .prepare(sql)
    .all(...values)
    .map(mapRun);
}

export function updateRun(id: string, patch: Record<string, unknown>) {
  const allowed: Record<string, string> = {
    projectId: "project_id",
    status: "status",
    skillSlug: "skill_slug",
    title: "title",
    requirements: "requirements",
    targetUrl: "target_url",
    executionMode: "execution_mode",
    plan: "plan_json",
    input: "input_json",
    output: "output",
    error: "error",
    demo: "demo",
    estimatedTokens: "estimated_tokens",
    pauseRequested: "pause_requested",
    cancelRequested: "cancel_requested",
    startedAt: "started_at",
    completedAt: "completed_at",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const column = allowed[key];
    if (!column) continue;
    sets.push(`${column} = ?`);
    if (key === "plan") values.push(value ? JSON.stringify(value) : null);
    else if (key === "input") values.push(value ? JSON.stringify(value) : null);
    else if (key === "demo" || key === "pauseRequested" || key === "cancelRequested")
      values.push(value ? 1 : 0);
    else values.push(value ?? null);
  }
  if (!sets.length) return;
  values.push(id);
  getDb()
    .prepare(`UPDATE workflow_runs SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function deleteRun(id: string) {
  getDb().prepare("DELETE FROM workflow_runs WHERE id = ?").run(id);
}

export function clearHistory() {
  getDb().prepare("DELETE FROM workflow_runs").run();
  getDb().prepare("DELETE FROM activities").run();
}

/* --------------------------------- steps -------------------------------- */

export function createStep(input: {
  runId: string;
  skillSlug: string;
  position: number;
  dependsOn: string[];
  input?: Record<string, unknown> | null;
  status?: StepStatus;
}): WorkflowStep {
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO workflow_steps
       (id, run_id, skill_slug, position, status, depends_on_json, input_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.runId,
      input.skillSlug,
      input.position,
      input.status || "pending",
      JSON.stringify(input.dependsOn),
      input.input ? JSON.stringify(input.input) : null,
    );
  return getStep(id)!;
}

export function getStep(id: string): WorkflowStep | null {
  const row = getDb().prepare("SELECT * FROM workflow_steps WHERE id = ?").get(id);
  return row ? mapStep(row) : null;
}

export function listSteps(runId: string): WorkflowStep[] {
  return getDb()
    .prepare("SELECT * FROM workflow_steps WHERE run_id = ? ORDER BY position ASC")
    .all(runId)
    .map(mapStep);
}

export function updateStep(id: string, patch: Record<string, unknown>) {
  const allowed: Record<string, string> = {
    status: "status",
    dependsOn: "depends_on_json",
    input: "input_json",
    output: "output",
    error: "error",
    tokensUsed: "tokens_used",
    startedAt: "started_at",
    completedAt: "completed_at",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const column = allowed[key];
    if (!column) continue;
    sets.push(`${column} = ?`);
    if (key === "dependsOn") values.push(JSON.stringify(value ?? []));
    else if (key === "input") values.push(value ? JSON.stringify(value) : null);
    else values.push(value ?? null);
  }
  if (!sets.length) return;
  values.push(id);
  getDb()
    .prepare(`UPDATE workflow_steps SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
}

/* --------------------------------- logs --------------------------------- */

export function addLog(input: {
  runId: string;
  stepId?: string | null;
  level?: ExecutionLog["level"];
  message: string;
}): ExecutionLog {
  const id = uid();
  const createdAt = nowIso();
  getDb()
    .prepare(
      `INSERT INTO execution_logs (id, run_id, step_id, level, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.runId, input.stepId ?? null, input.level || "info", input.message, createdAt);
  return {
    id,
    runId: input.runId,
    stepId: input.stepId ?? null,
    level: input.level || "info",
    message: input.message,
    createdAt,
  };
}

export function listLogs(runId: string, after?: string, limit = 500): ExecutionLog[] {
  if (after) {
    return getDb()
      .prepare(
        "SELECT * FROM execution_logs WHERE run_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?",
      )
      .all(runId, after, limit)
      .map(mapLog);
  }
  return getDb()
    .prepare("SELECT * FROM execution_logs WHERE run_id = ? ORDER BY created_at ASC LIMIT ?")
    .all(runId, limit)
    .map(mapLog);
}

/* ------------------------------- activity ------------------------------- */

export function addActivity(input: {
  projectId?: string | null;
  runId?: string | null;
  type: string;
  message: string;
}): ActivityItem {
  const id = uid();
  const createdAt = nowIso();
  getDb()
    .prepare(
      `INSERT INTO activities (id, project_id, run_id, type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.projectId ?? null, input.runId ?? null, input.type, input.message, createdAt);
  return {
    id,
    projectId: input.projectId ?? null,
    runId: input.runId ?? null,
    type: input.type,
    message: input.message,
    createdAt,
  };
}

export function listActivities(limit = 12): ActivityItem[] {
  return getDb()
    .prepare("SELECT * FROM activities ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .map(mapActivity);
}

/* ------------------------------- settings ------------------------------- */

export function getSettings(): AppSettings {
  const rows = getDb().prepare("SELECT key, value, updated_at FROM settings").all() as {
    key: string;
    value: string;
    updated_at: string;
  }[];
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    repoUrl: map.repoUrl || "https://github.com/Jakeschincariol/replica-skill",
    aiProvider: map.aiProvider || "",
    aiModel: map.aiModel || "",
    storage: map.storage || "sqlite",
    executionTimeoutMs: Number(map.executionTimeoutMs || 15000),
    maxOutputTokens: Number(map.maxOutputTokens || 8192),
    sandboxMode: map.sandboxMode || "docker",
    allowDemoMode: map.allowDemoMode === "true",
    updatedAt: rows[0]?.updated_at || nowIso(),
  };
}

export function updateSettings(patch: Partial<Omit<AppSettings, "updatedAt">>) {
  const now = nowIso();
  const statement = getDb().prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const tx = getDb().transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      statement.run(key, String(value), now);
    }
  });
  tx();
  return getSettings();
}

/* ------------------------------ approvals ------------------------------- */

export function approveScript(input: {
  projectId: string;
  skillSlug: string;
  scriptPath: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO script_approvals (id, project_id, skill_slug, script_path, approved_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id, skill_slug, script_path) DO UPDATE SET approved_at = excluded.approved_at`,
    )
    .run(uid(), input.projectId, input.skillSlug, input.scriptPath, nowIso());
}

export function listApprovedScripts(projectId: string, skillSlug: string): string[] {
  const rows = getDb()
    .prepare(
      "SELECT script_path FROM script_approvals WHERE project_id = ? AND skill_slug = ? ORDER BY script_path",
    )
    .all(projectId, skillSlug) as { script_path: string }[];
  return rows.map((row) => row.script_path);
}

export function isScriptApproved(input: {
  projectId: string;
  skillSlug: string;
  scriptPath: string;
}): boolean {
  const row = getDb()
    .prepare(
      "SELECT id FROM script_approvals WHERE project_id = ? AND skill_slug = ? AND script_path = ?",
    )
    .get(input.projectId, input.skillSlug, input.scriptPath);
  return Boolean(row);
}

/* --------------------------------- stats -------------------------------- */

export function getWorkspaceStats() {
  const db = getDb();
  const projects = (db.prepare("SELECT COUNT(*) as n FROM projects").get() as { n: number }).n;
  const runs = (db.prepare("SELECT COUNT(*) as n FROM workflow_runs").get() as { n: number }).n;
  const completed = (
    db.prepare("SELECT COUNT(*) as n FROM workflow_runs WHERE status = 'completed'").get() as {
      n: number;
    }
  ).n;
  const failed = (
    db.prepare("SELECT COUNT(*) as n FROM workflow_runs WHERE status = 'failed'").get() as {
      n: number;
    }
  ).n;
  const files = (
    db.prepare("SELECT COUNT(*) as n FROM project_files").get() as { n: number }
  ).n;
  return { projects, runs, completed, failed, files };
}

export function getSkillRunStats(): Record<
  string,
  { lastRunAt: string | null; lastRunStatus: RunStatus | null; runCount: number }
> {
  const rows = getDb()
    .prepare(
      `SELECT skill_slug,
              MAX(created_at) as last_run_at,
              COUNT(*) as run_count
       FROM workflow_runs WHERE type = 'skill' AND skill_slug IS NOT NULL
       GROUP BY skill_slug`,
    )
    .all() as { skill_slug: string; last_run_at: string; run_count: number }[];
  const result: Record<
    string,
    { lastRunAt: string | null; lastRunStatus: RunStatus | null; runCount: number }
  > = {};
  for (const row of rows) {
    const latest = getDb()
      .prepare(
        "SELECT status FROM workflow_runs WHERE type = 'skill' AND skill_slug = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(row.skill_slug) as { status: RunStatus } | undefined;
    result[row.skill_slug] = {
      lastRunAt: row.last_run_at,
      lastRunStatus: latest?.status ?? null,
      runCount: row.run_count,
    };
  }
  return result;
}
