import React, { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { useWeatherStore } from '../store/weatherStore'
import type { WeatherState } from '../store/weatherStore'
import { useSeasonStore } from '../store/seasonStore'
import type { SeasonName } from '../store/seasonStore'
import { SidebarShell } from './SidebarShell'
import { NotificationSystem } from './NotificationSystem'
import { CombatHUD } from './CombatHUD'
import { TutorialOverlay } from './TutorialOverlay'
import { MobileControls } from './MobileControls'
import { inventory } from '../game/GameSingletons'
import { MAT, ITEM } from '../player/Inventory'
import { cookingProgress } from '../game/SurvivalSystems'
// M42 Track B: Shelter state
import { shelterState } from '../game/ShelterSystem'
import { activeFoodBuffs } from '../game/FoodBuffSystem'
import { useVelarStore } from '../store/velarStore'
import { getReactorTemp, isCleanupActive, getCleanupTimeRemaining, SAFE_TEMP_CELSIUS, MELT_THRESHOLD_C } from '../game/NuclearReactorSystem'
import { EmoteWheel } from './EmoteWheel'
import { getLocalEmote } from '../game/EmoteSystem'
import { skillSystem, SkillSystem, type SkillId } from '../game/SkillSystem'
import { RemotePlayerNameTagsOverlay } from './RemotePlayerNameTags'
import { InspectPlayerOverlay } from './InspectPlayerOverlay'
import { TradePanel } from './panels/TradePanel'
import { useUiStore } from '../store/uiStore'
import { useSettlementQuestStore } from '../store/settlementQuestStore'
// M35 Track C: Faction system
import { useFactionStore } from '../store/factionStore'
import { useSettlementStore } from '../store/settlementStore'
import { FACTIONS, getFactionRelationship, getRelationshipColor } from '../game/FactionSystem'
// M36 Track C: Building system HUD
import { BuildingAnnouncementHUD } from './BuildingAnnouncementHUD'
// M37 Track C: Title system
import { getEquippedTitle } from '../game/TitleSystem'
import { getLocalUsername } from '../net/useWorldSocket'
// M37 Track A: World events HUD
import { WorldEventHUD } from './WorldEventHUD'
// M39 Track B: Social features
import { ChatBox } from './ChatBox'
import { PartyHUD } from './PartyHUD'
import { SpectateMode } from './SpectateMode'
// M40 Track B: Magic spell system
const SpellBar = lazy(() => import('./SpellBar').then(m => ({ default: m.SpellBar })))
// M44 Track C: Weather-spell interaction hint
const SpellWeatherHint = lazy(() => import('./panels/SpellWeatherHint').then(m => ({ default: m.SpellWeatherHint })))
// M41 Track B: Mount HUD
const MountHUD = lazy(() => import('./MountHUD').then(m => ({ default: m.MountHUD })))
// M39 Track C: Civilization progression banners
import { useCivStore, CIV_LEVEL_LABELS, CIV_LEVEL_ICONS } from '../store/civStore'

// M41 Track C: Seasonal festival events
const FestivalHUD = lazy(() => import('./FestivalHUD').then(m => ({ default: m.FestivalHUD })))
// M42 Track C: Reputation tier toast
const ReputationToast = lazy(() => import('./ReputationToast').then(m => ({ default: m.ReputationToast })))

// ── M20: Lazy-loaded overlays (rarely shown) ─────────────────────────────────
const FirstContactOverlay = lazy(() => import('./FirstContactOverlay').then(m => ({ default: m.FirstContactOverlay })))
// M44 Track A: Dungeon loot drop overlay
const LootOverlay = lazy(() => import('./panels/LootOverlay').then(m => ({ default: m.LootOverlay })))

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
  const displayValue = clamped > 0 && clamped < 0.005
    ? (clamped * 100).toFixed(2)
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

// ── M29 Track B: Warmth bar ───────────────────────────────────────────────────

function WarmthBar({ warmth }: { warmth: number }) {
  const clamped = Math.max(0, Math.min(100, warmth))
  const isLow   = clamped < 20
  const barColor = isLow ? '#e74c3c' : '#5588ff'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
      <span style={{
        fontSize: 13,
        width: 16,
        textAlign: 'center',
        opacity: isLow ? 1 : 0.75,
        filter: isLow ? 'drop-shadow(0 0 4px #88bbff)' : 'none',
        flexShrink: 0,
        animation: isLow ? 'warmthPulse 1s ease-in-out infinite' : 'none',
      }}>
        ❄
      </span>
      <div style={{
        flex: 1,
        height: 4,
        background: 'rgba(255,255,255,0.12)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${clamped}%`,
          height: '100%',
          background: barColor,
          borderRadius: 2,
          transition: 'width 0.3s ease, background 0.3s',
          animation: isLow ? 'warmthPulse 1s ease-in-out infinite' : 'none',
        }} />
      </div>
      <span style={{
        fontSize: 9,
        color: isLow ? '#e74c3c' : '#888',
        fontFamily: 'monospace',
        width: 26,
        textAlign: 'right',
        flexShrink: 0,
      }}>
        {Math.round(clamped)}
      </span>
    </div>
  )
}

// ── M39 Track C: Civ level-up and milestone banners ──────────────────────────

function CivLevelUpBanner() {
  const pendingLevelUp = useCivStore(s => s.pendingLevelUp)
  const dismissLevelUp = useCivStore(s => s.dismissLevelUp)
  useEffect(() => {
    if (!pendingLevelUp) return
    const id = setTimeout(dismissLevelUp, 6000)
    return () => clearTimeout(id)
  }, [pendingLevelUp, dismissLevelUp])
  if (!pendingLevelUp) return null
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300,
      background: 'linear-gradient(90deg, #7c3f00, #cd7f32, #7c3f00)',
      color: '#fff', fontFamily: 'monospace', textAlign: 'center',
      padding: '10px 0', fontSize: 15, letterSpacing: 2, fontWeight: 700,
      borderBottom: '2px solid #cd7f32',
    }}>
      {CIV_LEVEL_ICONS[pendingLevelUp]} AGE ADVANCED — {CIV_LEVEL_LABELS[pendingLevelUp].toUpperCase()} {CIV_LEVEL_ICONS[pendingLevelUp]}
    </div>
  )
}

function CivMilestoneBanner() {
  const [banner, setBanner] = useState<{ title: string; description: string } | null>(null)
  useEffect(() => {
    function onMilestone(e: Event) {
      const { title, description } = (e as CustomEvent).detail
      setBanner({ title, description })
      setTimeout(() => setBanner(null), 5000)
    }
    window.addEventListener('civ-milestone', onMilestone)
    return () => window.removeEventListener('civ-milestone', onMilestone)
  }, [])
  if (!banner) return null
  return (
    <div style={{
      position: 'fixed', top: 44, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(10,10,10,0.92)', border: '1px solid #cd7f32',
      borderRadius: 6, padding: '8px 20px', zIndex: 299,
      color: '#fff', fontFamily: 'monospace', textAlign: 'center',
      fontSize: 12, letterSpacing: 1,
    }}>
      <div style={{ color: '#cd7f32', fontWeight: 700, marginBottom: 2 }}>⚙ {banner.title}</div>
      <div style={{ color: '#aaa' }}>{banner.description}</div>
    </div>
  )
}

// ── M38 Track B: Stamina bar ──────────────────────────────────────────────────

function StaminaBar({ stamina, maxStamina }: { stamina: number; maxStamina: number }) {
  const clamped = Math.max(0, Math.min(maxStamina, stamina))
  const pct     = maxStamina > 0 ? clamped / maxStamina : 0
  const isLow   = pct < 0.3
  const barColor = isLow ? '#eab308' : '#22c55e'  // yellow when < 30%, green otherwise

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
      <span style={{
        fontSize: 13,
        width: 16,
        textAlign: 'center',
        opacity: isLow ? 1 : 0.75,
        filter: isLow ? 'drop-shadow(0 0 4px #eab308)' : 'none',
        flexShrink: 0,
      }}>
        ⚙
      </span>
      <div style={{
        flex: 1,
        height: 4,
        background: 'rgba(255,255,255,0.12)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct * 100}%`,
          height: '100%',
          background: barColor,
          borderRadius: 2,
          transition: 'width 0.2s ease, background 0.3s',
        }} />
      </div>
      <span style={{
        fontSize: 9,
        color: isLow ? '#eab308' : '#888',
        fontFamily: 'monospace',
        width: 26,
        textAlign: 'right',
        flexShrink: 0,
      }}>
        {Math.round(clamped)}
      </span>
    </div>
  )
}

// ── M42 Track B: Shelter indicator ───────────────────────────────────────────

function ShelterIndicator() {
  const [snap, setSnap] = useState({ isSheltered: false, shelterType: null as string | null, shelterName: '' })
  useEffect(() => {
    const id = setInterval(() => {
      setSnap({
        isSheltered: shelterState.isSheltered,
        shelterType: shelterState.shelterType,
        shelterName: shelterState.shelterName,
      })
    }, 500)
    return () => clearInterval(id)
  }, [])

  if (!snap.isSheltered) return null

  const label =
    snap.shelterType === 'home'     ? '[ HOME ]'     :
    snap.shelterType === 'cave'     ? '[ CAVE ]'     :
    snap.shelterType === 'building' ? `[ ${snap.shelterName.toUpperCase()} ]` :
    '[ SHELTER ]'

  return (
    <div style={{
      marginTop: 4,
      fontSize: 9,
      color: '#44ff88',
      fontFamily: 'monospace',
      letterSpacing: 1,
      fontWeight: 700,
    }}>
      {label}
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
  CLEAR:           'sun',
  CLOUDY:          'cloud',
  RAIN:            'rain',
  STORM:           'storm',
  BLIZZARD:        'blizzard',
  TORNADO_WARNING: 'tornado',
  VOLCANIC_ASH:    'ash',
  ACID_RAIN:       'acid',
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
    case 'BLIZZARD':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="6" rx="6" ry="3.5" fill="#cce8ff" />
          {[3,7,11,15].map((x, i) => (
            <line key={i} x1={x} y1="11" x2={x + 2} y2="16" stroke="#aaddff" strokeWidth="1.5" strokeLinecap="round" />
          ))}
          <line x1="2" y1="10" x2="16" y2="10" stroke="#aaddff" strokeWidth="1" />
        </svg>
      )
    case 'TORNADO_WARNING':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="4" rx="7" ry="2.5" fill="#778899" />
          <ellipse cx="9" cy="8" rx="5" ry="2" fill="#667788" />
          <ellipse cx="9" cy="12" rx="3" ry="1.5" fill="#556677" />
          <ellipse cx="9" cy="16" rx="1" ry="1" fill="#445566" />
        </svg>
      )
    case 'VOLCANIC_ASH':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="6" rx="6" ry="3.5" fill="#887755" />
          {[4,8,12].map((x, i) => (
            <ellipse key={i} cx={x} cy={13 + i} rx="1.2" ry="0.8" fill="#aa8855" opacity="0.7" />
          ))}
        </svg>
      )
    case 'ACID_RAIN':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="7" rx="5.5" ry="3.5" fill="#667744" />
          {[4,8,12].map((x, i) => (
            <line key={i} x1={x} y1="11" x2={x - 1} y2="16" stroke="#aaff44" strokeWidth="1.5" strokeLinecap="round" />
          ))}
        </svg>
      )
    default:
      return null
  }
}

interface WeatherWidgetProps {
  state: WeatherState
  tempC: number
}

function WeatherWidget({ state, tempC }: WeatherWidgetProps) {
  const stormColor =
    state === 'TORNADO_WARNING' ? '#ffaa00' :
    state === 'VOLCANIC_ASH'   ? '#cc6600' :
    state === 'BLIZZARD'       ? '#aaddff' :
    state === 'ACID_RAIN'      ? '#aaff44' :
    state === 'STORM'          ? '#e74c3c' :
    state === 'RAIN'           ? '#6699cc' :
    state === 'CLOUDY'         ? '#aabbcc' : '#f1c40f'

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

// ── M29 Track B: Storm wind direction indicator ───────────────────────────────

function StormWindIndicator({ windDir }: { windDir: number }) {
  // windDir = degrees, 0=north clockwise. Arrow points INTO the wind.
  const arrowRad = (windDir + 180) * Math.PI / 180
  const cx = 10, cy = 10, r = 6
  const tx = cx + Math.sin(arrowRad) * r
  const ty = cy - Math.cos(arrowRad) * r

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      background: 'rgba(0,0,0,0.4)',
      border: '1px solid #ffaa0055',
      borderRadius: 3,
      padding: '3px 7px 3px 5px',
      marginTop: 2,
    }}>
      <svg width={20} height={20} viewBox="0 0 20 20" style={{ display: 'block' }}>
        <line x1={cx} y1={cy} x2={tx} y2={ty} stroke="#ffaa00" strokeWidth="2" strokeLinecap="round" />
        <circle cx={tx} cy={ty} r="2" fill="#ffaa00" />
      </svg>
      <span style={{ fontSize: 8, color: '#ffaa00', fontFamily: 'monospace', letterSpacing: 1, fontWeight: 700 }}>
        STORM
      </span>
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

// ── M22: Time-of-Day Widget ────────────────────────────────────────────────────

function TimeOfDayWidget() {
  const dayAngle = useGameStore(s => s.dayAngle)
  const dayCount = useGameStore(s => s.dayCount)

  const sinA = Math.sin(dayAngle)
  const sunAboveHorizon = sinA > 0
  const horizonProximity = 1 - Math.abs(sinA)

  // Determine time-of-day label
  let period: string
  let periodColor: string
  if (!sunAboveHorizon) {
    period = 'Night'
    periodColor = '#6688cc'
  } else if (horizonProximity > 0.7 && dayAngle < Math.PI) {
    period = 'Dawn'
    periodColor = '#ffaa66'
  } else if (horizonProximity > 0.7 && dayAngle >= Math.PI) {
    period = 'Dusk'
    periodColor = '#ff8844'
  } else if (sinA > 0.85) {
    period = 'Noon'
    periodColor = '#ffdd44'
  } else if (dayAngle < Math.PI / 2) {
    period = 'Morning'
    periodColor = '#aaddff'
  } else {
    period = 'Afternoon'
    periodColor = '#ffcc88'
  }

  const isSun = sunAboveHorizon
  const icon = isSun ? '*' : 'C'  // sun vs crescent moon

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      marginTop: 3,
      fontSize: 10,
      color: 'rgba(255,255,255,0.45)',
    }}>
      <span style={{ color: periodColor, fontSize: 12, fontWeight: 700 }}>{icon}</span>
      <span style={{ color: periodColor, letterSpacing: 1 }}>{period}</span>
      <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9 }}>Day {dayCount}</span>
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

// ── M33 Track B: Active Food Buffs bar (bottom-left, above vitals panel) ──────

function ActiveBuffsBar({ tick }: { tick: number }) {
  const now = Date.now()
  const buffs = activeFoodBuffs.filter(b => b.expiresAt > now)
  if (buffs.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
      marginTop: 6,
      paddingTop: 5,
      borderTop: '1px solid rgba(143,255,143,0.18)',
    }}>
      {buffs.map(b => {
        const remaining = b.expiresAt - now
        const totalMs = b.durationMs
        const secs = Math.ceil(remaining / 1000)
        const mins = Math.floor(secs / 60)
        const s = secs % 60
        const timeStr = mins > 0 ? `${mins}:${String(s).padStart(2, '0')}` : `${secs}s`
        const isExpiring = remaining < 10_000
        const pct = Math.max(0, Math.min(1, remaining / totalMs))

        return (
          <div
            key={b.name}
            title={b.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              background: 'rgba(0,0,0,0.65)',
              border: `1px solid ${isExpiring ? '#ffaa00' : 'rgba(143,255,143,0.35)'}`,
              borderRadius: 3,
              padding: '2px 6px 2px 4px',
              animation: isExpiring ? 'buffExpiring 0.7s ease-in-out infinite' : 'none',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* duration fill bar at bottom */}
            <div style={{
              position: 'absolute',
              bottom: 0, left: 0,
              width: `${pct * 100}%`,
              height: 2,
              background: isExpiring ? '#ffaa00' : '#8fff8f',
              transition: 'width 0.5s linear',
            }} />
            <span style={{ fontSize: 13, lineHeight: 1 }}>{b.icon}</span>
            <span style={{
              fontSize: 8,
              fontFamily: 'monospace',
              color: isExpiring ? '#ffaa00' : '#8fff8f',
              letterSpacing: 0.5,
              fontWeight: 700,
              lineHeight: 1,
            }}>
              {timeStr}
            </span>
          </div>
        )
      })}
      {/* CSS animation for expiring buffs */}
      <style>{`
        @keyframes buffExpiring {
          0%   { opacity: 1; }
          50%  { opacity: 0.55; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── M33 Track C: Chest loot popup ─────────────────────────────────────────────

const CHEST_TIER_COLOR: Record<string, string> = {
  common:    '#cc9955',
  rare:      '#4da6ff',
  legendary: '#cc66ff',
}

function ChestLootPopup() {
  const [popup, setPopup] = useState<{ tier: string; lines: string[]; key: number } | null>(null)

  useEffect(() => {
    let keyCounter = 0
    function onChestOpened(e: Event) {
      const { tier, lootLines } = (e as CustomEvent).detail as { tier: string; lootLines: string[] }
      const key = ++keyCounter
      setPopup({ tier, lines: lootLines, key })
      setTimeout(() => setPopup(p => (p?.key === key ? null : p)), 3000)
    }
    window.addEventListener('chest-opened', onChestOpened)
    return () => window.removeEventListener('chest-opened', onChestOpened)
  }, [])

  if (!popup) return null

  const color = CHEST_TIER_COLOR[popup.tier] ?? '#cccccc'
  return (
    <div
      key={popup.key}
      style={{
        position: 'fixed',
        bottom: 200,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(8,6,14,0.92)',
        border: `1px solid ${color}66`,
        borderTop: `2px solid ${color}`,
        borderRadius: 4,
        padding: '10px 20px',
        fontFamily: 'monospace',
        zIndex: 400,
        pointerEvents: 'none',
        minWidth: 220,
        animation: 'chestLootSlideUp 0.3s ease-out forwards',
      }}
    >
      <div style={{ fontSize: 10, color, letterSpacing: 3, marginBottom: 6, textTransform: 'uppercase' }}>
        Chest Opened — {popup.tier}
      </div>
      {popup.lines.map((line, i) => (
        <div key={i} style={{ fontSize: 11, color: '#e8e8e8', marginBottom: 3, letterSpacing: 0.5 }}>
          + {line}
        </div>
      ))}
    </div>
  )
}

// ── M27 Track A: Skill XP bar (bottom-center, above hotbar) ──────────────────

function SkillXpBar() {
  const [, setTick] = useState(0)
  const [levelUpFlash, setLevelUpFlash] = useState<{ skillId: SkillId; level: number } | null>(null)
  const [xpToasts, setXpToasts] = useState<Array<{ id: number; msg: string }>>([])

  useEffect(() => {
    // Track previous levels and xp to detect changes
    const prevLevels: Record<SkillId, number> = {} as Record<SkillId, number>
    const prevXp: Record<SkillId, number>     = {} as Record<SkillId, number>
    for (const id of SkillSystem.getAllSkillIds()) {
      prevLevels[id] = skillSystem.getLevel(id)
      prevXp[id]     = skillSystem.getXp(id)
    }
    let toastKey = 0

    const unsub = skillSystem.subscribe(() => {
      for (const id of SkillSystem.getAllSkillIds()) {
        const newLevel = skillSystem.getLevel(id)
        const newXp    = skillSystem.getXp(id)
        const gained   = newXp - prevXp[id]

        if (newLevel > prevLevels[id]) {
          // Level-up flash (overrides any existing flash)
          setLevelUpFlash({ skillId: id, level: newLevel })
          setTimeout(() => setLevelUpFlash(f => (f?.skillId === id && f.level === newLevel ? null : f)), 2500)
          prevLevels[id] = newLevel
        }

        if (gained > 0) {
          // XP gain toast — bottom-left, auto-dismiss 2s
          const key = ++toastKey
          const name = SkillSystem.getSkillName(id)
          const msg = `+${gained} ${name} XP`
          setXpToasts(prev => [...prev.slice(-4), { id: key, msg }])
          setTimeout(() => setXpToasts(prev => prev.filter(t => t.id !== key)), 2000)
          prevXp[id] = newXp
        }
      }
      setTick(t => t + 1)
    })
    return unsub
  }, [])

  // Dismiss level-up flash on click
  const dismissFlash = () => setLevelUpFlash(null)

  // Pick the most interesting skill to display in the XP bar:
  // highest total XP (most recently active approximation)
  const skillIds = SkillSystem.getAllSkillIds()
  let displaySkill: SkillId = skillIds[0]
  let maxXp = -1
  for (const id of skillIds) {
    const xp = skillSystem.getXp(id)
    if (xp > maxXp) { maxXp = xp; displaySkill = id }
  }

  const skill    = skillSystem.getSkill(displaySkill)
  const progress = skillSystem.getXpProgress(displaySkill)
  const color    = SkillSystem.getSkillColor(displaySkill)
  const name     = SkillSystem.getSkillName(displaySkill)
  const isMaxed  = skill.level >= 10

  return (
    <>
      {/* XP bar strip — bottom-center, just above hotbar */}
      {!isMaxed && (
        <div style={{
          position: 'absolute',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 8,
            color: 'rgba(255,255,255,0.45)',
            fontFamily: 'monospace',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}>
            {name} — Level {skill.level}
          </div>
          <div style={{
            width: 300,
            height: 6,
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 3,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress * 100}%`,
              height: '100%',
              background: color,
              borderRadius: 3,
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* Level-up flash — screen-center toast */}
      {levelUpFlash && (
        <div
          onClick={dismissFlash}
          style={{
            position: 'fixed',
            top: '38%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 900,
            pointerEvents: 'auto',
            textAlign: 'center',
            fontFamily: 'monospace',
            animation: 'skillLevelUpFade 2.5s ease-out forwards',
          }}
        >
          <div style={{
            background: 'rgba(10,8,2,0.90)',
            border: '1px solid #f1c40f',
            borderRadius: 4,
            padding: '12px 32px',
            boxShadow: '0 0 40px rgba(241,196,15,0.35)',
          }}>
            <div style={{ fontSize: 10, color: '#f1c40f', letterSpacing: 4, marginBottom: 4 }}>
              LEVEL UP
            </div>
            <div style={{ fontSize: 20, color: '#f1c40f', fontWeight: 900, letterSpacing: 2 }}>
              {SkillSystem.getSkillName(levelUpFlash.skillId)}
            </div>
            <div style={{ fontSize: 13, color: '#ffe082', marginTop: 4, letterSpacing: 1 }}>
              Lv. {levelUpFlash.level - 1} &rarr; Lv. {levelUpFlash.level}
            </div>
          </div>
        </div>
      )}

      {/* XP gain toasts — bottom-left stack */}
      {xpToasts.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 160,
          left: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          zIndex: 310,
          pointerEvents: 'none',
        }}>
          {xpToasts.map(t => (
            <div key={t.id} style={{
              background: 'rgba(14,14,14,0.88)',
              border: '1px solid rgba(205,68,32,0.35)',
              borderLeft: '3px solid #cd4420',
              borderRadius: 2,
              padding: '4px 10px',
              fontFamily: 'monospace',
              fontSize: 10,
              color: '#cd4420',
              fontWeight: 700,
              letterSpacing: 0.5,
              animation: 'xpToastFade 2s ease-out forwards',
            }}>
              {t.msg}
            </div>
          ))}
        </div>
      )}

      {/* CSS keyframes */}
      <style>{`
        @keyframes skillLevelUpFade {
          0%   { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          15%  { opacity: 1; transform: translateX(-50%) translateY(0); }
          70%  { opacity: 1; }
          100% { opacity: 0; transform: translateX(-50%) translateY(-6px); }
        }
        @keyframes xpToastFade {
          0%   { opacity: 0; transform: translateX(-6px); }
          10%  { opacity: 1; transform: translateX(0); }
          70%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes warmthPulse {
          0%   { opacity: 1; }
          50%  { opacity: 0.4; }
          100% { opacity: 1; }
        }
        @keyframes lightningFlash {
          0%   { opacity: 0.8; }
          100% { opacity: 0; }
        }
        @keyframes bossPulse {
          0%   { box-shadow: 0 0 18px rgba(204,0,0,0.6); border-color: #cc0000; }
          50%  { box-shadow: 0 0 36px rgba(204,0,0,1.0); border-color: #ff3333; }
          100% { box-shadow: 0 0 18px rgba(204,0,0,0.6); border-color: #cc0000; }
        }
        @keyframes chestLootSlideUp {
          0%   { opacity: 0; transform: translateX(-50%) translateY(12px); }
          20%  { opacity: 1; transform: translateX(-50%) translateY(0); }
          80%  { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-6px); }
        }
        @keyframes tornadoPulse {
          0%   { box-shadow: 0 0 0 0 rgba(255,170,0,0.6); border-color: #ffaa00; }
          50%  { box-shadow: 0 0 0 8px rgba(255,170,0,0); border-color: #ffcc44; }
          100% { box-shadow: 0 0 0 0 rgba(255,170,0,0.6); border-color: #ffaa00; }
        }
        @keyframes blizzardPulse {
          0%   { opacity: 0.7; }
          50%  { opacity: 1.0; }
          100% { opacity: 0.7; }
        }
        @keyframes volcanicFlicker {
          0%   { border-color: #cc4400; box-shadow: 0 0 12px rgba(204,68,0,0.5); }
          50%  { border-color: #ff6600; box-shadow: 0 0 24px rgba(255,102,0,0.8); }
          100% { border-color: #cc4400; box-shadow: 0 0 12px rgba(204,68,0,0.5); }
        }
        @keyframes earthquakeFlash {
          0%   { background: rgba(220,40,40,0.12); }
          50%  { background: rgba(220,40,40,0.25); }
          100% { background: rgba(220,40,40,0.12); }
        }
      `}</style>
    </>
  )
}

// ── M33 Track A: Quest Tracker Widget ────────────────────────────────────────

const QUEST_TYPE_ICONS: Record<string, string> = {
  gather: '🌿',
  hunt: '⚔',
  explore: '🗺',
  craft: '🔨',
}

// ── M34 Track B: Boss spawn alert banner ─────────────────────────────────────

interface BossSpawnDetail { name: string; distance: number; direction: string }
interface BossKillDetail  { name: string; killerName: string }

/** Displays a dramatic red banner for 5 seconds when the world boss spawns. */
export function BossSpawnAlert() {
  const [detail, setDetail] = useState<BossSpawnDetail | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<BossSpawnDetail>).detail
      setDetail(d)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setDetail(null), 5000)
    }
    window.addEventListener('world-boss-spawned', handler)
    return () => {
      window.removeEventListener('world-boss-spawned', handler)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!detail) return null

  return (
    <div style={{
      position: 'fixed',
      top: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.85)',
      border: '2px solid #cc0000',
      borderRadius: 6,
      padding: '10px 24px',
      zIndex: 900,
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      animation: 'bossPulse 0.8s ease-in-out infinite',
      boxShadow: '0 0 24px rgba(204,0,0,0.7)',
    }}>
      <span style={{ fontSize: 13, color: '#ff4444', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 2 }}>
        &#9888; WORLD BOSS
      </span>
      <span style={{ fontSize: 11, color: '#ff8888', fontFamily: 'monospace' }}>
        {detail.name} has appeared [{detail.distance}m {detail.direction}]
      </span>
    </div>
  )
}

/** Displays a gold banner when the world boss is slain. */
export function BossKillAnnouncement() {
  const [detail, setDetail] = useState<BossKillDetail | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<BossKillDetail>).detail
      setDetail(d)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setDetail(null), 6000)
    }
    window.addEventListener('world-boss-killed', handler)
    return () => {
      window.removeEventListener('world-boss-killed', handler)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!detail) return null

  return (
    <div style={{
      position: 'fixed',
      top: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.85)',
      border: '2px solid #ffaa00',
      borderRadius: 6,
      padding: '10px 24px',
      zIndex: 900,
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      boxShadow: '0 0 24px rgba(255,170,0,0.6)',
    }}>
      <span style={{ fontSize: 13, color: '#ffcc00', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 2 }}>
        &#127942; BOSS SLAIN
      </span>
      <span style={{ fontSize: 11, color: '#ffdd88', fontFamily: 'monospace' }}>
        {detail.killerName} has slain the {detail.name}!
      </span>
    </div>
  )
}

// ── M34 Track B: Boss HP bar (shown when within 200m of boss) ─────────────────

/** Persistent top-screen HP bar visible while the boss is alive. */
export function BossHPBar() {
  const [bossData, setBossData] = useState<{ hp: number; maxHp: number; visible: boolean } | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ hp: number; maxHp: number; visible: boolean }>).detail
      // Show bar whenever boss is alive (maxHp > 0 and hp > 0)
      if (d.maxHp > 0 && d.hp > 0) {
        setBossData(d)
      } else {
        setBossData(null)
      }
    }
    window.addEventListener('__bossOverlayUpdate', handler)
    return () => window.removeEventListener('__bossOverlayUpdate', handler)
  }, [])

  if (!bossData) return null
  const hpPct = Math.max(0, Math.min(1, bossData.hp / bossData.maxHp))

  return (
    <div style={{
      position: 'fixed',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.8)',
      border: '1px solid #cc0000',
      borderRadius: 6,
      padding: '5px 16px',
      zIndex: 850,
      pointerEvents: 'none',
      minWidth: 220,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 3,
    }}>
      <span style={{ fontSize: 10, color: '#ff4444', fontFamily: 'monospace', letterSpacing: 1 }}>
        &#128308; Ancient Dire Wolf &mdash; {Math.round(bossData.hp)}/{bossData.maxHp} HP
      </span>
      <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: `${hpPct * 100}%`,
          height: '100%',
          background: '#cc0000',
          borderRadius: 3,
          transition: 'width 0.25s ease',
        }} />
      </div>
    </div>
  )
}

// ── M35 Track C: Faction Badge (top-left) ─────────────────────────────────────

function FactionBadgeWidget() {
  const playerFaction = useFactionStore(s => s.playerFaction)
  const togglePanel   = useUiStore(s => s.togglePanel)

  if (!playerFaction) return null

  const f = FACTIONS[playerFaction]

  return (
    <div
      onClick={() => togglePanel('factions')}
      title={`${f.name} — click to open Factions panel (G)`}
      style={{
        position: 'fixed',
        top: 14,
        left: 258,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background: 'rgba(0,0,0,0.55)',
        border: `1px solid ${f.color}55`,
        borderLeft: `3px solid ${f.color}`,
        borderRadius: 3,
        padding: '3px 8px',
        cursor: 'pointer',
        zIndex: 110,
        pointerEvents: 'auto',
        fontFamily: 'monospace',
        fontSize: 9,
        color: f.color,
        letterSpacing: 1,
        fontWeight: 700,
      }}
    >
      <span style={{ fontSize: 13, lineHeight: 1 }}>{f.icon}</span>
      <span style={{ textTransform: 'uppercase' }}>{f.name}</span>
    </div>
  )
}

// ── M35 Track C: Settlement Territory Banner ──────────────────────────────────

function SettlementTerritoryBanner() {
  const [banner, setBanner] = useState<{
    name: string
    factionName: string
    factionIcon: string
    factionColor: string
    relColor: string
    relLabel: string
  } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const playerFaction = useFactionStore(s => s.playerFaction)
  const nearSettlementId = useSettlementStore(s => s.nearSettlementId)
  const settlements = useSettlementStore(s => s.settlements)

  useEffect(() => {
    if (nearSettlementId === null) {
      // Clear banner when leaving
      if (timerRef.current) clearTimeout(timerRef.current)
      setBanner(null)
      return
    }
    const s = settlements.get(nearSettlementId)
    if (!s) return

    const npcFaction = useFactionStore.getState().getSettlementFaction(nearSettlementId)
    if (!npcFaction) return

    const f = FACTIONS[npcFaction]
    let relColor = '#aaaaaa'
    let relLabel = ''
    if (playerFaction) {
      const rel = getFactionRelationship(playerFaction, npcFaction)
      relColor = getRelationshipColor(rel)
      relLabel = rel === 'war' ? ' — HOSTILE TERRITORY' : rel === 'ally' ? ' — ALLIED TERRITORY' : ''
    }

    setBanner({
      name: s.name,
      factionName: f.name,
      factionIcon: f.icon,
      factionColor: f.color,
      relColor,
      relLabel,
    })

    // Auto-hide after 3 seconds
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setBanner(null), 3000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearSettlementId])

  if (!banner) return null

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.82)',
      border: `1px solid ${banner.factionColor}55`,
      borderTop: `2px solid ${banner.factionColor}`,
      borderRadius: 4,
      padding: '6px 20px',
      zIndex: 350,
      pointerEvents: 'none',
      textAlign: 'center',
      fontFamily: 'monospace',
      animation: 'chestLootSlideUp 0.3s ease-out',
    }}>
      <div style={{ fontSize: 9, color: '#888', letterSpacing: 2, marginBottom: 2 }}>
        ENTERING
      </div>
      <div style={{ fontSize: 13, color: '#fff', fontWeight: 700, letterSpacing: 1 }}>
        {banner.name}
      </div>
      <div style={{ fontSize: 10, color: banner.relColor, letterSpacing: 1, marginTop: 2 }}>
        {banner.factionIcon} {banner.factionName}{banner.relLabel}
      </div>
    </div>
  )
}

// ── M35 Track C: Raid notification banner ─────────────────────────────────────

export function RaidAlertBanner() {
  const [alert, setAlert] = useState<{ message: string; key: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keyRef = useRef(0)

  useEffect(() => {
    function onRaidAlert(e: Event) {
      const { message } = (e as CustomEvent<{ message: string }>).detail
      const key = ++keyRef.current
      setAlert({ message, key })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setAlert(null), 5000)
    }
    window.addEventListener('faction-raid-alert', onRaidAlert)
    return () => {
      window.removeEventListener('faction-raid-alert', onRaidAlert)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!alert) return null

  return (
    <div
      key={alert.key}
      style={{
        position: 'fixed',
        top: 100,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.88)',
        border: '2px solid #cc3333',
        borderRadius: 4,
        padding: '8px 20px',
        zIndex: 900,
        pointerEvents: 'none',
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#ff6666',
        fontWeight: 700,
        letterSpacing: 1,
        animation: 'bossPulse 0.8s ease-in-out infinite',
      }}
    >
      {alert.message}
    </div>
  )
}

// ── M35 Track B: Disaster Warning Overlay ────────────────────────────────────

type DisasterType = 'tornado' | 'blizzard' | 'volcanic_ash' | 'earthquake' | 'lava' | null

/** Priority stack: shows the highest-severity active disaster warning. */
export function DisasterWarningOverlay() {
  const [tornadoDist, setTornadoDist]       = useState<number>(-1)
  const [blizzardActive, setBlizzardActive] = useState(false)
  const [ashActive, setAshActive]           = useState(false)
  const [earthquakeActive, setEarthquake]   = useState(false)
  const [lavaWarning, setLavaWarning]       = useState(false)
  const [lavaOnFire, setLavaOnFire]         = useState(false)
  const ashTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blizzardTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const earthquakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lavaTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onTornado = (e: Event) => {
      const d = (e as CustomEvent<{ distance: number }>).detail
      setTornadoDist(d.distance)
    }
    const onBlizzard = () => {
      setBlizzardActive(true)
      if (blizzardTimerRef.current) clearTimeout(blizzardTimerRef.current)
      blizzardTimerRef.current = setTimeout(() => setBlizzardActive(false), 3000)
    }
    const onAsh = () => {
      setAshActive(true)
      if (ashTimerRef.current) clearTimeout(ashTimerRef.current)
      ashTimerRef.current = setTimeout(() => setAshActive(false), 3000)
    }
    const onEarthquakeStart = () => {
      setEarthquake(true)
      if (earthquakeTimerRef.current) clearTimeout(earthquakeTimerRef.current)
    }
    const onEarthquakeEnd = () => {
      setEarthquake(false)
    }
    const onLavaWarning = () => {
      setLavaWarning(true)
      if (lavaTimerRef.current) clearTimeout(lavaTimerRef.current)
      lavaTimerRef.current = setTimeout(() => setLavaWarning(false), 1500)
    }
    const onLavaDamage = () => {
      setLavaOnFire(true)
      if (lavaTimerRef.current) clearTimeout(lavaTimerRef.current)
      lavaTimerRef.current = setTimeout(() => { setLavaWarning(false); setLavaOnFire(false) }, 1500)
    }

    window.addEventListener('tornado-warning', onTornado)
    window.addEventListener('blizzard-active', onBlizzard)
    window.addEventListener('volcanic-ash-active', onAsh)
    window.addEventListener('earthquake-start', onEarthquakeStart)
    window.addEventListener('earthquake-end', onEarthquakeEnd)
    window.addEventListener('lava-warning', onLavaWarning)
    window.addEventListener('lava-damage', onLavaDamage)

    return () => {
      window.removeEventListener('tornado-warning', onTornado)
      window.removeEventListener('blizzard-active', onBlizzard)
      window.removeEventListener('volcanic-ash-active', onAsh)
      window.removeEventListener('earthquake-start', onEarthquakeStart)
      window.removeEventListener('earthquake-end', onEarthquakeEnd)
      window.removeEventListener('lava-warning', onLavaWarning)
      window.removeEventListener('lava-damage', onLavaDamage)
      if (ashTimerRef.current) clearTimeout(ashTimerRef.current)
      if (blizzardTimerRef.current) clearTimeout(blizzardTimerRef.current)
      if (earthquakeTimerRef.current) clearTimeout(earthquakeTimerRef.current)
      if (lavaTimerRef.current) clearTimeout(lavaTimerRef.current)
    }
  }, [])

  // Priority: earthquake > lava > tornado > volcanic_ash > blizzard
  let activeDisaster: DisasterType = null
  if (earthquakeActive)              activeDisaster = 'earthquake'
  else if (lavaOnFire || lavaWarning) activeDisaster = 'lava'
  else if (tornadoDist >= 0)         activeDisaster = 'tornado'
  else if (ashActive)                activeDisaster = 'volcanic_ash'
  else if (blizzardActive)           activeDisaster = 'blizzard'

  if (!activeDisaster) return null

  if (activeDisaster === 'earthquake') {
    return (
      <>
        {/* Full-screen red tint + screen shake text */}
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(220,40,40,0.18)',
          pointerEvents: 'none',
          zIndex: 1800,
          animation: 'earthquakeFlash 0.4s ease-in-out infinite',
        }} />
        <div style={{
          position: 'fixed',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)',
          border: '2px solid #cc0000',
          borderRadius: 6,
          padding: '8px 24px',
          zIndex: 1850,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          animation: 'bossPulse 0.5s ease-in-out infinite',
        }}>
          <span style={{ fontSize: 13, color: '#ff4444', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 2 }}>
            &#127755; EARTHQUAKE
          </span>
          <span style={{ fontSize: 10, color: '#ff8888', fontFamily: 'monospace' }}>
            Speed reduced — brace yourself!
          </span>
        </div>
      </>
    )
  }

  if (activeDisaster === 'lava') {
    return (
      <div style={{
        position: 'fixed',
        bottom: 160,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(12,4,0,0.92)',
        border: `2px solid ${lavaOnFire ? '#ff3300' : '#ff6600'}`,
        borderRadius: 6,
        padding: '8px 20px',
        zIndex: 1800,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        animation: 'volcanicFlicker 0.6s ease-in-out infinite',
        boxShadow: `0 0 20px rgba(255,${lavaOnFire ? '50' : '100'},0,0.7)`,
      }}>
        <span style={{ fontSize: 11, color: '#ff5500', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 1 }}>
          {lavaOnFire ? '&#128293; LAVA \u2014 Move!' : '&#9888; Lava nearby \u2014 danger!'}
        </span>
      </div>
    )
  }

  if (activeDisaster === 'tornado') {
    return (
      <>
        {/* Amber pulsing border */}
        <div style={{
          position: 'fixed',
          inset: 0,
          border: '4px solid #ffaa00',
          pointerEvents: 'none',
          zIndex: 1750,
          animation: 'tornadoPulse 0.8s ease-in-out infinite',
          borderRadius: 0,
        }} />
        <div style={{
          position: 'fixed',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(8,6,0,0.90)',
          border: '2px solid #ffaa00',
          borderRadius: 6,
          padding: '8px 20px',
          zIndex: 1760,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          boxShadow: '0 0 20px rgba(255,170,0,0.4)',
        }}>
          <span style={{ fontSize: 13, color: '#ffcc00', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 2, animation: 'tornadoPulse 0.8s ease-in-out infinite' }}>
            &#9888;&#65039; TORNADO APPROACHING
          </span>
          <span style={{ fontSize: 10, color: '#ffdd88', fontFamily: 'monospace' }}>
            {tornadoDist > 0 ? `${tornadoDist}m away \u2014 run!` : 'DANGER ZONE'}
          </span>
        </div>
      </>
    )
  }

  if (activeDisaster === 'volcanic_ash') {
    return (
      <>
        {/* Orange corner overlays */}
        {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map(corner => (
          <div key={corner} style={{
            position: 'fixed',
            ...(corner.includes('top')    ? { top: 0 }    : { bottom: 0 }),
            ...(corner.includes('Left')   ? { left: 0 }   : { right: 0 }),
            width: 120,
            height: 120,
            background: corner.includes('top')
              ? `radial-gradient(circle at ${corner.includes('Left') ? '0% 0%' : '100% 0%'}, rgba(180,80,0,0.35), transparent 80%)`
              : `radial-gradient(circle at ${corner.includes('Left') ? '0% 100%' : '100% 100%'}, rgba(180,80,0,0.35), transparent 80%)`,
            pointerEvents: 'none',
            zIndex: 1700,
            animation: 'volcanicFlicker 1.5s ease-in-out infinite',
          }} />
        ))}
        <div style={{
          position: 'fixed',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10,5,0,0.90)',
          border: '2px solid #cc4400',
          borderRadius: 6,
          padding: '8px 20px',
          zIndex: 1710,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          animation: 'volcanicFlicker 1.5s ease-in-out infinite',
        }}>
          <span style={{ fontSize: 12, color: '#ff6600', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 1 }}>
            &#9729;&#65039; Volcanic Ash \u2014 take cover!
          </span>
          <span style={{ fontSize: 10, color: '#ffaa66', fontFamily: 'monospace' }}>
            Taking 2 damage/s \u2014 seek shelter
          </span>
        </div>
      </>
    )
  }

  if (activeDisaster === 'blizzard') {
    return (
      <>
        {/* Blue-white vignette edges */}
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(140,190,255,0.25) 100%)',
          pointerEvents: 'none',
          zIndex: 1650,
          animation: 'blizzardPulse 2s ease-in-out infinite',
        }} />
        <div style={{
          position: 'fixed',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(4,8,20,0.90)',
          border: '2px solid #aaddff',
          borderRadius: 6,
          padding: '8px 20px',
          zIndex: 1660,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          boxShadow: '0 0 16px rgba(140,190,255,0.4)',
        }}>
          <span style={{ fontSize: 12, color: '#aaddff', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 1 }}>
            &#10052; BLIZZARD \u2014 Seek shelter!
          </span>
          <span style={{ fontSize: 10, color: '#ddeeff', fontFamily: 'monospace' }}>
            Warmth draining rapidly
          </span>
        </div>
      </>
    )
  }

  return null
}

// ── M34 Track A: Home indicator (top-left, above vitals) ──────────────────────
function HomeIndicatorWidget() {
  const homeSet      = usePlayerStore(s => s.homeSet)
  const homePosition = usePlayerStore(s => s.homePosition)
  const { x: px, y: py, z: pz } = usePlayerStore(s => s)
  const togglePanel  = useUiStore(s => s.togglePanel)

  if (!homeSet || !homePosition) return null

  const [hx, hy, hz] = homePosition
  const dx = hx - px, dy = hy - py, dz = hz - pz
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const nearby = dist < 15

  // Compute compass bearing angle (atan2 in the XZ plane)
  const angle = Math.atan2(dz, dx) * (180 / Math.PI)

  return (
    <div
      onClick={() => togglePanel('home')}
      title={`Home Base — ${dist < 1 ? 'here' : `${dist.toFixed(0)}m`} — click to open`}
      style={{
        position: 'fixed',
        top: 14,
        left: 186,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background: 'rgba(0,0,0,0.55)',
        border: `1px solid ${nearby ? 'rgba(123,75,42,0.6)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 3,
        padding: '3px 7px',
        cursor: 'pointer',
        zIndex: 110,
        pointerEvents: 'auto',
        fontFamily: 'monospace',
        fontSize: 9,
        color: nearby ? '#e8c97a' : '#888',
        letterSpacing: 1,
        transition: 'border-color 0.3s, color 0.3s',
      }}
    >
      <span style={{ fontSize: 11 }}>{'\uD83C\uDFE0'}</span>
      {nearby ? (
        <span>HOME</span>
      ) : (
        <>
          <span>{dist.toFixed(0)}m</span>
          {/* Directional arrow */}
          <span style={{
            display: 'inline-block',
            transform: `rotate(${angle}deg)`,
            fontSize: 10,
            lineHeight: 1,
          }}>&#10148;</span>
        </>
      )}
    </div>
  )
}

function QuestTrackerWidget() {
  const [collapsed, setCollapsed] = useState(false)
  const [, setTick] = useState(0)
  const togglePanel = useUiStore(s => s.togglePanel)

  // Poll every 750ms for progress updates
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 750)
    return () => clearInterval(id)
  }, [])

  const activeQuests = useSettlementQuestStore(s => s.getActiveQuests())
  if (activeQuests.length === 0) return null

  const shown = activeQuests.slice(0, 3)

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 160,
        right: 60,
        zIndex: 300,
        fontFamily: '"Courier New", monospace',
        pointerEvents: 'auto',
        minWidth: 160,
        maxWidth: 200,
      }}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid rgba(205,68,32,0.3)',
          borderRadius: collapsed ? 3 : '3px 3px 0 0',
          padding: '4px 7px',
          cursor: 'pointer',
          fontSize: 9,
          color: '#cd4420',
          fontWeight: 700,
          letterSpacing: 1,
        }}
      >
        <span>QUESTS ({activeQuests.length})</span>
        <div style={{ flex: 1 }} />
        <span
          onClick={(e) => { e.stopPropagation(); togglePanel('quests') }}
          title="Open Quest Panel"
          style={{ color: '#555', cursor: 'pointer', fontSize: 10 }}
        >
          [Q]
        </span>
        <span style={{ color: '#555', marginLeft: 3 }}>{collapsed ? '▲' : '▼'}</span>
      </div>

      {/* Quest list */}
      {!collapsed && (
        <div style={{
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid rgba(205,68,32,0.2)',
          borderTop: 'none',
          borderRadius: '0 0 3px 3px',
          padding: '4px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}>
          {shown.map(q => {
            const pct = q.targetCount > 0 ? Math.min(100, (q.progress / q.targetCount) * 100) : 0
            const icon = QUEST_TYPE_ICONS[q.type] ?? '?'
            return (
              <div key={q.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <span style={{ fontSize: 11 }}>{icon}</span>
                  <span style={{ fontSize: 9, color: '#ccc', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {q.title}
                  </span>
                  <span style={{ fontSize: 8, color: '#888' }}>{q.progress}/{q.targetCount}</span>
                </div>
                <div style={{ height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 1, overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: pct >= 100 ? '#2ecc71' : '#cd4420',
                    borderRadius: 1,
                    transition: 'width 0.4s',
                  }} />
                </div>
              </div>
            )
          })}
          {activeQuests.length > 3 && (
            <div style={{ fontSize: 8, color: '#555', textAlign: 'center' }}>
              +{activeQuests.length - 3} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main HUD ──────────────────────────────────────────────────────────────────

export function HUD() {
  const { paused, simTime, epoch } = useGameStore()
  const { health, hunger, thirst, energy, fatigue, ambientTemp, warmth, equippedSlot, equippedArmorSlot, equipArmor, unequipArmor, wounds, isSleeping, quenchSecondsRemaining, stamina, maxStamina } = usePlayerStore()
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

  // ── M26 Track B: Emote wheel (hold T) ──────────────────────────────────────
  const [emoteWheelOpen, setEmoteWheelOpen] = useState(false)
  const [localEmoji, setLocalEmoji] = useState<string | null>(null)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'KeyT' && !e.repeat) setEmoteWheelOpen(true)
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'KeyT') setEmoteWheelOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup',   onKeyUp)
    }
  }, [])
  // Poll local emote state every 250ms for the speech bubble indicator
  useEffect(() => {
    const id = setInterval(() => setLocalEmoji(getLocalEmote()), 250)
    return () => clearInterval(id)
  }, [])

  // Wound + cooking poll tick — 500ms is enough for these slower-updating systems
  const [survivalTick, setSurvivalTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSurvivalTick(t => t + 1), 500)
    return () => clearInterval(id)
  }, [])

  const tempColor = ambientTemp < 0 ? '#88bbff' : ambientTemp < 30 ? '#88ff88' : ambientTemp < 50 ? '#ffaa44' : '#ff4444'

  // ── M32 Track C: Fast travel fade overlay ─────────────────────────────────
  const travelFading = useUiStore(s => s.travelFading)

  // ── M29 Track B: Lightning flash overlay state ─────────────────────────────
  const [lightningFlash, setLightningFlash] = useState(false)
  useEffect(() => {
    function onLightningFlash() {
      setLightningFlash(true)
      setTimeout(() => setLightningFlash(false), 300)
    }
    window.addEventListener('lightning-flash', onLightningFlash)
    return () => window.removeEventListener('lightning-flash', onLightningFlash)
  }, [])

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

  return (
    <>
      {/* ── M13: First Contact cinematic overlay (lazy-loaded M20) ────────── */}
      {showFirstContact && (
        <Suspense fallback={null}>
          <FirstContactOverlay
            decoderName={decodedByName ?? 'Unknown'}
            onDone={() => setShowFirstContact(false)}
          />
        </Suspense>
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
          {/* M22: Time-of-day widget */}
          <TimeOfDayWidget />
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
          {/* ── M8: Weather widget ── */}
          <WeatherWidget state={weatherState} tempC={weatherTemp} />
          {/* ── M10 Track A: Season widget ── */}
          <SeasonWidget season={season} progress={seasonProgress} />
          {/* ── M29 Track B: Storm wind indicator ── */}
          {weatherState === 'STORM' && playerWeather && (
            <StormWindIndicator windDir={playerWeather.windDir} />
          )}
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
          {/* M37 Track C: Player title + name nameplate */}
          {(() => {
            const title = getEquippedTitle()
            const uname = getLocalUsername()
            return (
              <div style={{ marginBottom: 7, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontSize: 9, color: title.color, fontFamily: 'monospace', letterSpacing: 0.5, lineHeight: 1.2 }}>
                  [{title.name}]
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#e0d6c8', fontFamily: 'monospace', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {uname !== 'Unknown' ? uname : 'You'}
                </div>
              </div>
            )
          })()}
          <RustVitalBar value={health}      color="#c0392b" icon="♥" label="Health"   />
          <RustVitalBar value={1 - hunger}  color="#e67e22" icon="◆" label="Food"     />
          <RustVitalBar value={1 - thirst}  color="#2980b9" icon="~" label="Water"    />
          <RustVitalBar value={energy}      color="#27ae60" icon="⚡" label="Energy"  />
          <RustVitalBar value={1 - fatigue} color="#8e44ad" icon="●" label="Endurance" />
          {/* M29 Track B: Warmth bar */}
          <WarmthBar warmth={warmth} />
          {/* M38 Track B: Stamina bar */}
          <StaminaBar stamina={stamina} maxStamina={maxStamina} />

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
          {survivalTick >= 0 && cookingProgress.size > 0 && (() => {
            const progVals = Array.from(cookingProgress.values())
            const avgProg = progVals.reduce((a, b) => a + b, 0) / progVals.length
            return (
              <div style={{
                marginTop: 4, fontSize: 8, color: '#f39c12', letterSpacing: 1,
              }}>
                🔥 COOKING {cookingProgress.size}x {Math.round(avgProg / 8 * 100)}%
              </div>
            )
          })()}

          {/* M33 Track B: Active food buffs */}
          <ActiveBuffsBar tick={survivalTick} />

          {/* Gathering hint — show when player should gather */}
          {(() => {
            const anyStoneNearby = true // This would ideally check proximity, but we keep it simple
            const hasAnyTool = inventory.hasItemById(ITEM.STONE_TOOL) || inventory.hasItemById(ITEM.AXE)
            return !hasAnyTool ? (
              <div style={{
                marginTop: 4, fontSize: 8, color: '#f1b90a', letterSpacing: 1,
              }}>
                💡 [F] gather stone/wood to start crafting
              </div>
            ) : null
          })()}

          {/* Thirst hint — show when thirsty */}
          {(1 - thirst) < 0.3 ? (
            <div style={{
              marginTop: 4, fontSize: 8, color: '#6699cc', letterSpacing: 1,
            }}>
              💧 Find water to drink!
            </div>
          ) : null}

          {/* Sleep indicator (Slice 6) */}
          {isSleeping && (
            <div style={{
              marginTop: 4, fontSize: 8, color: '#8e44ad', letterSpacing: 1,
              animation: 'none',
            }}>
              💤 SLEEPING... [Z]=wake
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
          {/* M42 Track B: Shelter indicator */}
          <ShelterIndicator />
          {/* M42 Track B: Weather hazard warnings */}
          {(weatherState === 'ACID_RAIN' || weatherState === 'BLIZZARD') && (
            <div style={{
              marginTop: 3,
              fontSize: 8,
              fontFamily: 'monospace',
              letterSpacing: 1,
              color: weatherState === 'ACID_RAIN' ? '#aaff44' : '#aaddff',
              fontWeight: 700,
            }}>
              {weatherState === 'ACID_RAIN' ? '! ACID RAIN' : '! BLIZZARD'}
            </div>
          )}
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

        {/* ── M27 Track A: Skill XP bar + level-up flash ── */}
        <SkillXpBar />

        {/* ── M33 Track C: Chest loot popup ── */}
        <ChestLootPopup />

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

      {/* ── M24: Combat HUD (damage numbers, health bars, combat indicator) ── */}
      <CombatHUD />
      {/* ── M24: Tutorial onboarding overlay ── */}
      <TutorialOverlay />

      {/* ── Toast notifications ── */}
      <NotificationSystem />

      {/* ── M36 Track C: Building completion announcements ── */}
      <BuildingAnnouncementHUD />

      {/* ── M25: Mobile touch controls (joystick + action buttons) ── */}
      <MobileControls />

      {/* ── M26 Track B: Local player emote speech bubble ── */}
      {localEmoji && !emoteWheelOpen && (
        <div style={{
          position: 'fixed',
          bottom: 140,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ffffff',
          borderRadius: 20,
          padding: '6px 14px',
          fontSize: 32,
          lineHeight: 1,
          boxShadow: '0 2px 12px rgba(0,0,0,0.45)',
          pointerEvents: 'none',
          zIndex: 850,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Speech bubble tail
          filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.3))',
        }}>
          {localEmoji}
          {/* Tail */}
          <div style={{
            position: 'absolute',
            bottom: -10,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '10px solid #ffffff',
          }} />
        </div>
      )}

      {/* ── M26 Track B: Emote wheel (hold T) ── */}
      <EmoteWheel open={emoteWheelOpen} onClose={() => setEmoteWheelOpen(false)} />

      {/* ── M29 Track B: Lightning flash overlay ── */}
      {lightningFlash && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(255,255,255,0.8)',
          pointerEvents: 'none',
          zIndex: 2000,
          animation: 'lightningFlash 0.3s ease-out forwards',
        }} />
      )}

      {/* ── M29 Track C: Remote player name tags (HTML overlay) ── */}
      <RemotePlayerNameTagsOverlay />

      {/* ── M29 Track C4: Inspect player modal overlay ── */}
      <InspectPlayerOverlay />

      {/* ── M35 Track A: Player trade panel overlay ── */}
      <TradePanel />

      {/* ── M33 Track A: Quest tracker widget (bottom-right) ── */}
      <QuestTrackerWidget />

      {/* ── M34 Track A: Home indicator ── */}
      <HomeIndicatorWidget />

      {/* ── M35 Track C: Faction badge + settlement territory banner ── */}
      <FactionBadgeWidget />
      <SettlementTerritoryBanner />
      <RaidAlertBanner />

      {/* ── M34 Track B: World boss alerts ── */}
      <BossSpawnAlert />
      <BossKillAnnouncement />
      <BossHPBar />

      {/* ── M35 Track B: Disaster warning overlay ── */}
      <DisasterWarningOverlay />

      {/* ── M39 Track B: Party HUD + invite banner ── */}
      <PartyHUD />

      {/* ── M39 Track B: In-game chat box (bottom-left, above vitals) ── */}
      <ChatBox />

      {/* ── M39 Track B: Spectate mode (shown when player is dead) ── */}
      <SpectateMode />

      {/* ── M40 Track B: Spell hotbar + mana bar ── */}
      <Suspense fallback={null}>
        <SpellBar />
      </Suspense>

      {/* ── M44 Track C: Weather-spell interaction hint (shown below spell bar) ── */}
      <Suspense fallback={null}>
        <SpellWeatherHint />
      </Suspense>

      {/* ── M41 Track B: Mount HUD (shown when riding) ── */}
      <Suspense fallback={null}>
        <MountHUD />
      </Suspense>

      {/* ── M37 Track A: World event banner + indicator + history ── */}
      <WorldEventHUD />

      {/* ── M41 Track C: Seasonal festival banner + corner indicator ── */}
      <Suspense fallback={null}>
        <FestivalHUD />
      </Suspense>

      {/* ── M42 Track C: Reputation tier-change toast ── */}
      <Suspense fallback={null}>
        <ReputationToast />
      </Suspense>

      {/* ── M39 Track C: Civilization level-up and milestone banners ── */}
      <CivLevelUpBanner />
      <CivMilestoneBanner />

      {/* ── M44 Track A: Dungeon loot drop overlay ── */}
      <Suspense fallback={null}>
        <LootOverlay />
      </Suspense>

      {/* ── M32 Track C: Fast travel fade-to-black overlay ── */}
      <div style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        pointerEvents: 'none',
        zIndex: 3000,
        opacity: travelFading ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }} />
    </>
  )
}
