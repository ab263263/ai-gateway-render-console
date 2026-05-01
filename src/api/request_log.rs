use actix_web::{web, HttpResponse};
use crate::db::DbPool;
use crate::error::AppError;
use crate::db::request_log::LogQueryParams;

pub async fn list_logs(
    pool: web::Data<DbPool>, query: web::Query<LogQueryParams>,
) -> Result<HttpResponse, AppError> {
    let result = crate::db::request_log::query(&pool, &query)?;
    Ok(HttpResponse::Ok().json(result))
}
