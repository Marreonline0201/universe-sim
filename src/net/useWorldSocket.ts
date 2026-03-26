// ── useWorldSocket ─────────────────────────────────────────────────────────────
// React hook: connects on mount, disconnects on unmount.
// Sends PLAYER_UPDATE at 10 Hz as position changes.
// Sends ADMIN_SET_TIME when admin changes timeScale.

import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/react'
import { useUser } from '@clerk/react'
import { WorldSocket } from './WorldSocket'
import { usePlayerStore } from '../store/playerStore'
import { useSkillStore } from '../store/skillStore'
import { skillSystem } from '../game/SkillSystem'
import { getEquippedTitle } from '../game/TitleSystem'
// M37 Track A: World event local timer (fires events when offline / single-player)
import { startLocalEventTimer, stopLocalEventTimer } from '../game/WorldEventSystem'

const WS_URL = import.meta.env.VITE_WS_URL as string | undefined
if (!WS_URL) console.warn('[WorldSocket] VITE_WS_URL is not set — multiplayer disabled')
const UPDATE_HZ = 10
const UPDATE_MS = 1000 / UPDATE_HZ

const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

// Module-level identity cache — avoids window global exposure
let _localUserId = 'player'
let _localUsername = 'Unknown'

/** Returns the authenticated user ID for the current session. */
export function getLocalUserId(): string { return _localUserId }
/** Returns the display username for the current session. */
export function getLocalUsername(): string { return _localUsername }

export function useWorldSocket(): void {
  const { userId: clerkUserId } = useAuth()
  const { user } = useUser()
  const socketRef = useRef<WorldSocket | null>(null)
  const lastUpdateRef = useRef(0)

  // In dev bypass mode use a stable local identity so the socket can connect
  const userId   = DEV_BYPASS ? 'dev-local' : clerkUserId
  const username = DEV_BYPASS ? 'DevUser' : (user?.username ?? user?.firstName ?? clerkUserId ?? 'unknown')

  useEffect(() => {
    // Skip if no WS URL configured or (in prod) not signed in
    if (!WS_URL || !userId) return
    if (!DEV_BYPASS && !user) return
    const socket = new WorldSocket(WS_URL, userId, username)
    socketRef.current = socket
    _adminSocket = socket
    socket.connect()

    // Cache identity in module-level variables for other components
    _localUserId   = userId
    _localUsername = username

    // Send player position updates at 10 Hz via rAF throttle
    let rafId: number
    function loop() {
      rafId = requestAnimationFrame(loop)
      const now = Date.now()
      if (now - lastUpdateRef.current < UPDATE_MS) return
      lastUpdateRef.current = now

      const { x, y, z, health, murderCount, gold } = usePlayerStore.getState()
      const prestigeCount = useSkillStore.getState().prestigeCount
      const skillIds = ['gathering', 'crafting', 'combat', 'survival', 'exploration', 'smithing', 'husbandry'] as const
      const totalLevel = skillIds.reduce((sum, id) => sum + skillSystem.getLevel(id), 0)
      const equippedTitle = getEquippedTitle()
      socket.send({
        type: 'PLAYER_UPDATE', x, y, z, health, murderCount, gold,
        totalLevel, prestigeCount,
        title: equippedTitle.name,
        titleColor: equippedTitle.color,
      })
    }
    rafId = requestAnimationFrame(loop)

    // When connected to server, server drives world events — stop local timer
    stopLocalEventTimer()

    return () => {
      cancelAnimationFrame(rafId)
      socket.destroy()
      socketRef.current = null
      _adminSocket = null
      // Restart local timer when disconnected
      startLocalEventTimer()
    }
  }, [userId, user])

  // Start local event timer when no server connection is available
  useEffect(() => {
    if (!WS_URL || !userId) {
      startLocalEventTimer()
      return stopLocalEventTimer
    }
    return undefined
  }, [userId])
}

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET as string | undefined

/** Call this from admin UI to push a time-scale change to all clients via server. */
export function sendAdminSetTime(timeScale: number, paused?: boolean): void {
  // Access the socket via a module-level ref so TimeControls can call this
  _adminSocket?.send({ type: 'ADMIN_SET_TIME', timeScale, paused, adminSecret: ADMIN_SECRET ?? '' })
}

// Module-level reference kept in sync by the hook
let _adminSocket: WorldSocket | null = null

/** Returns the active socket instance so non-hook code (SceneRoot game loop) can send messages. */
export function getWorldSocket(): WorldSocket | null {
  return _adminSocket
}
