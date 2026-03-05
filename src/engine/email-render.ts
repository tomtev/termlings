import { basename } from "path"

export type EmailVars = Record<string, string>

export function parseVarsOption(raw: string | undefined): EmailVars {
  if (!raw) return {}
  const vars: EmailVars = {}
  for (const part of raw.split(/[;,]/)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex <= 0) {
      throw new Error(`Invalid vars entry: ${trimmed} (expected key=value)`)
    }
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) {
      throw new Error(`Invalid vars key: ${key}`)
    }
    vars[key] = value
  }
  return vars
}

export function mergeVars(...sources: Array<EmailVars | undefined>): EmailVars {
  const merged: EmailVars = {}
  for (const source of sources) {
    if (!source) continue
    for (const [key, value] of Object.entries(source)) {
      merged[key] = value
    }
  }
  return merged
}

export function defaultEmailVars(now = new Date()): EmailVars {
  return {
    now_iso: now.toISOString(),
    today: now.toISOString().slice(0, 10),
    timestamp_ms: String(now.getTime()),
    project_name: basename(process.cwd()),
    agent_name: process.env.TERMLINGS_AGENT_NAME || "",
    agent_slug: process.env.TERMLINGS_AGENT_SLUG || "",
    session_id: process.env.TERMLINGS_SESSION_ID || "",
  }
}

export function renderDynamicFields(input: string, vars: EmailVars): string {
  if (!input) return input
  return input.replace(/{{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*}}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : `{{${key}}}`
  })
}
