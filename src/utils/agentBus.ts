// ── agentBus.ts ─────────────────────────────────────────────────────────────────
// Client-side utility for Claude subagents to report their status to the
// Railway server, which broadcasts it to the companion status site.
//
// Usage (from any Claude subagent or tool):
//   import { reportStatus } from '../utils/agentBus'
//   await reportStatus('chemistry', 'active', 'Adding H2SO4 reactions', 'Acid rain ready', 'biology')

export type AgentId = 'chemistry' | 'biology' | 'physics' | 'civilization' | 'ai' | 'world'
export type AgentStatus = 'active' | 'idle' | 'blocked' | 'done'

let _serverUrl: string | null = null

function getServerUrl(): string | null {
  if (_serverUrl) return _serverUrl
  // Derive HTTP base URL from VITE_WS_URL (ws://... → http://..., wss://... → https://...)
  const wsUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined
  if (!wsUrl) return null
  _serverUrl = wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/$/, '')
  return _serverUrl
}

/**
 * Report this agent's current status to the server.
 * Fire-and-forget — errors are silently swallowed so they never block agent work.
 *
 * @param agentId   - One of the 6 domain agents
 * @param status    - Current status
 * @param task      - What you're working on (short description)
 * @param message   - Optional message to appear in the feed
 * @param to        - Target agentId for directed messages (omit for broadcast)
 */
export async function reportStatus(
  agentId: AgentId,
  status: AgentStatus,
  task?: string,
  message?: string,
  to?: AgentId,
): Promise<void> {
  const base = getServerUrl()
  if (!base) return

  try {
    await fetch(`${base}/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, status, task, message, to }),
    })
  } catch {
    // Network unavailable — don't crash agent work
  }
}
