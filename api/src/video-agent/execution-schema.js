// Only additive migrations. Keep Task 2 source storage and old Highlight Studio tables intact.
export const EXECUTION_SCHEMA = `
CREATE TABLE IF NOT EXISTS video_agent_revisions (
    project_id UUID NOT NULL REFERENCES video_agent_projects(id), revision INTEGER NOT NULL,
    parent_revision INTEGER, settings_snapshot JSONB NOT NULL, edit_snapshot JSONB NOT NULL DEFAULT '{}',
    created_by INTEGER NOT NULL REFERENCES users(id), created_at BIGINT NOT NULL,
    PRIMARY KEY(project_id,revision)
);
CREATE TABLE IF NOT EXISTS video_agent_plans (
    id UUID PRIMARY KEY, project_id UUID NOT NULL, revision INTEGER NOT NULL,
    plan JSONB NOT NULL, plan_hash TEXT NOT NULL, source_snapshot JSONB NOT NULL,
    pipeline_version TEXT NOT NULL, created_at BIGINT NOT NULL,
    FOREIGN KEY(project_id,revision) REFERENCES video_agent_revisions(project_id,revision)
);
CREATE TABLE IF NOT EXISTS video_agent_runs (
    id UUID PRIMARY KEY, project_id UUID NOT NULL, base_revision INTEGER NOT NULL,
    plan_id UUID NOT NULL REFERENCES video_agent_plans(id), plan JSONB NOT NULL, plan_hash TEXT NOT NULL,
    source_snapshot JSONB NOT NULL, pipeline_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('queued','planning','awaiting_input','running','cancelling','cancelled','completed','partially_completed','failed')),
    admission_status TEXT NOT NULL DEFAULT 'pending' CHECK(admission_status IN ('pending','admitted','rejected')),
    entitlement_snapshot JSONB, budget_snapshot JSONB, retry_of_run_id UUID REFERENCES video_agent_runs(id),
    requested_count INTEGER NOT NULL, produced_count INTEGER NOT NULL DEFAULT 0,
    error_code TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, completed_at BIGINT,
    FOREIGN KEY(project_id,base_revision) REFERENCES video_agent_revisions(project_id,revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS video_agent_one_active_project_run ON video_agent_runs(project_id)
    WHERE status IN ('queued','planning','awaiting_input','running','cancelling');
CREATE INDEX IF NOT EXISTS video_agent_runs_queue ON video_agent_runs(admission_status,status,created_at);
CREATE INDEX IF NOT EXISTS video_agent_runs_project_recent ON video_agent_runs(project_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS video_agent_steps (
    id UUID PRIMARY KEY, run_id UUID NOT NULL REFERENCES video_agent_runs(id),
    stage TEXT NOT NULL, ordinal INTEGER NOT NULL, scope_id TEXT NOT NULL, dependencies UUID[] NOT NULL,
    input_snapshot JSONB NOT NULL, input_hash TEXT NOT NULL, pipeline_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','ready','running','retry_wait','succeeded','failed','cancelled','skipped')),
    attempt INTEGER NOT NULL DEFAULT 0, checkpoint JSONB NOT NULL DEFAULT '{}', output_refs JSONB NOT NULL DEFAULT '[]',
    reused_step_id UUID REFERENCES video_agent_steps(id), provider TEXT, model TEXT,
    available_at BIGINT NOT NULL, lease_owner TEXT, lease_expires_at BIGINT, fencing_token BIGINT NOT NULL DEFAULT 0,
    error_code TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
    UNIQUE(run_id,stage,scope_id,input_hash)
);
CREATE INDEX IF NOT EXISTS video_agent_steps_queue ON video_agent_steps(status,available_at);
CREATE TABLE IF NOT EXISTS video_agent_commands (
    id UUID PRIMARY KEY, project_id UUID NOT NULL REFERENCES video_agent_projects(id),
    user_id INTEGER NOT NULL REFERENCES users(id), idempotency_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
    expected_revision INTEGER NOT NULL, type TEXT NOT NULL, receipt JSONB NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('accepted','completed')), created_at BIGINT NOT NULL,
    UNIQUE(project_id,user_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS video_agent_events (
    id BIGSERIAL PRIMARY KEY, project_id UUID NOT NULL REFERENCES video_agent_projects(id),
    run_id UUID REFERENCES video_agent_runs(id), type TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1,
    safe_payload JSONB NOT NULL, created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS video_agent_events_project ON video_agent_events(project_id,id);
CREATE INDEX IF NOT EXISTS video_agent_events_retention ON video_agent_events(project_id,created_at);
CREATE TABLE IF NOT EXISTS video_agent_messages (
    id UUID PRIMARY KEY, project_id UUID NOT NULL REFERENCES video_agent_projects(id),
    user_id INTEGER NOT NULL REFERENCES users(id), client_message_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'received'
        CHECK(status IN ('received','processing','awaiting_source','completed','failed')),
    safe_metadata JSONB NOT NULL DEFAULT '{}', created_at BIGINT NOT NULL,
    UNIQUE(project_id,user_id,client_message_id)
);
CREATE INDEX IF NOT EXISTS video_agent_messages_project ON video_agent_messages(project_id,created_at,id);
CREATE INDEX IF NOT EXISTS video_agent_messages_pending ON video_agent_messages(status,created_at) WHERE status='received';
ALTER TABLE video_agent_messages ADD COLUMN IF NOT EXISTS planner_attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE video_agent_messages ADD COLUMN IF NOT EXISTS planner_claim_token UUID;
ALTER TABLE video_agent_messages ADD COLUMN IF NOT EXISTS planner_claim_until BIGINT;
ALTER TABLE video_agent_messages ADD COLUMN IF NOT EXISTS planner_output JSONB;
ALTER TABLE video_agent_messages ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE video_agent_messages DROP CONSTRAINT IF EXISTS video_agent_messages_status_check;
ALTER TABLE video_agent_messages ADD CONSTRAINT video_agent_messages_status_check CHECK(status IN ('received','processing','awaiting_source','completed','failed'));
ALTER TABLE video_agent_sources ADD COLUMN IF NOT EXISTS origin_message_id UUID UNIQUE REFERENCES video_agent_messages(id);
CREATE INDEX IF NOT EXISTS video_agent_sources_origin_message ON video_agent_sources(origin_message_id) WHERE origin_message_id IS NOT NULL;
ALTER TABLE video_agent_projects ADD COLUMN IF NOT EXISTS last_event_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE video_agent_projects ADD COLUMN IF NOT EXISTS event_floor_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE video_agent_projects ADD COLUMN IF NOT EXISTS scheduler_checked_at BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS video_agent_step_attempts (
    id UUID PRIMARY KEY, step_id UUID NOT NULL REFERENCES video_agent_steps(id), attempt INTEGER NOT NULL,
    fencing_token BIGINT NOT NULL, worker_id TEXT NOT NULL, status TEXT NOT NULL,
    error_code TEXT, started_at BIGINT NOT NULL, completed_at BIGINT,
    UNIQUE(step_id,fencing_token)
);
ALTER TABLE video_agent_assets ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES video_agent_runs(id);
ALTER TABLE video_agent_assets ADD COLUMN IF NOT EXISTS step_id UUID REFERENCES video_agent_steps(id);
ALTER TABLE video_agent_assets ADD COLUMN IF NOT EXISTS attempt_token BIGINT;
ALTER TABLE video_agent_assets ADD COLUMN IF NOT EXISTS input_hash TEXT;
CREATE INDEX IF NOT EXISTS video_agent_assets_step ON video_agent_assets(step_id,attempt_token);
`;
