// ── AgentBus ───────────────────────────────────────────────────────────────────
// In-memory registry for Claude subagent status and message log.
// Used by the POST /agent HTTP endpoint to track which domain agents are active
// and what messages they are sending to each other.

const MAX_MESSAGES = 100

const AGENT_IDS = [
  'director',
  'status-worker', 'gp-agent', 'knowledge-director',
  'cqa', 'car',
  'ui-worker', 'interaction', 'ai-npc',
  'physics-prof', 'chemistry-prof', 'biology-prof',
]

/** @type {Map<string, { status: string, task: string, lastSeen: number }>} */
const agents = new Map(
  AGENT_IDS.map(id => [id, { status: 'idle', task: '', lastSeen: 0 }])
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
  entry.status   = status ?? entry.status
  entry.task     = task    ?? entry.task
  entry.lastSeen = Date.now()

  if (message) {
    messages.unshift({ from: agentId, to: to ?? null, text: message, ts: Date.now() })
    if (messages.length > MAX_MESSAGES) messages.length = MAX_MESSAGES
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
