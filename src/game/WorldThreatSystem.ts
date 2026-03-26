// src/game/WorldThreatSystem.ts
// M55 Track C: World Threat Tracker — aggregates active threats from multiple systems.

export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical'

export interface WorldThreat {
  id: string
  type: 'siege' | 'faction-war' | 'bounty' | 'weather' | 'seasonal'
  level: ThreatLevel
  title: string
  detail: string
  icon: string
  startedAt: number   // Date.now()
  expiresAt?: number  // optional auto-expiry
}

export const THREAT_LEVEL_COLOR: Record<ThreatLevel, string> = {
  low:      '#4caf50',
  medium:   '#f97316',
  high:     '#ef4444',
  critical: '#dc2626',
}

let _threats: WorldThreat[] = []
const MAX_THREATS = 20

let _initialized = false

export function getThreats(): WorldThreat[] {
  return [..._threats]
}

export function addThreat(threat: Omit<WorldThreat, 'id' | 'startedAt'>): void {
  const id = `threat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const newThreat: WorldThreat = { ...threat, id, startedAt: Date.now() }
  _threats = [newThreat, ..._threats].slice(0, MAX_THREATS)
}

export function removeThreat(id: string): void {
  _threats = _threats.filter(t => t.id !== id)
}

export function clearExpiredThreats(): void {
  const now = Date.now()
  _threats = _threats.filter(t => t.expiresAt === undefined || t.expiresAt > now)
}

export function initWorldThreatSystem(): void {
  if (_initialized) return
  _initialized = true

  window.addEventListener('siege-started', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    addThreat({
      type: 'siege',
      level: 'high',
      icon: '⚔️',
      title: 'Siege Underway',
      detail: detail.settlementId ? `Settlement ${detail.settlementId} under siege` : 'Unknown settlement under siege',
    })
  })

  window.addEventListener('siege-resolved', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    if (detail.settlementId) {
      const match = _threats.find(t => t.type === 'siege' && t.detail.includes(detail.settlementId))
      if (match) {
        removeThreat(match.id)
        return
      }
    }
    clearExpiredThreats()
  })

  window.addEventListener('faction-war-started', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const war = detail.war ?? {}
    addThreat({
      type: 'faction-war',
      level: 'medium',
      icon: '🏴',
      title: 'Faction War',
      detail: `${war.attackingFactionId ?? 'Unknown'} vs ${war.defendingFactionId ?? 'Unknown'}`,
    })
  })

  window.addEventListener('faction-war-resolved', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const war = detail.war ?? {}
    // Mark matching war threat with short expiry so it auto-clears
    const match = _threats.find(t => t.type === 'faction-war' && t.id === `threat_war_${war.id}`)
    if (match) {
      match.expiresAt = Date.now() + 10_000
    } else {
      // Best effort: expire the most recent faction-war threat
      const recent = _threats.find(t => t.type === 'faction-war')
      if (recent) recent.expiresAt = Date.now() + 10_000
    }
  })

  window.addEventListener('weather-changed', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const weatherName: string = (detail.weatherName ?? detail.name ?? '').toLowerCase()
    const isDangerous =
      weatherName.includes('storm') ||
      weatherName.includes('blizzard') ||
      weatherName.includes('hail') ||
      weatherName.includes('thunder')
    if (!isDangerous) return

    let level: ThreatLevel = 'medium'
    let icon = '🌩️'
    if (weatherName.includes('blizzard')) {
      level = 'high'
      icon = '❄️'
    } else if (weatherName.includes('storm')) {
      level = 'high'
      icon = '⛈️'
    } else if (weatherName.includes('hail')) {
      icon = '🌨️'
    } else if (weatherName.includes('thunder')) {
      icon = '🌩️'
    }

    addThreat({
      type: 'weather',
      level,
      icon,
      title: detail.weatherName ?? detail.name ?? 'Dangerous Weather',
      detail: detail.description ?? `Hazardous weather conditions: ${detail.weatherName ?? detail.name ?? ''}`,
      expiresAt: Date.now() + 60_000,
    })
  })

  window.addEventListener('seasonal-event', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    addThreat({
      type: 'seasonal',
      level: 'low',
      icon: detail.icon ?? '🍃',
      title: detail.name ?? 'Seasonal Event',
      detail: detail.description ?? '',
      expiresAt: Date.now() + 120_000,
    })
  })
}
