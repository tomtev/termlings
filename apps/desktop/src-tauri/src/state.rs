use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn default_true() -> bool {
    true
}

fn default_theme() -> String {
    "system".into()
}

fn default_code_editor() -> String {
    "code".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub label: String,
    pub command: String,
    /// If Some, only applies to this project
    pub project_id: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub project_id: String,
    pub label: String,
    pub command: String,
    #[serde(default)]
    pub agent_slug: Option<String>,
    pub channel: Option<String>,
    /// The underlying tool's session ID (e.g. Claude Code's session ID for --resume)
    #[serde(default)]
    pub tool_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LastSession {
    pub command: String,
    pub label: String,
    pub channel: Option<String>,
    pub tool_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub projects: Vec<Project>,
    pub active_project_id: Option<String>,
    pub presets: Vec<Preset>,
    /// project_id -> active tab session_id
    pub active_tabs: HashMap<String, String>,
    /// Sessions persisted across app restarts (for resume)
    #[serde(default)]
    pub saved_sessions: Vec<SessionInfo>,
    /// "dark" | "light" | "system"
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Code editor command (e.g. "code", "cursor", "zed", "idea")
    #[serde(default = "default_code_editor")]
    pub code_editor: String,
    /// project_id -> last session info (for quick resume when all sessions are closed)
    #[serde(default)]
    pub last_sessions: HashMap<String, LastSession>,
}

/// IDs of built-in default presets (used for migration on load).
pub const DEFAULT_PRESET_IDS: &[&str] = &["termlings", "termlings-brief", "termlings-claude"];

impl Default for AppState {
    fn default() -> Self {
        Self {
            projects: Vec::new(),
            active_project_id: None,
            presets: vec![
                Preset {
                    id: "termlings".into(),
                    label: "termlings".into(),
                    command: "termlings".into(),
                    project_id: None,
                    enabled: true,
                },
                Preset {
                    id: "termlings-brief".into(),
                    label: "termlings brief".into(),
                    command: "termlings brief".into(),
                    project_id: None,
                    enabled: true,
                },
                Preset {
                    id: "termlings-claude".into(),
                    label: "termlings claude --dangerously-skip-permissions".into(),
                    command: "termlings claude --dangerously-skip-permissions".into(),
                    project_id: None,
                    enabled: true,
                },
            ],
            active_tabs: HashMap::new(),
            saved_sessions: Vec::new(),
            theme: "system".into(),
            code_editor: "code".into(),
            last_sessions: HashMap::new(),
        }
    }
}
