use crate::config;
use crate::hook_server::HookServer;
use crate::server_manager::TermlingsServerManager;
use crate::state::{AppState, LastSession, SessionInfo};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub struct PtySession {
    pub info: SessionInfo,
    pub(crate) master: Box<dyn MasterPty + Send>,
    pub(crate) writer: Box<dyn Write + Send>,
    pub(crate) child: Box<dyn Child + Send + Sync>,
    pub(crate) _reader_handle: std::thread::JoinHandle<()>,
}

pub struct PtyManager {
    pub(crate) sessions: HashMap<String, PtySession>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    pub fn kill_all(&mut self) {
        for (_, session) in self.sessions.drain() {
            terminate_session(session);
        }
    }
}

pub type PtyManagerMutex = Mutex<PtyManager>;

#[tauri::command]
pub fn spawn_session(
    app: AppHandle,
    pty_mgr: tauri::State<'_, PtyManagerMutex>,
    project_id: String,
    command: String,
    label: String,
    cwd: String,
    agent_slug: Option<String>,
    channel: Option<String>,
    dark_mode: Option<bool>,
) -> Result<SessionInfo, String> {
    let session_id = uuid::Uuid::new_v4().to_string();

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let effective_command = command.clone();

    // Spawn an interactive shell that runs the command, then stays open
    // so the user can continue typing after the process exits
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.args(["-i", "-c", &format!("{}; exec {}", effective_command, shell)]);
    cmd.cwd(&cwd);

    // Strip CLAUDECODE to prevent
    // "cannot be launched inside another Claude Code session" errors
    cmd.env_remove("CLAUDECODE");
    cmd.env_remove("TERMLINGS_SESSION_ID");
    cmd.env_remove("TERMLINGS_AGENT_NAME");
    cmd.env_remove("TERMLINGS_AGENT_DNA");
    cmd.env_remove("TERMLINGS_AGENT_SLUG");
    cmd.env_remove("TERMLINGS_AGENT_TITLE");
    cmd.env_remove("TERMLINGS_AGENT_TITLE_SHORT");
    cmd.env_remove("TERMLINGS_AGENT_ROLE");
    cmd.env_remove("TERMLINGS_AGENT_MANAGE_AGENTS");
    cmd.env_remove("TERMLINGS_CONTEXT");
    cmd.env_remove("TERMLINGS_IPC_DIR");
    cmd.env("TERM", "xterm-256color");

    // Tell CLI tools about the terminal background so they can adapt their theme
    match dark_mode {
        Some(true) | None => cmd.env("COLORFGBG", "15;0"),   // white on black
        Some(false) => cmd.env("COLORFGBG", "0;15"),          // black on white
    };

    // Pass hook server details for future runtime integrations.
    if let Some(hook_server) = app.try_state::<HookServer>() {
        cmd.env("TERMLINGS_APP_PORT", hook_server.port.to_string());
        cmd.env("TERMLINGS_APP_SESSION_ID", &session_id);
    }

    // Ensure the local Termlings API sidecar exists for this project and
    // pass its connection details into the terminal environment.
    if let Some(server_mgr) = app.try_state::<TermlingsServerManager>() {
        match server_mgr.ensure_project_server(project_id.clone(), cwd.clone()) {
            Ok(server) => {
                cmd.env("TERMLINGS_API_BASE_URL", server.base_url);
                cmd.env("TERMLINGS_API_TOKEN", server.token);
            }
            Err(err) => {
                log::warn!("Failed to start Termlings server for {project_id}: {err}");
            }
        }
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    // Drop slave — we only need the master side
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    let event_name = format!("pty-output-{}", session_id);
    let sid = session_id.clone();
    let app_for_reader = app.clone();

    let reader_handle = std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // PTY closed — emit exit event
                    let _ = app_for_reader.emit(&format!("pty-exit-{}", sid), ());
                    break;
                }
                Ok(n) => {
                    let data = &buf[..n];
                    // Send as Vec<u8> which Tauri serializes as array of numbers
                    let _ = app_for_reader.emit(&event_name, data.to_vec());
                }
                Err(_) => {
                    let _ = app_for_reader.emit(&format!("pty-exit-{}", sid), ());
                    break;
                }
            }
        }
    });

    let info = SessionInfo {
        id: session_id.clone(),
        project_id,
        label,
        command,
        agent_slug,
        channel,
        tool_session_id: None,
    };

    let session = PtySession {
        info: info.clone(),
        master: pair.master,
        writer,
        child,
        _reader_handle: reader_handle,
    };

    let mut mgr = pty_mgr.lock().unwrap();
    mgr.sessions.insert(session_id, session);

    // Persist session for resume across app restarts
    let app_state: tauri::State<'_, Mutex<AppState>> = app.state();
    {
        let mut state = app_state.lock().unwrap();
        state.saved_sessions.retain(|s| s.id != info.id);
        state.saved_sessions.push(info.clone());
        // Remember as last session for this project (quick resume when all sessions closed)
        state.last_sessions.insert(
            info.project_id.clone(),
            LastSession {
                command: info.command.clone(),
                label: info.label.clone(),
                channel: info.channel.clone(),
                tool_session_id: None,
            },
        );
        config::save_state(&state);
    }

    Ok(info)
}

#[tauri::command]
pub fn write_to_session(
    pty_mgr: tauri::State<'_, PtyManagerMutex>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut mgr = pty_mgr.lock().unwrap();
    if let Some(session) = mgr.sessions.get_mut(&session_id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Write error: {}", e))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("Flush error: {}", e))?;
        Ok(())
    } else {
        Err("Session not found".into())
    }
}

#[tauri::command]
pub fn resize_session(
    pty_mgr: tauri::State<'_, PtyManagerMutex>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mgr = pty_mgr.lock().unwrap();
    if let Some(session) = mgr.sessions.get(&session_id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize error: {}", e))?;
        Ok(())
    } else {
        Err("Session not found".into())
    }
}

#[tauri::command]
pub fn kill_session(
    app: AppHandle,
    pty_mgr: tauri::State<'_, PtyManagerMutex>,
    session_id: String,
) -> Result<(), String> {
    let mut mgr = pty_mgr.lock().unwrap();
    if let Some(session) = mgr.sessions.remove(&session_id) {
        terminate_session(session);
    }

    // Remove from persisted sessions
    let app_state: tauri::State<'_, Mutex<AppState>> = app.state();
    {
        let mut state = app_state.lock().unwrap();
        state.saved_sessions.retain(|s| s.id != session_id);
        config::save_state(&state);
    }

    Ok(())
}

fn terminate_session(mut session: PtySession) {
    if let Some(pid) = session.child.process_id() {
        if pid > 1 {
            unsafe {
                libc::kill(-(pid as i32), libc::SIGTERM);
            }
        }
    }

    let _ = std::thread::spawn(move || {
        for _ in 0..20 {
            std::thread::sleep(std::time::Duration::from_millis(100));
            match session.child.try_wait() {
                Ok(Some(_)) => return,
                _ => continue,
            }
        }
        let _ = session.child.kill();
    });
}

#[tauri::command]
pub fn list_sessions(
    pty_mgr: tauri::State<'_, PtyManagerMutex>,
    project_id: String,
) -> Vec<SessionInfo> {
    let mgr = pty_mgr.lock().unwrap();
    mgr.sessions
        .values()
        .filter(|s| s.info.project_id == project_id)
        .map(|s| s.info.clone())
        .collect()
}

#[tauri::command]
pub fn get_saved_sessions(
    app: AppHandle,
    project_id: String,
) -> Vec<SessionInfo> {
    let app_state: tauri::State<'_, Mutex<AppState>> = app.state();
    let state = app_state.lock().unwrap();
    state
        .saved_sessions
        .iter()
        .filter(|s| s.project_id == project_id)
        .cloned()
        .collect()
}

#[tauri::command]
pub fn close_saved_session(
    app: AppHandle,
    session_id: String,
) -> Result<(), String> {
    let app_state: tauri::State<'_, Mutex<AppState>> = app.state();
    let mut state = app_state.lock().unwrap();
    state.saved_sessions.retain(|s| s.id != session_id);
    config::save_state(&state);
    Ok(())
}

#[tauri::command]
pub fn rename_session(
    app: AppHandle,
    pty_mgr: tauri::State<'_, PtyManagerMutex>,
    session_id: String,
    label: String,
) -> Result<(), String> {
    // Update live session
    let mut mgr = pty_mgr.lock().unwrap();
    if let Some(session) = mgr.sessions.get_mut(&session_id) {
        session.info.label = label.clone();
    }
    drop(mgr);
    // Update saved session
    let app_state: tauri::State<'_, Mutex<AppState>> = app.state();
    let mut state = app_state.lock().unwrap();
    if let Some(s) = state.saved_sessions.iter_mut().find(|s| s.id == session_id) {
        s.label = label;
    }
    config::save_state(&state);
    Ok(())
}

#[tauri::command]
pub fn set_tool_session_id(
    app: AppHandle,
    session_id: String,
    tool_session_id: String,
) -> Result<(), String> {
    let app_state: tauri::State<'_, Mutex<AppState>> = app.state();
    let mut state = app_state.lock().unwrap();
    if let Some(s) = state.saved_sessions.iter_mut().find(|s| s.id == session_id) {
        s.tool_session_id = Some(tool_session_id.clone());
        let project_id = s.project_id.clone();
        // Also update the last_sessions entry for this project
        if let Some(last) = state.last_sessions.get_mut(&project_id) {
            last.tool_session_id = Some(tool_session_id);
        }
        config::save_state(&state);
    }
    Ok(())
}

#[tauri::command]
pub fn get_last_session(
    app: AppHandle,
    project_id: String,
) -> Option<LastSession> {
    let app_state: tauri::State<'_, Mutex<AppState>> = app.state();
    let state = app_state.lock().unwrap();
    state.last_sessions.get(&project_id).cloned()
}
