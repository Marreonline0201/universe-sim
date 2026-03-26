/**
 * LocalNpcsRenderer.tsx
 * Renders local (offline-mode) NPCs with utility-based AI when server is unavailable.
 * Extracted from SceneRoot.tsx during M18 Track A (step A3).
 *
 * Scientific basis: Utility-based agent architecture. Each NPC maintains continuous
 * need values (hunger 0-1, fatigue 0-1, safety 0-1). Every PLAN_INTERVAL seconds
 * the agent evaluates utility scores for each available action and selects the
 * highest-utility action.
 */

import * as THREE from 'three'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useMultiplayerStore } from '../../store/multiplayerStore'
import { usePlayerStore } from '../../store/playerStore'
import { surfaceRadiusAt, PLANET_RADIUS, getSpawnPosition } from '../../world/SpherePlanet'
import {
  RESOURCE_NODES,
  gatheredNodeIds,
} from '../../world/ResourceNodeManager'
import { MAT } from '../../player/Inventory'
import { NPC_SKIN_TONES, NPC_SHIRT_COLS, NPC_PANTS_COLS } from './HumanoidFigure'

const LOCAL_NPC_COUNT = 12
const NPC_WANDER_SPEED = 1.8  // m/s

// ── P2-3: NPC Utility AI ──────────────────────────────────────────────────────
//
// Actions:
//   WANDER  — explore randomly; satisfies curiosity, raises fatigue slowly
//   GATHER  — move toward nearest resource node; reduces hunger when complete
//   EAT     — consume carried food; reduces hunger instantly (if food available)
//   REST    — stand still; reduces fatigue
//   FLEE    — move away from player if trust < 0.3 and player is within 8m

type NpcAiState = 'WANDER' | 'GATHER' | 'EAT' | 'REST' | 'FLEE'

interface LocalNpcState {
  pos: THREE.Vector3
  vel: THREE.Vector3
  yaw: number
  walkPhase: number
  stateTimer: number
  wandering: boolean
  skinIdx: number
  hunger: number
  fatigue: number
  trust: number
  hasFood: boolean
  aiState: NpcAiState
  planTimer: number
  gatherTargetIdx: number
}

function utilityScore(action: NpcAiState, npc: LocalNpcState, distToPlayer: number): number {
  switch (action) {
    case 'FLEE':
      if (distToPlayer > 12 || npc.trust > 0.35) return 0
      return (1 - npc.trust) * (1 - distToPlayer / 12)
    case 'EAT':
      return npc.hasFood ? npc.hunger * 0.9 : 0
    case 'REST':
      return npc.fatigue > 0.6 ? npc.fatigue * 0.75 : 0
    case 'GATHER':
      return (!npc.hasFood && npc.hunger > 0.3) ? npc.hunger * 0.65 : 0
    case 'WANDER':
    default:
      return 0.2
  }
}

function selectAiAction(npc: LocalNpcState, distToPlayer: number): NpcAiState {
  const actions: NpcAiState[] = ['FLEE', 'EAT', 'REST', 'GATHER', 'WANDER']
  let bestAction: NpcAiState = 'WANDER'
  let bestScore = -1
  for (const a of actions) {
    const score = utilityScore(a, npc, distToPlayer)
    if (score > bestScore) { bestScore = score; bestAction = a }
  }
  return bestAction
}

function buildLocalNpcs(): LocalNpcState[] {
  const npcs: LocalNpcState[] = []
  const [sx, sy, sz] = (() => {
    try { return getSpawnPosition() } catch { return [0, 2001, 0] }
  })()
  const spawnPos = new THREE.Vector3(sx, sy, sz)
  for (let i = 0; i < LOCAL_NPC_COUNT; i++) {
    const angle = (i / LOCAL_NPC_COUNT) * Math.PI * 2
    const dist  = 8 + (i % 4) * 14
    const up = spawnPos.clone().normalize()
    const north = new THREE.Vector3(0, 0, 1)
    north.addScaledVector(up, -north.dot(up)).normalize()
    const east = new THREE.Vector3().crossVectors(up, north).normalize()
    const offset = north.clone().multiplyScalar(Math.cos(angle) * dist)
      .addScaledVector(east, Math.sin(angle) * dist)
    const pos = spawnPos.clone().add(offset).normalize().multiplyScalar(spawnPos.length())
    const sr = surfaceRadiusAt(pos.x, pos.y, pos.z)
    pos.normalize().multiplyScalar(sr + 0.9)
    npcs.push({
      pos,
      vel: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      walkPhase: Math.random() * Math.PI * 2,
      stateTimer: 3 + Math.random() * 5,
      wandering: Math.random() > 0.4,
      skinIdx: i % NPC_SKIN_TONES.length,
      hunger:   0.1 + Math.random() * 0.4,
      fatigue:  0.1 + Math.random() * 0.3,
      trust:    0.4 + Math.random() * 0.4,
      hasFood:  false,
      aiState:  'WANDER',
      planTimer: Math.random() * 3,
      gatherTargetIdx: -1,
    })
  }
  return npcs
}

function LocalNpcMesh({ npc, isMerchant }: { npc: LocalNpcState; isMerchant?: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  const lLegRef  = useRef<THREE.Group>(null)
  const rLegRef  = useRef<THREE.Group>(null)
  const lArmRef  = useRef<THREE.Group>(null)
  const rArmRef  = useRef<THREE.Group>(null)
  const _up    = useRef(new THREE.Vector3())
  const _north = useRef(new THREE.Vector3())
  const _east  = useRef(new THREE.Vector3())
  const _fwd   = useRef(new THREE.Vector3())
  const _mat   = useRef(new THREE.Matrix4())

  const si = npc.skinIdx
  const skin  = NPC_SKIN_TONES[si]
  const shirt = NPC_SHIRT_COLS[si]
  const pants = NPC_PANTS_COLS[si]

  useFrame((_, delta) => {
    const root = groupRef.current
    if (!root) return

    const dt = Math.min(delta, 0.1)
    const pos = npc.pos
    const up = pos.clone().normalize()

    // Update biological needs every frame
    npc.hunger  = Math.min(1, npc.hunger  + 0.004 * dt)
    npc.fatigue = Math.min(1, npc.fatigue + (npc.aiState === 'WANDER' || npc.aiState === 'GATHER' ? 0.003 : -0.008) * dt)

    // Trust dynamics
    const ps = usePlayerStore.getState()
    const pdx = ps.x - pos.x, pdy = ps.y - pos.y, pdz = ps.z - pos.z
    const distToPlayer = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz)
    if (distToPlayer < 10) {
      npc.trust = Math.min(1, npc.trust + 0.001 * dt)
    }

    // Re-evaluate utility plan every 3 seconds
    npc.planTimer -= dt
    if (npc.planTimer <= 0) {
      npc.planTimer = 2.5 + Math.random() * 1.5
      const newState = selectAiAction(npc, distToPlayer)
      if (newState !== npc.aiState) {
        npc.aiState   = newState
        npc.stateTimer = 0
        npc.gatherTargetIdx = -1
      }
      if (npc.aiState === 'GATHER') {
        let bestDist = Infinity
        let bestIdx  = -1
        for (let ni = 0; ni < RESOURCE_NODES.length; ni++) {
          const node = RESOURCE_NODES[ni]
          if (gatheredNodeIds.has(node.id)) continue
          if (node.matId !== MAT.RAW_MEAT && node.matId !== MAT.BONE) continue
          const dx = node.x - pos.x, dy = node.y - pos.y, dz = node.z - pos.z
          const d = dx*dx + dy*dy + dz*dz
          if (d < bestDist) { bestDist = d; bestIdx = ni }
        }
        npc.gatherTargetIdx = bestIdx
      }
    }

    if (npc.aiState === 'EAT') {
      npc.hunger  = Math.max(0, npc.hunger  - 0.4)
      npc.hasFood = false
      npc.aiState = 'WANDER'
      npc.planTimer = 1
    }

    npc.stateTimer -= dt
    const moving = npc.aiState === 'WANDER' || npc.aiState === 'GATHER' || npc.aiState === 'FLEE'
    if (npc.stateTimer <= 0 && npc.aiState === 'WANDER') {
      npc.stateTimer = 2 + Math.random() * 6
      npc.yaw += (Math.random() - 0.5) * Math.PI * 0.8
    }

    if (npc.aiState === 'GATHER' && npc.gatherTargetIdx >= 0) {
      const target = RESOURCE_NODES[npc.gatherTargetIdx]
      if (target && !gatheredNodeIds.has(target.id)) {
        const tdx = target.x - pos.x, tdy = target.y - pos.y, tdz = target.z - pos.z
        const tLen = Math.sqrt(tdx*tdx + tdy*tdy + tdz*tdz)
        if (tLen < 2.5) {
          npc.hasFood   = true
          npc.aiState   = 'EAT'
          npc.planTimer = 0.5
        } else {
          const north = _north.current.set(0, 0, 1)
          north.addScaledVector(up, -north.dot(up)).normalize()
          const east = _east.current.crossVectors(up, north).normalize()
          const targetYaw = Math.atan2(
            tdx * east.x + tdy * east.y + tdz * east.z,
            tdx * north.x + tdy * north.y + tdz * north.z
          )
          const yawDiff = ((targetYaw - npc.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
          npc.yaw += Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), 1.2 * dt)
        }
      } else {
        npc.gatherTargetIdx = -1
        npc.aiState = 'WANDER'
      }
    }

    if (npc.aiState === 'FLEE') {
      const north = _north.current.set(0, 0, 1)
      north.addScaledVector(up, -north.dot(up)).normalize()
      const east = _east.current.crossVectors(up, north).normalize()
      const awayX = -pdx, awayY = -pdy, awayZ = -pdz
      npc.yaw = Math.atan2(
        awayX * east.x + awayY * east.y + awayZ * east.z,
        awayX * north.x + awayY * north.y + awayZ * north.z
      )
    }

    if (moving) {
      const north = _north.current.set(0, 0, 1)
      north.addScaledVector(up, -north.dot(up)).normalize()
      const east = _east.current.crossVectors(up, north).normalize()
      const fwdX = north.x * Math.cos(npc.yaw) + east.x * Math.sin(npc.yaw)
      const fwdY = north.y * Math.cos(npc.yaw) + east.y * Math.sin(npc.yaw)
      const fwdZ = north.z * Math.cos(npc.yaw) + east.z * Math.sin(npc.yaw)

      const spd = (npc.aiState === 'FLEE' ? NPC_WANDER_SPEED * 2.0 : NPC_WANDER_SPEED) * dt
      const nx2 = pos.x + fwdX * spd
      const ny2 = pos.y + fwdY * spd
      const nz2 = pos.z + fwdZ * spd

      const targetH = surfaceRadiusAt(nx2, ny2, nz2) - PLANET_RADIUS
      if (targetH < 2) {
        npc.yaw += Math.PI + (Math.random() - 0.5) * 0.8
        npc.stateTimer = 1 + Math.random() * 2
      } else {
        pos.x = nx2; pos.y = ny2; pos.z = nz2
        const sr = surfaceRadiusAt(pos.x, pos.y, pos.z)
        pos.normalize().multiplyScalar(sr + 0.9)
      }
      npc.walkPhase += dt * 3.5
    }
    npc.wandering = moving

    root.position.copy(pos)

    const up2    = _up.current.copy(pos).normalize()
    const north2 = _north.current.set(0, 0, 1)
    north2.addScaledVector(up2, -north2.dot(up2)).normalize()
    const east2 = _east.current.crossVectors(up2, north2).normalize()
    const fwd2  = _fwd.current.copy(north2).multiplyScalar(Math.cos(npc.yaw)).addScaledVector(east2, Math.sin(npc.yaw))
    _mat.current.set(
      east2.x, up2.x, -fwd2.x, 0,
      east2.y, up2.y, -fwd2.y, 0,
      east2.z, up2.z, -fwd2.z, 0,
      0,       0,     0,       1,
    )
    root.quaternion.setFromRotationMatrix(_mat.current)

    const swing = npc.wandering ? Math.sin(npc.walkPhase) * 0.5 : 0
    if (lLegRef.current) lLegRef.current.rotation.x =  swing
    if (rLegRef.current) rLegRef.current.rotation.x = -swing
    if (lArmRef.current) lArmRef.current.rotation.x = -swing * 0.55
    if (rArmRef.current) rArmRef.current.rotation.x =  swing * 0.55
  })

  const dotColor =
    npc.aiState === 'FLEE'   ? '#ff2222' :
    npc.aiState === 'EAT'    ? '#ff8833' :
    npc.aiState === 'GATHER' ? '#44dd88' :
    npc.aiState === 'REST'   ? '#4488ff' :
                               '#ffdd44'

  return (
    <group ref={groupRef}>
      {/* AI state indicator dot */}
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.10, 6, 6]} />
        <meshStandardMaterial color={dotColor} emissive={dotColor} emissiveIntensity={0.8} />
      </mesh>
      {/* M27: Merchant bag indicator — gold diamond above trader NPCs */}
      {isMerchant && (
        <mesh position={[0, 1.85, 0]}>
          <octahedronGeometry args={[0.12, 0]} />
          <meshStandardMaterial color="#f1c40f" emissive="#f1c40f" emissiveIntensity={1.2} />
        </mesh>
      )}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.44, 0.58, 0.22]} />
        <meshStandardMaterial color={shirt} />
      </mesh>
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.42, 0.22, 0.22]} />
        <meshStandardMaterial color={pants} />
      </mesh>
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.34, 0.34, 0.32]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      <mesh position={[0.09, 1.03, -0.17]}>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[-0.09, 1.03, -0.17]}>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 0.86, 0]}>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      <group ref={lArmRef} position={[-0.30, 0.75, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color={shirt} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color={skin} />
        </mesh>
      </group>
      <group ref={rArmRef} position={[0.30, 0.75, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color={shirt} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color={skin} />
        </mesh>
      </group>
      <group ref={lLegRef} position={[-0.13, 0.09, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color={pants} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]}>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
      <group ref={rLegRef} position={[0.13, 0.09, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color={pants} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]}>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
    </group>
  )
}

export function LocalNpcsRenderer() {
  const connectionStatus = useMultiplayerStore(s => s.connectionStatus)
  const remoteNpcs = useMultiplayerStore(s => s.remoteNpcs)
  const showLocal = connectionStatus !== 'connected' || remoteNpcs.length === 0
  const npcs = useMemo(() => buildLocalNpcs(), [])
  // NPC_ROLES order: ['villager','guard','elder','trader','artisan','scout']
  // trader is index 3 (modulo 6) — same logic as GameLoop
  if (!showLocal) return null
  return (
    <>
      {npcs.map((npc, i) => (
        <LocalNpcMesh key={i} npc={npc} isMerchant={i % 6 === 3} />
      ))}
    </>
  )
}
