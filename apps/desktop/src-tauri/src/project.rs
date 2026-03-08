use crate::config;
use crate::state::AppState;
use crate::state::Project;
use std::sync::Mutex;
use tauri::State;

pub type AppStateMutex = Mutex<AppState>;

#[tauri::command]
pub fn list_projects(state: State<'_, AppStateMutex>) -> Vec<Project> {
    let s = state.lock().unwrap();
    s.projects.clone()
}

#[tauri::command]
pub fn add_project(
    state: State<'_, AppStateMutex>,
    path: String,
) -> Result<Project, String> {
    let mut s = state.lock().unwrap();

    // Check for duplicate path
    if s.projects.iter().any(|p| p.path == path) {
        return Err("Project already added".into());
    }

    let name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path,
    };

    s.projects.push(project.clone());
    if s.active_project_id.is_none() {
        s.active_project_id = Some(project.id.clone());
    }
    config::save_state(&s);
    Ok(project)
}

#[tauri::command]
pub fn remove_project(state: State<'_, AppStateMutex>, project_id: String) -> Result<(), String> {
    let mut s = state.lock().unwrap();
    s.projects.retain(|p| p.id != project_id);
    if s.active_project_id.as_deref() == Some(&project_id) {
        s.active_project_id = s.projects.first().map(|p| p.id.clone());
    }
    s.active_tabs.remove(&project_id);
    config::save_state(&s);
    Ok(())
}

#[tauri::command]
pub fn set_active_project(state: State<'_, AppStateMutex>, project_id: String) {
    let mut s = state.lock().unwrap();
    s.active_project_id = Some(project_id);
    config::save_state(&s);
}

#[tauri::command]
pub fn get_active_project_id(state: State<'_, AppStateMutex>) -> Option<String> {
    let s = state.lock().unwrap();
    s.active_project_id.clone()
}

#[tauri::command]
pub fn set_active_tab(
    state: State<'_, AppStateMutex>,
    project_id: String,
    session_id: String,
) {
    let mut s = state.lock().unwrap();
    s.active_tabs.insert(project_id, session_id);
    config::save_state(&s);
}

#[tauri::command]
pub fn get_active_tab(state: State<'_, AppStateMutex>, project_id: String) -> Option<String> {
    let s = state.lock().unwrap();
    s.active_tabs.get(&project_id).cloned()
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to reveal: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to reveal: {e}"))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to reveal: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_in_editor(state: State<'_, AppStateMutex>, path: String) -> Result<(), String> {
    let editor = {
        let s = state.lock().unwrap();
        s.code_editor.clone()
    };
    std::process::Command::new(&editor)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open {editor}: {e}"))?;
    Ok(())
}
