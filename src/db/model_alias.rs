use crate::error::AppResult;
use crate::db::DbPool;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelAlias {
    pub id: String,
    pub alias: String,
    pub actual_model_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateModelAliasRequest {
    pub alias: String,
    pub actual_model_id: String,
}

pub fn list_all(pool: &DbPool) -> AppResult<Vec<ModelAlias>> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT id, alias, actual_model_id, created_at FROM model_aliases ORDER BY alias"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ModelAlias {
            id: row.get(0)?,
            alias: row.get(1)?,
            actual_model_id: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Resolve an alias to the actual model ID. Returns None if no alias exists.
pub fn resolve(pool: &DbPool, model_name: &str) -> AppResult<Option<String>> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    let result = conn.query_row(
        "SELECT actual_model_id FROM model_aliases WHERE alias = ?1",
        [model_name],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(actual) => Ok(Some(actual)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn create(pool: &DbPool, req: &CreateModelAliasRequest) -> AppResult<ModelAlias> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    conn.execute(
        "INSERT INTO model_aliases (id, alias, actual_model_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, req.alias, req.actual_model_id, now],
    )?;
    Ok(ModelAlias {
        id,
        alias: req.alias.clone(),
        actual_model_id: req.actual_model_id.clone(),
        created_at: now,
    })
}

pub fn delete(pool: &DbPool, id: &str) -> AppResult<()> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    conn.execute("DELETE FROM model_aliases WHERE id = ?1", [id])?;
    Ok(())
}
