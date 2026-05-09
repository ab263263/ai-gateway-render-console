use actix_cors::Cors;
use actix_web::{web, App, HttpServer, HttpResponse, http::header};
use serde_json::json;
use actix_web::dev::Service;
use actix_files as actix_files;
use futures_util::future::LocalBoxFuture;
use std::sync::Arc;
use parking_lot::RwLock;
use base64::Engine as _;

use ai_gateway::proxy::handler::ProxyState;
use ai_gateway::lb::BackendSelector;
use ai_gateway::api::settings::SharedAppConfig;
use ai_gateway::health::health_check_loop;

fn is_admin_authorized(auth_header: Option<&header::HeaderValue>, username: &str, password: &str) -> bool {
    let Some(value) = auth_header.and_then(|v| v.to_str().ok()) else {
        return false;
    };

    let Some(encoded) = value.strip_prefix("Basic ") else {
        return false;
    };

    let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(encoded) else {
        return false;
    };

    let Ok(decoded_str) = String::from_utf8(decoded) else {
        return false;
    };

    decoded_str == format!("{}:{}", username, password)
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    // Install panic hook to log panics before crashing
    std::panic::set_hook(Box::new(|panic_info| {
        let msg = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "unknown panic".to_string()
        };
        let location = panic_info.location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        eprintln!("PANIC: {} at {}", msg, location);
    }));

    let app_config = ai_gateway::config::AppConfig::load_or_default();

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(&app_config.server.log_level)))
        .init();

    tracing::info!("AI Gateway v{} starting...", env!("CARGO_PKG_VERSION"));
    tracing::info!("Admin UI + API: http://{}:{}", app_config.server.host, app_config.server.admin_port);
    tracing::info!("App directory: {:?}", ai_gateway::config::get_app_dir());

    let db_path = app_config.resolved_db_path();
    tracing::info!("Database path: {:?}", db_path);

    let db_pool = ai_gateway::db::init_pool(&db_path)
        .expect("Failed to initialize database");

    let boot_ready = match ai_gateway::db::get_conn(&db_pool) {
        Ok(conn) => {
            let platform_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM platforms", [], |row| row.get(0))
                .unwrap_or(0);
            let proxy_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM proxies", [], |row| row.get(0))
                .unwrap_or(0);
            let model_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM models", [], |row| row.get(0))
                .unwrap_or(0);
            tracing::info!(platform_count, proxy_count, model_count, "database bootstrap snapshot");
            platform_count > 0 || proxy_count > 0 || model_count > 0
        }
        Err(err) => {
            tracing::error!(error = %err, "failed to inspect bootstrap database state");
            false
        }
    };

    let http_client = reqwest::Client::builder()
        // 稳定性优化：细化超时配置
        .connect_timeout(std::time::Duration::from_secs(app_config.defaults.connect_timeout_secs))  // 连接超时
        .timeout(std::time::Duration::from_secs(app_config.defaults.read_timeout_secs))          // 总超时（主要是读取超时）
        .pool_max_idle_per_host(app_config.defaults.pool_max_idle_per_host)                    // 连接池配置
        .pool_idle_timeout(Some(std::time::Duration::from_secs(app_config.defaults.pool_idle_timeout_secs)))  // 空闲连接超时
        .tcp_keepalive(Some(std::time::Duration::from_secs(60)))                            // TCP keepalive
        .build()
        .expect("Failed to create HTTP client");

    let shared_config: SharedAppConfig = Arc::new(RwLock::new(app_config.clone()));
    let selector = Arc::new(BackendSelector::new());

    let proxy_state = Arc::new(ProxyState {
        db: db_pool.clone(),
        config: app_config.clone(),
        selector,
        http_client,
    });

    // Spawn background health check loop (runs every 5 minutes)
    tokio::spawn(health_check_loop(proxy_state.clone()));

    let static_dir = app_config.static_dir();
    let host = app_config.server.host.clone();
    let admin_port = app_config.server.admin_port;
    let admin_username = app_config.security.admin_username.clone();
    let admin_password = app_config.security.admin_password.clone();
    let ready_db_pool = db_pool.clone();
    let ready_db_path = db_path.clone();
    let is_boot_ready = boot_ready;

    tracing::info!("Static dir: {:?}", static_dir);
    tracing::info!("Static dir exists: {}", static_dir.exists());

    // Ensure static directory exists
    if !static_dir.exists() {
        tracing::warn!("Static directory {:?} does not exist, creating empty directory", static_dir);
        std::fs::create_dir_all(&static_dir).expect("Failed to create static directory");
    }

    HttpServer::new(move || {
        let cors = Cors::permissive();

        App::new()
            .wrap(cors)
            .wrap_fn({
                let admin_username = admin_username.clone();
                let admin_password = admin_password.clone();
                move |req, srv| -> LocalBoxFuture<_> {
                    let path = req.path().to_string();
                    let needs_admin_auth = !path.starts_with("/v1/") && path != "/health" && path != "/ready";
                    let authorized = admin_username.is_empty()
                        || admin_password.is_empty()
                        || is_admin_authorized(req.headers().get(header::AUTHORIZATION), &admin_username, &admin_password);

                    if !needs_admin_auth || authorized {
                        let fut = srv.call(req);
                        Box::pin(async move { Ok(fut.await?.map_into_boxed_body()) })
                    } else {
                        Box::pin(async move {
                            let response = HttpResponse::Unauthorized()
                                .insert_header((header::WWW_AUTHENTICATE, "Basic realm=\"AI Gateway Admin\""))
                                .finish();
                            Ok(req.into_response(response).map_into_boxed_body())
                        })
                    }
                }
            })
            .app_data(web::Data::new(db_pool.clone()))
            .app_data(web::Data::new(proxy_state.clone()))
            .app_data(web::Data::new(shared_config.clone()))
            .configure(ai_gateway::api::configure)
            .route("/v1/chat/completions", web::post().to(ai_gateway::proxy::handler::openai_chat_completions))
            .route("/v1/completions", web::post().to(ai_gateway::proxy::handler::openai_chat_completions))
            .route("/v1/models", web::get().to(ai_gateway::proxy::handler::openai_list_models))
            .route("/v1/messages", web::post().to(ai_gateway::proxy::handler::anthropic_messages))
            .route("/health", web::get().to(|| async { HttpResponse::Ok().json(json!({"status": "ok"})) }))
            .route("/ready", web::get().to({
                let ready_db_pool = ready_db_pool.clone();
                let ready_db_path = ready_db_path.clone();
                let is_boot_ready = is_boot_ready;
                move || {
                    let db_pool = ready_db_pool.clone();
                    let db_path = ready_db_path.clone();
                    async move {
                        let db_exists = db_path.exists();
                        let (db_connected, platform_count, proxy_count, model_count) = match ai_gateway::db::get_conn(&db_pool) {
                            Ok(conn) => {
                                let platform_count: i64 = conn.query_row("SELECT COUNT(*) FROM platforms", [], |row| row.get(0)).unwrap_or(0);
                                let proxy_count: i64 = conn.query_row("SELECT COUNT(*) FROM proxies", [], |row| row.get(0)).unwrap_or(0);
                                let model_count: i64 = conn.query_row("SELECT COUNT(*) FROM models", [], |row| row.get(0)).unwrap_or(0);
                                (true, platform_count, proxy_count, model_count)
                            }
                            Err(err) => {
                                tracing::warn!(error = %err, "ready check failed to fetch db connection");
                                (false, 0, 0, 0)
                            }
                        };

                        let ready = db_connected && db_exists && (is_boot_ready || platform_count > 0 || proxy_count > 0 || model_count > 0);
                        let status = if ready { actix_web::http::StatusCode::OK } else { actix_web::http::StatusCode::SERVICE_UNAVAILABLE };

                        HttpResponse::build(status).json(json!({
                            "status": if ready { "ready" } else { "degraded" },
                            "checks": {
                                "database": db_connected,
                                "db_path": db_path,
                                "db_exists": db_exists,
                                "bootstrap_has_data": is_boot_ready,
                                "platform_count": platform_count,
                                "proxy_count": proxy_count,
                                "model_count": model_count
                            }
                        }))
                    }
                }
            }))
            .service(actix_files::Files::new("/", &static_dir).index_file("index.html"))
    })
    .bind(format!("{}:{}", host, admin_port))?
    .run()
    .await
}
