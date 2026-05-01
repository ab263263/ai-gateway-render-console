use crate::error::AppResult;
use crate::models::platform::*;
use crate::db::DbPool;

const SELECT_COLUMNS: &str = "id, name, type, base_url, api_key, organization, custom_headers, status, rate_limit, created_at, updated_at, COALESCE(fail_count,0), COALESCE(consecutive_fails,0), COALESCE(auto_disabled,0), last_health_check, checkin_session, checkin_user_id, COALESCE(auto_checkin,0), COALESCE(checkin_enabled,0), balance, quota, used_quota, last_checkin, last_balance_check";

fn row_to_platform(row: &rusqlite::Row) -> rusqlite::Result<Platform> {
    let rate_limit_str: Option<String> = row.get(8)?;
    let auto_disabled_int: i32 = row.get(13)?;
    let auto_checkin_int: i32 = row.get(18)?;
    let checkin_enabled_int: i32 = row.get(19)?;
    Ok(Platform {
        id: row.get(0)?,
        name: row.get(1)?,
        platform_type: serde_json::from_str::<PlatformType>(&row.get::<_, String>(2)?).unwrap_or(PlatformType::OpenAI),
        base_url: row.get(3)?,
        api_key: row.get(4)?,
        organization: row.get(5)?,
        custom_headers: serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(6)?).unwrap_or(serde_json::Value::Object(Default::default())),
        status: serde_json::from_str::<PlatformStatus>(&row.get::<_, String>(7)?).unwrap_or(PlatformStatus::Active),
        rate_limit: rate_limit_str.and_then(|s| serde_json::from_str::<RateLimit>(&s).ok()),
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        fail_count: row.get(11)?,
        consecutive_fails: row.get(12)?,
        auto_disabled: auto_disabled_int != 0,
        last_health_check: row.get(14)?,
        checkin_session: row.get(15)?,
        checkin_user_id: row.get(16)?,
        auto_checkin: auto_checkin_int != 0,
        checkin_enabled: checkin_enabled_int != 0,
        balance: row.get(20)?,
        quota: row.get(21)?,
        used_quota: row.get(22)?,
        last_checkin: row.get(23)?,
        last_balance_check: row.get(24)?,
    })
}

pub fn list(pool: &DbPool) -> AppResult<Vec<Platform>> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let sql = format!("SELECT {} FROM platforms ORDER BY created_at", SELECT_COLUMNS);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], row_to_platform)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn get(pool: &DbPool, id: &str) -> AppResult<Platform> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let sql = format!("SELECT {} FROM platforms WHERE id = ?1", SELECT_COLUMNS);
    conn.query_row(&sql, [id], row_to_platform).map_err(Into::into)
}

pub fn create(pool: &DbPool, req: &CreatePlatformRequest) -> AppResult<Platform> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    conn.execute(
        "INSERT INTO platforms (id, name, type, base_url, api_key, organization, custom_headers, status, rate_limit, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            id,
            req.name,
            serde_json::to_string(&req.platform_type)?,
            req.base_url,
            req.api_key,
            req.organization,
            serde_json::to_string(&req.custom_headers)?,
            serde_json::to_string(&PlatformStatus::Active)?,
            None::<String>,
            now,
            now,
        ],
    )?;

    get(pool, &id)
}

pub fn update(pool: &DbPool, id: &str, req: &UpdatePlatformRequest) -> AppResult<Platform> {
    let mut platform = get(pool, id)?;
    if let Some(name) = &req.name { platform.name = name.clone(); }
    if let Some(pt) = &req.platform_type { platform.platform_type = pt.clone(); }
    if let Some(url) = &req.base_url { platform.base_url = url.clone(); }
    if let Some(key) = &req.api_key { platform.api_key = key.clone(); }
    if let Some(org) = &req.organization { platform.organization = Some(org.clone()); }
    if let Some(hdrs) = &req.custom_headers { platform.custom_headers = hdrs.clone(); }
    if let Some(status) = &req.status { platform.status = status.clone(); }
    if let Some(session) = &req.checkin_session { platform.checkin_session = Some(session.clone()); }
    if let Some(uid) = &req.checkin_user_id { platform.checkin_user_id = Some(uid.clone()); }
    if let Some(ac) = req.auto_checkin { platform.auto_checkin = ac; }
    if let Some(ce) = req.checkin_enabled { platform.checkin_enabled = ce; }
    platform.updated_at = chrono::Utc::now().to_rfc3339();

    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    conn.execute(
        "UPDATE platforms SET name=?2, type=?3, base_url=?4, api_key=?5, organization=?6, custom_headers=?7, status=?8, updated_at=?9, checkin_session=?10, checkin_user_id=?11, auto_checkin=?12, checkin_enabled=?13 WHERE id=?1",
        rusqlite::params![
            id, platform.name, serde_json::to_string(&platform.platform_type)?,
            platform.base_url, platform.api_key, platform.organization,
            serde_json::to_string(&platform.custom_headers)?,
            serde_json::to_string(&platform.status)?, platform.updated_at,
            platform.checkin_session, platform.checkin_user_id,
            platform.auto_checkin as i32, platform.checkin_enabled as i32,
        ],
    )?;
    Ok(platform)
}

pub fn delete(pool: &DbPool, id: &str) -> AppResult<()> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    conn.execute("DELETE FROM platforms WHERE id = ?1", [id])?;
    Ok(())
}

/// Increment fail count for a platform, auto-disable if threshold exceeded
pub fn record_failure(pool: &DbPool, platform_id: &str) -> AppResult<()> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    conn.execute(
        "UPDATE platforms SET fail_count = fail_count + 1, consecutive_fails = consecutive_fails + 1, updated_at = ?2 WHERE id = ?1",
        rusqlite::params![platform_id, chrono::Utc::now().to_rfc3339()],
    )?;
    // Auto-disable after 5 consecutive failures
    conn.execute(
        "UPDATE platforms SET auto_disabled = 1, status = '\"Disabled\"' WHERE id = ?1 AND consecutive_fails >= 5 AND auto_disabled = 0",
        [platform_id],
    )?;
    Ok(())
}

/// Reset consecutive fail count on success
pub fn record_success(pool: &DbPool, platform_id: &str) -> AppResult<()> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    conn.execute(
        "UPDATE platforms SET consecutive_fails = 0, auto_disabled = 0, status = '\"Active\"', updated_at = ?2 WHERE id = ?1",
        rusqlite::params![platform_id, chrono::Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

/// Update health check timestamp
pub fn update_health_check(pool: &DbPool, platform_id: &str) -> AppResult<()> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE platforms SET last_health_check = ?2 WHERE id = ?1",
        rusqlite::params![platform_id, now],
    )?;
    Ok(())
}

/// Get all auto-disabled platforms for health check
pub fn list_auto_disabled(pool: &DbPool) -> AppResult<Vec<Platform>> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let sql = format!("SELECT {} FROM platforms WHERE auto_disabled = 1", SELECT_COLUMNS);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], row_to_platform)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}
