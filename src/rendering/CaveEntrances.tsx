// ── CaveEntrances.tsx ─────────────────────────────────────────────────────────
// M29 Track A: Renders dark disc markers at each cave entrance on the planet surface.
// 6 entrances seeded deterministically — spread around the planet at land positions.

import { useMemo } from 'react'
import * as THREE from 'three'
import { PLANET_RADIUS, SEA_LEVEL, terrainHeightAt } from '../world/SpherePlanet'

// ── Seeded PRNG (simple mulberry32) ──────────────────────────────────────────
function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}

export const CAVE_SEED = 0xC4FE5EED

/**
 * Returns 6 world-space positions for cave entrances.
 * All positions are guaranteed to be above SEA_LEVEL (land).
 * Each position is on the terrain surface with a small outward offset.
 */
export function getCaveEntrancePositions(): THREE.Vector3[] {
  const rng  = seededRandom(CAVE_SEED)
  const dir  = new THREE.Vector3()
  const positions: THREE.Vector3[] = []

  // We sample candidate directions spread around the sphere.
  // Keep only those above sea level. Attempt up to 200 times.
  let attempts = 0
  while (positions.length < 6 && attempts < 200) {
    attempts++
    // Uniform sphere sampling (Marsaglia method)
    const u  = rng() * 2 - 1
    const v  = rng() * 2 - 1
    const w  = rng() * 2 - 1
    const len = Math.sqrt(u * u + v * v + w * w)
    if (len < 0.001) continue
    dir.set(u / len, v / len, w / len)

    // Avoid polar extremes (y > 0.85 → likely all snow, dull visually)
    if (Math.abs(dir.y) > 0.82) continue

    const h = terrainHeightAt(dir)
    // Must be on land (above sea level) with at least 8m clearance
    if (h < SEA_LEVEL + 8) continue
    // Not too high — avoid mountain tops
    if (h > 150) continue

    // Place slightly inset into terrain surface (0.2m below surface)
    const r = PLANET_RADIUS + h - 0.2
    positions.push(new THREE.Vector3(dir.x * r, dir.y * r, dir.z * r))
  }

  // Pad with fallback positions if we couldn't find enough land
  while (positions.length < 6) {
    const idx = positions.length
    const angle = (idx / 6) * Math.PI * 2
    dir.set(Math.cos(angle) * 0.8, 0.2, Math.sin(angle) * 0.8).normalize()
    const h = Math.max(terrainHeightAt(dir), SEA_LEVEL + 8)
    const r = PLANET_RADIUS + h - 0.2
    positions.push(new THREE.Vector3(dir.x * r, dir.y * r, dir.z * r))
  }

  return positions
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CaveEntrances() {
  const positions = useMemo(() => getCaveEntrancePositions(), [])

  const discMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x000000),
      emissive: new THREE.Color(0x000000),
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide,
    })
  }, [])

  const discGeo = useMemo(() => new THREE.CircleGeometry(4, 24), [])

  return (
    <group name="cave-entrances">
      {positions.map((pos, i) => {
        // Orient disc to face outward from planet centre (i.e. lie flat on terrain)
        const normal = pos.clone().normalize()
        const quaternion = new THREE.Quaternion()
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)

        return (
          <mesh
            key={i}
            geometry={discGeo}
            material={discMat}
            position={pos}
            quaternion={quaternion}
          />
        )
      })}
    </group>
  )
}
