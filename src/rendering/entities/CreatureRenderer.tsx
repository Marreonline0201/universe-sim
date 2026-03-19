import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { InstancedMesh, Matrix4, Color } from 'three'
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
export function CreatureRenderer() {
  const meshRef = useRef<InstancedMesh>(null)
  const matrix = new Matrix4()
  const color = new Color()

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
      <meshStandardMaterial vertexColors />
    </instancedMesh>
  )
}
