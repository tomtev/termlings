use crate::server_manager::{ServerInfo, TermlingsServerManager};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::TcpStream;

#[tauri::command]
pub fn load_project_snapshot(
    server_mgr: tauri::State<'_, TermlingsServerManager>,
    project_id: String,
    project_path: String,
) -> Result<Value, String> {
    let server = server_mgr.ensure_project_server(project_id, project_path)?;
    request_json(&server, "GET", "/api/v1/state", None)
}

#[tauri::command]
pub fn send_project_message(
    server_mgr: tauri::State<'_, TermlingsServerManager>,
    project_id: String,
    project_path: String,
    kind: String,
    text: String,
    target: Option<String>,
    from_name: Option<String>,
    from_dna: Option<String>,
) -> Result<Value, String> {
    let server = server_mgr.ensure_project_server(project_id, project_path)?;
    request_json(
        &server,
        "POST",
        "/api/v1/messages",
        Some(json!({
            "kind": kind,
            "text": text,
            "target": target,
            "from": "human:default",
            "fromName": from_name.unwrap_or_else(|| "Operator".to_string()),
            "fromDna": from_dna,
        })),
    )
}

#[tauri::command]
pub fn resolve_project_request(
    server_mgr: tauri::State<'_, TermlingsServerManager>,
    project_id: String,
    project_path: String,
    request_id: String,
    response: String,
) -> Result<Value, String> {
    let server = server_mgr.ensure_project_server(project_id, project_path)?;
    request_json(
        &server,
        "POST",
        "/api/v1/requests/resolve",
        Some(json!({
            "requestId": request_id,
            "response": response,
        })),
    )
}

#[tauri::command]
pub fn dismiss_project_request(
    server_mgr: tauri::State<'_, TermlingsServerManager>,
    project_id: String,
    project_path: String,
    request_id: String,
) -> Result<Value, String> {
    let server = server_mgr.ensure_project_server(project_id, project_path)?;
    request_json(
        &server,
        "POST",
        "/api/v1/requests/dismiss",
        Some(json!({
            "requestId": request_id,
        })),
    )
}

fn request_json(
    server: &ServerInfo,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let host = "127.0.0.1";
    let mut stream = TcpStream::connect((host, server.port))
        .map_err(|e| format!("Failed to connect to Termlings server: {e}"))?;
    let payload = body
        .map(|value| serde_json::to_string(&value).map_err(|e| format!("Failed to encode request JSON: {e}")))
        .transpose()?;

    let request = if let Some(payload) = payload {
        format!(
            "{method} {path} HTTP/1.1\r\nHost: {host}\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            server.token,
            payload.len(),
            payload
        )
    } else {
        format!(
            "{method} {path} HTTP/1.1\r\nHost: {host}\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n",
            server.token
        )
    };

    stream
        .write_all(request.as_bytes())
        .map_err(|e| format!("Failed to request Termlings server: {e}"))?;

    let mut raw = String::new();
    stream
        .read_to_string(&mut raw)
        .map_err(|e| format!("Failed to read Termlings server response: {e}"))?;

    let (head, body) = raw
        .split_once("\r\n\r\n")
        .ok_or_else(|| "Invalid HTTP response from Termlings server".to_string())?;
    let status_line = head.lines().next().unwrap_or_default();
    if !status_line.contains(" 200 ") {
        let error_message = serde_json::from_str::<Value>(body)
            .ok()
            .and_then(|value| value.get("error").and_then(Value::as_str).map(ToString::to_string));
        return Err(error_message.unwrap_or_else(|| format!("Termlings server returned an error: {status_line}")));
    }

    serde_json::from_str(body)
        .map_err(|e| format!("Failed to parse Termlings server JSON: {e}"))
}
