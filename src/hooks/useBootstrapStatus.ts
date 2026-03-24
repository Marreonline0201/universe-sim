// ── useBootstrapStatus ─────────────────────────────────────────────────────────
// Polls the Railway server's /status endpoint (no auth required) to determine
// whether the world is still bootstrapping. Updates every 2 seconds.

import { useState, useEffect, useRef } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL as string | undefined

function wsToHttp(wsUrl: string): string {
  const http = wsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
  return http.replace(/\/+$/, '')
}

export interface BootstrapStatus {
  /** True while the world is forming (players cannot join) */
  bootstrapping: boolean
  /** 0-1 progress toward bootstrap completion */
  progress: number
  /** Current cosmological epoch string */
  epoch: string
  /** Current sim time in seconds */
  simTime: number
  /** Number of seconds the bootstrap has been running */
  elapsedSec: number
  /** Whether we've received at least one response from the server */
  resolved: boolean
}

export function useBootstrapStatus(): BootstrapStatus {
  const [state, setState] = useState<BootstrapStatus>({
    bootstrapping: false,
    progress: 0,
    epoch: 'stellar',
    simTime: 0,
    elapsedSec: 0,
    resolved: false,
  })

  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!WS_URL) {
      // No server configured — assume world is ready
      setState(s => ({ ...s, resolved: true, bootstrapping: false }))
      return
    }

    const baseUrl = wsToHttp(WS_URL)

    async function poll() {
      try {
        const res = await fetch(`${baseUrl}/status`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()

        const bootstrapping = !!data.bootstrapPhase
        if (bootstrapping && startRef.current === null) startRef.current = Date.now()
        if (!bootstrapping) startRef.current = null

        const elapsedSec = startRef.current ? (Date.now() - startRef.current) / 1000 : 0

        setState({
          bootstrapping,
          progress:   data.bootstrapProgress ?? 0,
          epoch:      data.epoch ?? 'stellar',
          simTime:    data.simTime ?? 0,
          elapsedSec,
          resolved:   true,
        })
      } catch {
        // Server unreachable — assume ready (don't block players)
        setState(s => ({ ...s, resolved: true, bootstrapping: false }))
      }
    }

    poll()
    const id = setInterval(poll, 2_000)
    return () => clearInterval(id)
  }, [])

  // Update elapsedSec every second while bootstrapping
  useEffect(() => {
    if (!state.bootstrapping || startRef.current === null) return
    const id = setInterval(() => {
      setState(s => ({
        ...s,
        elapsedSec: startRef.current ? (Date.now() - startRef.current) / 1000 : 0,
      }))
    }, 1_000)
    return () => clearInterval(id)
  }, [state.bootstrapping])

  return state
}
