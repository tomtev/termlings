use crate::command_lookup::resolve_termlings_server_launcher;
use serde::Serialize;
use std::collections::HashMap;
use std::fs::{create_dir_all, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize)]
pub struct ServerInfo {
    pub project_id: String,
    pub project_path: String,
    pub base_url: String,
    pub token: String,
    pub port: u16,
    pub pid: Option<u32>,
}

struct ManagedServer {
    project_path: String,
    token: String,
    port: u16,
    child: Child,
}

pub struct TermlingsServerManager {
    servers: Mutex<HashMap<String, ManagedServer>>,
}

impl TermlingsServerManager {
    pub fn new() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
        }
    }

    pub fn stop_all(&self) {
        let mut servers = self.servers.lock().unwrap();
        for (_, mut server) in servers.drain() {
            let _ = server.child.kill();
            let _ = server.child.wait();
        }
    }

    fn server_info(project_id: &str, server: &ManagedServer) -> ServerInfo {
        ServerInfo {
            project_id: project_id.to_string(),
            project_path: server.project_path.clone(),
            base_url: format!("http://127.0.0.1:{}", server.port),
            token: server.token.clone(),
            port: server.port,
            pid: Some(server.child.id()),
        }
    }

    pub fn ensure_project_server(
        &self,
        project_id: String,
        project_path: String,
    ) -> Result<ServerInfo, String> {
        let mut servers = self.servers.lock().unwrap();

        if let Some(existing) = servers.get_mut(&project_id) {
            match existing.child.try_wait() {
                Ok(None) if existing.project_path == project_path => {
                    return Ok(Self::server_info(&project_id, existing));
                }
                Ok(_) | Err(_) => {
                    if let Some(mut dead) = servers.remove(&project_id) {
                        let _ = dead.child.kill();
                        let _ = dead.child.wait();
                    }
                }
            }
        }

        let port = reserve_port()?;
        let token = uuid::Uuid::new_v4().to_string();
        let (launcher, launcher_args) = resolve_termlings_server_launcher()?;
        let mut command = Command::new(launcher);
        command
            .args(launcher_args)
            .args([
                "--server",
                "--host",
                "127.0.0.1",
                "--port",
                &port.to_string(),
                "--token",
                &token,
            ])
            .current_dir(&project_path)
            .stdin(Stdio::null());

        if let Some((stdout, stderr)) = server_log_stdio(&project_id)? {
            command.stdout(stdout);
            command.stderr(stderr);
        } else {
            command.stdout(Stdio::null());
            command.stderr(Stdio::null());
        }

        let mut child = command
            .spawn()
            .map_err(|e| format!("Failed to start `termlings --server`: {e}"))?;

        wait_for_server(&mut child, port)?;

        let server = ManagedServer {
            project_path,
            token,
            port,
            child,
        };

        servers.insert(project_id.clone(), server);
        Ok(Self::server_info(
            &project_id,
            servers.get(&project_id).expect("inserted server missing"),
        ))
    }
}

impl Default for TermlingsServerManager {
    fn default() -> Self {
        Self::new()
    }
}

fn reserve_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to reserve server port: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read reserved port: {e}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn server_log_stdio(project_id: &str) -> Result<Option<(Stdio, Stdio)>, String> {
    let Some(home) = dirs::home_dir() else {
        return Ok(None);
    };
    let log_dir = home.join(".termlings-app").join("logs");
    create_dir_all(&log_dir).map_err(|e| format!("Failed to create server log directory: {e}"))?;

    let log_path = log_dir.join(format!("server-{project_id}.log"));
    let log_file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(log_path)
        .map_err(|e| format!("Failed to open server log file: {e}"))?;
    let stderr_file = log_file
        .try_clone()
        .map_err(|e| format!("Failed to clone server log file handle: {e}"))?;

    Ok(Some((Stdio::from(log_file), Stdio::from(stderr_file))))
}

fn wait_for_server(child: &mut Child, port: u16) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(8);

    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(format!("`termlings --server` exited early with status {status}"));
            }
            Ok(None) => {}
            Err(e) => return Err(format!("Failed to inspect server process: {e}")),
        }

        if healthcheck(port).unwrap_or(false) {
            return Ok(());
        }

        std::thread::sleep(Duration::from_millis(150));
    }

    Err("Timed out waiting for `termlings --server` to become ready".to_string())
}

fn healthcheck(port: u16) -> Result<bool, String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .map_err(|e| format!("Failed to connect to server: {e}"))?;
    stream
        .set_read_timeout(Some(Duration::from_millis(300)))
        .map_err(|e| format!("Failed to set server read timeout: {e}"))?;
    stream
        .set_write_timeout(Some(Duration::from_millis(300)))
        .map_err(|e| format!("Failed to set server write timeout: {e}"))?;

    stream
        .write_all(b"GET /api/hub/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .map_err(|e| format!("Failed to write server health request: {e}"))?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|e| format!("Failed to read server health response: {e}"))?;

    Ok(response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
}

#[tauri::command]
pub fn ensure_project_server(
    server_mgr: tauri::State<'_, TermlingsServerManager>,
    project_id: String,
    project_path: String,
) -> Result<ServerInfo, String> {
    server_mgr.ensure_project_server(project_id, project_path)
}
