use actix_web::{web, HttpRequest, HttpResponse};
use futures::StreamExt;
use std::sync::Arc;
use std::time::Instant;

use crate::db::DbPool;
use crate::error::AppError;
use crate::lb::BackendSelector;
use crate::models::route::ErrorType;
use crate::models::stats::RequestStat;
use crate::protocol::{openai, anthropic, types::UnifiedRequest};
use crate::config::AppConfig;

pub struct ProxyState {
    pub db: DbPool,
    pub config: AppConfig,
    pub selector: Arc<BackendSelector>,
    pub http_client: reqwest::Client,
}

fn extract_auth(req: &HttpRequest) -> Option<String> {
    req.headers().get("Authorization").and_then(|v| v.to_str().ok())
        .map(|v| v.strip_prefix("Bearer ").unwrap_or(v).to_string())
        .or_else(|| req.headers().get("x-api-key").and_then(|v| v.to_str().ok()).map(String::from))
}

/// Validate auth using api_keys table. If no api_keys exist at all, allow access.
fn validate_auth(db: &DbPool, auth: &Option<String>) -> Result<Option<String>, AppError> {
    let keys = crate::db::api_key::list(db).map_err(|e| AppError::Internal(e.to_string()))?;

    // If no API keys configured at all, allow all access
    if keys.is_empty() {
        return Ok(None);
    }

    // Otherwise, require a valid key
    let auth_key = auth.as_deref().ok_or_else(|| AppError::BadRequest("API key required".to_string()))?;
    let ak = crate::db::api_key::get_by_key(db, auth_key)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    match ak {
        Some(api_key) => {
            let _ = crate::db::api_key::update_last_used(db, &api_key.id);
            Ok(Some(api_key.name))
        }
        None => Err(AppError::BadRequest("Invalid API key".to_string())),
    }
}

/// Global OpenAI-compatible endpoint: POST /v1/chat/completions
pub async fn openai_chat_completions(
    state: web::Data<Arc<ProxyState>>, req: HttpRequest, body: web::Json<serde_json::Value>,
) -> Result<HttpResponse, AppError> {
    let auth = extract_auth(&req);
    let db = state.db.clone();
    let api_key_name = web::block(move || validate_auth(&db, &auth))
        .await.map_err(|e| AppError::Internal(e.to_string()))??;

    let unified = openai::parse_request(body.into_inner()).map_err(AppError::BadRequest)?;
    handle_request(&state, unified, crate::models::proxy::Protocol::OpenAI, api_key_name).await
}

/// Global Anthropic-compatible endpoint: POST /v1/messages
pub async fn anthropic_messages(
    state: web::Data<Arc<ProxyState>>, req: HttpRequest, body: web::Json<serde_json::Value>,
) -> Result<HttpResponse, AppError> {
    let auth = extract_auth(&req);
    let db = state.db.clone();
    let api_key_name = web::block(move || validate_auth(&db, &auth))
        .await.map_err(|e| AppError::Internal(e.to_string()))??;

    let unified = anthropic::parse_request(body.into_inner()).map_err(AppError::BadRequest)?;
    handle_request(&state, unified, crate::models::proxy::Protocol::Anthropic, api_key_name).await
}

/// List available models (virtual model names)
pub async fn openai_list_models(
    state: web::Data<Arc<ProxyState>>, req: HttpRequest,
) -> Result<HttpResponse, AppError> {
    let auth = extract_auth(&req);
    let db = state.db.clone();
    web::block(move || validate_auth(&db, &auth).map(|_| ()))
        .await.map_err(|e| AppError::Internal(e.to_string()))??;

    let db = state.db.clone();
    let proxies = web::block(move || crate::db::proxy::list(&db))
        .await.map_err(|e| AppError::Internal(e.to_string()))??;
    let models: Vec<String> = proxies.iter().map(|p| p.name.clone()).collect();
    Ok(HttpResponse::Ok().json(openai::models_list(&models)))
}

fn record_stat(db: &DbPool, proxy_id: &str, route_id: &str, backend_id: &str,
               status_code: i32, latency_ms: i64, token_input: Option<i64>, token_output: Option<i64>,
               error_type: Option<String>) {
    let stat = RequestStat {
        id: 0,
        proxy_id: proxy_id.to_string(),
        route_id: route_id.to_string(),
        backend_id: backend_id.to_string(),
        status_code,
        latency_ms,
        token_input,
        token_output,
        error_type,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    if let Err(e) = crate::db::stats::record(db, &stat) {
        tracing::warn!("Failed to record stat: {}", e);
    }
}

fn record_request_log(db: &DbPool, platform_id: Option<&str>, platform_name: Option<&str>,
                       model_id: Option<&str>, proxy_name: Option<&str>,
                       status_code: Option<i32>, latency_ms: Option<i64>,
                       token_input: Option<i64>, token_output: Option<i64>,
                       error_type: Option<&str>, error_message: Option<&str>,
                       is_stream: bool, api_key_name: Option<&str>) {
    let log = crate::db::request_log::RequestLog {
        id: 0,
        timestamp: chrono::Utc::now().to_rfc3339(),
        platform_id: platform_id.map(String::from),
        platform_name: platform_name.map(String::from),
        model_id: model_id.map(String::from),
        proxy_name: proxy_name.map(String::from),
        status_code,
        latency_ms,
        token_input,
        token_output,
        error_type: error_type.map(String::from),
        error_message: error_message.map(String::from),
        is_stream,
        api_key_name: api_key_name.map(String::from),
    };
    if let Err(e) = crate::db::request_log::record(db, &log) {
        tracing::warn!("Failed to record request log: {}", e);
    }
}

/// Resolve model name: check aliases first, then return original name
fn resolve_model_name(db: &DbPool, model_name: &str) -> String {
    match crate::db::model_alias::resolve(db, model_name) {
        Ok(Some(actual)) => {
            tracing::info!("Model alias resolved: {} -> {}", model_name, actual);
            actual
        }
        Ok(None) => model_name.to_string(),
        Err(_) => model_name.to_string(),
    }
}

async fn handle_request(
    state: &Arc<ProxyState>,
    mut unified: UnifiedRequest, response_protocol: crate::models::proxy::Protocol,
    api_key_name: Option<String>,
) -> Result<HttpResponse, AppError> {
    // Resolve model alias before routing
    let db = state.db.clone();
    let original_model = unified.model.clone();
    let resolved_model = web::block(move || resolve_model_name(&db, &original_model))
        .await.map_err(|e| AppError::Internal(e.to_string()))?;
    unified.model = resolved_model;

    let virtual_model = unified.model.clone();
    let is_stream = unified.stream.unwrap_or(false);

    // Find the proxy (virtual model) by name
    let db = state.db.clone();
    let vm = virtual_model.clone();
    let proxy = web::block(move || crate::db::proxy::get_by_name(&db, &vm))
        .await.map_err(|e| AppError::Internal(e.to_string()))??
        .ok_or_else(|| AppError::NotFound(format!("Model '{}' not found", virtual_model)))?;

    // Find the route for this proxy
    let db = state.db.clone();
    let proxy_id = proxy.id.clone();
    let route = web::block(move || crate::db::route::get_by_proxy(&db, &proxy_id))
        .await.map_err(|e| AppError::Internal(e.to_string()))??
        .ok_or_else(|| AppError::NotFound(format!("No route configured for model '{}'", virtual_model)))?;

    let max_retries = route.retry_policy.max_retries;
    let mut last_error: Option<String> = None;
    let mut last_error_type: Option<String> = None;
    let start_total = Instant::now();

    for attempt in 0..=max_retries {
        let backend = state.selector.select(&route.id, &route.backends, &route.lb_strategy)
            .ok_or_else(|| AppError::Internal("No available backend".to_string()))?;

        let db = state.db.clone();
        let platform_id = backend.platform_id.clone();
        let platform = web::block(move || crate::db::platform::get(&db, &platform_id))
            .await.map_err(|e| AppError::Internal(e.to_string()))??;

        // Skip auto-disabled platforms
        if platform.auto_disabled && attempt < max_retries {
            tracing::warn!("Skipping auto-disabled platform: {}", platform.name);
            continue;
        }

        let model_id_str = backend.model_id.clone();
        let platform_name = platform.name.clone();

        // Try multi-key first, fall back to platform.api_key
        let db_for_key = state.db.clone();
        let pid_for_key = backend.platform_id.clone();
        let api_key_for_request = web::block(move || {
            // Try to select from platform_keys
            match crate::db::platform_key::select_key(&db_for_key, &pid_for_key) {
                Ok(Some(key)) => Ok(key),
                _ => Ok(platform.api_key.clone()),
            }
        }).await.map_err(|e| AppError::Internal(e.to_string()))??;

        state.selector.inc_connection(&route.id, &backend.id);
        let start = Instant::now();

        let (forward_body, forward_url) = build_forward_request(&unified, &platform, &model_id_str);

        let mut req_builder = state.http_client.post(&forward_url)
            .timeout(std::time::Duration::from_secs(state.config.defaults.request_timeout_secs))
            .header("Content-Type", "application/json");

        if !api_key_for_request.is_empty() {
            match platform.platform_type {
                crate::models::platform::PlatformType::Anthropic => {
                    req_builder = req_builder.header("x-api-key", &api_key_for_request).header("anthropic-version", "2023-06-01");
                }
                _ => { req_builder = req_builder.header("Authorization", format!("Bearer {}", api_key_for_request)); }
            }
        }
        if let Some(headers) = platform.custom_headers.as_object() {
            for (k, v) in headers { if let Some(vs) = v.as_str() { req_builder = req_builder.header(k.as_str(), vs); } }
        }

        let result = req_builder.json(&forward_body).send().await;
        state.selector.dec_connection(&route.id, &backend.id);
        let latency_ms = start.elapsed().as_millis() as i64;

        match result {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    // Record platform success for health tracking
                    let db_health = state.db.clone();
                    let pid_health = backend.platform_id.clone();
                    web::block(move || crate::db::platform::record_success(&db_health, &pid_health)).await.ok();

                    if is_stream {
                        let db = state.db.clone();
                        let pid = proxy.id.clone();
                        let rid = route.id.clone();
                        let bid = backend.id.clone();
                        web::block(move || record_stat(&db, &pid, &rid, &bid, 200, latency_ms, None, None, None)).await.ok();

                        // Record request log for stream (token counts will be unknown)
                        let db_log = state.db.clone();
                        let p_id = backend.platform_id.clone();
                        let p_name = platform_name.clone();
                        let m_id = model_id_str.clone();
                        let px_name = proxy.name.clone();
                        let ak_name = api_key_name.clone();
                        web::block(move || record_request_log(&db_log, Some(&p_id), Some(&p_name), Some(&m_id), Some(&px_name), Some(200), Some(latency_ms), None, None, None, None, true, ak_name.as_deref())).await.ok();

                        return Ok(handle_stream(resp).await);
                    }
                    let body = resp.bytes().await.map_err(|e| AppError::Internal(e.to_string()))?;
                    let raw: serde_json::Value = serde_json::from_slice(&body).unwrap_or_default();
                    let ur = match platform.platform_type {
                        crate::models::platform::PlatformType::Anthropic => anthropic::parse_response(raw).map_err(AppError::Internal)?,
                        _ => openai::parse_response(raw).map_err(AppError::Internal)?,
                    };

                    let token_input = ur.usage.as_ref().map(|u| u.prompt_tokens as i64);
                    let token_output = ur.usage.as_ref().map(|u| u.completion_tokens as i64);

                    let db = state.db.clone();
                    let pid = proxy.id.clone();
                    let rid = route.id.clone();
                    let bid = backend.id.clone();
                    web::block(move || record_stat(&db, &pid, &rid, &bid, 200, latency_ms, token_input, token_output, None)).await.ok();

                    // Record request log
                    let db_log = state.db.clone();
                    let p_id = backend.platform_id.clone();
                    let p_name = platform_name.clone();
                    let m_id = model_id_str.clone();
                    let px_name = proxy.name.clone();
                    let ak_name = api_key_name.clone();
                    web::block(move || record_request_log(&db_log, Some(&p_id), Some(&p_name), Some(&m_id), Some(&px_name), Some(200), Some(latency_ms), token_input, token_output, None, None, false, ak_name.as_deref())).await.ok();

                    let cr = match response_protocol { crate::models::proxy::Protocol::Anthropic => anthropic::to_response(&ur), _ => openai::to_response(&ur) };
                    return Ok(HttpResponse::Ok().json(cr));
                } else {
                    let eb = resp.text().await.unwrap_or_default();
                    let status_code = status.as_u16() as i32;
                    let et = format!("{:?}", classify_error(status.as_u16()));

                    // Record platform failure for health tracking
                    let db_health = state.db.clone();
                    let pid_health = backend.platform_id.clone();
                    web::block(move || crate::db::platform::record_failure(&db_health, &pid_health)).await.ok();

                    let db = state.db.clone();
                    let pid = proxy.id.clone();
                    let rid = route.id.clone();
                    let bid = backend.id.clone();
                    web::block(move || record_stat(&db, &pid, &rid, &bid, status_code, latency_ms, None, None, Some(et.clone()))).await.ok();

                    // Record request log
                    let db_log = state.db.clone();
                    let p_id = backend.platform_id.clone();
                    let p_name = platform_name.clone();
                    let m_id = model_id_str.clone();
                    let px_name = proxy.name.clone();
                    let eb_clone = eb.clone();
                    let et_clone = et.clone();
                    let ak_name = api_key_name.clone();
                    web::block(move || record_request_log(&db_log, Some(&p_id), Some(&p_name), Some(&m_id), Some(&px_name), Some(status_code), Some(latency_ms), None, None, Some(&et_clone), Some(&eb_clone), is_stream, ak_name.as_deref())).await.ok();

                    last_error = Some(eb);
                    last_error_type = Some(et.clone());

                    if should_retry(&classify_error(status.as_u16()), &route.retry_policy.retry_on_error) && attempt < max_retries {
                        tokio::time::sleep(std::time::Duration::from_millis(route.retry_policy.backoff_ms * 2u64.pow(attempt as u32))).await;
                        continue;
                    }
                    return Ok(HttpResponse::build(actix_web::http::StatusCode::from_u16(status.as_u16()).unwrap_or(actix_web::http::StatusCode::BAD_GATEWAY)).body(last_error.unwrap_or_default()));
                }
            }
            Err(e) => {
                // Record platform failure for health tracking
                let db_health = state.db.clone();
                let pid_health = backend.platform_id.clone();
                web::block(move || crate::db::platform::record_failure(&db_health, &pid_health)).await.ok();

                let db = state.db.clone();
                let pid = proxy.id.clone();
                let rid = route.id.clone();
                let bid = backend.id.clone();
                web::block(move || record_stat(&db, &pid, &rid, &bid, 0, latency_ms, None, None, Some("ConnectionError".to_string()))).await.ok();

                let err_msg = format!("Connection: {}", e);

                // Record request log
                let db_log = state.db.clone();
                let p_id = backend.platform_id.clone();
                let p_name = platform_name.clone();
                let m_id = model_id_str.clone();
                let px_name = proxy.name.clone();
                let em = err_msg.clone();
                let ak_name = api_key_name.clone();
                web::block(move || record_request_log(&db_log, Some(&p_id), Some(&p_name), Some(&m_id), Some(&px_name), Some(0), Some(latency_ms), None, None, Some("ConnectionError"), Some(&em), is_stream, ak_name.as_deref())).await.ok();

                last_error = Some(err_msg);
                last_error_type = Some("ConnectionError".to_string());
                if should_retry(&ErrorType::ConnectionError, &route.retry_policy.retry_on_error) && attempt < max_retries {
                    tokio::time::sleep(std::time::Duration::from_millis(route.retry_policy.backoff_ms * 2u64.pow(attempt as u32))).await;
                    continue;
                }
            }
        }
    }

    let total_latency = start_total.elapsed().as_millis() as i64;
    // Record final failure log if all retries exhausted
    let db_log = state.db.clone();
    let px_name = proxy.name.clone();
    let em = last_error.clone().unwrap_or_default();
    let et = last_error_type.clone();
    web::block(move || record_request_log(&db_log, None, None, None, Some(&px_name), Some(0), Some(total_latency), None, None, et.as_deref(), Some(&em), is_stream, api_key_name.as_deref())).await.ok();

    Err(AppError::Internal(format!("All retries: {}", last_error.unwrap_or_default())))
}

fn build_forward_request(unified: &UnifiedRequest, platform: &crate::models::platform::Platform, target_model: &str) -> (serde_json::Value, String) {
    match platform.platform_type {
        crate::models::platform::PlatformType::Anthropic => {
            (anthropic::to_request(unified, target_model), format!("{}/v1/messages", platform.base_url.trim_end_matches('/')))
        }
        _ => {
            (openai::to_request(unified, target_model), format!("{}/chat/completions", platform.base_url.trim_end_matches('/')))
        }
    }
}

/// Enhanced stream handler with error filtering (P0-4: SSE error filtering)
async fn handle_stream(resp: reqwest::Response) -> HttpResponse {
    let s = resp.status();
    if !s.is_success() {
        return HttpResponse::build(
            actix_web::http::StatusCode::from_u16(s.as_u16()).unwrap_or(actix_web::http::StatusCode::BAD_GATEWAY)
        ).body(resp.text().await.unwrap_or_default());
    }

    // Wrap the byte stream with SSE error filtering
    let filtered_stream = resp.bytes_stream().filter_map(|r| {
        let result = match r {
            Ok(bytes) => {
                // Filter out invalid UTF-8 sequences and empty chunks
                if bytes.is_empty() {
                    return std::future::ready(None);
                }
                // Validate UTF-8, skip chunks with invalid bytes
                match std::str::from_utf8(&bytes) {
                    Ok(text) => {
                        // Skip chunks that are only whitespace
                        let trimmed = text.trim();
                        if trimmed.is_empty() {
                            return std::future::ready(None);
                        }
                        // Validate SSE: each line should be "data: ..." or "event: ..." or empty line
                        // If it contains invalid JSON in data lines, we still pass it through
                        // but filter out obvious errors
                        if trimmed.starts_with("data: [DONE]") || trimmed.starts_with("data:") || trimmed.starts_with("event:") || trimmed.starts_with("id:") || trimmed.starts_with("retry:") || trimmed == "" {
                            std::future::ready(Some(Ok(bytes)))
                        } else if trimmed.starts_with("{") || trimmed.starts_with("}") || trimmed.starts_with("[") || trimmed == "]" {
                            // JSON fragments are OK for SSE
                            std::future::ready(Some(Ok(bytes)))
                        } else {
                            // Unknown content - could be error, pass through with warning
                            tracing::warn!("SSE: unexpected chunk: {}", &trimmed[..trimmed.len().min(200)]);
                            std::future::ready(Some(Ok(bytes)))
                        }
                    }
                    Err(_) => {
                        // Invalid UTF-8 - skip this chunk
                        tracing::warn!("SSE: filtering invalid UTF-8 chunk ({} bytes)", bytes.len());
                        std::future::ready(None)
                    }
                }
            }
            Err(e) => {
                tracing::warn!("SSE stream error: {}", e);
                // Convert stream error to a final SSE error event
                let error_event = format!("data: {{\"error\": \"{}\"}}\n\n", e);
                std::future::ready(Some(Ok(bytes::Bytes::from(error_event))))
            }
        };
        result
    });

    HttpResponse::Ok()
        .content_type("text/event-stream")
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .insert_header(("X-Accel-Buffering", "no"))
        .streaming(filtered_stream.map(|r| r.map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))))
}

fn classify_error(c: u16) -> ErrorType { match c { 429 => ErrorType::RateLimit, 408 => ErrorType::Timeout, s if s >= 500 => ErrorType::ServerError, _ => ErrorType::ConnectionError } }
fn should_retry(e: &ErrorType, r: &[ErrorType]) -> bool { r.contains(e) }
