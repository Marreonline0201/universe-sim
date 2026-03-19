import React, { useEffect } from 'react'
import { useAuth } from '@clerk/react'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { TimeControls } from './TimeControls'

// ── Sub-components ────────────────────────────────────────────────────────────

interface VitalBarProps {
  value: number   // 0-1
  color: string
  label: string
  warning?: boolean
}

function VitalBar({ value, color, label, warning }: VitalBarProps) {
  const clampedValue = Math.max(0, Math.min(1, value))
  const barColor = warning && clampedValue < 0.25 ? '#e74c3c' : color

  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 9, color: '#aaa', marginBottom: 2, fontFamily: 'monospace',
      }}>
        <span>{label}</span>
        <span>{Math.round(clampedValue * 100)}%</span>
      </div>
      <div style={{
        width: 120, height: 5,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${clampedValue * 100}%`,
          height: '100%',
          background: barColor,
          borderRadius: 3,
          transition: 'width 0.3s ease, background 0.3s',
        }} />
      </div>
    </div>
  )
}

interface GoalBadgeProps { goal: string }
function GoalBadge({ goal }: GoalBadgeProps) {
  return (
    <div style={{
      marginTop: 8,
      padding: '2px 8px',
      background: 'rgba(52,152,219,0.2)',
      border: '1px solid rgba(52,152,219,0.5)',
      borderRadius: 10,
      fontSize: 10,
      color: '#3498db',
      fontFamily: 'monospace',
    }}>
      GOAL: {goal.replace(/_/g, ' ').toUpperCase()}
    </div>
  )
}

// ── Main HUD ──────────────────────────────────────────────────────────────────

export function HUD() {
  const { paused, simTime, epoch, setTimeScale } = useGameStore()
  const { health, hunger, thirst, energy, fatigue, evolutionPoints, currentGoal } = usePlayerStore()
  const { userId } = useAuth()
  const isAdmin = userId === import.meta.env.VITE_ADMIN_USER_ID

  // Non-admin clients poll world time scale every 10 seconds
  useEffect(() => {
    if (isAdmin) return
    const apply = () =>
      fetch('/api/world-settings')
        .then(r => r.json())
        .then(d => { if (typeof d.timeScale === 'number') setTimeScale(d.timeScale) })
        .catch(() => {})
    apply()
    const id = setInterval(apply, 10_000)
    return () => clearInterval(id)
  }, [isAdmin, setTimeScale])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      pointerEvents: 'none',
      fontFamily: 'monospace',
      color: '#fff',
      zIndex: 100,
    }}>
      {/* ── Top-left: vitals ── */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        pointerEvents: 'auto',
        background: 'rgba(0,0,0,0.65)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: '10px 14px',
        backdropFilter: 'blur(6px)',
        minWidth: 150,
      }}>
        <div style={{ fontSize: 10, color: '#555', marginBottom: 6, letterSpacing: 1 }}>VITALS</div>
        <VitalBar value={health}      color="#e74c3c" label="HEALTH"  warning />
        <VitalBar value={1 - hunger}  color="#f39c12" label="SATIETY" warning />
        <VitalBar value={1 - thirst}  color="#3498db" label="HYDRATION" warning />
        <VitalBar value={energy}      color="#2ecc71" label="ENERGY"  warning />
        <VitalBar value={1 - fatigue} color="#9b59b6" label="STAMINA" warning />

        <div style={{
          marginTop: 10,
          borderTop: '1px solid rgba(255,255,255,0.07)',
          paddingTop: 6,
          fontSize: 11,
          color: '#f1c40f',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}>
          <span style={{ opacity: 0.6, fontSize: 9 }}>EP</span>
          <span style={{ fontWeight: 'bold' }}>{evolutionPoints.toLocaleString()}</span>
        </div>

        <GoalBadge goal={currentGoal} />
      </div>

      {/* ── Top-right: clock + epoch ── */}
      <div style={{
        position: 'absolute',
        top: 16,
        right: 16,
        textAlign: 'right',
        pointerEvents: 'auto',
        background: 'rgba(0,0,0,0.65)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: '10px 14px',
        backdropFilter: 'blur(6px)',
      }}>
        <div style={{ fontSize: 10, color: '#888', letterSpacing: 2, marginBottom: 2 }}>
          {epoch.toUpperCase().replace(/_/g, ' ')}
        </div>
        <div style={{ fontSize: 20, fontWeight: 'bold', letterSpacing: 1 }}>{simTime}</div>
        {paused && (
          <div style={{
            marginTop: 4,
            fontSize: 11,
            color: '#e74c3c',
            fontWeight: 'bold',
            letterSpacing: 2,
          }}>
            PAUSED
          </div>
        )}
      </div>

      {/* ── Bottom-center: time controls (admin only) ── */}
      {isAdmin && (
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'auto',
        }}>
          <TimeControls />
        </div>
      )}
    </div>
  )
}
