// ── ExpeditionSystem.ts ────────────────────────────────────────────────────
// M68 Track C: Player Expedition System
// Timer-based idle mechanic: send expeditions to explore regions,
// gather resources, and make discoveries. Returns loot after a set duration.

import { usePlayerStore } from '../store/playerStore'
import { useGameStore } from '../store/gameStore'

// ── Destination definitions ────────────────────────────────────────────────

export const EXPEDITION_DESTINATIONS = [
  {
    id: 'dark_forest',
    name: 'Dark Forest',
    icon: '🌲',
    duration: 120,
    goldCost: 50,
    danger: 'low' as const,
    description: 'Dense woods teeming with herbs and timber.',
    rewards: { gold: [20, 80] as [number, number], items: ['Lumber', 'Herbs', 'Mushrooms'], rareFind: 'Ancient Bark' },
  },
  {
    id: 'ruined_keep',
    name: 'Ruined Keep',
    icon: '🏚️',
    duration: 180,
    goldCost: 100,
    danger: 'medium' as const,
    description: 'Crumbling fortress hiding forgotten treasures.',
    rewards: { gold: [50, 150] as [number, number], items: ['Iron Ore', 'Old Coins', 'Stone'], rareFind: 'Enchanted Blade' },
  },
  {
    id: 'crystal_caves',
    name: 'Crystal Caves',
    icon: '💎',
    duration: 240,
    goldCost: 150,
    danger: 'medium' as const,
    description: 'Glittering caverns rich in rare minerals.',
    rewards: { gold: [80, 200] as [number, number], items: ['Crystal Shard', 'Silver Ore', 'Glowstone'], rareFind: 'Star Crystal' },
  },
  {
    id: 'coastal_cliffs',
    name: 'Coastal Cliffs',
    icon: '🌊',
    duration: 90,
    goldCost: 30,
    danger: 'low' as const,
    description: 'Windswept shores with sea treasures.',
    rewards: { gold: [15, 60] as [number, number], items: ['Sea Salt', 'Driftwood', 'Shells'], rareFind: 'Pearl' },
  },
  {
    id: 'volcano_peak',
    name: 'Volcano Peak',
    icon: '🌋',
    duration: 300,
    goldCost: 200,
    danger: 'high' as const,
    description: 'Treacherous summit with scorching rewards.',
    rewards: { gold: [150, 400] as [number, number], items: ['Magma Stone', 'Sulfur', 'Fire Crystal'], rareFind: 'Dragon Tooth' },
  },
  {
    id: 'frozen_tundra',
    name: 'Frozen Tundra',
    icon: '❄️',
    duration: 240,
    goldCost: 120,
    danger: 'medium' as const,
    description: 'Icy wastes hiding ancient frozen secrets.',
    rewards: { gold: [60, 180] as [number, number], items: ['Ice Shard', 'Frost Herb', 'Bone'], rareFind: 'Frozen Relic' },
  },
  {
    id: 'ancient_tomb',
    name: 'Ancient Tomb',
    icon: '⚰️',
    duration: 360,
    goldCost: 250,
    danger: 'high' as const,
    description: 'Sacred burial site of an ancient king.',
    rewards: { gold: [200, 500] as [number, number], items: ['Gold Artifact', 'Bone Dust', 'Old Scroll'], rareFind: 'Cursed Crown' },
  },
  {
    id: 'merchant_road',
    name: 'Merchant Road',
    icon: '🛤️',
    duration: 60,
    goldCost: 20,
    danger: 'low' as const,
    description: 'Busy trade route with many opportunities.',
    rewards: { gold: [10, 40] as [number, number], items: ['Trade Goods', 'Food', 'Cloth'], rareFind: "Merchant's Ledger" },
  },
]

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExpeditionResult {
  goldEarned: number
  itemsFound: string[]
  rareFind?: string    // 15% chance
  story: string        // one-sentence narrative
  success: boolean     // 90% success, 10% failure (partial loot only)
}

export interface ActiveExpedition {
  id: string
  destinationId: string
  startedAt: number    // simTime
  endsAt: number       // simTime
  status: 'ongoing' | 'returned' | 'failed'
  result?: ExpeditionResult
}

export interface ExpeditionSaveData {
  active: ActiveExpedition | null
  history: ActiveExpedition[]
  idCounter: number
}

// ── Story templates ────────────────────────────────────────────────────────

const STORY_TEMPLATES: Record<string, string[]> = {
  dark_forest: [
    'Your scout returned after navigating the gloomy thicket, arms full of gathered bounty.',
    'The expedition found a hidden grove and stripped it of its riches before nightfall.',
    'Strange rustling followed your party, but they emerged safe with full packs.',
  ],
  ruined_keep: [
    'Your crew pried open a sealed vault and hauled out crates of forgotten loot.',
    'The old garrison yielded more than expected — someone had hidden treasure behind the fireplace.',
    'Bats and broken stone did not stop your team from plundering the keep\'s depths.',
  ],
  crystal_caves: [
    'Flickering crystals lit the way as your miners extracted a king\'s haul of minerals.',
    'Deep in the cave a vein of pure ore was uncovered and quickly loaded onto the pack mule.',
    'The crystal choir echoed as your expedition chipped away at the luminous walls.',
  ],
  coastal_cliffs: [
    'Sea spray and gulls accompanied a fruitful morning of beachcombing along the cliffs.',
    'Tide pools and wave-worn crevices gave up shells and driftwood by the cartful.',
    'Your scout scrambled down the cliffside and returned with seaward treasures.',
  ],
  volcano_peak: [
    'Through sulfur fumes and scorching winds, your bravest returned singed but victorious.',
    'The summit\'s infernal glow lit the night as your team claimed its blazing rewards.',
    'Molten rivers were dodged and cooled slag was collected — a dangerous but profitable venture.',
  ],
  frozen_tundra: [
    'Frost-bitten but unbowed, your expedition dug through permafrost to ancient frozen caches.',
    'Ice-locked ruins surrendered their secrets to your crew\'s pickaxes in the bitter cold.',
    'The howling blizzard parted just long enough for your scouts to fill their sacks.',
  ],
  ancient_tomb: [
    'Traps were triggered and curses were muttered, yet the burial chamber gave up its riches.',
    'Crumbling hieroglyphs were ignored as your crew made off with the king\'s grave goods.',
    'A hidden antechamber full of offerings was discovered behind a false wall.',
  ],
  merchant_road: [
    'Your envoy mingled with passing caravans and struck several profitable side deals.',
    'A merchant\'s misfortune became your gain — they were happy to sell cheap and move on.',
    'Roadside trade and a bit of opportunism filled your agent\'s bags nicely.',
  ],
}

const FAILURE_STORIES: Record<string, string> = {
  dark_forest: 'Your expedition got lost in the dense undergrowth and returned with little to show for it.',
  ruined_keep: 'Structural collapse forced an early retreat — only a few items were salvaged.',
  crystal_caves: 'A cave-in blocked the richest vein; your crew barely made it out with partial haul.',
  coastal_cliffs: 'A sudden squall drove the crew back early; only a handful of shore finds were kept.',
  volcano_peak: 'An eruption scare sent everyone scrambling — only a fraction of the loot was saved.',
  frozen_tundra: 'A whiteout blizzard cut the expedition short; partial supplies were recovered.',
  ancient_tomb: 'A curse or trap was triggered — your team fled with only scraps of the promised loot.',
  merchant_road: 'A toll dispute and bad luck left your envoy with barely enough to cover expenses.',
}

// ── Module state ───────────────────────────────────────────────────────────

let _initialized = false
let _activeExpedition: ActiveExpedition | null = null
const _expeditionHistory: ActiveExpedition[] = []
let _idCounter = 0

// ── Helpers ────────────────────────────────────────────────────────────────

function getDestination(id: string) {
  return EXPEDITION_DESTINATIONS.find(d => d.id === id)
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickStory(destinationId: string, success: boolean): string {
  if (!success) {
    return FAILURE_STORIES[destinationId] ?? 'The expedition returned empty-handed after a series of misfortunes.'
  }
  const templates = STORY_TEMPLATES[destinationId]
  if (!templates || templates.length === 0) return 'The expedition returned with a haul of gathered goods.'
  return templates[Math.floor(Math.random() * templates.length)]
}

function generateResult(destinationId: string): ExpeditionResult {
  const dest = getDestination(destinationId)
  if (!dest) {
    return { goldEarned: 0, itemsFound: [], story: 'The expedition returned empty-handed.', success: false }
  }

  const success = Math.random() > 0.10  // 90% success rate

  const [minGold, maxGold] = dest.rewards.gold
  let goldEarned = randomInt(minGold, maxGold)
  if (!success) goldEarned = Math.floor(goldEarned * 0.3)  // partial loot on failure

  // Pick 1-3 items
  const itemCount = success ? randomInt(1, 3) : 1
  const shuffled = [...dest.rewards.items].sort(() => Math.random() - 0.5)
  const itemsFound = shuffled.slice(0, itemCount)

  // 15% chance of rare find (only on success)
  const rareFind = success && Math.random() < 0.15 ? dest.rewards.rareFind : undefined

  const story = pickStory(destinationId, success)

  return { goldEarned, itemsFound, rareFind, story, success }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function initExpeditionSystem(): void {
  if (_initialized) return
  _initialized = true
}

export function getDestinations(): typeof EXPEDITION_DESTINATIONS {
  return EXPEDITION_DESTINATIONS
}

export function getActiveExpedition(): ActiveExpedition | null {
  return _activeExpedition
}

export function getExpeditionHistory(): ActiveExpedition[] {
  return [..._expeditionHistory]
}

export function sendExpedition(destinationId: string): boolean {
  if (_activeExpedition) return false

  const dest = getDestination(destinationId)
  if (!dest) return false

  const spent = usePlayerStore.getState().spendGold(dest.goldCost)
  if (!spent) return false

  const simSeconds = useGameStore.getState().simSeconds

  const expedition: ActiveExpedition = {
    id: `exp_${++_idCounter}_${Date.now()}`,
    destinationId,
    startedAt: simSeconds,
    endsAt: simSeconds + dest.duration,
    status: 'ongoing',
  }

  _activeExpedition = expedition
  window.dispatchEvent(new CustomEvent('expedition-sent', { detail: { destinationId, duration: dest.duration } }))
  return true
}

export function claimExpedition(): ExpeditionResult | null {
  if (!_activeExpedition) return null
  if (_activeExpedition.status !== 'returned') return null

  const result = _activeExpedition.result ?? null
  if (!result) return null

  // Move to history, keep last 5
  _expeditionHistory.unshift({ ..._activeExpedition })
  if (_expeditionHistory.length > 5) _expeditionHistory.splice(5)

  _activeExpedition = null
  return result
}

export function tickExpeditions(simSeconds: number): void {
  if (!_activeExpedition) return
  if (_activeExpedition.status !== 'ongoing') return

  if (simSeconds >= _activeExpedition.endsAt) {
    const result = generateResult(_activeExpedition.destinationId)

    // Apply gold reward
    if (result.goldEarned > 0) {
      usePlayerStore.getState().addGold(result.goldEarned)
    }

    _activeExpedition.status = result.success ? 'returned' : 'returned'
    _activeExpedition.result = result

    window.dispatchEvent(new CustomEvent('expedition-returned', { detail: { result, destinationId: _activeExpedition.destinationId } }))
  }
}

export function serializeExpeditions(): ExpeditionSaveData {
  return {
    active: _activeExpedition ? { ..._activeExpedition } : null,
    history: [..._expeditionHistory],
    idCounter: _idCounter,
  }
}

export function deserializeExpeditions(data: ExpeditionSaveData): void {
  _initialized = true
  _activeExpedition = data.active ?? null
  _expeditionHistory.length = 0
  if (Array.isArray(data.history)) {
    _expeditionHistory.push(...data.history.slice(0, 5))
  }
  _idCounter = data.idCounter ?? 0
}
