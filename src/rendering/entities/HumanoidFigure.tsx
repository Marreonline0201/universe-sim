/**
 * HumanoidFigure.tsx
 * Shared humanoid body mesh used by PlayerMesh, ServerNpcsRenderer, and LocalNpcsRenderer.
 * Extracted from SceneRoot.tsx during M18 Track A decomposition.
 *
 * Box-based humanoid: torso, hips, head, eyes, neck, arms (upper + forearm), legs (thigh + shin + boot).
 * All meshes cast shadows. Limb angles are props for walk-cycle animation driven by parent.
 */

// ── NPC appearance palettes ─────────────────────────────────────────────────
export const NPC_SKIN_TONES = ['#c8926e', '#d4a574', '#8b5e3c', '#f0d4b0', '#a0724a']
export const NPC_SHIRT_COLS = ['#8b4513', '#556b2f', '#8b0000', '#4682b4', '#a0522d']
export const NPC_PANTS_COLS = ['#3b2f2f', '#2f4f2f', '#1a1a3a', '#4a3a20', '#2a2a2a']

export function HumanoidFigure({
  skinColor, shirtColor, pantsColor,
  leftLegAngle = 0, rightLegAngle = 0,
  leftArmAngle = 0, rightArmAngle = 0,
}: {
  skinColor: string; shirtColor: string; pantsColor: string
  leftLegAngle?: number; rightLegAngle?: number
  leftArmAngle?: number; rightArmAngle?: number
}) {
  return (
    <>
      {/* Torso */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.44, 0.58, 0.22]} />
        <meshStandardMaterial color={shirtColor} />
      </mesh>
      {/* Hips */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.42, 0.22, 0.22]} />
        <meshStandardMaterial color={pantsColor} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.34, 0.34, 0.32]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      {/* Eyes */}
      <mesh position={[0.1, 1.03, -0.17]} castShadow>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[-0.1, 1.03, -0.17]} castShadow>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Neck */}
      <mesh position={[0, 0.86, 0]} castShadow>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      {/* Left arm (rotates from shoulder at y=0.75) */}
      <group position={[-0.30, 0.75, 0]} rotation={[leftArmAngle, 0, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>
      {/* Right arm */}
      <group position={[0.30, 0.75, 0]} rotation={[rightArmAngle, 0, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>
      {/* Left leg (rotates from hip at y=0.09) */}
      <group position={[-0.13, 0.09, 0]} rotation={[leftLegAngle, 0, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
      {/* Right leg */}
      <group position={[0.13, 0.09, 0]} rotation={[rightLegAngle, 0, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
    </>
  )
}
