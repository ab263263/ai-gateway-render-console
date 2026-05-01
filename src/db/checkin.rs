use crate::error::AppResult;
use crate::db::DbPool;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckinLog {
    pub id: i64,
    pub platform_id: String,
    pub platform_name: String,
    pub result: Option<String>,
    pub quota_added: Option<f64>,
    pub balance_after: Option<f64>,
    pub success: bool,
    pub error_message: Option<String>,
    pub checked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformCheckinConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub checkin_session: Option<String>,
    pub checkin_user_id: Option<String>,
    pub auto_checkin: bool,
    pub checkin_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformBalanceInfo {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub balance: Option<f64>,
    pub quota: Option<f64>,
    pub used_quota: Option<f64>,
    pub last_balance_check: Option<String>,
    pub last_checkin: Option<String>,
}

/// Get all platforms that have checkin enabled and have session configured
pub fn list_checkin_enabled(pool: &DbPool) -> AppResult<Vec<PlatformCheckinConfig>> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT id, name, base_url, checkin_session, checkin_user_id, COALESCE(auto_checkin,0), COALESCE(checkin_enabled,0) FROM platforms WHERE checkin_enabled = 1"
    )?;
    let rows = stmt.query_map([], |row| {
        let auto: i32 = row.get(5)?;
        let enabled: i32 = row.get(6)?;
        Ok(PlatformCheckinConfig {
            id: row.get(0)?,
            name: row.get(1)?,
            base_url: row.get(2)?,
            checkin_session: row.get(3)?,
            checkin_user_id: row.get(4)?,
            auto_checkin: auto != 0,
            checkin_enabled: enabled != 0,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Get balance info for all platforms
pub fn list_balances(pool: &DbPool) -> AppResult<Vec<PlatformBalanceInfo>> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT id, name, base_url, balance, quota, used_quota, last_balance_check, last_checkin FROM platforms ORDER BY created_at"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PlatformBalanceInfo {
            id: row.get(0)?,
            name: row.get(1)?,
            base_url: row.get(2)?,
            balance: row.get(3)?,
            quota: row.get(4)?,
            used_quota: row.get(5)?,
            last_balance_check: row.get(6)?,
            last_checkin: row.get(7)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Update platform balance after querying the upstream
pub fn update_balance(pool: &DbPool, platform_id: &str, balance: f64, quota: f64, used_quota: f64) -> AppResult<()> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE platforms SET balance = ?2, quota = ?3, used_quota = ?4, last_balance_check = ?5 WHERE id = ?1",
        rusqlite::params![platform_id, balance, quota, used_quota, now],
    )?;
    Ok(())
}

/// Record a checkin result
pub fn record_checkin(pool: &DbPool, log: &CheckinLog) -> AppResult<()> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    conn.execute(
        "INSERT INTO checkin_logs (platform_id, platform_name, result, quota_added, balance_after, success, error_message, checked_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        rusqlite::params![
            log.platform_id, log.platform_name, log.result,
            log.quota_added, log.balance_after, log.success as i32,
            log.error_message, log.checked_at,
        ],
    )?;
    // Update platform last_checkin timestamp
    conn.execute(
        "UPDATE platforms SET last_checkin = ?2 WHERE id = ?1",
        rusqlite::params![log.platform_id, log.checked_at],
    )?;
    Ok(())
}

/// Get checkin logs for a platform
pub fn get_checkin_logs(pool: &DbPool, platform_id: Option<&str>, limit: i64) -> AppResult<Vec<CheckinLog>> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match platform_id {
        Some(pid) => (
            "SELECT id, platform_id, platform_name, result, quota_added, balance_after, success, error_message, checked_at FROM checkin_logs WHERE platform_id = ?1 ORDER BY id DESC LIMIT ?2".to_string(),
            vec![Box::new(pid.to_string()), Box::new(limit)],
        ),
        None => (
            "SELECT id, platform_id, platform_name, result, quota_added, balance_after, success, error_message, checked_at FROM checkin_logs ORDER BY id DESC LIMIT ?1".to_string(),
            vec![Box::new(limit)],
        ),
    };
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
        |row| {
            let success_int: i32 = row.get(6)?;
            Ok(CheckinLog {
                id: row.get(0)?,
                platform_id: row.get(1)?,
                platform_name: row.get(2)?,
                result: row.get(3)?,
                quota_added: row.get(4)?,
                balance_after: row.get(5)?,
                success: success_int != 0,
                error_message: row.get(7)?,
                checked_at: row.get(8)?,
            })
        },
    )?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}
