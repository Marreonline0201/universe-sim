# Agent Team Session — Universe Sim

## Overview

Six specialized Claude agents work simultaneously on different game domains.
Each agent owns a slice of the codebase and can communicate with other agents
by calling `reportStatus()`, which broadcasts to the companion status site in real time.

---

## Domain Agents

| Agent ID       | Domain              | Key Files / Directories                          |
|----------------|---------------------|--------------------------------------------------|
| `chemistry`    | Elements, reactions, molecules, materials | `src/chemistry/` |
| `biology`      | Genome, mutation, species, ecosystem | `src/biology/` |
| `physics`      | Grid, fluid, thermal, rigid-body workers | `src/engine/workers/` |
| `civilization` | Buildings, diplomacy, settlements, trade | `src/civilization/` |
| `ai`           | NPC behavior, GOAP, emotions, pathfinding | `src/ai/` |
| `world`        | Planet, weather, rivers, seasons, terrain | `src/world/` |

---

## Spawning Agents (Claude Code team session)

Open a separate terminal for each domain and run:

```bash
claude --agent chemistry   "Work on the chemistry domain: see AGENTS.md for your scope"
claude --agent biology     "Work on the biology domain: see AGENTS.md for your scope"
claude --agent physics     "Work on the physics domain: see AGENTS.md for your scope"
claude --agent civilization "Work on the civilization domain: see AGENTS.md for your scope"
claude --agent ai          "Work on the AI domain: see AGENTS.md for your scope"
claude --agent world       "Work on the world domain: see AGENTS.md for your scope"
```

Or use Claude Code's built-in team session interface if available.

---

## Communication Protocol

Each agent should call `reportStatus()` at key moments:

```typescript
import { reportStatus } from './src/utils/agentBus'

// On start
await reportStatus('chemistry', 'active', 'Adding H2SO4 + H2O reaction chain')

// When sending a message to another agent
await reportStatus('chemistry', 'active',
  'Finalizing acid reactions',
  'Acid rain reactions ready — biology should update plant damage model',
  'biology'   // directed to biology agent
)

// On completion
await reportStatus('chemistry', 'done', 'H2SO4 reactions complete')

// When blocked
await reportStatus('chemistry', 'blocked', 'Waiting for physics worker API')

// When idle
await reportStatus('chemistry', 'idle')
```

### Message guidelines

- `task` — what you're currently working on (short, appears in the agent card)
- `message` — a note for the feed (optional; use when handing off or notifying another agent)
- `to` — set to the target agent ID when the message is directed; omit for broadcast

---

## Inter-Agent Dependencies

```
physics  ─────────────────────────────────► all agents (fluid/thermal primitives)
chemistry ──────────────────────────────► biology (molecules → biochemistry)
biology ─────────────────────────────────► world (species → ecosystem)
world ───────────────────────────────────► civilization (terrain → settlement placement)
civilization ────────────────────────────► ai (settlements → NPC goals)
ai ──────────────────────────────────────► world (NPC actions → world state changes)
```

When your work produces output that another agent depends on, send a directed message.

---

## Viewing Agent Activity

The companion status site shows the **Agent Control Center** panel:
- Six domain cards — one per agent — showing status (ACTIVE / IDLE / BLOCKED / DONE)
- Live message feed with directed messages highlighted in amber

The server URL is set via `VITE_WS_URL` in `.env.local`. The `reportStatus()` utility
derives the HTTP endpoint from this automatically.

---

## File Ownership

Agents should only modify files within their domain. Cross-domain changes require
coordination via the message feed.

| Pattern              | Owner         |
|----------------------|---------------|
| `src/chemistry/**`   | chemistry     |
| `src/biology/**`     | biology       |
| `src/engine/workers/**` | physics    |
| `src/civilization/**` | civilization |
| `src/ai/**`          | ai            |
| `src/world/**`       | world         |
| `src/player/**`      | (shared)      |
| `src/ui/**`          | (shared)      |
| `src/store/**`       | (shared)      |
