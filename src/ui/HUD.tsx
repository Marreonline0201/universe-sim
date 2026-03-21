import React, { useState, useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { useWeatherStore } from '../store/weatherStore'
import type { WeatherState } from '../store/weatherStore'
import { SidebarShell } from './SidebarShell'
import { NotificationSystem } from './NotificationSystem'
import { inventory } from '../game/GameSingletons'
import { MAT, ITEM } from '../player/Inventory'
import { cookingProgress } from '../game/SurvivalSystems'

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
        {Math.round(clamped * 100)}
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

// ── Main HUD ──────────────────────────────────────────────────────────────────

export function HUD() {
  const { paused, simTime, epoch } = useGameStore()
  const { health, hunger, thirst, energy, fatigue, ambientTemp, evolutionPoints, equippedSlot, equippedArmorSlot, equipArmor, unequipArmor, wounds, isSleeping, quenchSecondsRemaining } = usePlayerStore()
  const { connectionStatus, remotePlayers } = useMultiplayerStore()
  const weatherStore = useWeatherStore()
  const playerWeather = weatherStore.getPlayerWeather()
  const weatherState = playerWeather?.state ?? 'CLEAR'
  const weatherTemp  = playerWeather?.temperature ?? ambientTemp

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

  return (
    <>
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
