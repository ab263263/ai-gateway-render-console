use actix_web::{web, HttpResponse};
use std::sync::Arc;
use crate::error::AppError;
use crate::proxy::handler::ProxyState;

/// POST /api/checkin — 立即执行所有已启用签到平台的签到
pub async fn do_checkin_now(
    state: web::Data<Arc<ProxyState>>,
) -> Result<HttpResponse, AppError> {
    let db = state.db.clone();
    let configs = web::block(move || crate::db::checkin::list_checkin_enabled(&db))
        .await.map_err(|e| AppError::Internal(e.to_string()))??;

    let mut results = Vec::new();
    for config in configs {
        if config.checkin_session.is_none() {
            continue;
        }
        let db = state.db.clone();
        let client = state.http_client.clone();
        let config_id = config.id.clone();
        let config_name = config.name.clone();
        let base_url = config.base_url.clone();
        let checkin_session = config.checkin_session.clone();
        let checkin_user_id = config.checkin_user_id.clone();

        let mut log = crate::checkin::do_checkin(&client, &config).await.unwrap_or_else(|e| {
            crate::db::checkin::CheckinLog {
                id: 0,
                platform_id: config_id.clone(),
                platform_name: config_name.clone(),
                result: None,
                quota_added: None,
                balance_after: None,
                success: false,
                error_message: Some(e),
                checked_at: chrono::Utc::now().to_rfc3339(),
            }
        });

        // Try to refresh balance after checkin
        if let (Some(session), Some(uid)) = (&checkin_session, &checkin_user_id) {
            if let Ok((remaining, total, used)) = crate::checkin::query_balance(&client, &base_url, session, uid).await {
                log.balance_after = Some(remaining);
                let db2 = state.db.clone();
                let pid = config_id.clone();
                web::block(move || crate::db::checkin::update_balance(&db2, &pid, remaining, total, used)).await.ok();
            }
        }

        let log_clone = log.clone();
        let db3 = state.db.clone();
        web::block(move || crate::db::checkin::record_checkin(&db3, &log_clone)).await.ok();

        results.push(log);
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "count": results.len(),
        "results": results,
    })))
}

/// POST /api/checkin/{platform_id} — 签到单个平台
pub async fn checkin_single(
    state: web::Data<Arc<ProxyState>>, path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let platform_id = path.into_inner();
    let db = state.db.clone();

    let configs = web::block(move || crate::db::checkin::list_checkin_enabled(&db))
        .await.map_err(|e| AppError::Internal(e.to_string()))??;
    let config = configs.into_iter().find(|c| c.id == platform_id)
        .ok_or_else(|| AppError::NotFound("Platform not found or checkin not enabled".to_string()))?;

    let client = state.http_client.clone();
    let config_id = config.id.clone();
    let base_url = config.base_url.clone();
    let checkin_session = config.checkin_session.clone();
    let checkin_user_id = config.checkin_user_id.clone();

    let mut log = crate::checkin::do_checkin(&client, &config).await
        .map_err(|e| AppError::Internal(e))?;

    // Try to refresh balance
    if let (Some(session), Some(uid)) = (&checkin_session, &checkin_user_id) {
        if let Ok((remaining, total, used)) = crate::checkin::query_balance(&client, &base_url, session, uid).await {
            log.balance_after = Some(remaining);
            let db2 = state.db.clone();
            let pid = config_id.clone();
            web::block(move || crate::db::checkin::update_balance(&db2, &pid, remaining, total, used)).await.ok();
        }
    }

    let log_clone = log.clone();
    let db3 = state.db.clone();
    web::block(move || crate::db::checkin::record_checkin(&db3, &log_clone)).await.ok();

    Ok(HttpResponse::Ok().json(log))
}

/// GET /api/balances — 获取所有平台余额信息
pub async fn list_balances(
    state: web::Data<Arc<ProxyState>>,
) -> Result<HttpResponse, AppError> {
    let db = state.db.clone();
    let balances = web::block(move || crate::db::checkin::list_balances(&db))
        .await.map_err(|e| AppError::Internal(e.to_string()))??;
    Ok(HttpResponse::Ok().json(balances))
}

/// POST /api/balances/refresh — 刷新所有平台余额
pub async fn refresh_balances(
    state: web::Data<Arc<ProxyState>>,
) -> Result<HttpResponse, AppError> {
    let db = state.db.clone();
    let configs = web::block(move || crate::db::checkin::list_checkin_enabled(&db))
        .await.map_err(|e| AppError::Internal(e.to_string()))??;

    let mut results = Vec::new();
    for config in configs {
        let (session, uid) = match (&config.checkin_session, &config.checkin_user_id) {
            (Some(s), Some(u)) => (s.clone(), u.clone()),
            _ => continue,
        };
        let base_url = config.base_url.clone();
        let config_id = config.id.clone();
        let config_name = config.name.clone();

        match crate::checkin::query_balance(&state.http_client, &base_url, &session, &uid).await {
            Ok((remaining, total, used)) => {
                let db2 = state.db.clone();
                let pid = config_id.clone();
                web::block(move || crate::db::checkin::update_balance(&db2, &pid, remaining, total, used)).await.ok();
                results.push(serde_json::json!({
                    "platform": config_name,
                    "remaining": remaining,
                    "total": total,
                    "used": used,
                }));
            }
            Err(e) => {
                results.push(serde_json::json!({
                    "platform": config_name,
                    "error": e,
                }));
            }
        }
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "count": results.len(),
        "balances": results,
    })))
}

/// GET /api/checkin-logs — 获取签到日志
pub async fn list_checkin_logs(
    state: web::Data<Arc<ProxyState>>,
    query: web::Query<CheckinLogQuery>,
) -> Result<HttpResponse, AppError> {
    let db = state.db.clone();
    let platform_id = query.platform_id.clone();
    let limit = query.limit.unwrap_or(50).min(200);
    let logs = web::block(move || {
        crate::db::checkin::get_checkin_logs(&db, platform_id.as_deref(), limit)
    }).await.map_err(|e| AppError::Internal(e.to_string()))??;
    Ok(HttpResponse::Ok().json(logs))
}

#[derive(serde::Deserialize)]
pub struct CheckinLogQuery {
    pub platform_id: Option<String>,
    pub limit: Option<i64>,
}
