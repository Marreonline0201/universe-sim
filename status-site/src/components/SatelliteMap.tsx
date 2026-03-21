import React, { useRef, useEffect, useCallback } from 'react'
import type { StatusPlayer, StatusNpc } from '../hooks/useStatusSocket'

// ── Terrain generation (seeded value noise + fbm) ─────────────────────────────

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return n - Math.floor(n)
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = smoothstep(fx), uy = smoothstep(fy)
  return lerp(
    lerp(hash2(ix, iy), hash2(ix + 1, iy), ux),
    lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux),
    uy,
  )
}

function fbm(x: number, y: number, octaves = 5): number {
  let v = 0, amp = 0.5, freq = 1
  for (let i = 0; i < octaves; i++) {
    v += valueNoise(x * freq, y * freq) * amp
    amp *= 0.5; freq *= 2.1
  }
  return v
}

function heightToColor(h: number): [number, number, number] {
  // Deep ocean
  if (h < 0.32) return [5 + h * 20, 12 + h * 30, 30 + h * 60]
  // Shallow water
  if (h < 0.44) {
    const t = (h - 0.32) / 0.12
    return [8 + t * 10, 22 + t * 18, 52 + t * 28]
  }
  // Shoreline / sand
  if (h < 0.48) {
    const t = (h - 0.44) / 0.04
    return [26 + t * 10, 22 + t * 8, 15 + t * 5]
  }
  // Lowland grassland
  if (h < 0.60) {
    const t = (h - 0.48) / 0.12
    return [10 + t * 8, 28 + t * 12, 12 + t * 5]
  }
  // Forest / highland
  if (h < 0.72) {
    const t = (h - 0.60) / 0.12
    return [9 + t * 5, 23 + t * 8, 10 + t * 4]
  }
  // Rocky ridge
  if (h < 0.86) {
    const t = (h - 0.72) / 0.14
    return [22 + t * 20, 22 + t * 20, 20 + t * 20]
  }
  // Snow / ice cap
  const t = (h - 0.86) / 0.14
  return [38 + t * 30, 42 + t * 30, 48 + t * 32]
}

function buildTerrainTexture(w: number, h: number, scale = 0.012): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const nx = px * scale
      const ny = py * scale
      const elevation = fbm(nx, ny, 6)
      const [r, g, b] = heightToColor(elevation)
      const i = (py * w + px) * 4
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
    }
  }
  return new ImageData(data, w, h)
}

// ── NPC state colours ─────────────────────────────────────────────────────────

const NPC_COLORS: Record<string, string> = {
  wander:    'rgba(60,130,80,0.75)',
  gather:    'rgba(200,130,40,0.8)',
  eat:       'rgba(60,200,80,0.9)',
  rest:      'rgba(60,90,190,0.75)',
  socialize: 'rgba(180,60,200,0.8)',
}

// ── World constants matching the server ──────────────────────────────────────

const WORLD_RADIUS = 220  // match NPC wander radius + player range

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  players: StatusPlayer[]
  npcs:    StatusNpc[]
  onPlayerClick: (userId: string) => void
}

export function SatelliteMap({ players, npcs, onPlayerClick }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const terrainRef     = useRef<ImageData | null>(null)
  const frameRef       = useRef(0)
  const animRef        = useRef<number>(0)
  const playersRef     = useRef(players)
  const npcsRef        = useRef(npcs)
  const onClickRef     = useRef(onPlayerClick)

  playersRef.current  = players
  npcsRef.current     = npcs
  onClickRef.current  = onPlayerClick

  // Build terrain once on first render
  const initTerrain = useCallback((canvas: HTMLCanvasElement) => {
    if (terrainRef.current) return
    terrainRef.current = buildTerrainTexture(canvas.width, canvas.height)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    initTerrain(canvas)

    const W = canvas.width
    const H = canvas.height
    const CX = W / 2
    const CY = H / 2
    const SCALE = (W / 2) / WORLD_RADIUS

    function worldToCanvas(wx: number, wz: number): [number, number] {
      return [CX + wx * SCALE, CY + wz * SCALE]
    }

    function draw() {
      animRef.current = requestAnimationFrame(draw)
      frameRef.current++
      const t = frameRef.current

      // ── Terrain base ──────────────────────────────────────────────────────
      if (terrainRef.current) {
        ctx.putImageData(terrainRef.current, 0, 0)
      } else {
        ctx.fillStyle = '#060c18'
        ctx.fillRect(0, 0, W, H)
      }

      // ── Dark vignette ─────────────────────────────────────────────────────
      const vignette = ctx.createRadialGradient(CX, CY, W * 0.28, CX, CY, W * 0.7)
      vignette.addColorStop(0, 'rgba(0,0,0,0)')
      vignette.addColorStop(1, 'rgba(0,0,0,0.72)')
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, W, H)

      // ── Coordinate grid ───────────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(0,200,255,0.06)'
      ctx.lineWidth = 1
      const gridWorldStep = 50
      const gridPxStep    = gridWorldStep * SCALE
      const startX = CX % gridPxStep
      for (let x = startX; x < W; x += gridPxStep) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
      const startY = CY % gridPxStep
      for (let y = startY; y < H; y += gridPxStep) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      }

      // ── Grid coordinate labels ────────────────────────────────────────────
      ctx.font = '8px "IBM Plex Mono"'
      ctx.fillStyle = 'rgba(0,200,255,0.22)'
      ctx.textAlign = 'left'
      for (let wx = -WORLD_RADIUS; wx <= WORLD_RADIUS; wx += gridWorldStep) {
        if (wx === 0) continue
        const [px] = worldToCanvas(wx, 0)
        if (px > 12 && px < W - 12)
          ctx.fillText(`${wx}`, px + 2, CY - 3)
      }
      for (let wz = -WORLD_RADIUS; wz <= WORLD_RADIUS; wz += gridWorldStep) {
        if (wz === 0) continue
        const [, py] = worldToCanvas(0, wz)
        if (py > 12 && py < H - 12)
          ctx.fillText(`${wz}`, CX + 3, py - 3)
      }

      // ── NPC dots ──────────────────────────────────────────────────────────
      for (const npc of npcsRef.current) {
        const [cx, cy] = worldToCanvas(npc.x, npc.z)
        if (cx < -4 || cx > W + 4 || cy < -4 || cy > H + 4) continue
        ctx.beginPath()
        ctx.arc(cx, cy, 2.2, 0, Math.PI * 2)
        ctx.fillStyle = NPC_COLORS[npc.state] ?? 'rgba(120,120,120,0.5)'
        ctx.fill()
      }

      // ── Player dots ───────────────────────────────────────────────────────
      for (const player of playersRef.current) {
        const [cx, cy] = worldToCanvas(player.x, player.z)

        // Pulse ring (outer)
        const pulsePhase = (t * 0.04 + player.userId.charCodeAt(0) * 0.3) % (Math.PI * 2)
        const pulseR  = 10 + Math.sin(pulsePhase) * 5
        const pulseA  = 0.3 + Math.sin(pulsePhase) * 0.2
        ctx.beginPath()
        ctx.arc(cx, cy, pulseR, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(0,220,120,${pulseA})`
        ctx.lineWidth = 1
        ctx.stroke()

        // Second tighter ring
        ctx.beginPath()
        ctx.arc(cx, cy, 8, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(0,255,140,0.4)'
        ctx.lineWidth = 1
        ctx.stroke()

        // Core dot
        ctx.beginPath()
        ctx.arc(cx, cy, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#00ff88'
        ctx.fill()

        // Health indicator arc
        const hAngle = player.health * Math.PI * 2
        ctx.beginPath()
        ctx.arc(cx, cy, 7.5, -Math.PI / 2, -Math.PI / 2 + hAngle)
        const hue = player.health > 0.5 ? 140 : player.health > 0.25 ? 45 : 0
        ctx.strokeStyle = `hsl(${hue},90%,55%)`
        ctx.lineWidth = 2
        ctx.stroke()

        // Username label
        ctx.font = '600 9px "IBM Plex Mono"'
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(0,255,140,0.9)'
        ctx.fillText(player.username, cx, cy - 13)

        // Drop shadow on label
        ctx.font = '600 9px "IBM Plex Mono"'
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillText(player.username, cx + 0.5, cy - 12.5)
        ctx.fillStyle = 'rgba(0,255,140,0.9)'
        ctx.fillText(player.username, cx, cy - 13)
      }

      // ── Origin crosshair ──────────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(0,200,255,0.3)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(CX - 12, CY); ctx.lineTo(CX + 12, CY); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(CX, CY - 12); ctx.lineTo(CX, CY + 12); ctx.stroke()
      ctx.setLineDash([])

      // ── Compass ───────────────────────────────────────────────────────────
      const cpad = 18
      ctx.font = 'bold 10px "IBM Plex Mono"'
      ctx.fillStyle = 'rgba(0,200,255,0.7)'
      ctx.textAlign = 'center'
      ctx.fillText('N', CX, cpad)
      ctx.fillText('S', CX, H - cpad + 10)
      ctx.textAlign = 'left'
      ctx.fillText('W', cpad - 6, CY + 4)
      ctx.textAlign = 'right'
      ctx.fillText('E', W - cpad + 6, CY + 4)

      // ── Corner bracket decorations ────────────────────────────────────────
      const bLen = 20, bPad = 6
      ctx.strokeStyle = 'rgba(0,200,255,0.4)'
      ctx.lineWidth = 1.5
      const corners: [number, number, number, number][] = [
        [bPad, bPad, 1, 1],
        [W - bPad, bPad, -1, 1],
        [bPad, H - bPad, 1, -1],
        [W - bPad, H - bPad, -1, -1],
      ]
      for (const [x, y, dx, dy] of corners) {
        ctx.beginPath(); ctx.moveTo(x + dx * bLen, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * bLen); ctx.stroke()
      }

      // ── "LIVE" scan dot (top right) ───────────────────────────────────────
      const blink = Math.sin(t * 0.06) > 0
      if (blink) {
        ctx.beginPath()
        ctx.arc(W - 28, 18, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#ff3a3a'
        ctx.fill()
      }
      ctx.font = '700 8px "IBM Plex Mono"'
      ctx.fillStyle = 'rgba(255,80,80,0.8)'
      ctx.textAlign = 'right'
      ctx.fillText('● LIVE', W - 10, 21)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [initTerrain])

  // ── Click handler: find nearest player ────────────────────────────────────
  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top)  * scaleY
    const CX = canvas.width  / 2
    const CY = canvas.height / 2
    const SCALE = (canvas.width / 2) / WORLD_RADIUS

    let closest: StatusPlayer | null = null
    let bestDist = 20 // px threshold

    for (const p of playersRef.current) {
      const cx = CX + p.x * SCALE
      const cy = CY + p.z * SCALE
      const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
      if (dist < bestDist) { bestDist = dist; closest = p }
    }

    if (closest) onClickRef.current(closest.userId)
  }

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Scan-line overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
        background: `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 3px,
          rgba(0,0,0,0.07) 3px,
          rgba(0,0,0,0.07) 4px
        )`,
      }} />

      {/* Cyan tint overlay (very subtle atmosphere) */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 50%, rgba(0,80,120,0.08) 0%, transparent 70%)',
      }} />

      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        onClick={handleClick}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: 'crosshair',
          imageRendering: 'crisp-edges',
        }}
      />

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        zIndex: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        pointerEvents: 'none',
      }}>
        {[
          { color: '#00ff88', label: 'player' },
          { color: NPC_COLORS.wander,    label: 'wander' },
          { color: NPC_COLORS.gather,    label: 'gather' },
          { color: NPC_COLORS.eat,       label: 'eat' },
          { color: NPC_COLORS.rest,      label: 'rest' },
          { color: NPC_COLORS.socialize, label: 'socialize' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 8, color: 'rgba(150,190,220,0.55)', fontFamily: '"IBM Plex Mono", monospace', letterSpacing: 1 }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Map label */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 12,
        zIndex: 3,
        pointerEvents: 'none',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 9,
        color: 'rgba(0,200,255,0.5)',
        letterSpacing: 2,
        textTransform: 'uppercase',
      }}>
        SURFACE SCAN // ±{WORLD_RADIUS}m
      </div>
    </div>
  )
}
