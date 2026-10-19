export type RunStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

export type StepStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

export type RunType = "skill" | "pipeline" | "chat";

export type TargetKind = "website" | "apk" | "both";

export type ApkAnalysisStatus = "queued" | "running" | "completed" | "failed";

export interface ApkAnalysisLog {
  at: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

export interface ApkAnalysis {
  id: string;
  apkId: string;
  projectId: string;
  status: ApkAnalysisStatus;
  progress: number;
  stage: string | null;
  packageName: string | null;
  appLabel: string | null;
  versionName: string | null;
  versionCode: string | null;
  minSdk: string | null;
  targetSdk: string | null;
  error: string | null;
  logs: ApkAnalysisLog[];
  reportAvailable: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApkUpload {
  id: string;
  projectId: string;
  originalName: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  updatedAt: string;
  analysis: ApkAnalysis | null;
}

export interface Project {
  id: string;
  name: string;
  targetKind: TargetKind;
  targetUrl: string | null;
  description: string;
  features: string;
  techStack: string;
  designPreferences: string;
  additionalRequirements: string;
  createdAt: string;
  updatedAt: string;
  apk?: ApkUpload | null;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillFile {
  path: string;
  content: string;
  size: number;
}

export interface Skill {
  slug: string;
  name: string;
  description: string;
  source: "github" | "bundled" | "cache";
  repoUrl: string;
  commit: string | null;
  instructions: string;
  files: SkillFile[];
  scripts: string[];
  dependencies: string[];
  loadedAt: string;
}

export interface WorkflowRun {
  id: string;
  projectId: string | null;
  type: RunType;
  status: RunStatus;
  skillSlug: string | null;
  title: string;
  requirements: string | null;
  targetUrl: string | null;
  executionMode: string;
  plan: PipelinePlan | null;
  input: Record<string, unknown> | null;
  output: string | null;
  error: string | null;
  demo: boolean;
  estimatedTokens: number;
  pauseRequested: boolean;
  cancelRequested: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface WorkflowStep {
  id: string;
  runId: string;
  skillSlug: string;
  position: number;
  status: StepStatus;
  dependsOn: string[];
  input: Record<string, unknown> | null;
  output: string | null;
  error: string | null;
  tokensUsed: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ExecutionLog {
  id: string;
  runId: string;
  stepId: string | null;
  level: "info" | "warn" | "error" | "success" | "debug";
  message: string;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  projectId: string | null;
  runId: string | null;
  type: string;
  message: string;
  createdAt: string;
}

export interface SkillSummary {
  slug: string;
  name: string;
  description: string;
  source: Skill["source"];
  commit: string | null;
  dependencies: string[];
  fileCount: number;
  scriptCount: number;
  lastRunAt: string | null;
  lastRunStatus: RunStatus | null;
  runCount: number;
}

export interface PipelinePlanStep {
  skillSlug: string;
  name: string;
  position: number;
  dependsOn: string[];
  reason: string;
}

export interface PipelinePlan {
  steps: PipelinePlanStep[];
  order: string[];
  warnings: string[];
  estimatedTokens: number;
  source: "github" | "bundled" | "cache";
  createdAt: string;
}

export interface AiSettings {
  provider: string;
  model: string;
}

export interface AppSettings {
  repoUrl: string;
  aiProvider: string;
  aiModel: string;
  storage: string;
  executionTimeoutMs: number;
  maxOutputTokens: number;
  sandboxMode: string;
  allowDemoMode: boolean;
  updatedAt: string;
}
