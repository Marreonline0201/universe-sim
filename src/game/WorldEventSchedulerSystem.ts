// src/game/WorldEventSchedulerSystem.ts
// M66 Track A: World Event Scheduler — calendar of upcoming world events with countdowns.

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScheduledEventCategory =
  | 'invasion'
  | 'festival'
  | 'eclipse'
  | 'migration'
  | 'storm'
  | 'trade_convoy'

export interface ScheduledWorldEvent {
  id: string
  category: ScheduledEventCategory
  name: string
  description: string
  icon: string
  scheduledAt: number   // simSeconds when it triggers
  duration: number      // simSeconds it stays active
  prepBonus: string     // bonus if player is "prepared"
  triggered: boolean
  active: boolean
}

// ── Category definitions ──────────────────────────────────────────────────────

interface CategoryDef {
  category: ScheduledEventCategory
  icon: string
  variants: Array<{
    name: string
    description: string
    duration: number
    prepBonus: string
  }>
}

const CATEGORY_DEFS: CategoryDef[] = [
  {
    category: 'invasion',
    icon: '⚔️',
    variants: [
      {
        name: 'Goblin Raid',
        description: 'A horde of goblins descends from the hills, targeting settlements and lone travellers.',
        duration: 600,
        prepBonus: 'Iron weapons deal +25% damage. Wearing armor reduces incoming damage by 15%.',
      },
      {
        name: 'Orc Invasion',
        description: 'Orc war-bands march from the eastern wastes, burning everything in their path.',
        duration: 900,
        prepBonus: 'Potions of Strength triple melee damage. Fortified shelters prevent siege damage.',
      },
      {
        name: 'Bandit Ambush',
        description: 'A organized gang of bandits has set traps along major trade routes.',
        duration: 450,
        prepBonus: 'Scouting skill reveals ambush positions. Crossbows fire before enemies can close.',
      },
    ],
  },
  {
    category: 'festival',
    icon: '🎉',
    variants: [
      {
        name: 'Harvest Festival',
        description: 'Settlements celebrate the autumn harvest with feasts, games, and merchant discounts.',
        duration: 1200,
        prepBonus: 'Bringing crops grants double reputation. Festival merchants stock rare seeds.',
      },
      {
        name: 'Midsummer Fair',
        description: 'A grand fair fills the plains with travelling performers and exotic traders.',
        duration: 1800,
        prepBonus: 'Gold-based trades give 20% bonus. Rare blueprints available at festival stalls.',
      },
      {
        name: 'Founders\' Day',
        description: 'Settlements commemorate their founding with parades and civic boosts.',
        duration: 900,
        prepBonus: 'Completing quests during festival awards triple gold. Faction rep gains doubled.',
      },
    ],
  },
  {
    category: 'eclipse',
    icon: '🌑',
    variants: [
      {
        name: 'Solar Eclipse',
        description: 'The sun dims as the moon crosses its face, warping arcane energies.',
        duration: 300,
        prepBonus: 'Spell damage +40% during eclipse. Dark creatures spawn at double rate.',
      },
      {
        name: 'Blood Moon',
        description: 'A crimson moon rises — undead and predators grow unnaturally bold.',
        duration: 600,
        prepBonus: 'Holy relics grant immunity to undead fear. Silver weapons deal critical hits.',
      },
      {
        name: 'Void Convergence',
        description: 'Dimensional ley-lines align, tearing rifts through which strange creatures emerge.',
        duration: 450,
        prepBonus: 'Arcane resistance potions halve rift damage. Staffs gain +50% cast speed.',
      },
    ],
  },
  {
    category: 'migration',
    icon: '🦅',
    variants: [
      {
        name: 'Great Bird Migration',
        description: 'Massive flocks cross the sky, providing unique feathers and hunting opportunities.',
        duration: 900,
        prepBonus: 'Bows yield double feather drops. Fletching materials cost half at merchants.',
      },
      {
        name: 'Wildebeest Stampede',
        description: 'Thundering herds traverse the plains — danger but also abundant meat and hides.',
        duration: 600,
        prepBonus: 'Spears deal triple damage to stampede animals. Butchering skill yields bonus hide.',
      },
      {
        name: 'Deep Sea Surge',
        description: 'Rare deep creatures surface near coastlines during seasonal pressure shifts.',
        duration: 750,
        prepBonus: 'Fishing rod with deep lure catches exotic fish. Harpoons deal 2x damage.',
      },
    ],
  },
  {
    category: 'storm',
    icon: '⛈️',
    variants: [
      {
        name: 'Arcane Thunderstorm',
        description: 'Magically-charged lightning strikes the landscape, energising certain materials.',
        duration: 600,
        prepBonus: 'Lightning rods harvest storm energy. Insulated armor prevents chain-lightning.',
      },
      {
        name: 'Blizzard Front',
        description: 'A wall of ice and snow sweeps across the region, freezing exposed travellers.',
        duration: 900,
        prepBonus: 'Fur armor prevents freezing debuff. Hot soup maintains body temp for 10 min.',
      },
      {
        name: 'Sandstorm Surge',
        description: 'A massive sandstorm scours the desert, unearthing buried ruins and relics.',
        duration: 750,
        prepBonus: 'Goggles prevent blinding. Digging tools find buried chests at double rate.',
      },
    ],
  },
  {
    category: 'trade_convoy',
    icon: '🚚',
    variants: [
      {
        name: 'Royal Merchant Convoy',
        description: 'A heavily-guarded royal convoy passes through, carrying rare luxury goods.',
        duration: 600,
        prepBonus: 'Gold reserves over 500 unlock exclusive deals. Escort quest available for rep.',
      },
      {
        name: 'Wandering Artificers',
        description: 'A group of skilled artificers travel the roads, selling enchanted equipment.',
        duration: 750,
        prepBonus: 'Bring gem components to unlock crafting upgrades. Blueprints at 30% discount.',
      },
      {
        name: 'Exotic Spice Caravan',
        description: 'Traders from distant lands arrive with rare spices and alchemical ingredients.',
        duration: 900,
        prepBonus: 'Alchemy skill 20+ halves ingredient costs. Rare potions stocked for 3x bonus.',
      },
    ],
  },
]

// ── State ─────────────────────────────────────────────────────────────────────

let _initialized = false
let _events: ScheduledWorldEvent[] = []
let _nextId = 1

function makeId(): string {
  return `sched_${_nextId++}`
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initWorldEventScheduler(currentSimSeconds = 0): void {
  if (_initialized) return
  _initialized = true
  _events = []
  _nextId = 1

  // Generate 6 upcoming events, spaced 300-900 simSeconds apart
  let cursor = currentSimSeconds + 300 + Math.random() * 600
  const usedCategories: ScheduledEventCategory[] = []

  for (let i = 0; i < 6; i++) {
    // Prefer variety — try to avoid repeating the last category
    let def: CategoryDef
    let attempts = 0
    do {
      def = pickRandom(CATEGORY_DEFS)
      attempts++
    } while (
      usedCategories.length > 0 &&
      usedCategories[usedCategories.length - 1] === def.category &&
      attempts < 5
    )

    const variant = pickRandom(def.variants)

    _events.push({
      id: makeId(),
      category: def.category,
      icon: def.icon,
      name: variant.name,
      description: variant.description,
      scheduledAt: Math.round(cursor),
      duration: variant.duration,
      prepBonus: variant.prepBonus,
      triggered: false,
      active: false,
    })

    usedCategories.push(def.category)
    cursor += 300 + Math.random() * 600
  }
}

// ── Tick ──────────────────────────────────────────────────────────────────────

export function tickScheduler(simSeconds: number): void {
  let changed = false

  for (const ev of _events) {
    // Trigger pending events
    if (!ev.triggered && simSeconds >= ev.scheduledAt) {
      ev.triggered = true
      ev.active = true
      changed = true
      window.dispatchEvent(new CustomEvent('scheduled-event-triggered', {
        detail: { event: ev },
      }))
    }

    // Expire active events
    if (ev.active && simSeconds >= ev.scheduledAt + ev.duration) {
      ev.active = false
      changed = true
    }
  }

  // Append a new future event if we're running low on upcoming ones
  if (changed) {
    const upcoming = _events.filter(e => !e.triggered)
    if (upcoming.length < 3) {
      const lastScheduled = _events.reduce((max, e) => Math.max(max, e.scheduledAt), simSeconds)
      const cursor = lastScheduled + 300 + Math.random() * 600
      const def = pickRandom(CATEGORY_DEFS)
      const variant = pickRandom(def.variants)
      _events.push({
        id: makeId(),
        category: def.category,
        icon: def.icon,
        name: variant.name,
        description: variant.description,
        scheduledAt: Math.round(cursor),
        duration: variant.duration,
        prepBonus: variant.prepBonus,
        triggered: false,
        active: false,
      })
    }
  }
}

// ── Accessors ─────────────────────────────────────────────────────────────────

export function getScheduledEvents(): ScheduledWorldEvent[] {
  return _events
}

export function getActiveScheduledEvents(): ScheduledWorldEvent[] {
  return _events.filter(e => e.active)
}

// ── Serialize / Deserialize ───────────────────────────────────────────────────

export interface SchedulerSaveData {
  events: ScheduledWorldEvent[]
  nextId: number
}

export function serializeScheduler(): SchedulerSaveData {
  return {
    events: _events.map(e => ({ ...e })),
    nextId: _nextId,
  }
}

export function deserializeScheduler(data: SchedulerSaveData): void {
  if (!data || !Array.isArray(data.events)) return
  _initialized = true
  _events = data.events.map(e => ({ ...e }))
  _nextId = typeof data.nextId === 'number' ? data.nextId : _nextId
}
