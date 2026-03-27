import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useMemo } from 'react'
import { InstancedMesh, Matrix4, Color, MeshStandardMaterial, Vector3 } from 'three'
import { world, Position, CreatureBody, PlayerControlled, DietaryType } from '../../ecs/world'
import { defineQuery, Not } from 'bitecs'
// M74: Speciation visual pulse — flash newly speciated organisms
import { getActiveSpeciationEvents, getSpeciationProgress, getActiveBirthEvents, getBirthProgress } from '../../biology/SimulationIntegration'
import { huntingTargets } from '../../ecs/systems/CreatureWanderSystem'

// Exclude the player entity — it has its own humanoid mesh
const creatureQuery = defineQuery([Position, CreatureBody, Not(PlayerControlled)])

const MAX_INSTANCES = 10_000

// ── Visual size multiplier — organisms are abstract sim entities, not realistic animals.
// Boost their rendered radius so they are visible from spectator altitude (hundreds of meters+).
// Autotrophs: 40-80m display radius. Heterotrophs: 30-60m display radius.
const VISUAL_SIZE_MULTIPLIER = 5.0  // 8-20m genome size → 40-100m display radius

// ── LOD distance thresholds — expanded for spectator view on 4000m planet ─
// Within 2000m:   8x8 sphere (full detail)
// 2000–8000m:     4x4 sphere (half resolution)
// Beyond 8000m:   3x3 sphere (billboard-quality, no shadow cost)
const LOD_NEAR_SQ = 2000 * 2000
const LOD_FAR_SQ = 8000 * 8000

/**
 * Make emissive glowing material for organisms.
 * Uses vertexColors for species-based hue, with strong emissive so organisms
 * glow and are visible even from high spectator altitude.
 * emissiveIntensity: 0.8 — visible in daylight without washing out.
 */
function makeCreatureMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    vertexColors: true,
    emissive: new Color(1, 1, 1),      // emissive tinted by vertex color via onBeforeCompile
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.1,
  })
  // Drive emissive color from the instance vertex color so each species glows its own hue.
  // Three.js instanced vertex colors are stored in vColor (injected by vertexColors: true).
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      'vec4 diffuseColor = vec4( diffuse, opacity );\n  totalEmissiveRadiance = vColor.rgb * emissiveIntensity;',
    )
  }
  return mat
}

export function CreatureRenderer() {
  // ── M9 T3: Three LOD mesh refs — declared individually (Rules of Hooks) ────
  const meshRef0 = useRef<InstancedMesh>(null)
  const meshRef1 = useRef<InstancedMesh>(null)
  const meshRef2 = useRef<InstancedMesh>(null)

  // ── M9 T3: Persistent scratch objects — ZERO per-frame allocation ──────────
  // Allocating new Matrix4/Color/Vector3 inside useFrame is the #1 cause of GC
  // pressure in R3F scenes. All scratch objects are allocated once here.
  const _matrix = useRef(new Matrix4())
  const _color = useRef(new Color())
  const _camPos = useRef(new Vector3())
  const _cPos = useRef(new Vector3())

  // Shared SSS material across all LOD levels — compiled once, applied to all meshes
  const creatureMat = useMemo(() => makeCreatureMaterial(), [])

  const { camera } = useThree()

  // Per-frame LOD bucket counts
  const lodCounts = useRef([0, 0, 0])

  useFrame(() => {
    const mesh0 = meshRef0.current
    const mesh1 = meshRef1.current
    const mesh2 = meshRef2.current
    if (!mesh0 || !mesh1 || !mesh2) return

    const entities = creatureQuery(world)
    const total = Math.min(entities.length, MAX_INSTANCES)

    lodCounts.current[0] = 0
    lodCounts.current[1] = 0
    lodCounts.current[2] = 0

    // Read camera position once into scratch vec3 — no new Vector3 each frame
    _camPos.current.copy(camera.position)

    const matrix = _matrix.current
    const color = _color.current
    const cam = _camPos.current
    const cpos = _cPos.current

    // M74: Build a lookup of speciated eids -> progress for pulse VFX
    // This is O(active events) which is capped at 20 — negligible cost
    const speciationMap = new Map<number, number>()
    const activeEvents = getActiveSpeciationEvents()
    for (let e = 0; e < activeEvents.length; e++) {
      speciationMap.set(activeEvents[e].eid, getSpeciationProgress(activeEvents[e]))
    }

    // M76: Build birth event lookup for green pulse VFX
    const birthMap = new Map<number, number>()
    const activeBirths = getActiveBirthEvents()
    for (let b = 0; b < activeBirths.length; b++) {
      birthMap.set(activeBirths[b].eid, getBirthProgress(activeBirths[b]))
    }

    for (let i = 0; i < total; i++) {
      const eid = entities[i]

      const cx = Position.x[eid]
      const cy = Position.y[eid]
      const cz = Position.z[eid]
      // M_vis: Apply VISUAL_SIZE_MULTIPLIER to make organisms visible from spectator altitude.
      // Diet type 0 = autotroph (larger, sessile) → slightly bigger display.
      // Diet type 1 = heterotroph (mobile predator) → slightly smaller display.
      const dietType = DietaryType.type[eid] ?? 0
      const dietMult = dietType === 0 ? 1.2 : 0.9  // autotrophs 20% larger, heterotrophs 10% smaller
      let size = (CreatureBody.size[eid] || 8) * VISUAL_SIZE_MULTIPLIER * dietMult

      // M74: Speciation pulse — scale boost with smooth ease-out
      const speciationProgress = speciationMap.get(eid)
      const isSpeciating = speciationProgress !== undefined
      if (isSpeciating) {
        // Ease-out pulse: starts at 1.5x, decays back to 1.0x over 2 seconds
        const pulse = 1.0 + 0.5 * (1.0 - speciationProgress!) * (1.0 - speciationProgress!)
        size *= pulse
      }

      // M76: Birth pulse — gentle green glow, smaller scale boost
      const birthProgress = birthMap.get(eid)
      const isBorn = birthProgress !== undefined
      if (isBorn && !isSpeciating) {
        // Ease-out pulse: starts at 1.3x, decays back to 1.0x over 1.5 seconds
        const birthPulse = 1.0 + 0.3 * (1.0 - birthProgress!) * (1.0 - birthProgress!)
        size *= birthPulse
      }

      // Distance-based LOD selection — squared distance, no sqrt
      cpos.set(cx, cy, cz)
      const distSq = cam.distanceToSquared(cpos)
      const lodIdx: 0 | 1 | 2 = distSq < LOD_NEAR_SQ ? 0 : distSq < LOD_FAR_SQ ? 1 : 2

      const instIdx = lodCounts.current[lodIdx]
      if (instIdx >= MAX_INSTANCES) continue
      lodCounts.current[lodIdx]++

      // Matrix: translate + uniform scale — in-place, zero allocation
      matrix.makeTranslation(cx, cy, cz)
      matrix.scale({ x: size, y: size, z: size } as any)

      const targetMesh = lodIdx === 0 ? mesh0 : lodIdx === 1 ? mesh1 : mesh2
      targetMesh.setMatrixAt(instIdx, matrix)

      // M73: Color by speciesId using golden-angle hue for maximum visual distinction
      // M74: Speciation pulse overrides color to bright white-gold flash
      if (isSpeciating) {
        // Lerp from bright white-gold (1.0, 0.95, 0.6) to normal species color
        const t = speciationProgress!
        const speciesId = CreatureBody.speciesId[eid] || 0
        const hue = (speciesId * 137.5) % 360
        // Normal color
        color.setHSL(hue / 360, 0.7, 0.55)
        const nr = color.r, ng = color.g, nb = color.b
        // Flash color: bright white-gold
        color.setRGB(
          nr + (1.0 - nr) * (1.0 - t),
          ng + (0.95 - ng) * (1.0 - t),
          nb + (0.6 - nb) * (1.0 - t),
        )
      } else if (isBorn) {
        // M76: Birth flash — lerp from bright green to normal species color
        const t = birthProgress!
        const speciesId = CreatureBody.speciesId[eid] || 0
        const hue = (speciesId * 137.5) % 360
        color.setHSL(hue / 360, 0.7, 0.55)
        const nr = color.r, ng = color.g, nb = color.b
        // Flash color: bright green (0.3, 1.0, 0.4)
        color.setRGB(
          nr + (0.3 - nr) * (1.0 - t),
          ng + (1.0 - ng) * (1.0 - t),
          nb + (0.4 - nb) * (1.0 - t),
        )
      } else {
        const speciesId = CreatureBody.speciesId[eid] || 0
        const hue = (speciesId * 137.5) % 360
        color.setHSL(hue / 360, 0.7, 0.55)
        // M77: Tint hunting heterotrophs with a red shift
        if (huntingTargets.has(eid)) {
          color.r = Math.min(1.0, color.r + 0.25)
          color.g *= 0.7
          color.b *= 0.7
        }
      }
      targetMesh.setColorAt(instIdx, color)
    }

    // Commit all three LOD levels
    mesh0.count = lodCounts.current[0]
    mesh0.instanceMatrix.needsUpdate = true
    if (mesh0.instanceColor) mesh0.instanceColor.needsUpdate = true

    mesh1.count = lodCounts.current[1]
    mesh1.instanceMatrix.needsUpdate = true
    if (mesh1.instanceColor) mesh1.instanceColor.needsUpdate = true

    mesh2.count = lodCounts.current[2]
    mesh2.instanceMatrix.needsUpdate = true
    if (mesh2.instanceColor) mesh2.instanceColor.needsUpdate = true
  })

  return (
    <>
      {/* LOD0: full-res near creatures (within 50m) */}
      <instancedMesh ref={meshRef0} args={[undefined, undefined, MAX_INSTANCES]} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 8, 8]} />
        <primitive object={creatureMat} attach="material" />
      </instancedMesh>
      {/* LOD1: mid-res mid-distance creatures (50–200m) */}
      <instancedMesh ref={meshRef1} args={[undefined, undefined, MAX_INSTANCES]} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 4, 4]} />
        <primitive object={creatureMat} attach="material" />
      </instancedMesh>
      {/* LOD2: low-res distant creatures (200m+) — no shadow cost */}
      <instancedMesh
        ref={meshRef2}
        args={[undefined, undefined, MAX_INSTANCES]}
        castShadow={false}
        receiveShadow={false}
      >
        <sphereGeometry args={[0.5, 3, 3]} />
        <primitive object={creatureMat} attach="material" />
      </instancedMesh>
    </>
  )
}
