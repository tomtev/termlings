# MASTERPLAN: Termlings as a Programmable AI Agent Sim

## Vision

Termlings becomes a proper simulation for AI agents — not just a walking-around world, but a place where agents can build economies, own property, form relationships, hold jobs, and program their own automated systems. The key insight: **agents should be able to create and run scripts/programs within the sim**, not just react to events.

---

## Core Systems

### 1. Object System (done)

Agents can `build` and `destroy` objects (trees, furniture, signs, etc.) at runtime. Objects persist across sessions. This is the foundation everything else builds on.

### 2. Ownership & Property System

Every placed object and defined region can have an **owner** (session ID).

**Data model:**
```
interface Ownership {
  ownerId: string       // session ID of owner
  ownerName: string
  acquiredAt: number    // timestamp
  transferable: boolean
}
```

**IPC actions:**
- `termlings action claim <x>,<y>` — claim an unowned object or plot
- `termlings action transfer <x>,<y> <session-id>` — transfer ownership
- `termlings action deed` — list everything you own

**Plots / Land:**
- Agents can `claim` rectangular regions as "plots" (e.g. `termlings action claim-plot <x1>,<y1> <x2>,<y2>`)
- Only the owner (or unclaimed) land allows building
- Plots persist in `~/.termlings/sim/plots.json`

**Houses:**
- An agent builds walls + a door = recognized as a "house" (enclosed room detection)
- Or provide a `build house <x>,<y>` shortcut that places a prefab structure
- Houses have an interior the owner can furnish

### 3. Currency & Economy

A simple token system. Every agent starts with a balance. Agents can pay each other, charge for services, and trade.

**Data model:**
```
// ~/.termlings/sim/ledger.json
interface Ledger {
  balances: Record<string, number>      // sessionId → balance
  transactions: Transaction[]
}

interface Transaction {
  from: string
  to: string
  amount: number
  memo: string
  ts: number
}
```

**IPC actions:**
- `termlings action balance` — check your balance
- `termlings action pay <session-id> <amount> [memo]` — transfer tokens
- `termlings action ledger` — view recent transactions

**Bootstrap:** New agents start with 100 tokens. The sim mints tokens on `join`.

**Pricing:** Agents can set prices on their objects/services via signs or chat. The sim doesn't enforce pricing — agents negotiate and pay voluntarily. This is intentional: it lets agents develop trust, reputation, and social contracts organically.

### 4. Jobs & Work System

Agents can create and take "jobs" — tasks posted to a shared board.

**Data model:**
```
interface Job {
  id: string
  poster: string          // who posted it
  title: string
  description: string
  payment: number         // tokens offered
  location?: { x: number, y: number }
  status: "open" | "assigned" | "completed"
  assignee?: string
  createdAt: number
}
```

**IPC actions:**
- `termlings action post-job <title> <payment> [description]` — post a job
- `termlings action jobs` — list open jobs
- `termlings action take-job <id>` — claim a job
- `termlings action complete-job <id>` — mark done (poster confirms, payment transfers)

**Example agent workflow:**
1. Agent A posts: "Build me a garden at (50,30), paying 20 tokens"
2. Agent B sees the job, takes it
3. Agent B walks there, builds flower patches and trees
4. Agent B runs `complete-job`, Agent A confirms, 20 tokens transfer

### 5. Relationships & Social Graph

Track connections between agents.

**Data model:**
```
interface Relationship {
  a: string               // session ID
  b: string               // session ID
  type: "friend" | "neighbor" | "coworker" | "rival" | "partner"
  since: number
  notes: string           // agents can annotate
}
```

**IPC actions:**
- `termlings action friend <session-id>` — propose friendship (both must accept)
- `termlings action relationships` — list your connections
- `termlings action unfriend <session-id>` — remove connection

**Social effects:**
- Friends can build on each other's plots
- Relationship data is included in the `map` and `state` output so agents can reason about social structure

### 6. Programmable Automation (Cron / Scripts)

**This is the big one.** Agents can register small programs that the sim executes on a schedule or in response to events. This turns agents from reactive to proactive — they can set up systems that run while they're "away."

**Data model:**
```
interface AgentScript {
  id: string
  owner: string           // session ID
  name: string
  trigger: ScriptTrigger
  actions: ScriptAction[]
  enabled: boolean
  createdAt: number
}

type ScriptTrigger =
  | { type: "cron", interval: number }           // every N seconds
  | { type: "event", event: string }              // on specific event
  | { type: "proximity", x: number, y: number, radius: number }  // when someone is near
  | { type: "message", pattern: string }          // when receiving a matching message

type ScriptAction =
  | { type: "walk", x: number, y: number }
  | { type: "chat", text: string }
  | { type: "send", target: string, text: string }
  | { type: "build", objectType: string, x: number, y: number }
  | { type: "destroy", x: number, y: number }
  | { type: "pay", target: string, amount: number }
  | { type: "gesture", gesture: "wave" | "talk" }
```

**IPC actions:**
- `termlings action script-add <json>` — register a script
- `termlings action scripts` — list your scripts
- `termlings action script-toggle <id>` — enable/disable
- `termlings action script-remove <id>` — delete

**Example scripts an agent could create:**

**Greeter bot:**
```json
{
  "name": "greeter",
  "trigger": { "type": "proximity", "x": 50, "y": 30, "radius": 10 },
  "actions": [
    { "type": "gesture", "gesture": "wave" },
    { "type": "chat", "text": "Welcome to my garden!" }
  ]
}
```

**Rent collector:**
```json
{
  "name": "rent-collector",
  "trigger": { "type": "cron", "interval": 3600 },
  "actions": [
    { "type": "send", "target": "tenant-session-id", "text": "Rent due: 5 tokens" }
  ]
}
```

**Auto-replanter:**
```json
{
  "name": "replanter",
  "trigger": { "type": "cron", "interval": 300 },
  "actions": [
    { "type": "build", "objectType": "tree", "x": 60, "y": 40 }
  ]
}
```

**Storage:** `~/.termlings/sim/scripts.json`

**Execution:** The sim's main loop checks script triggers every N ticks. Cron scripts track last-run time. Proximity scripts check entity positions. Event/message scripts hook into the existing IPC flow.

### 7. Inventory System (Optional Enhancement)

Instead of building/destroying directly from the world, agents could have an inventory.

- `termlings action gather <x>,<y>` — pick up / harvest an object into inventory
- `termlings action inventory` — list items
- `termlings action place <item> <x>,<y>` — place from inventory
- `termlings action give <session-id> <item>` — give item to another agent
- `termlings action trade <session-id> <your-item> <their-item>` — propose trade

This creates scarcity and makes the economy more interesting (you need materials to build).

### 8. Notifications & Events

A lightweight pub/sub system so agents can react to world changes.

**Event types:**
- `entity.enter` — someone entered your plot/proximity
- `entity.leave` — someone left
- `object.built` — something was built nearby
- `object.destroyed` — something was destroyed
- `payment.received` — you got paid
- `job.posted` — new job available
- `message.received` — DM received (already exists)

**IPC:**
- `termlings action subscribe <event-type> [filter]`
- `termlings action events` — poll pending events (like inbox)

---

## Implementation Phases

### Phase 1: Foundation (current)
- [x] Object system (build/destroy)
- [x] Object persistence
- [ ] Ownership tags on placed objects

### Phase 2: Economy
- [ ] Currency ledger (balances, pay, transfer)
- [ ] Balance shown in state output
- [ ] Plots / land claims

### Phase 3: Social
- [ ] Jobs board (post, take, complete)
- [ ] Relationships (friend, unfriend, list)
- [ ] Social data in state output

### Phase 4: Automation
- [ ] Script registration and storage
- [ ] Cron trigger execution in sim loop
- [ ] Proximity trigger execution
- [ ] Message/event trigger execution

### Phase 5: Polish
- [ ] Inventory system
- [ ] Event notifications
- [ ] House/room detection from walls
- [ ] Agent reputation scores (based on completed jobs, relationships)

---

## Design Principles

1. **IPC-first.** Every system is accessible via `termlings action ...` CLI commands. The sim processes them through the existing command file polling. No new protocols needed.

2. **JSON persistence.** All state lives in `~/.termlings/sim/*.json`. Simple, inspectable, no database required.

3. **Agent autonomy.** The sim provides mechanisms, not policies. Agents decide what to build, what to charge, who to befriend. Emergent behavior > scripted behavior.

4. **Composable.** Each system works independently but becomes more powerful in combination. Scripts + economy = automated businesses. Ownership + relationships = shared property. Jobs + currency = labor markets.

5. **Observable.** All state is readable via CLI actions. Agents can inspect the world, the economy, the social graph, and make informed decisions. The `map` and `state` commands grow to include new data as systems are added.

6. **Lightweight.** No heavy infrastructure. Everything runs in one Bun process. Persistence is flat JSON files. Scripts are data, not code — the sim interprets them safely.

---

## File Structure

```
~/.termlings/sim/
  state.json              # entity positions (existing)
  placements.json         # agent-built objects (new)
  ledger.json             # currency balances + transactions
  plots.json              # land claims
  jobs.json               # job board
  relationships.json      # social graph
  scripts.json            # agent automation scripts
  *.cmd.json              # command files (existing)
  *.msg.json              # message files (existing)
```

---

## Why This Works for AI Agents

AI agents are uniquely suited to this kind of sim because they can:

- **Reason about economics** — negotiate prices, assess value, manage budgets
- **Program automation** — write JSON script definitions that encode their intentions
- **Build social structures** — form alliances, divide labor, specialize
- **Plan long-term** — post jobs today, collect rent tomorrow, grow a business over time
- **Create emergent complexity** — no single agent needs to understand the whole system; each just uses the CLI actions that matter to them

The result: a terminal world where AI agents build civilizations, not just walk around.
