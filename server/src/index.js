// ── Universe Sim WebSocket Server ──────────────────────────────────────────────
// Railway always-on Node.js process. Owns the authoritative world clock.
// Broadcasts WorldSnapshot to all connected clients at 10 Hz.

import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { WorldClock } from './WorldClock.js'
import { PlayerRegistry, migrateShelterSchema } from './PlayerRegistry.js'
import { BroadcastScheduler } from './BroadcastScheduler.js'
import { loadSettings, saveSettings, migrateSchema } from './WorldSettingsSync.js'
import { BOOTSTRAP_TARGET_SECS, NORMAL_TIMESCALE } from './WorldClock.js'
import { SlackAgent } from './SlackAgent.js'
import { NodeStateSync } from './NodeStateSync.js'
import { SettlementManager, TERRITORY_RADIUS } from './SettlementManager.js'
import { WeatherSystem } from './WeatherSystem.js'
import { SeasonSystem } from './SeasonSystem.js'
import { TradeEconomy } from './TradeEconomy.js'
import { migrateSchema as migrateDiscoverySchema, recordDecode, recordProbe } from './DiscoveryDb.js'
import { UniverseRegistry } from './UniverseRegistry.js'
import * as AgentBus from './AgentBus.js'
import * as Telegram from './TelegramAgent.js'
import Anthropic from '@anthropic-ai/sdk'
import { DiscordBot } from './DiscordBot.js'
import { OrganismManager } from './OrganismManager.js'

// ── Pending agent launch triggers (queued from Telegram, consumed by Claude Code) ──
const pendingTriggers = [] // Array<{ agentId, queuedAt }>
export function queueTrigger(agentId) {
  if (!pendingTriggers.find(t => t.agentId === agentId)) {
    pendingTriggers.push({ agentId, queuedAt: Date.now() })
  }
}
export function consumeTriggers() {
  return pendingTriggers.splice(0, pendingTriggers.length)
}

// ── Telegram conversation history (per chat_id, in-memory, last 20 turns) ────
const telegramHistory = new Map() // chatId → Array<{role, content}>
const MAX_HISTORY = 20
function getTelegramHistory(chatId) {
  if (!telegramHistory.has(chatId)) telegramHistory.set(chatId, [])
  return telegramHistory.get(chatId)
}
function pushTelegramHistory(chatId, role, content) {
  const h = getTelegramHistory(chatId)
  h.push({ role, content })
  if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY)
}

const PORT = parseInt(process.env.PORT ?? '8080', 10)
const PERSIST_INTERVAL_MS = 30_000 // save simTime to DB every 30 s

// Admin secret — must match VITE_ADMIN_SECRET on the client.
// Set in Railway env; unset = admin commands disabled.
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? null
const HOME_WORLD_SEED = parseInt(process.env.HOME_WORLD_SEED ?? '42', 10)

// ── Bootstrap ──────────────────────────────────────────────────────────────────

const clock    = new WorldClock()
const players  = new PlayerRegistry(HOME_WORLD_SEED)
const scheduler = new BroadcastScheduler(clock, players, null, HOME_WORLD_SEED)
const slack       = new SlackAgent(clock, players, null)
const nodeSync    = new NodeStateSync()
const settlements = new SettlementManager()
const weather     = new WeatherSystem()
const seasons     = new SeasonSystem()
const tradeEcon   = new TradeEconomy()
const universeReg = new UniverseRegistry()  // M14: multiverse registry
const organisms  = new OrganismManager()    // M_bio: server-authoritative biology

async function main() {
  // Wire world seed to settlements before any load() so geology-based
  // specialty assignment uses the correct tectonic plate map.
  settlements.setWorldSeed(HOME_WORLD_SEED)

  // Ensure DB schema is current
  if (process.env.DATABASE_URL) {
    await migrateSchema()
    await migrateShelterSchema()
    await nodeSync.migrateSchema()
    await nodeSync.load()
    await settlements.migrateSchema()
    await settlements.load()
    await tradeEcon.migrateSchema()
    await tradeEcon.load(settlements.getAll())
    await migrateDiscoverySchema()  // M13: discoveries + planets tables
    await universeReg.migrateSchema()  // M14: universes table
    await universeReg.load()           // M14: load known universe rooms
    const settings = await loadSettings()
    // Don't restore an admin-set ultra-high timeScale — use normal unless bootstrapping
    clock.setSimTime(settings.simTime)
    console.log(`[server] Loaded settings: simTime=${settings.simTime.toFixed(2)}s`)
  } else {
    console.warn('[server] DATABASE_URL not set — world settings will not persist')
  }

  // ── Discord bot ───────────────────────────────────────────────────────────────
  new DiscordBot().init().catch(err => console.error('[Discord] init error:', err))

  // ── Bootstrap mode ────────────────────────────────────────────────────────────
  // If the world hasn't reached solar-system-forming era, run at 1e14× speed
  if (clock.simTimeSec < BOOTSTRAP_TARGET_SECS) {
    clock.startBootstrap()
    console.log(`[server] World is bootstrapping (${(clock.simTimeSec / (9e9 * 31_557_600) * 100).toFixed(2)}% complete)`)
  } else {
    clock.setTimeScale(NORMAL_TIMESCALE)
    console.log('[server] World already formed — normal speed')
  }

  // When bootstrap finishes, persist the new simTime and switch to normal speed
  clock.onBootstrapComplete(() => {
    if (process.env.DATABASE_URL) {
      saveSettings(NORMAL_TIMESCALE, clock.simTimeSec)
        .then(() => console.log('[server] Bootstrap state saved to DB'))
        .catch(() => {})
    }
    slack.notifyBootstrapComplete().catch(() => {})
  })

  // When a node respawn timer fires, broadcast NODE_RESPAWNED to all clients
  nodeSync.onRespawn = (nodeId, x, y, z, type) => {
    broadcastAll({ type: 'NODE_RESPAWNED', nodeId, x, y, z, nodeType: type })
  }

  // Tick settlements every real second (separate from sim clock — civ sim runs in real time)
  let _lastSettlementTick = Date.now()
  setInterval(() => {
    const now = Date.now()
    const dtReal = (now - _lastSettlementTick) / 1000
    _lastSettlementTick = now
    settlements.tick(
      dtReal,
      // onLevelUp: broadcast civ level-up to all clients
      (settlementId, civLevel, s) => {
        broadcastAll({
          type: 'SETTLEMENT_UPDATE',
          settlementId,
          civLevel,
          name: s.name,
          resourceInv: s.resourceInv,
        })
        slack._post(`*Settlement update:* ${s.name} reached civilization level ${civLevel}!`).catch(() => {})
      },
      // M7 onIronUnlock: broadcast iron age discovery to all connected clients
      (settlementId, settlementName, s) => {
        broadcastAll({
          type: 'SETTLEMENT_UNLOCKED_IRON',
          settlementId,
          settlementName,
          x: s.x, y: s.y, z: s.z,
        })
        slack._post(`*Iron Age unlocked!* ${settlementName} has discovered iron smelting. The Iron Age begins.`).catch(() => {})
      },
      // M8 onSteelUnlock: broadcast steel age discovery when settlement hits civLevel 3
      (settlementId, settlementName, s) => {
        broadcastAll({
          type: 'SETTLEMENT_UNLOCKED_STEEL',
          settlementId,
          settlementName,
          x: s.x, y: s.y, z: s.z,
        })
        slack._post(`*Steel Age unlocked!* ${settlementName} has mastered advanced metallurgy and carburization. The Steel Age begins.`).catch(() => {})
      },
      // M11 onMayorAppointed: civLevel 4+ settlement elects highest-trust NPC as mayor
      (settlementId, settlementName, mayorNpcId, mayorName, s) => {
        broadcastAll({
          type: 'MAYOR_APPOINTED',
          settlementId,
          settlementName,
          mayorNpcId,
          mayorName,
          x: s.x, y: s.y, z: s.z,
        })
        slack._post(`*Mayor appointed!* ${mayorName} has been elected mayor of ${settlementName}. The Civilization Age begins.`).catch(() => {})
      },
      // M11 onDiplomacy: inter-settlement diplomatic event
      (idA, nameA, idB, nameB, status, eventType) => {
        broadcastAll({
          type: 'DIPLOMATIC_EVENT',
          settlementA: idA,
          nameA,
          settlementB: idB,
          nameB,
          status,
          eventType,
        })
        const emoji = eventType === 'WAR_DECLARED' ? 'x' : eventType === 'ALLIANCE_FORMED' ? '*' : '~'
        slack._post(`[${emoji}] *Diplomacy:* ${nameA} and ${nameB} — ${eventType.replace(/_/g, ' ').toLowerCase()}.`).catch(() => {})
      },
      // M12 onSpaceAge: settlement reaches civLevel 6 (Space Age)
      (settlementId, settlementName, s) => {
        broadcastAll({
          type: 'CIVILIZATION_L6',
          settlementId,
          settlementName,
          x: s.x, y: s.y, z: s.z,
        })
        slack._post(`*Space Age!* ${settlementName} has reached Civilization Level 6. The Space Age begins — generators, radio towers, and rocket launches are now possible.`).catch(() => {})
      }
    )
  }, 1000)

  // M9 T3: Weather updates are batched — 8 sector updates fire simultaneously
  // per transition tick. Route through enqueueBatch() so they are bundled into
  // one BATCH_UPDATE wire message instead of 8 individual sends.
  weather.onBroadcast((msg) => scheduler.enqueueBatch(msg))
  weather.onStorm((text) => slack._post(text).catch(() => {}))
  weather.start()

  // M10 Track A: Season cycle — broadcasts SEASON_CHANGED every 30 real seconds
  seasons.onBroadcast((msg) => broadcastAll(msg))
  seasons.start()

  // M10 Track C: Trade economy tick — surplus production, caravan movement
  setInterval(() => {
    tradeEcon.tick(1)
  }, 1000)

  clock.start()
  scheduler.start()

  // ── M_bio: Seed server-authoritative organism simulation ─────────────────────
  organisms.seed(HOME_WORLD_SEED)
  console.log(`[server] Organism simulation seeded: ${organisms.count()} organisms`)

  await slack.start()
  Telegram.setWebhook('https://questions-production-63a2.up.railway.app').catch(() => {})

  // M5 Track 1 deployment notification — fires once on server boot after this deploy
  if (process.env.M5_NOTIFY_SENT !== 'true') {
    slack.notifyM5Shipped().catch(() => {})
  }

  // M9 Track 1 deployment notification — fires once on server boot after this deploy
  if (process.env.M9_NOTIFY_SENT !== 'true') {
    slack.notifyM9Shipped().catch(() => {})
  }

  // Persist simTime periodically
  if (process.env.DATABASE_URL) {
    setInterval(async () => {
      await saveSettings(clock.timeScale, clock.simTimeSec)
    }, PERSIST_INTERVAL_MS)
  }

  // ── HTTP + WebSocket Server ───────────────────────────────────────────────────

  const httpServer = createServer((req, res) => {
    // Always expose CORS headers for browser clients polling this endpoint.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Normalize path so both /status and //status are treated identically.
    const rawPath = (req.url ?? '/').split('?')[0]
    const normalizedPath = rawPath.replace(/\/{2,}/g, '/')

    // Agent status update from Claude subagents
    if (req.method === 'POST' && normalizedPath === '/agent') {
      let body = ''
      req.on('data', chunk => body += chunk)
      req.on('end', () => {
        try {
          const data = JSON.parse(body)
          const xff = req.headers['x-forwarded-for'] ?? '-'
          const ua  = req.headers['user-agent'] ?? '-'
          const ip  = req.socket?.remoteAddress ?? '-'
          console.log(`[agent POST] agentId=${data.agentId} status=${data.status} ip=${ip} xff=${xff} ua=${ua.slice(0,80)}`)
          AgentBus.setNextRequestContext({ ip, xff, ua })
          const state = AgentBus.updateAgent(data.agentId, data.status, data.task, data.message, data.to)
            if (data.status === 'blocked') {
              Telegram.sendBlockedAlert(data.agentId, data.task, data.message).catch(() => {})
            }
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'AGENT_UPDATE', ...state }))
            }
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: String(e) }))
        }
      })
      return
    }

    // POST /telegram-webhook — Telegram button callbacks (approve/reject)
    if (req.method === 'POST' && normalizedPath === '/telegram-webhook') {
      let body = ''
      req.on('data', chunk => body += chunk)
      req.on('end', () => {
        // Always respond 200 immediately — Telegram retries if it doesn't get one quickly
        res.writeHead(200)
        res.end('ok')
        try {
          const data = JSON.parse(body)
          const cq = data.callback_query
          if (cq) {
            const [action, agentId] = (cq.data || '').split(':')
            if (action === 'approve') {
              AgentBus.approveAgent(agentId)
              Telegram.answerCallback(cq.id, 'Approved').catch(() => {})
              Telegram.sendMessage('Agent ' + agentId + ' approved.').catch(() => {})
              const state = AgentBus.updateAgent(agentId, 'active', undefined, 'Approved by owner via Telegram')
              wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN)
                  client.send(JSON.stringify({ type: 'AGENT_UPDATE', ...state }))
              })
            } else if (action === 'reject') {
              AgentBus.rejectAgent(agentId)
              Telegram.answerCallback(cq.id, 'Rejected').catch(() => {})
              Telegram.sendMessage('Agent ' + agentId + ' rejected.').catch(() => {})
              const state = AgentBus.updateAgent(agentId, 'idle', undefined, 'Rejected by owner via Telegram')
              wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN)
                  client.send(JSON.stringify({ type: 'AGENT_UPDATE', ...state }))
              })
            }
          }
          // Handle plain text messages — forward to Claude and reply
          if (data.message && data.message.text) {
            const userText = data.message.text.trim()
            const chatId   = String(data.message.chat?.id ?? 'default')
            // ── Built-in commands (no Claude API needed) ──────────────────────
            if (userText.toLowerCase() === 'check') {
              ;(async () => {
                const blocked = AgentBus.getBlockedAgents()
                const state   = AgentBus.getState()
                const active  = Object.entries(state.agents).filter(([,a]) => a.status === 'active')
                let reply = ''
                if (blocked.length > 0) {
                  reply += `✅ Approving ${blocked.length} blocked agent(s):\n`
                  for (const { id, task } of blocked) {
                    AgentBus.approveAgent(id)
                    AgentBus.updateAgent(id, 'active', undefined, 'Approved via Telegram check')
                    reply += `  • ${id}: ${task || '(no task)'}\n`
                  }
                  reply += '\nAll approved — they will resume automatically.\n'
                } else {
                  reply += 'No blocked agents.\n'
                }
                if (active.length > 0) {
                  reply += `\n🟢 Currently running (${active.length}):\n`
                  for (const [id, a] of active) reply += `  • ${id}: ${a.task || '...'}\n`
                } else {
                  reply += '\n💤 No agents currently running.'
                }
                await Telegram.sendMessage(reply)
              })()
              return
            }
            const runMatch = userText.match(/^run\s+([a-z\-]+)$/i)
            if (runMatch) {
              const agentId = runMatch[1].toLowerCase()
              queueTrigger(agentId)
              ;(async () => {
                await Telegram.sendMessage(
                  `📬 *${agentId}* launch queued.\n\n` +
                  `The next time Claude Code is active in your project, it will automatically pick this up and launch the agent.\n\n` +
                  `If Claude Code is open right now, it will start within seconds.`
                )
              })()
              return
            }
            // Fire-and-forget async Claude call
            ;(async () => {
              try {
                const agentState = AgentBus.getState()
                const agentSummary = Object.entries(agentState.agents)
                  .map(([id, a]) => `  ${id}: ${a.status}${a.task ? ' — ' + a.task : ''}`)
                  .join('\n')
                const recentMessages = agentState.messages.slice(0, 5)
                  .map(m => `  [${m.from}${m.to ? '→' + m.to : ''}] ${m.text}`)
                  .join('\n')
                const systemPrompt = `You are Claude, a game dev assistant for Universe Sim embedded directly in the Railway production server. You have LIVE access to the agent status system — the data below is pulled in real-time from the AgentBus registry at the moment this message was received. Always answer questions about agents using this data. Never say you don't have access to a live system — you do.

LIVE AGENT STATES (as of right now):
${agentSummary}

RECENT AGENT MESSAGES (live feed):
${recentMessages || '  (none yet)'}

Rules:
- Answer questions about agent status directly from the data above
- If an agent shows "active", it IS currently running
- If all agents show "idle", no agents are currently running
- Be concise — this is a mobile Telegram chat
- You can also help with game dev questions about Universe Sim
- IMPORTANT: You cannot launch agents yourself. To launch an agent, tell the user to type "run [agentId]" — the server handles queuing it for Claude Code to pick up automatically. Do NOT say you are "triggering" or "starting" anything yourself.`
                // Append user message to history
                pushTelegramHistory(chatId, 'user', userText)
                const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
                const response = await anthropic.messages.create({
                  model: 'claude-sonnet-4-6',
                  max_tokens: 1024,
                  system: systemPrompt,
                  messages: getTelegramHistory(chatId),
                })
                const reply = response.content[0]?.text ?? 'No response.'
                // Append assistant reply to history
                pushTelegramHistory(chatId, 'assistant', reply)
                await Telegram.sendMessage(reply)
              } catch(e) {
                await Telegram.sendMessage('Error calling Claude: ' + e.message)
              }
            })()
          }
        } catch(e) { /* ignore malformed */ }
      })
      return
    }

    // GET /agent-approval?agentId=xxx — agents poll this to check if approved/rejected
    // GET /agent-status — full agent state for external polling (watchdog, CLI)
    if (req.method === 'GET' && normalizedPath === '/agent-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(AgentBus.getState()))
      return
    }

    // GET /debug-director-log — recent director → active transitions with call stacks
    if (req.method === 'GET' && normalizedPath === '/debug-director-log') {
      try {
        const log = AgentBus.getDirectorActivationLog ? AgentBus.getDirectorActivationLog() : []
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(log))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: String(err) }))
      }
      return
    }

    if (req.method === 'GET' && normalizedPath === '/agent-approval') {
      const agentId = new URL(req.url, 'http://localhost').searchParams.get('agentId')
      const approval = agentId ? AgentBus.checkApproval(agentId) : null
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ approval }))
      return
    }

    // GET /pending-triggers — Claude Code polls this to pick up Telegram launch requests
    if (req.method === 'GET' && normalizedPath === '/pending-triggers') {
      const triggers = consumeTriggers()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ triggers }))
      return
    }

    // Bootstrap status endpoint (CORS-open so client can poll pre-auth)
    if (normalizedPath === '/status') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
      })
      res.end(JSON.stringify({
        bootstrapPhase:    clock.bootstrapPhase,
        bootstrapProgress: clock.bootstrapProgress,
        epoch:             clock.epoch,
        simTime:           clock.simTimeSec,
        worldSeed:         HOME_WORLD_SEED,
        players:           players.count,
      }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(`Universe Sim WS Server — players: ${players.count}`)
  })

  const wss = new WebSocketServer({ server: httpServer })
  httpServer.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT} (HTTP + WebSocket)`)
  })

  // ── M_bio: Organism simulation broadcast at 6 Hz ──────────────────────────────
  // wss is now in scope — safe to reference in the interval callback
  setInterval(() => {
    const { births, deaths } = organisms.tick(clock.simTimeSec)
    const positions = organisms.getPositions()
    const msg = JSON.stringify({
      type: 'ORGANISM_UPDATE',
      positions,  // [[id, x, y, z, energy, speciesId], ...]
      births,     // [{ id, x, y, z, speciesId, size }, ...]
      deaths,     // [id, id, ...]
    })
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(msg)
    })
  }, 166)

  // ── Agent sweep (every 15 s) — idle timeout + heartbeat messages ─────────────
  setInterval(() => {
    const wentIdle         = AgentBus.tickIdleTimeout()
    const heartbeatChanged = AgentBus.tickHeartbeats()
    if (wentIdle.length > 0 || heartbeatChanged) {
      const state = AgentBus.getState()
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN)
          client.send(JSON.stringify({ type: 'AGENT_UPDATE', ...state }))
      })
    }
    // Notify owner on Telegram when active agents go silent/idle
    for (const { id, prevStatus, task } of wentIdle) {
      if (prevStatus === 'active') {
        Telegram.sendMessage(
          `⚠️ *${id.toUpperCase()}* stopped\n\n` +
          `Was working on: ${task || '(no task)'}\n\n` +
          `Reply *run ${id}* in this chat and I'll tell you how to restart it.`
        ).catch(() => {})
      }
    }
  }, 15_000)

  // ── Auto-queue director every 4 hours ────────────────────────────────────────
  // Queues via Telegram only — startup no longer auto-queues to avoid ghost active state.
  const DIRECTOR_QUEUE_INTERVAL = 4 * 60 * 60 * 1000
  setInterval(() => {
    queueTrigger('director')
    Telegram.sendMessage(
      '⏰ *Auto-scheduled:* director launch queued (4-hour cycle).\n\nOpen Claude Code and it will start automatically, or it\'s already running.'
    ).catch(() => {})
    console.log('[cron] director queued for auto-launch')
  }, DIRECTOR_QUEUE_INTERVAL)

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress
    console.log(`[server] Client connected from ${ip}`)

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) }
      catch { return }

      handleMessage(ws, msg)
    })

    ws.on('close', () => {
      const userId = ws._userId
      if (userId) {
        const p = players.get(userId)
        const username = p?.username ?? userId
        players.remove(userId)
        broadcast({ type: 'PLAYER_LEFT', userId }, ws)
        console.log(`[server] Player left: ${userId} (${players.count} online)`)
        slack.notifyPlayerLeft(username).catch(() => {})
      }
    })

    ws.on('error', (err) => console.error('[server] ws error:', err.message))
  })
}

// ── Message handlers ───────────────────────────────────────────────────────────

function handleMessage(ws, msg) {
  switch (msg.type) {

    case 'JOIN': {
      const { userId, username } = msg
      if (!userId || !username) return
      ws._userId = userId
      players.add(userId, username, ws)
      console.log(`[server] Player joined: ${username} (${players.count} online)`)
      slack.notifyPlayerJoined(username).catch(() => {})

      // Load (or assign) shelter position before sending snapshot
      players.initShelterPos(userId).then(() => {
        const shelterPos = players.getShelterPos(userId)
        // Send current world state immediately
        ws.send(JSON.stringify({
          type: 'WORLD_SNAPSHOT',
          simTime:           clock.simTimeSec,
          epoch:             clock.epoch,
          timeScale:         clock.timeScale,
          paused:            clock.paused,
          worldSeed:         HOME_WORLD_SEED,
          bootstrapPhase:    clock.bootstrapPhase,
          bootstrapProgress: clock.bootstrapProgress,
          players: players.getAll(),
          npcs: [],
          universes: universeReg.getAll(),  // M14: known universe instances
          depletedNodes: nodeSync.getDepletedSnapshot(),
          settlements:   settlements.getSnapshot(),
          weather:       weather.getSnapshot(),
          season:        seasons.getSnapshot(),
          agentState:    AgentBus.getState(),
          shelterPos,  // this player's personal shelter position
        }))

        // Notify others (use getAll() to get serializable player without ws socket)
        const safePlayer = players.getAll().find(p => p.userId === userId)
        broadcast({ type: 'PLAYER_JOINED', player: safePlayer }, ws)
      }).catch(err => {
        console.error('[server] JOIN initShelterPos error:', err.message)
      })
      break
    }

    case 'PLAYER_UPDATE': {
      const userId = ws._userId
      if (!userId) return
      const { x, y, z, health } = msg
      players.update(userId, { x, y, z, health })
      break
    }

    case 'REGISTER_SHELTER': {
      // Client requests to register current position as their respawn shelter.
      const userId = ws._userId
      if (!userId) return
      const { x, y, z } = msg
      if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return
      players.setShelterPos(userId, x, y, z)
      // Confirm to the registering player only
      ws.send(JSON.stringify({ type: 'SHELTER_REGISTERED', x, y, z }))
      console.log(`[server] Shelter registered for ${userId} at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`)
      break
    }

    case 'NODE_DESTROYED': {
      // A client reports it depleted a resource node (tree felled, ore mined).
      // Server records it authoritatively and broadcasts to ALL clients (including sender)
      // so every client removes the node from its scene.
      const { nodeId, nodeType, x, y, z } = msg
      if (typeof nodeId !== 'number') return
      nodeSync.markDepleted(nodeId, nodeType ?? 'unknown', x ?? 0, y ?? 0, z ?? 0)
      broadcastAll({ type: 'NODE_DESTROYED', nodeId, nodeType })
      break
    }

    case 'FIRE_STARTED': {
      // A client ignited a fire at a world position. Broadcast to all OTHER clients
      // so they call their own LocalSimManager.ignite() at the same position.
      // The initiating client already ran ignite() locally — don't echo back.
      const { x, y, z } = msg
      if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return
      broadcast({ type: 'FIRE_STARTED', x, y, z }, ws)
      break
    }

    case 'PLAYER_NEAR_SETTLEMENT': {
      // Client reports player is within territory radius of a settlement.
      // Server checks for a trade offer and gates status, replies to that socket only.
      const userId = ws._userId
      if (!userId) return
      const { settlementId } = msg
      if (typeof settlementId !== 'number') return

      const offer = settlements.checkTradeOffer(settlementId, userId, null)
      if (offer) {
        ws.send(JSON.stringify({ type: 'TRADE_OFFER', ...offer }))
      }
      break
    }

    case 'TRADE_ACCEPT': {
      // Client accepts a trade offer.
      // playerGives: what the player is handing over
      // playerReceives: what the player expects to get
      const userId = ws._userId
      if (!userId) return
      const { settlementId, playerGives, playerReceives } = msg
      if (typeof settlementId !== 'number') return

      const result = settlements.executeTrade(
        settlementId, userId,
        playerGives ?? {}, playerReceives ?? {},
        null,
        null  // inventory validation done client-side for now
      )

      ws.send(JSON.stringify({
        type: 'TRADE_RESULT',
        settlementId,
        result,
        playerGives:    result === 'ok' ? playerGives    : null,
        playerReceives: result === 'ok' ? playerReceives : null,
      }))

      if (result === 'ok') {
        const s = settlements.getSettlement(settlementId)
        // Broadcast updated settlement inventory to all players
        broadcastAll({
          type: 'SETTLEMENT_UPDATE',
          settlementId,
          civLevel:    s?.civLevel ?? 0,
          name:        s?.name ?? '',
          resourceInv: s?.resourceInv ?? {},
        })
      }
      break
    }

    case 'NPC_ATTACKED': {
      // Client reports player attacked an NPC belonging to a settlement.
      const userId = ws._userId
      if (!userId) return
      const { settlementId } = msg
      if (typeof settlementId !== 'number') return

      const nowClosed = settlements.recordPlayerAttack(settlementId, null, userId)
      if (nowClosed) {
        // Tell this player their gates are now closed
        ws.send(JSON.stringify({ type: 'GATES_CLOSED', settlementId }))
        console.log(`[server] Gates closed for player ${userId} at settlement ${settlementId}`)
      }
      break
    }

    case 'ADMIN_SET_TIME': {
      // Reject if no secret configured or secret doesn't match
      if (!ADMIN_SECRET || msg.adminSecret !== ADMIN_SECRET) {
        console.warn(`[server] Rejected ADMIN_SET_TIME from ${ws._userId ?? 'unknown'} (bad secret)`)
        return
      }
      const { timeScale, paused } = msg
      if (typeof timeScale === 'number' && timeScale > 0) {
        clock.setTimeScale(timeScale)
        if (process.env.DATABASE_URL) {
          saveSettings(timeScale, clock.simTimeSec).catch(() => {})
        }
      }
      if (typeof paused === 'boolean') {
        clock.setPaused(paused)
      }
      break
    }

    // ── M10 Track C: Advanced Trade Economy ────────────────────────────────────

    case 'SHOP_OPEN_REQUEST': {
      // Client requests shop catalog when near a settlement leader.
      const userId = ws._userId
      if (!userId) return
      const { settlementId } = msg
      if (typeof settlementId !== 'number') return

      const s = settlements.getSettlement(settlementId)
      if (!s) return

      const catalog = tradeEcon.getShopCatalog(settlementId)
      ws.send(JSON.stringify({
        type:           'SHOP_OPEN',
        settlementId,
        settlementName: s.name,
        catalog,
        coinBalance:    tradeEcon.getCoinBalance(settlementId),
      }))
      break
    }

    case 'SHOP_BUY': {
      // Player buys `qty` of `matId` from settlement.
      const userId = ws._userId
      if (!userId) return
      const { settlementId, matId, qty } = msg
      if (typeof settlementId !== 'number' || typeof matId !== 'number' || typeof qty !== 'number') return

      const result = tradeEcon.playerBuyFromSettlement(settlementId, matId, qty)
      ws.send(JSON.stringify({ type: 'SHOP_BUY_RESULT', ...result, settlementId, matId, qty }))
      break
    }

    case 'SHOP_SELL': {
      // Player sells `qty` of `matId` to settlement.
      const userId = ws._userId
      if (!userId) return
      const { settlementId, matId, qty } = msg
      if (typeof settlementId !== 'number' || typeof matId !== 'number' || typeof qty !== 'number') return

      const result = tradeEcon.playerSellToSettlement(settlementId, matId, qty)
      ws.send(JSON.stringify({ type: 'SHOP_SELL_RESULT', ...result, settlementId, matId, qty }))

      // Broadcast updated catalog so all nearby players see fresh prices
      const catalog = tradeEcon.getShopCatalog(settlementId)
      broadcastAll({ type: 'SHOP_CATALOG_UPDATE', settlementId, catalog })
      break
    }

    // ── M12 Track A: Rocket launch ─────────────────────────────────────────────

    case 'ROCKET_LAUNCHED': {
      // Client reports rocket reached orbit from a launch pad.
      // After 30s, broadcast ANOMALY_SIGNAL to all clients — the Velar anomaly responds.
      const userId = ws._userId
      if (!userId) return
      const { pos } = msg
      const p = players.get(userId)
      const username = p?.username ?? userId
      console.log(`[server] ROCKET_LAUNCHED by ${username} — scheduling ANOMALY_SIGNAL in 30s`)
      broadcastAll({ type: 'ROCKET_ORBIT_ACHIEVED', launcherId: userId, launcherName: username, pos })
      slack._post(`*Orbit achieved!* ${username} has launched a rocket into orbit. Something stirs in the cosmos...`).catch(() => {})
      setTimeout(() => {
        console.log(`[server] Broadcasting ANOMALY_SIGNAL — Velar responds!`)
        broadcastAll({
          type:        'ANOMALY_SIGNAL',
          launcherId:  userId,
          launcherName: username,
          message:     'Signal detected from Velar. Coordinates locked. Something is watching.',
          timestamp:   Date.now(),
        })
        slack._post(`*Anomaly Signal!* The Velar anomaly has responded. Something is out there.`).catch(() => {})
      }, 30_000)
      break
    }

    // ── M13 Track A: Velar signal decoded ──────────────────────────────────────

    case 'VELAR_DECODED': {
      // Client reports player has decoded the Velar signal.
      // Persist to discoveries table and broadcast to all clients.
      const userId = ws._userId
      if (!userId) return
      const p = players.get(userId)
      const decoderName = p?.username ?? userId

      console.log(`[server] VELAR_DECODED by ${decoderName}`)

      // Persist to Neon DB (discoveries table)
      recordDecode(userId, decoderName).then(() => {
        console.log('[server] VELAR_DECODED persisted to DB')
      }).catch(() => {})

      // Broadcast to ALL players
      broadcastAll({
        type:        'VELAR_DECODED',
        decoderId:   userId,
        decoderName,
        timestamp:   Date.now(),
      })

      slack._post(`*First Contact!* ${decoderName} has decoded the Velar signal. The universe is not empty.`).catch(() => {})
      break
    }

    // ── M13 Track C: Reactor events ────────────────────────────────────────────

    case 'REACTOR_MELTDOWN': {
      // Client reports reactor meltdown. Broadcast to all.
      const userId = ws._userId
      if (!userId) return
      const { pos } = msg
      const p = players.get(userId)
      const username = p?.username ?? userId

      console.error(`[server] REACTOR_MELTDOWN reported by ${username} at`, pos)
      broadcastAll({ type: 'REACTOR_MELTDOWN', pos, launcherName: username })
      slack._post(`*REACTOR MELTDOWN!* ${username}'s nuclear reactor has gone critical. Radiation zone active.`).catch(() => {})
      break
    }

    case 'REACTOR_CLEANED': {
      // Client confirms meltdown cleanup complete.
      const userId = ws._userId
      if (!userId) return
      const { pos } = msg
      const p = players.get(userId)
      const username = p?.username ?? userId

      console.log(`[server] REACTOR_CLEANED by ${username}`)
      broadcastAll({ type: 'REACTOR_CLEANED', pos, cleanerName: username })
      slack._post(`*Meltdown contained!* ${username} has cleaned up the reactor site.`).catch(() => {})
      break
    }

    // ── M14 Track A: Interplanetary transit ────────────────────────────────────

    case 'INTERPLANETARY_TRANSIT_LAUNCHED': {
      // Client launched player in orbital capsule toward a destination planet.
      // Broadcast to all players so they can see the capsule leave.
      const userId = ws._userId
      if (!userId) return
      const p = players.get(userId)
      const username = p?.username ?? userId
      const { fromPlanet, toPlanet, destinationSeed } = msg

      console.log(`[server] M14: ${username} launched transit from ${fromPlanet} → ${toPlanet}`)
      broadcastAll({
        type:            'TRANSIT_LAUNCHED',
        userId,
        username,
        fromPlanet,
        toPlanet,
        destinationSeed,
        timestamp:       Date.now(),
      })
      slack._post(`*Interplanetary transit!* ${username} has launched toward ${toPlanet ?? 'Home'}. The universe expands.`).catch(() => {})
      break
    }

    case 'TRANSIT_ARRIVED': {
      const userId = ws._userId
      if (!userId) return
      const p = players.get(userId)
      const username = p?.username ?? userId
      const { planet } = msg
      console.log(`[server] M14: ${username} arrived at ${planet ?? 'Home'}`)
      broadcastAll({ type: 'TRANSIT_ARRIVED_BROADCAST', userId, username, planet, timestamp: Date.now() })
      slack._post(`*Transit complete!* ${username} has arrived at ${planet ?? 'Home'}.`).catch(() => {})
      break
    }

    // ── M14 Track B: Velar response + gateway ──────────────────────────────────

    case 'ORBITAL_CAPSULE_LAUNCHED': {
      // Reuse M13 probe handler AND add M14 Velar response trigger.
      // When targetPlanet === 'Velar', after PROBE_LANDED also send VELAR_RESPONSE.
      const userId = ws._userId
      if (!userId) return
      const { targetPlanet } = msg
      if (typeof targetPlanet !== 'string') return

      const p = players.get(userId)
      const username = p?.username ?? userId

      const PLANETS = {
        Aethon: { seed: 0xae7401, type: 'rocky',    semiMajorAU: 0.7 },
        Velar:  { seed: 0xe1a001, type: 'gas',       semiMajorAU: 2.1 },
        Sulfis: { seed: 0x501f01, type: 'volcanic',  semiMajorAU: 0.4 },
      }
      const planet = PLANETS[targetPlanet]
      if (!planet) return

      console.log(`[server] ORBITAL_CAPSULE_LAUNCHED by ${username} → ${targetPlanet}`)
      slack._post(`*Orbital capsule launched!* ${username} is sending a probe to ${targetPlanet}...`).catch(() => {})

      function seededRandLocal(seed) {
        let s = seed >>> 0
        return () => {
          s = (Math.imul(s, 1664525) + 1013904223) >>> 0
          return s / 0xffffffff
        }
      }
      const rand = seededRandLocal(planet.seed)
      let surfaceTemp, atmosphere, resources

      if (planet.type === 'rocky') {
        surfaceTemp = Math.round(220 + rand() * 280)
        const co2 = (40 + rand() * 55).toFixed(0)
        const n2  = Math.max(0, 100 - parseFloat(co2) - rand() * 5).toFixed(0)
        atmosphere = `CO2 ${co2}%, N2 ${n2}%`
        resources = ['iron_ore', 'silicate', 'frozen_water', 'copper_ore', 'titanium', 'basalt']
          .sort(() => rand() - 0.5).slice(0, 2 + Math.floor(rand() * 3))
      } else if (planet.type === 'gas') {
        surfaceTemp = Math.round(60 + rand() * 120)
        atmosphere = `H2 ${(70 + rand() * 20).toFixed(0)}%, He ${(5 + rand() * 15).toFixed(0)}%, CH4 trace`
        resources = ['methane', 'ammonia', 'hydrogen_gas', 'helium3', 'ice_crystals']
          .sort(() => rand() - 0.5).slice(0, 2 + Math.floor(rand() * 2))
      } else {
        surfaceTemp = Math.round(500 + rand() * 400)
        atmosphere = `SO2 ${(60 + rand() * 30).toFixed(0)}%, CO2 ${(rand() * 30).toFixed(0)}%`
        resources = ['sulfur', 'iron_ore', 'obsidian', 'volcanic_ash', 'rare_earth']
          .sort(() => rand() - 0.5).slice(0, 2 + Math.floor(rand() * 3))
      }

      setTimeout(() => {
        broadcastAll({
          type:           'PROBE_LANDED',
          planetName:     targetPlanet,
          surfaceTemp,
          atmosphere,
          resources,
          discoveredBy:   userId,
          discovererName: username,
        })
        console.log(`[server] PROBE_LANDED on ${targetPlanet}: ${surfaceTemp}K`)
        slack._post(`*Probe landed on ${targetPlanet}!* Surface: ${surfaceTemp}K. Resources: ${resources.join(', ')}`).catch(() => {})
        recordProbe(targetPlanet, surfaceTemp, atmosphere, resources.join(','), userId).catch(() => {})

        // M14 Track B: If probing Velar, send VELAR_RESPONSE after an additional 5s
        if (targetPlanet === 'Velar') {
          setTimeout(() => {
            console.log('[server] M14: Sending VELAR_RESPONSE — Velar civilization responds to probe')
            broadcastAll({
              type:    'VELAR_RESPONSE',
              symbols: ['life', 'star', 'path', 'here', 'come'],  // ordered sequence
              message: 'Encoded transmission from Velar (2.1 AU). 5 symbols detected. Decode to reveal meaning.',
              timestamp: Date.now(),
            })
            slack._post('*Velar responds!* A structured transmission has been received from Velar. The ancient ones have noticed us.').catch(() => {})
          }, 5000)
        }
      }, 5000)
      break
    }

    case 'VELAR_RESPONSE_DECODED': {
      // Player has decoded all 5 Velar symbols — gateway coordinates unlocked.
      const userId = ws._userId
      if (!userId) return
      const p = players.get(userId)
      const username = p?.username ?? userId
      console.log(`[server] M14: VELAR_RESPONSE_DECODED by ${username}`)
      broadcastAll({
        type:      'VELAR_GATEWAY_REVEALED',
        decoderId: userId,
        decoderName: username,
        timestamp:  Date.now(),
      })
      slack._post(`*Velar Gateway revealed!* ${username} has decoded the Velar message. "WE ARE THE ORIGIN OF LIFE. COME HOME." A gateway structure has appeared.`).catch(() => {})
      break
    }

    case 'VELAR_GATEWAY_ACTIVATED': {
      // Player used the Velar Key at the gateway — spawn the Velar World universe.
      const userId = ws._userId
      if (!userId) return
      const p = players.get(userId)
      const username = p?.username ?? userId
      console.log(`[server] M14: Velar Gateway activated by ${username} — spawning Velar World`)

      universeReg.spawnVelarWorld(userId, username).then(velarSeed => {
        broadcastAll({
          type:      'VELAR_GATEWAY_ACTIVATED',
          activatorId: userId,
          activatorName: username,
          velarSeed,
          timestamp:   Date.now(),
          universes:   universeReg.getAll(),
        })
        slack._post(`*MULTIVERSE UNLOCKED!* ${username} has activated the Velar Gateway. A new universe (seed 0x${velarSeed.toString(16)}) has been spawned — the Velar World awaits.`).catch(() => {})
      }).catch(err => {
        console.error('[server] M14: spawnVelarWorld error:', err.message)
      })
      break
    }

    // ── M12 Track B: Radio broadcast ───────────────────────────────────────────

    case 'PLAYER_RADIO_BROADCAST': {
      // Player near a radio_tower broadcasts a message to other players in range.
      const userId = ws._userId
      if (!userId) return
      const { settlementId, message } = msg
      if (typeof settlementId !== 'number' || typeof message !== 'string') return

      const s = settlements.getSettlement(settlementId)
      if (!s) return

      const safeMsg = message.slice(0, 120)
      broadcastAll({
        type:           'RADIO_BROADCAST',
        settlementId,
        settlementName: s.name,
        message:        safeMsg,
        towerPos:       [s.x, s.y, s.z],
      })
      console.log(`[server] Radio broadcast from ${s.name}: "${safeMsg}"`)
      break
    }

    // ── M15 Track B: Velar trade completed ────────────────────────────────────

    case 'VELAR_TRADE_COMPLETED': {
      const userId = ws._userId
      if (!userId) return
      const p = players.get(userId)
      const username = p?.username ?? userId
      const { tradeId } = msg
      if (typeof tradeId !== 'string') return

      console.log(`[server] M15: Velar trade by ${username}: ${tradeId}`)
      broadcastAll({ type: 'VELAR_TRADE_BROADCAST', userId, username, tradeId, timestamp: Date.now() })
      slack._post(`*Velar Trade!* ${username} traded with a Velar citizen: ${tradeId}`).catch(() => {})
      break
    }

    // ── M15 Track B: Velar knowledge shared ───────────────────────────────────

    case 'VELAR_KNOWLEDGE_SHARED': {
      const userId = ws._userId
      if (!userId) return
      const p = players.get(userId)
      const username = p?.username ?? userId

      console.log(`[server] M15: Velar fabrication knowledge shared with ${username}`)
      broadcastAll({
        type:     'VELAR_KNOWLEDGE_BROADCAST',
        userId,
        username,
        knowledge: 'velar_fabrication',
        timestamp: Date.now(),
      })
      slack._post(`*Knowledge Transfer!* ${username} has learned Velar Fabrication from a Velar citizen. Recipes 106–110 unlocked.`).catch(() => {})
      break
    }

    // ── M15 Track B: Velar purpose revealed ───────────────────────────────────

    case 'VELAR_PURPOSE_REVEALED': {
      const userId = ws._userId
      if (!userId) return
      const p = players.get(userId)
      const username = p?.username ?? userId

      console.log(`[server] M15: Velar purpose revealed to ${username}`)
      broadcastAll({
        type:      'VELAR_PURPOSE_BROADCAST',
        userId,
        username,
        timestamp: Date.now(),
      })
      slack._post(`*The Velar Speak!* ${username} asked the Velar about their purpose and learned the truth of the Lattice.`).catch(() => {})
      break
    }

    default:
      break
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Broadcast a message to all clients except the sender. */
function broadcast(msg, excludeWs = null) {
  const payload = JSON.stringify(msg)
  players.forEachSocket((ws) => {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  })
}

/** Broadcast a message to ALL connected clients including the sender. */
function broadcastAll(msg) {
  const payload = JSON.stringify(msg)
  players.forEachSocket((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  })
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err)
  process.exit(1)
})
