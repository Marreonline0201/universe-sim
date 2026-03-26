// ── RemotePlayerNameTags ────────────────────────────────────────────────────────
// M29 Track C: HTML overlay name tags above each remote player.
// Positioned via Three.js camera projection (world → screen).
// - Green dot = online, yellow dot = AFK (no movement > 60s)
// - Opacity fade: 1.0 at <30m, lerp to 0 at 50m, hidden beyond 50m
// - C5: Ping dot next to name (green/yellow/red/grey)

import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { usePlayerStore } from '../store/playerStore'
import { usePartyStore } from '../store/partyStore'
import { useAuth } from '@clerk/react'

const AFK_THRESHOLD_MS = 60_000
const FADE_START_M     = 30
const FADE_END_M       = 50

function pingColor(pingMs: number | undefined): string {
  if (pingMs === undefined) return '#666'
  if (pingMs < 100) return '#2ecc71'
  if (pingMs < 250) return '#f39c12'
  return '#e74c3c'
}

interface NameTagData {
  userId: string
  username: string
  screenX: number
  screenY: number
  opacity: number
  isAFK: boolean
  pingMs: number | undefined
  title?: string           // M37: equipped title name
  titleColor?: string      // M37: title color
  isPartyMember?: boolean  // M39: in same party
}

// ── Inner component — runs inside R3F Canvas context ──────────────────────────
function NameTagsOverlayInner({
  onUpdate,
}: {
  onUpdate: (tags: NameTagData[]) => void
}) {
  const { camera, size } = useThree()
  const remotePlayers = useMultiplayerStore(s => s.remotePlayers)
  const playerPings   = useMultiplayerStore(s => s.playerPings)
  const localX = usePlayerStore(s => s.x)
  const localY = usePlayerStore(s => s.y)
  const localZ = usePlayerStore(s => s.z)
  const { userId: myUserId } = useAuth()

  const tmpVec = useRef(new THREE.Vector3())
  const now = Date.now()
  const partyMembers = usePartyStore(s => s.party?.members)
  const partyMemberIds = useMemo(() => partyMembers?.map(m => m.userId) ?? [], [partyMembers])

  useFrame(() => {
    const tags: NameTagData[] = []
    const players = Array.from(remotePlayers.values())

    for (const p of players) {
      if (p.userId === myUserId) continue

      // World position slightly above head
      tmpVec.current.set(p.x, p.y + 0.6 + 1.95, p.z)

      // Distance from local player
      const dx = p.x - localX, dy = (p.y + 1) - localY, dz = p.z - localZ
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > FADE_END_M) continue

      // Opacity: 1 at ≤30m, fade to 0 at 50m
      const opacity = dist <= FADE_START_M
        ? 1
        : 1 - (dist - FADE_START_M) / (FADE_END_M - FADE_START_M)
      if (opacity <= 0) continue

      // Project to screen space
      tmpVec.current.project(camera)
      const screenX = ( tmpVec.current.x + 1) / 2 * size.width
      const screenY = (-tmpVec.current.y + 1) / 2 * size.height

      // Behind camera check
      if (tmpVec.current.z > 1) continue

      const isAFK = (Date.now() - (p.lastMovedAt ?? Date.now())) > AFK_THRESHOLD_MS
      tags.push({
        userId: p.userId,
        username: p.username,
        screenX,
        screenY,
        opacity,
        isAFK,
        pingMs: playerPings.get(p.userId),
        title: p.title,
        titleColor: p.titleColor,
        isPartyMember: partyMemberIds.includes(p.userId),
      })
    }

    onUpdate(tags)
  })

  return null
}

// ── Portal overlay — rendered outside Canvas ──────────────────────────────────
// This component must be mounted INSIDE the R3F Canvas.
// It uses a portal-style callback to push data to the DOM overlay.
export function RemotePlayerNameTagsCanvas({
  onUpdate,
}: {
  onUpdate: (tags: NameTagData[]) => void
}) {
  return <NameTagsOverlayInner onUpdate={onUpdate} />
}

// ── DOM overlay — mounted in HUD (outside Canvas) ────────────────────────────
export function RemotePlayerNameTagsOverlay() {
  const [tags, setTags] = useState<NameTagData[]>([])

  // Listen to custom event from the canvas-side component
  useEffect(() => {
    function onTagsUpdate(e: CustomEvent<NameTagData[]>) {
      setTags(e.detail)
    }
    window.addEventListener('__nametagsUpdate', onTagsUpdate as EventListener)
    return () => window.removeEventListener('__nametagsUpdate', onTagsUpdate as EventListener)
  }, [])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 100,
    }}>
      {tags.map(tag => (
        <div
          key={tag.userId}
          style={{
            position: 'absolute',
            left: tag.screenX,
            top:  tag.screenY,
            transform: 'translate(-50%, -100%)',
            opacity: tag.opacity,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {/* Ping dot (C5) */}
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: pingColor(tag.pingMs),
            flexShrink: 0,
            boxShadow: `0 0 4px ${pingColor(tag.pingMs)}99`,
          }} />
          {/* Title + Name column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            {/* M37: Equipped title */}
            {tag.title && (
              <span style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: tag.titleColor ?? '#aaaaaa',
                textShadow: '0 0 3px #000, 1px 1px 2px #000',
                whiteSpace: 'nowrap',
                letterSpacing: 0.5,
                lineHeight: 1,
              }}>
                [{tag.title}]
              </span>
            )}
            {/* Name */}
            <span style={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#ffffff',
              textShadow: '0 0 3px #000, 1px 1px 2px #000, -1px -1px 2px #000',
              whiteSpace: 'nowrap',
              letterSpacing: 0.3,
            }}>
              {tag.username}
            </span>
          </div>
          {/* M39: Party member ring */}
          {tag.isPartyMember && (
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              border: '2px solid #6abf6a',
              background: 'transparent',
              boxShadow: '0 0 5px rgba(106,191,106,0.7)',
              flexShrink: 0,
            }} />
          )}
          {/* Online/AFK status dot */}
          <div style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: tag.isAFK ? '#f39c12' : '#2ecc71',
            flexShrink: 0,
          }} />
        </div>
      ))}
    </div>
  )
}

// ── Canvas bridge — dispatches a custom window event so the DOM overlay can update ──
export function RemotePlayerNameTagsBridge() {
  function handleUpdate(tags: NameTagData[]) {
    window.dispatchEvent(new CustomEvent('__nametagsUpdate', { detail: tags }))
  }
  return <NameTagsOverlayInner onUpdate={handleUpdate} />
}
