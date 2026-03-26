// ── DungeonRenderer.tsx ───────────────────────────────────────────────────────
// M40 Track C: Dungeon Progression — visual components for mini-boss HP bar
// and spike trap floor meshes.
//
//   MiniBossHealthBar  — fixed top-centre HTML overlay showing boss name + HP
//   SpikeTrapMesh      — flat cylinder at trap position, colour-coded by state
//   DungeonRenderer    — combines both, reads from dungeonStore

import { memo, useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { MeshStandardMaterial as ThreeMaterial } from 'three'
import { useDungeonStore } from '../store/dungeonStore'
import type { TrapState } from '../game/DungeonSystem'

// ── MiniBossHealthBar ─────────────────────────────────────────────────────────

function MiniBossHealthBar() {
  const miniBossAlive = useDungeonStore(s => s.miniBossAlive)
  const miniBossHp    = useDungeonStore(s => s.miniBossHp)
  const miniBossMaxHp = useDungeonStore(s => s.miniBossMaxHp)
  const miniBossName  = useDungeonStore(s => s.miniBossName)

  if (!miniBossAlive) return null

  const pct = miniBossMaxHp > 0 ? Math.max(0, miniBossHp / miniBossMaxHp) : 0

  return (
    <Html
      style={{ pointerEvents: 'none' }}
      zIndexRange={[100, 200]}
      fullscreen
    >
      <div style={{
        position: 'fixed',
        top: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 320,
        background: 'rgba(0,0,0,0.72)',
        border: '1px solid rgba(255,60,60,0.5)',
        borderRadius: 8,
        padding: '8px 14px',
        fontFamily: 'monospace',
        color: '#fff',
        textAlign: 'center',
        zIndex: 150,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5, color: '#f88' }}>
          ⚔ {miniBossName}
        </div>
        <div style={{
          width: '100%',
          height: 10,
          background: '#333',
          borderRadius: 5,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct * 100}%`,
            height: '100%',
            background: pct > 0.5 ? '#e44' : pct > 0.25 ? '#e84' : '#f22',
            transition: 'width 0.15s ease',
            borderRadius: 5,
          }} />
        </div>
        <div style={{ fontSize: 10, marginTop: 4, color: '#ccc' }}>
          {miniBossHp} / {miniBossMaxHp}
        </div>
      </div>
    </Html>
  )
}

// ── SpikeTrapMesh ─────────────────────────────────────────────────────────────
// Wrapped in memo: re-renders only when trap data reference changes (driven by store sync).
// Color is updated per-frame via useFrame + a material ref to avoid re-mounting geometry.

const SpikeTrapMesh = memo(function SpikeTrapMesh({ trap, posY }: { trap: TrapState; posY: number }) {
  const matRef = useRef<ThreeMaterial>(null)
  // Stable position tuple — only recomputes when trap coords change
  const position = useMemo(
    () => [trap.x, posY, trap.z] as [number, number, number],
    [trap.x, posY, trap.z],
  )

  // Update material color each frame so the 500ms "recently triggered" flash
  // reflects real wall-clock time without requiring a React re-render.
  useFrame(() => {
    const mat = matRef.current
    if (!mat) return
    const now = Date.now()
    const recentlyTriggered = !trap.disarmed && (now - trap.lastTriggered) < 500
    if (trap.disarmed) {
      mat.color.set('#333')
    } else if (recentlyTriggered) {
      mat.color.set('#f44')
    } else {
      mat.color.set('#666')
    }
  })

  return (
    <mesh position={position}>
      <cylinderGeometry args={[0.4, 0.4, 0.05, 16]} />
      <meshStandardMaterial ref={matRef} color="#666" />
    </mesh>
  )
})

// ── DungeonRenderer ────────────────────────────────────────────────────────────

export function DungeonRenderer() {
  const activeTraps    = useDungeonStore(s => s.activeTraps)
  const activeDungeon  = useDungeonStore(s => s.activeDungeon)

  if (!activeDungeon && activeTraps.length === 0) return null

  return (
    <>
      <MiniBossHealthBar />
      {activeTraps.map(trap => (
        <SpikeTrapMesh key={trap.id} trap={trap} posY={0} />
      ))}
    </>
  )
}
