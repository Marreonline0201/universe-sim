// ── DungeonFloorHUD.tsx ───────────────────────────────────────────────────────
// M47 Track C: Dungeon Floor HUD
//
// Displays the current dungeon floor number, enemy count, boss indicator,
// and loot multiplier. Shown only when the player is underground.
// Includes an "ADVANCE FLOOR" button (enabled when the boss/mini-boss is dead).

import React, { useEffect, useState } from 'react'
import { useCaveStore } from '../store/caveStore'
import { useDungeonStore } from '../store/dungeonStore'
import { generateFloor } from '../game/DungeonFloorSystem'

export function DungeonFloorHUD() {
  const underground = useCaveStore(s => s.underground)
  const currentFloor = useDungeonStore(s => s.currentFloor)
  const miniBossAlive = useDungeonStore(s => s.miniBossAlive)
  const advanceFloor = useDungeonStore(s => s.advanceFloor)
  const [lastEventFloor, setLastEventFloor] = useState(currentFloor)
  const [flashNew, setFlashNew] = useState(false)

  // Listen for floor-advanced events so the HUD briefly flashes
  useEffect(() => {
    function onFloorAdvanced(e: Event) {
      const detail = (e as CustomEvent).detail as { floor: number }
      setLastEventFloor(detail.floor)
      setFlashNew(true)
      const t = setTimeout(() => setFlashNew(false), 1500)
      return () => clearTimeout(t)
    }
    window.addEventListener('dungeon-floor-advanced', onFloorAdvanced)
    return () => window.removeEventListener('dungeon-floor-advanced', onFloorAdvanced)
  }, [])

  if (!underground) return null

  const floorData = generateFloor(currentFloor)
  const canAdvance = !miniBossAlive  // floor is cleared when no active mini-boss/boss

  const borderColor = flashNew ? '#ef4444' : 'rgba(200,50,50,0.5)'
  const bgColor = 'rgba(10,0,0,0.82)'

  return (
    <div style={{
      position: 'fixed',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 8,
      padding: '6px 18px',
      pointerEvents: 'auto',
      zIndex: 120,
      fontFamily: 'monospace',
      minWidth: 200,
      boxShadow: flashNew ? '0 0 14px rgba(239,68,68,0.7)' : '0 2px 8px rgba(0,0,0,0.6)',
      transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
    }}>
      {/* Floor label */}
      <div style={{
        fontSize: 11,
        color: '#ef4444',
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: 'uppercase',
      }}>
        Dungeon
      </div>

      {/* Floor number */}
      <div style={{
        fontSize: 18,
        fontWeight: 900,
        color: flashNew ? '#ef4444' : '#fff',
        letterSpacing: 1,
        lineHeight: 1,
        transition: 'color 0.3s ease',
      }}>
        FLOOR {currentFloor} <span style={{ color: '#666', fontSize: 13 }}>of ∞</span>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex',
        gap: 12,
        fontSize: 10,
        color: '#aaa',
        marginTop: 2,
      }}>
        <span title="Enemies on this floor">
          <span style={{ color: '#f97316' }}>⚔</span> {floorData.enemyCount} enemies
        </span>
        {floorData.hasMiniboss && (
          <span title="Mini-boss present" style={{ color: '#a855f7' }}>
            ★ Miniboss
          </span>
        )}
        {floorData.hasBoss && (
          <span title="Boss floor!" style={{ color: '#ef4444' }}>
            ☠ BOSS
          </span>
        )}
        <span title="Loot multiplier" style={{ color: '#facc15' }}>
          ×{floorData.lootMultiplier} loot
        </span>
      </div>

      {/* Advance button */}
      <button
        onClick={canAdvance ? advanceFloor : undefined}
        disabled={!canAdvance}
        style={{
          marginTop: 4,
          padding: '3px 14px',
          fontSize: 10,
          fontFamily: 'monospace',
          fontWeight: 700,
          letterSpacing: 1,
          background: canAdvance ? 'rgba(180,30,30,0.85)' : 'rgba(60,20,20,0.6)',
          color: canAdvance ? '#fff' : '#666',
          border: `1px solid ${canAdvance ? '#ef4444' : '#440000'}`,
          borderRadius: 4,
          cursor: canAdvance ? 'pointer' : 'not-allowed',
          textTransform: 'uppercase',
          transition: 'background 0.2s',
        }}
      >
        {canAdvance ? 'ADVANCE FLOOR ▶' : 'Defeat all enemies first'}
      </button>
    </div>
  )
}
