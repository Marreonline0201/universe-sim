// ── WorldSocket ────────────────────────────────────────────────────────────────
// WebSocket wrapper with auto-reconnect (exponential backoff).
// Dispatches incoming server messages to multiplayerStore and gameStore.

import { useMultiplayerStore } from '../store/multiplayerStore'
import { useGameStore } from '../store/gameStore'
import { useSettlementStore } from '../store/settlementStore'
import { useOutlawStore } from '../store/outlawStore'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { useWeatherStore } from '../store/weatherStore'
import type { SectorWeather } from '../store/weatherStore'
import { useSeasonStore } from '../store/seasonStore'
import type { SeasonState } from '../store/seasonStore'
import { useShopStore } from '../store/shopStore'
import type { ShopCatalogItem } from '../store/shopStore'
import { inventory, techTree } from '../game/GameSingletons'
import type { LocalSimManager } from '../engine/LocalSimManager'
import { useDiplomacyStore } from '../store/diplomacyStore'

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
        mp.setRemoteNpcs((msg.npcs as RemoteNpc[]) ?? [])
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
        // M7: Seed outlaw wanted list from remote players' murder counts.
        // Server threshold is 5; reward formula mirrors OutlawSystem.getBountyReward.
        {
          const WANTED_THRESHOLD = 5
          const os = useOutlawStore.getState()
          for (const rp of remotePlayers) {
            const mc = (rp as any).murderCount as number ?? 0
            if (mc >= WANTED_THRESHOLD) {
              const reward = 200 + mc * 150
              os.upsertWantedPlayer({ playerId: rp.userId, username: rp.username, murderCount: mc, reward })
            }
          }
        }
        mp.setServerWorld(
          msg.simTime as number,
          msg.timeScale as number,
          msg.paused as boolean,
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
        } else if (msg.result) {
          useUiStore.getState().addNotification(`Trade failed: ${msg.result}`, 'warning')
        }
        break
      }

      case 'GATES_CLOSED': {
        useSettlementStore.getState().setGatesClosed(msg.settlementId as number)
        break
      }

      // ── M7 Track 2: PvP Outlaw System ──────────────────────────────────────

      case 'MURDER_COUNT_UPDATE': {
        // Server confirms killer's new murder count after a kill.
        const newCount = msg.murderCount as number
        usePlayerStore.getState().setMurderCount(newCount)
        // Show tiered NPC reaction message
        if (newCount === 1) {
          useUiStore.getState().addNotification(
            'Murder committed. Strangers are wary of you. Shop prices increased.',
            'warning'
          )
        } else if (newCount === 3) {
          useUiStore.getState().addNotification(
            'Settlement gates have closed to you. Trade refused.',
            'error'
          )
        } else if (newCount >= 5) {
          useUiStore.getState().addNotification(
            `Wanted! A bounty has been posted on your head. NPC guards attack on sight.`,
            'error'
          )
        } else {
          useUiStore.getState().addNotification(
            `Murder count: ${newCount}. Your infamy grows.`,
            'warning'
          )
        }
        break
      }

      case 'BOUNTY_POSTED': {
        // Broadcast to all clients — a player has become wanted.
        const entry = {
          playerId:    msg.playerId    as string,
          username:    msg.username    as string,
          murderCount: msg.murderCount as number,
          reward:      msg.reward      as number,
        }
        useOutlawStore.getState().upsertWantedPlayer(entry)
        useOutlawStore.getState().setPendingBountyNotif(entry)
        // Also update remote player murderCount in multiplayer store so
        // the skull label is immediately correct for everyone
        const mp = useMultiplayerStore.getState()
        const existing = mp.remotePlayers.get(entry.playerId)
        if (existing) {
          mp.upsertRemotePlayer({ ...existing, murderCount: entry.murderCount })
        }
        useUiStore.getState().addNotification(
          `WANTED: ${entry.username} — ${entry.murderCount} kills — ${entry.reward} copper bounty`,
          'error'
        )
        break
      }

      case 'BOUNTY_COLLECTED': {
        // Server grants bounty reward to this client.
        const reward     = msg.reward     as number
        const materialId = msg.materialId as number
        inventory.addItem({ itemId: 0, materialId, quantity: reward, quality: 0.9 })
        useUiStore.getState().addNotification(
          `Bounty collected! +${reward} Copper added to inventory.`,
          'discovery'
        )
        break
      }

      case 'BOUNTY_COLLECT_BROADCAST': {
        // All clients learn that someone collected a bounty.
        const { collectorName, targetName, reward } = msg
        useUiStore.getState().addNotification(
          `${collectorName as string} claimed ${reward as number} copper bounty — killed outlaw ${targetName as string}`,
          'info'
        )
        // Remove from wanted list — target died and bounty was claimed
        useOutlawStore.getState().removeWantedPlayer(msg.targetId as string)
        break
      }

      case 'REDEMPTION_QUEST_OFFERED': {
        useOutlawStore.getState().setActiveQuest({
          questId:      msg.questId      as string,
          questType:    msg.questType    as 'escort' | 'resource_delivery' | 'settlement_defense',
          settlementId: msg.settlementId as number,
          progress:     0,
          required:     msg.required     as number,
          expiresAt:    msg.expiresAt    as number,
        })
        const typeLabels: Record<string, string> = {
          escort:              'Escort an NPC between two points (120s)',
          resource_delivery:   'Deliver 10x Iron Ingot or 20x Wood to the settlement',
          settlement_defense:  'Kill an attacking predator near the settlement',
        }
        useUiStore.getState().addNotification(
          `Redemption quest offered: ${typeLabels[msg.questType as string] ?? String(msg.questType)}. Complete it to reduce your criminal record.`,
          'discovery'
        )
        break
      }

      case 'REDEMPTION_QUEST_DENIED': {
        useUiStore.getState().addNotification(
          'The settlement leader has no task for you — your record is clean.',
          'info'
        )
        break
      }

      case 'REDEMPTION_QUEST_PROGRESS_ACK': {
        const { questId, progress, required } = msg
        useOutlawStore.getState().updateQuestProgress(questId as string, progress as number)
        useUiStore.getState().addNotification(
          `Quest progress: ${progress as number}/${required as number}`,
          'info'
        )
        break
      }

      case 'REDEMPTION_QUEST_COMPLETE': {
        const newCount = msg.newMurderCount as number
        usePlayerStore.getState().setMurderCount(newCount)
        useOutlawStore.getState().setActiveQuest(null)
        useUiStore.getState().addNotification(
          `Redemption complete! Criminal record reduced to ${newCount} murder${newCount !== 1 ? 's' : ''}.`,
          'discovery'
        )
        break
      }

      case 'REDEMPTION_QUEST_ERROR': {
        useUiStore.getState().addNotification(
          `Quest error: ${msg.reason as string}. The opportunity has passed.`,
          'warning'
        )
        useOutlawStore.getState().setActiveQuest(null)
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
        techTree.markResearched('iron_smelting')
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
        techTree.markResearched('steel_making')
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

      // ── M10 Track C: Advanced Trade Economy ─────────────────────────────────

      case 'SHOP_OPEN': {
        useShopStore.getState().openShop(
          msg.settlementId   as number,
          msg.settlementName as string,
          (msg.catalog as ShopCatalogItem[]) ?? [],
        )
        break
      }

      case 'SHOP_CATALOG_UPDATE': {
        if (useShopStore.getState().settlementId === msg.settlementId as number) {
          useShopStore.getState().updateCatalog((msg.catalog as ShopCatalogItem[]) ?? [])
        }
        break
      }

      case 'SHOP_BUY_RESULT':
      case 'SHOP_SELL_RESULT': {
        // Server acknowledgement — client already applied the transaction optimistically
        if (!(msg.ok as boolean)) {
          useUiStore.getState().addNotification(
            `Transaction failed: ${msg.reason as string ?? 'server error'}`, 'warning'
          )
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
        // Unlock gunpowder + telescope knowledge when first mayor is appointed
        techTree.markResearched('chemistry')
        techTree.markResearched('optics')
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

      default:
        break
    }
  }
}

// Re-export types so callers don't need to import from multiplayerStore
import type { RemotePlayer, RemoteNpc } from '../store/multiplayerStore'
export type { RemotePlayer, RemoteNpc }
