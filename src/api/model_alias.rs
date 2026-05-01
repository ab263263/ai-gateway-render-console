use actix_web::{web, HttpResponse};
use crate::db::DbPool;
use crate::error::AppError;
use crate::db::model_alias::CreateModelAliasRequest;

pub async fn list(
    pool: web::Data<DbPool>,
) -> Result<HttpResponse, AppError> {
    let aliases = crate::db::model_alias::list_all(&pool)?;
    Ok(HttpResponse::Ok().json(aliases))
}

pub async fn create(
    pool: web::Data<DbPool>, body: web::Json<CreateModelAliasRequest>,
) -> Result<HttpResponse, AppError> {
    let alias = crate::db::model_alias::create(&pool, &body)?;
    Ok(HttpResponse::Ok().json(alias))
}

pub async fn delete(
    pool: web::Data<DbPool>, path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    crate::db::model_alias::delete(&pool, &id)?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}
