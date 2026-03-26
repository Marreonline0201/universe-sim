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

      _mat4.compose(_pos, quat, _scale)
      mesh.setMatrixAt(count, _mat4)
      count++
    }

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
    </>
  )
}

// ── M32: Tamed animal label overlay ──────────────────────────────────────────
// Projects tamed animal world positions to screen space each frame and renders
// a green heart + pet name as absolutely-positioned DOM elements.
// Kept outside the Canvas so it can be a plain HTML overlay layer.

interface TamedLabelEntry {
  id: number
  screenX: number
  screenY: number
  petName: string
}

const _worldPos3 = new THREE.Vector3()
const _screenVec = new THREE.Vector3()

export function TamedAnimalOverlay() {
  const { camera, size } = useThree()
  const [labels, setLabels] = useState<TamedLabelEntry[]>([])

  useFrame(() => {
    const next: TamedLabelEntry[] = []
    for (const a of animalRegistry.values()) {
      if (!a.tamed || a.behavior === 'DEAD') continue
      _worldPos3.set(a.x, a.y + 2.2, a.z)
      _screenVec.copy(_worldPos3).project(camera)
      // NDC to pixel coords
      const sx = (_screenVec.x * 0.5 + 0.5) * size.width
      const sy = (-_screenVec.y * 0.5 + 0.5) * size.height
      // Skip if behind camera
      if (_screenVec.z > 1) continue
      next.push({ id: a.id, screenX: sx, screenY: sy, petName: a.petName })
    }
    setLabels(next)
  })

  if (labels.length === 0) return null

  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
    >
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
          <span style={{ fontSize: 14, lineHeight: 1 }}>♥</span>
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
