use crate::error::AppResult;
use crate::db::DbPool;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformKey {
    pub id: String,
    pub platform_id: String,
    pub api_key: String,
    pub weight: i32,
    pub status: String, // "Active" or "Disabled"
    pub fail_count: i64,
    pub last_used: Option<String>,
    pub last_fail: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePlatformKeyRequest {
    pub api_key: String,
    #[serde(default = "default_weight")]
    pub weight: i32,
}

fn default_weight() -> i32 { 1 }

pub fn list_by_platform(pool: &DbPool, platform_id: &str) -> AppResult<Vec<PlatformKey>> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT id, platform_id, api_key, weight, status, fail_count, last_used, last_fail, created_at FROM platform_keys WHERE platform_id = ?1 ORDER BY weight DESC, created_at"
    )?;
    let rows = stmt.query_map([platform_id], |row| {
        Ok(PlatformKey {
            id: row.get(0)?,
            platform_id: row.get(1)?,
            api_key: row.get(2)?,
            weight: row.get(3)?,
            status: row.get(4)?,
            fail_count: row.get(5)?,
            last_used: row.get(6)?,
            last_fail: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Select the next available key for a platform using weighted random selection
pub fn select_key(pool: &DbPool, platform_id: &str) -> AppResult<Option<String>> {
    let keys = list_by_platform(pool, platform_id)?;
    let active: Vec<&PlatformKey> = keys.iter().filter(|k| k.status == "Active").collect();
    if active.is_empty() {
        return Ok(keys.first().map(|k| k.api_key.clone())); // fallback to first key even if disabled
    }
    let total_weight: i32 = active.iter().map(|k| k.weight).sum();
    if total_weight <= 0 {
        return Ok(active.first().map(|k| k.api_key.clone()));
    }
    let mut rng_val = rand::random::<u32>() as i32 % total_weight;
    for key in &active {
        if rng_val < key.weight {
            // Update last_used
            let _ = update_last_used(pool, &key.id);
            return Ok(Some(key.api_key.clone()));
        }
        rng_val -= key.weight;
    }
    let selected = active.last().unwrap();
    let _ = update_last_used(pool, &selected.id);
    Ok(Some(selected.api_key.clone()))
}

pub fn create(pool: &DbPool, platform_id: &str, req: &CreatePlatformKeyRequest) -> AppResult<PlatformKey> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    conn.execute(
        "INSERT INTO platform_keys (id, platform_id, api_key, weight, status, fail_count, created_at) VALUES (?1, ?2, ?3, ?4, 'Active', 0, ?5)",
        rusqlite::params![id, platform_id, req.api_key, req.weight, now],
    )?;
    Ok(PlatformKey {
        id,
        platform_id: platform_id.to_string(),
        api_key: req.api_key.clone(),
        weight: req.weight,
        status: "Active".to_string(),
        fail_count: 0,
        last_used: None,
        last_fail: None,
        created_at: now,
    })
}

pub fn delete(pool: &DbPool, id: &str) -> AppResult<()> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    conn.execute("DELETE FROM platform_keys WHERE id = ?1", [id])?;
    Ok(())
}

fn update_last_used(pool: &DbPool, id: &str) -> AppResult<()> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute("UPDATE platform_keys SET last_used = ?2 WHERE id = ?1", rusqlite::params![id, now])?;
    Ok(())
}

/// Record a key failure, auto-disable after 3 consecutive fails
pub fn record_key_failure(pool: &DbPool, key_id: &str) -> AppResult<()> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE platform_keys SET fail_count = fail_count + 1, last_fail = ?2 WHERE id = ?1",
        rusqlite::params![key_id, now],
    )?;
    conn.execute(
        "UPDATE platform_keys SET status = 'Disabled' WHERE id = ?1 AND fail_count >= 3",
        [key_id],
    )?;
    Ok(())
}

/// Reset fail count on success
pub fn record_key_success(pool: &DbPool, key_id: &str) -> AppResult<()> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    conn.execute(
        "UPDATE platform_keys SET fail_count = 0, status = 'Active' WHERE id = ?1",
        [key_id],
    )?;
    Ok(())
}
