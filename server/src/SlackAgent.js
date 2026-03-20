// ── SlackAgent ────────────────────────────────────────────────────────────────
// Two-way Slack integration for the universe sim server.
// Reads the channel, responds to commands/questions, posts world events.
//
// Requires env vars:
//   SLACK_BOT_TOKEN  — xoxb-... (Bot User OAuth Token)
//   SLACK_APP_TOKEN  — xapp-... (App-Level Token for Socket Mode)
//   SLACK_CHANNEL_ID — C0AMWTPE0AE (default)
//
// Commands recognized in channel:
//   !status   → current world state (epoch, simTime, players, NPCs)
//   !players  → list connected players
//   !epoch    → current cosmological era + description
//   !npcs     → NPC count + states
//   !help     → list all commands
//   !pause    → pause simulation (admin)
//   !resume   → resume simulation (admin)
//   Any message mentioning "universe" or "world" → brief world status reply

import { SocketModeClient } from '@slack/socket-mode'
import { WebClient } from '@slack/web-api'

const CHANNEL = process.env.SLACK_CHANNEL_ID ?? 'C0AMWTPE0AE'

const EPOCH_DESCRIPTIONS = {
  planck:            'The Planck epoch — universe is 10⁻⁴³ seconds old, gravity not yet separated',
  grand_unification: 'Grand Unification era — fundamental forces are still merged',
  electroweak:       'Electroweak epoch — electromagnetic and weak forces unify',
  quark_epoch:       'Quark epoch — quarks and gluons fill the universe as a plasma',
  nucleosynthesis:   'Nucleosynthesis — protons and neutrons fuse into the first hydrogen and helium nuclei',
  photon_epoch:      'Photon epoch — the universe is a glowing plasma, light cannot travel freely',
  dark_ages:         'Cosmic Dark Ages — hydrogen fills the universe but no stars shine yet',
  reionization:      'Reionization — the first stars ignite and burn away the hydrogen fog',
  stellar:           'Stellar era — galaxies and star systems form across the cosmos',
  galactic:          'Galactic era — the Milky Way matures, stellar nurseries are active',
  contemporary:      'Contemporary era — our solar system and Earth exist right now',
  stellar_late:      'Late Stellar era — main-sequence stars are dying, white dwarfs dominate',
  degenerate:        'Degenerate era — only white dwarfs, neutron stars and black holes remain',
  dark_era:          'Dark Era — all stars are dead. Only black holes remain in an eternal, cold cosmos',
}

export class SlackAgent {
  constructor(clock, players, npcs) {
    this.clock   = clock
    this.players = players
    this.npcs    = npcs
    this._web    = null
    this._socket = null
    this._lastEpoch = null
    this._lastPlayerCount = 0
    this._historyTs = null  // timestamp of last read message
  }

  async start() {
    const botToken = process.env.SLACK_BOT_TOKEN
    const appToken = process.env.SLACK_APP_TOKEN

    if (!botToken) {
      console.log('[SlackAgent] No SLACK_BOT_TOKEN — Slack integration disabled')
      return
    }

    this.web = new WebClient(botToken)

    // Read recent history so we're caught up on what was discussed
    await this._readHistory()

    // Socket Mode: real-time message events (requires xapp- token)
    if (appToken) {
      this._socket = new SocketModeClient({ appToken })

      this._socket.on('message', async ({ event, ack }) => {
        try { await ack() } catch {}
        if (!event || event.bot_id || event.subtype) return  // ignore bot messages + edits
        if (event.channel !== CHANNEL) return
        await this._handleMessage(event)
      })

      try {
        await this._socket.start()
        console.log('[SlackAgent] Socket Mode connected — listening for channel messages')
      } catch (err) {
        console.error('[SlackAgent] Socket Mode failed:', err.message)
      }
    } else {
      console.log('[SlackAgent] No SLACK_APP_TOKEN — posting only (no message reading)')
    }

    // Watch for epoch changes and player count changes every 5 seconds
    setInterval(() => this._watchWorldChanges(), 5_000)

    console.log('[SlackAgent] Started')
  }

  // ── Public notify methods (called from index.js) ──────────────────────────

  async notifyPlayerJoined(username) {
    await this._post(`*${username}* joined the simulation. Players online: ${this.players.count}`)
  }

  async notifyPlayerLeft(username) {
    await this._post(`*${username}* left the simulation. Players online: ${this.players.count}`)
  }

  async notifyBootstrapComplete() {
    await this._post(
      '*World formed!* The simulation has reached 9.3 billion years — Earth has formed. Players can now explore.'
    )
  }

  // ── Private ───────────────────────────────────────────────────────────────

  async _readHistory() {
    if (!this.web) return
    try {
      const result = await this.web.conversations.history({ channel: CHANNEL, limit: 20 })
      if (!result.ok || !result.messages?.length) return
      // Store the most recent message timestamp so we don't re-process old messages
      this._historyTs = result.messages[0].ts
      const recent = result.messages
        .filter(m => !m.bot_id)
        .slice(0, 5)
        .reverse()
        .map(m => `  [${new Date(parseFloat(m.ts) * 1000).toISOString().slice(11, 19)}] ${m.text}`)
        .join('\n')
      if (recent) {
        console.log(`[SlackAgent] Recent channel messages:\n${recent}`)
      }
    } catch (err) {
      console.error('[SlackAgent] Failed to read history:', err.message)
    }
  }

  async _handleMessage(event) {
    const text = (event.text ?? '').trim().toLowerCase()
    console.log(`[SlackAgent] Channel message: "${event.text}"`)

    if (text === '!help') {
      await this._post(this._helpText())
      return
    }
    if (text === '!status') {
      await this._post(this._statusText())
      return
    }
    if (text === '!players') {
      await this._post(this._playersText())
      return
    }
    if (text === '!epoch') {
      await this._post(this._epochText())
      return
    }
    if (text === '!npcs') {
      await this._post(this._npcsText())
      return
    }
    if (text === '!pause') {
      this.clock.setPaused(true)
      await this._post('Simulation *paused*.')
      return
    }
    if (text === '!resume') {
      this.clock.setPaused(false)
      await this._post('Simulation *resumed*.')
      return
    }

    // Passive awareness: respond if world/universe/sim is mentioned
    if (
      text.includes('world') || text.includes('universe') ||
      text.includes('simulation') || text.includes('epoch') ||
      text.includes('players') || text.includes('status')
    ) {
      await this._post(this._statusText())
    }
  }

  _watchWorldChanges() {
    // Epoch change notification
    if (this.clock.epoch !== this._lastEpoch) {
      if (this._lastEpoch !== null) {
        this._post(`*Epoch transition!* The universe has entered the *${this._epochDisplayName(this.clock.epoch)}*.\n${EPOCH_DESCRIPTIONS[this.clock.epoch] ?? ''}`)
      }
      this._lastEpoch = this.clock.epoch
    }

    // Significant player count change
    const count = this.players.count
    if (count !== this._lastPlayerCount) {
      this._lastPlayerCount = count
      // (individual join/leave is notified via notifyPlayerJoined/Left)
    }
  }

  _statusText() {
    const years = this.clock.simTimeSec / 31_557_600
    const timeStr = years >= 1e9
      ? `${(years / 1e9).toFixed(3)} Gyr`
      : years >= 1e6
        ? `${(years / 1e6).toFixed(2)} Myr`
        : years >= 1000
          ? `${(years / 1000).toFixed(1)} kyr`
          : `${years.toFixed(1)} yr`

    const npcStates = this.npcs.getAll().reduce((acc, n) => {
      acc[n.state] = (acc[n.state] ?? 0) + 1
      return acc
    }, {})
    const npcSummary = Object.entries(npcStates).map(([s, c]) => `${c} ${s}`).join(', ')

    return [
      `*Universe Sim — Live Status*`,
      `• Epoch: *${this._epochDisplayName(this.clock.epoch)}*`,
      `• Sim time: *${timeStr}*`,
      `• Time scale: ${this.clock.timeScale.toExponential(0)}×`,
      `• Paused: ${this.clock.paused ? 'yes' : 'no'}`,
      `• Players online: *${this.players.count}*`,
      `• NPCs: ${npcSummary || 'none'}`,
    ].join('\n')
  }

  _playersText() {
    const list = this.players.getAll()
    if (!list.length) return 'No players currently online.'
    return '*Online players:*\n' + list.map(p =>
      `• ${p.username} — pos (${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}) HP ${(p.health * 100).toFixed(0)}%`
    ).join('\n')
  }

  _epochText() {
    const name = this._epochDisplayName(this.clock.epoch)
    const desc = EPOCH_DESCRIPTIONS[this.clock.epoch] ?? 'Unknown epoch'
    return `*Current epoch: ${name}*\n${desc}`
  }

  _npcsText() {
    const all = this.npcs.getAll()
    const states = all.reduce((acc, n) => {
      acc[n.state] = (acc[n.state] ?? 0) + 1
      return acc
    }, {})
    return `*${all.length} NPCs active:* ` +
      Object.entries(states).map(([s, c]) => `${c} ${s}`).join(', ')
  }

  _helpText() {
    return [
      '*Universe Sim Agent — Commands*',
      '`!status`  — full world state',
      '`!players` — who is online',
      '`!epoch`   — current cosmological era',
      '`!npcs`    — NPC activity summary',
      '`!pause`   — pause the simulation',
      '`!resume`  — resume the simulation',
      '',
      '_I also auto-post when: players join/leave, epochs change, bootstrap completes._',
    ].join('\n')
  }

  _epochDisplayName(epoch) {
    return (epoch ?? 'unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  async _post(text) {
    if (!this.web) return
    try {
      await this.web.chat.postMessage({ channel: CHANNEL, text })
    } catch (err) {
      console.error('[SlackAgent] Failed to post:', err.message)
    }
  }
}
