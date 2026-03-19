// ── Universe Sim WebSocket Server ──────────────────────────────────────────────
// Railway always-on Node.js process. Owns the authoritative world clock.
// Broadcasts WorldSnapshot to all connected clients at 10 Hz.

import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { WorldClock } from './WorldClock.js'
import { PlayerRegistry } from './PlayerRegistry.js'
import { NpcManager } from './NpcManager.js'
import { BroadcastScheduler } from './BroadcastScheduler.js'
import { loadSettings, saveSettings, migrateSchema } from './WorldSettingsSync.js'
import { BOOTSTRAP_TARGET_SECS, NORMAL_TIMESCALE } from './WorldClock.js'

const PORT = parseInt(process.env.PORT ?? '8080', 10)
const PERSIST_INTERVAL_MS = 30_000 // save simTime to DB every 30 s

// ── Bootstrap ──────────────────────────────────────────────────────────────────

const clock    = new WorldClock()
const players  = new PlayerRegistry()
const npcs     = new NpcManager()
const scheduler = new BroadcastScheduler(clock, players, npcs)

async function main() {
  // Ensure DB has sim_time column
  if (process.env.DATABASE_URL) {
    await migrateSchema()
    const settings = await loadSettings()
    // Don't restore an admin-set ultra-high timeScale — use normal unless bootstrapping
    clock.setSimTime(settings.simTime)
    console.log(`[server] Loaded settings: simTime=${settings.simTime.toFixed(2)}s`)
  } else {
    console.warn('[server] DATABASE_URL not set — world settings will not persist')
  }

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
  })

  // Tick NPCs every 100 ms (same rate as clock)
  clock.onTick(() => npcs.tick(0.1))

  clock.start()
  scheduler.start()

  // Persist simTime periodically
  if (process.env.DATABASE_URL) {
    setInterval(async () => {
      await saveSettings(clock.timeScale, clock.simTimeSec)
    }, PERSIST_INTERVAL_MS)
  }

  // ── HTTP + WebSocket Server ───────────────────────────────────────────────────

  const httpServer = createServer((req, res) => {
    // Bootstrap status endpoint (CORS-open so client can poll pre-auth)
    if (req.url === '/status') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(JSON.stringify({
        bootstrapPhase:    clock.bootstrapPhase,
        bootstrapProgress: clock.bootstrapProgress,
        epoch:             clock.epoch,
        simTime:           clock.simTimeSec,
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
        players.remove(userId)
        broadcast({ type: 'PLAYER_LEFT', userId }, ws)
        console.log(`[server] Player left: ${userId} (${players.count} online)`)
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

      // Send current world state immediately
      ws.send(JSON.stringify({
        type: 'WORLD_SNAPSHOT',
        simTime:           clock.simTimeSec,
        epoch:             clock.epoch,
        timeScale:         clock.timeScale,
        paused:            clock.paused,
        bootstrapPhase:    clock.bootstrapPhase,
        bootstrapProgress: clock.bootstrapProgress,
        players: players.getAll(),
        npcs: npcs.getAll(),
      }))

      // Notify others (use getAll() to get serializable player without ws socket)
      const safePlayer = players.getAll().find(p => p.userId === userId)
      broadcast({ type: 'PLAYER_JOINED', player: safePlayer }, ws)
      break
    }

    case 'PLAYER_UPDATE': {
      const { userId, x, y, z, health } = msg
      if (!userId) return
      players.update(userId, { x, y, z, health })
      break
    }

    case 'ADMIN_SET_TIME': {
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

main().catch((err) => {
  console.error('[server] Fatal startup error:', err)
  process.exit(1)
})
