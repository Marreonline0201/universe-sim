// ── MapPanel ───────────────────────────────────────────────────────────────────
// M28 Track A: Minimap Upgrades
//   A1: Fog of war — canvas overlay with visited-cell reveal (32m grid)
//   A2: Waypoints  — right-click to place gold diamonds; click to remove
//   A3: Animated NPC dots — pulse scale 0.8→1.2 at ~1 Hz, color by disposition
//   A4: Settlement labels — 8px white text within view bounds
//   A5: Zoom controls — 3 levels (100/200/400 m), persisted in uiStore
//
// Earlier features preserved: terrain colors, resource nodes, remote players,
// compass, weather indicator, legend, player arrow.

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { usePlayerStore } from '../../store/playerStore'
import { useMultiplayerStore } from '../../store/multiplayerStore'
import { useSettlementStore } from '../../store/settlementStore'
import { useWeatherStore } from '../../store/weatherStore'
import { useUiStore, MINIMAP_ZOOM_LEVELS } from '../../store/uiStore'
import { RESOURCE_NODES } from '../../world/ResourceNodeManager'
import { terrainHeightAt, biomeColor } from '../../world/SpherePlanet'

const MAP_SIZE = 440            // canvas px
const TERRAIN_GRID = 44         // 44×44 terrain color samples
const CELL_SIZE = MAP_SIZE / TERRAIN_GRID
const FOG_CELL_WORLD = 32       // visited-cell resolution (world units)
const FOG_REVEAL_WORLD = 60     // radius around player that reveals fog (world units)
const NPC_VISIBLE_WORLD = 200   // max distance to show NPC dots (world units)

// ── Weather indicator labels ──────────────────────────────────────────────────
const WEATHER_ICONS: Record<string, string> = {
  CLEAR: 'SUN', CLOUDY: 'CLD', RAIN: 'RAN', STORM: 'STM',
}

// ── Coordinate helpers ────────────────────────────────────────────────────────
function worldToCanvas(
  wx: number, wz: number,
  playerX: number, playerZ: number,
  worldRange: number,
): [number, number] {
  const cx = MAP_SIZE / 2 + (wx - playerX) * (MAP_SIZE / 2 / worldRange)
  const cy = MAP_SIZE / 2 + (wz - playerZ) * (MAP_SIZE / 2 / worldRange)
  return [cx, cy]
}

function canvasToWorld(
  cx: number, cy: number,
  playerX: number, playerZ: number,
  worldRange: number,
): [number, number] {
  const wx = playerX + (cx - MAP_SIZE / 2) * (worldRange / (MAP_SIZE / 2))
  const wz = playerZ + (cy - MAP_SIZE / 2) * (worldRange / (MAP_SIZE / 2))
  return [wx, wz]
}

function fogCellKey(wx: number, wz: number): string {
  return `${Math.floor(wx / FOG_CELL_WORLD)},${Math.floor(wz / FOG_CELL_WORLD)}`
}

// ── Terrain color ─────────────────────────────────────────────────────────────
const _dirVec = new THREE.Vector3()
function getTerrainColorHex(wx: number, wy: number, wz: number): string {
  _dirVec.set(wx, wy, wz).normalize()
  const height = terrainHeightAt(_dirVec)
  const color = biomeColor(_dirVec, height)
  return `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`
}

// ── Settlement diamond color ──────────────────────────────────────────────────
function settlementColor(civLevel: number): string {
  if (civLevel >= 3) return '#4682b4'
  if (civLevel >= 2) return '#708090'
  if (civLevel >= 1) return '#b8860b'
  return '#8B7355'
}

// ── Resource node colors ──────────────────────────────────────────────────────
const NODE_COLORS: Record<string, string> = {
  wood: '#2d8a4e', stone: '#888888', fiber: '#66bb44', clay: '#cc7744',
  flint: '#556677', copper_ore: '#b87333', iron_ore: '#7a6a5a', coal: '#333333',
  tin_ore: '#9aacb8', sand: '#d4c47a', sulfur: '#cccc22', bark: '#7a5a2a', bone: '#e8e0cc',
}

// ── NPC disposition color ─────────────────────────────────────────────────────
function npcColor(npc: { state?: string }): string {
  if (npc.state === 'hostile' || npc.state === 'attacking') return '#ff4444'
  if (npc.state === 'neutral') return '#ffaa33'
  return '#44cc88'  // friendly / default
}

// ── Draw a gold diamond ───────────────────────────────────────────────────────
function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
  fill: string, stroke: string,
): void {
  ctx.beginPath()
  ctx.moveTo(cx, cy - size)
  ctx.lineTo(cx + size, cy)
  ctx.lineTo(cx, cy + size)
  ctx.lineTo(cx - size, cy)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.2
  ctx.stroke()
}

// ─────────────────────────────────────────────────────────────────────────────

export function MapPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)

  const { x: px, y: py, z: pz } = usePlayerStore()
  const remotePlayers = useMultiplayerStore(s => s.remotePlayers)
  const remoteNpcs    = useMultiplayerStore(s => s.remoteNpcs)
  const settlements   = useSettlementStore(s => s.settlements)
  const weather       = useWeatherStore(s => s.getPlayerWeather())

  // ── A5: Zoom from uiStore ─────────────────────────────────────────────────
  const worldRange        = useUiStore(s => s.minimapZoom)
  const cycleZoomIn       = useUiStore(s => s.cycleMinimapZoomIn)
  const cycleZoomOut      = useUiStore(s => s.cycleMinimapZoomOut)

  // ── A2: Waypoints from uiStore ────────────────────────────────────────────
  const waypoints         = useUiStore(s => s.waypoints)
  const addWaypoint       = useUiStore(s => s.addWaypoint)
  const removeWaypoint    = useUiStore(s => s.removeWaypoint)

  // ── A1: Fog of war visited cells ──────────────────────────────────────────
  const visitedCellsRef = useRef<Set<string>>(new Set())

  // ── A3: NPC animation pulse time ─────────────────────────────────────────
  const startTimeRef = useRef(performance.now())

  // ── Terrain cache ─────────────────────────────────────────────────────────
  const terrainCacheRef    = useRef<string[]>([])
  const lastSamplePosRef   = useRef({ x: 0, z: 0, range: 0 })

  // ── Waypoint hover state ──────────────────────────────────────────────────
  const [hoveredWpIndex, setHoveredWpIndex] = useState<number>(-1)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  // ── Update fog-of-war visited cells as player moves ───────────────────────
  useEffect(() => {
    const key = fogCellKey(px, pz)
    if (!visitedCellsRef.current.has(key)) {
      visitedCellsRef.current = new Set(visitedCellsRef.current)
      visitedCellsRef.current.add(key)
    }
  }, [px, pz])

  // ── Right-click → place waypoint ─────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const scaleX = MAP_SIZE / rect.width
    const scaleY = MAP_SIZE / rect.height
    const cx = (e.clientX - rect.left) * scaleX
    const cy = (e.clientY - rect.top)  * scaleY

    // Check if clicking on an existing waypoint to remove it
    for (let i = 0; i < waypoints.length; i++) {
      const [wcx, wcy] = worldToCanvas(waypoints[i].x, waypoints[i].z, px, pz, worldRange)
      const dist = Math.sqrt((cx - wcx) ** 2 + (cy - wcy) ** 2)
      if (dist < 10) {
        removeWaypoint(i)
        return
      }
    }

    // Otherwise place new waypoint
    const [wx, wz] = canvasToWorld(cx, cy, px, pz, worldRange)
    addWaypoint({ x: wx, z: wz })
  }, [waypoints, px, pz, worldRange, addWaypoint, removeWaypoint])

  // ── Mouse move → detect waypoint hover ───────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const scaleX = MAP_SIZE / rect.width
    const scaleY = MAP_SIZE / rect.height
    const cx = (e.clientX - rect.left) * scaleX
    const cy = (e.clientY - rect.top)  * scaleY

    let found = -1
    for (let i = 0; i < waypoints.length; i++) {
      const [wcx, wcy] = worldToCanvas(waypoints[i].x, waypoints[i].z, px, pz, worldRange)
      const dist = Math.sqrt((cx - wcx) ** 2 + (cy - wcy) ** 2)
      if (dist < 12) { found = i; break }
    }
    setHoveredWpIndex(found)
    setTooltipPos(found >= 0 ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null)
  }, [waypoints, px, pz, worldRange])

  // ── Main render loop ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cancelled = false

    function render() {
      if (cancelled || !ctx) return

      const now = performance.now()
      const elapsed = (now - startTimeRef.current) / 1000  // seconds

      // ── Terrain sampling (throttled: resample when moved >10m or zoom changed) ──
      const sampleDx = Math.abs(px - lastSamplePosRef.current.x)
      const sampleDz = Math.abs(pz - lastSamplePosRef.current.z)
      if (
        sampleDx > 10 || sampleDz > 10 ||
        lastSamplePosRef.current.range !== worldRange ||
        terrainCacheRef.current.length === 0
      ) {
        const colors: string[] = []
        for (let gy = 0; gy < TERRAIN_GRID; gy++) {
          for (let gx = 0; gx < TERRAIN_GRID; gx++) {
            const worldX = px + ((gx / TERRAIN_GRID) - 0.5) * worldRange * 2
            const worldZ = pz + ((gy / TERRAIN_GRID) - 0.5) * worldRange * 2
            colors.push(getTerrainColorHex(worldX, py, worldZ))
          }
        }
        terrainCacheRef.current = colors
        lastSamplePosRef.current = { x: px, z: pz, range: worldRange }
      }

      // ── Background terrain ─────────────────────────────────────────────────
      ctx.fillStyle = '#0a0a14'
      ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE)

      const tc = terrainCacheRef.current
      for (let gy = 0; gy < TERRAIN_GRID; gy++) {
        for (let gx = 0; gx < TERRAIN_GRID; gx++) {
          ctx.fillStyle = tc[gy * TERRAIN_GRID + gx] || '#0a0a14'
          ctx.fillRect(gx * CELL_SIZE, gy * CELL_SIZE, CELL_SIZE + 0.5, CELL_SIZE + 0.5)
        }
      }

      // ── Slight darkening for contrast ──────────────────────────────────────
      ctx.fillStyle = 'rgba(0,0,10,0.25)'
      ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE)

      // ── Grid lines ─────────────────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'
      ctx.lineWidth = 0.5
      const gridStep = MAP_SIZE / 8
      for (let i = 0; i <= MAP_SIZE; i += gridStep) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, MAP_SIZE); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(MAP_SIZE, i); ctx.stroke()
      }

      // ── A1: Fog of war overlay (visited cells punch holes) ─────────────────
      // Draw full black fog, then use destination-out to cut revealed circles
      const fogCanvas = document.createElement('canvas')
      fogCanvas.width  = MAP_SIZE
      fogCanvas.height = MAP_SIZE
      const fogCtx = fogCanvas.getContext('2d')!

      // Fill fog
      fogCtx.fillStyle = 'rgba(0,0,0,0.82)'
      fogCtx.fillRect(0, 0, MAP_SIZE, MAP_SIZE)

      // Cut holes for each visited cell
      fogCtx.globalCompositeOperation = 'destination-out'
      const revealPx = FOG_REVEAL_WORLD * (MAP_SIZE / 2 / worldRange)
      for (const key of visitedCellsRef.current) {
        const [gxStr, gzStr] = key.split(',')
        const cellWorldX = (parseInt(gxStr) + 0.5) * FOG_CELL_WORLD
        const cellWorldZ = (parseInt(gzStr) + 0.5) * FOG_CELL_WORLD
        const [cx, cy] = worldToCanvas(cellWorldX, cellWorldZ, px, pz, worldRange)
        // Only bother drawing if on canvas
        if (cx < -revealPx * 2 || cx > MAP_SIZE + revealPx * 2) continue
        if (cy < -revealPx * 2 || cy > MAP_SIZE + revealPx * 2) continue
        const grad = fogCtx.createRadialGradient(cx, cy, 0, cx, cy, revealPx)
        grad.addColorStop(0,   'rgba(0,0,0,1)')
        grad.addColorStop(0.6, 'rgba(0,0,0,1)')
        grad.addColorStop(1,   'rgba(0,0,0,0)')
        fogCtx.fillStyle = grad
        fogCtx.beginPath()
        fogCtx.arc(cx, cy, revealPx, 0, Math.PI * 2)
        fogCtx.fill()
      }

      ctx.drawImage(fogCanvas, 0, 0)

      // ── Resource node dots (only in revealed area) ─────────────────────────
      for (const node of RESOURCE_NODES) {
        const ndx = node.x - px, ndz = node.z - pz
        const cellKey = fogCellKey(node.x, node.z)
        if (!visitedCellsRef.current.has(cellKey)) {
          // approximate: also show if within reveal radius of player
          const nodeDist = Math.sqrt(ndx * ndx + ndz * ndz)
          if (nodeDist > FOG_REVEAL_WORLD) continue
        }
        const [cx, cy] = worldToCanvas(node.x, node.z, px, pz, worldRange)
        if (cx < 0 || cx > MAP_SIZE || cy < 0 || cy > MAP_SIZE) continue
        ctx.beginPath()
        ctx.arc(cx, cy, 2, 0, Math.PI * 2)
        ctx.fillStyle = NODE_COLORS[node.type] || '#666'
        ctx.fill()
      }

      // ── A4: Settlement labels + diamond markers ─────────────────────────────
      for (const s of settlements.values()) {
        const [cx, cy] = worldToCanvas(s.x, s.z, px, pz, worldRange)
        if (cx < -20 || cx > MAP_SIZE + 20 || cy < -20 || cy > MAP_SIZE + 20) continue

        drawDiamond(ctx, cx, cy, 5, settlementColor(s.civLevel), 'rgba(255,255,255,0.4)')

        // A4: label (8px white text)
        ctx.fillStyle = '#ffffff'
        ctx.font = '8px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(s.name, cx, cy + 15)
      }

      // ── A3: Animated NPC dots ──────────────────────────────────────────────
      // pulse: scale oscillates 0.8 → 1.2 at ~1 Hz
      const pulse = 1.0 + 0.2 * Math.sin(elapsed * Math.PI * 2)  // ~1 Hz

      for (const npc of remoteNpcs) {
        const dx = npc.x - px, dz = npc.z - pz
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > NPC_VISIBLE_WORLD) continue

        const [cx, cy] = worldToCanvas(npc.x, npc.z, px, pz, worldRange)
        if (cx < 0 || cx > MAP_SIZE || cy < 0 || cy > MAP_SIZE) continue

        const r = 3 * pulse
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = npcColor(npc)
        ctx.globalAlpha = 0.85
        ctx.fill()
        ctx.globalAlpha = 1.0
      }

      // ── Remote players ─────────────────────────────────────────────────────
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

      // ── A2: Waypoint diamonds ──────────────────────────────────────────────
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i]
        const [cx, cy] = worldToCanvas(wp.x, wp.z, px, pz, worldRange)
        if (cx < -12 || cx > MAP_SIZE + 12 || cy < -12 || cy > MAP_SIZE + 12) continue
        const isHovered = i === hoveredWpIndex
        drawDiamond(ctx, cx, cy, isHovered ? 8 : 6, '#ffd700', isHovered ? '#fff' : 'rgba(255,200,0,0.7)')
      }

      // ── Player direction arrow (triangle, always on top) ──────────────────
      const arrowSize = 8
      const centerX   = MAP_SIZE / 2
      const centerY   = MAP_SIZE / 2
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

      // ── Compass ────────────────────────────────────────────────────────────
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('N', MAP_SIZE / 2, 16)
      ctx.fillText('S', MAP_SIZE / 2, MAP_SIZE - 6)
      ctx.textAlign = 'left'
      ctx.fillText('W', 6, MAP_SIZE / 2 + 4)
      ctx.textAlign = 'right'
      ctx.fillText('E', MAP_SIZE - 6, MAP_SIZE / 2 + 4)

      // ── Weather indicator ──────────────────────────────────────────────────
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

      // ── Legend ─────────────────────────────────────────────────────────────
      const legendY = MAP_SIZE - 50
      ctx.textAlign = 'left'
      ctx.font = '9px monospace'
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(8, legendY,      8, 8)
      ctx.fillStyle = '#aaa';    ctx.fillText('You',         20, legendY + 7)
      ctx.fillStyle = '#3498db'; ctx.fillRect(8, legendY + 12, 8, 8)
      ctx.fillStyle = '#aaa';    ctx.fillText('Players',     20, legendY + 19)
      ctx.fillStyle = '#44cc88'; ctx.fillRect(8, legendY + 24, 8, 8)
      ctx.fillStyle = '#aaa';    ctx.fillText('NPCs',        20, legendY + 31)
      ctx.fillStyle = '#ffd700'; ctx.fillRect(8, legendY + 36, 8, 8)
      ctx.fillStyle = '#aaa';    ctx.fillText('Waypoints',   20, legendY + 43)

      animFrameRef.current = requestAnimationFrame(render)
    }

    render()
    return () => {
      cancelled = true
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [px, py, pz, remotePlayers, remoteNpcs, settlements, weather, worldRange, waypoints, hoveredWpIndex])

  // ── Waypoint hover distance helper ────────────────────────────────────────
  const hoveredWp = hoveredWpIndex >= 0 ? waypoints[hoveredWpIndex] : null
  const wpDistance = hoveredWp
    ? Math.round(Math.sqrt((hoveredWp.x - px) ** 2 + (hoveredWp.z - pz) ** 2))
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <canvas
          ref={canvasRef}
          width={MAP_SIZE}
          height={MAP_SIZE}
          onContextMenu={handleContextMenu}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { setHoveredWpIndex(-1); setTooltipPos(null) }}
          style={{
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            maxWidth: '100%',
            cursor: 'crosshair',
          }}
        />

        {/* A2: Waypoint distance tooltip */}
        {hoveredWp && tooltipPos && (
          <div
            style={{
              position: 'absolute',
              left: tooltipPos.x + 12,
              top: tooltipPos.y - 18,
              background: 'rgba(0,0,0,0.8)',
              color: '#ffd700',
              fontSize: 10,
              fontFamily: 'monospace',
              padding: '2px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              border: '1px solid rgba(255,200,0,0.4)',
            }}
          >
            {wpDistance}m · right-click to remove
          </div>
        )}
      </div>

      {/* A5: Zoom controls — 3 discrete levels */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          onClick={cycleZoomIn}
          disabled={worldRange === MINIMAP_ZOOM_LEVELS[0]}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            color: worldRange === MINIMAP_ZOOM_LEVELS[0] ? '#444' : '#ccc',
            cursor: worldRange === MINIMAP_ZOOM_LEVELS[0] ? 'default' : 'pointer',
            fontSize: 14,
            fontFamily: 'monospace',
            padding: '2px 10px',
            width: 32,
          }}
        >
          +
        </button>

        {/* Zoom level pips */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {MINIMAP_ZOOM_LEVELS.map(level => (
            <button
              key={level}
              onClick={() => useUiStore.getState().setMinimapZoom(level)}
              title={`${level}m`}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                border: 'none',
                background: level === worldRange ? '#ccc' : 'rgba(255,255,255,0.2)',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>

        <button
          onClick={cycleZoomOut}
          disabled={worldRange === MINIMAP_ZOOM_LEVELS[MINIMAP_ZOOM_LEVELS.length - 1]}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            color: worldRange === MINIMAP_ZOOM_LEVELS[MINIMAP_ZOOM_LEVELS.length - 1] ? '#444' : '#ccc',
            cursor: worldRange === MINIMAP_ZOOM_LEVELS[MINIMAP_ZOOM_LEVELS.length - 1] ? 'default' : 'pointer',
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
        {worldRange}m · ({Math.round(px)}, {Math.round(pz)}) · {waypoints.length}/5 waypoints
      </div>
    </div>
  )
}
