/**
 * SpectateMode — M39 Track B
 *
 * When the local player is dead (health === 0):
 * - Shows "Spectating [Nearest Player]" UI
 * - Dispatches __spectateTarget events so camera can follow target
 * - Left/Right arrow to switch between nearby players
 * - Shows spectated player's name, HP, activity
 * - "Respawn at Home" button (appears after 5 seconds)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '../store/playerStore'
import { useMultiplayerStore } from '../store/multiplayerStore'
import type { RemotePlayer } from '../store/multiplayerStore'

// Respawn: restore full vitals and teleport to home (or spawn)
function doRespawn() {
  const s = usePlayerStore.getState()
  s.updateVitals({ health: 1, hunger: 0, thirst: 0, energy: 1, fatigue: 0 })
  // Teleport to home position if set
  const home = s.homePosition
  if (home) {
    usePlayerStore.setState({ x: home[0], y: home[1], z: home[2] })
  } else {
    usePlayerStore.setState({ x: 0, y: 1, z: 0 })
  }
  window.dispatchEvent(new CustomEvent('__spectateTarget', { detail: null }))
}

const SPECTATE_RADIUS = 200  // only spectate players within 200m

function getDistance(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2)
}

export function SpectateMode() {
  const health      = usePlayerStore(s => s.health)
  const px          = usePlayerStore(s => s.x)
  const pz          = usePlayerStore(s => s.z)
  const remotePlayers = useMultiplayerStore(s => s.remotePlayers)

  const [spectateIndex, setSpectateIndex] = useState(0)
  const [canRespawn, setCanRespawn] = useState(false)
  const respawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDead = health <= 0

  // Build sorted list of nearby alive players
  const nearbyPlayers: RemotePlayer[] = []
  for (const p of remotePlayers.values()) {
    if (p.health > 0) {
      const d = getDistance(px, pz, p.x, p.z)
      if (d <= SPECTATE_RADIUS) {
        nearbyPlayers.push(p)
      }
    }
  }
  nearbyPlayers.sort((a, b) => {
    const da = getDistance(px, pz, a.x, a.z)
    const db = getDistance(px, pz, b.x, b.z)
    return da - db
  })

  const currentTarget = nearbyPlayers[spectateIndex % Math.max(1, nearbyPlayers.length)] ?? null

  // Notify camera system of spectate target
  useEffect(() => {
    if (!isDead) return
    window.dispatchEvent(new CustomEvent('__spectateTarget', {
      detail: currentTarget ? { userId: currentTarget.userId, x: currentTarget.x, y: currentTarget.y, z: currentTarget.z } : null
    }))
  }, [isDead, currentTarget?.userId])

  // Clamp index when list changes
  useEffect(() => {
    if (nearbyPlayers.length > 0) {
      setSpectateIndex(i => i % nearbyPlayers.length)
    }
  }, [nearbyPlayers.length])

  // Start respawn timer when player dies
  useEffect(() => {
    if (!isDead) {
      setCanRespawn(false)
      if (respawnTimerRef.current) clearTimeout(respawnTimerRef.current)
      return
    }
    setCanRespawn(false)
    respawnTimerRef.current = setTimeout(() => setCanRespawn(true), 5000)
    return () => { if (respawnTimerRef.current) clearTimeout(respawnTimerRef.current) }
  }, [isDead])

  // Arrow key navigation
  useEffect(() => {
    if (!isDead) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'ArrowLeft') {
        setSpectateIndex(i => Math.max(0, i - 1))
      } else if (e.code === 'ArrowRight') {
        setSpectateIndex(i => i + 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isDead])

  const handleRespawn = useCallback(() => {
    doRespawn()
  }, [])

  if (!isDead) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 600,
    }}>
      {/* Dark vignette when dead */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.2) 50%, rgba(80,0,0,0.5) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Dead / Spectating banner */}
      <div style={{
        position: 'absolute',
        top: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(231,76,60,0.6)',
        borderTop: '2px solid #e74c3c',
        borderRadius: 4,
        padding: '10px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        fontFamily: 'monospace',
        minWidth: 260,
      }}>
        <div style={{ fontSize: 11, color: '#e74c3c', letterSpacing: 3, fontWeight: 700 }}>
          YOU DIED
        </div>

        {currentTarget ? (
          <>
            <div style={{ fontSize: 10, color: '#aaa' }}>
              Spectating
            </div>
            <div style={{ fontSize: 13, color: '#e0d6c8', fontWeight: 700 }}>
              {currentTarget.title && (
                <span style={{ color: currentTarget.titleColor ?? '#aaa', fontSize: 10, marginRight: 4 }}>
                  [{currentTarget.title}]
                </span>
              )}
              {currentTarget.username}
            </div>
            {/* HP bar of spectated player */}
            <div style={{ width: 180, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.max(0, Math.min(1, currentTarget.health)) * 100}%`,
                height: '100%',
                background: currentTarget.health > 0.5 ? '#2ecc71' : currentTarget.health > 0.25 ? '#f39c12' : '#e74c3c',
                borderRadius: 2,
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: 8, color: '#888' }}>
              HP {Math.round(currentTarget.health * 100)}%
            </div>
            {nearbyPlayers.length > 1 && (
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                ← → to switch spectated player ({spectateIndex % nearbyPlayers.length + 1}/{nearbyPlayers.length})
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 10, color: '#888' }}>
            No nearby players to spectate
          </div>
        )}

        {canRespawn && (
          <button
            onClick={handleRespawn}
            style={{
              marginTop: 6,
              background: 'rgba(106,191,106,0.2)',
              border: '1px solid #6abf6a',
              borderRadius: 3,
              color: '#6abf6a',
              fontFamily: 'monospace',
              fontSize: 10,
              padding: '4px 16px',
              cursor: 'pointer',
              pointerEvents: 'auto',
              letterSpacing: 1,
            }}
          >
            Respawn at Home
          </button>
        )}
      </div>
    </div>
  )
}
