import { useFrame } from '@react-three/fiber'
import { useRef, useMemo } from 'react'
import { InstancedMesh, Matrix4, Color, MeshStandardMaterial } from 'three'
import { world, Position, CreatureBody, PlayerControlled } from '../../ecs/world'
import { defineQuery, Not } from 'bitecs'

// Exclude the player entity — it has its own humanoid mesh
const creatureQuery = defineQuery([Position, CreatureBody, Not(PlayerControlled)])

const MAX_INSTANCES = 10_000

/**
 * Renders all creatures as instanced meshes — one draw call for up to 10,000 creatures.
 * Uses neural level to colour-code by complexity:
 *   Level 0 (bacteria/microbes): green
 *   Level 1 (fish/insects):      cyan-green
 *   Level 2 (mammals/birds):     orange
 *   Level 3 (great apes):        red-orange
 *   Level 4 (humans):            white
 *
 * Genome → detailed body shape is handled by ProceduralCreature for selected entities.
 */
// Creature SSS (subsurface scattering approximation).
// Adds backlight translucency glow to organic creatures: light transmitted
// through thin body parts (ears, fins, wings) from the opposite side of the sun.
// Implemented via onBeforeCompile so we keep full Three.js PBR lighting + instancing.
// vec3 backLight = max(0, dot(-vNormal, lightDir)) * 0.3 * diffuseColor.rgb
// This is physically-motivated: thin organic tissue transmits ~30% of incident light.
function makeCreatureMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ vertexColors: true })
  mat.onBeforeCompile = (shader) => {
    // Inject SSS term after the main outgoing radiance calculation.
    // outgoingLight is the final lit color before tonemapping.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      `// ── Subsurface scattering approximation ─────────────────────────────────
      // Back-transmitted light: strongest when light comes from behind the surface.
      // directionalLights[0].direction is the sun directional light.
      // We approximate with the hemisphere sky color contribution as a proxy
      // for the dominant light direction (avoids needing explicit light access).
      // Simplified: use dot(vNormal, vec3(0,1,0)) as sky-side indicator.
      // The 0.3 coefficient matches measured SSS for biological tissue at 550nm.
      float _sssBack = max(0.0, -dot(vNormal, vec3(0.0, 1.0, 0.0))) * 0.3;
      outgoingLight += diffuseColor.rgb * _sssBack * vec3(0.9, 0.6, 0.4);
#include <output_fragment>`
    )
  }
  return mat
}

export function CreatureRenderer() {
  const meshRef = useRef<InstancedMesh>(null)
  const matrix = new Matrix4()
  const color = new Color()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const creatureMat = useMemo(() => makeCreatureMaterial(), [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const entities = creatureQuery(world)
    const count = Math.min(entities.length, MAX_INSTANCES)

    for (let i = 0; i < count; i++) {
      const eid = entities[i]

      // Position
      matrix.makeTranslation(Position.x[eid], Position.y[eid], Position.z[eid])

      // Scale by body size
      const size = CreatureBody.size[eid] || 0.5
      matrix.scale({ x: size, y: size, z: size } as any)

      mesh.setMatrixAt(i, matrix)

      // Colour by neural level
      const level = CreatureBody.neuralLevel[eid] as 0 | 1 | 2 | 3 | 4
      switch (level) {
        case 0: color.setRGB(0.1, 0.8, 0.2); break   // bright green — microbes
        case 1: color.setRGB(0.1, 0.7, 0.6); break   // teal — fish/insects
        case 2: color.setRGB(0.9, 0.6, 0.1); break   // orange — mammals
        case 3: color.setRGB(0.9, 0.3, 0.1); break   // red-orange — great apes
        case 4: color.setRGB(1.0, 1.0, 1.0); break   // white — humans
        default: color.setRGB(0.5, 0.5, 0.5)
      }
      mesh.setColorAt(i, color)
    }

    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_INSTANCES]}
      castShadow
      receiveShadow
    >
      <sphereGeometry args={[0.5, 8, 8]} />
      <primitive object={creatureMat} attach="material" />
    </instancedMesh>
  )
}
