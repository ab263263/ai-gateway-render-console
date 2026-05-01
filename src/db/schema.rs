use rusqlite::Connection;
use crate::error::AppResult;

pub fn run_migrations(conn: &Connection) -> AppResult<()> {
    // Check current version
    let current_version: i32 = conn.query_row(
        "SELECT value FROM _schema_version WHERE id = 1",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    if current_version < 1 {
        conn.execute_batch(SCHEMA_V1)?;
        conn.execute("CREATE TABLE IF NOT EXISTS _schema_version (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)", [])?;
        conn.execute("INSERT OR REPLACE INTO _schema_version (id, value) VALUES (1, 4)", [])?;
        tracing::info!("Database schema V1 initialized");
    }

    if current_version < 2 {
        conn.execute_batch(SCHEMA_V2_MIGRATION)?;
        conn.execute("INSERT OR REPLACE INTO _schema_version (id, value) VALUES (1, 2)", [])?;
        tracing::info!("Database migrated to V2 (removed listen_port and status from proxies)");
    }

    if current_version < 3 {
        conn.execute_batch(SCHEMA_V3_MIGRATION)?;
        conn.execute("INSERT OR REPLACE INTO _schema_version (id, value) VALUES (1, 3)", [])?;
        tracing::info!("Database migrated to V3 (added api_keys table)");
    }

    if current_version < 4 {
        conn.execute_batch(SCHEMA_V4_MIGRATION)?;
        conn.execute("INSERT OR REPLACE INTO _schema_version (id, value) VALUES (1, 4)", [])?;
        tracing::info!("Database migrated to V4 (simplified proxies, removed virtual_model from routes)");
    }

    if current_version < 5 {
        conn.execute_batch(SCHEMA_V5_MIGRATION)?;
        conn.execute("INSERT OR REPLACE INTO _schema_version (id, value) VALUES (1, 5)", [])?;
        tracing::info!("Database migrated to V5 (backends.model_id now stores model ID string directly)");
    }

    if current_version < 6 {
        conn.execute_batch(SCHEMA_V6_MIGRATION)?;
        // Add health columns to platforms table (ignore if already exist)
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN fail_count INTEGER NOT NULL DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN consecutive_fails INTEGER NOT NULL DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN auto_disabled INTEGER NOT NULL DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN last_health_check TEXT", []);
        conn.execute("INSERT OR REPLACE INTO _schema_version (id, value) VALUES (1, 6)", [])?;
        tracing::info!("Database migrated to V6 (platform_keys, model_aliases, request_logs, platform health)");
    }

    if current_version < 7 {
        conn.execute_batch(SCHEMA_V7_MIGRATION)?;
        // Add checkin/balance columns to platforms table (ignore if already exist)
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN checkin_session TEXT", []);
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN checkin_user_id TEXT", []);
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN auto_checkin INTEGER NOT NULL DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN balance REAL", []);
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN quota REAL", []);
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN used_quota REAL", []);
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN last_checkin TEXT", []);
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN last_balance_check TEXT", []);
        let _ = conn.execute("ALTER TABLE platforms ADD COLUMN checkin_enabled INTEGER NOT NULL DEFAULT 0", []);
        conn.execute("INSERT OR REPLACE INTO _schema_version (id, value) VALUES (1, 7)", [])?;
        tracing::info!("Database migrated to V7 (platform checkin & balance)");
    }

    Ok(())
}

const SCHEMA_V1: &str = r#"
CREATE TABLE IF NOT EXISTS platforms (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    base_url        TEXT NOT NULL,
    api_key         TEXT NOT NULL DEFAULT '',
    organization    TEXT,
    custom_headers  TEXT NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'Active',
    rate_limit      TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS models (
    id              TEXT PRIMARY KEY,
    platform_id     TEXT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    model_id        TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    max_tokens      INTEGER NOT NULL DEFAULT 4096,
    context_window  INTEGER NOT NULL DEFAULT 8192,
    input_price     REAL,
    output_price    REAL,
    capabilities    TEXT NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'Active',
    UNIQUE(platform_id, model_id)
);

CREATE TABLE IF NOT EXISTS proxies (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
    id              TEXT PRIMARY KEY,
    proxy_id        TEXT NOT NULL UNIQUE REFERENCES proxies(id) ON DELETE CASCADE,
    lb_strategy     TEXT NOT NULL DEFAULT 'RoundRobin',
    retry_policy    TEXT NOT NULL DEFAULT '{"max_retries":2,"retry_on_error":["RateLimit","ServerError","Timeout"],"backoff_ms":500}',
    fallback        TEXT
);

CREATE TABLE IF NOT EXISTS backends (
    id              TEXT PRIMARY KEY,
    route_id        TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    platform_id     TEXT NOT NULL REFERENCES platforms(id),
    model_id        TEXT NOT NULL REFERENCES models(id),
    weight          INTEGER NOT NULL DEFAULT 1,
    priority        INTEGER NOT NULL DEFAULT 0,
    max_concurrent  INTEGER,
    status          TEXT NOT NULL DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS request_stats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    proxy_id    TEXT NOT NULL,
    route_id    TEXT NOT NULL,
    backend_id  TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    latency_ms  INTEGER NOT NULL,
    token_input INTEGER,
    token_output INTEGER,
    error_type  TEXT,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stats_proxy ON request_stats(proxy_id);
CREATE INDEX IF NOT EXISTS idx_stats_route ON request_stats(route_id);
CREATE INDEX IF NOT EXISTS idx_stats_backend ON request_stats(backend_id);
CREATE INDEX IF NOT EXISTS idx_stats_created ON request_stats(created_at);

CREATE TABLE IF NOT EXISTS api_keys (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    key         TEXT NOT NULL UNIQUE,
    proxy_id    TEXT REFERENCES proxies(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL,
    last_used   TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_proxy ON api_keys(proxy_id);
"#;

// Migration from V1 to V2: remove listen_port and status from proxies table
const SCHEMA_V2_MIGRATION: &str = r#"
-- Migrate proxies table: remove listen_port and status columns
CREATE TABLE IF NOT EXISTS proxies_new (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    protocols   TEXT NOT NULL DEFAULT '["OpenAI"]',
    auth_token  TEXT,
    created_at  TEXT NOT NULL
);

INSERT OR IGNORE INTO proxies_new (id, name, protocols, auth_token, created_at)
    SELECT id, name, '["OpenAI"]', NULL, created_at FROM proxies;

DROP TABLE IF EXISTS proxies;
ALTER TABLE proxies_new RENAME TO proxies;
"#;

// Migration V3: add api_keys table
const SCHEMA_V3_MIGRATION: &str = r#"
CREATE TABLE IF NOT EXISTS api_keys (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    key         TEXT NOT NULL UNIQUE,
    proxy_id    TEXT REFERENCES proxies(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL,
    last_used   TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_proxy ON api_keys(proxy_id);
"#;

// Migration V4: simplify proxies (remove protocols, auth_token), simplify routes (remove virtual_model, proxy_id UNIQUE)
const SCHEMA_V4_MIGRATION: &str = r#"
-- Simplify proxies table: remove protocols and auth_token columns, add UNIQUE on name
CREATE TABLE IF NOT EXISTS proxies_new (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL
);

INSERT OR IGNORE INTO proxies_new (id, name, created_at)
    SELECT id, name, created_at FROM proxies;

DROP TABLE IF EXISTS proxies;
ALTER TABLE proxies_new RENAME TO proxies;

-- Simplify routes table: remove virtual_model, make proxy_id UNIQUE (1:1)
CREATE TABLE IF NOT EXISTS routes_new (
    id              TEXT PRIMARY KEY,
    proxy_id        TEXT NOT NULL UNIQUE REFERENCES proxies(id) ON DELETE CASCADE,
    lb_strategy     TEXT NOT NULL DEFAULT 'RoundRobin',
    retry_policy    TEXT NOT NULL DEFAULT '{"max_retries":2,"retry_on_error":["RateLimit","ServerError","Timeout"],"backoff_ms":500}',
    fallback        TEXT
);

INSERT OR IGNORE INTO routes_new (id, proxy_id, lb_strategy, retry_policy, fallback)
    SELECT id, proxy_id, lb_strategy, retry_policy, fallback FROM routes;

DROP TABLE IF EXISTS routes;
ALTER TABLE routes_new RENAME TO routes;
"#;

// Migration V5: backends.model_id now stores the actual model ID string (e.g. "gpt-4o") instead of FK to models table
// Added capabilities column to backends
const SCHEMA_V5_MIGRATION: &str = r#"
-- Rebuild backends table: model_id stores model string directly, add capabilities column
CREATE TABLE IF NOT EXISTS backends_new (
    id              TEXT PRIMARY KEY,
    route_id        TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    platform_id     TEXT NOT NULL REFERENCES platforms(id),
    model_id        TEXT NOT NULL,
    weight          INTEGER NOT NULL DEFAULT 1,
    priority        INTEGER NOT NULL DEFAULT 0,
    max_concurrent  INTEGER,
    capabilities    TEXT NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'Active'
);

-- Copy data, converting model_id from UUID reference to actual model_id string
INSERT OR IGNORE INTO backends_new (id, route_id, platform_id, model_id, weight, priority, max_concurrent, capabilities, status)
    SELECT b.id, b.route_id, b.platform_id,
           COALESCE(m.model_id, b.model_id),
           b.weight, b.priority, b.max_concurrent,
           COALESCE(m.capabilities, '[]'),
           b.status
    FROM backends b
    LEFT JOIN models m ON b.model_id = m.id;

DROP TABLE IF EXISTS backends;
ALTER TABLE backends_new RENAME TO backends;
"#;

// Migration V6: platform_keys (multi-key), model_aliases, request_logs, platform health fields
const SCHEMA_V6_MIGRATION: &str = r#"
-- Multi-key support: each platform can have multiple API keys
CREATE TABLE IF NOT EXISTS platform_keys (
    id              TEXT PRIMARY KEY,
    platform_id     TEXT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    api_key         TEXT NOT NULL,
    weight          INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'Active',
    fail_count      INTEGER NOT NULL DEFAULT 0,
    last_used       TEXT,
    last_fail       TEXT,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_keys_platform ON platform_keys(platform_id);
CREATE INDEX IF NOT EXISTS idx_platform_keys_status ON platform_keys(status);

-- Model alias/mapping support
CREATE TABLE IF NOT EXISTS model_aliases (
    id              TEXT PRIMARY KEY,
    alias           TEXT NOT NULL UNIQUE,
    actual_model_id TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_model_aliases_alias ON model_aliases(alias);

-- Detailed request logs
CREATE TABLE IF NOT EXISTS request_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT NOT NULL,
    platform_id     TEXT,
    platform_name   TEXT,
    model_id        TEXT,
    proxy_name      TEXT,
    status_code     INTEGER,
    latency_ms      INTEGER,
    token_input     INTEGER,
    token_output    INTEGER,
    error_type      TEXT,
    error_message   TEXT,
    is_stream       INTEGER NOT NULL DEFAULT 0,
    api_key_name    TEXT
);

CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_request_logs_platform ON request_logs(platform_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_status ON request_logs(status_code);

-- Add health check fields to platforms
-- SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS, so we use a safe approach
-- These columns are added conditionally in the migration code
"#;

// Migration V7: platform checkin & balance support
const SCHEMA_V7_MIGRATION: &str = r#"
-- checkin_session: session cookie value for NewAPI auth
-- checkin_user_id: user id for NewAPI auth header
-- auto_checkin: 1=enabled, 0=disabled
-- checkin_enabled: 1=platform supports checkin, 0=not applicable
-- balance/quota/used_quota: cached balance info
-- last_checkin/last_balance_check: timestamps
-- Columns added conditionally in migration code above
CREATE TABLE IF NOT EXISTS checkin_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_id     TEXT NOT NULL,
    platform_name   TEXT NOT NULL,
    result          TEXT,
    quota_added     REAL,
    balance_after   REAL,
    success         INTEGER NOT NULL DEFAULT 0,
    error_message   TEXT,
    checked_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkin_logs_platform ON checkin_logs(platform_id);
CREATE INDEX IF NOT EXISTS idx_checkin_logs_checked_at ON checkin_logs(checked_at);
"#;
