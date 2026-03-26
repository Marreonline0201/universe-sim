// ── MapPanel ───────────────────────────────────────────────────────────────────
// M21 Track C: Enhanced minimap with terrain coloring, settlement markers,
// resource node dots, player direction arrow, zoom controls, weather indicator.
//
// 2D overhead canvas map. Player at centre. Remote players as dots.
// Terrain colors sampled from biomeColor at grid points.

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { usePlayerStore } from '../../store/playerStore'
import { useMultiplayerStore } from '../../store/multiplayerStore'
import { useSettlementStore } from '../../store/settlementStore'
import { useWeatherStore } from '../../store/weatherStore'
import { RESOURCE_NODES } from '../../world/ResourceNodeManager'
import { terrainHeightAt, biomeColor, PLANET_RADIUS, SEA_LEVEL } from '../../world/SpherePlanet'

const MAP_SIZE = 440   // canvas px
const FOG_RADIUS = 80    // world units around player that are revealed
const TERRAIN_GRID = 44  // grid cells for terrain sampling (44x44 = 1936 samples)
const CELL_SIZE = MAP_SIZE / TERRAIN_GRID

// Weather indicator text
const WEATHER_ICONS: Record<string, string> = {
  CLEAR: 'SUN',
  CLOUDY: 'CLD',
  RAIN: 'RAN',
  STORM: 'STM',
}

function worldToCanvas(wx: number, wz: number, playerX: number, playerZ: number, worldRange: number): [number, number] {
  const cx = MAP_SIZE / 2 + (wx - playerX) * (MAP_SIZE / 2 / worldRange)
  const cy = MAP_SIZE / 2 + (wz - playerZ) * (MAP_SIZE / 2 / worldRange)
  return [cx, cy]
}

// Convert world position to a direction vector on the sphere for terrain sampling
const _dirVec = new THREE.Vector3()
function getTerrainColorHex(wx: number, wy: number, wz: number): string {
  _dirVec.set(wx, wy, wz).normalize()
  const height = terrainHeightAt(_dirVec)
  const color = biomeColor(_dirVec, height)
  return `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`
}

// Settlement marker colors by civ level
function settlementColor(civLevel: number): string {
  if (civLevel >= 3) return '#4682b4'
  if (civLevel >= 2) return '#708090'
  if (civLevel >= 1) return '#b8860b'
  return '#8B7355'
}

// Resource node colors by type
const NODE_COLORS: Record<string, string> = {
  wood: '#2d8a4e',
  stone: '#888888',
  fiber: '#66bb44',
  clay: '#cc7744',
  flint: '#556677',
  copper_ore: '#b87333',
  iron_ore: '#7a6a5a',
  coal: '#333333',
  tin_ore: '#9aacb8',
  sand: '#d4c47a',
  sulfur: '#cccc22',
  bark: '#7a5a2a',
  bone: '#e8e0cc',
}

export function MapPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { x: px, y: py, z: pz } = usePlayerStore()
  const remotePlayers = useMultiplayerStore(s => s.remotePlayers)
  const remoteNpcs    = useMultiplayerStore(s => s.remoteNpcs)
  const settlements   = useSettlementStore(s => s.settlements)
  const weather       = useWeatherStore(s => s.getPlayerWeather())

  const [worldRange, setWorldRange] = useState(300)

  // Terrain color cache (recomputed when player moves significantly or zoom changes)
  const terrainCacheRef = useRef<string[]>([])
  const lastSamplePosRef = useRef({ x: 0, z: 0, range: 0 })

  const zoomIn = useCallback(() => setWorldRange(r => Math.max(100, r - 100)), [])
  const zoomOut = useCallback(() => setWorldRange(r => Math.min(600, r + 100)), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ── Terrain sampling (throttled: only resample when moved >10m or zoom changed)
    const sampleDx = Math.abs(px - lastSamplePosRef.current.x)
    const sampleDz = Math.abs(pz - lastSamplePosRef.current.z)
    if (sampleDx > 10 || sampleDz > 10 || lastSamplePosRef.current.range !== worldRange || terrainCacheRef.current.length === 0) {
      const colors: string[] = []
      for (let gy = 0; gy < TERRAIN_GRID; gy++) {
        for (let gx = 0; gx < TERRAIN_GRID; gx++) {
          // Map grid cell to world position
          const worldX = px + ((gx / TERRAIN_GRID) - 0.5) * worldRange * 2
          const worldZ = pz + ((gy / TERRAIN_GRID) - 0.5) * worldRange * 2
          // Approximate world Y from player's sphere position (project onto sphere surface)
          const worldY = py  // approximate — on sphere this is close enough for color sampling
          colors.push(getTerrainColorHex(worldX, worldY, worldZ))
        }
      }
      terrainCacheRef.current = colors
      lastSamplePosRef.current = { x: px, z: pz, range: worldRange }
    }

    // ── Background (terrain colors) ──────────────────────────────────────────
    ctx.fillStyle = '#0a0a14'
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE)

    // Draw terrain grid
    const tc = terrainCacheRef.current
    for (let gy = 0; gy < TERRAIN_GRID; gy++) {
      for (let gx = 0; gx < TERRAIN_GRID; gx++) {
        ctx.fillStyle = tc[gy * TERRAIN_GRID + gx] || '#0a0a14'
        ctx.fillRect(gx * CELL_SIZE, gy * CELL_SIZE, CELL_SIZE + 0.5, CELL_SIZE + 0.5)
      }
    }

    // ── Slight darkening overlay for contrast ─────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,10,0.25)'
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE)

    // ── Grid lines ──────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 0.5
    const gridStep = MAP_SIZE / 8
    for (let i = 0; i <= MAP_SIZE; i += gridStep) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, MAP_SIZE); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(MAP_SIZE, i); ctx.stroke()
    }

    // ── Fog of war (radial reveal around player) ────────────────────────────
    const fogPixelRadius = FOG_RADIUS * (MAP_SIZE / 2 / worldRange)
    const fogGrad = ctx.createRadialGradient(
      MAP_SIZE / 2, MAP_SIZE / 2, 0,
      MAP_SIZE / 2, MAP_SIZE / 2, fogPixelRadius,
    )
    fogGrad.addColorStop(0, 'rgba(0,0,0,0)')
    fogGrad.addColorStop(0.7, 'rgba(0,0,0,0)')
    fogGrad.addColorStop(1, 'rgba(0,0,0,0.75)')
    ctx.fillStyle = fogGrad
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE)

    // ── Resource node dots (within fog reveal radius) ──────────────────────
    for (const node of RESOURCE_NODES) {
      const ndx = node.x - px, ndz = node.z - pz
      const nodeDist = Math.sqrt(ndx * ndx + ndz * ndz)
      if (nodeDist > FOG_RADIUS) continue  // hidden by fog

      const [cx, cy] = worldToCanvas(node.x, node.z, px, pz, worldRange)
      if (cx < 0 || cx > MAP_SIZE || cy < 0 || cy > MAP_SIZE) continue

      ctx.beginPath()
      ctx.arc(cx, cy, 2, 0, Math.PI * 2)
      ctx.fillStyle = NODE_COLORS[node.type] || '#666'
      ctx.fill()
    }

    // ── Settlement markers (diamond shape + name) ────────────────────────────
    for (const s of settlements.values()) {
      const [cx, cy] = worldToCanvas(s.x, s.z, px, pz, worldRange)
      if (cx < -20 || cx > MAP_SIZE + 20 || cy < -20 || cy > MAP_SIZE + 20) continue

      const size = 5
      ctx.beginPath()
      ctx.moveTo(cx, cy - size)
      ctx.lineTo(cx + size, cy)
      ctx.lineTo(cx, cy + size)
      ctx.lineTo(cx - size, cy)
      ctx.closePath()
      ctx.fillStyle = settlementColor(s.civLevel)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Settlement name
      ctx.fillStyle = '#ddd'
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(s.name, cx, cy + size + 10)
    }

    // ── NPC dots ─────────────────────────────────────────────────────────────
    for (const npc of remoteNpcs) {
      const [cx, cy] = worldToCanvas(npc.x, npc.z, px, pz, worldRange)
      if (cx < 0 || cx > MAP_SIZE || cy < 0 || cy > MAP_SIZE) continue
      ctx.beginPath()
      ctx.arc(cx, cy, 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(150,150,150,0.5)'
      ctx.fill()
    }

    // ── Remote players ────────────────────────────────────────────────────────
    for (const rp of remotePlayers.values()) {
      const [cx, cy] = worldToCanvas(rp.x, rp.z, px, pz, worldRange)
      if (cx < 0 || cx > MAP_SIZE || cy < 0 || cy > MAP_SIZE) continue
      ctx.beginPath()
      ctx.arc(cx, cy, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#3498db'
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(rp.username, cx + 7, cy + 3)
    }

    // ── Player direction arrow (triangle pointing forward) ──────────────────
    // Approximate facing from recent movement or default north
    const arrowSize = 8
    const centerX = MAP_SIZE / 2
    const centerY = MAP_SIZE / 2

    // Draw a green triangle (pointing north by default)
    ctx.beginPath()
    ctx.moveTo(centerX, centerY - arrowSize)
    ctx.lineTo(centerX - arrowSize * 0.6, centerY + arrowSize * 0.5)
    ctx.lineTo(centerX + arrowSize * 0.6, centerY + arrowSize * 0.5)
    ctx.closePath()
    ctx.fillStyle = '#2ecc71'
    ctx.fill()
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

    // ── Weather indicator (top-right corner) ─────────────────────────────────
    if (weather) {
      const weatherText = WEATHER_ICONS[weather.state] || weather.state
      const tempText = `${Math.round(weather.temperature)}C`
      ctx.textAlign = 'right'
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = weather.state === 'STORM' ? '#ff6666' :
                      weather.state === 'RAIN'  ? '#6699cc' :
                      weather.state === 'CLOUDY' ? '#999' : '#ffcc33'
      ctx.fillText(weatherText, MAP_SIZE - 8, 16)
      ctx.fillStyle = '#aaa'
      ctx.font = '9px monospace'
      ctx.fillText(tempText, MAP_SIZE - 8, 28)

      // Wind arrow indicator
      const windRad = (weather.windDir * Math.PI) / 180
      const windCx = MAP_SIZE - 20, windCy = 42
      const wLen = Math.min(8, weather.windSpeed)
      ctx.beginPath()
      ctx.moveTo(windCx, windCy)
      ctx.lineTo(windCx + Math.sin(windRad) * wLen, windCy - Math.cos(windRad) * wLen)
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // ── Legend ────────────────────────────────────────────────────────────────
    const legendY = MAP_SIZE - 50
    ctx.textAlign = 'left'
    ctx.font = '9px monospace'
    // Player
    ctx.fillStyle = '#2ecc71'
    ctx.fillRect(8, legendY, 8, 8)
    ctx.fillStyle = '#aaa'
    ctx.fillText('You', 20, legendY + 7)
    // Other players
    ctx.fillStyle = '#3498db'
    ctx.fillRect(8, legendY + 12, 8, 8)
    ctx.fillStyle = '#aaa'
    ctx.fillText('Players', 20, legendY + 19)
    // Settlements
    ctx.fillStyle = '#b8860b'
    ctx.fillRect(8, legendY + 24, 8, 8)
    ctx.fillStyle = '#aaa'
    ctx.fillText('Settlements', 20, legendY + 31)
    // Resources
    ctx.fillStyle = '#2d8a4e'
    ctx.fillRect(8, legendY + 36, 8, 8)
    ctx.fillStyle = '#aaa'
    ctx.fillText('Resources', 20, legendY + 43)

  }, [px, py, pz, remotePlayers, remoteNpcs, settlements, weather, worldRange])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <canvas
        ref={canvasRef}
        width={MAP_SIZE}
        height={MAP_SIZE}
        style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', maxWidth: '100%' }}
      />
      {/* Zoom controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={zoomIn}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            color: '#ccc',
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'monospace',
            padding: '2px 10px',
            width: 32,
          }}
        >
          +
        </button>
        <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', minWidth: 60, textAlign: 'center' }}>
          {worldRange}m
        </span>
        <button
          onClick={zoomOut}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            color: '#ccc',
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'monospace',
            padding: '2px 10px',
            width: 32,
          }}
        >
          -
        </button>
      </div>
      <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>
        Position: ({Math.round(px)}, {Math.round(pz)})
      </div>
    </div>
  )
}
