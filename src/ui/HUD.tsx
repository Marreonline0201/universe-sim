import React from 'react'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { SidebarShell } from './SidebarShell'
import { NotificationSystem } from './NotificationSystem'

const RUST_ORANGE = '#cd4420'

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

// ── Hotbar slot ────────────────────────────────────────────────────────────────

interface HotbarSlotProps {
  index: number
  active?: boolean
}

function HotbarSlot({ index, active }: HotbarSlotProps) {
  return (
    <div style={{
      width: 52,
      height: 52,
      background: active ? 'rgba(205,68,32,0.18)' : 'rgba(0,0,0,0.6)',
      border: active ? `1px solid ${RUST_ORANGE}` : '1px solid rgba(255,255,255,0.15)',
      borderRadius: 3,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 3,
      boxShadow: active ? `0 0 6px rgba(205,68,32,0.5)` : 'none',
      position: 'relative',
    }}>
      <span style={{
        fontSize: 9,
        color: active ? RUST_ORANGE : 'rgba(255,255,255,0.3)',
        fontFamily: 'monospace',
        fontWeight: active ? 700 : 400,
      }}>
        {index + 1}
      </span>
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
  const { health, hunger, thirst, energy, fatigue, ambientTemp, evolutionPoints } = usePlayerStore()
  const { connectionStatus, remotePlayers } = useMultiplayerStore()

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
          right: 64,
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
            <HotbarSlot key={i} index={i} active={i === 0} />
          ))}
        </div>

      </div>

      {/* ── Sidebar panels + icon strip ── */}
      <SidebarShell />

      {/* ── Toast notifications ── */}
      <NotificationSystem />
    </>
  )
}
