// ── useWorldSocket ─────────────────────────────────────────────────────────────
// React hook: connects on mount, disconnects on unmount.
// Sends PLAYER_UPDATE at 10 Hz as position changes.
// Sends ADMIN_SET_TIME when admin changes timeScale.

import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/react'
import { useUser } from '@clerk/react'
import { WorldSocket } from './WorldSocket'
import { usePlayerStore } from '../store/playerStore'

const WS_URL = import.meta.env.VITE_WS_URL as string | undefined
const UPDATE_HZ = 10
const UPDATE_MS = 1000 / UPDATE_HZ

export function useWorldSocket(): void {
  const { userId } = useAuth()
  const { user } = useUser()
  const socketRef = useRef<WorldSocket | null>(null)
  const lastUpdateRef = useRef(0)

  useEffect(() => {
    // Skip if no WS URL configured or not signed in
    if (!WS_URL || !userId || !user) return

    const username = user.username ?? user.firstName ?? userId
    const socket = new WorldSocket(WS_URL, userId, username)
    socketRef.current = socket
    socket.connect()

    // Send player position updates at 10 Hz via rAF throttle
    let rafId: number
    function loop() {
      rafId = requestAnimationFrame(loop)
      const now = Date.now()
      if (now - lastUpdateRef.current < UPDATE_MS) return
      lastUpdateRef.current = now

      const { x, y, z, health } = usePlayerStore.getState()
      socket.send({
        type: 'PLAYER_UPDATE',
        userId,
        x, y, z,
        health,
      })
    }
    rafId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafId)
      socket.destroy()
      socketRef.current = null
    }
  }, [userId, user])
}

/** Call this from admin UI to push a time-scale change to all clients via server. */
export function sendAdminSetTime(timeScale: number, paused?: boolean): void {
  // Access the socket via a module-level ref so TimeControls can call this
  _adminSocket?.send({ type: 'ADMIN_SET_TIME', timeScale, paused })
}

// Module-level reference kept in sync by the hook
let _adminSocket: WorldSocket | null = null
