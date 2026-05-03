//! Platform health check background job.
//!
//! Runs every 5 minutes: probes each Active platform with a minimal chat call,
//! updates fail_count/consecutive_fails/auto_disabled, and records latency.

use std::sync::Arc;
use std::time::Instant;
use actix_web::web;
use crate::proxy::handler::ProxyState;

/// Run a one-shot health check for all platforms.
/// Call this from the HTTP endpoint or from the background loop.
pub async fn check_all_platforms(state: Arc<ProxyState>) {
    let platforms = match web::block(move || {
        crate::db::platform::list(&state.db)
    }).await {
        Ok(p) => p,
        Err(e) => {
            tracing::error!("health check: failed to list platforms: {}", e);
            return;
        }
    };

    for platform in platforms.into_iter().filter(|p| p.status == crate::models::platform::PlatformStatus::Active) {
        let platform_id = platform.id.clone();
        let base_url = platform.base_url.clone();
        let api_key = platform.api_key.clone();
        check_single_platform(state, &platform_id, &base_url, &api_key).await;
    }
}

/// Probe one platform: POST /v1/chat/completions with minimal payload.
/// Updates platforms table based on result.
async fn check_single_platform(state: &Arc<ProxyState>, platform_id: &str, base_url: &str, api_key: &str) {
    let start = Instant::now();
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let body = serde_json::json!({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1
    });

    let result = state.http_client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await;

    let latency_ms = start.elapsed().as_millis() as i64;
    let now = chrono::Utc::now().to_rfc3339();

    match result {
        Ok(resp) if resp.status().is_success() => {
            // Success — reset consecutive_fails, record health check time + latency
            tracing::info!(
                "health check OK: platform_id={} latency={}ms",
                platform_id, latency_ms
            );
            web::block(move || {
                crate::db::platform::record_health_success(
                    &state.db, platform_id, &now, latency_ms
                )
            }).await.ok();
        }
        Ok(resp) => {
            // HTTP error (4xx/5xx)
            tracing::warn!(
                "health check FAIL: platform_id={} status={} latency={}ms",
                platform_id, resp.status().as_u16(), latency_ms
            );
            web::block(move || {
                crate::db::platform::record_health_failure(
                    &state.db, platform_id, &now, latency_ms
                )
            }).await.ok();
        }
        Err(e) => {
            // Connection/timeout error
            tracing::warn!(
                "health check ERROR: platform_id={} error={} latency={}ms",
                platform_id, e, latency_ms
            );
            web::block(move || {
                crate::db::platform::record_health_failure(
                    &state.db, platform_id, &now, latency_ms
                )
            }).await.ok();
        }
    }
}

/// Start the background health check loop (runs every 5 minutes).
/// Must be spawned with tokio::spawn on app startup.
pub async fn health_check_loop(proxy_state: Arc<ProxyState>) {
    tracing::info!("health check loop started (interval: 5 minutes)");
    loop {
        check_all_platforms(proxy_state.clone()).await;
        tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
    }
}