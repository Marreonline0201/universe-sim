# M72: "The Watcher" — Task Briefs

## M72-2: Simulation Bootstrap (biology-prof)

### Objective
When a new world is created, automatically seed the primordial soup with the first organisms instead of spawning a player character. The simulation should begin running immediately with autonomous life.

### Deliverables
1. **`src/biology/SimulationBootstrap.ts`** — New file that:
   - Creates 50-200 primordial organisms using `GenomeEncoder.createPrimordialGenome()`
   - Registers the first species in `SpeciesRegistry`
   - Places organisms in warm shallow-water biomes (temperature 20-80C, near sea level)
   - Adds each organism as an ECS entity with: Position, Velocity, Metabolism, Health, CreatureBody components
   - Connects the initial population to `EcosystemBalance` with appropriate carrying capacities
   - Seeds 3-5 slightly different primordial genomes (random mutations) so there is initial genetic diversity

2. **Integration point**: Export a `bootstrapSimulation(planetRadius: number)` function that can be called from world creation code instead of (or alongside) player spawn.

### Technical Specs
- Use existing `GenomeEncoder`, `MutationEngine`, `SpeciesRegistry`, `EcosystemBalance`
- Use existing ECS world from `src/ecs/world.ts`
- Use `CreatureSpawner.ts` patterns for entity creation
- Organisms should be placed at surface positions on the sphere planet using `surfaceRadiusAt()`
- Initial organisms are all autotrophs (dietary type 0) — they photosynthesize
- Target: spawn completes in <100ms

### Quality Criteria
- [ ] 50+ organisms exist after bootstrap
- [ ] Species registered in SpeciesRegistry with primordial genome
- [ ] Organisms have valid ECS components (Position, Health, Metabolism)
- [ ] Organisms placed on planet surface in warm biomes
- [ ] Multiple slightly-different genomes for diversity
- [ ] No dependency on PlayerController or player stores

---

## M72-3: Natural Selection Tick (biology-prof)

### Objective
Create a per-tick natural selection system that evaluates organism fitness against their environment and drives differential reproduction/death. This is the core evolutionary pressure that makes the genome meaningful.

### Deliverables
1. **`src/biology/NaturalSelectionSystem.ts`** — New file that runs each simulation tick:
   - **Fitness evaluation**: For each organism, compute fitness score based on:
     - Temperature tolerance match (genome tempPreference vs grid cell temperature)
     - Food availability (autotrophs need light, heterotrophs need nearby prey)
     - Predation pressure (is there a predator nearby?)
     - Size-metabolism efficiency (larger organisms need more food)
   - **Differential death**: Low-fitness organisms have higher death probability per tick
   - **Differential reproduction**: High-fitness organisms reproduce (create child with mutated genome via MutationEngine + crossover if two parents)
   - **Speciation check**: After reproduction, check genome distance from parent species template. If distance exceeds threshold, register new species in SpeciesRegistry.
   - **Population update**: Feed births/deaths back to EcosystemBalance

2. **`src/biology/FitnessEvaluator.ts`** — Pure function that takes (genome, environment) and returns fitness score 0-1.

### Technical Specs
- Fitness function must use `GenomeEncoder.decode()` to read phenotype
- Death/reproduction probabilities should be calibrated so:
  - A well-adapted organism in ideal conditions reproduces every ~100 ticks
  - A poorly-adapted organism dies within ~50 ticks
  - Neutral organisms are stable
- Speciation threshold: Hamming distance of genome > 32 bits (12.5% divergence) from species template
- MutationEngine.mutate() called on every child genome
- MutationEngine.isLethal() check on every new genome — lethal genomes are stillborn

### Quality Criteria
- [ ] Organisms die faster when environment doesn't match their genome
- [ ] Organisms reproduce when fit — children have mutated genomes
- [ ] New species registered when genome diverges enough
- [ ] Population counts fed back to EcosystemBalance
- [ ] System runs in <5ms per tick for 200 organisms
- [ ] No dependency on player systems

---

## M72-6: Deactivate RPG GameLoop (interaction)

### Objective
Strip the GameLoop of all RPG ticks while preserving simulation-relevant systems.

### Keep Running
- `tickAnimalAI()` — organism AI
- `tickCreatureWander()` — organism movement
- `tickEcosystemBalance()` — population dynamics
- `tickRespawnQueue()` — organism respawn
- `gameLoopScheduler.tick()` — periodic tasks (needs audit — some are RPG)
- Weather system ticks
- Chemistry gameplay ticks
- Day/night cycle

### Stop Running
- All survival meter updates (hunger, thirst, warmth, stamina)
- All combat ticks
- All crafting/recipe/cooking ticks
- All dungeon ticks
- All quest ticks
- All NPC schedule/gift/relationship ticks
- All merchant/market ticks
- All skill/spell ticks
- All fishing ticks
- All building placement ticks (player-driven)
- All loot pickup ticks
- All achievement ticks
- All title/reputation ticks
- Player vitals update
- Player position tracking
- Death system checks

### Approach
Do NOT delete code. Wrap RPG sections in `if (false)` blocks or extract them behind a `const RPG_ENABLED = false` flag at the top of GameLoop.ts, so they can be re-enabled for testing.
