import { listDueScheduledDrafts, markDraftSent, type EmailDraftData } from "./email-drafts.js"
import { missingRequiredEnvVars, readEmailsConfig, resolveEmailContext, runMessageSend } from "./email.js"

export interface EmailScheduleExecutionResult {
  draftId: string
  title: string
  executed: boolean
  timestamp: number
  error?: string
}

function draftToRecipientLine(draft: EmailDraftData): { to: string; cc?: string; bcc?: string } {
  const to = draft.to.join(", ").trim()
  const cc = draft.cc.join(", ").trim()
  const bcc = draft.bcc.join(", ").trim()
  return {
    to,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
  }
}

export function executeScheduledEmailDrafts(): EmailScheduleExecutionResult[] {
  const now = Date.now()
  const results: EmailScheduleExecutionResult[] = []
  const dueDrafts = listDueScheduledDrafts(now)
  if (dueDrafts.length === 0) return results

  const config = readEmailsConfig()
  if (!config) {
    for (const draft of dueDrafts) {
      results.push({
        draftId: draft.id,
        title: draft.title,
        executed: false,
        timestamp: now,
        error: "Missing .termlings/emails.json",
      })
    }
    return results
  }

  for (const draft of dueDrafts) {
    try {
      const recipients = draftToRecipientLine(draft)
      if (!recipients.to) {
        throw new Error("Draft has no recipients (`to`)")
      }
      if (!draft.subject || draft.subject.trim().length === 0) {
        throw new Error("Draft has no subject")
      }

      const ctx = resolveEmailContext(config, undefined, draft.account)
      const missing = missingRequiredEnvVars(ctx)
      if (missing.length > 0) {
        throw new Error(`Missing required env vars: ${missing.join(", ")}`)
      }

      runMessageSend(ctx, {
        to: recipients.to,
        cc: recipients.cc,
        bcc: recipients.bcc,
        subject: draft.subject,
        body: draft.body,
        from: draft.from?.trim() || ctx.from,
      })
      markDraftSent(draft.id)
      results.push({
        draftId: draft.id,
        title: draft.title,
        executed: true,
        timestamp: Date.now(),
      })
    } catch (error) {
      results.push({
        draftId: draft.id,
        title: draft.title,
        executed: false,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}
