-- Optional Supabase/Postgres schema for Replica Studio.
-- The personal MVP uses local SQLite by default. This migration mirrors the
-- durable models and can back a hosted multi-user deployment.

create extension if not exists "pgcrypto";

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_url text,
  description text not null default '',
  features text not null default '',
  tech_stack text not null default '',
  design_preferences text not null default '',
  additional_requirements text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  path text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, path)
);
create index if not exists idx_project_files_project on project_files(project_id);

create table if not exists skills (
  slug text primary key,
  name text not null,
  description text not null default '',
  source text not null,
  repo_url text not null,
  commit_sha text,
  instructions text not null,
  files_json jsonb not null default '[]'::jsonb,
  scripts_json jsonb not null default '[]'::jsonb,
  dependencies_json jsonb not null default '[]'::jsonb,
  loaded_at timestamptz not null default now()
);

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  type text not null,
  status text not null,
  skill_slug text,
  title text not null,
  requirements text,
  target_url text,
  execution_mode text not null default 'standard',
  plan_json jsonb,
  input_json jsonb,
  output text,
  error text,
  demo boolean not null default false,
  estimated_tokens integer not null default 0,
  pause_requested boolean not null default false,
  cancel_requested boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_runs_project on workflow_runs(project_id);
create index if not exists idx_runs_created on workflow_runs(created_at desc);

create table if not exists workflow_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references workflow_runs(id) on delete cascade,
  skill_slug text not null,
  position integer not null,
  status text not null,
  depends_on_json jsonb not null default '[]'::jsonb,
  input_json jsonb,
  output text,
  error text,
  tokens_used integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  unique(run_id, position)
);
create index if not exists idx_steps_run on workflow_steps(run_id);

create table if not exists execution_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references workflow_runs(id) on delete cascade,
  step_id uuid,
  level text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_logs_run on execution_logs(run_id, created_at);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  run_id uuid,
  type text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_activities_created on activities(created_at desc);

create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists script_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  skill_slug text not null,
  script_path text not null,
  approved_at timestamptz not null default now(),
  unique(project_id, skill_slug, script_path)
);

-- Row level security is intentionally left to the deployment's auth model.
-- If you expose Supabase directly to clients, enable RLS and add owner columns
-- plus policies before granting anon/authenticated access. The MVP API keeps
-- the database server-side only.
