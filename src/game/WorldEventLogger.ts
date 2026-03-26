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

  // home-customized — detail: { decorationId, decorationName, theme }
  window.addEventListener('home-customized', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const decorName = detail.decorationName ?? 'a decoration'
    const theme = detail.theme ?? ''
    useWorldEventStore.getState().addEvent({
      category: 'social',
      icon: '🏡',
      title: 'Home Customized',
      detail: `Equipped ${decorName}${theme ? ` (${theme} theme)` : ''}.`,
    })
  })

  // recipe-discovered — detail: { recipeId: string }
  window.addEventListener('recipe-discovered', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const recipeId = detail.recipeId ?? '?'
    // Lazy-import to avoid circular dependency with RecipeDiscoverySystem
    import('../player/CraftingRecipes').then(m => {
      const recipe = m.CRAFTING_RECIPES.find(r => String(r.id) === String(recipeId))
      const name = recipe ? recipe.name : `Recipe #${recipeId}`
      useWorldEventStore.getState().addEvent({
        category: 'crafting',
        icon: '📜',
        title: 'Recipe Discovered',
        detail: `You discovered: ${name}`,
      })
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

  // daynight-event — M52 Track C: day/night triggered events
  window.addEventListener('daynight-event', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const timeWindow: string = detail.timeWindow ?? 'night'
    const category =
      timeWindow === 'night' ? 'combat' :
      timeWindow === 'dusk'  ? 'weather' :
      timeWindow === 'dawn'  ? 'social' :
      'exploration'
    useWorldEventStore.getState().addEvent({
      category,
      icon: detail.icon ?? '🌙',
      title: detail.title ?? 'Night Event',
      detail: `A ${timeWindow} event has begun.`,
    })
  })

  // seasonal-event — M53 Track A: seasonal event triggered
  window.addEventListener('seasonal-event', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    useWorldEventStore.getState().addEvent({
      category: 'exploration',
      icon: detail.icon ?? '🍃',
      title: detail.name ?? 'Seasonal Event',
      detail: detail.description ?? 'A seasonal event has begun.',
    })
  })

  // seasonal-change — M53 Track A: season transition
  window.addEventListener('seasonal-change', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    useWorldEventStore.getState().addEvent({
      category: 'exploration',
      icon: detail.season === 'winter' ? '❄️' : detail.season === 'summer' ? '☀️' : detail.season === 'autumn' ? '🍂' : '🌸',
      title: `Season Changed: ${String(detail.season ?? '').charAt(0).toUpperCase() + String(detail.season ?? '').slice(1)}`,
      detail: detail.bonusName ? `${detail.bonusName} is now active.` : 'A new season begins.',
    })
  })

  // location-discovered — M54 Track C: player found a world discovery point
  window.addEventListener('location-discovered', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const name: string = detail.name ?? 'Unknown Location'
    const icon: string = detail.icon ?? '🗺'
    const rewardGold: number = detail.rewardGold ?? 0
    useWorldEventStore.getState().addEvent({
      category: 'exploration',
      icon,
      title: 'Location Discovered',
      detail: `${name} found! (+${rewardGold}g)`,
    })
  })

  // combo-milestone — M53 Track C: combo streak milestones
  window.addEventListener('combo-milestone', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const count: number = detail.count ?? 0
    useWorldEventStore.getState().addEvent({
      category: 'combat',
      icon: '⚔️',
      title: 'Combo Milestone',
      detail: `Achieved a ×${count} combo!`,
    })
  })

  // bounty-claimed — M54 Track B: bounty board claim
  window.addEventListener('bounty-claimed', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const species: string = detail.targetSpecies ?? 'creature'
    const poster: string  = detail.poster ?? 'NPC'
    const gold: number    = detail.reward?.gold ?? 0
    const rep: number     = detail.reward?.reputationBonus ?? 0
    useWorldEventStore.getState().addEvent({
      category: 'combat',
      icon: '📋',
      title: 'Bounty Claimed',
      detail: `Claimed bounty on ${species} (posted by ${poster}) — +${gold} gold, +${rep} rep`,
    })
  })

  // guild-rank-up — M54 Track A: merchant guild rank promotion
  window.addEventListener('guild-rank-up', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const rank: string = detail.rank ?? 'journeyman'
    useWorldEventStore.getState().addEvent({
      category: 'social',
      icon: '🏪',
      title: 'Guild Rank Up',
      detail: `You rose to the rank of ${rank.charAt(0).toUpperCase() + rank.slice(1)} in the Merchant Guild!`,
    })
  })

  // contract-completed — M54 Track A: merchant guild contract completed
  window.addEventListener('contract-completed', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const name: string = detail.contractName ?? 'a contract'
    const gold: number = detail.reward?.gold ?? 0
    const xp: number   = detail.reward?.guildXp ?? 0
    useWorldEventStore.getState().addEvent({
      category: 'social',
      icon: '📦',
      title: 'Contract Completed',
      detail: `Fulfilled "${name}" — +${gold} gold, +${xp} guild XP`,
    })
  })

  // resource-depleted — M55 Track B: resource node fully harvested
  window.addEventListener('resource-depleted', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const icon: string     = detail.icon ?? '🌲'
    const nodeName: string = detail.nodeName ?? 'Resource Node'
    const nodeType: string = detail.nodeType ?? 'resource'
    useWorldEventStore.getState().addEvent({
      category: 'exploration',
      icon,
      title: 'Resource Depleted',
      detail: `${nodeName} (${nodeType.replace('_', ' ')}) has been fully harvested.`,
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
