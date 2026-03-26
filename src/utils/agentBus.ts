// ── agentBus.ts ─────────────────────────────────────────────────────────────────
// Client-side utility for Claude subagents to report their status to the
// Railway server, which broadcasts it to the companion status site.
//
// Usage (from any Claude subagent or tool):
//   import { reportStatus } from '../utils/agentBus'
//   await reportStatus('chemistry', 'active', 'Adding H2SO4 reactions', 'Acid rain ready', 'biology')

export type AgentId =
  | 'director'
  | 'status-worker' | 'gp-agent' | 'knowledge-director'
  | 'cqa' | 'car'
  | 'ui-worker' | 'interaction' | 'ai-npc'
  | 'physics-prof' | 'chemistry-prof' | 'biology-prof'
export type AgentStatus = 'active' | 'idle' | 'blocked' | 'done'

let _serverUrl: string | null = null

function getServerUrl(): string | null {
  if (_serverUrl) return _serverUrl
  // Support both Vite browser context (import.meta.env) and Node.js/Claude Code agent context (process.env)
  const wsUrl =
    (import.meta as any).env?.VITE_WS_URL as string | undefined ||
    (typeof process !== 'undefined' ? process.env?.VITE_WS_URL : undefined)
  if (wsUrl) {
    _serverUrl = wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/$/, '')
    return _serverUrl
  }
  // Fallback: direct HTTP URL for Node.js agents
  const httpUrl =
    (typeof process !== 'undefined' ? process.env?.AGENT_BUS_URL : undefined)
  if (httpUrl) {
    _serverUrl = httpUrl.replace(/\/$/, '')
    return _serverUrl
  }
  return null
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

/**
 * Poll the server for an approval/rejection decision from the user's phone.
 * Call this after reportStatus(agentId, 'blocked', ...) to wait for user input.
 *
 * Returns 'approved', 'rejected', or null (no decision yet).
 * The result is consumed once — a second call returns null until the user taps again.
 *
 * @example
 * await reportStatus('gp-agent', 'blocked', 'Needs permission to delete saves')
 * let approval = null
 * while (!approval) {
 *   await new Promise(r => setTimeout(r, 5000))
 *   approval = await checkApproval('gp-agent')
 * }
 * if (approval === 'approved') { ... }
 */
export async function checkApproval(agentId: AgentId): Promise<'approved' | 'rejected' | null> {
  const base = getServerUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}/agent-approval?agentId=${agentId}`)
    const data = await res.json() as { approval: 'approved' | 'rejected' | null }
    return data.approval ?? null
  } catch {
    return null
  }
}
