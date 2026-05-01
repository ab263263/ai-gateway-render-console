use actix_web::{web, HttpResponse};
use regex::Regex;
use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::models::platform::*;

fn extract_model_from_output(output: &str) -> Option<String> {
    if output.trim().is_empty() {
        return None;
    }

    let patterns = [
        r"(?i)actual(?:ly)?\s+(?:hit|used|resolved)(?:\s+model(?:\s+name)?)?\s*(?:is|:)\s*([A-Za-z0-9][A-Za-z0-9._:/\- ]{1,120})",
        r"(?i)实际命中(?:的)?模型(?:名)?(?:是|为|:)\s*([A-Za-z0-9][A-Za-z0-9._:/\- ]{1,120})",
        r"(?i)命中模型(?:名)?(?:是|为|:)\s*([A-Za-z0-9][A-Za-z0-9._:/\- ]{1,120})",
    ];

    for pattern in patterns {
        if let Ok(re) = Regex::new(pattern) {
            if let Some(caps) = re.captures(output) {
                if let Some(value) = caps.get(1) {
                    let normalized = value.as_str().trim().trim_matches(|c: char| matches!(c, '。' | '.' | ',' | '，' | '：' | ':' | '"' | '\'' | '”' | '“' | ')' | '）')).trim().to_string();
                    if !normalized.is_empty() {
                        return Some(normalized);
                    }
                }
            }
        }
    }

    None
}

fn extract_anthropic_output(json_body: Option<&serde_json::Value>) -> String {
    json_body
        .and_then(|v| v.get("content"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.get("text"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn extract_openai_output(json_body: Option<&serde_json::Value>) -> String {
    json_body
        .and_then(|v| v.get("choices"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.get("message"))
        .and_then(|v| v.get("content"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn normalize_protocol_targets(platform_type: &PlatformType, protocols: Option<Vec<String>>) -> Vec<String> {
    let requested = protocols.unwrap_or_else(|| vec!["openai".to_string(), "anthropic".to_string()]);
    let mut normalized = Vec::new();

    for protocol in requested {
        let p = protocol.trim().to_lowercase();
        if p == "openai" || p == "anthropic" {
            normalized.push(p);
        }
    }

    if normalized.is_empty() {
        normalized = vec!["openai".to_string(), "anthropic".to_string()];
    }

    if matches!(platform_type, PlatformType::Anthropic) && !normalized.iter().any(|p| p == "anthropic") {
        normalized.push("anthropic".to_string());
    }

    normalized.sort();
    normalized.dedup();
    normalized
}

fn protocol_supported_by_platform(platform_type: &PlatformType, protocol: &str) -> bool {
    match protocol {
        "anthropic" => true,
        "openai" => !matches!(platform_type, PlatformType::Anthropic),
        _ => false,
    }
}

fn build_protocol_request(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    protocol: &str,
    model_id: &str,
    content: &str,
    max_tokens: u32,
) -> reqwest::RequestBuilder {
    match protocol {
        "anthropic" => {
            let mut request = client.post(format!("{}/v1/messages", base_url))
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "model": model_id,
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": content}]
                }));
            if !api_key.is_empty() {
                request = request.header("x-api-key", api_key);
            }
            request
        }
        _ => {
            let mut request = client.post(format!("{}/chat/completions", base_url))
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "model": model_id,
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": content}]
                }));
            if !api_key.is_empty() {
                request = request.header("Authorization", format!("Bearer {}", api_key));
            }
            request
        }
    }
}

fn resolve_actual_model(json_body: Option<&serde_json::Value>, output: &str) -> String {
    let response_model = json_body
        .and_then(|v| v.get("model"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if let Some(inferred) = extract_model_from_output(output) {
        return inferred;
    }

    response_model
}

#[derive(Debug, serde::Deserialize)]
pub struct PlatformChatTestRequest {
    pub model_id: String,
    pub message: String,
    pub max_tokens: Option<u32>,
}


#[derive(Debug, serde::Deserialize)]
pub struct ImportRemoteModelsRequest {
    pub model_ids: Option<Vec<String>>,
    pub max_tokens: Option<u32>,
    pub context_window: Option<u32>,
}

#[derive(Debug, serde::Deserialize)]
pub struct PlatformProbeRequest {
    pub model_id: String,
    pub message: Option<String>,
    pub max_tokens: Option<u32>,
    pub protocols: Option<Vec<String>>,
}






pub async fn list(db: web::Data<DbPool>) -> AppResult<HttpResponse> {
    let db = db.into_inner();
    let platforms = web::block(move || crate::db::platform::list(&db))
        .await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(HttpResponse::Ok().json(platforms))
}

pub async fn list_presets() -> AppResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(PlatformPreset::all()))
}

pub async fn get(db: web::Data<DbPool>, path: web::Path<String>) -> AppResult<HttpResponse> {
    let id = path.into_inner();
    let db = db.into_inner();
    let platform = web::block(move || crate::db::platform::get(&db, &id))
        .await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(HttpResponse::Ok().json(platform))
}

pub async fn create(db: web::Data<DbPool>, body: web::Json<CreatePlatformRequest>) -> AppResult<HttpResponse> {
    let req = body.into_inner();
    let db = db.into_inner();
    let platform = web::block(move || crate::db::platform::create(&db, &req))
        .await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(HttpResponse::Created().json(platform))
}

pub async fn update(db: web::Data<DbPool>, path: web::Path<String>, body: web::Json<UpdatePlatformRequest>) -> AppResult<HttpResponse> {
    let id = path.into_inner();
    let req = body.into_inner();
    let db = db.into_inner();
    let platform = web::block(move || crate::db::platform::update(&db, &id, &req))
        .await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(HttpResponse::Ok().json(platform))
}

pub async fn delete(db: web::Data<DbPool>, path: web::Path<String>) -> AppResult<HttpResponse> {
    let id = path.into_inner();
    let db = db.into_inner();
    web::block(move || crate::db::platform::delete(&db, &id))
        .await.map_err(|e| crate::error::AppError::Internal(e.to_string()))??;
    Ok(HttpResponse::NoContent().finish())
}

/// Fetch available models from a platform's remote API (e.g. GET /v1/models)
pub async fn fetch_remote_models(
    db: web::Data<DbPool>,
    config: web::Data<crate::api::settings::SharedAppConfig>,
    path: web::Path<String>,
) -> AppResult<HttpResponse> {
    let id = path.into_inner();
    let db = db.into_inner();
    let timeout_secs = config.read().defaults.test_connection_timeout_secs;

    let platform = web::block(move || crate::db::platform::get(&db, &id))
        .await.map_err(|e| AppError::Internal(e.to_string()))??;

    let base_url = platform.base_url.trim_end_matches('/').to_string();
    let api_key = platform.api_key.clone();
    let platform_type = platform.platform_type.clone();
    let platform_name = platform.name.clone();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let result = match platform_type {
        PlatformType::Anthropic => {
            serde_json::json!({
                "success": true,
                "platform_id": platform.id,
                "platform_name": platform_name,
                "platform_type": "Anthropic",
                "models": [],
                "count": 0,
                "message": "Anthropic does not provide a standard /models endpoint"
            })
        }
        _ => {
            let url = format!("{}/models", base_url);
            let mut req = client.get(&url);
            if !api_key.is_empty() {
                req = req.header("Authorization", format!("Bearer {}", api_key));
            }
            let resp = req.send().await.map_err(|e| AppError::Internal(format!("Failed to fetch models: {}", e)))?;
            let status = resp.status();
            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                return Ok(HttpResponse::Ok().json(serde_json::json!({
                    "success": false,
                    "platform_id": platform.id,
                    "platform_name": platform_name,
                    "platform_type": format!("{:?}", platform_type),
                    "models": [],
                    "count": 0,
                    "message": format!("API returned {}: {}", status, body.chars().take(200).collect::<String>())
                })));
            }
            let body: serde_json::Value = resp.json().await.map_err(|e| AppError::Internal(format!("Failed to parse response: {}", e)))?;
            let models: Vec<serde_json::Value> = body.get("data")
                .and_then(|d| d.as_array())
                .map(|arr| arr.iter().map(|m| serde_json::json!({
                    "id": m.get("id").and_then(|v| v.as_str()).unwrap_or("unknown"),
                    "owned_by": m.get("owned_by").and_then(|v| v.as_str()).unwrap_or(""),
                })).collect())
                .unwrap_or_default();
            let count = models.len();
            serde_json::json!({
                "success": true,
                "platform_id": platform.id,
                "platform_name": platform_name,
                "platform_type": format!("{:?}", platform_type),
                "models": models,
                "count": count,
                "message": format!("Fetched {} models", count)
            })
        }
    };

    Ok(HttpResponse::Ok().json(result))
}

pub async fn import_remote_models(
    db: web::Data<DbPool>,
    config: web::Data<crate::api::settings::SharedAppConfig>,
    path: web::Path<String>,
    body: web::Json<ImportRemoteModelsRequest>,
) -> AppResult<HttpResponse> {
    let id = path.into_inner();
    let req = body.into_inner();
    let db_for_platform = db.clone().into_inner();
    let timeout_secs = config.read().defaults.test_connection_timeout_secs;

    let platform = web::block(move || crate::db::platform::get(&db_for_platform, &id))
        .await.map_err(|e| AppError::Internal(e.to_string()))??;

    let base_url = platform.base_url.trim_end_matches('/').to_string();
    let api_key = platform.api_key.clone();
    let platform_type = platform.platform_type.clone();
    let platform_id = platform.id.clone();
    let platform_name = platform.name.clone();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let remote_models: Vec<String> = match platform_type {
        PlatformType::Anthropic => Vec::new(),
        _ => {
            let url = format!("{}/models", base_url);
            let mut request = client.get(&url);
            if !api_key.is_empty() {
                request = request.header("Authorization", format!("Bearer {}", api_key));
            }
            let resp = request.send().await.map_err(|e| AppError::Internal(format!("Failed to fetch models: {}", e)))?;
            let status = resp.status();
            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                return Ok(HttpResponse::Ok().json(serde_json::json!({
                    "success": false,
                    "platform_id": platform_id,
                    "platform_name": platform_name,
                    "imported": 0,
                    "skipped": 0,
                    "failed": 0,
                    "models": [],
                    "message": format!("API returned {}: {}", status, body.chars().take(200).collect::<String>())
                })));
            }
            let body: serde_json::Value = resp.json().await.map_err(|e| AppError::Internal(format!("Failed to parse response: {}", e)))?;
            body.get("data")
                .and_then(|d| d.as_array())
                .map(|arr| arr.iter()
                    .filter_map(|m| m.get("id").and_then(|v| v.as_str()).map(String::from))
                    .collect::<Vec<_>>())
                .unwrap_or_default()
        }
    };

    let selected_model_ids = req.model_ids.unwrap_or(remote_models.clone());
    let db_for_import = db.into_inner();
    let platform_id_for_import = platform_id.clone();
    let max_tokens = req.max_tokens.unwrap_or(4096);
    let context_window = req.context_window.unwrap_or(8192);

    let import_result = web::block(move || -> AppResult<serde_json::Value> {
        let existing = crate::db::model::list_by_platform(&db_for_import, &platform_id_for_import)?;
        let existing_ids = existing.into_iter().map(|m| m.model_id).collect::<std::collections::HashSet<_>>();

        let mut to_create = Vec::new();
        let mut skipped = Vec::new();

        for model_id in selected_model_ids {
            if existing_ids.contains(&model_id) {
                skipped.push(model_id);
            } else {
                to_create.push(crate::models::model::CreateModelRequest {
                    platform_id: platform_id_for_import.clone(),
                    model_id: model_id.clone(),
                    display_name: model_id,
                    max_tokens,
                    context_window,
                    input_price: None,
                    output_price: None,
                    capabilities: vec![],
                });
            }
        }

        let imported_models = crate::db::model::batch_create(&db_for_import, to_create)?;
        let imported_ids = imported_models.into_iter().map(|m| m.model_id).collect::<Vec<_>>();

        Ok(serde_json::json!({
            "success": true,
            "platform_id": platform_id_for_import,
            "platform_name": platform_name,
            "imported": imported_ids.len(),
            "skipped": skipped.len(),
            "failed": 0,
            "models": imported_ids,
            "skipped_models": skipped,
            "message": format!("Imported {} models, skipped {} existing models", imported_ids.len(), skipped.len())
        }))
    }).await.map_err(|e| AppError::Internal(e.to_string()))??;

    Ok(HttpResponse::Ok().json(import_result))
}

pub async fn probe_platform_model(
    db: web::Data<DbPool>,
    config: web::Data<crate::api::settings::SharedAppConfig>,
    path: web::Path<String>,
    body: web::Json<PlatformProbeRequest>,
) -> AppResult<HttpResponse> {
    let id = path.into_inner();
    let req = body.into_inner();
    let db = db.into_inner();
    let timeout_secs = config.read().defaults.test_connection_timeout_secs;

    let platform = web::block(move || crate::db::platform::get(&db, &id))
        .await.map_err(|e| AppError::Internal(e.to_string()))??;

    let base_url = platform.base_url.trim_end_matches('/').to_string();
    let api_key = platform.api_key.clone();
    let platform_type = platform.platform_type.clone();
    let model_id = req.model_id.clone();
    let start = std::time::Instant::now();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut models_ok = false;
    let mut models_count = 0usize;
    let mut models_error = String::new();

    match platform_type {
        PlatformType::Anthropic => {
            models_error = "Anthropic does not provide a standard /models endpoint".to_string();
        }
        _ => {
            let models_url = format!("{}/models", base_url);
            let mut models_req = client.get(&models_url);
            if !api_key.is_empty() {
                models_req = models_req.header("Authorization", format!("Bearer {}", api_key));
            }
            match models_req.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        let body: serde_json::Value = resp.json().await.unwrap_or_default();
                        let count = body.get("data").and_then(|d| d.as_array()).map(|a| a.len()).unwrap_or(0);
                        models_ok = true;
                        models_count = count;
                    } else {
                        let body = resp.text().await.unwrap_or_default();
                        models_error = body.chars().take(200).collect();
                    }
                }
                Err(e) => {
                    models_error = e.to_string();
                }
            }
        }
    }

    let max_tokens = req.max_tokens.unwrap_or(128);
    let content = req.message.unwrap_or_else(|| "hi".to_string());
    let chat_result = match platform_type {
        PlatformType::Anthropic => {
            let url = format!("{}/v1/messages", base_url);
            let mut request = client.post(&url)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "model": model_id,
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": content}]
                }));
            if !api_key.is_empty() {
                request = request.header("x-api-key", &api_key);
            }
            request.send().await
        }
        _ => {
            let url = format!("{}/chat/completions", base_url);
            let mut request = client.post(&url)
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "model": req.model_id,
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": content}]
                }));
            if !api_key.is_empty() {
                request = request.header("Authorization", format!("Bearer {}", api_key));
            }
            request.send().await
        }
    };

    let latency_ms = start.elapsed().as_millis() as u64;

    match chat_result {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let success = resp.status().is_success();
            let body_text = resp.text().await.unwrap_or_default();
            let json_body = serde_json::from_str::<serde_json::Value>(&body_text).ok();
            let output = json_body.as_ref()
                .and_then(|v| v.get("choices"))
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.get("message"))
                .and_then(|v| v.get("content"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let actual_model = resolve_actual_model(json_body.as_ref(), &output);
            let error_msg = json_body.as_ref()
                .and_then(|v| v.get("error"))
                .and_then(|e| e.get("message"))
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_else(|| body_text.chars().take(300).collect::<String>());
            let category = if success {
                if !actual_model.is_empty() && actual_model != req.model_id { "mapped_model_mismatch" } else { "ok" }
            } else if error_msg.contains("Invalid token") || error_msg.contains("Invalid API key") {
                "auth_error"
            } else if error_msg.contains("cooldown") {
                "cooldown"
            } else if error_msg.contains("rate_limit") || error_msg.contains("Too Many Requests") {
                "rate_limit"
            } else if error_msg.contains("No available channel") {
                "no_available_channel"
            } else if error_msg.contains("model_not_found") {
                "model_not_found"
            } else {
                "platform_compat_issue"
            };

            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": success,
                "platform_id": platform.id,
                "platform_name": platform.name,
                "requested_model": req.model_id,
                "actual_model": actual_model,
                "models_probe": {
                    "success": models_ok,
                    "count": models_count,
                    "error": models_error
                },
                "chat_probe": {
                    "success": success,
                    "status": status,
                    "latency_ms": latency_ms,
                    "category": category,
                    "message": if success { "Probe successful".to_string() } else { error_msg },
                    "output": output
                },
                "raw": json_body.unwrap_or_else(|| serde_json::json!({"text": body_text.chars().take(500).collect::<String>()}))
            })))
        }
        Err(e) => {
            let category = if e.is_timeout() { "timeout" } else if e.is_connect() { "network_error" } else { "platform_compat_issue" };
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": false,
                "platform_id": platform.id,
                "platform_name": platform.name,
                "requested_model": req.model_id,
                "actual_model": "",
                "models_probe": {
                    "success": models_ok,
                    "count": models_count,
                    "error": models_error
                },
                "chat_probe": {
                    "success": false,
                    "status": 0,
                    "latency_ms": latency_ms,
                    "category": category,
                    "message": e.to_string(),
                    "output": ""
                },
                "raw": serde_json::json!({})
            })))
        }
    }
}

pub async fn test_platform_chat(
    db: web::Data<DbPool>,
    config: web::Data<crate::api::settings::SharedAppConfig>,
    path: web::Path<String>,
    body: web::Json<PlatformChatTestRequest>,
) -> AppResult<HttpResponse> {
    let id = path.into_inner();
    let req = body.into_inner();
    let db = db.into_inner();
    let timeout_secs = config.read().defaults.test_connection_timeout_secs;

    let platform = web::block(move || crate::db::platform::get(&db, &id))
        .await.map_err(|e| AppError::Internal(e.to_string()))??;

    let base_url = platform.base_url.trim_end_matches('/').to_string();
    let api_key = platform.api_key.clone();
    let platform_type = platform.platform_type.clone();
    let start = std::time::Instant::now();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let max_tokens = req.max_tokens.unwrap_or(128);
    let content = if req.message.trim().is_empty() { "hi".to_string() } else { req.message.clone() };

    let result = match platform_type {
        PlatformType::Anthropic => {
            let url = format!("{}/v1/messages", base_url);
            let mut request = client.post(&url)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "model": req.model_id,
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": content}]
                }));
            if !api_key.is_empty() {
                request = request.header("x-api-key", &api_key);
            }
            request.send().await
        }
        _ => {
            let url = format!("{}/chat/completions", base_url);
            let mut request = client.post(&url)
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "model": req.model_id,
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": content}]
                }));
            if !api_key.is_empty() {
                request = request.header("Authorization", format!("Bearer {}", api_key));
            }
            request.send().await
        }
    };

    let latency_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let is_success = resp.status().is_success();
            let body_text = resp.text().await.unwrap_or_default();
            let json_body = serde_json::from_str::<serde_json::Value>(&body_text).ok();
            let output_text = json_body.as_ref()
                .and_then(|v| v.get("choices"))
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.get("message"))
                .and_then(|v| v.get("content"))
                .and_then(|v| v.as_str())
                .or_else(|| {
                    json_body.as_ref()
                        .and_then(|v| v.get("content"))
                        .and_then(|v| v.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|v| v.get("text"))
                        .and_then(|v| v.as_str())
                })
                .unwrap_or("")
                .to_string();
            let error_msg = json_body.as_ref()
                .and_then(|v| v.get("error"))
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("")
                .to_string();

            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": is_success,
                "status": status,
                "latency_ms": latency_ms,
                "platform_id": platform.id,
                "platform_name": platform.name,
                "model_id": req.model_id,
                "message": if is_success { "Chat test successful".to_string() } else { format!("API returned {}: {}", status, if error_msg.is_empty() { body_text.chars().take(300).collect::<String>() } else { error_msg }) },
                "output": output_text,
                "raw": json_body.unwrap_or_else(|| serde_json::json!({"text": body_text.chars().take(500).collect::<String>()}))
            })))
        }
        Err(e) => {
            let msg = if e.is_timeout() {
                format!("Connection timed out ({}s)", timeout_secs)
            } else if e.is_connect() {
                format!("Cannot connect to server: {}", e)
            } else {
                format!("Connection error: {}", e)
            };
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": false,
                "status": 0,
                "latency_ms": latency_ms,
                "platform_id": platform.id,
                "platform_name": platform.name,
                "model_id": req.model_id,
                "message": msg,
                "output": "",
                "raw": serde_json::json!({})
            })))
        }
    }
}


