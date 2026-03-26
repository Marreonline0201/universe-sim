// ── CombatHUD.tsx ────────────────────────────────────────────────────────────
// M24 Track A: Combat indicator, floating damage numbers, enemy health bars.
// Rendered as HTML overlay — positioned via screen-space projection of 3D coords.

import React, { useState, useEffect } from 'react'
import * as THREE from 'three'
import { combatSystem } from '../game/GameSingletons'

// ── Module-level camera ref — set by CombatCameraSync inside the R3F canvas ─
// This lets the HTML overlay project world-space positions to screen-space.
let _combatCamera: THREE.Camera | null = null
export function setCombatCamera(cam: THREE.Camera | null): void {
  _combatCamera = cam
}

const _projVec = new THREE.Vector3()
function worldToScreen(x: number, y: number, z: number): { sx: number; sy: number } | null {
  if (!_combatCamera) return null
  _projVec.set(x, y, z).project(_combatCamera)
  const sx = (_projVec.x * 0.5 + 0.5) * window.innerWidth
  const sy = (-_projVec.y * 0.5 + 0.5) * window.innerHeight
  // Discard if behind camera
  if (_projVec.z > 1) return null
  return { sx, sy }
}

// ── Combat indicator (bottom-center) ─────────────────────────────────────────
// Shows: current weapon cooldown arc, combo counter, dodge cooldown.
// Only visible when player has attacked in last 10s.

function CombatIndicator() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 100)
    return () => clearInterval(iv)
  }, [])

  if (!combatSystem.isInCombat) return null

  const cooldownPct = combatSystem.cooldownProgress
  const combo = combatSystem.combo
  const dodgePct = combatSystem.dodgeCooldownProgress
  const isDodging = combatSystem.isDodging
  const isBlocking = combatSystem.isBlocking

  return (
    <div style={{
      position: 'fixed',
      bottom: 90,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'rgba(0,0,0,0.6)',
      borderRadius: 6,
      padding: '4px 10px',
      border: '1px solid rgba(255,255,255,0.15)',
      pointerEvents: 'none',
      zIndex: 100,
      fontFamily: 'monospace',
      fontSize: 11,
      color: '#ccc',
    }}>
      {/* Attack cooldown bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 13 }}>*</span>
        <div style={{
          width: 40,
          height: 4,
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${cooldownPct * 100}%`,
            height: '100%',
            background: cooldownPct >= 1 ? '#4ade80' : '#facc15',
            borderRadius: 2,
            transition: 'width 0.05s linear',
          }} />
        </div>
      </div>

      {/* Combo counter */}
      {combo >= 2 && (
        <span style={{
          color: combo >= 3 ? '#f97316' : '#facc15',
          fontWeight: 700,
          fontSize: 12,
          textShadow: '0 0 4px rgba(249,115,22,0.5)',
        }}>
          x{combo}
        </span>
      )}

      {/* Dodge indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 9, opacity: 0.6 }}>DGE</span>
        <div style={{
          width: 24,
          height: 3,
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${dodgePct * 100}%`,
            height: '100%',
            background: isDodging ? '#38bdf8' : (dodgePct >= 1 ? '#4ade80' : '#64748b'),
            borderRadius: 2,
          }} />
        </div>
      </div>

      {/* Block indicator */}
      {isBlocking && (
        <span style={{
          color: '#38bdf8',
          fontWeight: 700,
          fontSize: 10,
        }}>
          BLK
        </span>
      )}
    </div>
  )
}

// ── Floating damage numbers (screen-space overlay) ──────────────────────────

function DamageNumbers() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(iv)
  }, [])

  const numbers = combatSystem.damageNumbers

  if (numbers.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: 'none',
      zIndex: 99,
    }}>
      {numbers.map(dn => {
        const progress = dn.age / dn.maxAge
        const opacity = 1 - progress
        // Rise upward from spawn point over lifetime
        const yOffset = -progress * 60  // rise 60px over lifetime

        // Color: white normal, yellow combo, red critical
        const color = dn.isCritical ? '#ef4444'
                    : dn.isCombo    ? '#facc15'
                    : '#ffffff'

        const fontSize = dn.isCritical ? 18 : (dn.isCombo ? 15 : 13)

        // Project world position to screen coords; fall back to screen center
        const screen = worldToScreen(dn.x, dn.y, dn.z)
        const left = screen ? screen.sx : window.innerWidth * 0.5
        const top  = screen ? screen.sy : window.innerHeight * 0.4

        return (
          <div key={dn.id} style={{
            position: 'absolute',
            left,
            top,
            transform: `translate(-50%, ${yOffset}px)`,
            color,
            fontSize,
            fontWeight: 700,
            fontFamily: 'monospace',
            textShadow: `0 0 4px ${color}, 0 1px 2px rgba(0,0,0,0.8)`,
            opacity,
            pointerEvents: 'none',
            transition: 'none',
          }}>
            {dn.isCritical ? 'CRIT ' : ''}{dn.amount}
          </div>
        )
      })}
    </div>
  )
}

// ── Enemy health bars (screen-space overlay) ────────────────────────────────

function EnemyHealthBars() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 100)
    return () => clearInterval(iv)
  }, [])

  const bars = Array.from(combatSystem.enemyHealthBars.values())

  if (bars.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: 'none',
      zIndex: 98,
    }}>
      {bars.slice(0, 10).map((bar, i) => {
        const hpPct = Math.max(0, bar.health / bar.maxHealth)
        const barColor = hpPct > 0.5 ? '#4ade80' : hpPct > 0.25 ? '#facc15' : '#ef4444'
        const timeSinceHit = Date.now() - bar.lastDamageTime
        const fadeOpacity = Math.max(0, 1 - (timeSinceHit / 5000))

        return (
          <div key={bar.entityId} style={{
            position: 'absolute',
            // Stack health bars vertically near top-center
            left: '50%',
            top: 60 + i * 22,
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            opacity: fadeOpacity,
          }}>
            <span style={{
              fontSize: 9,
              color: '#aaa',
              fontFamily: 'monospace',
              textTransform: 'capitalize',
            }}>
              {bar.species}
            </span>
            <div style={{
              width: 60,
              height: 4,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${hpPct * 100}%`,
                height: '100%',
                background: barColor,
                borderRadius: 2,
                transition: 'width 0.2s ease',
              }} />
            </div>
            <span style={{
              fontSize: 8,
              color: '#888',
              fontFamily: 'monospace',
            }}>
              {Math.ceil(bar.health)}/{bar.maxHealth}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Combined export ─────────────────────────────────────────────────────────

export function CombatHUD() {
  return (
    <>
      <CombatIndicator />
      <DamageNumbers />
      <EnemyHealthBars />
    </>
  )
}
