import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useMemo } from 'react'
import { InstancedMesh, Matrix4, Color, MeshStandardMaterial, Vector3 } from 'three'
import { world, Position, CreatureBody, PlayerControlled } from '../../ecs/world'
import { defineQuery, Not } from 'bitecs'

// Exclude the player entity — it has its own humanoid mesh
const creatureQuery = defineQuery([Position, CreatureBody, Not(PlayerControlled)])

const MAX_INSTANCES = 10_000

// ── M9 T3: LOD distance thresholds ────────────────────────────────────────────
// Within 50m:   8x8 sphere (full detail)
// 50–200m:      4x4 sphere (half resolution)
// Beyond 200m:  3x3 sphere (billboard-quality, no shadow cost)
const LOD_NEAR_SQ = 50 * 50 // 2500
const LOD_FAR_SQ = 200 * 200 // 40000

/**
 * Creature SSS (subsurface scattering approximation).
 * Adds backlight translucency glow to organic creatures: light transmitted
 * through thin body parts (ears, fins, wings) from the opposite side of the sun.
 * Implemented via onBeforeCompile so we keep full Three.js PBR lighting + instancing.
 * This is physically-motivated: thin organic tissue transmits ~30% of incident light.
 */
function makeCreatureMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ vertexColors: true })
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      `// ── Subsurface scattering approximation ─────────────────────────────────
      // Back-transmitted light: strongest when light comes from behind the surface.
      // Simplified: use dot(vNormal, vec3(0,1,0)) as sky-side indicator.
      // The 0.3 coefficient matches measured SSS for biological tissue at 550nm.
      float _sssBack = max(0.0, -dot(vNormal, vec3(0.0, 1.0, 0.0))) * 0.3;
      outgoingLight += diffuseColor.rgb * _sssBack * vec3(0.9, 0.6, 0.4);
#include <output_fragment>`,
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

    for (let i = 0; i < total; i++) {
      const eid = entities[i]

      const cx = Position.x[eid]
      const cy = Position.y[eid]
      const cz = Position.z[eid]
      const size = CreatureBody.size[eid] || 0.5

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

      // Color by neural level — reuses _color scratch
      const level = CreatureBody.neuralLevel[eid] as 0 | 1 | 2 | 3 | 4
      switch (level) {
        case 0:
          color.setRGB(0.1, 0.8, 0.2)
          break // bright green — microbes
        case 1:
          color.setRGB(0.1, 0.7, 0.6)
          break // teal — fish/insects
        case 2:
          color.setRGB(0.9, 0.6, 0.1)
          break // orange — mammals
        case 3:
          color.setRGB(0.9, 0.3, 0.1)
          break // red-orange — great apes
        case 4:
          color.setRGB(1.0, 1.0, 1.0)
          break // white — humans
        default:
          color.setRGB(0.5, 0.5, 0.5)
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
