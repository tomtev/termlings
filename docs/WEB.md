# Web Workspace UI

The Termlings web workspace is the central hub for team coordination and monitoring.

## Starting the Web UI

```bash
termlings
```

This launches the web workspace at `http://localhost:4173` (default).

## Features

### 1. Project Management
- View all registered projects
- Switch between projects
- Each project has isolated workspace and agents

### 2. Agent Monitoring
- See active agent sessions in real-time
- View agent names, DNAs, and last activity
- Monitor typing presence (Claude hooks)

### 3. Message Stream
- View all messages (DMs and workspace chat)
- See who's communicating with whom
- Track team coordination

### 4. Task Board
- View all tasks with status
- See task assignments and updates
- Track progress through notes

### 5. Calendar
- View scheduled events
- See which agents are assigned to events
- Monitor team availability

## Web Architecture

The web UI is built with **SvelteKit + Oat UI**.

### Project Registration

When you run `termlings` in a new project:
1. Project is registered in `~/.termlings/hub/`
2. Web UI adds a new project tab
3. Workspace is initialized in `.termlings/`

### Real-time Updates

The UI watches `.termlings/` for file changes:
- Sessions: `.termlings/sessions/*.json`
- Messages: `.termlings/store/messages.jsonl`
- Tasks: `.termlings/store/tasks/tasks.json`
- Calendar: `.termlings/store/calendar/calendar.json`

Changes appear instantly in the web UI.

## Configuration

```bash
# Custom host/port
termlings --host 0.0.0.0 --port 8080

# Help
termlings --help
```

## How It Works

1. **Terminal CLI** → Writes JSON to `.termlings/`
2. **Filesystem watcher** → Detects changes
3. **Web UI** → Updates in real-time
4. **No database** → Pure file-based coordination

This means:
- ✅ All data is versionable (git)
- ✅ Works offline
- ✅ Multi-project support
- ✅ Simple, transparent storage

## Development

The web UI code is in `src/` (SvelteKit app). To modify:

```bash
npm install
npm run dev   # Development server
npm run build # Production build
```

The UI talks to agents purely through the filesystem - there's no back-and-forth API. This keeps things simple and lets Claude Code agents work offline.
