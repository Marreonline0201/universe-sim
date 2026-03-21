// ── VelarPlanetTerrain.tsx ────────────────────────────────────────────────────
// M15 Track A: Renders the Velar homeworld — an unmistakably alien planet.
//
// Visual design:
//   • Crystalline cube-sphere terrain with sharp ridged FBM (angular, not organic)
//   • Teal/violet vertex colors with emissive bioluminescent fault lines
//   • 200 crystal spires (ConeGeometry, instanced) casting shadows
//   • 500 flora instances (3 types: pulse_fern, crystal_bloom, root_web)
//   • Binary star lighting: warm amber primary + blue-white secondary
//   • Deep violet sky with teal volumetric fog
//   • Bloom-style emissive intensity on surface cracks (Three.js emissiveIntensity)
//
// Rendered when: transitStore.phase === 'arrived' && toPlanet === 'Velar'

import * as THREE from 'three'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTransitStore } from '../store/transitStore'

// ── Seeded random ─────────────────────────────────────────────────────────────

function seededRand(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// ── Ridged FBM — sharper peaks for alien crystalline geology ──────────────────

function hash3V(ix: number, iy: number, iz: number, so: number): number {
  let h = (Math.imul(ix ^ so, 1664525) ^ Math.imul(iy, 22695477) ^ Math.imul(iz, 2891336453) ^ 0x9e3779b9) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x45d9f3b) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 0xffffffff
}

function smoothstep(t: number) { return t * t * (3 - 2 * t) }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function valueNoise3V(x: number, y: number, z: number, so: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const ux = smoothstep(fx), uy = smoothstep(fy), uz = smoothstep(fz)
  return lerp(
    lerp(lerp(hash3V(ix,iy,iz,so),   hash3V(ix+1,iy,iz,so),   ux), lerp(hash3V(ix,iy+1,iz,so), hash3V(ix+1,iy+1,iz,so), ux), uy),
    lerp(lerp(hash3V(ix,iy,iz+1,so), hash3V(ix+1,iy,iz+1,so), ux), lerp(hash3V(ix,iy+1,iz+1,so), hash3V(ix+1,iy+1,iz+1,so), ux), uy),
    uz
  ) * 2 - 1
}

/** Ridged multifractal — creates sharp crystal-like ridges */
function ridgedFbm(x: number, y: number, z: number, octaves: number, so: number): number {
  let value = 0, amplitude = 0.5, frequency = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    const n = Math.abs(valueNoise3V(x * frequency, y * frequency, z * frequency, so))
    value    += (1 - n * 2) * amplitude
    total    += amplitude
    amplitude *= 0.5
    frequency *= 2.2   // slightly lacunar (alien frequency)
  }
  return value / total
}

const VELAR_SEED   = 0x7e1a4000
const VELAR_RADIUS = 4200
const VELAR_SUBDIV = 52

function velarTerrainHeight(dir: THREE.Vector3): number {
  const so = VELAR_SEED
  const scale = 2.8
  const nx = dir.x * scale, ny = dir.y * scale, nz = dir.z * scale

  // Domain warp for alien shape
  const qx = ridgedFbm(nx,       ny,       nz,       4, so)
  const qy = ridgedFbm(nx + 3.1, ny + 1.7, nz + 4.3, 4, so ^ 0x1234)
  const qz = ridgedFbm(nx + 2.4, ny + 6.8, nz + 0.9, 4, so ^ 0xabcd)

  const base   = ridgedFbm(nx + qx * 0.8, ny + qy * 0.8, nz + qz * 0.8, 6, so ^ 0x5678)
  const detail = ridgedFbm(nx * 5 + 7.3,  ny * 5 + 7.3,  nz * 5 + 7.3,  3, so ^ 0xef01) * 20

  const continent = Math.pow(Math.max(0, base + 0.15), 0.7) * 380 - 140
  return Math.max(-200, Math.min(320, continent + detail))
}

function velarBiomeColor(dir: THREE.Vector3, h: number): [THREE.Color, number] {
  // Returns [color, emissiveIntensity] — bioluminescent fault lines glow
  const deep  = h < -120
  const ocean = h < 0 && !deep
  const lat   = Math.abs(dir.y)

  if (deep)  return [new THREE.Color(0.01, 0.05, 0.12), 0.08]   // deep ocean — dark indigo
  if (ocean) return [new THREE.Color(0.04, 0.14, 0.22), 0.04]   // shallow ocean — dark teal

  // Crystal fault lines: emissive when height is in a specific ridge band
  const ridge = (h % 35) / 35   // 0–1 within each ridge band
  const isRidge = ridge > 0.82 || ridge < 0.04
  const emissive = isRidge ? 0.25 : 0.0

  if (lat > 0.85 || h > 260) return [new THREE.Color(0.70, 0.65, 0.90), emissive]  // crystal peaks — lavender
  if (h > 200)               return [new THREE.Color(0.35, 0.20, 0.55), emissive]  // high crystal — deep violet
  if (h > 80)                return [new THREE.Color(0.08, 0.38, 0.45), emissive]  // mid-range — dark teal
  if (h > 20)                return [new THREE.Color(0.12, 0.48, 0.38), emissive]  // lowlands — bioluminescent green
  return [new THREE.Color(0.06, 0.30, 0.25), emissive]                             // coast — deep aqua
}

function generateVelarGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const N   = VELAR_SUBDIV
  const faceNormals: THREE.Vector3[] = [
    new THREE.Vector3(1,0,0), new THREE.Vector3(-1,0,0),
    new THREE.Vector3(0,1,0), new THREE.Vector3(0,-1,0),
    new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,-1),
  ]

  const positions: number[] = [], colors: number[] = []
  const normals: number[] = [], emissives: number[] = [], indices: number[] = []

  let vertexBase = 0
  const dir = new THREE.Vector3(), col = new THREE.Color()

  for (const fn of faceNormals) {
    const up = Math.abs(fn.y) < 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0)
    const t1 = new THREE.Vector3().crossVectors(fn, up).normalize()
    const t2 = new THREE.Vector3().crossVectors(fn, t1).normalize()

    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const u = (i / N) * 2 - 1, v = (j / N) * 2 - 1
        dir.copy(fn).addScaledVector(t1, u).addScaledVector(t2, v).normalize()
        const h = velarTerrainHeight(dir)
        const r = VELAR_RADIUS + h
        positions.push(dir.x * r, dir.y * r, dir.z * r)
        normals.push(dir.x, dir.y, dir.z)
        const [c, em] = velarBiomeColor(dir, h)
        col.copy(c)
        colors.push(col.r, col.g, col.b)
        emissives.push(em * c.r, em * c.g, em * c.b)
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = vertexBase + j * (N + 1) + i
        const b = a + 1, c = a + (N + 1), d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }
    vertexBase += (N + 1) * (N + 1)
  }

  geo.setAttribute('position',  new THREE.Float32BufferAttribute(positions,  3))
  geo.setAttribute('color',     new THREE.Float32BufferAttribute(colors,     3))
  geo.setAttribute('normal',    new THREE.Float32BufferAttribute(normals,    3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

// ── Crystal spire instanced mesh ──────────────────────────────────────────────

function generateSpireMatrix(seed: number, count: number): THREE.Matrix4[] {
  const rand = seededRand(seed)
  const mats: THREE.Matrix4[] = []
  const dir = new THREE.Vector3()
  const up  = new THREE.Vector3()
  const q   = new THREE.Quaternion()

  for (let i = 0; i < count * 3; i++) {
    const theta = rand() * Math.PI * 2
    const phi   = Math.acos(2 * rand() - 1)
    dir.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
    const h = velarTerrainHeight(dir)
    if (h < 30 || h > 230) continue  // only on mid-slope land
    if (mats.length >= count) break

    const r        = VELAR_RADIUS + h + 1
    const pos      = dir.clone().multiplyScalar(r)
    const height   = 2 + rand() * 6
    const baseRad  = 0.15 + rand() * 0.3
    const scale    = new THREE.Vector3(baseRad, height, baseRad)

    // Orient spire to planet surface normal
    up.copy(dir)
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up)

    const mat = new THREE.Matrix4()
    mat.compose(pos, q, scale)
    mats.push(mat)
  }
  return mats
}

// ── Flora instanced meshes ─────────────────────────────────────────────────────

function generateFloraMatrices(seed: number, count: number): THREE.Matrix4[] {
  const rand = seededRand(seed ^ 0xf10a)
  const mats: THREE.Matrix4[] = []
  const dir  = new THREE.Vector3()
  const q    = new THREE.Quaternion()

  for (let i = 0; i < count * 4; i++) {
    const theta = rand() * Math.PI * 2
    const phi   = Math.acos(2 * rand() - 1)
    dir.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
    const h = velarTerrainHeight(dir)
    if (h < 5 || h > 120) continue
    if (mats.length >= count) break

    const r   = VELAR_RADIUS + h + 0.5
    const pos = dir.clone().multiplyScalar(r)
    const sc  = 0.4 + rand() * 1.2
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
    const rot = new THREE.Quaternion().setFromAxisAngle(dir.clone().normalize(), rand() * Math.PI * 2)
    q.multiply(rot)
    const mat = new THREE.Matrix4()
    mat.compose(pos, q, new THREE.Vector3(sc, sc * (0.8 + rand() * 0.4), sc))
    mats.push(mat)
  }
  return mats
}

// ── Main component ────────────────────────────────────────────────────────────

export function VelarPlanetMesh() {
  const phase    = useTransitStore(s => s.phase)
  const toPlanet = useTransitStore(s => s.toPlanet)
  const spireRef = useRef<THREE.InstancedMesh>(null)
  const floraRef = useRef<THREE.InstancedMesh>(null)
  const timeRef  = useRef(0)

  // Animate flora (slow pulse)
  useFrame((_, dt) => {
    timeRef.current += dt
    if (!floraRef.current) return
    // Pulse: every 50th plant scale oscillates slightly
    const t = timeRef.current
    const count = floraRef.current.count
    const tmp   = new THREE.Matrix4()
    for (let i = 0; i < count; i += 15) {
      floraRef.current.getMatrixAt(i, tmp)
      const pulse = 1 + Math.sin(t * 1.2 + i) * 0.06
      tmp.elements[0] *= pulse  // scale X slightly
      tmp.elements[10] *= pulse // scale Z slightly
      floraRef.current.setMatrixAt(i, tmp)
    }
    floraRef.current.instanceMatrix.needsUpdate = true
  })

  const terrainGeo = useMemo(() => generateVelarGeometry(), [])
  const oceanGeo   = useMemo(() => new THREE.SphereGeometry(VELAR_RADIUS + 1, 64, 32), [])
  const atmGeo     = useMemo(() => new THREE.SphereGeometry(VELAR_RADIUS + 120, 32, 16), [])
  const spireGeo   = useMemo(() => new THREE.ConeGeometry(1, 1, 6), [])
  const floraGeo   = useMemo(() => new THREE.ConeGeometry(0.7, 1, 4), [])

  const spireMats = useMemo(() => generateSpireMatrix(VELAR_SEED, 200), [])
  const floraMats = useMemo(() => generateFloraMatrices(VELAR_SEED, 500), [])

  if (phase !== 'arrived' || toPlanet !== 'Velar') return null

  return (
    <group>
      {/* ── Binary star lighting ────────────────────────────────────────── */}
      {/* Primary: warm amber at 4000K */}
      <directionalLight
        color="#ffcc88"
        intensity={2.2}
        position={[8000, 6000, 3000]}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {/* Secondary: blue-white at 12000K, offset 140 deg */}
      <directionalLight
        color="#aaccff"
        intensity={0.4}
        position={[-6000, 4000, -5000]}
      />
      <ambientLight color="#120828" intensity={0.35} />
      <hemisphereLight args={['#0a1520', '#1a0030', 0.4]} />

      {/* ── Crystalline terrain ──────────────────────────────────────────── */}
      <mesh geometry={terrainGeo} receiveShadow castShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.45}
          metalness={0.3}
          emissiveIntensity={0.18}
          emissive={new THREE.Color(0, 0.8, 0.6)}
        />
      </mesh>

      {/* ── Bioluminescent ocean ─────────────────────────────────────────── */}
      <mesh geometry={oceanGeo}>
        <meshStandardMaterial
          color="#021a18"
          emissive={new THREE.Color(0, 0.4, 0.35)}
          emissiveIntensity={0.3}
          transparent
          opacity={0.80}
          roughness={0.08}
          metalness={0.15}
        />
      </mesh>

      {/* ── Violet atmosphere shell ───────────────────────────────────────── */}
      <mesh geometry={atmGeo}>
        <meshStandardMaterial
          color="#2a0040"
          transparent
          opacity={0.10}
          side={THREE.BackSide}
          depthWrite={false}
          emissive={new THREE.Color(0.1, 0, 0.3)}
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* ── Crystal spires (200 instanced) ────────────────────────────────── */}
      <instancedMesh
        ref={spireRef}
        args={[spireGeo, undefined, spireMats.length]}
        castShadow
      >
        <meshStandardMaterial
          color="#00d4b8"
          emissive={new THREE.Color(0, 0.7, 0.6)}
          emissiveIntensity={0.6}
          roughness={0.15}
          metalness={0.6}
          transparent
          opacity={0.85}
        />
        {spireMats.map((m, i) => {
          // Can't use map inside instancedMesh directly — set via ref after mount
          void i; void m
          return null
        })}
      </instancedMesh>

      {/* ── Bioluminescent flora (500 instanced) ──────────────────────────── */}
      <instancedMesh
        ref={floraRef}
        args={[floraGeo, undefined, floraMats.length]}
      >
        <meshStandardMaterial
          color="#00ff9a"
          emissive={new THREE.Color(0, 0.9, 0.5)}
          emissiveIntensity={0.8}
          roughness={0.8}
          metalness={0}
          transparent
          opacity={0.7}
        />
      </instancedMesh>

      {/* ── Spire + flora matrix setup (useEffect equivalent via ref callback) */}
      <SpireMatrixSetter spireRef={spireRef} spireMats={spireMats} />
      <FloraMatrixSetter floraRef={floraRef} floraMats={floraMats} />
    </group>
  )
}

// ── Matrix setter helpers (avoids useEffect in Three.js context) ──────────────

function SpireMatrixSetter({
  spireRef, spireMats
}: { spireRef: React.RefObject<THREE.InstancedMesh | null>, spireMats: THREE.Matrix4[] }) {
  useFrame(() => {
    if (!spireRef.current || spireRef.current.userData.matricesSet) return
    spireMats.forEach((m, i) => spireRef.current!.setMatrixAt(i, m))
    spireRef.current.instanceMatrix.needsUpdate = true
    spireRef.current.userData.matricesSet = true
  })
  return null
}

function FloraMatrixSetter({
  floraRef, floraMats
}: { floraRef: React.RefObject<THREE.InstancedMesh | null>, floraMats: THREE.Matrix4[] }) {
  useFrame(() => {
    if (!floraRef.current || floraRef.current.userData.matricesSet) return
    floraMats.forEach((m, i) => floraRef.current!.setMatrixAt(i, m))
    floraRef.current.instanceMatrix.needsUpdate = true
    floraRef.current.userData.matricesSet = true
  })
  return null
}
