// ── DayNightEventSystem.ts ─────────────────────────────────────────────────
// M52 Track C: Dynamic Day/Night Events
// Manages time-of-day triggered events (wolf packs, bandit raids, etc.)
// Call onTimeTransition() on period changes, tickDayNightEvents() every frame.

export type DayNightEventType =
  | 'wolf_howl'
  | 'bandit_raid'
  | 'ghost_sighting'
  | 'meteor_shower'
  | 'dawn_chorus'
  | 'dusk_mist'
  | 'midnight_market'
  | 'solar_blessing'

export interface DayNightEvent {
  id: string
  type: DayNightEventType
  title: string
  description: string
  icon: string
  timeWindow: 'night' | 'dawn' | 'dusk' | 'day'
  triggeredAt: number   // sim seconds
  expiresAt: number     // triggeredAt + duration
  effect: string        // human-readable effect description
  active: boolean
}

interface EventDefinition {
  title: string
  description: string
  icon: string
  timeWindow: 'night' | 'dawn' | 'dusk' | 'day'
  durationSecs: number
  effect: string
  chance: number
}

const EVENT_DEFINITIONS: Record<DayNightEventType, EventDefinition> = {
  wolf_howl: {
    title: 'Wolf Pack Nearby',
    icon: '🐺',
    timeWindow: 'night',
    durationSecs: 120,
    chance: 0.15,
    effect: '+30% wild animal encounter rate',
    description: 'Howling echoes through the darkness.',
  },
  bandit_raid: {
    title: 'Bandit Raid Warning',
    icon: '🗡',
    timeWindow: 'night',
    durationSecs: 90,
    chance: 0.08,
    effect: 'Bandits may attack settlements',
    description: 'Torches spotted on the ridge — raiders approach.',
  },
  ghost_sighting: {
    title: 'Ghostly Apparition',
    icon: '👻',
    timeWindow: 'night',
    durationSecs: 60,
    chance: 0.05,
    effect: '+20% magic resource drops',
    description: 'A translucent figure drifts through the mist.',
  },
  meteor_shower: {
    title: 'Meteor Shower',
    icon: '☄️',
    timeWindow: 'night',
    durationSecs: 180,
    chance: 0.03,
    effect: 'Rare minerals may be found',
    description: 'Streaks of light cross the sky.',
  },
  dawn_chorus: {
    title: 'Dawn Chorus',
    icon: '🌅',
    timeWindow: 'dawn',
    durationSecs: 60,
    chance: 0.6,
    effect: '+10% XP gain for 1 minute',
    description: 'Birds fill the early morning air with song.',
  },
  dusk_mist: {
    title: 'Evening Mist',
    icon: '🌫️',
    timeWindow: 'dusk',
    durationSecs: 90,
    chance: 0.4,
    effect: '-20% visibility, +15% stealth',
    description: 'A thick mist rolls in from the valley.',
  },
  midnight_market: {
    title: 'Midnight Market',
    icon: '🏮',
    timeWindow: 'night',
    durationSecs: 120,
    chance: 0.04,
    effect: 'Secret traders offer rare goods',
    description: 'Lanterns appear in the forest clearing.',
  },
  solar_blessing: {
    title: 'Solar Blessing',
    icon: '☀️',
    timeWindow: 'day',
    durationSecs: 300,
    chance: 0.02,
    effect: '+15% crop growth, +5% health regen',
    description: 'The sun shines with unusual warmth.',
  },
}

// ── Module state ──────────────────────────────────────────────────────────────

let activeEvents: DayNightEvent[] = []
let eventHistory: DayNightEvent[] = []  // capped at last 20
let _eventCounter = 0

// ── Public getters ────────────────────────────────────────────────────────────

export function getActiveEvents(): DayNightEvent[] {
  return activeEvents
}

export function getEventHistory(): DayNightEvent[] {
  return eventHistory
}

// ── onTimeTransition ──────────────────────────────────────────────────────────
// Call from GameLoop whenever the time period changes.
// Rolls each event definition whose timeWindow matches the new period.

export function onTimeTransition(
  newPeriod: 'dawn' | 'day' | 'dusk' | 'night',
  simSeconds: number,
): void {
  for (const [typeKey, def] of Object.entries(EVENT_DEFINITIONS) as [DayNightEventType, EventDefinition][]) {
    if (def.timeWindow !== newPeriod) continue
    if (Math.random() >= def.chance) continue

    _eventCounter += 1
    const event: DayNightEvent = {
      id: `dne_${typeKey}_${_eventCounter}`,
      type: typeKey,
      title: def.title,
      description: def.description,
      icon: def.icon,
      timeWindow: def.timeWindow,
      triggeredAt: simSeconds,
      expiresAt: simSeconds + def.durationSecs,
      effect: def.effect,
      active: true,
    }

    activeEvents.push(event)

    window.dispatchEvent(
      new CustomEvent('daynight-event', {
        detail: { type: typeKey, title: def.title, icon: def.icon, timeWindow: def.timeWindow },
      }),
    )
  }
}

// ── tickDayNightEvents ────────────────────────────────────────────────────────
// Call from GameLoop every frame to expire stale events.

export function tickDayNightEvents(simSeconds: number): void {
  const expired: DayNightEvent[] = []
  const still: DayNightEvent[] = []

  for (const ev of activeEvents) {
    if (simSeconds > ev.expiresAt) {
      expired.push({ ...ev, active: false })
    } else {
      still.push(ev)
    }
  }

  if (expired.length > 0) {
    activeEvents = still
    for (const ev of expired) {
      eventHistory.unshift(ev)
      window.dispatchEvent(
        new CustomEvent('daynight-event-expired', {
          detail: { id: ev.id, type: ev.type },
        }),
      )
    }
    // Keep history capped at 20
    if (eventHistory.length > 20) {
      eventHistory = eventHistory.slice(0, 20)
    }
  }
}
