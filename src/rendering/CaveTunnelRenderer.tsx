// ── CaveTunnelRenderer.tsx ────────────────────────────────────────────────────
// M29 Track A: Procedural cave tunnels + ore chambers + bioluminescent lighting.
// For each cave entrance, generates:
//   A2 — TubeGeometry tunnel curving downward 15-30m
//   A2 — Rough sphere chamber at tunnel end
//   A3 — Iron / crystal / coal resource meshes in chamber
//   A4 — PointLights + glowing mushroom meshes in chamber

import { useMemo } from 'react'
import * as THREE from 'three'
import { getCaveEntrancePositions, CAVE_SEED } from './CaveEntrances'

// ── Seeded PRNG ───────────────────────────────────────────────────────────────
function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** Build a TubeGeometry along a CatmullRom spline descending from entrance. */
function buildTunnel(
  entrance: THREE.Vector3,
  rng: () => number,
): { tube: THREE.TubeGeometry; chamberCenter: THREE.Vector3 } {
  const inward = entrance.clone().normalize().negate() // points toward planet centre

  // Build 4 control points, descending 15–30 m inward + lateral drift
  const depth = 15 + rng() * 15
  const lateral1 = new THREE.Vector3(
    rng() * 6 - 3,
    rng() * 6 - 3,
    rng() * 6 - 3,
  )
  const lateral2 = new THREE.Vector3(
    rng() * 8 - 4,
    rng() * 8 - 4,
    rng() * 8 - 4,
  )

  const p0 = entrance.clone()
  const p1 = entrance.clone().addScaledVector(inward, depth * 0.33).add(lateral1)
  const p2 = entrance.clone().addScaledVector(inward, depth * 0.66).add(lateral2)
  const p3 = entrance.clone().addScaledVector(inward, depth)

  const spline = new THREE.CatmullRomCurve3([p0, p1, p2, p3])
  const tube = new THREE.TubeGeometry(spline, 20, 3, 8, false)

  return { tube, chamberCenter: p3 }
}

/** Build a low-poly sphere for the chamber with vertex displacement. */
function buildChamber(
  center: THREE.Vector3,
  rng: () => number,
): THREE.BufferGeometry {
  const radius = 8 + rng() * 4
  const geo = new THREE.SphereGeometry(radius, 7, 5)
  const pos = geo.attributes.position

  // Displace each vertex slightly to break up the uniform sphere look
  for (let i = 0; i < pos.count; i++) {
    const ox = pos.getX(i)
    const oy = pos.getY(i)
    const oz = pos.getZ(i)
    const n = (rng() - 0.5) * 1.6
    const len = Math.sqrt(ox * ox + oy * oy + oz * oz)
    if (len > 0.001) {
      pos.setXYZ(i, ox + (ox / len) * n, oy + (oy / len) * n, oz + (oz / len) * n)
    }
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()

  // Translate geometry to chamber center
  geo.translate(center.x, center.y, center.z)
  return geo
}

// ── Ore types ─────────────────────────────────────────────────────────────────
const ORE_TYPES = [
  { geo: () => new THREE.SphereGeometry(0.4, 6, 4), color: 0x8c4a2e, emissive: 0x220e06, emissiveIntensity: 0.1, label: 'iron' },
  { geo: () => new THREE.BoxGeometry(0.5, 0.8, 0.4), color: 0x6655cc, emissive: 0x8866ff, emissiveIntensity: 0.4, label: 'crystal' },
  { geo: () => new THREE.SphereGeometry(0.35, 5, 4), color: 0x1a1208, emissive: 0x331100, emissiveIntensity: 0.15, label: 'coal' },
] as const

// ── Component ─────────────────────────────────────────────────────────────────

export function CaveTunnelRenderer() {
  const entrances = useMemo(() => getCaveEntrancePositions(), [])

  // ── Materials (shared across all caves) ──────────────────────────────────
  const tunnelMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.9, metalness: 0.1, side: THREE.BackSide }),
    [],
  )
  const chamberMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0x120d06, roughness: 0.95, metalness: 0.05, side: THREE.BackSide }),
    [],
  )
  const oreMats = useMemo(
    () =>
      ORE_TYPES.map((t) =>
        new THREE.MeshStandardMaterial({
          color: t.color,
          emissive: t.emissive,
          emissiveIntensity: t.emissiveIntensity,
          roughness: 0.75,
          metalness: 0.2,
        }),
      ),
    [],
  )
  const mushroomStemMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0xd4c8a0, roughness: 0.9 }),
    [],
  )
  const mushroomCapMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0x00cc66, emissive: 0x00ff88, emissiveIntensity: 0.3, roughness: 0.7 }),
    [],
  )

  // ── Geometry (shared) ────────────────────────────────────────────────────
  const stemGeo = useMemo(() => new THREE.CylinderGeometry(0.15, 0.18, 0.6, 7), [])
  const capGeo  = useMemo(() => new THREE.ConeGeometry(0.5, 0.45, 7), [])

  // ── Per-cave data ────────────────────────────────────────────────────────
  const caves = useMemo(() => {
    return entrances.map((entrance, idx) => {
      const rng = seededRandom(CAVE_SEED + idx * 0x1000)

      const { tube, chamberCenter } = buildTunnel(entrance, rng)
      const chamberGeo = buildChamber(chamberCenter, rng)

      // ── Ore nodes (8–12 per chamber) ────────────────────────────────────
      const oreCount = 8 + Math.floor(rng() * 5)
      const ores: { position: THREE.Vector3; typeIdx: number }[] = []

      // Compute "inward" direction from chamber center (toward planet core)
      const coreDir = chamberCenter.clone().normalize().negate()
      // Build an orthonormal basis for scattering around the chamber floor
      const up = new THREE.Vector3(0, 1, 0)
      if (Math.abs(coreDir.dot(up)) > 0.9) up.set(1, 0, 0)
      const right  = new THREE.Vector3().crossVectors(coreDir, up).normalize()
      const fwd    = new THREE.Vector3().crossVectors(right, coreDir).normalize()

      for (let j = 0; j < oreCount; j++) {
        const angle  = rng() * Math.PI * 2
        const spread = 3 + rng() * 5
        const offset = right.clone().multiplyScalar(Math.cos(angle) * spread)
          .addScaledVector(fwd, Math.sin(angle) * spread)
          .addScaledVector(coreDir, -(2 + rng() * 3)) // place on "floor"
        const typeIdx = Math.floor(rng() * 3)
        ores.push({ position: chamberCenter.clone().add(offset), typeIdx })
      }

      // ── Mushrooms (5–8 per chamber) ──────────────────────────────────────
      const shroomCount = 5 + Math.floor(rng() * 4)
      const mushrooms: THREE.Vector3[] = []
      for (let j = 0; j < shroomCount; j++) {
        const angle  = rng() * Math.PI * 2
        const spread = 2 + rng() * 6
        const offset = right.clone().multiplyScalar(Math.cos(angle) * spread)
          .addScaledVector(fwd, Math.sin(angle) * spread)
          .addScaledVector(coreDir, -(4 + rng() * 2))
        mushrooms.push(chamberCenter.clone().add(offset))
      }

      // ── Point lights (2–3 per chamber) ──────────────────────────────────
      const lightCount = 2 + Math.floor(rng() * 2)
      const lights: THREE.Vector3[] = []
      for (let j = 0; j < lightCount; j++) {
        const angle  = (j / lightCount) * Math.PI * 2
        const offset = right.clone().multiplyScalar(Math.cos(angle) * 3)
          .addScaledVector(fwd, Math.sin(angle) * 3)
        lights.push(chamberCenter.clone().add(offset))
      }

      return { tube, chamberGeo, chamberCenter, ores, mushrooms, lights }
    })
  }, [entrances])

  return (
    <group name="cave-tunnels">
      {caves.map((cave, i) => (
        <group key={i} name={`cave-${i}`}>
          {/* A2: Tunnel tube */}
          <mesh geometry={cave.tube} material={tunnelMat} />

          {/* A2: Chamber sphere */}
          <mesh geometry={cave.chamberGeo} material={chamberMat} />

          {/* A3: Ore veins */}
          {cave.ores.map((ore, j) => {
            const oreType = ORE_TYPES[ore.typeIdx]
            return (
              <mesh
                key={j}
                geometry={oreType.geo()}
                material={oreMats[ore.typeIdx]}
                position={ore.position}
              />
            )
          })}

          {/* A4: Bioluminescent mushrooms */}
          {cave.mushrooms.map((pos, j) => (
            <group key={j} position={pos}>
              <mesh geometry={stemGeo} material={mushroomStemMat} position={[0, 0.3, 0]} />
              <mesh geometry={capGeo}  material={mushroomCapMat}  position={[0, 0.75, 0]} />
            </group>
          ))}

          {/* A4: Point lights */}
          {cave.lights.map((pos, j) => (
            <pointLight
              key={j}
              position={pos}
              color="#4488ff"
              intensity={0.5}
              distance={10}
            />
          ))}
        </group>
      ))}
    </group>
  )
}
