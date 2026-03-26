/**
 * ResourceNodesRenderer.tsx
 * Tree, rock, bark meshes + resource node visibility + health bars + dig holes.
 * Extracted from SceneRoot.tsx during M18 Track A (step A5).
 *
 * Wind foliage: vertex-shader micro-flutter via onBeforeCompile (Beaufort scale 2).
 * Rock specular: face-direction roughness variation via onBeforeCompile.
 * Health bars: zero-allocation preallocated mesh pool (M9 T3 optimization).
 */

import * as THREE from 'three'
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useMultiplayerStore } from '../../store/multiplayerStore'
import {
  RESOURCE_NODES,
  RESOURCE_NODE_QUATS,
  gatheredNodeIds,
  NODE_HITS_TAKEN,
  getNodeMaxHits,
} from '../../world/ResourceNodeManager'
import { DIG_HOLES } from '../../game/GameLoop'

// ── Deterministic per-node visual variation ──────────────────────────────────
function nodeRand(id: number, offset: number): number {
  let h = ((id * 374761 + offset * 668265) * 1274127) >>> 0
  return (h >>> 0) / 0xffffffff
}

// ── Foliage wind-sway material factory ───────────────────────────────────────
function makeWindFoliageMaterial(color: string, treeHeight: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime       = { value: 0 }
    shader.uniforms.uTreeHeight = { value: Math.max(treeHeight, 0.01) }
    ;(mat as any)._windUniforms = shader.uniforms
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      `uniform float uTime;\nuniform float uTreeHeight;\nvoid main() {`
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `float _windT = position.y / uTreeHeight;
transformed.x += sin(uTime * 0.5 + position.z * 0.3) * 0.02 * _windT * uTreeHeight;
transformed.z += sin(uTime * 0.37 + position.x * 0.25) * 0.012 * _windT * uTreeHeight;
#include <project_vertex>`
    )
  }
  return mat
}

// ── Rock face-variation material factory ─────────────────────────────────────
function makeRockMaterial(color: string): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.05 })
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor *= (0.7 + 0.3 * abs(vNormal.y));`
    )
  }
  return mat
}

function TreeMesh({ id }: { id: number }) {
  const scale    = 0.8 + nodeRand(id, 0) * 0.7
  const trunkH   = 3.5 * scale
  const trunkBot = 0.28 * scale
  const trunkTop = 0.12 * scale
  const lean     = (nodeRand(id, 1) - 0.5) * 0.06
  const leafG1   = '#1e5c1e'
  const leafG2   = nodeRand(id, 2) > 0.5 ? '#2a7030' : '#174d17'
  const leafG3   = '#3a8a2a'

  const crownHeight = 3.5 * scale * 1.1
  const mat1 = useMemo(() => makeWindFoliageMaterial(leafG1, crownHeight), []) // eslint-disable-line react-hooks/exhaustive-deps
  const mat2 = useMemo(() => makeWindFoliageMaterial(leafG2, crownHeight), []) // eslint-disable-line react-hooks/exhaustive-deps
  const mat3 = useMemo(() => makeWindFoliageMaterial(leafG3, crownHeight), []) // eslint-disable-line react-hooks/exhaustive-deps

  const phaseOffset = nodeRand(id, 9) * Math.PI * 2
  const freqMult    = 0.8 + nodeRand(id, 10) * 0.4
  const windYaw = nodeRand(id, 11) * 0.4 - 0.2

  const crownRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const crown = crownRef.current
    if (!crown) return
    const t = clock.elapsedTime
    const sway = Math.sin(t * 0.5 * freqMult * Math.PI * 2 + phaseOffset) * 0.055
               + Math.sin(t * 1.0 * freqMult * Math.PI * 2 + phaseOffset * 1.3) * 0.02
    crown.rotation.z = sway + windYaw * 0.3
    crown.rotation.x = sway * 0.35 + Math.sin(t * 0.7 * freqMult + phaseOffset * 0.7) * 0.015
    const windTime = t + phaseOffset
    const u1 = (mat1 as any)._windUniforms
    const u2 = (mat2 as any)._windUniforms
    const u3 = (mat3 as any)._windUniforms
    if (u1) u1.uTime.value = windTime
    if (u2) u2.uTime.value = windTime
    if (u3) u3.uTime.value = windTime
  })

  return (
    <group>
      <mesh position={[lean * trunkH * 0.5, trunkH * 0.5, 0]} castShadow rotation={[0, 0, lean]}>
        <cylinderGeometry args={[trunkTop, trunkBot, trunkH, 7]} />
        <meshStandardMaterial color="#5c3a1e" roughness={1} />
      </mesh>
      <group ref={crownRef} position={[lean * trunkH, trunkH * 0.5, 0]}>
        <mesh position={[0, trunkH * 0.12, 0]} castShadow material={mat1}>
          <coneGeometry args={[2.2 * scale, 2.8 * scale, 7]} />
        </mesh>
        <mesh position={[0, trunkH * 0.32, 0]} castShadow material={mat2}>
          <coneGeometry args={[1.6 * scale, 2.2 * scale, 6]} />
        </mesh>
        <mesh position={[0, trunkH * 0.48, 0]} castShadow material={mat3}>
          <coneGeometry args={[1.0 * scale, 1.6 * scale, 6]} />
        </mesh>
      </group>
    </group>
  )
}

function BarkMesh({ id }: { id: number }) {
  const scale = 0.7 + nodeRand(id, 6) * 0.5
  const rot   = nodeRand(id, 7) * Math.PI
  const tilt  = (nodeRand(id, 8) - 0.5) * 0.3
  return (
    <group position={[0, 0.06 * scale, 0]} rotation={[tilt, rot, 0]} scale={[scale, scale, scale]}>
      <mesh castShadow>
        <boxGeometry args={[0.8, 0.12, 0.35]} />
        <meshStandardMaterial color="#7a5a2a" roughness={1} />
      </mesh>
      <mesh position={[0.15, 0.06, 0.1]} rotation={[0, 0.4, 0.1]} castShadow>
        <boxGeometry args={[0.55, 0.10, 0.28]} />
        <meshStandardMaterial color="#6a4a1e" roughness={1} />
      </mesh>
    </group>
  )
}

function RockMesh({ id, color }: { id: number; color: string }) {
  const scale = 0.8 + nodeRand(id, 3) * 1.0
  const rot   = nodeRand(id, 4) * Math.PI * 2
  const tilt  = (nodeRand(id, 5) - 0.5) * 0.4
  const mat = useMemo(() => makeRockMaterial(color), []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group position={[0, 0.4 * scale, 0]} rotation={[tilt, rot, 0]} scale={[scale, scale * 0.7, scale]}>
      <mesh castShadow material={mat}>
        <dodecahedronGeometry args={[0.55, 0]} />
      </mesh>
    </group>
  )
}

// ── Node health bar renderer (zero-allocation pool) ─────────────────────────
const _MAX_HP_BARS = 32
const _hpTrackGeo = new THREE.PlaneGeometry(1.2, 0.18)
const _hpTrackMat = new THREE.MeshBasicMaterial({ color: '#222222', depthTest: false })
const _hpFillGeo = new THREE.PlaneGeometry(1.1, 0.14)
const _hpFillMats = Array.from({ length: _MAX_HP_BARS }, () =>
  new THREE.MeshBasicMaterial({ color: '#00ff00', depthTest: false }),
)
const _hpBarPos = new THREE.Vector3()
const _hpCamDir = new THREE.Vector3()
const _hpZAxis = new THREE.Vector3(0, 0, 1)
const _hpBillQ = new THREE.Quaternion()

export function NodeHealthBars() {
  const groupRef = useRef<THREE.Group>(null)
  const { trackMeshes, fillMeshes } = useMemo(() => {
    const tracks: THREE.Mesh[] = []
    const fills: THREE.Mesh[] = []
    for (let i = 0; i < _MAX_HP_BARS; i++) {
      const t = new THREE.Mesh(_hpTrackGeo, _hpTrackMat)
      t.renderOrder = 999; t.visible = false; tracks.push(t)
      const f = new THREE.Mesh(_hpFillGeo, _hpFillMats[i])
      f.renderOrder = 1000; f.visible = false; fills.push(f)
    }
    return { trackMeshes: tracks, fillMeshes: fills }
  }, [])

  useEffect(() => {
    const g = groupRef.current
    if (!g) return
    for (let i = 0; i < _MAX_HP_BARS; i++) { g.add(trackMeshes[i]); g.add(fillMeshes[i]) }
    return () => { _hpFillMats.forEach((m) => m.dispose()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame(({ camera }) => {
    let slot = 0
    for (const [nodeId, hitsTaken] of NODE_HITS_TAKEN) {
      if (slot >= _MAX_HP_BARS) break
      if (gatheredNodeIds.has(nodeId)) continue
      const node = RESOURCE_NODES.find((n) => n.id === nodeId)
      if (!node) continue
      const maxHits = getNodeMaxHits(node.type)
      const pct = 1 - hitsTaken / maxHits
      const nLen = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z) || 1
      _hpBarPos.set(node.x + (node.x / nLen) * 4.5, node.y + (node.y / nLen) * 4.5, node.z + (node.z / nLen) * 4.5)
      _hpCamDir.subVectors(camera.position, _hpBarPos).normalize()
      _hpBillQ.setFromUnitVectors(_hpZAxis, _hpCamDir)
      const track = trackMeshes[slot]
      track.position.copy(_hpBarPos); track.quaternion.copy(_hpBillQ); track.visible = true
      const fill = fillMeshes[slot]
      fill.scale.x = Math.max(0.001, pct)
      fill.position.set(_hpBarPos.x - 1.1 * (1 - pct) * 0.5, _hpBarPos.y, _hpBarPos.z)
      fill.quaternion.copy(_hpBillQ); fill.visible = true
      _hpFillMats[slot].color.setHSL((pct * 120) / 360, 0.8, 0.5)
      slot++
    }
    for (let i = slot; i < _MAX_HP_BARS; i++) { trackMeshes[i].visible = false; fillMeshes[i].visible = false }
  })

  return <group ref={groupRef} />
}

export function ResourceNodes() {
  const groupRefs = useRef<(THREE.Group | null)[]>([])

  useFrame(() => {
    const serverDepleted = useMultiplayerStore.getState().depletedNodes
    for (let i = 0; i < RESOURCE_NODES.length; i++) {
      const g = groupRefs.current[i]
      if (g) {
        const id = RESOURCE_NODES[i].id
        g.visible = !gatheredNodeIds.has(id) && !serverDepleted.has(id)
      }
    }
  })

  return (
    <>
      {RESOURCE_NODES.map((node, i) => {
        return (
          <group
            key={node.id}
            ref={el => { groupRefs.current[i] = el }}
            position={[node.x, node.y, node.z]}
            quaternion={RESOURCE_NODE_QUATS[i]}
          >
            {node.type === 'wood'
              ? <TreeMesh id={node.id} />
              : node.type === 'bark'
                ? <BarkMesh id={node.id} />
                : <RockMesh id={node.id} color={node.color} />
            }
          </group>
        )
      })}
    </>
  )
}

// ── Dig holes renderer ──────────────────────────────────────────────────────
const _digDiscGeo = new THREE.CircleGeometry(1, 12)
const _digDiscMat = new THREE.MeshStandardMaterial({
  color: '#1a1208', roughness: 1, metalness: 0,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
})

export function DigHolesRenderer() {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    while (g.children.length < DIG_HOLES.length) { g.add(new THREE.Mesh(_digDiscGeo, _digDiscMat)) }
    while (g.children.length > DIG_HOLES.length) { g.remove(g.children[g.children.length - 1]) }
    for (let i = 0; i < DIG_HOLES.length; i++) {
      const h = DIG_HOLES[i]
      const mesh = g.children[i] as THREE.Mesh
      mesh.position.set(h.x, h.y, h.z)
      mesh.scale.setScalar(h.r)
      const up = new THREE.Vector3(h.x, h.y, h.z).normalize()
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up)
    }
  })

  return <group ref={groupRef} />
}
