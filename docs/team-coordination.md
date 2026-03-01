# Team Coordination & Collaboration

**Note:** This document describes patterns for the removed sim engine. For the current workspace mode, see [AGENTS.md](../AGENTS.md) and [src/termling-context.md](../src/termling-context.md).

Termlings is designed for **autonomous AI agents & teams** to collaborate, communicate, and accomplish shared goals together or independently.

## Communication patterns

### Discovery

Agents automatically discover each other through the shared world:

```bash
# See all agents currently in the world
termlings action map --sessions

# Returns:
# tl-a8ab0631 Alice (120, 35)
# tl-2fb0e8aa Bob (80, 40)
# tl-34f20d2b Carol (150, 30)
```

### Direct messaging

Agents can send private messages to teammates:

```bash
# Send a message to another agent
termlings message tl-2fb0e8aa "Let's meet in the conference room"

# Check your inbox
termlings action inbox

# Outputs:
# From: Bob (tl-2fb0e8aa) at 12:34
# "Sure! I'll be there in 2 minutes"
```

### Shared chat

Post to a shared chat visible to the sim operator (useful for debugging or announcements):

```bash
# Post to shared chat
termlings action chat "Starting report generation"
```

## Physical coordination

### Meeting spaces

Agents can coordinate to meet at specific locations:

```bash
# Agents in the office can meet at desks, conference rooms, or break room
# Walk to a location
termlings action walk 120,35

# Check who else is nearby by reading the map
termlings action map | jq '.map.agents[] | select(.x > 110 and .x < 130 and .y > 30 and .y < 45)'
```

### Object interaction

Agents can share and interact with objects:

```bash
# Sit at a desk to "work"
termlings action walk 120,35  # Walk to desk

# Place objects in shared spaces
termlings action place sign 100,40 --preview
termlings action place sign 100,40  # Confirm placement

# Destroy objects (cleanup)
termlings action destroy 100,40
```

## Collaborative workflows

### Task coordination

Agents can divide labor:

1. **Alice** reads input data and posts summary to chat
2. **Bob** processes the data and creates an artifact
3. **Carol** validates results and reports completion

All agents can see what's happening through:
- Direct messages about current status
- Chat updates on progress
- Physical presence (who's at which desk/room)
- Persistent objects placed in the world

### Information sharing

Create shared artifacts that persist:

```bash
# Place a sign with information at a central location
termlings action place sign 120,50 --preview

# Other agents can navigate to that location and see what's there
# They can read the sign and understand context
```

### Parallel work

Multiple agents can work independently but observably:

```bash
# Agent A works on desk 1 (60, 22)
termlings action walk 60,22

# Agent B works on desk 2 (110, 22)
termlings action walk 110,22

# Agent C works on desk 3 (160, 22)
termlings action walk 160,22

# All agents can see each other's locations via the map
# They can send messages if they need to coordinate
```

## Communication best practices

### Reliable messaging

For important communication, use direct messages with confirmation:

```bash
# Agent A sends a task request
termlings message tl-bob "Need you to analyze /data/users.csv"

# Agent B confirms receipt and status
termlings message tl-alice "Got it, analyzing now. Will report in 5 minutes"
```

### Status updates

Post periodic updates to chat for observability:

```bash
# Share what you're doing
termlings action chat "Processing 1000 records... 25% complete"

# Alert the team when done
termlings action chat "Analysis complete. Results in /tmp/report.json"
```

### Error handling

When something goes wrong, inform teammates:

```bash
# Let others know about problems
termlings action chat "Error: database connection failed, retrying..."

# Send direct message for urgent issues
termlings message tl-manager "Production issue detected on server 3"
```

## Advanced patterns

### Work stealing

When one agent finishes early, it can offer to help others:

```bash
# Agent A finishes its task
termlings action chat "Finished early. Can I help anyone?"

# Agent B requests help
termlings message tl-alice "Yes! Can you help validate these records?"
```

### Negotiation

Agents can negotiate complex tasks:

```bash
# Alice proposes a division of work
termlings message tl-bob "How about you handle the EU data and I handle US?"

# Bob responds
termlings message tl-alice "Works for me. Meet at conf room when done?"

# They synchronize
termlings action walk 20,75   # Conference room location
```

### Emergent specialization

Over time, agents develop specializations based on success:

- **Alice** becomes the expert at data analysis (always volunteers for data tasks)
- **Bob** focuses on writing reports and documentation
- **Carol** specializes in validation and quality assurance

This emerges naturally from agents seeing what they're good at and teammates requesting them for those tasks.

## Debugging communication

### Monitor message flow

```bash
# Watch incoming messages in real-time
termlings action inbox

# Post debug info to shared chat
termlings action chat "DEBUG: About to process 5000 records"

# Check who's online and where
termlings action map --sessions
```

### Coordinate timing

```bash
# Wait for a teammate before proceeding
termlings action chat "Waiting for Bob to finish preprocessing..."

# They respond
termlings message tl-alice "Done! Moving to validation."

# Both proceed in parallel
```

## Example: Parallel report generation

```
Alice (team lead)
  → Reads instructions
  → Sends tasks to Bob and Carol
  → Monitors progress
  → Assembles final report

Bob (data processor)
  → Receives task from Alice
  → Processes dataset A
  → Posts progress updates
  → Sends results to Alice

Carol (data processor)
  → Receives task from Alice
  → Processes dataset B
  → Posts progress updates
  → Sends results to Alice

Timeline:
1. Alice reads assignment and sends split tasks (broadcast)
2. Bob and Carol start work in parallel (visible on map)
3. Both post progress updates to chat (every 30 seconds)
4. Bob finishes first, sends message to Alice
5. Carol finishes, sends message to Alice
6. Alice combines results and announces completion
```

## See also

- [AGENTS.md](../AGENTS.md) — Complete agent commands and IPC protocol
- [docs/sim-engine.md](sim-engine.md) — How the sim engine processes agent actions
- [docs/objects.md](objects.md) — Objects system for shared artifacts and spaces
