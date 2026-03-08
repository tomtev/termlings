mod appearance;
mod command_lookup;
mod config;
mod hook_server;
mod preset;
mod project;
mod pty_manager;
mod server_manager;
mod setup;
mod snapshot;
mod state;
mod termlings;

use pty_manager::PtyManager;
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = config::load_state();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Start hook notification server for Claude Code lifecycle events
            match hook_server::HookServer::start(app.handle().clone()) {
                Ok(server) => {
                    app.manage(server);
                }
                Err(e) => {
                    log::warn!("Hook server failed to start: {e}");
                }
            }
            Ok(())
        })
        .manage(Mutex::new(app_state))
        .manage(Mutex::new(PtyManager::new()))
        .manage(server_manager::TermlingsServerManager::new())
        .invoke_handler(tauri::generate_handler![
            // Project commands
            project::list_projects,
            project::add_project,
            project::remove_project,
            project::set_active_project,
            project::get_active_project_id,
            project::set_active_tab,
            project::get_active_tab,
            project::reveal_in_finder,
            project::open_in_editor,
            // PTY commands
            pty_manager::spawn_session,
            pty_manager::write_to_session,
            pty_manager::resize_session,
            pty_manager::kill_session,
            pty_manager::list_sessions,
            pty_manager::get_saved_sessions,
            pty_manager::close_saved_session,
            pty_manager::set_tool_session_id,
            pty_manager::rename_session,
            pty_manager::get_last_session,
            // Server commands
            server_manager::ensure_project_server,
            // Preset commands
            preset::list_presets,
            preset::add_preset,
            preset::remove_preset,
            preset::update_preset,
            preset::reorder_presets,
            // Termlings commands
            termlings::termlings_list_skills,
            termlings::list_project_agents,
            // Setup commands
            setup::check_dependencies,
            setup::spawn_setup_pty,
            // Snapshot commands
            snapshot::load_project_snapshot,
            snapshot::send_project_message,
            snapshot::resolve_project_request,
            snapshot::dismiss_project_request,
            // Appearance commands
            appearance::get_theme,
            appearance::set_theme,
            appearance::get_code_editor,
            appearance::set_code_editor,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(pty_mgr) = app_handle.try_state::<Mutex<PtyManager>>() {
                    let mut manager = pty_mgr.lock().unwrap();
                    manager.kill_all();
                }
                if let Some(server_mgr) = app_handle.try_state::<server_manager::TermlingsServerManager>() {
                    server_mgr.stop_all();
                }
            }
        });
}
