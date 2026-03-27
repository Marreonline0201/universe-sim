---
name: Vision Realignment Sprint
description: Universe Sim pivoting from RPG to emergent organism simulation — observer/god role, not player character
type: project
---

Universe Sim is an EMERGENT ORGANISM SIMULATION, not an RPG. The player is an observer/god, not a character.

**Why:** The codebase drifted into RPG territory (~70+ RPG systems) but the simulation foundation is excellent (Lotka-Volterra ecosystem, 256-bit genome with mutations, Arrhenius chemistry, BT/GOAP creature AI, 5-sense sensory). The user explicitly clarified the vision on 2026-03-27.

**How to apply:**
- Never build new RPG features (player combat, crafting, quests, dungeons, survival meters)
- All new work should serve the simulation: organism autonomy, evolution, chemistry-to-biology pipelines, observer tools
- The simulation layer (src/biology, src/chemistry, src/ai) is the core — promote and enhance it
- The RPG layer (src/player, most of src/game) should be phased out, not extended
- See VISION_REALIGNMENT.md for the full 3-milestone plan (M72-M74)
- M72: Observer Foundation (spectator cam, ecosystem dashboard, time controls, sim bootstrap)
- M73: Genesis (abiogenesis, organism-grid chemistry bridge, speciation engine)
- M74: Awakening (autonomous tool discovery, settlement formation, language emergence)
