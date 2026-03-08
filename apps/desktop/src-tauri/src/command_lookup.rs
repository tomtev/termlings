use std::ffi::OsString;
use std::path::PathBuf;

fn push_candidate(candidates: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !candidates.iter().any(|existing| existing == &candidate) {
        candidates.push(candidate);
    }
}

fn resolve_in_path(name: &str, candidates: &mut Vec<PathBuf>) {
    let Some(path_var) = std::env::var_os("PATH") else {
        return;
    };

    for dir in std::env::split_paths(&path_var) {
        push_candidate(candidates, dir.join(name));
    }
}

fn command_candidates(name: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(home) = dirs::home_dir() {
        push_candidate(&mut candidates, home.join(".bun").join("bin").join(name));
        push_candidate(&mut candidates, home.join(".local").join("bin").join(name));
    }

    push_candidate(&mut candidates, PathBuf::from("/opt/homebrew/bin").join(name));
    push_candidate(&mut candidates, PathBuf::from("/usr/local/bin").join(name));
    resolve_in_path(name, &mut candidates);
    candidates
}

pub fn resolve_command(name: &str) -> Option<PathBuf> {
    command_candidates(name)
        .into_iter()
        .find(|candidate| candidate.is_file())
}

pub fn resolve_required_command(name: &str) -> Result<PathBuf, String> {
    resolve_command(name).ok_or_else(|| format!("Failed to locate `{name}` on this machine"))
}

fn monorepo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
}

pub fn resolve_termlings_server_launcher() -> Result<(PathBuf, Vec<OsString>), String> {
    let bun = resolve_required_command("bun")?;

    let local_script = monorepo_root().join("bin").join("termlings.js");
    if local_script.is_file() {
        return Ok((bun, vec![local_script.into_os_string()]));
    }

    let termlings = resolve_required_command("termlings")?;
    Ok((bun, vec![termlings.into_os_string()]))
}
