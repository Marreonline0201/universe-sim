# Universe Simulation — Game Design Document

**Version**: 0.1.0
**Date**: 2026-03-19
**Status**: Living document — updated with each build milestone

---

## Table of Contents

1. [Overview & Vision](#1-overview--vision)
2. [Creative Science Policy](#2-creative-science-policy)
3. [Technology Stack](#3-technology-stack)
4. [Phase 0: Physics Engine](#4-phase-0-physics-engine)
5. [Phase 1: Chemistry Engine](#5-phase-1-chemistry-engine)
6. [Phase 2: Biology Engine](#6-phase-2-biology-engine)
7. [Phase 3: AI NPC System](#7-phase-3-ai-npc-system)
8. [Phase 4: World Generation](#8-phase-4-world-generation)
9. [Phase 5: Player & Gameplay](#9-phase-5-player--gameplay)
10. [Phase 6: Civilization](#10-phase-6-civilization)
11. [Phase 7: Polish & Scale](#11-phase-7-polish--scale)
12. [Critical Files & Build Order](#12-critical-files--build-order)
13. [Full Folder Structure](#13-full-folder-structure)
14. [Build Milestones](#14-build-milestones)

---

## 1. Overview & Vision

**Universe Simulation** is a browser-based 3D simulation game where the player begins as a single primitive organism — a protozoan floating in a primordial ocean — and guides the evolution of life across geological timescales until their species reaches space-age civilization.

The simulation is grounded in real-world science at every layer:
- Physics obeys known constants (G, c, k_B, h, e, epsilon_0)
- Chemistry follows actual valence rules and reaction thermodynamics
- Biology uses a genome encoding that produces meaningful phenotypes
- AI NPCs have layered neural architectures that emerge from their genome
- Civilization advances through a historically accurate (but accelerated) tech tree

The game is not a simplified allegory — it is an emergent simulation. The player does not directly control outcomes; they nudge, guide, and discover. Civilizations can fail. Evolution can dead-end. The universe does not care.

### Core Loop

```
Observe → Intervene (subtly) → Evolve → Discover → Scale Up
```

The player zooms in and out of scale constantly: from molecular chemistry, to cellular biology, to ecosystem dynamics, to geological eras, to civilization epochs. Each scale has its own HUD, controls, and win conditions.

### Scale Ladder

| Level | Scale | Player Lens |
|-------|-------|-------------|
| L1 | Molecular (nm) | Chemistry lab — watch reactions, catalyze |
| L2 | Cellular (µm) | Observe cell division, mutation, abiogenesis |
| L3 | Organism (mm–m) | Ecosystem view, creature behavior trees |
| L4 | Planetary (km–Mm) | Geological time, biome spreading, climate |
| L5 | Civilization | Tech tree, city building, wars, science |
| L6 | Stellar | Eventually: interplanetary, then interstellar |

---

## 2. Creative Science Policy

### What Is Allowed

- Real physical constants used exactly as defined by NIST/CODATA
- Simplified but directionally correct models (e.g., ideal gas law for atmosphere)
- Emergent behavior arising from lower-level rules, not scripted
- Approximations clearly labeled in code comments with citation

### What Is Not Allowed

- Fictional physics (no "mana", "energy bars" that violate conservation)
- Teleportation or faster-than-light travel without acknowledged fictional framing
- Genome encodings that produce magic phenotypes not derivable from gene expression logic
- AI behaviors coded as pure state machines without any grounding in sensory input

### Simulation Fidelity Tiers

| Tier | Description | Example |
|------|-------------|---------|
| S (Science) | Exact real-world formula | Coulomb's law, osmotic pressure |
| A (Approximate) | Simplified but accurate direction | Ideal gas, logistic growth |
| B (Behavioral) | Plausible emergent behavior | Flocking, social hierarchy |
| C (Creative) | Inspired by science, liberties taken | Abiogenesis timeline |

Every system in the codebase is tagged with its fidelity tier in a comment block.

---

## 3. Technology Stack

| Layer | Library / Tool | Purpose |
|-------|---------------|---------|
| Rendering | Three.js + @react-three/fiber | WebGL scene graph |
| Camera / helpers | @react-three/drei | Orbit controls, stats, instancing |
| Physics | @dimforge/rapier3d-compat | Rigid body + collider simulation (WASM) |
| ECS | bitecs | Data-oriented entity component system |
| State | Zustand | Global game store (time, player, evo tree) |
| Persistence | idb (IndexedDB) | Save game, genome archive, discovery log |
| Build | Vite + vite-plugin-wasm | Fast HMR, WASM loading for Rapier |
| Language | TypeScript 5.6 strict | All source code |
| Tests | Vitest | Unit tests for engines |
| Workers | Web Workers (ES modules) | Physics tick, chemistry tick, AI tick |
| Concurrency | SharedArrayBuffer + Atomics | Lock-free grid state between workers |

### Architecture Overview

```
Main Thread (React + R3F)
  └── renders scene from ECS component data
  └── dispatches player actions to store

Physics Worker (Rapier WASM)
  └── runs at fixed 60 Hz
  └── writes positions to SharedArrayBuffer grid

Chemistry Worker
  └── runs at 10 Hz (molecular scale)
  └── processes reaction queues per GridCell

AI Worker
  └── runs at 4 Hz (NPC brain tick)
  └── reads sensory data, writes behavior flags

Biology Worker
  └── runs at 1 Hz (evolution tick)
  └── evaluates fitness, applies mutation, spawns offspring
```

---

## 4. Phase 0: Physics Engine

### 4.1 Real Physical Constants

All constants live in `src/engine/constants.ts` and are never approximated:

```typescript
// CODATA 2022 recommended values
export const G        = 6.674_30e-11;   // m³ kg⁻¹ s⁻²  gravitational constant
export const c        = 299_792_458;     // m s⁻¹         speed of light
export const h        = 6.626_070_15e-34; // J s           Planck constant
export const hbar     = h / (2 * Math.PI);
export const k_B      = 1.380_649e-23;  // J K⁻¹          Boltzmann constant
export const N_A      = 6.022_140_76e23; // mol⁻¹          Avogadro number
export const e_charge = 1.602_176_634e-19; // C            elementary charge
export const epsilon0 = 8.854_187_8128e-12; // F m⁻¹       vacuum permittivity
export const mu0      = 1.256_637_061e-6; // N A⁻²         vacuum permeability
export const R_gas    = k_B * N_A;      // 8.314... J mol⁻¹ K⁻¹
export const sigma_SB = 5.670_374_419e-8; // W m⁻² K⁻⁴   Stefan–Boltzmann
export const atm      = 101_325;        // Pa             standard atmosphere
```

### 4.2 Multi-Scale Physics (L1–L4)

The simulation runs at four simultaneous scales, each with different physics fidelity:

**L1 — Molecular**
- Lennard-Jones potential for van der Waals interactions
- Coulomb electrostatics for charged species
- Brownian motion via stochastic Langevin equation
- Temperature-dependent diffusion coefficient: D = k_B T / (6π η r)

**L2 — Cellular**
- Membrane tension modeled as spring network (Helfrich model)
- Osmotic pressure: Π = iMRT (van't Hoff)
- ATP-driven motor proteins modeled as directed random walks

**L3 — Organism**
- Rapier3D rigid body physics for creature locomotion
- Fluid drag: F_drag = -½ ρ C_d A v²
- Metabolic scaling: BMR ∝ M^(3/4) (Kleiber's law)

**L4 — Planetary**
- Simplified N-body gravity between large bodies
- Plate tectonics as voronoi-driven stress relaxation
- Atmospheric convection cells (Hadley, Ferrel, Polar)

### 4.3 GridCell Structure

The world is partitioned into a 3D grid of cells. Each cell holds a fixed-size struct stored in a SharedArrayBuffer for lock-free multi-worker access:

```typescript
// src/engine/Grid.ts
// GridCell layout — 128 bytes per cell, aligned to 64-byte cache lines
// Offset  Size  Field
//  0       4    temperature (float32, Kelvin)
//  4       4    pressure    (float32, Pascal)
//  8       4    humidity    (float32, 0–1)
//  12      4    windX       (float32, m/s)
//  16      4    windY       (float32, m/s)
//  20      4    windZ       (float32, m/s)
//  24      4    pH          (float32, 0–14)
//  28      4    salinity    (float32, g/kg)
//  32      4    lightLevel  (float32, W/m²)
//  36      4    soilNitrogen(float32, mol/m³)
//  40      4    elevation   (float32, meters)
//  44      4    biomeId     (uint32)
//  48      4    entityCount (uint32, atomic)
//  52      4    flags       (uint32, bitmask)
//  56      8    reserved
//  64      64   chemistry[16] — 16 × float32 molecule concentrations
```

Cell dimensions are configurable per scale level:
- L1: 10 nm cells
- L2: 10 µm cells
- L3: 1 m cells
- L4: 1 km cells

### 4.4 Electromagnetic Simulation

Simplified Maxwell equations for the chemistry and biology layers:

- Electric field from point charges via Coulomb superposition
- Magnetic field from moving charges via Biot-Savart (static approximation)
- Membrane potential modeled as a 1D cable equation (Hodgkin-Huxley simplified)
- Action potentials drive neural NPC behavior at the cellular boundary

### 4.5 SimClock

The simulation clock supports time dilation across 20 orders of magnitude:

```typescript
// src/engine/SimClock.ts
export type TimeScale =
  | 'femtosecond'   // 1e-15 s — molecular vibrations
  | 'nanosecond'    // 1e-9  s — chemical reactions
  | 'millisecond'   // 1e-3  s — cellular processes
  | 'second'        // 1     s — organism behavior
  | 'minute'        // 60    s
  | 'hour'          // 3600  s
  | 'day'           // 86400 s
  | 'year'          // 3.156e7 s
  | 'millennium'    // 3.156e10 s
  | 'epoch'         // 1e6 years — geological
```

Workers subscribe to clock ticks at their native resolution. The main thread renders at real-time 60 fps regardless of sim time scale.

---

## 5. Phase 1: Chemistry Engine

### 5.1 Element Database

`src/chemistry/ElementDatabase.ts` contains all 118 elements with:

| Field | Type | Example (Carbon) |
|-------|------|-----------------|
| atomicNumber | number | 6 |
| symbol | string | "C" |
| name | string | "Carbon" |
| atomicMass | number | 12.011 |
| electronegativity | number | 2.55 (Pauling) |
| valenceElectrons | number | 4 |
| oxidationStates | number[] | [-4,-3,-2,-1,0,1,2,3,4] |
| ionizationEnergy | number | 1086.5 kJ/mol |
| electronAffinity | number | 121.8 kJ/mol |
| covalentRadius | number | 77 pm |
| vanDerWaalsRadius | number | 170 pm |
| meltingPoint | number | 3823 K (graphite) |
| boilingPoint | number | 5100 K |
| density | number | 2267 kg/m³ |
| phase | 'solid'\|'liquid'\|'gas'\|'plasma' | 'solid' |
| group | number | 14 |
| period | number | 2 |
| block | 's'\|'p'\|'d'\|'f' | 'p' |

### 5.2 Molecule Registry

`src/chemistry/MoleculeRegistry.ts` maintains all known molecules with SMILES strings, formation enthalpy, Gibbs free energy, bond angles, and polarity:

Key molecules in the registry:

| Molecule | Formula | Role in simulation |
|----------|---------|-------------------|
| Water | H₂O | Universal solvent, hydrogen bonding |
| Carbon dioxide | CO₂ | Greenhouse gas, photosynthesis input |
| Methane | CH₄ | Early atmosphere, energy source |
| Ammonia | NH₃ | Nitrogen cycle, early atmosphere |
| Adenosine triphosphate | C₁₀H₁₆N₅O₁₃P₃ | Energy currency |
| Glucose | C₆H₁₂O₆ | Primary energy source |
| DNA backbone | [complex] | Genome substrate |
| Lipid bilayer unit | [complex] | Membrane formation |
| Amino acids | [20 types] | Protein building blocks |

### 5.3 Reaction Engine

`src/chemistry/ReactionEngine.ts` processes reactions per GridCell each chemistry tick:

**Reaction evaluation pipeline:**

1. Check reactant concentrations against stoichiometric minimums
2. Evaluate activation energy: k = A × exp(-Ea / RT) (Arrhenius)
3. Check catalyst presence (enzymes, mineral surfaces)
4. Apply Le Chatelier's principle for equilibrium shift
5. Update concentrations and release/absorb thermal energy
6. Emit reaction events to the biology engine (for enzyme-driven processes)

**Reaction categories:**

- Acid-base: pH-mediated proton transfer
- Redox: electron transfer, tracked oxidation states
- Organic: C-C bond formation, polymerization
- Biochemical: enzyme-catalyzed pathways (glycolysis, Krebs, etc.)
- Nuclear: radioactive decay (for deep geology)

### 5.4 Atmosphere Model

The planet's atmosphere is divided into vertical layers per grid column. Each layer tracks:

- Composition: N₂%, O₂%, CO₂%, CH₄%, H₂O%, Ar%, other
- Temperature (lapse rate: -6.5 K/km troposphere)
- Pressure (barometric formula)
- Greenhouse forcing: Σ(concentration × radiative efficiency) per gas
- Ozone column (absorbs UV, protects surface life)

Atmospheric chemistry runs on a slow tick (1 per simulation day):
- Photolysis of molecules by solar UV
- Chemical weathering feedback from surface minerals
- Volcanic outgassing events
- Biological oxygen production (post-photosynthesis evolution)

---

## 6. Phase 2: Biology Engine

### 6.1 256-Bit Genome System

Every creature has a 256-bit (32-byte) genome stored as four 64-bit BigInts. This is a deliberately compact encoding that still allows ~10^77 unique genomes — vastly more than the number of atoms in the observable universe.

#### Genome Bit Map (256 bits)

```
Bits   0–15   (16 bits) — Body plan archetype (0–65535 body plan IDs)
               Bit 0: bilateral symmetry
               Bit 1: radial symmetry
               Bits 2–5: number of limb pairs (0–15)
               Bits 6–9: number of sensory organs (0–15)
               Bits 10–11: body cavity type (0=none, 1=pseudocoelom, 2=coelom, 3=complex)
               Bits 12–13: skeleton type (0=none, 1=hydrostatic, 2=exo, 3=endo)
               Bits 14–15: reproduction mode (0=binary fission, 1=budding, 2=sexual, 3=parthenogenesis)

Bits  16–31   (16 bits) — Metabolism
               Bits 16–17: energy source (0=chemosynthesis, 1=photosynthesis, 2=heterotroph, 3=mixotroph)
               Bits 18–20: preferred substrate (0=glucose, 1=lipids, 2=proteins, 3=sulfur, 4=iron, 5=light, 6=hydrogen, 7=other)
               Bits 21–24: metabolic rate multiplier (0–15 → 0.5× to 8×)
               Bits 25–28: ATP efficiency (0–15 → 20–55% Carnot efficiency)
               Bits 29–31: thermoregulation (0=poikilotherm, 1=partial, 2=homeotherm, 3=heterotherm)

Bits  32–47   (16 bits) — Nervous system
               Bits 32–34: neural complexity (0=none, 1=nerve net, 2=ganglia, 3=proto-brain, 4=brain, 5=cortex, 6=neocortex, 7=extended)
               Bits 35–37: learning capability (0=none, 1=habituation, 2=conditioning, 3=insight, 4=abstract, 5=symbolic, 6=cultural, 7=technological)
               Bits 38–40: memory capacity (0–7 → log scale 0 to 10^9 bits)
               Bits 41–43: communication complexity (0=none, 1=chemical, 2=tactile, 3=visual, 4=vocal-simple, 5=vocal-complex, 6=proto-language, 7=language)
               Bits 44–47: emotion complexity (0=none, 1=valence, 2=basic, 3=social, 4=complex, 5=self-aware, 6=empathic, 7=moral)

Bits  48–63   (16 bits) — Sensory systems
               Bits 48–50: vision type (0=none, 1=photoreception, 2=pinhole, 3=lens, 4=compound, 5=color, 6=UV, 7=IR)
               Bits 51–53: hearing (0=none, 1=vibration, 2=pressure wave, 3=directional, 4=frequency discrim, 5=echolocation, 6=ultrasonic, 7=infrasonic)
               Bits 54–55: olfaction (0=none, 1=basic, 2=pheromone, 3=detailed)
               Bits 56–57: proprioception (0=none, 1=basic, 2=precise, 3=vestibular)
               Bits 58–59: electroreception (0=none, 1=passive, 2=active, 3=active-hunting)
               Bits 60–61: magnetoreception (0=none, 1=navigation, 2=map-sense, 3=precise)
               Bits 62–63: thermoreception (0=none, 1=hot/cold, 2=gradient, 3=infrared-imaging)

Bits  64–79   (16 bits) — Defense & offense
               Bits 64–66: armor type (0=none, 1=mucus, 2=chitin, 3=scales, 4=bone, 5=shell, 6=silica, 7=magnetite)
               Bits 67–69: weapon type (0=none, 1=toxin, 2=sting, 3=claw, 4=fang, 5=beak, 6=electric, 7=acid)
               Bits 70–72: camouflage (0=none, 1=countershading, 2=pattern, 3=chromatophore, 4=transparency, 5=bioluminescence, 6=mimicry, 7=active)
               Bits 73–75: immune system (0=none, 1=innate, 2=complement, 3=adaptive, 4=memory, 5=antibody, 6=cellular, 7=complete)
               Bits 76–79: toxin resistance (0–15 bitmask for 15 common toxin classes)

Bits  80–95   (16 bits) — Reproduction & development
               Bits 80–82: gestation type (0=spore, 1=egg-external, 2=egg-internal, 3=live birth, 4=marsupial, 5=placental, 6=ovoviviparous, 7=other)
               Bits 83–85: clutch/litter size (0–7 → 1 to 128 offspring)
               Bits 86–88: parental investment (0=none, 1=guarding, 2=provisioning, 3=teaching, 4=alloparental, 5=eusocial, 6=superorganism, 7=cultural)
               Bits 89–91: sexual dimorphism (0=none, 1=size, 2=color, 3=morphology, 4=behavior, 5=sex-role-reversed, 6=sequential hermaphrodite, 7=simultaneous)
               Bits 92–95: lifespan class (0–15 → 1 hour to 5000 years, log scale)

Bits  96–111  (16 bits) — Ecological role
               Bits 96–98: trophic level (0=producer, 1=primary, 2=secondary, 3=tertiary, 4=apex, 5=detritivore, 6=parasite, 7=hyperparasite)
               Bits 99–101: niche (0=pelagic, 1=benthic, 2=terrestrial, 3=arboreal, 4=aerial, 5=fossorial, 6=littoral, 7=parasitic)
               Bits 102–104: social structure (0=solitary, 1=pair, 2=family, 3=herd/flock, 4=pack, 5=colony, 6=eusocial, 7=superorganism)
               Bits 105–107: territorial behavior (0=none, 1=resource, 2=mate, 3=nesting, 4=home-range, 5=dominance, 6=cooperative, 7=keystone)
               Bits 108–111: dispersal ability (0–15 → none to intercontinental)

Bits 112–127  (16 bits) — Body size & proportions
               Bits 112–115: body mass class (0–15 → 1 µg to 100 tonnes, log scale)
               Bits 116–118: aspect ratio (body length/width, 0–7)
               Bits 119–121: brain/body mass ratio (0–7 → encephalization quotient index)
               Bits 122–124: gut length ratio (0–7 → carnivore to herbivore gradient)
               Bits 125–127: surface area adaptation (0=streamlined, 1=neutral, 2=enlarged fins, 3=wings, 4=parachute, 5=spines, 6=leaflike, 7=radiate)

Bits 128–191  (64 bits) — Neural weight seeds (used to deterministically initialize NPC neural network weights via PRNG)

Bits 192–223  (32 bits) — Phenotype expression modifiers
               Bits 192–199: color base hue (0–255 → 0–360°)
               Bits 200–207: color saturation (0–255)
               Bits 208–215: pattern type (0–255 mapped to 16 base patterns × 16 variants)
               Bits 216–223: bioluminescence spectrum (0=none, 1–255 → wavelength index)

Bits 224–239  (16 bits) — Epigenetic flags
               16 bits that can be set/cleared during an organism's lifetime
               but reset probabilistically across generations
               (used for learned behaviors, developmental plasticity)

Bits 240–255  (16 bits) — Reserved / species lineage marker
               Bits 240–247: clade ID (tracks phylogenetic branching)
               Bits 248–255: mutation accumulation counter (0–255)
```

### 6.2 Mutation Engine

`src/biology/MutationEngine.ts` applies mutations during reproduction:

**Mutation types:**

| Type | Rate | Effect |
|------|------|--------|
| Point mutation | 1e-4 per bit | Flip single bit |
| Segment duplication | 1e-6 per event | Copy 8-bit block to new position |
| Segment deletion | 1e-6 per event | Zero out 8-bit block |
| Inversion | 1e-7 per event | Reverse bit order in 16-bit block |
| Transposition | 1e-7 per event | Move 8-bit block to different offset |
| Horizontal gene transfer | 1e-8 per event | Copy block from nearby organism |

Mutation rates are modified by:
- Environmental radiation (nuclear decay byproducts)
- Temperature stress
- Chemical mutagens in the grid
- Epigenetic stabilization genes
- DNA repair genes (encoded in bits 73–75 region)

### 6.3 Abiogenesis System

The abiogenesis module simulates the origin of life from chemistry:

**Abiogenesis Stages:**

1. **Prebiotic chemistry**: Simple organic molecules form in warm pools (Miller-Urey chemistry)
2. **Monomer concentration**: Evaporation cycles concentrate amino acids and nucleotides
3. **Polymer formation**: Clay mineral surfaces catalyze peptide and RNA chain formation
4. **Self-replication**: RNA-like molecules with autocatalytic properties emerge stochastically
5. **Compartmentalization**: Lipid vesicles form and encapsulate replicators
6. **Proto-metabolism**: Coupled reactions create rudimentary energy extraction
7. **First cell**: A stable enclosed replicator with rudimentary gene expression

Each stage requires specific GridCell conditions (temperature, pH, molecule concentrations) and is stochastic — abiogenesis is not guaranteed and may require millions of simulation years.

### 6.4 Ecosystem Dynamics

`src/biology/EcosystemBalance.ts` maintains population dynamics using:

- Lotka-Volterra predator-prey equations (continuous approximation)
- Island biogeography for species spread (MacArthur-Wilson model)
- Competitive exclusion principle (Gause's law)
- Niche partitioning and resource competition
- Keystone species cascades
- Extinction risk calculation (population viability analysis)

---

## 7. Phase 3: AI NPC System

### 7.1 Neural Architecture (L0–L4)

NPC intelligence is layered. Each layer builds on the one below. The genome bits 32–47 determine which layers are active for a species.

**L0 — Reactive (Reflex)**
- Direct stimulus-response lookup table
- No memory, no planning
- Implemented as a simple threshold function
- Example: Bacteria moving toward glucose gradient

**L1 — Associative (Conditioned)**
- Hebbian learning network (25 neurons max)
- Associative memory: CS → US pairings
- Habituation and sensitization
- Example: Snail learning to avoid a specific stimulus

**L2 — Cognitive (Goal-Directed)**
- 128-neuron recurrent network
- Short-term memory buffer (last 16 states)
- Simple GOAP planner (3–5 action depth)
- Emotion valence modulates action weights
- Example: Fish schooling, simple territory defense

**L3 — Social (Theory of Mind)**
- 512-neuron network with attention mechanism
- Episodic memory (last 256 events)
- Full GOAP planner with social actions
- Belief modeling of other agents (simple ToM)
- Language: vocal/chemical signal vocabulary
- Example: Wolf pack coordination, crow tool use

**L4 — Abstract (Symbolic Reasoning)**
- 2048-neuron transformer-lite architecture
- Long-term memory (unlimited, stored in IndexedDB)
- Abstract concept formation
- Language: proto-symbolic communication
- Optional LLM bridge for human-tier intelligence
- Example: Early hominid tool-making, proto-civilization

### 7.2 LLM Integration

For species that reach L4 neural complexity (civilized humanoids), an optional LLM bridge (`src/ai/LLMBridge.ts`) allows NPC dialogue and reasoning to be backed by a real language model.

**Architecture:**

```
NPC brain tick (4 Hz)
  → if species.neuralComplexity >= L4
  → serialize current sensory state + memory summary
  → POST to /api/npc-think (edge function)
  → receive: action plan, dialogue, emotional state
  → apply to NPC behavior
```

**Prompt construction:**

The NPC's sensory state is serialized into a structured prompt:
- Current location, time of day, season
- Visible entities and their behavioral signals
- Current emotional state (fear, hunger, curiosity, etc.)
- Recent memory (last 10 significant events)
- Social relationships (allies, enemies, mates, offspring)
- Cultural knowledge (tools known, social norms)

LLM responses are cached per state-hash in IndexedDB to avoid redundant calls.

### 7.3 Sensory Systems

Each sense maps to a real physics/chemistry signal in the GridCell grid:

| Sense | Signal Source | Processing |
|-------|-------------|------------|
| Vision | Ray-cast against entity bounding volumes | Color, movement, distance |
| Hearing | Pressure wave propagation in grid | Direction, frequency, amplitude |
| Olfaction | Molecule concentration gradients | Chemical identity, intensity |
| Proprioception | Rapier body state | Position, velocity, acceleration |
| Electroreception | Electric field tensor from GridCell | Field direction and intensity |
| Magnetoreception | Earth dipole field direction | Compass bearing |
| Thermoreception | GridCell temperature differential | Gradient direction |
| Pain | Tissue damage flag from collision system | Intensity, location |

### 7.4 Emotion Model

Emotions are 8-dimensional vectors stored per NPC:

| Dimension | Range | Effect on Behavior |
|-----------|-------|-------------------|
| Valence | -1 to +1 | Overall approach/avoid |
| Arousal | 0 to 1 | Action urgency, attention focus |
| Dominance | 0 to 1 | Risk tolerance, assertion |
| Fear | 0 to 1 | Flee threshold reduction |
| Hunger | 0 to 1 | Food-seeking weight increase |
| Curiosity | 0 to 1 | Exploration drive |
| Affiliation | 0 to 1 | Social proximity seeking |
| Aggression | 0 to 1 | Attack weight increase |

Emotions decay toward a species-specific baseline at a rate encoded in the genome. Traumatic events can create persistent state changes (PTSD-like effects in high-complexity NPCs).

### 7.5 Social Simulation

`src/ai/SocialSimulation.ts` manages inter-NPC relationships:

- **Dyadic relationships**: bond strength (−1 to +1) between pairs
- **Dominance hierarchies**: linear rank ordering within groups
- **Kin recognition**: genome similarity used to infer relatedness
- **Reciprocal altruism**: tit-for-tat tracker per dyad
- **Cultural transmission**: behaviors can spread via imitation (L3+)
- **Group identity**: in-group/out-group markers and coalition formation
- **Mate choice**: sexual selection based on phenotype signals + bond quality

### 7.6 Animal-Specific Behavior Modules

Beyond the generic neural layers, species unlock specific behavior modules based on their genome:

| Module | Unlock condition | Description |
|--------|-----------------|-------------|
| Flocking | Social bits ≥ 3, aerial niche | Reynolds boids with predator awareness |
| Pack hunting | Social bits ≥ 4, apex predator | Coordinated pursuit with role assignment |
| Tool use | Learning bits ≥ 3, manipulator limbs | Object interaction, affordance detection |
| Cache memory | Memory bits ≥ 4, hoarding behavior | Spatial memory for food storage locations |
| Eusociality | Social bits = 6 or 7 | Colony division of labor, caste development |
| Nesting | Parental investment ≥ 2 | Site selection, construction behavior |
| Migration | Dispersal ≥ 5, magnetoreception | Seasonal movement with route learning |
| Play behavior | Emotion complexity ≥ 3, juvenile phase | Skill practice with reward without stakes |

---

## 8. Phase 4: World Generation

### 8.1 Big Bang → Stellar Nucleosynthesis

The simulation can optionally begin at cosmic scales:

1. Big Bang: uniform hydrogen/helium plasma
2. Stellar formation: gravitational collapse into first stars (Population III)
3. Stellar nucleosynthesis: fusion creates C, N, O, Ne, Mg, Si, S, Fe
4. Supernova: elements above Fe scattered into interstellar medium
5. Second generation stars with planetary systems form
6. Planet selection: player chooses a world to inhabit

For typical play, the simulation starts at Step 6 with a pre-generated Earth-analog.

### 8.2 Geology Generation

`src/world/PlanetGenerator.ts` produces a realistic planet:

- **Core**: differentiation (iron/nickel core, silicate mantle, crust)
- **Tectonics**: voronoi-based plate generator (6–20 plates), subduction and collision zones
- **Volcanism**: hotspots and rift zones, outgassing schedule
- **Hydrosphere**: ocean depth from elevation map + sea level
- **Initial atmosphere**: determined by planet mass, distance from star, volcanic composition
- **Magnetic field**: generated from core dynamo, protects from stellar wind

### 8.3 Biome Registry

`src/world/BiomeRegistry.ts` defines 32 biome types:

| ID | Biome | Key Parameters |
|----|-------|---------------|
| 0 | Deep ocean | T: 2–4°C, P: >200 atm, light: 0 |
| 1 | Abyssal plain | T: 2°C, chemosynthetic vents |
| 2 | Coral reef | T: 24–29°C, light: high, salinity: 35 ppt |
| 3 | Open ocean | T: varies, photic zone |
| 4 | Shallow coast | T: varies, high nutrients |
| 5 | Tidal flat | T: variable, alternating wet/dry |
| 6 | Mangrove | Tropical coast, brackish |
| 7 | Tropical rainforest | T: 25°C, rainfall: >200 cm/yr |
| 8 | Tropical dry forest | T: 25°C, seasonal drought |
| 9 | Savanna | T: 20–30°C, rainfall: 50–130 cm/yr |
| 10 | Desert | T: variable, rainfall: <25 cm/yr |
| 11 | Mediterranean shrubland | T: mild, seasonal drought |
| 12 | Temperate grassland | T: −10 to 30°C, low rainfall |
| 13 | Temperate deciduous forest | T: 5–20°C, seasonal |
| 14 | Temperate rainforest | T: 10°C, rainfall: >150 cm/yr |
| 15 | Boreal forest (taiga) | T: −50 to 20°C, coniferous |
| 16 | Tundra | T: −30 to 10°C, permafrost |
| 17 | Polar ice | T: <−10°C, snow/ice cover |
| 18 | Alpine | High elevation, thin air |
| 19 | Wetlands/swamp | High water table, anaerobic soils |
| 20 | Freshwater lake | T: varies, limnetic ecosystem |
| 21 | River | Lotic ecosystem, nutrients from erosion |
| 22 | Cave | Dark, humid, chemosynthetic |
| 23 | Volcanic field | High sulfur, extreme pH |
| 24–31 | Reserved for alien biomes | — |

### 8.4 Weather System

`src/world/WeatherSystem.ts` runs a simplified general circulation model:

- **Pressure systems**: high/low cells driven by temperature gradient
- **Wind**: geostrophic wind from pressure gradient + Coriolis effect
- **Precipitation**: moisture advection, orographic lifting, condensation
- **Storms**: tropical cyclones (>27°C sea surface), extratropical cyclones
- **Seasons**: axial tilt drives insolation variation
- **Climate change**: CO₂ accumulation drives temperature increase (Arrhenius forcing)
- **Ice ages**: Milankovitch cycle drivers (eccentricity, obliquity, precession)

---

## 9. Phase 5: Player & Gameplay

### 9.1 Player Role

The player does not directly control creatures. Instead they act as:

- **Observer**: watch the simulation unfold with full data access
- **Curator**: selectively apply evolution pressure (boost fit individuals)
- **Architect**: modify environment (terraform, introduce/remove species)
- **Diplomat**: at civilization scale, influence faction decisions
- **Scientist**: run experiments by setting up controlled grid sections

### 9.2 Player Controller

`src/player/PlayerController.ts` manages the camera and interaction system:

- **Free camera**: orbit, pan, zoom across all scales
- **Attach**: possess any NPC in observation mode (first-person sensory feed)
- **Manipulator beam**: lift, move, modify objects at all scales
- **Terraform brush**: paint temperature, humidity, elevation changes
- **Time controls**: pause, play, speed up/slow down simulation clock
- **Scale jump**: teleport camera between L1–L6 with context preservation

### 9.3 Inventory

The player has an inventory of intervention tools, unlocked via discovery:

| Tool | Unlock | Effect |
|------|--------|--------|
| Gene editor | Discover DNA | Directly flip genome bits on a creature |
| Meteor strike | Discover orbital mechanics | Mass extinction / crater formation |
| Climate dial | Discover greenhouse effect | Adjust global CO₂ |
| Plague vial | Discover pathogens | Introduce infectious agent |
| Fertilizer bomb | Discover nitrogen cycle | Boost soil nutrients in region |
| Lightning rod | Discover electricity | Trigger lightning-catalyzed reactions |
| Fossil reveal | Discover paleontology | Expose buried fossil record |
| Time crystal | Reach L5 tech | Localized time dilation field |

### 9.4 Evolution Tree

`src/player/EvolutionTree.ts` tracks the phylogenetic tree of all species that have ever existed in the simulation. The player can:

- Browse clade history
- Compare genome diffs between species
- Resurrect extinct species (with cost)
- Export a lineage as a "species card" shareable artifact

### 9.5 Discovery Journal

Every first-time observation triggers a discovery entry:

- First cell: "Abiogenesis — life emerges from chemistry"
- First multicellular organism: "The leap to complexity"
- First predator: "The arms race begins"
- First land creature: "Colonizing the continents"
- First fire use: "The technological threshold"

Discoveries unlock new player tools, HUD overlays, and research options.

---

## 10. Phase 6: Civilization

### 10.1 Technology Tree

`src/civilization/TechTree.ts` implements a 300+ node tech graph organized into epochs:

**Epoch 1: Prehistoric** (100,000 BCE – 10,000 BCE)
- Stone tools → composite tools → hafted tools
- Fire control → cooking → ceramics
- Language → oral tradition → counting

**Epoch 2: Neolithic** (10,000 BCE – 3,000 BCE)
- Animal domestication → selective breeding → herd management
- Plant cultivation → crop rotation → irrigation
- Permanent settlement → architecture → urban planning

**Epoch 3: Ancient** (3,000 BCE – 500 CE)
- Writing → mathematics → astronomy
- Bronze → iron → steel
- Wheel → cart → sailing ship
- Trade networks → money → markets

**Epoch 4: Medieval** (500 CE – 1500 CE)
- Mechanical clock → printing press → gunpowder
- Universities → empirical method → optics
- Windmill → watermill → canal systems

**Epoch 5: Industrial** (1500–1900)
- Steam engine → factories → railroads
- Thermodynamics → electricity → telegraph
- Germ theory → vaccines → anesthesia
- Chemistry → periodic table → synthetic dyes

**Epoch 6: Modern** (1900–2000)
- Internal combustion → aircraft → nuclear fission
- Quantum mechanics → semiconductors → computers
- Antibiotics → genetics → green revolution
- Television → satellites → internet

**Epoch 7: Information Age** (2000–2030)
- Smartphones → cloud computing → AI
- Renewable energy → electric vehicles → fusion research
- Genomics → CRISPR → synthetic biology

**Epoch 8: Post-Scarcity** (2030–2100)
- AGI → automation → universal basic resources
- Nuclear fusion → cheap energy → desalination
- Geoengineering → climate restoration

**Epoch 9: Space Age** (2100–2200)
- Orbital launch → space stations → lunar base
- Mars colonization → asteroid mining → L4/L5 habitats

**Epoch 10: Stellar** (2200+)
- Generation ships → terraforming → Dyson swarm
- Post-biological intelligence → civilization merger

### 10.2 Building System

`src/civilization/BuildingSystem.ts` manages the physical placement and operation of structures:

Each building has:
- Footprint geometry (voxel-aligned, procedural mesh)
- Resource inputs and outputs per simulation tick
- Worker capacity (NPC assignment)
- Upkeep cost (food, energy, materials)
- Tech prerequisites from the tech tree
- Upgrade path (up to 5 tiers)

Building categories:
- Resource extraction (mine, farm, well, solar farm, fusion reactor)
- Processing (smelter, refinery, fab, biolab)
- Infrastructure (road, aqueduct, power grid, fiber network)
- Civic (house, school, hospital, court, parliament)
- Science (observatory, university, research lab, particle collider)
- Military (wall, barracks, armory, missile silo)
- Culture (temple, library, theater, sports arena, museum)

### 10.3 Economy

`src/civilization/Economy.ts` runs a multi-commodity economy:

- **Resources**: 64 distinct resource types tracked globally
- **Supply chains**: production → storage → distribution → consumption
- **Markets**: price discovery via supply/demand, NPC traders
- **Currency**: begins as barter, progresses through commodity money → fiat → crypto
- **Trade routes**: inter-faction exchange, controlled by geography and diplomacy
- **Poverty/inequality**: Gini coefficient tracked, affects social stability
- **Innovation economy**: R&D investment → tech progress rate

### 10.4 Science System

`src/civilization/ScienceSystem.ts` models scientific progress:

- Research points generated by universities, labs, scholars
- Discovery graph: each discovery unlocks adjacent possibilities
- Paradigm shifts: radical discoveries reset adjacent fields
- Scientific consensus: requires replication and peer review simulation
- Funding allocation: player can direct research priorities
- Serendipity events: unexpected discoveries from cross-domain research

### 10.5 Tier 10 Meta-Layer

When a civilization reaches Epoch 10, the simulation reveals a meta-layer:

- The universe itself is a simulation (diegetic reveal)
- The player can now see the physics engine parameters
- Advanced civilizations can modify universal constants within limits
- Multiple player runs in parallel universes can interact
- The ultimate goal: create conditions for new life in a different corner of the universe — starting the cycle again

---

## 11. Phase 7: Polish & Scale

### 11.1 Performance Targets

| Metric | Target |
|--------|--------|
| Frame rate | 60 fps at 1080p |
| Entity count | 100,000 active NPCs |
| Grid cells | 1,000,000 active cells |
| Chemistry reactions | 10,000,000 per second |
| Save file size | <50 MB for 10,000 sim years |
| Load time | <3 seconds cold start |

### 11.2 Level of Detail (LOD) System

Three LOD tiers per entity:

| LOD | Distance | Representation |
|-----|----------|---------------|
| High | <50m | Full procedural mesh, full AI tick |
| Medium | 50–500m | Simplified mesh, reduced AI tick |
| Low | >500m | Billboard sprite, statistical behavior |

Out-of-view entities run at 1 Hz behavior tick and are rendered as instanced statistical distributions.

### 11.3 Procedural Audio

- Each biome has a layered ambient soundscape
- Creatures have procedurally generated vocalizations based on genome
- Weather events drive dynamic audio mixing
- Civilization scale adds industrial and cultural audio layers
- Music: generative algorithmic score that reacts to simulation state

### 11.4 Save / Load

`src/engine/SaveSystem.ts` uses IndexedDB via `idb`:

- Autosave every 60 real-time seconds
- Named save slots (10 max)
- Export save as compressed JSON blob
- Import save from file
- Save includes: ECS world snapshot, GridCell array, genome archive, tech tree state, discovery log, sim clock

---

## 12. Critical Files & Build Order

| Build Order | File | Layer | Description |
|-------------|------|-------|-------------|
| 1 | `src/engine/constants.ts` | Physics | All real-world constants |
| 2 | `src/engine/Grid.ts` | Physics | SharedArrayBuffer GridCell layout |
| 3 | `src/engine/SimClock.ts` | Physics | Multi-scale simulation clock |
| 4 | `src/ecs/world.ts` | ECS | bitecs world initialization |
| 5 | `src/ecs/components.ts` | ECS | All component definitions |
| 6 | `src/engine/SimulationEngine.ts` | Physics | Main engine coordinator |
| 7 | `src/chemistry/ElementDatabase.ts` | Chemistry | 118-element database |
| 8 | `src/chemistry/MoleculeRegistry.ts` | Chemistry | Molecule definitions |
| 9 | `src/chemistry/ReactionEngine.ts` | Chemistry | Reaction processing |
| 10 | `src/chemistry/AtmosphereModel.ts` | Chemistry | Atmospheric chemistry |
| 11 | `src/biology/GenomeEncoder.ts` | Biology | 256-bit genome decode/encode |
| 12 | `src/biology/MutationEngine.ts` | Biology | Mutation operators |
| 13 | `src/biology/SpeciesRegistry.ts` | Biology | Species tracking |
| 14 | `src/biology/Abiogenesis.ts` | Biology | Origin of life simulation |
| 15 | `src/biology/EcosystemBalance.ts` | Biology | Population dynamics |
| 16 | `src/ai/NeuralArchitecture.ts` | AI | L0–L4 neural layers |
| 17 | `src/ai/BehaviorTree.ts` | AI | BT node types |
| 18 | `src/ai/GOAP.ts` | AI | Goal-oriented action planning |
| 19 | `src/ai/EmotionModel.ts` | AI | 8D emotion vector |
| 20 | `src/ai/MemorySystem.ts` | AI | Episodic + semantic memory |
| 21 | `src/ai/SensorySystem.ts` | AI | Sense input processing |
| 22 | `src/ai/SocialSimulation.ts` | AI | Relationship graph |
| 23 | `src/ai/LLMBridge.ts` | AI | Optional LLM integration |
| 24 | `src/world/PlanetGenerator.ts` | World | Planet geometry + geology |
| 25 | `src/world/WorldChunkManager.ts` | World | LOD chunk loading |
| 26 | `src/world/BiomeRegistry.ts` | World | 32 biome definitions |
| 27 | `src/world/WeatherSystem.ts` | World | Atmospheric circulation |
| 28 | `src/ecs/systems.ts` | ECS | All system implementations |
| 29 | `src/rendering/SceneRoot.tsx` | Render | R3F scene root |
| 30 | `src/rendering/CreatureRenderer.tsx` | Render | Instanced creature mesh |
| 31 | `src/rendering/ProceduralCreature.ts` | Render | Genome→mesh pipeline |
| 32 | `src/rendering/TerrainShader.glsl` | Render | Terrain fragment shader |
| 33 | `src/player/PlayerController.ts` | Player | Camera + interaction |
| 34 | `src/player/EvolutionTree.ts` | Player | Phylogenetic tree UI data |
| 35 | `src/player/DiscoveryJournal.ts` | Player | Discovery log |
| 36 | `src/civilization/TechTree.ts` | Civ | Technology graph |
| 37 | `src/civilization/BuildingSystem.ts` | Civ | Building placement |
| 38 | `src/civilization/Economy.ts` | Civ | Resource economy |
| 39 | `src/civilization/ScienceSystem.ts` | Civ | Research model |
| 40 | `src/store/gameStore.ts` | State | Zustand game store |
| 41 | `src/store/playerStore.ts` | State | Zustand player store |
| 42 | `src/ui/HUD.tsx` | UI | Heads-up display |
| 43 | `src/ui/EvolutionTreeUI.tsx` | UI | Phylogenetic tree panel |
| 44 | `src/ui/TechTreeUI.tsx` | UI | Technology tree panel |
| 45 | `src/ui/TimeControls.tsx` | UI | Time dilation controls |

---

## 13. Full Folder Structure

```
universe-sim/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vercel.json
├── docs/
│   └── GAME_DESIGN.md
├── public/
│   └── universe.svg
├── rust/
│   └── (future: Rust WASM modules for hot path computation)
├── server/
│   └── (future: edge functions for LLM bridge)
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── engine/
    │   ├── constants.ts          — all CODATA physical constants
    │   ├── Grid.ts               — SharedArrayBuffer GridCell layout
    │   ├── SimClock.ts           — multi-scale simulation clock
    │   ├── SimulationEngine.ts   — coordinates all subsystem workers
    │   ├── SaveSystem.ts         — IndexedDB save/load via idb
    │   └── workers/
    │       ├── physicsWorker.ts  — Rapier3D at 60 Hz
    │       ├── chemWorker.ts     — reaction engine at 10 Hz
    │       ├── aiWorker.ts       — NPC brain tick at 4 Hz
    │       └── bioWorker.ts      — evolution tick at 1 Hz
    ├── chemistry/
    │   ├── ElementDatabase.ts    — 118 elements with full properties
    │   ├── MoleculeRegistry.ts   — molecule definitions + energetics
    │   ├── ReactionEngine.ts     — Arrhenius kinetics per GridCell
    │   └── AtmosphereModel.ts    — vertical atmosphere layers
    ├── biology/
    │   ├── GenomeEncoder.ts      — 256-bit genome encode/decode
    │   ├── MutationEngine.ts     — mutation operators + rates
    │   ├── SpeciesRegistry.ts    — living species + extinction log
    │   ├── Abiogenesis.ts        — origin-of-life stage machine
    │   └── EcosystemBalance.ts  — Lotka-Volterra + niche dynamics
    ├── ai/
    │   ├── NeuralArchitecture.ts — L0–L4 neural layer stack
    │   ├── BehaviorTree.ts       — BT node types + runner
    │   ├── GOAP.ts               — goal-oriented action planning
    │   ├── EmotionModel.ts       — 8D emotion vector + decay
    │   ├── MemorySystem.ts       — episodic + semantic memory
    │   ├── SensorySystem.ts      — sense input aggregation
    │   ├── SocialSimulation.ts   — relationship graph + culture
    │   └── LLMBridge.ts          — optional LLM integration
    ├── ecs/
    │   ├── world.ts              — bitecs world init
    │   ├── components.ts         — all component type definitions
    │   └── systems.ts            — all system implementations
    ├── world/
    │   ├── PlanetGenerator.ts    — procedural planet geometry
    │   ├── WorldChunkManager.ts  — LOD chunk loading/unloading
    │   ├── BiomeRegistry.ts      — 32 biome type definitions
    │   └── WeatherSystem.ts      — GCM-lite circulation model
    ├── rendering/
    │   ├── SceneRoot.tsx         — R3F Canvas + lighting setup
    │   ├── CreatureRenderer.tsx  — instanced creature rendering
    │   ├── ProceduralCreature.ts — genome → Three.js geometry
    │   ├── TerrainRenderer.tsx   — chunked terrain mesh
    │   ├── AtmosphereRenderer.tsx— sky dome + weather fx
    │   ├── ParticleSystem.tsx    — chemistry + weather particles
    │   └── shaders/
    │       ├── terrain.vert.glsl
    │       ├── terrain.frag.glsl
    │       ├── creature.vert.glsl
    │       └── atmosphere.frag.glsl
    ├── player/
    │   ├── PlayerController.ts   — camera + interaction
    │   ├── Inventory.ts          — intervention tools
    │   ├── EvolutionTree.ts      — phylogenetic tree data
    │   └── DiscoveryJournal.ts   — discovery log + unlocks
    ├── civilization/
    │   ├── TechTree.ts           — 300-node technology graph
    │   ├── BuildingSystem.ts     — building placement + operation
    │   ├── Economy.ts            — multi-commodity economy
    │   └── ScienceSystem.ts      — research + discovery model
    ├── store/
    │   ├── gameStore.ts          — Zustand: sim state, clock, scale
    │   └── playerStore.ts        — Zustand: camera, selection, tools
    └── ui/
        ├── HUD.tsx               — main heads-up display
        ├── EvolutionTreeUI.tsx   — phylogenetic tree panel
        ├── TechTreeUI.tsx        — technology tree panel
        ├── TimeControls.tsx      — time dilation slider + presets
        ├── GenomeViewer.tsx      — bit-level genome inspector
        ├── EcosystemPanel.tsx    — population dynamics graphs
        └── CivilizationPanel.tsx — faction + economy overview
```

---

## 14. Build Milestones

| Milestone | Description | Key Deliverables | Status |
|-----------|-------------|-----------------|--------|
| M0 | Scaffolding | package.json, vite config, tsconfig, index.html, App.tsx | Done |
| M1 | Physics core | constants.ts, Grid.ts, SimClock.ts, physicsWorker.ts | Pending |
| M2 | ECS foundation | world.ts, components.ts, basic systems.ts | Pending |
| M3 | Chemistry MVP | ElementDatabase, MoleculeRegistry, ReactionEngine | Pending |
| M4 | Rendering baseline | SceneRoot.tsx, terrain mesh, atmosphere sky | Pending |
| M5 | Abiogenesis demo | Abiogenesis.ts, GenomeEncoder.ts, first cell visible | Pending |
| M6 | Biology v1 | MutationEngine, SpeciesRegistry, EcosystemBalance | Pending |
| M7 | AI L0–L2 | NeuralArchitecture, BehaviorTree, EmotionModel | Pending |
| M8 | World generation | PlanetGenerator, BiomeRegistry, WeatherSystem | Pending |
| M9 | Player controls | PlayerController, Inventory, DiscoveryJournal | Pending |
| M10 | Multicellular life | Genome body plan → 3D creature mesh | Pending |
| M11 | Ecosystem dynamics | Predator-prey, competition, extinction events | Pending |
| M12 | AI L3–L4 | GOAP, SocialSimulation, ToM, LLMBridge | Pending |
| M13 | Civilization v1 | TechTree, BuildingSystem, Economy | Pending |
| M14 | HUD + UI | Full HUD, all panels, time controls | Pending |
| M15 | Save/load | SaveSystem, all state serialization | Pending |
| M16 | Performance | LOD, worker optimization, 100k entities | Pending |
| M17 | Audio | Procedural soundscape, creature vocalizations | Pending |
| M18 | Space age | Epoch 9–10 tech, orbital mechanics | Pending |
| M19 | Meta-layer | Tier 10 reveal, universe parameter editing | Pending |
| M20 | Release candidate | Full playthrough tested, deployed to Vercel | Pending |

---

*End of Game Design Document*

*This document is the authoritative reference for all engineering decisions. When in doubt about intended behavior at any simulation layer, consult this document first. All deviations require a design note in the relevant source file.*
