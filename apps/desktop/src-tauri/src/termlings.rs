use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsResponse {
    pub ok: bool,
    pub skills: Vec<SkillInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectAgent {
    pub slug: String,
    pub name: String,
    pub title: Option<String>,
    pub title_short: Option<String>,
    pub sort_order: Option<i32>,
}

fn parse_frontmatter(content: &str) -> (Option<String>, Option<String>) {
    let normalized = content.replace("\r\n", "\n");
    let Some(rest) = normalized.strip_prefix("---\n") else {
        return (None, None);
    };
    let Some((frontmatter, _)) = rest.split_once("\n---") else {
        return (None, None);
    };

    let mut name = None;
    let mut description = None;

    for line in frontmatter.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let cleaned = value.trim().trim_matches('"').trim_matches('\'').to_string();
        if cleaned.is_empty() {
            continue;
        }

        match key.trim() {
            "name" => name = Some(cleaned),
            "description" => description = Some(cleaned),
            _ => {}
        }
    }

    (name, description)
}

fn skill_dirs(cwd: &Path) -> Vec<(PathBuf, &'static str)> {
    let mut dirs = vec![
        (cwd.join(".agents").join("skills"), "project"),
        (cwd.join(".claude").join("skills"), "project"),
    ];

    if let Some(home) = dirs::home_dir() {
        dirs.push((home.join(".claude").join("skills"), "personal"));
    }

    dirs
}

fn parse_frontmatter_number(content: &str, key: &str) -> Option<i32> {
    let pattern = format!(r"(?m)^{}:\s*(.+)$", regex::escape(key));
    let regex = regex::Regex::new(&pattern).ok()?;
    let raw = regex
        .captures(content)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().trim().trim_matches('"').trim_matches('\''))?;
    raw.parse::<i32>().ok()
}

fn parse_frontmatter_value(content: &str, key: &str) -> Option<String> {
    let pattern = format!(r"(?m)^{}:\s*(.+)$", regex::escape(key));
    let regex = regex::Regex::new(&pattern).ok()?;
    regex
        .captures(content)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().trim().trim_matches('"').trim_matches('\'').to_string())
        .filter(|value| !value.is_empty())
}

fn read_skill(base_dir: &Path, slug: &str, scope: &str) -> Option<SkillInfo> {
    let content = fs::read_to_string(base_dir.join(slug).join("SKILL.md")).ok()?;
    let (name, description) = parse_frontmatter(&content);

    Some(SkillInfo {
        id: format!("{scope}:{slug}"),
        name: name.unwrap_or_else(|| slug.to_string()),
        description: description.unwrap_or_default(),
        scope: scope.to_string(),
    })
}

#[tauri::command]
pub fn termlings_list_skills(cwd: String) -> Result<SkillsResponse, String> {
    let cwd = PathBuf::from(cwd);
    let mut seen = HashSet::new();
    let mut skills = Vec::new();

    for (base_dir, scope) in skill_dirs(&cwd) {
        let Ok(entries) = fs::read_dir(&base_dir) else {
            continue;
        };

        let mut slugs = entries
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let is_dir = entry.file_type().ok()?.is_dir();
                if !is_dir {
                    return None;
                }
                Some(entry.file_name().to_string_lossy().to_string())
            })
            .collect::<Vec<_>>();

        slugs.sort();

        for slug in slugs {
            if !seen.insert(slug.clone()) {
                continue;
            }
            if let Some(skill) = read_skill(&base_dir, &slug, scope) {
                skills.push(skill);
            }
        }
    }

    Ok(SkillsResponse { ok: true, skills })
}

#[tauri::command]
pub fn list_project_agents(project_path: String) -> Result<Vec<ProjectAgent>, String> {
    let agents_dir = PathBuf::from(project_path).join(".termlings").join("agents");
    let Ok(entries) = fs::read_dir(&agents_dir) else {
        return Ok(Vec::new());
    };

    let mut agents = Vec::new();

    for entry in entries.filter_map(Result::ok) {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }

        let slug = entry.file_name().to_string_lossy().to_string();
        if slug.starts_with('.') {
            continue;
        }

        let soul_path = entry.path().join("SOUL.md");
        let Ok(content) = fs::read_to_string(&soul_path) else {
            continue;
        };

        let Some(name) = parse_frontmatter_value(&content, "name") else {
            continue;
        };

        agents.push(ProjectAgent {
            slug,
            name,
            title: parse_frontmatter_value(&content, "title"),
            title_short: parse_frontmatter_value(&content, "title_short"),
            sort_order: parse_frontmatter_number(&content, "sort_order"),
        });
    }

    agents.sort_by(|a, b| {
        let a_order = a.sort_order.unwrap_or(0);
        let b_order = b.sort_order.unwrap_or(0);
        a_order
            .cmp(&b_order)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(agents)
}
