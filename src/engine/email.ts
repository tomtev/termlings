import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"

export interface Email {
  id: string              // Unique email ID (timestamp-based)
  from: string            // Sender session ID
  fromName: string        // Sender name
  to: string              // Recipient session ID
  subject: string         // Email subject line
  body: string            // Email body (can be long)
  timestamp: number       // When sent (milliseconds)
  read: boolean           // Whether recipient has read it
  readAt?: number         // When it was read
}

function emailDir(): string {
  return join(process.cwd(), ".termlings", "store", "email")
}

function inboxFile(sessionId: string): string {
  return join(emailDir(), `${sessionId}.inbox.json`)
}

function ownerInboxFile(): string {
  return join(emailDir(), `OWNER.inbox.json`)
}

function generateEmailId(): string {
  return `email_${Date.now()}_${Math.random().toString(36).substring(7)}`
}

/**
 * Send an email from one agent to another
 */
export function sendEmail(
  from: string,
  fromName: string,
  to: string,
  subject: string,
  body: string
): string {
  mkdirSync(emailDir(), { recursive: true })

  const email: Email = {
    id: generateEmailId(),
    from,
    fromName,
    to,
    subject,
    body,
    timestamp: Date.now(),
    read: false,
  }

  // Load existing emails for this recipient
  const file = inboxFile(to)
  let emails: Email[] = []
  try {
    if (existsSync(file)) {
      const data = readFileSync(file, "utf-8")
      emails = JSON.parse(data)
    }
  } catch (e) {
    // Start fresh if there's an error
  }

  emails.push(email)
  writeFileSync(file, JSON.stringify(emails, null, 2) + "\n")

  return email.id
}

/**
 * Get all emails (read and unread) for a recipient
 */
export function getInbox(sessionId: string): Email[] {
  const file = inboxFile(sessionId)
  try {
    if (!existsSync(file)) {
      return []
    }
    const data = readFileSync(file, "utf-8")
    return JSON.parse(data) as Email[]
  } catch (e) {
    console.error(`Error reading inbox for ${sessionId}: ${e}`)
    return []
  }
}

/**
 * Get a specific email by ID
 */
export function getEmail(sessionId: string, emailId: string): Email | null {
  const emails = getInbox(sessionId)
  const email = emails.find(e => e.id === emailId)
  return email || null
}

/**
 * Mark an email as read
 */
export function markEmailAsRead(sessionId: string, emailId: string): void {
  const file = inboxFile(sessionId)
  let emails = getInbox(sessionId)

  const email = emails.find(e => e.id === emailId)
  if (email) {
    email.read = true
    email.readAt = Date.now()
  }

  writeFileSync(file, JSON.stringify(emails, null, 2) + "\n")
}

/**
 * Delete an email
 */
export function deleteEmail(sessionId: string, emailId: string): void {
  const file = inboxFile(sessionId)
  let emails = getInbox(sessionId)

  emails = emails.filter(e => e.id !== emailId)

  if (emails.length === 0) {
    // Delete the file if inbox is empty
    try {
      require("fs").unlinkSync(file)
    } catch {}
  } else {
    writeFileSync(file, JSON.stringify(emails, null, 2) + "\n")
  }
}

/**
 * Get count of unread emails
 */
export function getUnreadCount(sessionId: string): number {
  const emails = getInbox(sessionId)
  return emails.filter(e => !e.read).length
}

/**
 * Format an email for display
 */
export function formatEmail(email: Email): string {
  const lines: string[] = []
  lines.push(`Email ID: ${email.id}`)
  lines.push(`From: ${email.fromName} (${email.from})`)
  lines.push(`Subject: ${email.subject}`)
  lines.push(`Date: ${new Date(email.timestamp).toLocaleString()}`)
  lines.push(`Status: ${email.read ? `Read at ${new Date(email.readAt!).toLocaleString()}` : "Unread"}`)
  lines.push("")
  lines.push(email.body)
  return lines.join("\n")
}

/**
 * Format inbox listing
 */
export function formatInboxList(emails: Email[]): string {
  if (emails.length === 0) {
    return "No emails in inbox"
  }

  const unread = emails.filter(e => !e.read).length
  const lines: string[] = []
  lines.push(`Inbox (${unread} unread):`)
  lines.push("")

  for (const email of emails) {
    const status = email.read ? "  " : "→ " // Arrow for unread
    const subject = email.subject.substring(0, 50) + (email.subject.length > 50 ? "..." : "")
    const date = new Date(email.timestamp).toLocaleDateString()
    lines.push(`${status}[${email.id}] ${email.fromName}: "${subject}" (${date})`)
  }

  lines.push("")
  lines.push("Use: termlings action email read <id>    - Read full email")
  lines.push("     termlings action email delete <id>  - Delete email")

  return lines.join("\n")
}

// --- Owner emails (emails from agents to you, the spectator) ---

/**
 * Send email to owner (you, the spectator)
 */
export function sendOwnerEmail(
  from: string,
  fromName: string,
  subject: string,
  body: string,
  room = "default"
): string {
  mkdirSync(emailDir(), { recursive: true })

  const email: Email = {
    id: generateEmailId(),
    from,
    fromName,
    to: "OWNER",
    subject,
    body,
    timestamp: Date.now(),
    read: false,
  }

  const file = ownerInboxFile()
  let emails: Email[] = []
  try {
    if (existsSync(file)) {
      const data = readFileSync(file, "utf-8")
      emails = JSON.parse(data)
    }
  } catch (e) {
    // Start fresh if there's an error
  }

  emails.push(email)
  writeFileSync(file, JSON.stringify(emails, null, 2) + "\n")

  return email.id
}

/**
 * Get all owner emails
 */
export function getOwnerInbox(room = "default"): Email[] {
  const file = ownerInboxFile()
  try {
    if (!existsSync(file)) {
      return []
    }
    const data = readFileSync(file, "utf-8")
    return JSON.parse(data) as Email[]
  } catch (e) {
    console.error(`Error reading owner inbox: ${e}`)
    return []
  }
}

/**
 * Get specific owner email
 */
export function getOwnerEmail(emailId: string): Email | null {
  const emails = getOwnerInbox()
  return emails.find(e => e.id === emailId) || null
}

/**
 * Mark owner email as read
 */
export function markOwnerEmailAsRead(emailId: string): void {
  const file = ownerInboxFile()
  let emails = getOwnerInbox()

  const email = emails.find(e => e.id === emailId)
  if (email) {
    email.read = true
    email.readAt = Date.now()
  }

  writeFileSync(file, JSON.stringify(emails, null, 2) + "\n")
}

/**
 * Delete owner email
 */
export function deleteOwnerEmail(emailId: string): void {
  const file = ownerInboxFile()
  let emails = getOwnerInbox()

  emails = emails.filter(e => e.id !== emailId)

  if (emails.length === 0) {
    try {
      require("fs").unlinkSync(file)
    } catch {}
  } else {
    writeFileSync(file, JSON.stringify(emails, null, 2) + "\n")
  }
}

/**
 * Get count of unread owner emails
 */
export function getOwnerUnreadCount(room = "default"): number {
  const emails = getOwnerInbox(room)
  return emails.filter(e => !e.read).length
}
