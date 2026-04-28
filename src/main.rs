use actix_cors::Cors;
use actix_web::{web, App, HttpServer, HttpResponse, middleware, http::header};
use actix_web::body::EitherBody;
use actix_web::dev::{Service, ServiceResponse};
use actix_files as actix_files;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use parking_lot::RwLock;
use base64::Engine as _;


use ai_gateway::proxy::handler::ProxyState;
use ai_gateway::lb::BackendSelector;
use ai_gateway::api::settings::SharedAppConfig;

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
    let app_config = ai_gateway::config::AppConfig::load_or_default();

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(&app_config.server.log_level)))
        .init();

    tracing::info!("AI Gateway starting...");
    tracing::info!("Admin UI + API: http://{}:{}", app_config.server.host, app_config.server.admin_port);
    tracing::info!("App directory: {:?}", ai_gateway::config::get_app_dir());

    let db_path = app_config.resolved_db_path();
    tracing::info!("Database path: {:?}", db_path);

    let db_pool = ai_gateway::db::init_pool(&db_path)
        .expect("Failed to initialize database");

    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(app_config.defaults.request_timeout_secs))
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

    let static_dir = app_config.static_dir();
    let host = app_config.server.host.clone();
    let admin_port = app_config.server.admin_port;
    let admin_username = app_config.security.admin_username.clone();
    let admin_password = app_config.security.admin_password.clone();

    HttpServer::new(move || {

        let cors = Cors::permissive();

        App::new()
            .wrap(cors)
            .wrap(middleware::Logger::default())
            .wrap_fn({
                let admin_username = admin_username.clone();
                let admin_password = admin_password.clone();
                move |req, srv| {
                    let path = req.path().to_string();
                    let needs_admin_auth = !path.starts_with("/v1/") && path != "/health";
                    let authorized = admin_username.is_empty() || admin_password.is_empty() || is_admin_authorized(req.headers().get(header::AUTHORIZATION), &admin_username, &admin_password);

                    let fut: Pin<Box<dyn Future<Output = Result<ServiceResponse<EitherBody<actix_web::body::BoxBody>>, actix_web::Error>>>>> = if !needs_admin_auth || authorized {
                        let fut = srv.call(req);
                        Box::pin(async move {
                            let res = fut.await?;
                            Ok(res.map_into_left_body())
                        })
                    } else {
                        Box::pin(async move {
                            let response = HttpResponse::Unauthorized()
                                .insert_header((header::WWW_AUTHENTICATE, "Basic realm=\"AI Gateway Admin\""))
                                .finish();
                            Ok(req.into_response(response).map_into_right_body())
                        })
                    };

                    fut
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
            .route("/health", web::get().to(|| async { HttpResponse::Ok().json(serde_json::json!({"status": "ok"})) }))
            .service(actix_files::Files::new("/", &static_dir).index_file("index.html"))
    })
    .bind(format!("{}:{}", host, admin_port))?
    .run()
    .await
}

