-- Optional Postgres mirror for APK targets. Runtime still uses SQLite by default.
alter table projects
  add column if not exists target_kind text not null default 'website';

create table if not exists apk_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  original_name text not null,
  storage_key text not null unique,
  size_bytes bigint not null,
  sha256 text not null,
  mime_type text not null default 'application/vnd.android.package-archive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_apk_uploads_project on apk_uploads(project_id);

create table if not exists apk_analyses (
  id uuid primary key default gen_random_uuid(),
  apk_id uuid not null unique references apk_uploads(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  status text not null,
  progress integer not null default 0,
  stage text,
  package_name text,
  app_label text,
  version_name text,
  version_code text,
  min_sdk text,
  target_sdk text,
  manifest_json jsonb,
  structure_json jsonb,
  resources_json jsonb,
  report_json jsonb,
  report_text text,
  logs_json jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_apk_analyses_project on apk_analyses(project_id);
create index if not exists idx_apk_analyses_status on apk_analyses(status, updated_at);
