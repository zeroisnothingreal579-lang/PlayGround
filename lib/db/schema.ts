export const SCHEMA_VERSION = 2;

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_kind TEXT NOT NULL DEFAULT 'website',
  target_url TEXT,
  description TEXT NOT NULL DEFAULT '',
  features TEXT NOT NULL DEFAULT '',
  tech_stack TEXT NOT NULL DEFAULT '',
  design_preferences TEXT NOT NULL DEFAULT '',
  additional_requirements TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, path)
);
CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);

CREATE TABLE IF NOT EXISTS skills (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  commit_sha TEXT,
  instructions TEXT NOT NULL,
  files_json TEXT NOT NULL,
  scripts_json TEXT NOT NULL,
  dependencies_json TEXT NOT NULL,
  loaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  skill_slug TEXT,
  title TEXT NOT NULL,
  requirements TEXT,
  target_url TEXT,
  execution_mode TEXT NOT NULL DEFAULT 'standard',
  plan_json TEXT,
  input_json TEXT,
  output TEXT,
  error TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  estimated_tokens INTEGER NOT NULL DEFAULT 0,
  pause_requested INTEGER NOT NULL DEFAULT 0,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_project ON workflow_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_created ON workflow_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  skill_slug TEXT NOT NULL,
  position INTEGER NOT NULL,
  status TEXT NOT NULL,
  depends_on_json TEXT NOT NULL DEFAULT '[]',
  input_json TEXT,
  output TEXT,
  error TEXT,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(run_id, position)
);
CREATE INDEX IF NOT EXISTS idx_steps_run ON workflow_steps(run_id);

CREATE TABLE IF NOT EXISTS execution_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_id TEXT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_run ON execution_logs(run_id, created_at);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  run_id TEXT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS script_approvals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  skill_slug TEXT NOT NULL,
  script_path TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  UNIQUE(project_id, skill_slug, script_path)
);

CREATE TABLE IF NOT EXISTS apk_uploads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/vnd.android.package-archive',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apk_uploads_project ON apk_uploads(project_id);

CREATE TABLE IF NOT EXISTS apk_analyses (
  id TEXT PRIMARY KEY,
  apk_id TEXT NOT NULL UNIQUE REFERENCES apk_uploads(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  stage TEXT,
  package_name TEXT,
  app_label TEXT,
  version_name TEXT,
  version_code TEXT,
  min_sdk TEXT,
  target_sdk TEXT,
  manifest_json TEXT,
  structure_json TEXT,
  resources_json TEXT,
  report_json TEXT,
  report_text TEXT,
  logs_json TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apk_analyses_project ON apk_analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_apk_analyses_status ON apk_analyses(status, updated_at);
`;
