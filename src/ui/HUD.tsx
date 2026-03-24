import React, { useState, useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { useWeatherStore } from '../store/weatherStore'
import type { WeatherState } from '../store/weatherStore'
import { useSeasonStore } from '../store/seasonStore'
import type { SeasonName } from '../store/seasonStore'
import { SidebarShell } from './SidebarShell'
import { NotificationSystem } from './NotificationSystem'
import { inventory } from '../game/GameSingletons'
import { MAT, ITEM } from '../player/Inventory'
import { cookingProgress } from '../game/SurvivalSystems'
import { FirstContactOverlay } from './FirstContactOverlay'
import { useVelarStore } from '../store/velarStore'
import { getReactorTemp, isCleanupActive, getCleanupTimeRemaining, SAFE_TEMP_CELSIUS, MELT_THRESHOLD_C } from '../game/NuclearReactorSystem'

// ── Armor slot visual constants ────────────────────────────────────────────────
const STEEL_BLUE = '#4a9eff'

// Reverse lookup maps for hotbar display names (abbreviated to fit 52px slot)
const MAT_SHORT: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.replace(/_/g, ' ').split(' ').map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')])
)
const ITEM_SHORT: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.replace(/_/g, ' ').split(' ').map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')])
)

// Abbreviate long names to fit the 52px slot without overflow
function abbreviate(name: string): string {
  const words = name.split(' ')
  if (words.length === 1) return name.slice(0, 7)
  return words.map(w => w.slice(0, 4)).join(' ').slice(0, 10)
}

const RUST_ORANGE = '#cd4420'

// Science Companion URL — opens the separate deployed science Q&A site
const COMPANION_URL = 'https://universe-companion.vercel.app'

// ── Rust-style vital bar (icon + horizontal fill) ─────────────────────────────

interface RustVitalBarProps {
  value: number     // 0–1
  color: string
  icon: string
  label: string
}

function RustVitalBar({ value, color, icon, label }: RustVitalBarProps) {
  const clamped = Math.max(0, Math.min(1, value))
  const isLow   = clamped < 0.25
  const barColor = isLow ? '#e74c3c' : color
  const displayValue = clamped > 0 && clamped < 0.01
    ? (clamped * 100).toFixed(1)
    : String(Math.round(clamped * 100))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
      {/* Icon */}
      <span style={{
        fontSize: 13,
        width: 16,
        textAlign: 'center',
        opacity: isLow ? 1 : 0.75,
        filter: isLow ? 'drop-shadow(0 0 4px #e74c3c)' : 'none',
        flexShrink: 0,
      }}>
        {icon}
      </span>
      {/* Bar track */}
      <div style={{
        flex: 1,
        height: 4,
        background: 'rgba(255,255,255,0.12)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${clamped * 100}%`,
          height: '100%',
          background: barColor,
          borderRadius: 2,
          transition: 'width 0.3s ease, background 0.3s',
        }} />
      </div>
      {/* Numeric value */}
      <span style={{
        fontSize: 9,
        color: isLow ? '#e74c3c' : '#888',
        fontFamily: 'monospace',
        width: 26,
        textAlign: 'right',
        flexShrink: 0,
      }}>
        {displayValue}
      </span>
    </div>
  )
}

// ── Hotbar slot ─────────────────────────────────────────────────────────────────
// Live-wired to inventory. Reads slot data every 200ms so newly gathered items
// appear immediately. Click to equip/unequip.

interface HotbarSlotProps {
  index: number
  active?: boolean
  tick: number  // external counter to trigger re-read without per-slot state
}

function HotbarSlot({ index, active, tick }: HotbarSlotProps) {
  const equipAction   = usePlayerStore(s => s.equip)
  const unequipAction = usePlayerStore(s => s.unequip)

  // Read slot directly from the singleton (tick prop forces re-render when parent polls)
  const slot = inventory.getSlot(index)
  const hasItem = slot !== null

  const displayName = hasItem
    ? (slot.itemId === 0
        ? abbreviate(MAT_SHORT[slot.materialId] ?? `mat${slot.materialId}`)
        : abbreviate(ITEM_SHORT[slot.itemId] ?? `item${slot.itemId}`))
    : null

  function handleClick() {
    if (!hasItem) return
    if (active) unequipAction()
    else equipAction(index)
  }

  return (
    <div
      onClick={handleClick}
      title={hasItem ? `${slot.itemId === 0 ? (MAT_SHORT[slot.materialId] ?? slot.materialId) : (ITEM_SHORT[slot.itemId] ?? slot.itemId)} ×${slot.quantity}` : `Slot ${index + 1}`}
      style={{
        width: 52,
        height: 52,
        background: active
          ? 'rgba(205,68,32,0.25)'
          : hasItem
            ? 'rgba(255,255,255,0.07)'
            : 'rgba(0,0,0,0.6)',
        border: active
          ? `2px solid ${RUST_ORANGE}`
          : hasItem
            ? '1px solid rgba(255,255,255,0.25)'
            : '1px solid rgba(255,255,255,0.10)',
        borderRadius: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: active ? `0 0 8px rgba(205,68,32,0.6)` : 'none',
        position: 'relative',
        cursor: hasItem ? 'pointer' : 'default',
        transition: 'background 0.1s, border 0.1s',
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >
      {/* Item name */}
      {hasItem && displayName && (
        <span style={{
          fontSize: 9,
          color: active ? RUST_ORANGE : '#ddd',
          fontFamily: 'monospace',
          fontWeight: active ? 700 : 400,
          textAlign: 'center',
          lineHeight: 1.2,
          padding: '0 2px',
          maxWidth: 48,
          wordBreak: 'break-word',
        }}>
          {displayName}
        </span>
      )}
      {/* Quality bar */}
      {hasItem && (
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: 2,
          background: `hsl(${(slot.quality ?? 0.8) * 120}, 70%, 50%)`,
          borderRadius: '0 0 3px 3px',
        }} />
      )}
      {/* Quantity badge */}
      {hasItem && slot.quantity > 1 && (
        <div style={{
          position: 'absolute',
          bottom: 3, right: 3,
          fontSize: 8,
          color: '#f1c40f',
          fontFamily: 'monospace',
          fontWeight: 700,
          lineHeight: 1,
        }}>
          {slot.quantity > 99 ? '99+' : slot.quantity}
        </div>
      )}
      {/* Slot number — shown only when empty */}
      {!hasItem && (
        <span style={{
          fontSize: 9,
          color: 'rgba(255,255,255,0.2)',
          fontFamily: 'monospace',
          position: 'absolute',
          bottom: 3,
          left: '50%',
          transform: 'translateX(-50%)',
        }}>
          {index + 1}
        </span>
      )}
    </div>
  )
}

// ── M8: Weather HUD widget ────────────────────────────────────────────────────

const WEATHER_ICONS: Record<WeatherState, string> = {
  CLEAR:  'sun',
  CLOUDY: 'cloud',
  RAIN:   'rain',
  STORM:  'storm',
}

// ASCII-art style SVG icons — photorealistic enough for a monospace sci-fi HUD
function WeatherIcon({ state }: { state: WeatherState }) {
  const size = 18
  switch (state) {
    case 'CLEAR':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <circle cx="9" cy="9" r="4" fill="#f1c40f" />
          {[0,45,90,135,180,225,270,315].map((deg, i) => {
            const r = Math.PI * deg / 180
            const x1 = 9 + Math.cos(r) * 5.5, y1 = 9 + Math.sin(r) * 5.5
            const x2 = 9 + Math.cos(r) * 7.5, y2 = 9 + Math.sin(r) * 7.5
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f1c40f" strokeWidth="1.5" strokeLinecap="round" />
          })}
        </svg>
      )
    case 'CLOUDY':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="10" rx="6" ry="4" fill="#aabbcc" />
          <ellipse cx="7" cy="9" rx="3.5" ry="3" fill="#ccdde8" />
          <ellipse cx="12" cy="9" rx="3" ry="2.5" fill="#ccdde8" />
        </svg>
      )
    case 'RAIN':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="7" rx="5.5" ry="3.5" fill="#8899aa" />
          {[4,8,12].map((x, i) => (
            <line key={i} x1={x} y1="11" x2={x - 1} y2="16" stroke="#6699cc" strokeWidth="1.5" strokeLinecap="round" />
          ))}
        </svg>
      )
    case 'STORM':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="6" rx="6" ry="4" fill="#445566" />
          <polyline points="10,10 7,14 10,13 7,18" fill="none" stroke="#f1c40f" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )
  }
}

interface WeatherWidgetProps {
  state: WeatherState
  tempC: number
}

function WeatherWidget({ state, tempC }: WeatherWidgetProps) {
  const stormColor = state === 'STORM' ? '#e74c3c' : state === 'RAIN' ? '#6699cc' : state === 'CLOUDY' ? '#aabbcc' : '#f1c40f'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      background: 'rgba(0,0,0,0.4)',
      border: `1px solid ${stormColor}44`,
      borderRadius: 3,
      padding: '3px 7px 3px 5px',
      marginTop: 2,
    }}>
      <WeatherIcon state={state} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <span style={{
          fontSize: 8,
          color: stormColor,
          fontFamily: 'monospace',
          letterSpacing: 1,
          fontWeight: 700,
          textTransform: 'uppercase',
          lineHeight: 1.3,
        }}>
          {state}
        </span>
        <span style={{
          fontSize: 8,
          color: tempC < 0 ? '#88bbff' : tempC > 35 ? '#ff7744' : '#88ccaa',
          fontFamily: 'monospace',
          letterSpacing: 0.5,
          lineHeight: 1.3,
        }}>
          {tempC > 0 ? '+' : ''}{tempC.toFixed(0)}°C
        </span>
      </div>
    </div>
  )
}

// ── M10 Track A: Season HUD widget ───────────────────────────────────────────

function SeasonIcon({ season }: { season: SeasonName }) {
  const size = 16
  switch (season) {
    case 'SPRING':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" style={{ display: 'block' }}>
          {/* Flower petals */}
          {[0, 72, 144, 216, 288].map((deg, i) => {
            const r = (deg * Math.PI) / 180
            const cx = 8 + Math.cos(r) * 4, cy = 8 + Math.sin(r) * 4
            return <circle key={i} cx={cx} cy={cy} r="2.2" fill="#f8b4c8" opacity={0.9} />
          })}
          <circle cx="8" cy="8" r="2" fill="#f1c40f" />
        </svg>
      )
    case 'SUMMER':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" style={{ display: 'block' }}>
          <circle cx="8" cy="8" r="4" fill="#ff8c00" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
            const r = (deg * Math.PI) / 180
            const x1 = 8 + Math.cos(r) * 5.5, y1 = 8 + Math.sin(r) * 5.5
            const x2 = 8 + Math.cos(r) * 7.2, y2 = 8 + Math.sin(r) * 7.2
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ff8c00" strokeWidth="1.5" strokeLinecap="round" />
          })}
        </svg>
      )
    case 'AUTUMN':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" style={{ display: 'block' }}>
          {/* Maple-leaf silhouette in amber */}
          <path d="M8 2 L6 5 L4 4 L6 7 L3 8 L6 9 L5 12 L8 10 L11 12 L10 9 L13 8 L10 7 L12 4 L10 5 Z" fill="#d4822a" />
        </svg>
      )
    case 'WINTER':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" style={{ display: 'block' }}>
          {/* Snowflake */}
          {[0, 60, 120].map((deg, i) => {
            const r = (deg * Math.PI) / 180
            return (
              <g key={i}>
                <line x1={8 + Math.cos(r) * 6} y1={8 + Math.sin(r) * 6} x2={8 - Math.cos(r) * 6} y2={8 - Math.sin(r) * 6} stroke="#88ccff" strokeWidth="1.5" strokeLinecap="round" />
              </g>
            )
          })}
          <circle cx="8" cy="8" r="1.5" fill="#88ccff" />
        </svg>
      )
  }
}

const SEASON_COLORS: Record<SeasonName, string> = {
  SPRING: '#f8b4c8',
  SUMMER: '#ff8c00',
  AUTUMN: '#d4822a',
  WINTER: '#88ccff',
}

function SeasonWidget({ season, progress }: { season: SeasonName; progress: number }) {
  const color = SEASON_COLORS[season]
  const pct = Math.round(progress * 100)
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      background: 'rgba(0,0,0,0.4)',
      border: `1px solid ${color}44`,
      borderRadius: 3,
      padding: '3px 7px 3px 5px',
      marginTop: 2,
    }}>
      <SeasonIcon season={season} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <span style={{
          fontSize: 8,
          color,
          fontFamily: 'monospace',
          letterSpacing: 1,
          fontWeight: 700,
          textTransform: 'uppercase',
          lineHeight: 1.3,
        }}>
          {season}
        </span>
        <span style={{
          fontSize: 8,
          color: 'rgba(255,255,255,0.45)',
          fontFamily: 'monospace',
          lineHeight: 1.3,
        }}>
          {pct}%
        </span>
      </div>
    </div>
  )
}

// ── Crosshair ─────────────────────────────────────────────────────────────────

function Crosshair() {
  const size = 20
  const gap  = 5
  const thickness = 1.5
  const color = 'rgba(255,255,255,0.85)'

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: size * 2 + gap * 2,
      height: size * 2 + gap * 2,
      pointerEvents: 'none',
    }}>
      <svg width={size * 2 + gap * 2} height={size * 2 + gap * 2}>
        {/* Left */}
        <rect x={0} y={(size + gap) - thickness / 2} width={size} height={thickness} fill={color} />
        {/* Right */}
        <rect x={size + gap * 2} y={(size + gap) - thickness / 2} width={size} height={thickness} fill={color} />
        {/* Top */}
        <rect x={(size + gap) - thickness / 2} y={0} width={thickness} height={size} fill={color} />
        {/* Bottom */}
        <rect x={(size + gap) - thickness / 2} y={size + gap * 2} width={thickness} height={size} fill={color} />
        {/* Center dot */}
        <circle cx={size + gap} cy={size + gap} r={1.5} fill={color} />
      </svg>
    </div>
  )
}

// ── M13: ReactorWidget — small nuclear reactor status bar ─────────────────────

function ReactorWidget() {
  const reactorTemp     = useVelarStore(s => s.reactorTemp)
  const reactorMeltdown = useVelarStore(s => s.reactorMeltdown)
  const reactorActive   = useVelarStore(s => s.reactorActive)
  const [tick, setTick] = useState(0)

  // Poll cleanup timer
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const cleanupActive = isCleanupActive()
  const cleanupSecs   = getCleanupTimeRemaining()
  const temp          = getReactorTemp()

  const barColor =
    reactorMeltdown    ? '#ff1111' :
    temp > MELT_THRESHOLD_C ? '#ff4400' :
    temp > SAFE_TEMP_CELSIUS  ? '#ffaa00' :
    '#00cc88'

  const tempFill = Math.min(1, Math.max(0, temp / MELT_THRESHOLD_C))

  return (
    <div style={{
      position:  'fixed',
      top:       14,
      left:      14,
      zIndex:    150,
      background: 'rgba(6,10,14,0.88)',
      border:    `1px solid ${barColor}55`,
      borderRadius: '4px',
      padding:   '8px 12px',
      fontFamily: '"Courier New", monospace',
      color:     barColor,
      fontSize:  '10px',
      minWidth:  '160px',
      boxShadow: reactorMeltdown ? `0 0 20px ${barColor}66` : 'none',
      pointerEvents: 'none',
    }}>
      <div style={{ letterSpacing: '0.12em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: barColor,
          boxShadow: reactorMeltdown ? `0 0 8px ${barColor}` : 'none',
        }} />
        {reactorMeltdown ? 'MELTDOWN' : 'REACTOR ONLINE'}
      </div>
      <div style={{ marginBottom: '4px' }}>
        CORE: {temp.toFixed(0)}°C
        {temp > SAFE_TEMP_CELSIUS && !reactorMeltdown && ' — ADD COOLING'}
        {reactorMeltdown && ' — CRITICAL'}
      </div>
      {/* Temperature bar */}
      <div style={{
        width: '100%', height: '4px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginBottom: '4px',
      }}>
        <div style={{
          width: `${tempFill * 100}%`,
          height: '100%',
          background: barColor,
          transition: 'width 0.3s, background 0.3s',
        }} />
      </div>
      {reactorMeltdown && cleanupActive && (
        <div style={{ color: '#ff4444', fontSize: '9px' }}>
          CLEANUP: {cleanupSecs.toFixed(0)}s remaining
        </div>
      )}
      {reactorMeltdown && !cleanupActive && (
        <div style={{ color: '#ff4444', fontSize: '9px' }}>
          CLEANUP WINDOW EXPIRED
        </div>
      )}
      {reactorActive && !reactorMeltdown && (
        <div style={{ color: '#00cc88', fontSize: '9px', opacity: 0.7 }}>
          100 kW — electric forge, arc welder, electrolysis enabled
        </div>
      )}
    </div>
  )
}

// ── Main HUD ──────────────────────────────────────────────────────────────────

export function HUD() {
  const { paused, simTime, epoch } = useGameStore()
  const { health, hunger, thirst, energy, fatigue, ambientTemp, evolutionPoints, equippedSlot, equippedArmorSlot, equipArmor, unequipArmor, wounds, isSleeping, quenchSecondsRemaining } = usePlayerStore()
  const { connectionStatus, remotePlayers } = useMultiplayerStore()
  const weatherSectors = useWeatherStore(s => s.sectors)
  const weatherPlayerSectorId = useWeatherStore(s => s.playerSectorId)
  const playerWeather = weatherSectors.find(s => s.sectorId === weatherPlayerSectorId) ?? weatherSectors[0] ?? null
  const weatherState = playerWeather?.state ?? 'CLEAR'
  const weatherTemp  = playerWeather?.temperature ?? ambientTemp
  const season = useSeasonStore(s => s.season)
  const seasonProgress = useSeasonStore(s => s.progress)

  // Polling tick — drives hotbar re-reads every 200ms so gathered items appear immediately
  const [hotbarTick, setHotbarTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setHotbarTick(t => t + 1), 200)
    return () => clearInterval(id)
  }, [])

  // Wound + cooking poll tick — 500ms is enough for these slower-updating systems
  const [survivalTick, setSurvivalTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSurvivalTick(t => t + 1), 500)
    return () => clearInterval(id)
  }, [])

  const tempColor = ambientTemp < 0 ? '#88bbff' : ambientTemp < 30 ? '#88ff88' : ambientTemp < 50 ? '#ffaa44' : '#ff4444'

  // ── M13: Velar first-contact overlay state ─────────────────────────────────
  const showFirstContact  = useVelarStore(s => s.showFirstContact)
  const decodedByName     = useVelarStore(s => s.decodedByName)
  const setShowFirstContact = useVelarStore(s => s.setShowFirstContact)
  const reactorMeltdown   = useVelarStore(s => s.reactorMeltdown)
  const reactorActive     = useVelarStore(s => s.reactorActive)

  // Listen for first-contact event dispatched by WorldSocket VELAR_DECODED handler
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      useVelarStore.getState().markDecoded(detail.decoderId, detail.decoderName)
    }
    window.addEventListener('velar-first-contact', handler)
    return () => window.removeEventListener('velar-first-contact', handler)
  }, [])

  // Expose player userId/name to VelarSignalView for the VELAR_DECODED broadcast
  useEffect(() => {
    const userId = (window as any).__userId
    if (userId) {
      ;(window as any).__userId   = userId
      ;(window as any).__username = (window as any).__username ?? 'Explorer'
    }
  }, [])

  return (
    <>
      {/* ── M13: First Contact cinematic overlay ────────────────────────────── */}
      {showFirstContact && (
        <FirstContactOverlay
          decoderName={decodedByName ?? 'Unknown'}
          onDone={() => setShowFirstContact(false)}
        />
      )}

      {/* ── M13: Reactor HUD widget (top-left, below vitals) ────────────────── */}
      {(reactorActive || reactorMeltdown) && (
        <ReactorWidget />
      )}

      <div style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: 'monospace',
        color: '#fff',
        zIndex: 100,
      }}>

        {/* ── Crosshair ── */}
        <Crosshair />

        {/* ── Top-center: epoch + simTime strip ── */}
        <div style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 9,
            color: RUST_ORANGE,
            letterSpacing: 3,
            textTransform: 'uppercase',
            fontWeight: 700,
          }}>
            {epoch.replace(/_/g, ' ')}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>
            {simTime}
          </div>
          {paused && (
            <div style={{
              fontSize: 10,
              color: '#e74c3c',
              fontWeight: 700,
              letterSpacing: 3,
            }}>
              PAUSED
            </div>
          )}
        </div>

        {/* ── Top-right: connection + EP ── */}
        <div style={{
          position: 'absolute',
          top: 14,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 4,
          pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: connectionStatus === 'connected' ? '#2ecc71'
                        : connectionStatus === 'connecting' ? '#f1c40f'
                        : '#e74c3c',
            }} />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>
              {connectionStatus === 'connected'
                ? `${remotePlayers.size}P`
                : connectionStatus === 'connecting' ? '...' : 'OFF'}
            </span>
          </div>
          <div style={{ fontSize: 9, color: 'rgba(241,196,15,0.7)', letterSpacing: 1 }}>
            EP {evolutionPoints.toLocaleString()}
          </div>
          {/* ── M8: Weather widget ── */}
          <WeatherWidget state={weatherState} tempC={weatherTemp} />
          {/* ── M10 Track A: Season widget ── */}
          <SeasonWidget season={season} progress={seasonProgress} />
        </div>

        {/* ── Bottom-left: vitals ── */}
        <div style={{
          position: 'absolute',
          bottom: 80,
          left: 20,
          width: 160,
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 2,
          padding: '10px 12px 8px',
          pointerEvents: 'none',
        }}>
          <RustVitalBar value={health}      color="#c0392b" icon="♥" label="Health"   />
          <RustVitalBar value={1 - hunger}  color="#e67e22" icon="◆" label="Food"     />
          <RustVitalBar value={1 - thirst}  color="#2980b9" icon="~" label="Water"    />
          <RustVitalBar value={energy}      color="#27ae60" icon="⚡" label="Energy"  />
          <RustVitalBar value={1 - fatigue} color="#8e44ad" icon="●" label="Stamina"  />

          {/* Wound indicators (Slice 5) */}
          {wounds.length > 0 && (
            <div style={{
              marginTop: 5,
              paddingTop: 4,
              borderTop: '1px solid rgba(231,76,60,0.3)',
            }}>
              {wounds.map(w => (
                <div key={w.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
                }}>
                  <span style={{ fontSize: 11, color: '#e74c3c' }}>+</span>
                  <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      width: `${w.bacteriaCount}%`,
                      height: '100%',
                      background: w.bacteriaCount > 80 ? '#e74c3c' : w.bacteriaCount > 40 ? '#e67e22' : '#f1c40f',
                      transition: 'width 0.5s',
                    }} />
                  </div>
                  <span style={{ fontSize: 8, color: '#888', fontFamily: 'monospace', width: 20, textAlign: 'right' }}>
                    {w.bacteriaCount.toFixed(0)}
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 8, color: '#e74c3c', letterSpacing: 1, marginTop: 2 }}>
                WOUND{wounds.length > 1 ? 'S' : ''} [H]=herb
              </div>
            </div>
          )}

          {/* Cooking progress (Slice 4) — show when food is cooking (survivalTick forces re-read) */}
          {survivalTick >= 0 && cookingProgress.size > 0 && (
            <div style={{
              marginTop: 4, fontSize: 8, color: '#f39c12', letterSpacing: 1,
            }}>
              COOKING {Math.round(Math.min(...Array.from(cookingProgress.values())) / 8 * 100)}%
            </div>
          )}

          {/* Sleep indicator (Slice 6) */}
          {isSleeping && (
            <div style={{
              marginTop: 4, fontSize: 8, color: '#8e44ad', letterSpacing: 1,
              animation: 'none',
            }}>
              SLEEPING... [Z]=wake
            </div>
          )}

          {/* M8: Quench countdown — urgent pulsing timer when hot steel is in inventory */}
          {quenchSecondsRemaining !== null && quenchSecondsRemaining > 0 && (
            <div style={{
              marginTop: 4,
              padding: '3px 5px',
              background: 'rgba(255, 100, 0, 0.15)',
              border: '1px solid rgba(255, 100, 0, 0.5)',
              borderRadius: 2,
              fontSize: 9,
              color: quenchSecondsRemaining <= 10 ? '#ff3300' : '#ff7700',
              letterSpacing: 1,
              fontWeight: 700,
            }}>
              QUENCH: {Math.ceil(quenchSecondsRemaining)}s — run to water!
            </div>
          )}

          <div style={{
            marginTop: 6,
            paddingTop: 5,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 9,
            color: tempColor,
            letterSpacing: 1,
          }}>
            {ambientTemp.toFixed(0)}°C
          </div>
        </div>

        {/* ── M8: Armor slot (chest) — bottom-left above hotbar ── */}
        {/* Shows Steel Chestplate when equipped. Click to unequip. */}
        {(() => {
          const armorSlot = equippedArmorSlot !== null ? inventory.getSlot(equippedArmorSlot) : null
          const isPlated  = armorSlot !== null && armorSlot.itemId === ITEM.STEEL_CHESTPLATE
          return (
            <div style={{
              position: 'absolute',
              bottom: 20,
              left: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              pointerEvents: 'auto',
            }}>
              {/* Chest slot box */}
              <div
                onClick={() => {
                  if (armorSlot) unequipArmor()
                  else {
                    // Auto-find a steel chestplate in inventory and equip it
                    for (let i = 0; i < inventory.slotCount; i++) {
                      const s = inventory.getSlot(i)
                      if (s && s.itemId === ITEM.STEEL_CHESTPLATE) {
                        equipArmor(i)
                        break
                      }
                    }
                  }
                }}
                title={isPlated ? `Steel Chestplate — 40% damage reduction. Click to unequip.` : 'Chest armor slot (click to equip Steel Chestplate)'}
                style={{
                  width: 40,
                  height: 40,
                  background: isPlated ? `rgba(74,158,255,0.2)` : 'rgba(0,0,0,0.55)',
                  border: `1px solid ${isPlated ? STEEL_BLUE : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: isPlated ? `0 0 8px rgba(74,158,255,0.4)` : 'none',
                  transition: 'background 0.2s, border 0.2s, box-shadow 0.2s',
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>
                  {isPlated ? 'X' : 'O'}
                </span>
                {isPlated && (
                  <div style={{
                    position: 'absolute',
                    bottom: 0, left: 0, right: 0,
                    height: 2,
                    background: STEEL_BLUE,
                    borderRadius: '0 0 3px 3px',
                  }} />
                )}
              </div>
              {/* Label */}
              <span style={{
                fontSize: 7,
                color: isPlated ? STEEL_BLUE : 'rgba(255,255,255,0.25)',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}>
                {isPlated ? '-40%' : 'CHEST'}
              </span>
            </div>
          )
        })()}

        {/* ── Bottom-center: hotbar ── */}
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 4,
          pointerEvents: 'auto',
        }}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <HotbarSlot key={i} index={i} active={equippedSlot === i} tick={hotbarTick} />
          ))}
        </div>

        {/* ── Top-right: Science Companion button ── */}
        <a
          href={COMPANION_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Science Companion — ask questions about the real physics, chemistry, and biology behind the world"
          style={{
            position: 'absolute',
            top: 14,
            right: 16,
            marginTop: 42,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'rgba(205,68,32,0.15)',
            border: '1px solid rgba(205,68,32,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(205,68,32,0.85)',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'monospace',
            textDecoration: 'none',
            pointerEvents: 'auto',
            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(205,68,32,0.3)'
            e.currentTarget.style.borderColor = 'rgba(205,68,32,0.7)'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(205,68,32,0.15)'
            e.currentTarget.style.borderColor = 'rgba(205,68,32,0.35)'
            e.currentTarget.style.color = 'rgba(205,68,32,0.85)'
          }}
        >
          ?
        </a>

      </div>

      {/* ── Sidebar panels + icon strip ── */}
      <SidebarShell />

      {/* ── Toast notifications ── */}
      <NotificationSystem />
    </>
  )
}
