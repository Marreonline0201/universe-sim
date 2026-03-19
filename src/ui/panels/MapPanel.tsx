// ── MapPanel ───────────────────────────────────────────────────────────────────
// 2D overhead canvas map. Player at centre. Remote players as dots.

import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { useMultiplayerStore } from '../../store/multiplayerStore'

const MAP_SIZE = 440   // canvas px
const WORLD_RANGE = 300  // world units visible (half-width)
const FOG_RADIUS = 80    // world units around player that are revealed

function worldToCanvas(wx: number, wz: number, playerX: number, playerZ: number): [number, number] {
  const cx = MAP_SIZE / 2 + (wx - playerX) * (MAP_SIZE / 2 / WORLD_RANGE)
  const cy = MAP_SIZE / 2 + (wz - playerZ) * (MAP_SIZE / 2 / WORLD_RANGE)
  return [cx, cy]
}

export function MapPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { x: px, z: pz } = usePlayerStore()
  const remotePlayers = useMultiplayerStore(s => s.remotePlayers)
  const remoteNpcs    = useMultiplayerStore(s => s.remoteNpcs)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ── Background ──────────────────────────────────────────────────────────
    ctx.fillStyle = '#0a0a14'
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE)

    // ── Grid lines ──────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    const gridStep = MAP_SIZE / 8
    for (let i = 0; i <= MAP_SIZE; i += gridStep) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, MAP_SIZE); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(MAP_SIZE, i); ctx.stroke()
    }

    // ── Fog of war (radial reveal around player) ────────────────────────────
    const fogGrad = ctx.createRadialGradient(
      MAP_SIZE / 2, MAP_SIZE / 2, 0,
      MAP_SIZE / 2, MAP_SIZE / 2, FOG_RADIUS * (MAP_SIZE / 2 / WORLD_RANGE),
    )
    fogGrad.addColorStop(0, 'rgba(0,0,0,0)')
    fogGrad.addColorStop(0.7, 'rgba(0,0,0,0)')
    fogGrad.addColorStop(1, 'rgba(0,0,0,0.85)')
    ctx.fillStyle = fogGrad
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE)

    // ── NPC dots ─────────────────────────────────────────────────────────────
    for (const npc of remoteNpcs) {
      const [cx, cy] = worldToCanvas(npc.x, npc.z, px, pz)
      ctx.beginPath()
      ctx.arc(cx, cy, 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(150,150,150,0.5)'
      ctx.fill()
    }

    // ── Remote players ────────────────────────────────────────────────────────
    for (const rp of remotePlayers.values()) {
      const [cx, cy] = worldToCanvas(rp.x, rp.z, px, pz)
      ctx.beginPath()
      ctx.arc(cx, cy, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#3498db'
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = '9px monospace'
      ctx.fillText(rp.username, cx + 7, cy + 3)
    }

    // ── Player dot (always at centre) ─────────────────────────────────────────
    ctx.beginPath()
    ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#2ecc71'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, 6, 0, Math.PI * 2)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // ── Compass ──────────────────────────────────────────────────────────────
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('N', MAP_SIZE / 2, 16)
    ctx.fillText('S', MAP_SIZE / 2, MAP_SIZE - 6)
    ctx.textAlign = 'left'
    ctx.fillText('W', 6, MAP_SIZE / 2 + 4)
    ctx.textAlign = 'right'
    ctx.fillText('E', MAP_SIZE - 6, MAP_SIZE / 2 + 4)

    // ── Legend ────────────────────────────────────────────────────────────────
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    ctx.fillStyle = '#2ecc71'
    ctx.fillRect(8, MAP_SIZE - 36, 8, 8)
    ctx.fillStyle = '#aaa'
    ctx.fillText('You', 20, MAP_SIZE - 29)
    ctx.fillStyle = '#3498db'
    ctx.fillRect(8, MAP_SIZE - 22, 8, 8)
    ctx.fillStyle = '#aaa'
    ctx.fillText('Players', 20, MAP_SIZE - 15)
    ctx.fillStyle = 'rgba(150,150,150,0.5)'
    ctx.fillRect(8, MAP_SIZE - 8, 8, 6)
    ctx.fillStyle = '#666'
    ctx.fillText('NPCs', 20, MAP_SIZE - 2)
  }, [px, pz, remotePlayers, remoteNpcs])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <canvas
        ref={canvasRef}
        width={MAP_SIZE}
        height={MAP_SIZE}
        style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', maxWidth: '100%' }}
      />
      <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>
        Position: ({Math.round(px)}, {Math.round(pz)}) · Range: ±{WORLD_RANGE}m
      </div>
    </div>
  )
}
