mod backup;
mod database;
mod storage;

use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

fn clear_webview_data_on_exit(window: &WebviewWindow) {
    let database = window.state::<database::PortableDatabase>();
    if database.should_clear_webview_data_on_exit() {
        let _ = window.clear_all_browsing_data();
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let database = database::PortableDatabase::initialize();
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

            let mut window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
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
