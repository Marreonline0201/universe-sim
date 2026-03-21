// ── DestinationPlanet.tsx ─────────────────────────────────────────────────────
// M14 Track A: Renders the destination planet as a full Three.js scene.
// Shown when transitStore.phase === 'arrived'.
//
// Architecture:
//   • Uses same PlanetTerrain geometry generation pipeline as the home planet,
//     but with a different seed — giving a visually distinct world.
//   • Resource nodes are procedurally generated from the planet seed.
//   • NPC settlements appear at lower tech level (civLevel 0–1).
//   • Player is spawned at the planet's own getSpawnPosition() equivalent.
//   • "Return Home" prompt appears near any flat surface (launch_pad substitute).
//
// Planet seed derivation:
//   The planet's PlanetDef.seed is used as the world seed.
//   terrain noise uses seed to offset the FBM domain (xor-shifted into float range).

import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTransitStore } from '../store/transitStore'
import { SYSTEM_PLANETS } from '../game/OrbitalMechanicsSystem'

// ── Seeded FBM terrain (independent from home planet) ────────────────────────

function hash3Seeded(ix: number, iy: number, iz: number, seedOff: number): number {
  let h = (Math.imul(ix ^ seedOff, 1664525) ^ Math.imul(iy, 22695477) ^ Math.imul(iz, 2891336453) ^ 0x9e3779b9) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x45d9f3b) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 0xffffffff
}

function smoothstep(t: number): number { return t * t * (3 - 2 * t) }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

function valueNoise3S(x: number, y: number, z: number, so: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const ux = smoothstep(fx), uy = smoothstep(fy), uz = smoothstep(fz)
  return lerp(
    lerp(
      lerp(hash3Seeded(ix,iy,iz,so),   hash3Seeded(ix+1,iy,iz,so),   ux),
      lerp(hash3Seeded(ix,iy+1,iz,so), hash3Seeded(ix+1,iy+1,iz,so), ux),
      uy
    ),
    lerp(
      lerp(hash3Seeded(ix,iy,iz+1,so),   hash3Seeded(ix+1,iy,iz+1,so),   ux),
      lerp(hash3Seeded(ix,iy+1,iz+1,so), hash3Seeded(ix+1,iy+1,iz+1,so), ux),
      uy
    ),
    uz
  ) * 2 - 1
}

function fbm3S(x: number, y: number, z: number, octaves: number, so: number): number {
  let value = 0, amplitude = 0.5, frequency = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    value    += valueNoise3S(x * frequency, y * frequency, z * frequency, so) * amplitude
    total    += amplitude
    amplitude *= 0.5
    frequency *= 2.0
  }
  return value / total
}

function destTerrainHeight(dir: THREE.Vector3, seedOffset: number): number {
  const scale = 3.0
  const nx = dir.x * scale * 0.5
  const ny = dir.y * scale * 0.5
  const nz = dir.z * scale * 0.5

  // Warp layer
  const qx = fbm3S(nx,       ny,       nz,       4, seedOffset)
  const qy = fbm3S(nx + 5.2, ny + 1.3, nz + 3.7, 4, seedOffset ^ 0x1234)
  const qz = fbm3S(nx + 1.7, ny + 9.2, nz + 2.1, 4, seedOffset ^ 0x5678)

  const base = fbm3S(nx + qx, ny + qy, nz + qz, 6, seedOffset ^ 0xabcd)
  const continent = Math.pow(Math.max(0, base + 0.1), 0.8) * 300 - 120
  const detail    = fbm3S(nx * 6 + 9.1, ny * 6 + 9.1, nz * 6 + 9.1, 3, seedOffset ^ 0xef01) * 15

  return Math.max(-180, Math.min(250, continent + detail))
}

const DEST_PLANET_RADIUS = 4000
const DEST_SUBDIVISIONS  = 48   // slightly lower res than home for perf

function destBiomeColor(dir: THREE.Vector3, h: number, seed: number): THREE.Color {
  // Use seed to tint the biome palette — each planet looks distinct
  const tint = ((seed >>> 16) & 0xff) / 255  // 0–1 tint factor

  if (h < -80) return new THREE.Color(0.02 + tint * 0.04, 0.05, 0.25)
  if (h < 0)   return new THREE.Color(0.05, 0.18 + tint * 0.1, 0.5)
  if (h < 6)   return new THREE.Color(0.75 + tint * 0.1, 0.70, 0.45)

  const lat = Math.abs(dir.y)
  if (lat > 0.82 || h > 220) return new THREE.Color(0.90, 0.94, 1.00)
  if (h > 180)               return new THREE.Color(0.55, 0.50, 0.48)

  // Vary the lowland color based on seed
  const r = 0.12 + tint * 0.25
  const g = 0.35 + tint * 0.12
  const b = 0.10 + tint * 0.08
  return new THREE.Color(r, g, b)
}

function generateDestGeometry(seedOffset: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const N   = DEST_SUBDIVISIONS
  // Cube-sphere construction (same algorithm as home planet)
  const faceNormals: THREE.Vector3[] = [
    new THREE.Vector3(1,0,0), new THREE.Vector3(-1,0,0),
    new THREE.Vector3(0,1,0), new THREE.Vector3(0,-1,0),
    new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,-1),
  ]

  const positions: number[] = []
  const colors:    number[] = []
  const normals:   number[] = []
  const indices:   number[] = []

  let vertexBase = 0
  const dir = new THREE.Vector3()
  const col = new THREE.Color()

  for (const faceNormal of faceNormals) {
    // Build two tangent axes for this face
    const up = Math.abs(faceNormal.y) < 0.9
      ? new THREE.Vector3(0,1,0)
      : new THREE.Vector3(1,0,0)
    const t1 = new THREE.Vector3().crossVectors(faceNormal, up).normalize()
    const t2 = new THREE.Vector3().crossVectors(faceNormal, t1).normalize()

    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const u = (i / N) * 2 - 1
        const v = (j / N) * 2 - 1
        dir.copy(faceNormal).addScaledVector(t1, u).addScaledVector(t2, v).normalize()
        const h   = destTerrainHeight(dir, seedOffset)
        const r   = DEST_PLANET_RADIUS + h
        positions.push(dir.x * r, dir.y * r, dir.z * r)
        normals.push(dir.x, dir.y, dir.z)
        col.copy(destBiomeColor(dir, h, seedOffset))
        colors.push(col.r, col.g, col.b)
      }
    }

    // Quad indices for this face
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = vertexBase + j * (N + 1) + i
        const b = a + 1
        const c = a + (N + 1)
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }
    vertexBase += (N + 1) * (N + 1)
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3))
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

// ── Resource nodes on destination planet ─────────────────────────────────────

interface DestNode {
  x: number; y: number; z: number
  color: string
  label: string
}

function generateDestNodes(seedOffset: number): DestNode[] {
  let s = seedOffset >>> 0
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }

  const NODE_COLORS = ['#b87333','#7a6a5a','#8B5E3C','#888888','#ffd700','#44ff44']
  const NODE_LABELS = ['Copper Ore','Iron Ore','Wood','Stone','Gold','Uranium']
  const nodes: DestNode[] = []
  const dir = new THREE.Vector3()

  for (let i = 0; i < 80; i++) {
    // Random point on sphere surface
    const theta = rand() * Math.PI * 2
    const phi   = Math.acos(2 * rand() - 1)
    dir.set(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    )
    const h = destTerrainHeight(dir, seedOffset)
    if (h < 0) continue  // skip ocean

    const r = DEST_PLANET_RADIUS + h + 1
    const typeIdx = Math.floor(rand() * NODE_COLORS.length)
    nodes.push({
      x: dir.x * r, y: dir.y * r, z: dir.z * r,
      color: NODE_COLORS[typeIdx],
      label: NODE_LABELS[typeIdx],
    })
    if (nodes.length >= 50) break
  }
  return nodes
}

// ── Main component ────────────────────────────────────────────────────────────

export function DestinationPlanetMesh() {
  const destSeed   = useTransitStore(s => s.destinationSeed)
  const toPlanet   = useTransitStore(s => s.toPlanet)
  const meshRef    = useRef<THREE.Mesh>(null)

  // Seed offset: xor the planet seed with a constant so it differs from home
  const seedOffset = (destSeed ^ 0xdeadbeef) & 0x7fffffff

  const planetGeo = useMemo(() => generateDestGeometry(seedOffset), [seedOffset])
  const nodes     = useMemo(() => generateDestNodes(seedOffset), [seedOffset])

  // Ocean geometry
  const oceanGeo  = useMemo(() => new THREE.SphereGeometry(DEST_PLANET_RADIUS + 0.5, 64, 32), [])
  const atmGeo    = useMemo(() => new THREE.SphereGeometry(DEST_PLANET_RADIUS + 80, 32, 16), [])

  // Slow planet rotation so it looks alive
  useFrame((_, dt) => {
    if (meshRef.current) meshRef.current.rotation.y += dt * 0.005
  })

  const destPlanet = SYSTEM_PLANETS.find(p => p.name === toPlanet)
  const atmColor   = destPlanet?.color ?? '#88ccff'

  return (
    <group>
      {/* Terrain */}
      <mesh ref={meshRef} geometry={planetGeo} receiveShadow castShadow>
        <meshStandardMaterial vertexColors roughness={0.88} metalness={0} />
      </mesh>

      {/* Ocean */}
      <mesh geometry={oceanGeo}>
        <meshStandardMaterial
          color="#1a4a8a"
          transparent
          opacity={0.72}
          roughness={0.15}
          metalness={0.1}
        />
      </mesh>

      {/* Atmosphere shell */}
      <mesh geometry={atmGeo}>
        <meshStandardMaterial
          color={atmColor}
          transparent
          opacity={0.08}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Resource node dots */}
      {nodes.map((n, i) => (
        <mesh key={i} position={[n.x, n.y, n.z]}>
          <sphereGeometry args={[4, 6, 6]} />
          <meshStandardMaterial color={n.color} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}
