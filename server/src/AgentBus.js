// ── AgentBus ───────────────────────────────────────────────────────────────────
// In-memory registry for Claude subagent status and message log.
// Used by the POST /agent HTTP endpoint to track which domain agents are active
// and what messages they are sending to each other.

const MAX_MESSAGES = 100

// Debug log: captures recent director → active transitions with call stacks
const directorActivationLog = []
export function getDirectorActivationLog() { return [...directorActivationLog] }

// One-shot request context for debug logging (set by HTTP handler before calling updateAgent)
let _nextReqCtx = null
export function setNextRequestContext(ctx) { _nextReqCtx = ctx }

const AGENT_IDS = [
  'director',
  'status-worker', 'gp-agent', 'knowledge-director',
  'cqa', 'car',
  'ui-worker', 'interaction', 'ai-npc',
  'physics-prof', 'chemistry-prof', 'biology-prof',
]

/** @type {Map<string, { status: string, task: string, lastSeen: number, lastMessage: number }>} */
const agents = new Map(
  AGENT_IDS.map(id => [id, { status: 'idle', task: '', lastSeen: 0, lastMessage: 0 }])
)

/** @type {Array<{ from: string, to: string|null, text: string, ts: number }>} */
const messages = []

/**
 * Update an agent's status and optionally append a message.
 * Returns the full state snapshot.
 *
 * @param {string} agentId
 * @param {string} status - 'active' | 'idle' | 'blocked' | 'done'
 * @param {string} [task]
 * @param {string} [message]
 * @param {string} [to] - target agentId for directed messages
 */
export function updateAgent(agentId, status, task, message, to) {
  if (!agents.has(agentId)) {
    agents.set(agentId, { status: 'idle', task: '', lastSeen: 0 })
  }

  const entry = agents.get(agentId)
  const prevStatus = entry.status

  // Debug: capture stack trace whenever director becomes active so we can find the source
  if (agentId === 'director' && status === 'active' && prevStatus !== 'active') {
    const stack = new Error().stack ?? '(no stack)'
    const reqCtx = _nextReqCtx; _nextReqCtx = null
    const entry = { ts: Date.now(), prevStatus, stack, ip: reqCtx?.ip, xff: reqCtx?.xff, ua: reqCtx?.ua }
    console.log(`[AgentBus] director → active | ip=${entry.ip} xff=${entry.xff} ua=${entry.ua} | stack:\n${stack}`)
    directorActivationLog.unshift(entry)
    if (directorActivationLog.length > 20) directorActivationLog.length = 20
  }

  entry.status   = status ?? entry.status
  entry.task     = task    ?? entry.task
  entry.lastSeen = Date.now()

  // When going idle/done, purge this agent's heartbeat messages from the feed
  if ((status === 'idle' || status === 'done') && prevStatus !== 'idle') {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].from === agentId && messages[i].heartbeat) {
        messages.splice(i, 1)
      }
    }
  }

  if (message) {
    messages.unshift({ from: agentId, to: to ?? null, text: message, ts: Date.now() })
    if (messages.length > MAX_MESSAGES) messages.length = MAX_MESSAGES
    entry.lastMessage = Date.now()
  }

  return getState()
}

/**
 * Mark an agent as idle (called on timeout / cleanup).
 * @param {string} agentId
 */
export function resetAgent(agentId) {
  if (agents.has(agentId)) {
    agents.get(agentId).status = 'idle'
  }
}

// ── Approval store ─────────────────────────────────────────────────────────────
// Telegram approve/reject buttons write here; agents poll GET /agent-approval.

/** @type {Map<string, 'approved'|'rejected'>} */
const approvals = new Map()

/** Called by Telegram webhook handler when user taps Approve. */
export function approveAgent(agentId) { approvals.set(agentId, 'approved') }

/** Called by Telegram webhook handler when user taps Reject. */
export function rejectAgent(agentId)  { approvals.set(agentId, 'rejected') }

/**
 * Returns and clears the approval decision for an agent (consume-once).
 * Returns null if no decision yet.
 * @param {string} agentId
 * @returns {'approved'|'rejected'|null}
 */
export function checkApproval(agentId) {
  const result = approvals.get(agentId) ?? null
  if (result) approvals.delete(agentId)
  return result
}

/**
 * Returns the full serializable state.
 */
export function getState() {
  const agentsObj = {}
  for (const [id, data] of agents.entries()) {
    agentsObj[id] = { ...data }
  }
  return { agents: agentsObj, messages: messages.slice(0, 20) }
}

// ── Auto-idle timeout ───────────────────────────────────────────────────────
// 'done' agents clear after 30s (they've finished, just need to flush the UI).
// 'active'/'blocked' agents clear after 3 min (complex work can be slow).
const DONE_TIMEOUT_MS   = 30 * 1000
const ACTIVE_TIMEOUT_MS = 3 * 60 * 1000

/**
 * Inject "still working…" heartbeat messages for active agents that haven't
 * sent a message in 60 seconds. Returns true if any messages were added.
 */
export function tickHeartbeats() {
  const now = Date.now()
  const HEARTBEAT_INTERVAL = 60 * 1000
  let changed = false
  for (const [id, entry] of agents.entries()) {
    if (entry.status !== 'active' && entry.status !== 'blocked') continue
    if (entry.lastSeen === 0) continue
    if (now - entry.lastMessage > HEARTBEAT_INTERVAL) {
      const text = entry.status === 'blocked'
        ? `⏳ Waiting for approval — ${entry.task || 'blocked'}`
        : `⚙ Still working — ${entry.task || 'in progress'}`
      // Replace existing heartbeat from this agent instead of spamming a new entry
      const existingIdx = messages.findIndex(m => m.from === id && m.heartbeat)
      if (existingIdx >= 0) {
        messages[existingIdx] = { from: id, to: null, text, ts: now, heartbeat: true }
      } else {
        messages.unshift({ from: id, to: null, text, ts: now, heartbeat: true })
        if (messages.length > MAX_MESSAGES) messages.length = MAX_MESSAGES
      }
      entry.lastMessage = now
      changed = true
    }
  }
  return changed
}

/**
 * Reset any agent that hasn't checked in within its status-appropriate timeout.
 * Returns list of agents that went idle (so caller can send Telegram notifications).
 */
export function tickIdleTimeout() {
  const now = Date.now()
  const wentIdle = []
  for (const [id, entry] of agents.entries()) {
    if (entry.status === 'idle' || entry.lastSeen === 0) continue
    const timeout = entry.status === 'done' ? DONE_TIMEOUT_MS : ACTIVE_TIMEOUT_MS
    if (now - entry.lastSeen > timeout) {
      wentIdle.push({ id, prevStatus: entry.status, task: entry.task })
      entry.status = 'idle'
      entry.task   = ''
    }
  }
  return wentIdle
}

/**
 * Returns all currently blocked agents (waiting for approval).
 */
export function getBlockedAgents() {
  const blocked = []
  for (const [id, entry] of agents.entries()) {
    if (entry.status === 'blocked') blocked.push({ id, task: entry.task })
  }
  return blocked
}
