const ANSI_REGEX = /\u001B\[[0-9;?]*[ -/]*[@-~]/g

export const REFRESH_MS = 1_000
export const HEARTBEAT_MS = 10_000
export const AVATAR_ANIM_MS = 450
export const JOIN_WAVE_MS = 4_000
export const TALK_ANIM_MS = 2_000

export const ANSI_RESET = "\x1b[0m"
export const FG_FRAME = "\x1b[38;5;244m"
export const FG_FRAME_LABEL = "\x1b[38;5;250m"
export const FG_META = "\x1b[38;5;250m"
export const FG_SUBTLE_HINT = "\x1b[38;5;245m"
export const FG_MD_HEADING = "\x1b[38;5;151m"
export const FG_MD_CODE = "\x1b[38;5;186m"
export const FG_MD_QUOTE = "\x1b[38;5;109m"
export const FG_SELECTED = "\x1b[38;5;81m"
export const FG_ACTIVE = "\x1b[38;5;255m"
export const FG_PROMPT = "\x1b[38;5;252m"
export const FG_PLACEHOLDER = "\x1b[38;5;245m"
export const FG_CURSOR_BLOCK = "\x1b[38;5;255m"
export const BG_INPUT_PANEL = "\x1b[48;5;235m"
export const BG_OFFLINE_PANEL = "\x1b[48;5;52m"
export const FG_INPUT = "\x1b[38;5;253m"
export const FG_OFFLINE_TEXT = "\x1b[38;5;252m"
export const FG_IMAGE_TOKEN = "\x1b[38;5;216m"
export const FG_MENTION_TOKEN = "\x1b[38;5;117m"

export const MESSAGE_SCROLL_STEP = 3
export const CARD_SPACER_LINES = 0

export const FRAME_H = "─"
export const FRAME_V = "│"
export const FRAME_TL = "╭"
export const FRAME_TR = "╮"
export const FRAME_BL = "╰"
export const FRAME_BR = "╯"

export function visibleLength(input: string): number {
  return input.replace(ANSI_REGEX, "").length
}

export function padAnsi(input: string, width: number): string {
  const len = visibleLength(input)
  if (len >= width) return input
  return `${input}${" ".repeat(width - len)}`
}

export function truncatePlain(input: string, maxWidth: number): string {
  if (maxWidth <= 0) return ""
  if (input.length <= maxWidth) return input
  if (maxWidth <= 3) return input.slice(0, maxWidth)
  return `${input.slice(0, maxWidth - 3)}...`
}

export function fitPlain(input: string, width: number): string {
  const trimmed = truncatePlain(input, width)
  if (trimmed.length >= width) return trimmed
  return `${trimmed}${" ".repeat(width - trimmed.length)}`
}

export function wrapPlain(input: string, width: number): string[] {
  const safeWidth = Math.max(1, width)
  const paragraphs = input.replace(/\r\n/g, "\n").split("\n")
  const out: string[] = []

  for (const paragraph of paragraphs) {
    const text = paragraph.trim()
    if (text.length === 0) {
      out.push("")
      continue
    }

    const words = text.split(/\s+/)
    let line = ""
    for (const originalWord of words) {
      let word = originalWord

      if (word.length > safeWidth) {
        if (line.length > 0) {
          out.push(line)
          line = ""
        }
        while (word.length > safeWidth) {
          out.push(word.slice(0, safeWidth))
          word = word.slice(safeWidth)
        }
      }

      if (word.length === 0) continue
      if (line.length === 0) {
        line = word
        continue
      }

      if (line.length + 1 + word.length <= safeWidth) {
        line += ` ${word}`
      } else {
        out.push(line)
        line = word
      }
    }

    if (line.length > 0) {
      out.push(line)
    }
  }

  if (out.length === 0) {
    return [""]
  }
  return out
}

export function chunkPlain(input: string, width: number): string[] {
  const safeWidth = Math.max(1, width)
  if (input.length === 0) return [""]
  const out: string[] = []
  for (let index = 0; index < input.length; index += safeWidth) {
    out.push(input.slice(index, index + safeWidth))
  }
  return out
}

export function grayBar(input: string, width: number, bg: string): string {
  return `${bg}${FG_INPUT}${fitPlain(input, width)}${ANSI_RESET}`
}

export function offlineBar(input: string, width: number): string {
  return `${BG_OFFLINE_PANEL}${FG_OFFLINE_TEXT}${fitPlain(input, width)}${ANSI_RESET}`
}

export function viewHeaderBar(icon: string, text: string, width: number): string {
  const content = `${icon} ${text}`
  const contentWidth = Math.max(0, width - 1)
  const safeText = truncatePlain(content, contentWidth)
  return `${FG_META}${fitPlain(safeText, contentWidth)}${ANSI_RESET}`
}

export function viewHeaderBorder(width: number): string {
  const mutedDivider = "\x1b[38;5;238m"
  return `${mutedDivider}${FRAME_H.repeat(Math.max(0, width - 1))}${ANSI_RESET}`
}

export function composerInputBar(
  prefix: string,
  body: string,
  width: number,
  placeholder: boolean,
  cursor = "",
  cursorIndex?: number,
): string {
  const safeWidth = Math.max(0, width)
  if (safeWidth === 0) return ""

  const safePrefix = prefix
  const cursorWidth = visibleLength(cursor)
  const availableBody = Math.max(0, safeWidth - visibleLength(safePrefix) - cursorWidth)
  const bodyColor = placeholder ? FG_PLACEHOLDER : FG_PROMPT
  const bodyText = truncatePlain(body, availableBody)
  const renderBodyText = (value: string): string => (
    placeholder ? value : highlightComposerTokens(value, bodyColor)
  )

  if (placeholder && cursorWidth > 0) {
    const padding = " ".repeat(Math.max(0, availableBody - bodyText.length))
    return `${BG_INPUT_PANEL}${FG_INPUT}${safePrefix}${cursor}${bodyColor}${bodyText}${FG_INPUT}${padding}${ANSI_RESET}`
  }

  if (cursorWidth > 0 && cursorIndex !== undefined) {
    const clampedIndex = Math.max(0, Math.min(body.length, cursorIndex))
    const start = clampedIndex > availableBody ? clampedIndex - availableBody : 0
    const visible = body.slice(start, start + availableBody)
    const inViewIndex = Math.max(0, Math.min(visible.length, clampedIndex - start))
    const before = visible.slice(0, inViewIndex)
    const after = visible.slice(inViewIndex)
    const used = before.length + after.length
    const padding = " ".repeat(Math.max(0, availableBody - used))
    return `${BG_INPUT_PANEL}${FG_INPUT}${safePrefix}${bodyColor}${renderBodyText(before)}${cursor}${bodyColor}${renderBodyText(after)}${FG_INPUT}${padding}${ANSI_RESET}`
  }

  const padding = " ".repeat(Math.max(0, availableBody - bodyText.length))
  return `${BG_INPUT_PANEL}${FG_INPUT}${safePrefix}${bodyColor}${renderBodyText(bodyText)}${cursor}${FG_INPUT}${padding}${ANSI_RESET}`
}

function highlightComposerTokens(input: string, baseColor: string): string {
  if (!input) return input
  const tokenRegex = /\[Image #\d+\]|\[Pasted Content(?: #\d+)? \d+ chars\]|@[a-zA-Z0-9._-]+/g
  let out = ""
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(input)) !== null) {
    const token = match[0]
    const start = match.index
    const previous = start > 0 ? input[start - 1] : ""
    const isMention = token.startsWith("@")

    if (isMention && /[a-zA-Z0-9._-]/.test(previous)) {
      continue
    }

    out += input.slice(lastIndex, start)
    out += `${isMention ? FG_MENTION_TOKEN : FG_IMAGE_TOKEN}${token}${baseColor}`
    lastIndex = start + token.length
  }

  if (lastIndex === 0) return input
  out += input.slice(lastIndex)
  return out
}

export function panelBodyLine(input: string, width: number): string {
  const withPadding = ` ${input}`
  const safeWidth = Math.max(0, width)
  if (withPadding.includes("\x1b[")) {
    return padAnsi(withPadding, safeWidth)
  }
  return fitPlain(withPadding, safeWidth)
}

export function boxTop(width: number, label: string): string {
  const innerWidth = Math.max(0, width - 2)
  const trimmedLabel = truncatePlain(label, Math.max(0, innerWidth - 2))
  if (trimmedLabel.length === 0) {
    return `${FG_FRAME}${FRAME_TL}${FRAME_H.repeat(innerWidth)}${FRAME_TR}${ANSI_RESET}`
  }
  const used = trimmedLabel.length + 2
  const dashCount = Math.max(0, innerWidth - used)
  return `${FG_FRAME}${FRAME_TL} ${FG_FRAME_LABEL}${trimmedLabel}${FG_FRAME} ${FRAME_H.repeat(dashCount)}${FRAME_TR}${ANSI_RESET}`
}

export function boxBottom(width: number): string {
  return `${FG_FRAME}${FRAME_BL}${FRAME_H.repeat(Math.max(0, width - 2))}${FRAME_BR}${ANSI_RESET}`
}

export function boxAnsiLine(input: string, width: number): string {
  const inner = Math.max(0, width - 4)
  return `${FG_FRAME}${FRAME_V} ${ANSI_RESET}${padAnsi(input, inner)}${FG_FRAME} ${FRAME_V}${ANSI_RESET}`
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

export function isHumanAddress(id?: string): boolean {
  if (!id) return false
  return id === "owner" || id === "operator" || id.startsWith("human:")
}

export function statusIcon(status: string): string {
  if (status === "completed") return "v"
  if (status === "blocked") return "!"
  if (status === "in-progress") return "~"
  if (status === "claimed") return "*"
  return "o"
}
