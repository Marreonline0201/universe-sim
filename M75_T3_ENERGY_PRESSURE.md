# M75 Task T3: Food/Energy Selection Pressure

**Task ID:** M75-T3
**Agent:** biology-prof
**Priority:** P0 (Critical)
**Status:** READY (depends on T2 completion)

---

## Objective

Currently the NaturalSelectionSystem kills organisms based on a fitness score that considers temperature/light/predation, but there is no **energy economy**. Organisms never run out of fuel. This means there is no real selection pressure — lazy organisms survive just as well as efficient ones.

**Goal:** Add an energy field to organisms so that:
- **Autotrophs** (dietaryType=0) passively gain energy from light (photosynthesis) — they are self-sustaining
- **Heterotrophs** (dietaryType=1) lose energy over time and **die when energy reaches 0** — creating real pressure
- **Mixotrophs** (dietaryType=2) gain energy slowly (half autotroph rate)
- **Chemoautotrophs** (dietaryType=3) gain energy at a moderate rate (chemical energy)

This creates the first genuine selection pressure: organisms with high metabolic rates burn through energy faster and die sooner unless they have efficient genomes.

---

## Technical Analysis (Director-provided)

### Current organism data structure
**File:** `src/biology/NaturalSelectionSystem.ts` line 27

```typescript
export interface Organism {
  id:        number
  speciesId: number
  genome:    Genome
  fitness:   number
  cooldown:  number
  age:       number
  biome:     string
}
```

No `energy` field exists yet.

### Genome dietary type
**File:** `src/biology/GenomeEncoder.ts` bits 24-27:
- 0 = autotroph (photosynthesis)
- 1 = heterotroph (must eat)
- 2 = mixotroph (both)
- 3 = chemoautotroph (chemical energy)

The GenomeEncoder already decodes `dietaryType` in the phenotype. You can access it via:
```typescript
const phenotype = encoder.decode(org.genome)
phenotype.dietaryType  // 0, 1, 2, or 3
```

### ECS Metabolism component
Organisms already get a Metabolism component with `energy: 1.0` at creation (see `src/ecs/world.ts` line 149). The existing `MetabolismSystem.ts` handles hunger/thirst but is player-focused. We should NOT modify that — it's for player/NPC metabolics.

### The implementation plan

**Option A (Recommended): Add energy to the NaturalSelectionSystem tick**

This is cleaner because the NaturalSelection system already handles birth/death logic. Energy pressure should influence fitness and death, not live in ECS.

**File:** `src/biology/NaturalSelectionSystem.ts`

1. Add `energy` field to the `Organism` interface:
```typescript
export interface Organism {
  id:        number
  speciesId: number
  genome:    Genome
  fitness:   number
  cooldown:  number
  age:       number
  biome:     string
  /** M75: Energy level 0-1. Autotrophs gain from light, heterotrophs burn over time. */
  energy:    number
}
```

2. Initialize energy to 1.0 when organisms are created (in the constructor/factory and in the reproduction code).

3. In the `tick()` method, before fitness evaluation, update energy based on dietary type:
```typescript
// M75: Energy economy — dietary type determines energy gain/loss per tick
const phenotype = this.encoder.decode(org.genome)
const metabolicCost = 0.002 + (phenotype.metabolicRate / 15) * 0.008  // faster metabolism = more burn

switch (phenotype.dietaryType) {
  case 0: // Autotroph — gains energy from light
    org.energy = Math.min(1.0, org.energy + 0.005 * (env.light / 200))
    break
  case 1: // Heterotroph — loses energy, must find food (no food sources yet, so slow drain)
    org.energy = Math.max(0, org.energy - metabolicCost)
    break
  case 2: // Mixotroph — slow gain
    org.energy = Math.min(1.0, org.energy + 0.002 * (env.light / 200))
    break
  case 3: // Chemoautotroph — moderate gain (chemical energy)
    org.energy = Math.min(1.0, org.energy + 0.003)
    break
}

// Kill organism if energy depleted
if (org.energy <= 0) {
  // Mark for death — same mechanism as fitness-based death
}
```

4. Factor energy into fitness calculation — low-energy organisms should have reduced fitness:
```typescript
// Energy contributes to fitness: starving organisms are less fit
const energyFactor = org.energy > 0.2 ? 1.0 : org.energy / 0.2  // linear dropoff below 20%
org.fitness *= energyFactor
```

**File:** `src/biology/SimulationIntegration.ts`

5. The environment callback in `tickSimulation()` (line 182-189) already passes `light: 200`. This is correct for autotroph energy gain. No changes needed here unless you want to vary light by time of day.

---

## Deliverables
- Modified `src/biology/NaturalSelectionSystem.ts` with energy field, per-tick energy update, dietary-type-based gain/loss, energy-based death, energy factor in fitness
- Build passes (`npx vite build`)
- No new files needed

## Quality Criteria
- Autotrophs should stabilize at full energy (they photosynthesize)
- Heterotrophs should visibly die off over time (population decline in dashboard)
- High-metabolic-rate organisms should die faster than low-metabolic-rate ones
- The ecosystem should not collapse entirely — autotrophs must survive as the base
- Console log should show deaths increasing and organism count declining for heterotrophs
- Energy values should be visible in the EcosystemDashboard (stretch goal — can add in T4)

## Dependencies
- T2 (movement) should be done first so organisms are visually alive before adding death pressure

---

## Files to modify
- `src/biology/NaturalSelectionSystem.ts` (primary — add energy field and tick logic)

## Files to read for context
- `src/biology/GenomeEncoder.ts` (understand dietaryType encoding, metabolicRate)
- `src/biology/SimulationIntegration.ts` (understand how tick is called, environment params)
- `src/biology/FitnessEvaluator.ts` (understand current fitness calculation)
- `src/ecs/world.ts` lines 148-153 (see existing ECS Metabolism component)
