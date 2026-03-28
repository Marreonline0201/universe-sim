// ── WorldSocket ────────────────────────────────────────────────────────────────
// WebSocket wrapper with auto-reconnect (exponential backoff).
// Dispatches incoming server messages to multiplayerStore and gameStore.

import { useMultiplayerStore } from '../store/multiplayerStore'
import { useGameStore } from '../store/gameStore'
import { useSettlementStore } from '../store/settlementStore'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { useWeatherStore } from '../store/weatherStore'
import type { SectorWeather } from '../store/weatherStore'
// seasonStore removed
type SeasonState = { season: string; seasonIndex: number; progress: number; tempModifier: number; rainfallProb: number; isSnow: boolean; metabolicMult: number }
const useSeasonStore = { getState: () => ({ setSeason: (_s: Partial<SeasonState>) => {} }) }
import { inventory } from '../game/GameSingletons'
import type { LocalSimManager } from '../engine/LocalSimManager'
// diplomacyStore, RadioSystem, VelarStore, OrbitalMechanicsSystem,
// WorldEventSystem, TradePostStore, PartyStore removed
const useDiplomacyStore = { getState: () => ({
  setRelation: (..._args: unknown[]) => {},
  setGateClosed: (..._args: unknown[]) => {},
  setMayor: (..._args: unknown[]) => {},
  addNotification: (..._args: unknown[]) => {},
}) }
function receiveRadioBroadcast(..._args: unknown[]) {}
function registerTower(..._args: unknown[]) {}
const useVelarStore = { getState: () => ({
  markDecoded: (..._args: unknown[]) => {},
  setVelarResponseReceived: (..._args: unknown[]) => {},
  markResponseReceived: (..._args: unknown[]) => {},
  markGatewayRevealed: (..._args: unknown[]) => {},
  activateGateway: (..._args: unknown[]) => {},
  addProbeResult: (..._args: unknown[]) => {},
  reactorMeltdown: false,
  triggerMeltdown: (..._args: unknown[]) => {},
  clearMeltdown: (..._args: unknown[]) => {},
}) }
const SYSTEM_PLANETS: Array<{ name: string }> = []
function triggerWorldEvent(..._args: unknown[]) {}
function expireWorldEvent(..._args: unknown[]) {}
function updateEventParticipants(..._args: unknown[]) {}
type WorldEventType = string
import { receiveChatMessage } from '../ui/ChatBox'

// Module-level reference to the active LocalSimManager.
// Set by SceneRoot after the sim grid initialises.
let _simManager: LocalSimManager | null = null
export function setSimManagerForSocket(mgr: LocalSimManager | null): void {
  _simManager = mgr
}

const MIN_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

export class WorldSocket {
  private ws: WebSocket | null = null
  private _backoff = MIN_BACKOFF_MS
  private _destroyed = false
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly url: string,
    private readonly userId: string,
    private readonly username: string,
  ) {}

  connect(): void {
    if (this._destroyed) return
    const mp = useMultiplayerStore.getState()
    mp.setConnectionStatus('connecting')

    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this._scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this._backoff = MIN_BACKOFF_MS
      useMultiplayerStore.getState().setConnectionStatus('connected')
      this._send({ type: 'JOIN', userId: this.userId, username: this.username })
    }

    this.ws.onmessage = (evt) => {
      let msg: unknown
      try { msg = JSON.parse(evt.data as string) } catch { return }
      this._dispatch(msg as Record<string, unknown>)
    }

    this.ws.onclose = () => {
      useMultiplayerStore.getState().setConnectionStatus('disconnected')
      if (!this._destroyed) this._scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose fires after onerror — reconnect logic lives there
    }
  }

  /** Send a typed message to the server. */
  send(msg: Record<string, unknown>): void {
    this._send(msg)
  }

  destroy(): void {
    this._destroyed = true
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer)
    this.ws?.close()
    this.ws = null
    useMultiplayerStore.getState().setConnectionStatus('disconnected')
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private _send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private _scheduleReconnect(): void {
    if (this._destroyed) return
    this._reconnectTimer = setTimeout(() => {
      this._backoff = Math.min(this._backoff * 2, MAX_BACKOFF_MS)
      this.connect()
    }, this._backoff)
  }

  private _dispatch(msg: Record<string, unknown>): void {
    const mp = useMultiplayerStore.getState()
    const game = useGameStore.getState()

    switch (msg.type) {
      case 'WORLD_SNAPSHOT': {
        // Filter out own player — the server echoes our own entry back.
        // Clerk returns null in DEV_BYPASS mode so we compare against this.userId
        // (the actual ID sent to the server, e.g. 'dev-local').
        const allPlayers = (msg.players as RemotePlayer[]) ?? []
        const remotePlayers = allPlayers.filter(p => p.userId !== this.userId)
        mp.setRemotePlayers(remotePlayers)
        // Seed depleted node state for newly joining player
        if (Array.isArray(msg.depletedNodes)) {
          mp.setDepletedNodes(msg.depletedNodes as number[])
        }
        // M6: Seed settlement state for newly joining player
        if (Array.isArray(msg.settlements)) {
          useSettlementStore.getState().setSettlements(msg.settlements as any[])
        }
        // M8: Seed weather state for newly joining player
        if (Array.isArray(msg.weather)) {
          useWeatherStore.getState().setSectors(msg.weather as SectorWeather[])
        }
        // M10 Track A: Seed season state for newly joining player
        if (msg.season && typeof msg.season === 'object') {
          useSeasonStore.getState().setSeason(msg.season as SeasonState)
        }
        const rawWorldSeed = msg.worldSeed
        const worldSeed = typeof rawWorldSeed === 'number' && Number.isFinite(rawWorldSeed)
          ? (Math.floor(rawWorldSeed) >>> 0)
          : 42
        if (rawWorldSeed === undefined) {
          console.warn('[WorldSocket] WORLD_SNAPSHOT missing worldSeed, using fallback 42')
        }
        mp.setServerWorld(
          msg.simTime as number,
          msg.timeScale as number,
          msg.paused as boolean,
          worldSeed,
        )
        mp.setBootstrapState(
          !!(msg.bootstrapPhase),
          (msg.bootstrapProgress as number) ?? 0,
        )
        // Sync game store time/scale/simTime with server authority.
        game.setTimeScale(msg.timeScale as number)
        game.setEpoch(msg.epoch as string ?? 'stellar')
        // Snap simSeconds to server if significantly out of sync.
        const serverSim = msg.simTime as number
        const diff = serverSim - game.simSeconds
        const ts   = Math.max(1, game.timeScale)
        const snapFwd = diff > ts * 5    // server >5 real-sec ahead → snap up
        const snapBwd = diff < -ts * 60  // client >60 real-sec ahead → snap down
        if (snapFwd || snapBwd) {
          game.setSimSeconds(serverSim)
        }
        if (msg.paused !== undefined) {
          const paused = msg.paused as boolean
          if (paused !== game.paused) game.togglePause()
        }
        // M14: Seed known universe instances
        if (Array.isArray(msg.universes)) {
          window.dispatchEvent(new CustomEvent('universes-updated', { detail: msg.universes }))
        }
        break
      }
      case 'PLAYER_JOINED': {
        const p = msg.player as RemotePlayer
        if (p) mp.upsertRemotePlayer(p)
        break
      }
      case 'PLAYER_LEFT': {
        mp.removeRemotePlayer(msg.userId as string)
        break
      }
      case 'NODE_DESTROYED': {
        // Server confirmed a node was depleted — hide it on this client.
        mp.addDepletedNode(msg.nodeId as number)
        break
      }
      case 'NODE_RESPAWNED': {
        // Server timer fired — make the node visible again on this client.
        mp.removeDepletedNode(msg.nodeId as number)
        break
      }
      case 'FIRE_STARTED': {
        // Another player ignited a fire — replicate ignition in local sim grid.
        const fx = msg.x as number
        const fy = msg.y as number
        const fz = msg.z as number
        if (_simManager) {
          _simManager.ignite(fx, fy, fz)
        }
        break
      }

      // ── M6: NPC Civilization ─────────────────────────────────────────────────

      case 'SETTLEMENT_UPDATE': {
        // A settlement changed its civ level or inventory
        const ss = useSettlementStore.getState()
        const existing = ss.settlements.get(msg.settlementId as number)
        if (existing) {
          ss.upsertSettlement({
            ...existing,
            civLevel:    msg.civLevel    as number,
            resourceInv: (msg.resourceInv as Record<string, number>) ?? existing.resourceInv,
          })
        }
        break
      }

      case 'TRADE_OFFER': {
        useSettlementStore.getState().setPendingOffer({
          settlementId:   msg.settlementId   as number,
          settlementName: msg.settlementName as string,
          civLevel:       msg.civLevel       as number,
          offerMats:      (msg.offerMats     as Record<string, number>) ?? {},
          wantMats:       (msg.wantMats      as Record<string, number>) ?? {},
          trustScore:     (msg.trustScore    as number) ?? 0,
        })
        break
      }

      case 'TRADE_RESULT': {
        // Server confirms trade outcome — clear the pending offer regardless
        useSettlementStore.getState().setPendingOffer(null)
        if (msg.result === 'ok') {
          // Deduct what the player gave
          const gives = (msg.playerGives as Record<string, number>) ?? {}
          for (const [matIdStr, qty] of Object.entries(gives)) {
            const matId = parseInt(matIdStr)
            let remaining = qty
            for (let i = 0; i < inventory.slotCount && remaining > 0; i++) {
              const slot = inventory.getSlot(i)
              if (slot && slot.itemId === 0 && slot.materialId === matId) {
                const take = Math.min(slot.quantity, remaining)
                inventory.removeItem(i, take)
                remaining -= take
              }
            }
          }
          // Add what the player received
          const receives = (msg.playerReceives as Record<string, number>) ?? {}
          for (const [matIdStr, qty] of Object.entries(receives)) {
            inventory.addItem({ itemId: 0, materialId: parseInt(matIdStr), quantity: qty, quality: 0.8 })
          }
          useUiStore.getState().addNotification('Trade complete!', 'info')
          // Record trade time for the settlement — drives 💰 activity indicator
          const tradedSettlementId = useSettlementStore.getState().nearSettlementId
          if (tradedSettlementId !== null) {
            useSettlementStore.getState().recordTrade(tradedSettlementId)
          }
        } else if (msg.result) {
          useUiStore.getState().addNotification(`Trade failed: ${msg.result}`, 'warning')
        }
        break
      }

      case 'GATES_CLOSED': {
        useSettlementStore.getState().setGatesClosed(msg.settlementId as number)
        break
      }

      // ── M8: Weather System ──────────────────────────────────────────────────

      case 'WEATHER_UPDATE': {
        // Server broadcasts a sector weather transition.
        // Update the store so WeatherRenderer and HUD reflect the new state immediately.
        useWeatherStore.getState().updateSector({
          sectorId:    msg.sectorId    as number,
          state:       msg.state       as SectorWeather['state'],
          temperature: msg.temperature as number,
          humidity:    msg.humidity    as number,
          windDir:     msg.windDir     as number,
          windSpeed:   msg.windSpeed   as number,
        })
        // Notify player only if it's their current sector
        const ws = useWeatherStore.getState()
        if (msg.sectorId === ws.playerSectorId) {
          const label =
            msg.state === 'STORM'  ? 'A violent storm is upon you!' :
            msg.state === 'RAIN'   ? 'Rain begins to fall.' :
            msg.state === 'CLOUDY' ? 'Clouds roll in.' :
                                     'Skies are clearing.'
          useUiStore.getState().addNotification(label, 'info')
        }
        break
      }

      // ── M7: Iron Age discovery ──────────────────────────────────────────────

      case 'SETTLEMENT_UNLOCKED_IRON': {
        // A settlement reached civLevel 2 — iron smelting knowledge spreads world-wide.
        // Mark iron_smelting as researched so the Blast Furnace building appears in
        // BuildPanel (gated on isTierUnlocked(2) → iron_smelting tech) and iron
        // crafting recipes appear in CraftingPanel (gated on hasAllKnowledge).
        const name = msg.settlementName as string
        useUiStore.getState().addNotification(
          `Iron Age dawns! ${name} has mastered iron smelting. Open Build panel to place a Blast Furnace (8x Stone + 4x Iron Ore + 2x Clay).`,
          'discovery'
        )
        break
      }

      // ── M8: Steel Age discovery ─────────────────────────────────────────────

      case 'SETTLEMENT_UNLOCKED_STEEL': {
        // A settlement reached civLevel 3 — steel/advanced metallurgy spreads world-wide.
        // Mark steel_making as researched: unlocks steel sword/chestplate/crossbow recipes
        // in CraftingPanel (knowledgeRequired: ['iron_smelting', 'steel_making']).
        const steelName = msg.settlementName as string
        useUiStore.getState().addNotification(
          `Steel Age dawns! ${steelName} has mastered carburization (Fe + C → steel). Heat iron ingot + charcoal to 1200°C in blast furnace, then QUENCH in water within 30s!`,
          'discovery'
        )
        // Pre-discover steel recipes
        inventory.discoverRecipe(71)  // steel sword
        inventory.discoverRecipe(72)  // steel chestplate
        inventory.discoverRecipe(73)  // steel crossbow
        inventory.discoverRecipe(74)  // cast iron pot
        inventory.discoverRecipe(75)  // cast iron door
        break
      }

      // ── M10 Track A: Season system ──────────────────────────────────────────

      case 'SEASON_CHANGED': {
        useSeasonStore.getState().setSeason({
          season:        msg.season        as SeasonState['season'],
          seasonIndex:   msg.seasonIndex   as number,
          progress:      msg.progress      as number,
          tempModifier:  msg.tempModifier  as number,
          rainfallProb:  msg.rainfallProb  as number,
          isSnow:        msg.isSnow        as boolean,
          metabolicMult: msg.metabolicMult as number,
        })
        const seasonLabels: Record<string, string> = {
          SPRING: 'Spring has arrived — blossoms fill the air, rainfall increases.',
          SUMMER: 'Summer is here — temperatures rise +10°C, wildlife is active.',
          AUTUMN: 'Autumn descends — leaves turn amber, prepare food stores.',
          WINTER: 'Winter approaches — temperatures drop -15°C, fire is essential!',
        }
        const label = seasonLabels[msg.season as string]
        if (label && msg.progress as number < 0.05) {
          useUiStore.getState().addNotification(label, 'info')
        }
        break
      }

      // ── M11: Civilization Age — Mayor + Diplomacy ───────────────────────────

      case 'MAYOR_APPOINTED': {
        const ds = useDiplomacyStore.getState()
        ds.setMayor({
          settlementId:   msg.settlementId   as number,
          settlementName: msg.settlementName as string,
          mayorNpcId:     msg.mayorNpcId     as number,
          mayorName:      msg.mayorName      as string,
          appointedAt:    Date.now(),
        })
        ds.addNotification({
          type: 'mayor',
          message: `${msg.settlementName as string} appoints ${msg.mayorName as string} as mayor. Civilization advances.`,
          timestamp: Date.now(),
        })
        useUiStore.getState().addNotification(
          `Civilization Age! ${msg.settlementName as string} has elected mayor ${msg.mayorName as string}. City walls and diplomacy are now possible.`,
          'discovery'
        )
        inventory.discoverRecipe(88)   // gunpowder
        inventory.discoverRecipe(89)   // musket
        inventory.discoverRecipe(90)   // musket balls
        inventory.discoverRecipe(91)   // glass ingot
        inventory.discoverRecipe(92)   // telescope
        break
      }

      case 'DIPLOMATIC_EVENT': {
        const ds = useDiplomacyStore.getState()
        const idA    = msg.settlementA as number
        const idB    = msg.settlementB as number
        const nameA  = msg.nameA       as string
        const nameB  = msg.nameB       as string
        const status = msg.status      as 'neutral' | 'allied' | 'war' | 'trade_partner'
        const evType = msg.eventType   as string

        ds.setRelation({ settlementA: idA, settlementB: idB, status, updatedAt: Date.now() })

        const notifType: 'war' | 'peace' | 'envoy' | 'mayor' =
          evType === 'WAR_DECLARED'    ? 'war'   :
          evType === 'ALLIANCE_FORMED' ? 'peace' : 'envoy'

        const message =
          evType === 'WAR_DECLARED'    ? `WAR: ${nameA} has declared war on ${nameB}. Trade suspended between settlements.` :
          evType === 'ALLIANCE_FORMED' ? `ALLIANCE: ${nameA} and ${nameB} form a military alliance.` :
          `Envoy: ${nameA} establishes trade relations with ${nameB}.`

        ds.addNotification({ type: notifType, message, timestamp: Date.now() })

        if (evType === 'WAR_DECLARED') {
          useUiStore.getState().addNotification(
            `War declared: ${nameA} vs ${nameB}. NPC guards may be hostile in contested territory.`,
            'error'
          )
        } else if (evType === 'ALLIANCE_FORMED') {
          useUiStore.getState().addNotification(
            `Alliance formed: ${nameA} and ${nameB}. Trade routes open between all allied settlements.`,
            'info'
          )
        }
        break
      }

      // ── M12: Space Age ──────────────────────────────────────────────────────

      case 'CIVILIZATION_L6': {
        // A settlement entered Space Age (civLevel 6).
        // Unlock electronics + rocketry knowledge and discover Space Age recipes.
        const sName = msg.settlementName as string
        useUiStore.getState().addNotification(
          `Space Age! ${sName} has reached Civilization Level 6. Generators, radio towers, and rocket launches are now possible!`,
          'discovery'
        )
        inventory.discoverRecipe(93)   // circuit board
        inventory.discoverRecipe(94)   // generator (building)
        inventory.discoverRecipe(95)   // radio tower (building)
        inventory.discoverRecipe(96)   // rocket fuel
        inventory.discoverRecipe(97)   // nuclear fuel
        inventory.discoverRecipe(98)   // satellite
        inventory.discoverRecipe(99)   // rocket
        // Register tower position for VFX
        if (typeof msg.x === 'number') {
          registerTower([msg.x as number, msg.y as number, msg.z as number], msg.settlementId as number)
        }
        break
      }

      case 'ROCKET_ORBIT_ACHIEVED': {
        // Server confirms a rocket entered orbit.
        const launcherName = msg.launcherName as string
        useUiStore.getState().addNotification(
          `Rocket launched by ${launcherName}! Orbit achieved. Something stirs in the cosmos...`,
          'discovery'
        )
        // Dispatch event so TelescopeView opens automatically if player has telescope equipped
        window.dispatchEvent(new CustomEvent('rocket-orbit-achieved', { detail: msg }))
        break
      }

      case 'ANOMALY_SIGNAL': {
        // Velar responds to the rocket launch after 30s delay.
        const signal = {
          launcherId:   msg.launcherId   as string,
          launcherName: msg.launcherName as string,
          message:      msg.message      as string,
          timestamp:    msg.timestamp    as number,
        }
        useUiStore.getState().addNotification(
          `ANOMALY SIGNAL DETECTED from Velar! Open your telescope to analyze.`,
          'discovery'
        )
        // Store in window for TelescopeView to pick up
        window.dispatchEvent(new CustomEvent('anomaly-signal', { detail: signal }))
        break
      }

      case 'RADIO_BROADCAST': {
        // Settlement radio tower broadcast — received by players in range.
        receiveRadioBroadcast(
          msg.settlementId   as number,
          msg.settlementName as string,
          msg.message        as string,
          (msg.towerPos      as [number, number, number]) ?? [0, 0, 0],
        )
        useUiStore.getState().addNotification(
          `[Radio] ${msg.settlementName as string}: ${msg.message as string}`,
          'info'
        )
        break
      }

      // ── M13: Velar Contact ──────────────────────────────────────────────────

      case 'VELAR_DECODED': {
        // Server confirms decode — broadcast to all players.
        const decoderName = msg.decoderName as string ?? 'Unknown'
        const decoderId   = msg.decoderId   as string ?? ''
        useVelarStore.getState().markDecoded(decoderId, decoderName)
        useUiStore.getState().addNotification(
          `First Contact! ${decoderName} has decoded the Velar signal. The universe is not empty.`,
          'discovery'
        )
        // Unlock M14 Velar Crystal + Velar Key recipes
        inventory.discoverRecipe(104)  // Velar Crystal
        inventory.discoverRecipe(105)  // Velar Key
        // Dispatch event so HUD can show FirstContactOverlay
        window.dispatchEvent(new CustomEvent('velar-first-contact', {
          detail: { decoderName, decoderId }
        }))
        break
      }

      case 'PROBE_LANDED': {
        // Server confirms orbital capsule probe landing.
        const planetName  = msg.planetName  as string
        const surfaceTemp = msg.surfaceTemp  as number
        const atmosphere  = msg.atmosphere   as string
        const resources   = (msg.resources   as string[]) ?? []
        const discoveredBy = msg.discoveredBy as string ?? ''

        useVelarStore.getState().addProbeResult({
          planetName, surfaceTemp, atmosphere, resources,
          discoveredAt: Date.now(),
          discoveredBy,
        })

        // Unlock new recipes from probe data (resources from other planets)
        const planetEntry = SYSTEM_PLANETS.find(p => p.name === planetName)
        if (planetEntry) {
          // Discover probe data recipes (future M14) — notification for now
        }

        useUiStore.getState().addNotification(
          `Probe landed on ${planetName}! Surface: ${surfaceTemp}K. Resources: ${resources.join(', ')}`,
          'discovery'
        )
        window.dispatchEvent(new CustomEvent('probe-landed', { detail: msg }))
        break
      }

      case 'REACTOR_MELTDOWN': {
        // Server confirms reactor meltdown — radiation zone active.
        // Guard: local player already triggered meltdown in NuclearReactorSystem._triggerMeltdown()
        const { pos, launcherName } = msg
        const vs = useVelarStore.getState()
        if (!vs.reactorMeltdown) {
          vs.triggerMeltdown(pos as [number, number, number])
          useUiStore.getState().addNotification(
            `REACTOR MELTDOWN${launcherName ? ` at ${launcherName as string}'s settlement` : ''}! Radiation zone active — 20m radius, 2 HP/s drain. Deliver Clay + Stone to contain.`,
            'error'
          )
        }
        break
      }

      case 'REACTOR_CLEANED': {
        // Server confirms meltdown contained.
        useVelarStore.getState().clearMeltdown()
        useUiStore.getState().addNotification(
          'Reactor meltdown contained! Radiation zone cleared.',
          'info'
        )
        break
      }

      // ── M14 Track A: Interplanetary transit ─────────────────────────────────

      case 'TRANSIT_LAUNCHED': {
        const { username, toPlanet } = msg
        if (msg.userId !== this.userId) {  // only show for other players
          useUiStore.getState().addNotification(
            `${username as string} has launched toward ${toPlanet as string ?? 'another planet'}!`,
            'info'
          )
        }
        break
      }

      case 'TRANSIT_ARRIVED_BROADCAST': {
        const { username, planet } = msg
        if (msg.userId !== this.userId) {
          useUiStore.getState().addNotification(
            `${username as string} has arrived at ${planet as string ?? 'Home'}.`,
            'info'
          )
        }
        break
      }

      // ── M14 Track B: Velar response + gateway ────────────────────────────────

      case 'VELAR_RESPONSE': {
        // Server sends Velar response after player probes Velar (2.1 AU).
        useVelarStore.getState().markResponseReceived()
        useUiStore.getState().addNotification(
          'VELAR RESPONSE RECEIVED — 5 symbols detected. Open the Velar Response Panel to decode.',
          'discovery'
        )
        window.dispatchEvent(new CustomEvent('velar-response-received', { detail: msg }))
        break
      }

      case 'VELAR_GATEWAY_REVEALED': {
        // Another player (or this player) decoded the Velar message.
        const { decoderName } = msg
        useVelarStore.getState().markGatewayRevealed()
        useUiStore.getState().addNotification(
          `${decoderName as string} decoded the Velar transmission! "WE ARE THE ORIGIN OF LIFE. COME HOME." A Velar Gateway has appeared 200m NE of spawn.`,
          'discovery'
        )
        window.dispatchEvent(new CustomEvent('velar-gateway-revealed'))
        break
      }

      case 'VELAR_GATEWAY_ACTIVATED': {
        // Velar Gateway activated — Velar World universe spawned.
        const { activatorName, velarSeed, universes } = msg
        useVelarStore.getState().activateGateway(velarSeed as number)
        if (Array.isArray(universes)) {
          window.dispatchEvent(new CustomEvent('universes-updated', { detail: universes }))
        }
        useUiStore.getState().addNotification(
          `MULTIVERSE UNLOCKED! ${activatorName as string} has activated the Velar Gateway. A new universe has been spawned — the Velar World awaits beyond the portal.`,
          'discovery'
        )
        window.dispatchEvent(new CustomEvent('velar-gateway-activated', { detail: { velarSeed } }))
        // transitStore removed
        break
      }

      case 'VELAR_GREETING': {
        // Server sends this when a player walks within 8m of a Velar NPC.
        const { npcIndex } = msg
        window.dispatchEvent(new CustomEvent('velar-greeting', {
          detail: { npcIndex: typeof npcIndex === 'number' ? npcIndex : 0 }
        }))
        break
      }

      case 'VELAR_TRADE_BROADCAST': {
        // Another player completed a Velar trade — show notification
        const { username, tradeId } = msg
        useUiStore.getState().addNotification(
          `${username as string} traded with a Velar citizen (${tradeId as string}).`,
          'info'
        )
        break
      }

      case 'VELAR_KNOWLEDGE_BROADCAST': {
        // Another player learned Velar fabrication — notify all
        const { username } = msg
        useUiStore.getState().addNotification(
          `${username as string} has learned Velar Fabrication. Recipes 106–110 now visible in their journal.`,
          'discovery'
        )
        break
      }

      case 'VELAR_PURPOSE_BROADCAST': {
        const { username } = msg
        useUiStore.getState().addNotification(
          `${username as string} spoke with the Velar and learned the purpose of the Lattice.`,
          'discovery'
        )
        break
      }

      // ── M37 Track A: World events ─────────────────────────────────────────────

      case 'WORLD_EVENT_START': {
        // Server broadcast: a new world event has started
        triggerWorldEvent(msg.eventType as WorldEventType | undefined)
        break
      }

      case 'WORLD_EVENT_END': {
        // Server broadcast: world event expired
        expireWorldEvent(msg.eventId as string | undefined)
        break
      }

      case 'WORLD_EVENT_PROGRESS': {
        // Server broadcast: participant count updated
        updateEventParticipants(msg.eventId as string, msg.participantCount as number)
        break
      }

      // ── M9 T3: Batch update — server bundles non-critical messages ──────────
      // Weather updates (8 per transition) and future NPC/animal position updates
      // arrive as a single BATCH_UPDATE payload to reduce per-message overhead.
      // Unpack and dispatch each sub-message through the same _dispatch path.
      case 'BATCH_UPDATE': {
        const messages = msg.messages as Record<string, unknown>[]
        if (Array.isArray(messages)) {
          for (const sub of messages) {
            this._dispatch(sub)
          }
        }
        break
      }

      // ── M39 Track B: Chat ─────────────────────────────────────────────────────
      case 'CHAT_MESSAGE': {
        receiveChatMessage({
          playerId:   msg.playerId   as string,
          username:   msg.username   as string,
          title:      msg.title      as string | undefined,
          titleColor: msg.titleColor as string | undefined,
          text:       msg.text       as string,
          channel:    (msg.channel   as 'global' | 'party' | 'system') ?? 'global',
          timestamp:  (msg.timestamp as number) ?? Date.now(),
        })
        break
      }

      default:
        break
    }
  }
}

// Re-export types so callers don't need to import from multiplayerStore
import type { RemotePlayer } from '../store/multiplayerStore'
export type { RemotePlayer }
