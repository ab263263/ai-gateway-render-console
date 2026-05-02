pub mod platform;
pub mod platform_key;
pub mod model;
pub mod model_alias;
pub mod proxy;
pub mod route;
pub mod stats;
pub mod settings;
pub mod api_key;
pub mod request_log;
pub mod checkin;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg
        .service(
            web::scope("/api")
                // 平台
                .route("/platforms", web::get().to(platform::list))
                .route("/platforms", web::post().to(platform::create))
                .route("/platforms/presets", web::get().to(platform::list_presets))
                .route("/platforms/{id}", web::get().to(platform::get))
                .route("/platforms/{id}", web::put().to(platform::update))
                .route("/platforms/{id}", web::delete().to(platform::delete))
                .route("/platforms/{id}/remote-models", web::get().to(platform::fetch_remote_models))
                .route("/platforms/{id}/remote-models/import", web::post().to(platform::import_remote_models))
                .route("/platforms/{id}/chat-test", web::post().to(platform::test_platform_chat))
                .route("/platforms/{id}/probe-model", web::post().to(platform::probe_platform_model))
                // 平台多Key管理
                .route("/platforms/{id}/keys", web::get().to(platform_key::list_keys))
                .route("/platforms/{id}/keys", web::post().to(platform_key::add_key))
                .route("/platform-keys/{id}", web::delete().to(platform_key::delete_key))
                // 模型
                .route("/models", web::get().to(model::list))
                .route("/models", web::post().to(model::create))
                .route("/models/{id}", web::get().to(model::get))
                .route("/models/{id}", web::put().to(model::update))
                .route("/models/{id}", web::delete().to(model::delete))
                .route("/models/{id}/test", web::post().to(model::test_connection))
                // 模型别名
                .route("/model-aliases", web::get().to(model_alias::list))
                .route("/model-aliases", web::post().to(model_alias::create))
                .route("/model-aliases/{id}", web::delete().to(model_alias::delete))
                // 代理
                .route("/proxies", web::get().to(proxy::list))
                .route("/proxies", web::post().to(proxy::create))
                .route("/proxies/{id}", web::get().to(proxy::get))
                .route("/proxies/{id}", web::put().to(proxy::update))
                .route("/proxies/{id}", web::delete().to(proxy::delete))
                // 路由
                .route("/proxies/{proxy_id}/routes", web::get().to(route::list))
                .route("/proxies/{proxy_id}/routes", web::post().to(route::create))
                .route("/routes/{id}", web::put().to(route::update))
                .route("/routes/{id}", web::delete().to(route::delete))
                .route("/routes/{route_id}/backends", web::get().to(route::list_backends))
                .route("/routes/{route_id}/backends", web::post().to(route::add_backend))
                .route("/backends/{id}", web::put().to(route::update_backend))
                .route("/backends/{id}", web::delete().to(route::delete_backend))
                // API Keys
                .route("/api-keys", web::get().to(api_key::list))
                .route("/api-keys", web::post().to(api_key::create))
                .route("/api-keys/{id}", web::delete().to(api_key::delete))
                // 请求日志
                .route("/logs", web::get().to(request_log::list_logs))
                // 签到与余额
                .route("/checkin", web::post().to(checkin::do_checkin_now))
                .route("/checkin/{platform_id}", web::post().to(checkin::checkin_single))
                .route("/checkin-logs", web::get().to(checkin::list_checkin_logs))
                .route("/balances", web::get().to(checkin::list_balances))
                .route("/balances/refresh", web::post().to(checkin::refresh_balances))
                // 统计
                .route("/stats/overview", web::get().to(stats::overview))
                .route("/stats/proxy/{proxy_id}", web::get().to(stats::proxy_stats))
                .route("/stats/platform/{platform_id}", web::get().to(stats::platform_stats))
                // 设置
                .route("/settings", web::get().to(settings::get_config))
                .route("/settings", web::put().to(settings::update_config))
                // 备份
                .route("/backup", web::get().to(settings::export_backup))
        );
}
