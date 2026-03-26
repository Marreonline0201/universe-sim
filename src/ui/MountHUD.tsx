import React from 'react'
import { useMountStore } from '../store/mountStore'

export function MountHUD() {
  const mountedAnimalId = useMountStore(s => s.mountedAnimalId)
  const mountName       = useMountStore(s => s.mountName)
  const mountHealth     = useMountStore(s => s.mountHealth)
  const mountMaxHealth  = useMountStore(s => s.mountMaxHealth)
  const mountStamina    = useMountStore(s => s.mountStamina)
  const isGalloping     = useMountStore(s => s.isGalloping)

  if (mountedAnimalId === null) return null

  const hpPct   = mountMaxHealth > 0 ? mountHealth / mountMaxHealth : 0
  const stamPct = mountStamina / 100

  const BAR_TOTAL  = 10
  const hpFill     = Math.round(hpPct * BAR_TOTAL)
  const stamFill   = Math.round(stamPct * BAR_TOTAL)
  const hpBar      = '█'.repeat(hpFill) + '░'.repeat(BAR_TOTAL - hpFill)
  const stamBar    = '█'.repeat(stamFill) + '░'.repeat(BAR_TOTAL - stamFill)

  return (
    <div style={{
      position: 'fixed',
      bottom: 120,
      left: 20,
      zIndex: 300,
      background: 'rgba(8, 6, 2, 0.82)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 6,
      padding: '8px 14px',
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#e0d8c8',
      pointerEvents: 'none',
      minWidth: 240,
    }}>
      {/* Mount name header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ color: '#f1c40f', fontWeight: 700, fontSize: 13 }}>
          [{mountName}]
        </span>
        {isGalloping && (
          <span style={{ color: '#f39c12', fontWeight: 900, fontSize: 11, letterSpacing: 2 }}>
            GALLOPING
          </span>
        )}
      </div>

      {/* HP bar */}
      <div style={{ marginBottom: 3 }}>
        <span style={{ color: '#e74c3c', marginRight: 4 }}>HP</span>
        <span style={{ color: '#e74c3c' }}>{hpBar}</span>
        <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 4, fontSize: 10 }}>
          {Math.round(mountHealth)}/{Math.round(mountMaxHealth)}
        </span>
      </div>

      {/* Stamina bar */}
      <div style={{ marginBottom: 5 }}>
        <span style={{ color: '#2ecc71', marginRight: 4 }}>ST</span>
        <span style={{ color: '#2ecc71' }}>{stamBar}</span>
        <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 4, fontSize: 10 }}>
          {Math.round(mountStamina)}/100
        </span>
      </div>

      {/* Hint */}
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 1 }}>
        [R] Dismount  [SHIFT] Gallop
      </div>
    </div>
  )
}
