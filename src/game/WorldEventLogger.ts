// ── WorldEventLogger ─────────────────────────────────────────────────────────
// M48 Track C: Listens to existing window events and logs them to worldEventStore.
// Also exports helper functions for game systems to call directly.

import { useWorldEventStore } from '../store/worldEventStore'

// ── Weather icon map ──────────────────────────────────────────────────────────
const WEATHER_ICONS: Record<string, string> = {
  clear:      '☀️',
  sunny:      '☀️',
  rain:       '🌧',
  storm:      '⛈',
  thunder:    '⛈',
  snow:       '❄️',
  blizzard:   '🌨',
  fog:        '🌫',
  cloudy:     '☁️',
  overcast:   '☁️',
  wind:       '💨',
  hail:       '🌨',
  drought:    '🏜',
}

function weatherIcon(name: string): string {
  const lower = name.toLowerCase()
  for (const [key, icon] of Object.entries(WEATHER_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return '🌤'
}

// ── initWorldEventLogger ──────────────────────────────────────────────────────
// Call once on app mount.  Attaches window event listeners for game systems that
// already dispatch CustomEvents.

let _loggerInitialized = false

export function initWorldEventLogger(): void {
  if (_loggerInitialized) return
  _loggerInitialized = true
  const { addEvent } = useWorldEventStore.getState()

  // siege-started — detail: { settlementId, attackingFactionId, intensity }
  window.addEventListener('siege-started', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const settlementId = detail.settlementId
    const faction = detail.attackingFactionId ?? detail.faction ?? 'Unknown Faction'
    const settlementLabel = settlementId != null ? `Settlement #${settlementId}` : 'Unknown Settlement'
    useWorldEventStore.getState().addEvent({
      category: 'settlement',
      icon: '⚔️',
      title: 'Siege Begins',
      detail: `${settlementLabel} is under attack by ${faction}!`,
    })
  })

  // siege-resolved — detail: { siegeId, settlementId, repelled, damage }
  window.addEventListener('siege-resolved', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const repelled = detail.repelled ?? false
    const settlementId = detail.settlementId
    const settlementLabel = settlementId != null ? `Settlement #${settlementId}` : 'Unknown Settlement'
    useWorldEventStore.getState().addEvent({
      category: 'settlement',
      icon: repelled ? '🛡️' : '💥',
      title: repelled ? 'Siege Repelled' : 'Settlement Damaged',
      detail: repelled
        ? `${settlementLabel} successfully defended!`
        : `${settlementLabel} has taken damage from the siege.`,
    })
  })

  // restock-event — detail: pendingRestockEvent { merchantName, settlementId, ... }
  window.addEventListener('restock-event', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const merchant = detail.merchantName ?? detail.merchant ?? 'A merchant'
    const settlementId = detail.settlementId
    const settlementLabel = settlementId != null ? `Settlement #${settlementId}` : 'the settlement'
    useWorldEventStore.getState().addEvent({
      category: 'social',
      icon: '🛒',
      title: 'Merchant Restock',
      detail: `${merchant} in ${settlementLabel} has new stock!`,
    })
  })

  // housing-upgrade
  window.addEventListener('housing-upgrade', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const upgradeName = detail.upgradeName ?? detail.name ?? 'an upgrade'
    useWorldEventStore.getState().addEvent({
      category: 'crafting',
      icon: '🏠',
      title: 'Home Improved',
      detail: `You upgraded: ${upgradeName}`,
    })
  })

  // weather-changed
  window.addEventListener('weather-changed', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const weatherName = detail.weather ?? detail.type ?? detail.name ?? 'Unknown'
    useWorldEventStore.getState().addEvent({
      category: 'weather',
      icon: weatherIcon(weatherName),
      title: 'Weather Changed',
      detail: weatherName,
    })
  })
}

// ── Helper functions for game systems ────────────────────────────────────────

export function logCombatEvent(enemyName: string, xpGained: number): void {
  useWorldEventStore.getState().addEvent({
    category: 'combat',
    icon: '⚔️',
    title: 'Enemy Slain',
    detail: `Defeated ${enemyName} (+${xpGained} XP)`,
  })
}

export function logExplorationEvent(locationName: string): void {
  useWorldEventStore.getState().addEvent({
    category: 'exploration',
    icon: '🗺️',
    title: 'Location Discovered',
    detail: `You discovered: ${locationName}`,
  })
}

export function logCraftEvent(itemName: string): void {
  useWorldEventStore.getState().addEvent({
    category: 'crafting',
    icon: '⚒️',
    title: 'Item Crafted',
    detail: `You crafted: ${itemName}`,
  })
}
