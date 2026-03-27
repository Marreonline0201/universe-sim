/**
 * OrganismLabels.tsx — M73-2
 *
 * Floating labels above organisms in spectator mode.
 * Shows species ID and size for each creature within 80 units of the camera.
 * Uses @react-three/drei Html for screen-space labels pinned to world positions.
 *
 * Only renders when spectator mode is active (toggled with [G]).
 */

import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useRef, useState, useEffect, useSyncExternalStore } from 'react'
import { Vector3 } from 'three'
import { world, Position, CreatureBody } from '../../ecs/world'
import { defineQuery, Not } from 'bitecs'
import { PlayerControlled } from '../../ecs/world'
import { isSpectatorActive, subscribeSpectator } from '../SpectatorCamera'

const creatureQuery = defineQuery([Position, CreatureBody, Not(PlayerControlled)])

const MAX_LABELS = 40  // cap for performance — Html overlays are expensive
const LABEL_RANGE_SQ = 80 * 80  // 80 units

interface LabelData {
  eid: number
  x: number
  y: number
  z: number
  speciesId: number
  size: number
}

function useSpectatorMode(): boolean {
  return useSyncExternalStore(subscribeSpectator, isSpectatorActive, isSpectatorActive)
}

export function OrganismLabels() {
  const spectatorActive = useSpectatorMode()
  const [labels, setLabels] = useState<LabelData[]>([])
  const camPosRef = useRef(new Vector3())
  const cposRef = useRef(new Vector3())
  const frameCount = useRef(0)
  const { camera } = useThree()

  useFrame(() => {
    if (!spectatorActive) return

    // Update labels every 10 frames to avoid DOM thrashing
    frameCount.current++
    if (frameCount.current % 10 !== 0) return

    camPosRef.current.copy(camera.position)
    const cam = camPosRef.current
    const cpos = cposRef.current

    const entities = creatureQuery(world)
    const visible: LabelData[] = []

    for (let i = 0; i < entities.length && visible.length < MAX_LABELS; i++) {
      const eid = entities[i]
      const cx = Position.x[eid]
      const cy = Position.y[eid]
      const cz = Position.z[eid]

      cpos.set(cx, cy, cz)
      const distSq = cam.distanceToSquared(cpos)
      if (distSq > LABEL_RANGE_SQ) continue

      visible.push({
        eid,
        x: cx,
        y: cy,
        z: cz,
        speciesId: CreatureBody.speciesId[eid],
        size: CreatureBody.size[eid],
      })
    }

    setLabels(visible)
  })

  if (!spectatorActive || labels.length === 0) return null

  return (
    <group>
      {labels.map((l) => (
        <group key={l.eid} position={[l.x, l.y + l.size * 0.6, l.z]}>
          <Html
            center
            distanceFactor={40}
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <div
              style={{
                background: 'rgba(0,0,0,0.65)',
                color: '#fff',
                fontSize: '11px',
                fontFamily: 'monospace',
                padding: '2px 6px',
                borderRadius: '3px',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
                Species {l.speciesId}
              </div>
              <div style={{ opacity: 0.8 }}>
                Size: {l.size.toFixed(1)}m
              </div>
            </div>
          </Html>
        </group>
      ))}
    </group>
  )
}
