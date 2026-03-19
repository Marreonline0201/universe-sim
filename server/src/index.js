// ── Universe Sim WebSocket Server ──────────────────────────────────────────────
// Railway always-on Node.js process. Owns the authoritative world clock.
// Broadcasts WorldSnapshot to all connected clients at 10 Hz.

import { WebSocketServer, WebSocket } from 'ws'
import { WorldClock } from './WorldClock.js'
import { PlayerRegistry } from './PlayerRegistry.js'
import { NpcManager } from './NpcManager.js'
import { BroadcastScheduler } from './BroadcastScheduler.js'
import { loadSettings, saveSettings, migrateSchema } from './WorldSettingsSync.js'

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
    clock.setTimeScale(settings.timeScale)
    clock.setSimTime(settings.simTime)
    console.log(`[server] Loaded settings: timeScale=${settings.timeScale}, simTime=${settings.simTime.toFixed(2)}s`)
  } else {
    console.warn('[server] DATABASE_URL not set — world settings will not persist')
  }

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

  // ── WebSocket Server ─────────────────────────────────────────────────────────

  const wss = new WebSocketServer({ port: PORT })
  console.log(`[server] WebSocket server listening on ws://0.0.0.0:${PORT}`)

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
        simTime: clock.simTimeSec,
        epoch: clock.epoch,
        timeScale: clock.timeScale,
        paused: clock.paused,
        players: players.getAll(),
        npcs: npcs.getAll(),
      }))

      // Notify others
      broadcast({ type: 'PLAYER_JOINED', player: players.get(userId) }, ws)
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
