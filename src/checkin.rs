//! Platform checkin and balance service
//!
//! NewAPI checkin protocol:
//! - Login: POST /api/user/login  { username, password } → { data: { token, user: { id, quota } } }
//! - Checkin: POST /api/user/checkin  (Cookie: session=<token>)  → { data: { quota: <amount_added> } }
//! - Balance: GET /api/user/self  (Cookie: session=<token> OR Authorization: Bearer <token>)
//!   → { data: { quota: <total>, used_quota: <used> } }
//!
//! Auth method: Cookie "session" + Header "New-Api-User: <user_id>"

use crate::db::DbPool;
use crate::db::checkin::{CheckinLog, PlatformCheckinConfig};
use crate::error::AppResult;
use serde::Deserialize;
use chrono::Utc;

#[derive(Debug, Deserialize)]
struct ApiResponse<T> {
    success: Option<bool>,
    message: Option<String>,
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct CheckinData {
    quota: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct UserData {
    id: Option<i64>,
    quota: Option<f64>,
    used_quota: Option<f64>,
    username: Option<String>,
}

/// Perform checkin for a single platform
pub async fn do_checkin(
    http_client: &reqwest::Client,
    config: &PlatformCheckinConfig,
) -> Result<CheckinLog, String> {
    let session = config.checkin_session.as_deref().ok_or("No session configured")?;
    let user_id = config.checkin_user_id.as_deref().unwrap_or("1");

    let url = format!("{}/api/user/checkin", config.base_url.trim_end_matches('/'));

    let resp = http_client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Cookie", format!("session={}", session))
        .header("New-Api-User", user_id)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = resp.status();
    let body_text = resp.text().await.unwrap_or_default();

    let now = chrono::Utc::now().to_rfc3339();

    if !status.is_success() {
        return Ok(CheckinLog {
            id: 0,
            platform_id: config.id.clone(),
            platform_name: config.name.clone(),
            result: Some(body_text.clone()),
            quota_added: None,
            balance_after: None,
            success: false,
            error_message: Some(format!("HTTP {}: {}", status, &body_text[..body_text.len().min(200)])),
            checked_at: now,
        });
    }

    // Parse response - NewAPI may return different formats
    let result_text = body_text.clone();

    // Try to parse as standard ApiResponse
    let quota_added: Option<f64> = if let Ok(api_resp) = serde_json::from_str::<ApiResponse<serde_json::Value>>(&body_text) {
        if api_resp.success == Some(false) {
            return Ok(CheckinLog {
                id: 0,
                platform_id: config.id.clone(),
                platform_name: config.name.clone(),
                result: Some(result_text),
                quota_added: None,
                balance_after: None,
                success: false,
                error_message: api_resp.message,
                checked_at: now,
            });
        }
        // Extract quota from data
        api_resp.data.and_then(|d| {
            d.get("quota").and_then(|v| v.as_f64())
        })
    } else {
        None
    };

    Ok(CheckinLog {
        id: 0,
        platform_id: config.id.clone(),
        platform_name: config.name.clone(),
        result: Some(result_text),
        quota_added,
        balance_after: None,
        success: true,
        error_message: None,
        checked_at: now,
    })
}

/// Query balance for a single platform
pub async fn query_balance(
    http_client: &reqwest::Client,
    base_url: &str,
    session: &str,
    user_id: &str,
) -> Result<(f64, f64, f64), String> {
    let url = format!("{}/api/user/self", base_url.trim_end_matches('/'));

    let resp = http_client
        .get(&url)
        .header("Content-Type", "application/json")
        .header("Cookie", format!("session={}", session))
        .header("New-Api-User", user_id)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let body = resp.text().await.map_err(|e| format!("Read body failed: {}", e))?;

    let api_resp: ApiResponse<UserData> = serde_json::from_str(&body)
        .map_err(|e| format!("Parse failed: {} - body: {}", e, &body[..body.len().min(200)]))?;

    if api_resp.success == Some(false) {
        return Err(api_resp.message.unwrap_or_else(|| "Unknown error".to_string()));
    }

    let data = api_resp.data.ok_or("No data in response")?;
    let balance = data.quota.unwrap_or(0.0);
    let used = data.used_quota.unwrap_or(0.0);
    // balance = quota - used_quota (remaining)
    let remaining = balance - used;

    Ok((remaining, balance, used))
}

/// Perform checkin for all enabled platforms and record results
pub async fn checkin_all(
    db: &DbPool,
    http_client: &reqwest::Client,
) -> Vec<CheckinLog> {
    let configs = match crate::db::checkin::list_checkin_enabled(db) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Failed to list checkin-enabled platforms: {}", e);
            return vec![];
        }
    };

    let mut results = Vec::new();
    for config in configs {
        if config.checkin_session.is_none() {
            tracing::warn!("Platform {} has checkin enabled but no session configured, skipping", config.name);
            continue;
        }

        tracing::info!("Checking in platform: {} ({})", config.name, config.base_url);
        let log = match do_checkin(http_client, &config).await {
            Ok(mut log) => {
                if log.success {
                    tracing::info!("Checkin success for {}: {:?}", config.name, log.quota_added);
                } else {
                    tracing::warn!("Checkin failed for {}: {:?}", config.name, log.error_message);
                }
                // Try to query balance after checkin
                if let (Some(session), Some(uid)) = (&config.checkin_session, &config.checkin_user_id) {
                    if let Ok((remaining, total, used)) = query_balance(http_client, &config.base_url, session, uid).await {
                        log.balance_after = Some(remaining);
                        let _ = crate::db::checkin::update_balance(db, &config.id, remaining, total, used);
                    }
                }
                log
            }
            Err(e) => {
                tracing::error!("Checkin error for {}: {}", config.name, e);
                CheckinLog {
                    id: 0,
                    platform_id: config.id.clone(),
                    platform_name: config.name.clone(),
                    result: None,
                    quota_added: None,
                    balance_after: None,
                    success: false,
                    error_message: Some(e),
                    checked_at: chrono::Utc::now().to_rfc3339(),
                }
            }
        };

        let _ = crate::db::checkin::record_checkin(db, &log);
        results.push(log);
    }

    results
}

/// Refresh balance for all platforms that have session configured
pub async fn refresh_all_balances(
    db: &DbPool,
    http_client: &reqwest::Client,
) -> Vec<(String, f64, f64, f64)> {
    let configs = match crate::db::checkin::list_checkin_enabled(db) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Failed to list platforms for balance refresh: {}", e);
            return vec![];
        }
    };

    let mut results = Vec::new();
    for config in configs {
        let (session, uid) = match (&config.checkin_session, &config.checkin_user_id) {
            (Some(s), Some(u)) => (s, u),
            _ => continue,
        };

        match query_balance(http_client, &config.base_url, session, uid).await {
            Ok((remaining, total, used)) => {
                let _ = crate::db::checkin::update_balance(db, &config.id, remaining, total, used);
                results.push((config.name, remaining, total, used));
            }
            Err(e) => {
                tracing::warn!("Balance refresh failed for {}: {}", config.name, e);
            }
        }
    }

    results
}
