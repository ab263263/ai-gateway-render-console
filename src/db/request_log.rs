use crate::error::AppResult;
use crate::db::DbPool;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestLog {
    pub id: i64,
    pub timestamp: String,
    pub platform_id: Option<String>,
    pub platform_name: Option<String>,
    pub model_id: Option<String>,
    pub proxy_name: Option<String>,
    pub status_code: Option<i32>,
    pub latency_ms: Option<i64>,
    pub token_input: Option<i64>,
    pub token_output: Option<i64>,
    pub error_type: Option<String>,
    pub error_message: Option<String>,
    pub is_stream: bool,
    pub api_key_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogQueryParams {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub platform_id: Option<String>,
    pub model_id: Option<String>,
    pub status_code: Option<i32>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogListResponse {
    pub logs: Vec<RequestLog>,
    pub total: i64,
    pub page: u32,
    pub page_size: u32,
}

pub fn record(pool: &DbPool, log: &RequestLog) -> AppResult<()> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    conn.execute(
        "INSERT INTO request_logs (timestamp, platform_id, platform_name, model_id, proxy_name, status_code, latency_ms, token_input, token_output, error_type, error_message, is_stream, api_key_name) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        rusqlite::params![
            log.timestamp, log.platform_id, log.platform_name, log.model_id, log.proxy_name,
            log.status_code, log.latency_ms, log.token_input, log.token_output,
            log.error_type, log.error_message, log.is_stream as i32, log.api_key_name,
        ],
    )?;
    Ok(())
}

pub fn query(pool: &DbPool, params: &LogQueryParams) -> AppResult<LogListResponse> {
    let conn = pool.get().map_err(|e| crate::error::AppError::Internal(e.to_string()))?;

    let page = params.page.unwrap_or(1).max(1);
    let page_size = params.page_size.unwrap_or(20).min(200);
    let offset = (page - 1) * page_size;

    // Build WHERE clause
    let mut conditions = Vec::new();
    let mut query_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(ref pid) = params.platform_id {
        conditions.push(format!("platform_id = ?{}", idx));
        query_params.push(Box::new(pid.clone()));
        idx += 1;
    }
    if let Some(ref mid) = params.model_id {
        conditions.push(format!("model_id LIKE ?{}", idx));
        query_params.push(Box::new(format!("%{}%", mid)));
        idx += 1;
    }
    if let Some(sc) = params.status_code {
        conditions.push(format!("status_code = ?{}", idx));
        query_params.push(Box::new(sc));
        idx += 1;
    }
    if let Some(ref start) = params.start_time {
        conditions.push(format!("timestamp >= ?{}", idx));
        query_params.push(Box::new(start.clone()));
        idx += 1;
    }
    if let Some(ref end) = params.end_time {
        conditions.push(format!("timestamp <= ?{}", idx));
        query_params.push(Box::new(end.clone()));
        idx += 1;
    }

    let where_clause = if conditions.is_empty() { String::new() } else { format!("WHERE {}", conditions.join(" AND ")) };

    // Count total
    let count_sql = format!("SELECT COUNT(*) FROM request_logs {}", where_clause);
    let total: i64 = conn.query_row(
        &count_sql,
        rusqlite::params_from_iter(query_params.iter().map(|p| p.as_ref())),
        |r| r.get(0),
    ).unwrap_or(0);

    // Fetch page
    let data_sql = format!(
        "SELECT id, timestamp, platform_id, platform_name, model_id, proxy_name, status_code, latency_ms, token_input, token_output, error_type, error_message, is_stream, api_key_name FROM request_logs {} ORDER BY id DESC LIMIT ?{} OFFSET ?{}",
        where_clause, idx, idx + 1
    );
    let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = query_params;
    all_params.push(Box::new(page_size as i64));
    all_params.push(Box::new(offset as i64));

    let mut stmt = conn.prepare(&data_sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(all_params.iter().map(|p| p.as_ref())),
        |row| {
            let is_stream_int: i32 = row.get(12)?;
            Ok(RequestLog {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                platform_id: row.get(2)?,
                platform_name: row.get(3)?,
                model_id: row.get(4)?,
                proxy_name: row.get(5)?,
                status_code: row.get(6)?,
                latency_ms: row.get(7)?,
                token_input: row.get(8)?,
                token_output: row.get(9)?,
                error_type: row.get(10)?,
                error_message: row.get(11)?,
                is_stream: is_stream_int != 0,
                api_key_name: row.get(13)?,
            })
        },
    )?;
    let logs = rows.collect::<Result<Vec<_>, _>>()?;

    Ok(LogListResponse {
        logs,
        total,
        page,
        page_size,
    })
}
