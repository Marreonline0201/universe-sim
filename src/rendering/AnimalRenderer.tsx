// ── AnimalRenderer.tsx ────────────────────────────────────────────────────────
// M9 Track 2: Procedural animal mesh renderer
//
// Uses InstancedMesh for each species — one draw call per species regardless
// of population count. Geometry is procedural (box + cylinder primitives merged
// into a single BufferGeometry per species) for zero model file dependencies.
//
// Dead animals: matrix rotated 90° around their local forward axis (lies on side).
// Despawn at 120s (handled by AnimalAISystem — entity removed from registry).
//
// Instanced update: each frame we update only the instance matrix for each
// animal that moved (all do, every frame) using setMatrixAt + instanceMatrix.needsUpdate.

import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useMemo, useState, useEffect } from 'react'
import { animalRegistry, renameTamedAnimal } from '../ecs/systems/AnimalAISystem'
import type { AnimalEntity, AnimalSpecies } from '../ecs/systems/AnimalAISystem'
// BossSystem removed
const currentBoss: { position: [number, number, number]; hp: number; maxHp: number; killed: boolean } | null = null
function syncBossPosition() {}
function getBossDistanceAndDirection() { return null }

// ── Procedural geometry builders ─────────────────────────────────────────────
//
// We merge multiple BoxGeometry/CylinderGeometry primitives into a single
// BufferGeometry per species. This gives each animal a distinctive silhouette
// with zero model files.
//
// Deer:  elongated box body, 4 thin leg cylinders, small head box, two cone antlers
// Wolf:  low-profile elongated box body, 4 legs, tapered snout box
// Boar:  squat wide box body, 4 short legs, two forward tusk cylinders

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Count total vertices
  let totalPos = 0
  let totalIdx = 0
  for (const g of geometries) {
    totalPos += (g.attributes.position as THREE.BufferAttribute).count
    if (g.index) totalIdx += g.index.count
  }

  const positions = new Float32Array(totalPos * 3)
  const normals   = new Float32Array(totalPos * 3)
  const indices   = new Uint32Array(totalIdx)
  let posOffset = 0
  let idxOffset = 0
  let vtxOffset = 0

  for (const g of geometries) {
    const pos = g.attributes.position as THREE.BufferAttribute
    const nor = g.attributes.normal   as THREE.BufferAttribute
    const cnt = pos.count

    for (let i = 0; i < cnt; i++) {
      positions[(posOffset + i) * 3 + 0] = pos.getX(i)
      positions[(posOffset + i) * 3 + 1] = pos.getY(i)
      positions[(posOffset + i) * 3 + 2] = pos.getZ(i)
      normals[(posOffset + i) * 3 + 0] = nor.getX(i)
      normals[(posOffset + i) * 3 + 1] = nor.getY(i)
      normals[(posOffset + i) * 3 + 2] = nor.getZ(i)
    }

    if (g.index) {
      for (let i = 0; i < g.index.count; i++) {
        indices[idxOffset + i] = g.index.getX(i) + vtxOffset
      }
      idxOffset += g.index.count
    }

    vtxOffset  += cnt
    posOffset  += cnt
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  merged.setAttribute('normal',   new THREE.BufferAttribute(normals, 3))
  merged.setIndex(new THREE.BufferAttribute(indices, 1))
  // Recalculate normals after merging (transformations invalidated original normals)
  merged.computeVertexNormals()
  return merged
}

function applyTransform(geo: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const clone = geo.clone()
  clone.applyMatrix4(m)
  return clone
}

function buildDeerGeometry(): THREE.BufferGeometry {
  const _m = new THREE.Matrix4()
  const parts: THREE.BufferGeometry[] = []

  // Body: 1.4 × 0.55 × 0.6 m
  const body = new THREE.BoxGeometry(1.4, 0.55, 0.6)
  _m.makeTranslation(0, 0.55, 0)
  parts.push(applyTransform(body, _m))

  // Neck
  const neck = new THREE.BoxGeometry(0.2, 0.35, 0.2)
  _m.makeTranslation(0.55, 0.95, 0)
  parts.push(applyTransform(neck, _m))

  // Head
  const head = new THREE.BoxGeometry(0.35, 0.28, 0.28)
  _m.makeTranslation(0.75, 1.18, 0)
  parts.push(applyTransform(head, _m))

  // Antlers (two cones)
  const antlerGeo = new THREE.ConeGeometry(0.035, 0.35, 4)
  _m.compose(
    new THREE.Vector3(0.72, 1.5, 0.09),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.25)),
    new THREE.Vector3(1, 1, 1),
  )
  parts.push(applyTransform(antlerGeo, _m))
  _m.compose(
    new THREE.Vector3(0.72, 1.5, -0.09),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.25)),
    new THREE.Vector3(1, 1, 1),
  )
  parts.push(applyTransform(antlerGeo.clone(), _m))

  // 4 legs: thin cylinders
  const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6)
  const legPositions = [
    [0.45, 0.28, 0.22], [0.45, 0.28, -0.22],
    [-0.45, 0.28, 0.22], [-0.45, 0.28, -0.22],
  ]
  for (const [lx, ly, lz] of legPositions) {
    _m.makeTranslation(lx, ly, lz)
    parts.push(applyTransform(legGeo.clone(), _m))
  }

  return mergeGeometries(parts)
}

function buildWolfGeometry(): THREE.BufferGeometry {
  const _m = new THREE.Matrix4()
  const parts: THREE.BufferGeometry[] = []

  // Body: low-profile
  const body = new THREE.BoxGeometry(1.1, 0.42, 0.5)
  _m.makeTranslation(0, 0.45, 0)
  parts.push(applyTransform(body, _m))

  // Head
  const head = new THREE.BoxGeometry(0.32, 0.28, 0.28)
  _m.makeTranslation(0.58, 0.72, 0)
  parts.push(applyTransform(head, _m))

  // Snout (pointed forward)
  const snout = new THREE.BoxGeometry(0.22, 0.14, 0.18)
  _m.makeTranslation(0.82, 0.65, 0)
  parts.push(applyTransform(snout, _m))

  // Tail (small box)
  const tail = new THREE.BoxGeometry(0.22, 0.08, 0.08)
  _m.makeTranslation(-0.6, 0.58, 0)
  parts.push(applyTransform(tail, _m))

  // 4 legs
  const legGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.45, 6)
  const legPositions = [
    [0.38, 0.22, 0.19], [0.38, 0.22, -0.19],
    [-0.38, 0.22, 0.19], [-0.38, 0.22, -0.19],
  ]
  for (const [lx, ly, lz] of legPositions) {
    _m.makeTranslation(lx, ly, lz)
    parts.push(applyTransform(legGeo.clone(), _m))
  }

  return mergeGeometries(parts)
}

function buildBoarGeometry(): THREE.BufferGeometry {
  const _m = new THREE.Matrix4()
  const parts: THREE.BufferGeometry[] = []

  // Body: squat and wide
  const body = new THREE.BoxGeometry(1.2, 0.65, 0.75)
  _m.makeTranslation(0, 0.55, 0)
  parts.push(applyTransform(body, _m))

  // Head: large, forward-set
  const head = new THREE.BoxGeometry(0.45, 0.38, 0.42)
  _m.makeTranslation(0.68, 0.6, 0)
  parts.push(applyTransform(head, _m))

  // Tusks: two forward cylinders
  const tusk = new THREE.CylinderGeometry(0.035, 0.02, 0.25, 5)
  const tuskRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2))
  _m.compose(new THREE.Vector3(0.92, 0.52, 0.12), tuskRot, new THREE.Vector3(1, 1, 1))
  parts.push(applyTransform(tusk.clone(), _m))
  _m.compose(new THREE.Vector3(0.92, 0.52, -0.12), tuskRot, new THREE.Vector3(1, 1, 1))
  parts.push(applyTransform(tusk.clone(), _m))

  // 4 short stocky legs
  const legGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.55, 6)
  const legPositions = [
    [0.40, 0.27, 0.28], [0.40, 0.27, -0.28],
    [-0.40, 0.27, 0.28], [-0.40, 0.27, -0.28],
  ]
  for (const [lx, ly, lz] of legPositions) {
    _m.makeTranslation(lx, ly, lz)
    parts.push(applyTransform(legGeo.clone(), _m))
  }

  return mergeGeometries(parts)
}

// ── Materials ─────────────────────────────────────────────────────────────────

function makeMaterial(color: string, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })
}

// ── Main renderer component ───────────────────────────────────────────────────

const MAX_INSTANCES_PER_SPECIES = 25  // slightly above cap for safety

const _mat4     = new THREE.Matrix4()
const _pos      = new THREE.Vector3()
const _quat     = new THREE.Quaternion()   // reused return value from computeSurfaceQuat
const _quatDead = new THREE.Quaternion()   // reused for dead-tilt composition
const _scale    = new THREE.Vector3(1, 1, 1)
const _up       = new THREE.Vector3()
const _fwd      = new THREE.Vector3()
const _right    = new THREE.Vector3()
const _deadTilt = new THREE.Quaternion()

// Quaternion that tilts 90° around Z (lies on side)
_deadTilt.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2))

// Reusable rotation matrix — avoids per-frame heap allocation
const _rotMat = new THREE.Matrix4()

/**
 * Compute surface-normal-aligned quaternion for an animal.
 * Result is written into _quat (module-level scratch) — copy before calling again.
 */
function computeSurfaceQuat(
  x: number, y: number, z: number,
  vx: number, vz: number,
): THREE.Quaternion {
  // Up = normalize(position) — the planet-surface normal
  const len = Math.sqrt(x * x + y * y + z * z)
  if (len < 1) { _quat.identity(); return _quat }
  _up.set(x / len, y / len, z / len)

  // Forward = velocity direction projected onto tangent plane
  const speed = Math.sqrt(vx * vx + vz * vz)
  if (speed > 0.01) {
    _fwd.set(vx / speed, 0, vz / speed)
    _fwd.addScaledVector(_up, -_fwd.dot(_up))
    const fLen = _fwd.length()
    if (fLen > 0.001) _fwd.divideScalar(fLen)
    else _fwd.set(1, 0, 0)
  } else {
    _fwd.set(1, 0, 0)
    _fwd.addScaledVector(_up, -_fwd.dot(_up)).normalize()
  }

  _right.crossVectors(_fwd, _up).normalize()

  _rotMat.set(
    _right.x, _up.x, -_fwd.x, 0,
    _right.y, _up.y, -_fwd.y, 0,
    _right.z, _up.z, -_fwd.z, 0,
    0, 0, 0, 1,
  )
  _quat.setFromRotationMatrix(_rotMat)
  return _quat
}

interface AnimalSpeciesRendererProps {
  species: AnimalSpecies
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

function AnimalSpeciesRenderer({ species, geometry, material }: AnimalSpeciesRendererProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return

    let count = 0
    for (const animal of animalRegistry.values()) {
      if (animal.species !== species) continue
      if (count >= MAX_INSTANCES_PER_SPECIES) break

      _pos.set(animal.x, animal.y, animal.z)

      // computeSurfaceQuat writes into _quat (module-level scratch).
      // For dead animals we compose with _deadTilt into _quatDead to avoid
      // mutating the scratch value before _mat4.compose reads it.
      computeSurfaceQuat(animal.x, animal.y, animal.z, animal.vx, animal.vz)
      const quat = animal.behavior === 'DEAD'
        ? _quatDead.multiplyQuaternions(_quat, _deadTilt)
        : _quat

      // M34 Track B: Elite = 1.3× scale, Boss = 1.8× scale
      const s = animal.boss ? 1.8 : (animal.elite ? 1.3 : 1.0)
      _scale.set(s, s, s)
      _mat4.compose(_pos, quat, _scale)
      mesh.setMatrixAt(count, _mat4)
      count++
    }

    // Restore default scale
    _scale.set(1, 1, 1)

    // Clear remaining instances
    if (count < mesh.count) {
      _mat4.makeScale(0, 0, 0)
      for (let i = count; i < mesh.count; i++) {
        mesh.setMatrixAt(i, _mat4)
      }
    }

    mesh.count = MAX_INSTANCES_PER_SPECIES  // always render all slots (some are zeroed)
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_INSTANCES_PER_SPECIES]}
      castShadow
      receiveShadow
    />
  )
}

// ── M34: Elite glow ring renderer ────────────────────────────────────────────
// Renders a pulsing torus beneath each elite/boss creature.
// One torus per eligible animal (elite + boss), updated each frame.

const MAX_ELITE_INSTANCES = 10  // max elites+boss visible at once

const _elitePos   = new THREE.Vector3()
const _eliteQuat  = new THREE.Quaternion()
const _eliteScale = new THREE.Vector3()

export function EliteGlowRenderer() {
  const glowMeshRef = useRef<THREE.InstancedMesh>(null)
  const bossAuraMeshRef = useRef<THREE.InstancedMesh>(null)
  const uTime = useRef(0)

  const torusGeo = useMemo(() => new THREE.TorusGeometry(1.2, 0.12, 8, 24), [])
  const bossAuraGeo = useMemo(() => new THREE.TorusGeometry(2.2, 0.22, 8, 32), [])

  // We create one material per possible glow color. For simplicity we use a single
  // emissive material and swap color in the instance color attribute each frame.
  const eliteMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ff6600',
    emissive: '#ff6600',
    emissiveIntensity: 1.5,
    transparent: true,
    opacity: 0.75,
  }), [])

  const bossMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#cc0000',
    emissive: '#cc0000',
    emissiveIntensity: 2.0,
    transparent: true,
    opacity: 0.85,
  }), [])

  useFrame((_, dt) => {
    uTime.current += dt
    const t = uTime.current
    // Pulse: sin oscillates 0.6–1.0 amplitude
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * 2 / 0.5))

    const glowMesh = glowMeshRef.current
    const bossMesh = bossAuraMeshRef.current
    if (!glowMesh || !bossMesh) return

    let glowCount = 0
    let bossCount = 0

    for (const animal of animalRegistry.values()) {
      if (animal.behavior === 'DEAD') continue
      if (!animal.elite && !animal.boss) continue

      computeSurfaceQuat(animal.x, animal.y, animal.z, animal.vx, animal.vz)
      _elitePos.set(animal.x, animal.y, animal.z)

      if (animal.boss && bossCount < 1) {
        const bossS = 1.0 * pulse
        _eliteScale.set(bossS, bossS, bossS)
        _mat4.compose(_elitePos, _quat, _eliteScale)
        bossMesh.setMatrixAt(bossCount, _mat4)
        bossCount++
      } else if (animal.elite && glowCount < MAX_ELITE_INSTANCES) {
        const glowS = pulse
        _eliteScale.set(glowS, glowS, glowS)
        _mat4.compose(_elitePos, _quat, _eliteScale)
        glowMesh.setMatrixAt(glowCount, _mat4)
        glowCount++
      }
    }

    // Clear unused slots
    _mat4.makeScale(0, 0, 0)
    for (let i = glowCount; i < MAX_ELITE_INSTANCES; i++) glowMesh.setMatrixAt(i, _mat4)
    for (let i = bossCount; i < 1; i++) bossMesh.setMatrixAt(i, _mat4)

    glowMesh.count = MAX_ELITE_INSTANCES
    bossMesh.count = 1
    glowMesh.instanceMatrix.needsUpdate = true
    bossMesh.instanceMatrix.needsUpdate = true

    eliteMat.emissiveIntensity = 1.0 + pulse
    bossMat.emissiveIntensity  = 1.5 + pulse

    // Sync boss position for HUD/minimap
    syncBossPosition()
  })

  return (
    <>
      <instancedMesh ref={glowMeshRef} args={[torusGeo, eliteMat, MAX_ELITE_INSTANCES]} />
      <instancedMesh ref={bossAuraMeshRef} args={[bossAuraGeo, bossMat, 1]} />
    </>
  )
}

// ── M34: Boss world-position projection for skull overlay ─────────────────────
// Runs inside Canvas; dispatches a DOM event with boss screen coordinates.

interface BossProjectionData {
  screenX: number
  screenY: number
  hp: number
  maxHp: number
  visible: boolean
}

const _bossPos  = new THREE.Vector3()
const _bossProj = new THREE.Vector3()

export function BossOverlayProjector() {
  const { camera, size } = useThree()

  useFrame(() => {
    const boss = currentBoss
    if (!boss || boss.killed) {
      window.dispatchEvent(new CustomEvent<BossProjectionData>('__bossOverlayUpdate', {
        detail: { screenX: 0, screenY: 0, hp: 0, maxHp: 1, visible: false },
      }))
      return
    }

    const [bx, by, bz] = boss.position
    _bossPos.set(bx, by + 3.5, bz)
    _bossProj.copy(_bossPos).project(camera)

    const visible = _bossProj.z < 1  // in front of camera
    const sx = (_bossProj.x *  0.5 + 0.5) * size.width
    const sy = (-_bossProj.y * 0.5 + 0.5) * size.height

    window.dispatchEvent(new CustomEvent<BossProjectionData>('__bossOverlayUpdate', {
      detail: { screenX: sx, screenY: sy, hp: boss.hp, maxHp: boss.maxHp, visible },
    }))
  })

  return null
}

/** DOM overlay that renders skull + HP bar above the boss world position. */
export function BossWorldOverlayDOM() {
  const [data, setData] = useState<BossProjectionData | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<BossProjectionData>).detail
      setData(d.visible ? d : null)
    }
    window.addEventListener('__bossOverlayUpdate', handler)
    return () => window.removeEventListener('__bossOverlayUpdate', handler)
  }, [])

  if (!data) return null

  const hpPct = Math.max(0, Math.min(1, data.hp / data.maxHp))

  return (
    <div style={{
      position: 'fixed',
      left: data.screenX,
      top: data.screenY,
      transform: 'translate(-50%, -100%)',
      pointerEvents: 'none',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 3,
    }}>
      <span style={{ fontSize: 22, lineHeight: 1, filter: 'drop-shadow(0 0 6px #ff0000)' }}>&#9760;</span>
      <div style={{
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid #cc0000',
        borderRadius: 4,
        padding: '2px 6px',
        minWidth: 120,
      }}>
        <div style={{ fontSize: 10, color: '#ff4444', fontFamily: 'monospace', textAlign: 'center', marginBottom: 3 }}>
          Ancient Dire Wolf
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${hpPct * 100}%`,
            height: '100%',
            background: '#cc0000',
            borderRadius: 3,
            transition: 'width 0.2s ease',
          }} />
        </div>
        <div style={{ fontSize: 9, color: '#aaa', fontFamily: 'monospace', textAlign: 'center', marginTop: 2 }}>
          {Math.round(data.hp)}/{data.maxHp} HP
        </div>
      </div>
    </div>
  )
}

export function AnimalRenderer() {
  const deerGeo  = useMemo(() => buildDeerGeometry(),  [])
  const wolfGeo  = useMemo(() => buildWolfGeometry(),  [])
  const boarGeo  = useMemo(() => buildBoarGeometry(),  [])

  const deerMat  = useMemo(() => makeMaterial('#c4956a', 0.85), [])  // warm tan
  const wolfMat  = useMemo(() => makeMaterial('#6b7280', 0.80), [])  // cool grey
  const boarMat  = useMemo(() => makeMaterial('#5c4a3a', 0.90), [])  // dark brown

  return (
    <>
      <AnimalSpeciesRenderer species="deer" geometry={deerGeo} material={deerMat} />
      <AnimalSpeciesRenderer species="wolf" geometry={wolfGeo} material={wolfMat} />
      <AnimalSpeciesRenderer species="boar" geometry={boarGeo} material={boarMat} />
      {/* M34 Track B: Elite glow rings + boss aura */}
      <EliteGlowRenderer />
      {/* M34 Track B: Boss skull position projector (Canvas-side) */}
      <BossOverlayProjector />
    </>
  )
}

// ── M32: Tamed animal label overlay ──────────────────────────────────────────
// Bridge pattern (same as RemotePlayerNameTags):
//   - TamedAnimalOverlay: runs INSIDE the R3F Canvas, uses useThree/useFrame,
//     projects world positions, dispatches a custom DOM event each frame.
//   - TamedAnimalOverlayDOM: runs OUTSIDE the Canvas, listens for the event,
//     renders absolutely-positioned heart + name labels.

interface TamedLabelEntry {
  id: number
  screenX: number
  screenY: number
  petName: string
}

const _tamedPos  = new THREE.Vector3()
const _tamedProj = new THREE.Vector3()

/** Mount INSIDE the R3F Canvas. Projects tamed animal positions each frame and
 *  dispatches '__tamedLabelsUpdate' so TamedAnimalOverlayDOM can render them. */
export function TamedAnimalOverlay() {
  const { camera, size } = useThree()

  useFrame(() => {
    const next: TamedLabelEntry[] = []
    for (const a of animalRegistry.values()) {
      if (!a.tamed || a.behavior === 'DEAD') continue
      _tamedPos.set(a.x, a.y + 2.2, a.z)
      _tamedProj.copy(_tamedPos).project(camera)
      if (_tamedProj.z > 1) continue  // behind camera
      const sx = (_tamedProj.x  *  0.5 + 0.5) * size.width
      const sy = (-_tamedProj.y * 0.5 + 0.5) * size.height
      next.push({ id: a.id, screenX: sx, screenY: sy, petName: a.petName })
    }
    window.dispatchEvent(new CustomEvent<TamedLabelEntry[]>('__tamedLabelsUpdate', { detail: next }))
  })

  return null
}

/** Mount OUTSIDE the R3F Canvas (in the HUD layer). Renders heart + name
 *  labels for all tamed animals visible on screen. */
export function TamedAnimalOverlayDOM() {
  const [labels, setLabels] = useState<TamedLabelEntry[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      setLabels((e as CustomEvent<TamedLabelEntry[]>).detail)
    }
    window.addEventListener('__tamedLabelsUpdate', handler)
    return () => window.removeEventListener('__tamedLabelsUpdate', handler)
  }, [])

  if (labels.length === 0) return null

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100 }}>
      {labels.map(lbl => (
        <div
          key={lbl.id}
          style={{
            position: 'absolute',
            left: lbl.screenX,
            top: lbl.screenY,
            transform: 'translate(-50%, -100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1, color: '#a8e6a3' }}>♥</span>
          <span style={{
            fontFamily: 'monospace',
            fontSize: 10,
            color: '#a8e6a3',
            background: 'rgba(0,0,0,0.55)',
            padding: '1px 5px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
            textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            letterSpacing: 1,
          }}>
            {lbl.petName}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── M32: Pet naming popup ─────────────────────────────────────────────────────
// Listens for 'tame-animal-name-prompt' custom events dispatched by GameLoop
// and shows a small input popup to let the player name their new companion.

interface NamePromptState {
  animalId: number
  defaultName: string
}

export function TamedAnimalNamePrompt() {
  const [prompt, setPrompt] = useState<NamePromptState | null>(null)
  const [inputValue, setInputValue] = useState('')

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ animalId: number; defaultName: string }>).detail
      setPrompt(detail)
      setInputValue(detail.defaultName)
    }
    window.addEventListener('tame-animal-name-prompt', handler)
    return () => window.removeEventListener('tame-animal-name-prompt', handler)
  }, [])

  if (!prompt) return null

  const confirm = () => {
    renameTamedAnimal(prompt.animalId, inputValue || prompt.defaultName)
    setPrompt(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') confirm()
    if (e.key === 'Escape') { renameTamedAnimal(prompt.animalId, prompt.defaultName); setPrompt(null) }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9000,
      background: 'rgba(0,0,0,0.45)',
    }}>
      <div style={{
        background: 'rgba(20,20,20,0.97)',
        border: '1px solid rgba(168,230,163,0.4)',
        borderRadius: 6,
        padding: '18px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 240,
        fontFamily: 'monospace',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: 13, color: '#a8e6a3', letterSpacing: 1 }}>
          ♥ Name your companion:
        </div>
        <input
          autoFocus
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={24}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(168,230,163,0.35)',
            borderRadius: 4,
            color: '#e0e0e0',
            fontFamily: 'monospace',
            fontSize: 13,
            padding: '6px 10px',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={confirm}
            style={{
              background: 'rgba(168,230,163,0.18)',
              border: '1px solid rgba(168,230,163,0.4)',
              borderRadius: 4,
              color: '#a8e6a3',
              fontFamily: 'monospace',
              fontSize: 11,
              padding: '4px 14px',
              cursor: 'pointer',
              letterSpacing: 1,
            }}
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  )
}
