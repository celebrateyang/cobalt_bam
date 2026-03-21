-- Clipboard personal session MVP migration (PostgreSQL)
-- Applied-at: 2026-03-21
--
-- Notes:
-- 1) This migration persists user-level personal code + device/audit data.
-- 2) Active WebSocket session state remains runtime-managed (memory/redis).
-- 3) personal_code backfill can be lazy in application logic.

BEGIN;

-- 1) Users: personal fixed session code
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS clipboard_personal_code TEXT;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS clipboard_personal_code_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS clipboard_personal_code_updated_at BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_users_clipboard_personal_code_format'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT chk_users_clipboard_personal_code_format
            CHECK (
                clipboard_personal_code IS NULL
                OR clipboard_personal_code ~ '^[A-Z2-7]{10}$'
            );
    END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clipboard_personal_code
    ON users (clipboard_personal_code)
    WHERE clipboard_personal_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_clipboard_personal_code_updated_at
    ON users (clipboard_personal_code_updated_at DESC);

-- 2) User device registry (for 2-device policy + offline replacement decisions)
CREATE TABLE IF NOT EXISTS user_clipboard_devices (
    id BIGSERIAL PRIMARY KEY,
    clerk_user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_name TEXT,
    platform TEXT NOT NULL DEFAULT 'unknown',
    last_seen_at BIGINT NOT NULL,
    last_ip TEXT,
    last_user_agent TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    UNIQUE (clerk_user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_clipboard_devices_user_seen
    ON user_clipboard_devices (clerk_user_id, last_seen_at DESC);

-- 3) Audit events for operational tracing
CREATE TABLE IF NOT EXISTS clipboard_session_audit_events (
    id BIGSERIAL PRIMARY KEY,
    clerk_user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    session_type TEXT NOT NULL DEFAULT 'personal',
    session_id TEXT,
    device_id TEXT,
    peer_device_id TEXT,
    ip TEXT,
    user_agent TEXT,
    event_at BIGINT NOT NULL,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_clipboard_audit_user_time
    ON clipboard_session_audit_events (clerk_user_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_clipboard_audit_event_type
    ON clipboard_session_audit_events (event_type, event_at DESC);

COMMIT;
