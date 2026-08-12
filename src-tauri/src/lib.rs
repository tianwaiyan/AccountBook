mod backup;
mod database;
mod resources;
mod storage;

use std::path::{Path, PathBuf};

use tauri::{
    http::Response, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const EXTERNAL_PROTOCOL: &str = "accountbook";

fn application_directory() -> Result<PathBuf, String> {
    let executable =
        std::env::current_exe().map_err(|error| format!("无法定位应用程序：{error}"))?;
    executable
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| "无法确定应用程序所在目录".to_string())
}

fn show_startup_error<R: tauri::Runtime>(
    app: &tauri::App<R>,
    application_dir: &Path,
    reason: String,
) {
    let message = format!(
        "AccountBook 无法启动。\n\n应用目录：{}\n\n原因：{}\n\n请重新完整解压 AccountBook 发布 ZIP，确保 AccountBook.exe、resources、data 和 backups 位于同一目录，然后重试。",
        application_dir.display(),
        reason
    );
    let handle = app.handle().clone();
    app.dialog()
        .message(message)
        .kind(MessageDialogKind::Error)
        .buttons(MessageDialogButtons::Ok)
        .show(move |_| handle.exit(1));
}

fn external_resource_error_response() -> Response<Vec<u8>> {
    Response::builder()
        .status(503)
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(b"AccountBook external resources are unavailable".to_vec())
        .expect("valid resource error response")
}

fn clear_webview_data_on_exit(window: &WebviewWindow) {
    let database = window.state::<database::PortableDatabase>();
    if database.should_clear_webview_data_on_exit() {
        let _ = window.clear_all_browsing_data();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .register_uri_scheme_protocol(EXTERNAL_PROTOCOL, |_context, request| {
            let web_root = match application_directory() {
                Ok(directory) => directory.join("resources").join("web"),
                Err(_) => return external_resource_error_response(),
            };
            resources::serve_request(&web_root, request)
        })
        .setup(|app| {
            let database = database::PortableDatabase::initialize();
            let application_dir = database
                .configured_paths()
                .map(|paths| paths.application_dir.clone())
                .or_else(|| application_directory().ok())
                .unwrap_or_else(|| PathBuf::from("<unknown>"));

            if !tauri::is_dev() {
                if let Err(error) = resources::load_for_application(&application_dir) {
                    show_startup_error(app, &application_dir, error);
                    return Ok(());
                }
            }

            let webview_data_dir = if database.is_ready() {
                database
                    .configured_paths()
                    .map(|paths| paths.data_dir.join("webview"))
            } else {
                Some(
                    std::env::temp_dir()
                        .join(format!("AccountBook-startup-error-{}", std::process::id())),
                )
            };
            app.manage(database);

            let url = if tauri::is_dev() {
                WebviewUrl::App("index.html".into())
            } else {
                WebviewUrl::CustomProtocol(
                    tauri::Url::parse("accountbook://localhost/index.html")
                        .expect("valid AccountBook resource URL"),
                )
            };
            let mut window = WebviewWindowBuilder::new(app, "main", url)
                .title("AccountBook")
                .inner_size(1360.0, 860.0)
                .min_inner_size(390.0, 640.0)
                .resizable(true)
                .maximized(true);
            if let Some(directory) = webview_data_dir {
                window = window.data_directory(directory);
            }
            let window = window.build()?;
            let window_for_cleanup = window.clone();
            window.on_window_event(move |event| {
                if matches!(event, WindowEvent::CloseRequested { .. }) {
                    clear_webview_data_on_exit(&window_for_cleanup);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            database::portable_database_info,
            database::database_select,
            database::database_execute,
            backup::create_backup,
            backup::stage_restore,
            backup::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AccountBook");
}
