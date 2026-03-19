# Universe Simulation — Full Redesign Spec
**Date:** 2026-03-19
**Status:** Approved for implementation planning

---

## 1. Core Vision

A scientifically grounded persistent universe that runs continuously on a server — evolving from the Big Bang through particle formation, stellar nucleosynthesis, planetary accretion, abiogenesis, evolution, and eventually living civilizations. Players spawn into this living world as adults. They know they are players. NPCs live authentic lives with knowledge derived from what their civilization has actually discovered — they do not know players are players. There is no artificial "corporation" framing — it is simply a real world that players participate in.

---

## 2. Design Principles

| Principle | Detail |
|-----------|--------|
| **One server, one universe** | No seeds, no instances. One persistent universe on Railway. History is real — stored in Neon Postgres. |
| **Science first** | Known science: real constants, real chemistry, real biology. Unknown: most plausible current theory, documented. |
| **Emergent everything** | Civilizations, knowledge, language, religion, war — all emerge from simulation state. Nothing is scripted. |
| **NPC authenticity** | NPC knowledge = what their civilization discovered. An Iron Age blacksmith knows metallurgy because the sim reached it. LLM is only the voice. |
| **Player as participant** | Players spawn as adults, have meta-awareness (HUD, panels), but appear to NPCs as ordinary humans. |

### Scientific Accuracy Policy
- **Known science**: Real physics constants (G, c, k, h, σ), real chemistry, real biology
- **Unknown science** (e.g. abiogenesis mechanism): Implement most plausible current theory. Document the choice.
- **Completely unknown**: Creative but internally consistent — effects must have causes, even invented ones
- Examples:
  - Big Bang cause → quantum vacuum fluctuation (leading hypothesis)
  - Abiogenesis → RNA World hypothesis (most evidence-supported)
  - Consciousness threshold → emergent above neural complexity score
  - Dark matter → non-interacting massive particles affecting gravity

---

## 3. Server Architecture

### 3.1 Railway Node.js Server (always-on)

The server owns authoritative world time and runs the universe simulation continuously.

```
Railway Server
├── UniverseSim.ts         — Master simulation loop (setInterval at variable rate)
├── EpochManager.ts        — Tracks current epoch, transitions, stores to DB
├── NucleosynthesisEngine.ts — Simulates element formation (H→He→C→O→...→Fe→supernovae)
├── StellarEngine.ts       — Star formation, lifecycle, supernova events
├── PlanetaryEngine.ts     — Planet accretion, geology, atmosphere, water
├── BiologyEngine.ts       — Abiogenesis, evolution, species emergence
├── CivilizationEngine.ts  — Tech tree progression, NPC society simulation
├── WorldClock.ts          — simTime, epoch, timeScale, setPaused, setTimeScale
├── WorldSettingsSync.ts   — Reads/writes timeScale to Neon world_settings table
├── PlayerRegistry.ts      — Connected players: userId → PlayerState
├── NpcManager.ts          — Active NPCs: tick behavior, manage memory
├── BroadcastScheduler.ts  — 10Hz WebSocket snapshot to all clients
└── index.ts               — WebSocket server entry point
```

### 3.2 Time Scale

| Phase | Time Scale | Why |
|-------|-----------|-----|
| Big Bang → First stars | 1,000,000,000× | Billions of years pass in seconds |
| Stellar epoch | 100,000,000× | Stars live millions of years |
| Planetary formation | 10,000,000× | Geological time |
| Abiogenesis → Evolution | 1,000,000× | Billions of years of evolution |
| Civilization emergence | 100,000× | Thousands of years of human history |
| Player-active era | 1,000× | Observable change, playable pace |

TimeScale is configurable by admin and persisted to `world_settings`.

### 3.3 No Seeds Required
One universe. History is stored in the database as it happens. Crash recovery = restore from Neon backup. The universe's history is real data, not a reproducible computation.

---

## 4. Universe Simulation Pipeline

The server simulates these phases in sequence, storing each epoch transition to `universe_history`:

### Phase 1 — Particle Epoch (server auto-advances)
- Quantum vacuum fluctuation → singularity
- Quarks → hadrons → protons/neutrons
- Universe cools below fusion threshold

### Phase 2 — Nucleosynthesis
- Protons + neutrons fuse: **~75% hydrogen, ~25% helium** (real Big Bang nucleosynthesis ratios)
- Trace deuterium, lithium
- No heavier elements yet — stored as `element_abundances` record

### Phase 3 — Dark Ages → First Stars (Population III)
- Hydrogen gas collapses under gravity (Jeans instability)
- Massive, short-lived stars (100–1000 solar masses)
- Fuse H→He→C→O→Ne→Mg→Si→Fe (stellar nucleosynthesis chain)
- Die as supernovae, seeding interstellar medium with C, O, Si, Fe

### Phase 4 — Second-Generation Solar Systems
- Enriched gas cloud collapses
- Planet accretion from dust disk
- Rocky inner planets (Si, Fe, O, C, Mg rich)
- Target planet: Earth-analog with liquid water zone

### Phase 5 — Geological Epoch
- Tectonic plates (Voronoi-based)
- Mantle convection drives movement
- Volcanism, mountain building, ocean formation
- Atmosphere composition tracked: N₂, O₂, CO₂, H₂O vapor
- Greenhouse effect calculated from real radiative forcing per gas

### Phase 6 — Abiogenesis
- **RNA World hypothesis**: random organic chains form in hydrothermal vents
- When a chain achieves self-replication (probability-driven, temperature/chemistry dependent), first organism spawns
- Not scripted — emerges from chemistry simulation
- Stored as `abiogenesis_event` record with sim_time

### Phase 7 — Evolution
- Cells → multicellular → plants → animals → vertebrates → mammals → primates → humans
- Genome system (256-bit, from existing GenomeEncoder.ts)
- Natural selection via Lotka-Volterra ecosystem dynamics
- Extinction events tracked

### Phase 8 — Civilization Emergence
- Humans reach sufficient neural complexity → stone tools
- Tech tree progresses: Fire → Agriculture → Bronze → Iron → Writing → Mathematics → ...
- Civilization tier tracked: 0 (primitive) → 10 (simulation-capable)

### Phase 9 — Player-Accessible Era
- **Trigger**: Civilization reaches Bronze Age (Tier 2) minimum
- Server slows timeScale to ~1,000×
- Players can now spawn

---

## 5. Database Schema

```sql
-- Universe-level history
CREATE TABLE universe_history (
  id SERIAL PRIMARY KEY,
  epoch VARCHAR(50) NOT NULL,         -- 'nucleosynthesis', 'stellar', etc.
  sim_time_start BIGINT,              -- simulated seconds
  sim_time_end BIGINT,
  real_time_start TIMESTAMPTZ,
  real_time_end TIMESTAMPTZ,
  key_events JSONB                    -- notable events during this epoch
);

-- Stellar objects
CREATE TABLE stellar_objects (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20),                   -- 'star', 'planet', 'moon'
  parent_id INT REFERENCES stellar_objects(id),
  name VARCHAR(100),
  mass_kg FLOAT,
  radius_m FLOAT,
  surface_temp_k FLOAT,
  composition JSONB,                  -- { H: 0.74, He: 0.24, Fe: 0.01, ... }
  orbital_period_s BIGINT,
  habitable BOOLEAN,
  sim_time_formed BIGINT
);

-- Civilizations
CREATE TABLE civilizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  planet_id INT REFERENCES stellar_objects(id),
  tier INT DEFAULT 0,                 -- 0-10
  population BIGINT,
  discovered_tech TEXT[],             -- array of tech node IDs
  current_era VARCHAR(50),
  capital_pos_x FLOAT,
  capital_pos_z FLOAT,
  sim_time_founded BIGINT,
  is_active BOOLEAN DEFAULT TRUE
);

-- NPCs
CREATE TABLE npcs (
  id SERIAL PRIMARY KEY,
  civilization_id INT REFERENCES civilizations(id),
  name VARCHAR(100),
  role VARCHAR(50),                   -- 'farmer', 'blacksmith', 'scholar', etc.
  pos_x FLOAT, pos_y FLOAT, pos_z FLOAT,
  age_sim_years INT,
  neural_complexity FLOAT,            -- 0.0-1.0, gates LLM tier
  personality JSONB,                  -- trait vector
  known_tech TEXT[],                  -- subset of civ discovered_tech
  alive BOOLEAN DEFAULT TRUE,
  sim_time_born BIGINT
);

-- NPC episodic memory (vector-indexed for RAG)
CREATE TABLE npc_memories (
  id SERIAL PRIMARY KEY,
  npc_id INT REFERENCES npcs(id),
  memory_text TEXT,
  embedding VECTOR(1536),             -- pgvector for semantic search
  sim_time BIGINT,
  importance FLOAT                    -- 0.0-1.0, affects retrieval priority
);

-- NPC knowledge graph
CREATE TABLE npc_knowledge (
  npc_id INT REFERENCES npcs(id),
  concept VARCHAR(100),               -- 'iron smelting', 'crop rotation', etc.
  confidence FLOAT,                   -- 0.0-1.0
  source VARCHAR(50),                 -- 'direct_experience', 'taught', 'observed'
  sim_time_learned BIGINT,
  PRIMARY KEY (npc_id, concept)
);

-- Player saves (extended)
CREATE TABLE player_saves (
  user_id VARCHAR(100) PRIMARY KEY,
  username VARCHAR(100),
  pos_x FLOAT, pos_y FLOAT, pos_z FLOAT,
  health FLOAT, hunger FLOAT, thirst FLOAT, energy FLOAT, fatigue FLOAT,
  ev_points INT,
  civ_tier INT,
  current_goal VARCHAR(200),
  sim_seconds BIGINT,
  era_at_spawn VARCHAR(50),           -- NEW: what era they first spawned in
  bloodline_id INT,                   -- NEW: lineage tracking across reincarnations
  civilization_id INT REFERENCES civilizations(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tech discoveries (civilization-level)
CREATE TABLE discoveries (
  id SERIAL PRIMARY KEY,
  civilization_id INT REFERENCES civilizations(id),
  tech_node_id VARCHAR(50),
  tech_name VARCHAR(100),
  discovered_by_npc_id INT REFERENCES npcs(id),
  sim_time BIGINT
);

-- World settings
CREATE TABLE world_settings (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Keys: 'time_scale', 'current_epoch', 'paused', 'server_version'
```

---

## 6. Player System

### 6.1 Spawn
- Player logs in → server checks current simulation era
- Player appears as fully-formed adult at civilization's starting settlement
- NPC awareness: zero — player appears as a stranger who arrived in town
- Player awareness: full — they know they're a player, have HUD, panels

### 6.2 Player HUD (always visible)
```
┌─────────────────────────────────────────────────────┐
│ ❤ ████████░░  🍖 ██████░░░░  💧 ████░░░░░░  ⚡ ███████░   │  ← top-left vitals
│                                                     │
│                   [3D WORLD]                        │
│                                                     │
│              ▼ Press F to gather Stone ▼            │  ← bottom-center prompt
│                                                     │
│ 🔔 Discovered fire! +50 EP                          │  ← bottom-left toasts
└─────────────────────────────────────────────────────┘
                                                  [🎒][⚒][🔬][🧬][📖][👤][🗺][⚙]  ← right strip
```

### 6.3 Sidebar Panels

**I — Inventory** (existing, 40-slot grid)

**C — Crafting** (existing, recipe browser with knowledge gate)

**T — Tech Tree** (`@xyflow/react`)
- 150 nodes arranged in 10 horizontal tiers
- Node states: Researched (green), Available (blue, requirements met), Locked (gray)
- Edges show prerequisites
- Click node → detail pane with requirements + "Research" button
- Pan/zoom freely

**E — Evolution Tree** (`@xyflow/react`)
- 50+ nodes in radial/branching layout
- Shows EP balance at top
- Click node → cost + effect description + "Spend EP" button
- Nodes unlock in biological categories: metabolism, sensory, locomotion, neural, social

**J — Journal**
- Scrollable list of discovered entries
- Grouped by category: Physics, Chemistry, Biology, Civilization, Events
- Each entry: name, description, simulated date of discovery
- Search/filter bar

**Tab — Character**
- Genome visualization: 32×8 bit heatmap (256 bits), color = bit value
- All vital bars with exact numbers
- Evolution tier badge + civilization tier
- Current goal (from AI or player-set)
- Position coordinates
- Era at spawn + current era
- Bloodline ID + generation count

**M — Map**
- 2D canvas overhead view
- Player dot at center, world scrolls around them
- Remote players as colored dots with usernames
- Explored radius fog-of-war
- Biome color legend
- Civilization markers (settlements, cities)

**Esc — Settings**
- Graphics quality (Low/Medium/High/Ultra)
- Audio volume sliders (master, ambient, effects)
- Keybind display (not remappable yet — Phase 7)
- **Logout button** (calls Clerk signOut())
- Build version + server connection status

---

## 7. NPC Intelligence Architecture

### 7.1 Knowledge Hierarchy
```
Civilization discovers "Iron Smelting"
  └→ stored in civilizations.discovered_tech
  └→ NPCs with metallurgy role receive it in npc_knowledge
  └→ They can teach it to other NPCs (spreads via npc_knowledge inserts)
  └→ Books written = npc_memories entries marked as "book" source
```

### 7.2 LLM Dialogue System

When a player interacts with an NPC:

1. **Retrieve**: Query `npc_knowledge` + top-k `npc_memories` by embedding similarity
2. **Build prompt**:
```
You are {name}, a {role} in {settlement} ({civilization.era} era).
Personality: {personality_traits}
Emotional state: {emotion_model_output}
What you know: {top_20_knowledge_concepts}
Recent memories: {top_5_episodic_memories}
Relationship with this stranger (the player): {relationship_score} — {history}
The stranger says: "{player_input}"
Respond in character (max 2 sentences). Then output action: [CONTINUE|TRADE|GIVE_QUEST|HOSTILE|FLEE]
```
3. **Model routing**:
   - `neural_complexity >= 0.7` (scholars, leaders, philosophers) → Claude API
   - `neural_complexity < 0.7` (farmers, laborers, guards) → Local Llama via Ollama
4. **Store response**: Summarize interaction → insert into `npc_memories`

### 7.3 Simulation Theory Emergence
- When a civilization's tech tree reaches: Philosophy Tier 3 + Computing Tier 1 + Mathematics Tier 4
- A discoverable research node unlocks: "Nature of Reality / Simulation Hypothesis"
- NPCs who research it may develop curiosity about players (who appear and disappear, don't age normally, have unusual knowledge)
- This is emergent — not scripted — triggered by tech progression

---

## 8. Companion Web Portal (Phase 5)

### 8.1 Purpose
AI-powered personal assistant + admin panel + public observer. Not a passive dashboard — an intelligent system that knows the entire simulation state and proactively helps.

### 8.2 Player Assistant Features
- **Live briefings**: "Your civilization just discovered iron smelting. Here's what that unlocks."
- **History Q&A**: Ask anything about universe history — Claude API answers from DB context
- **Strategic advice**: "At current tech rate, gunpowder unlocks in ~80 sim-years. Here's how to accelerate it."
- **Bloodline tracker**: Every life your character has lived, their achievements, descendants
- **Notification center**: Important events in the simulation while you were offline

### 8.3 Admin Panel
- Real-time simulation state (current epoch, active civilizations, player count)
- Adjust timeScale, pause/resume simulation
- Inspect any NPC (full state, memories, knowledge)
- Trigger events (meteor impact, disease outbreak, tech discovery boost)
- View all player saves + positions

### 8.4 Public Observer
- Watch universe state without an account
- Current era, dominant species, active civilizations on a world map
- Universe timeline visualization (epoch progression)
- "Universe is currently Year 1,247 of the Iron Age"

### 8.5 Tech Stack
- Next.js App Router (separate from game client)
- Claude API for assistant intelligence (has full DB read access)
- pgvector for semantic search over universe history
- Neon Postgres (same DB as game server)
- Clerk auth (same auth as game)

---

## 9. Build Phases

| Phase | What | Milestone |
|-------|------|-----------|
| **1** (done) | Game client: gathering, inventory, crafting, movement | Player can walk, gather, craft |
| **2** | Universe simulation pipeline on Railway: Big Bang → civilization, epoch DB schema | Server simulates universe, epoch records in DB |
| **3** | NPC intelligence: knowledge graph, memory system, LLM dialogue | NPCs answer questions with authentic knowledge |
| **4** | Complete game UI: React Flow tech tree, evolution tree, character panel, map | All 8 panels functional |
| **5** | Companion web portal: AI assistant, admin, public observer | Portal live at separate URL |
| **6** | Multiplayer: remote player rendering, shared world state | Multiple players see each other |
| **7** | Polish: performance, audio, keybind remapping, mobile | 60fps, full accessibility |

---

## 10. Technology Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Game client rendering | Three.js + @react-three/fiber | Already in use |
| Game client state | Zustand | Already in use |
| ECS | bitecs | Already in use |
| Game client build | Vite + TypeScript | Already in use |
| Auth | Clerk | Already in use |
| Database | Neon Postgres | Already in use |
| Server runtime | Node.js on Railway | Always-on |
| Server transport | WebSocket (ws package) | Already in use |
| Panel animation | framer-motion | Replaces CSS transitions |
| Tree visualization | @xyflow/react | Tech Tree + Evolution Tree |
| NPC dialogue (complex) | Claude API | High neural_complexity NPCs |
| NPC dialogue (simple) | Ollama + Llama 3.1 | Background NPC-NPC interactions |
| NPC memory retrieval | pgvector + embeddings | Semantic search over npc_memories |
| Portal frontend | Next.js App Router | Phase 5 |
| Portal AI assistant | Claude API | Full DB read access |

---

## 11. Key Files to Create / Modify

### Phase 2 (Universe Simulation)
| File | Action |
|------|--------|
| `server/src/UniverseSim.ts` | New — master simulation loop |
| `server/src/EpochManager.ts` | New — epoch tracking + DB writes |
| `server/src/NucleosynthesisEngine.ts` | New — element formation simulation |
| `server/src/StellarEngine.ts` | New — star/planet lifecycle |
| `server/src/PlanetaryEngine.ts` | New — geology, atmosphere, water |
| `server/src/BiologyEngine.ts` | New — abiogenesis, evolution |
| `server/src/CivilizationEngine.ts` | New — tech tree, NPC society |
| `server/src/WorldClock.ts` | Modify — variable timeScale per epoch |
| Neon migrations | New — all tables from §5 |

### Phase 3 (NPC Intelligence)
| File | Action |
|------|--------|
| `server/src/NpcManager.ts` | Expand — full knowledge/memory system |
| `server/src/LLMBridge.ts` | New — Claude API + Ollama routing |
| `server/src/EmbeddingService.ts` | New — memory retrieval via pgvector |

### Phase 4 (Game UI)
| File | Action |
|------|--------|
| `src/ui/panels/TechTreePanel.tsx` | Rebuild with @xyflow/react |
| `src/ui/panels/EvolutionPanel.tsx` | Rebuild with @xyflow/react |
| `src/ui/panels/CharacterPanel.tsx` | Full stats + genome heatmap |
| `src/ui/panels/MapPanel.tsx` | Canvas 2D map |
| `src/ui/SidebarShell.tsx` | Add framer-motion animations |

---

## 12. Player Death & Respawn

When a player's character dies:
- **Lose**: partial XP/EP (not all — partial penalty), random items dropped from inventory
- **Keep**: character knowledge, bloodline record, discovered tech unlocks
- **Respawn**: player respawns as a new adult in the same era at the civilization's settlement
- **Bloodline**: each death starts a new generation — bloodline ID persists, tracking how many lives the player has lived in this universe
- No permanent death — the game is about participating in the world long-term

---

## 13. Open Questions (for future brainstorming)

- Can players influence the tech tree direction (e.g. accelerate a specific branch)?
- How does multiplayer affect NPC memory? (NPC remembers player A but not player B who was also there?)
- What is the win condition / long-term player goal if there is no explicit quest-giver?
- WebRTC vs WebSocket for player-to-player communication in-world?
