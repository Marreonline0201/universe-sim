// ── CombatHUD.tsx ────────────────────────────────────────────────────────────
// M24 Track A: Combat indicator, floating damage numbers, enemy health bars.
// M38 Track B: Combo notifications, faction ability cooldown ring, no-stamina
//              flash, enemy status indicators (stun, burn, mark).
// Rendered as HTML overlay — positioned via screen-space projection of 3D coords.

import React, { useState, useEffect } from 'react'
import * as THREE from 'three'
import { combatSystem } from '../game/GameSingletons'
import { useFactionStore } from '../store/factionStore'
import { FACTIONS } from '../game/FactionSystem'

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
  const berserk = combatSystem.berserkState
  const noStamina = combatSystem.noStaminaFlashTimer > 0

  return (
    <>
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
          <span style={{ fontSize: 13 }}>⚔</span>
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

        {/* Combo counter — M38: shows at combo >= 2 with scaling color */}
        {combo >= 2 && (
          <span style={{
            color: combo >= 5 ? '#ef4444' : combo >= 3 ? '#f97316' : '#facc15',
            fontWeight: 700,
            fontSize: 12,
            textShadow: combo >= 3 ? '0 0 6px rgba(249,115,22,0.7)' : '0 0 4px rgba(249,115,22,0.5)',
          }}>
            COMBO x{combo}
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

        {/* M38: Berserk indicator */}
        {berserk.active && berserk.hitsRemaining > 0 && (
          <span style={{
            color: '#ef4444',
            fontWeight: 700,
            fontSize: 10,
            textShadow: '0 0 6px #ef4444',
          }}>
            BERSERK x{berserk.hitsRemaining}
          </span>
        )}
      </div>

      {/* M38: No Stamina flash — centered on screen */}
      {noStamina && (
        <div style={{
          position: 'fixed',
          top: '40%',
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#eab308',
          fontFamily: 'monospace',
          fontWeight: 700,
          fontSize: 16,
          textShadow: '0 0 8px #eab308, 0 0 16px #eab308',
          pointerEvents: 'none',
          zIndex: 200,
          opacity: Math.min(1, combatSystem.noStaminaFlashTimer / 0.5),
        }}>
          No Stamina!
        </div>
      )}
    </>
  )
}

// ── M38 Track B: Combo notification (above player center) ────────────────────

function ComboNotification() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 50)
    return () => clearInterval(iv)
  }, [])

  const notif = combatSystem.comboNotification
  if (!notif) return null

  const progress = notif.age / notif.maxAge
  const opacity = progress < 0.5 ? 1 : 1 - ((progress - 0.5) / 0.5)
  const yOffset = -progress * 40  // float upward

  return (
    <div style={{
      position: 'fixed',
      left: '50%',
      top: '35%',
      transform: `translate(-50%, ${yOffset}px)`,
      color: '#f97316',
      fontFamily: 'monospace',
      fontWeight: 900,
      fontSize: 22,
      textShadow: '0 0 10px #f97316, 0 0 20px rgba(249,115,22,0.5)',
      letterSpacing: 2,
      opacity,
      pointerEvents: 'none',
      zIndex: 150,
    }}>
      COMBO x{notif.count}!
    </div>
  )
}

// ── M38 Track B: Faction ability HUD (bottom-right) ──────────────────────────

function FactionAbilityHUD() {
  const [, setTick] = useState(0)
  const playerFaction = useFactionStore(s => s.playerFaction)

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 200)
    return () => clearInterval(iv)
  }, [])

  if (!playerFaction) return null

  const faction = FACTIONS[playerFaction]
  const ability = combatSystem.getFactionAbility(playerFaction)
  if (!ability) return null

  const cdPct = combatSystem.getFactionAbilityCooldownProgress(playerFaction)
  const ready = cdPct >= 1.0
  const cdSecsLeft = ready ? 0 : Math.ceil((ability.cooldownMs - (Date.now() - ability.lastUsedMs)) / 1000)

  // SVG cooldown ring — 40px circle
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const strokeDash = circumference * cdPct

  return (
    <div style={{
      position: 'fixed',
      bottom: 120,
      right: 20,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      pointerEvents: 'none',
      zIndex: 100,
    }}>
      {/* Ability icon with cooldown ring */}
      <div style={{ position: 'relative', width: 44, height: 44 }}>
        {/* Background circle */}
        <svg
          width={44} height={44}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <circle
            cx={22} cy={22} r={radius}
            fill="rgba(0,0,0,0.6)"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={2}
          />
          {/* Cooldown arc */}
          <circle
            cx={22} cy={22} r={radius}
            fill="none"
            stroke={ready ? faction.color : 'rgba(255,255,255,0.4)'}
            strokeWidth={3}
            strokeDasharray={`${strokeDash} ${circumference}`}
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
            style={{ transition: 'stroke-dasharray 0.2s linear' }}
          />
        </svg>
        {/* Faction icon */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 16,
          opacity: ready ? 1 : 0.5,
        }}>
          {faction.icon}
        </div>
      </div>

      {/* Key hint + ability name */}
      <div style={{
        fontFamily: 'monospace',
        fontSize: 9,
        color: ready ? faction.color : '#666',
        textAlign: 'center',
        lineHeight: 1.3,
      }}>
        <div>[X]</div>
        <div style={{ opacity: 0.7 }}>{ability.name}</div>
        {!ready && <div style={{ color: '#facc15' }}>{cdSecsLeft}s</div>}
      </div>
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

        // M31 Track C: CRIT! = bright yellow, 20px; combo = orange, 15px; normal = white, 14px
        const color = dn.isCritical ? '#facc15'
                    : dn.isCombo    ? '#f97316'
                    : '#ffffff'

        const fontSize = dn.isCritical ? 20 : (dn.isCombo ? 15 : 14)

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
            textShadow: dn.isCritical
              ? `0 0 8px ${color}, 0 0 16px ${color}, 0 1px 2px rgba(0,0,0,0.9)`
              : `0 0 4px ${color}, 0 1px 2px rgba(0,0,0,0.8)`,
            opacity,
            pointerEvents: 'none',
            transition: 'none',
          }}>
            {dn.isCritical ? 'CRIT! ' : ''}{dn.amount}
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

        // M38: enemy status icons
        const status = combatSystem.getEnemyStatus(bar.entityId)
        const isMarked = status ? status.markTimer > 0 : false
        const isStunned = status ? status.stunTimer > 0 : false
        const isBurning = status ? status.burnTimer > 0 : false
        const isConfused = status ? status.confuseTimer > 0 : false

        return (
          <div key={bar.entityId} style={{
            position: 'absolute',
            // Stack health bars vertically near top-center
            left: '50%',
            top: 60 + i * 26,
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            opacity: fadeOpacity,
          }}>
            {/* M38: Skull icon for marked enemy */}
            {isMarked && <span style={{ fontSize: 10, color: '#f97316' }}>☠</span>}
            <span style={{
              fontSize: 9,
              color: isMarked ? '#f97316' : '#aaa',
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
            {/* M38: Status effect icons */}
            {isStunned && <span style={{ fontSize: 9, color: '#38bdf8' }}>★</span>}
            {isBurning && <span style={{ fontSize: 9, color: '#f97316' }}>🔥</span>}
            {isConfused && <span style={{ fontSize: 9, color: '#a855f7' }}>?</span>}
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
      <ComboNotification />
      <FactionAbilityHUD />
      <DamageNumbers />
      <EnemyHealthBars />
    </>
  )
}
