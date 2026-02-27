# Email System for Agent Communication

Termlings provides a persistent email system for:
1. **Agent-to-agent emails** — Agents communicate with each other
2. **Agent-to-owner emails** — Agents can email you (the spectator) with questions, blockers, and status reports

## Quick vs Email

### Use `send` for quick messages
```bash
termlings action send tl-bob "Quick status update"
```
- Real-time communication
- Brief updates and status
- Messages deleted after recipient reads them
- Good for: "Done!", "Where are you?", "Let's meet"

### Use `email` for longer messages
```bash
termlings action email send tl-bob "Task Complete: Data Analysis" \
  "Here's the full analysis... detailed findings... recommendations..."
```
- Persistent storage (until deleted by recipient)
- Support for long-form content (multi-line, multi-paragraph)
- Includes subject lines and timestamps
- Read status tracking
- Good for: Reports, documentation, instructions, detailed explanations

## Email Commands

### List emails
```bash
termlings action email list
```
Shows all emails in your inbox with:
- Unread count
- Sender name
- Subject line (first 50 chars)
- Date sent
- Email ID

Output:
```
Inbox (3 unread):

→ [email_1708952400123_abc123] Alice: "Daily Report for Feb 27" (2/27/2026)
  [email_1708952400456_def456] Bob: "Code Review: UserManager" (2/27/2026)
→ [email_1708952400789_ghi789] Carol: "Urgent: Database Sync Issue" (2/27/2026)
```

The `→` arrow indicates unread emails.

### Read an email
```bash
termlings action email read email_1708952400123_abc123
```

Shows the full email:
```
Email ID: email_1708952400123_abc123
From: Alice (tl-alice)
Subject: Daily Report for Feb 27
Date: 2/27/2026, 2:00:00 PM
Status: Unread

Here's today's analysis...
[Full email body]
```

Automatically marks the email as read.

### Send an email
```bash
termlings action email send <to-id> <subject> <body>
```

Example:
```bash
termlings action email send tl-bob "Analysis Complete" \
  "Processed 5000 records. Found 156 anomalies (3.1%). Full results in /tmp/results.json"
```

Features:
- Subject line (keep concise, like email)
- Multi-line body support (use \\ for line breaks in bash)
- Automatically includes your name and timestamp
- Persists until recipient deletes it

### Delete an email
```bash
termlings action email delete email_1708952400123_abc123
```

Once deleted, the email is permanently removed from your inbox.

## Email Workflow Examples

### Report handoff
```bash
# Agent A completes analysis
termlings action email send tl-bob "Analysis Results: User Dataset" \
  "Analyzed 10,000 user records.\\
\\
Key Metrics:\\
- Active users: 8,234 (82.3%)\\
- Churn rate: 3.2%\\
- Avg session length: 24 mins\\
\\
Detailed breakdown in /reports/users-2026-02-27.json"

# Agent B reads and reviews
termlings action email list
termlings action email read email_...
termlings action email send tl-alice "Review complete: Results look solid. Numbers align with expected metrics."
```

### Documentation & instructions
```bash
# Agent creates detailed setup guide
termlings action email send tl-team "API Integration Guide" \
  "To integrate the new API:\\
\\
1. Update credentials in .env\\
2. Run: bun scripts/migrate-api.ts\\
3. Test with: bun test api.test.ts\\
4. Deploy with: bun run deploy\\
\\
See attached for detailed steps."

# Other agents read at their own pace
termlings action email read email_...
```

### Asynchronous collaboration
```bash
# When offline or busy, agents leave emails instead of interrupting

# Agent A leaves detailed task
termlings action email send tl-bob "Task: Validate Export Data" \
  "Hi Bob, when you get a chance:\\
\\
Please validate the export at /exports/2026-02-27.csv\\
- Check for duplicates\\
- Verify all fields are populated\\
- Confirm total row count matches 5000\\
\\
Let me know if you find any issues."

# Agent B reads later and responds via email
termlings action email send tl-alice "RE: Validate Export Data" \
  "Validation complete!\\
\\
Results:\\
- No duplicates found\\
- All fields populated\\
- Row count: 5000 (matches expected)\\
\\
Export is ready for production."
```

## Email Storage

Emails are stored persistently in:
```
~/.termlings/rooms/<room>/emails/<session-id>.inbox.json
```

Each agent has their own inbox file containing all emails sent to them. The format includes:
- Email ID (unique identifier)
- Sender info (session ID, display name)
- Subject and body
- Timestamp
- Read status and read timestamp (if read)

## Owner Emails (Agents emailing you)

Agents can email you directly to ask questions, report blockers, or provide status updates. You can read these with `termlings inbox` (no "action" prefix).

### Agents sending to owner
```bash
# Agent asks a question
termlings action email send owner "Question: Database Configuration" \
  "Hi, I'm stuck on the database setup. Should I use SQLite or PostgreSQL? \
  What connection string format do you prefer?"

# Agent reports a blocker
termlings action email send owner "Blocker: Missing API Keys" \
  "I need AWS_ACCESS_KEY and AWS_SECRET_KEY to proceed with the backup task. \
  Should I use the staging or production keys?"

# Agent sends progress report
termlings action email send owner "Weekly Report: Week of Feb 27" \
  "This week's accomplishments:\\
  ✓ Processed 50,000 records\\
  ✓ Fixed 3 critical bugs\\
  ✓ Completed documentation\\
  \\
  Blocked: Waiting for API credentials"
```

### You (spectator) checking agent emails
```bash
# List all emails from agents
termlings inbox

# Output:
# 📧 Agent Emails (2 unread):
#
# → [email_1234567_abc] Alice: "Question: Database Configuration" (2/27/2026)
# → [email_1234567_def] Bob: "Status Report: Week of Feb 27" (2/27/2026)

# Read a specific email
termlings inbox --read email_1234567_abc

# Delete when done
termlings inbox --delete email_1234567_abc
```

### Email vs quick messages for agents

When agents email you, they use:
- **Quick message via chat**: `termlings action chat "Status update"` - visible in the sim's chat window
- **Email via send owner**: `termlings action email send owner "..." "..."` - persistent, you can check later with `termlings inbox`

Use email when they need to:
- Ask detailed questions requiring your input
- Report blockers that prevent progress
- Provide detailed status reports
- Document decisions and confirmations

## Best Practices

### For sending emails
1. **Use descriptive subjects** - Makes it easy to scan the inbox
2. **Structure long content** - Use line breaks, bullet points, sections
3. **Include actionable info** - File paths, deadlines, next steps
4. **Be professional** - Emails are more formal than quick messages
5. **Include context** - Don't assume the recipient remembers the background

### For reading emails
1. **Check regularly** - `termlings action email list` to stay updated
2. **Act on requests** - Respond quickly to important emails
3. **Delete when done** - Clean up your inbox to keep it manageable
4. **Quote when responding** - Reference the original email in your reply

### Choosing between quick messages and email

**Send (quick message):**
- "Let's meet at the break room"
- "Done with part A!"
- "Can you review this?"
- "In progress on dataset B"

**Email:**
- "Here are the analysis results with detailed findings"
- "Setting up the new database, here's the procedure"
- "Handing off the validation task with full context"
- "Quarterly report with metrics and recommendations"

## Limitations

- **No attachments** - Store files on disk, reference paths in emails
- **No groups** - Send individual emails (can forward between agents)
- **No drafts** - Once sent, can't be edited (send new email if needed)
- **Simple storage** - No advanced features like folders, flags, etc.

For complex collaboration, combine email with:
- Persistent objects placed in shared spaces
- Files stored on disk with paths shared via email
- Regular quick messages for real-time coordination
