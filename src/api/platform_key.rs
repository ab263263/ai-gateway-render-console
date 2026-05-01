use actix_web::{web, HttpResponse};
use crate::db::DbPool;
use crate::error::AppError;
use crate::db::platform_key::{CreatePlatformKeyRequest};

pub async fn list_keys(
    pool: web::Data<DbPool>, path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let platform_id = path.into_inner();
    let keys = crate::db::platform_key::list_by_platform(&pool, &platform_id)?;
    Ok(HttpResponse::Ok().json(keys))
}

pub async fn add_key(
    pool: web::Data<DbPool>, path: web::Path<String>, body: web::Json<CreatePlatformKeyRequest>,
) -> Result<HttpResponse, AppError> {
    let platform_id = path.into_inner();
    // Verify platform exists
    crate::db::platform::get(&pool, &platform_id)?;
    let key = crate::db::platform_key::create(&pool, &platform_id, &body)?;
    Ok(HttpResponse::Ok().json(key))
}

pub async fn delete_key(
    pool: web::Data<DbPool>, path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let key_id = path.into_inner();
    crate::db::platform_key::delete(&pool, &key_id)?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}
