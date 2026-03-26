/**
 * CreatureSpawner.ts
 * Spawns initial creatures around the player spawn point using varied random genomes.
 * Extracted from SceneRoot.tsx during M18 Track A (step A8).
 *
 * Genome byte 12 (bits 96-103) sets neural complexity level (0-4).
 * Creature sizes range 0.15m (microorganisms) to 1.1m (large mammals).
 *
 * Scientific basis: Fidelity tier B (Behavioral) — not real abiogenesis, but
 * genomes are real 256-bit encodings per GenomeEncoder spec.
 */

import * as THREE from 'three'
import { world, createCreatureEntity } from '../world'
import { terrainHeightAt, PLANET_RADIUS } from '../../world/SpherePlanet'
import { seededRand } from '../../world/ResourceNodeManager'
import { creatureWander } from './CreatureWanderSystem'

const NUM_CREATURES = 10

// Predefined creature archetypes: [neuralLevel, sizeClass, mass, size (meters)]
const ARCHETYPES: Array<[0|1|2|3|4, number, number, number]> = [
  [0, 0, 0.01, 0.15],  // microorganism
  [0, 1, 0.05, 0.20],  // microorganism
  [1, 4, 0.5,  0.30],  // small invertebrate
  [1, 5, 1.2,  0.40],  // insect-scale creature
  [1, 6, 2.5,  0.50],  // small amphibian
  [2, 8, 5.0,  0.65],  // reptile/bird
  [2, 9, 8.0,  0.70],  // medium animal
  [2,10,15.0,  0.85],  // large bird/small mammal
  [3,12,40.0,  1.10],  // large mammal
  [2, 8, 6.0,  0.60],  // medium animal (extra)
]

export function spawnInitialCreatures(
  spawnX: number, spawnY: number, spawnZ: number,
): number[] {
  const rand = seededRand(77773)
  const spawnDir = new THREE.Vector3(spawnX, spawnY, spawnZ).normalize()
  const perpBase = Math.abs(spawnDir.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0)
  const tangent = new THREE.Vector3().crossVectors(spawnDir, perpBase).normalize()
  const dir     = new THREE.Vector3()
  const entityIds: number[] = []

  for (let i = 0; i < NUM_CREATURES; i++) {
    // Try up to 20 positions to find land
    let placed = false
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle   = rand() * Math.PI * 2
      const arcDist = (100 + rand() * 500) / PLANET_RADIUS
      const axis    = tangent.clone().applyAxisAngle(spawnDir, angle)
      dir.copy(spawnDir).applyAxisAngle(axis, arcDist)
      const h = terrainHeightAt(dir)
      if (h < 1) continue  // skip ocean

      const archetype = ARCHETYPES[i % ARCHETYPES.length]
      const [neuralLevel, , mass, size] = archetype

      // Build a random genome — byte 12 encodes neural complexity level
      const genome = new Uint8Array(32)
      for (let b = 0; b < 32; b++) genome[b] = Math.floor(rand() * 256)
      // Enforce neural level in bits 96-103 (byte 12)
      genome[12] = neuralLevel <= 0 ? 10
                 : neuralLevel === 1 ? 40
                 : neuralLevel === 2 ? 90
                 : neuralLevel === 3 ? 160
                 : 220

      const r   = PLANET_RADIUS + h + size * 0.5
      const cx  = dir.x * r
      const cy  = dir.y * r
      const cz  = dir.z * r

      const eid = createCreatureEntity(world, {
        x: cx, y: cy, z: cz,
        speciesId: i + 1,
        genome,
        neuralLevel,
        mass,
        size,
      })
      entityIds.push(eid)

      // Initialize wander state — random initial direction in local tangent plane
      const wanderAngle = rand() * Math.PI * 2
      const speed = 0.3 + rand() * 0.5  // 0.3-0.8 m/s wander speed
      creatureWander.set(eid, {
        vx: Math.cos(wanderAngle) * speed,
        vy: 0,
        vz: Math.sin(wanderAngle) * speed,
        timer: 2 + rand() * 4,  // change direction every 2-6 seconds
      })
      placed = true
      break
    }
    if (!placed) {
      // Fallback: place at spawn
      const archetype = ARCHETYPES[i % ARCHETYPES.length]
      const [neuralLevel, , mass, size] = archetype
      const genome = new Uint8Array(32)
      genome[12] = 40
      const h = Math.max(0, terrainHeightAt(spawnDir))
      const r = PLANET_RADIUS + h + size * 0.5 + i * 2
      const eid = createCreatureEntity(world, {
        x: spawnDir.x * r, y: spawnDir.y * r, z: spawnDir.z * r,
        speciesId: i + 1, genome, neuralLevel, mass, size,
      })
      entityIds.push(eid)
      creatureWander.set(eid, { vx: 0.3, vy: 0, vz: 0.3, timer: 3 })
    }
  }
  return entityIds
}
