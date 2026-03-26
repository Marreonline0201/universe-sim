// ── ExplorationDiscoverySystem.ts ─────────────────────────────────────────────
// M54 Track C: Pre-placed discovery points that trigger when the player walks
// nearby. Rewards gold + XP and logs to WorldEventLogger + uiStore notifications.

import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'

export type DiscoveryCategory =
  | 'ruins'
  | 'shrine'
  | 'camp'
  | 'landmark'
  | 'dungeon_entrance'
  | 'hidden_cache'

export interface WorldDiscovery {
  id: string
  name: string
  category: DiscoveryCategory
  icon: string
  description: string
  position: { x: number; z: number }
  discoveredAt: number   // Date.now()
  rewardGold: number
  rewardXp: number
}

// ── Pre-placed discovery points ───────────────────────────────────────────────

const DISCOVERY_POINTS: Array<
  Omit<WorldDiscovery, 'discoveredAt'> & { triggerRadius: number }
> = [
  {
    id: 'ancient_ruins_1',
    name: 'Ancient Ruins',
    category: 'ruins',
    icon: '🏛',
    description: 'Crumbling stone walls of a lost civilization.',
    position: { x: 120, z: -80 },
    triggerRadius: 15,
    rewardGold: 30,
    rewardXp: 50,
  },
  {
    id: 'forest_shrine',
    name: 'Forest Shrine',
    category: 'shrine',
    icon: '⛩',
    description: 'A mossy shrine to a forgotten forest deity.',
    position: { x: -60, z: 45 },
    triggerRadius: 12,
    rewardGold: 20,
    rewardXp: 40,
  },
  {
    id: 'bandit_camp',
    name: 'Bandit Camp',
    category: 'camp',
    icon: '🏕',
    description: 'An abandoned campsite with scattered loot.',
    position: { x: 200, z: 150 },
    triggerRadius: 20,
    rewardGold: 50,
    rewardXp: 30,
  },
  {
    id: 'stone_monolith',
    name: 'Stone Monolith',
    category: 'landmark',
    icon: '🗿',
    description: 'A massive carved stone of unknown origin.',
    position: { x: -150, z: -90 },
    triggerRadius: 18,
    rewardGold: 25,
    rewardXp: 35,
  },
  {
    id: 'old_mine',
    name: 'Old Mine Entrance',
    category: 'dungeon_entrance',
    icon: '⛏',
    description: 'A boarded-up mine shaft leading underground.',
    position: { x: 80, z: -200 },
    triggerRadius: 15,
    rewardGold: 40,
    rewardXp: 60,
  },
  {
    id: 'hidden_cache_1',
    name: 'Hidden Cache',
    category: 'hidden_cache',
    icon: '📦',
    description: 'A buried chest, long forgotten.',
    position: { x: -30, z: 180 },
    triggerRadius: 8,
    rewardGold: 75,
    rewardXp: 20,
  },
  {
    id: 'watchtower',
    name: 'Ruined Watchtower',
    category: 'ruins',
    icon: '🗼',
    description: 'A crumbling tower with a view of the valley.',
    position: { x: 300, z: -40 },
    triggerRadius: 20,
    rewardGold: 30,
    rewardXp: 45,
  },
  {
    id: 'healing_spring',
    name: 'Healing Spring',
    category: 'shrine',
    icon: '💧',
    description: 'A bubbling spring with restorative waters.',
    position: { x: 50, z: 280 },
    triggerRadius: 12,
    rewardGold: 15,
    rewardXp: 55,
  },
]

// ── Module-level state ────────────────────────────────────────────────────────

const _discovered = new Set<string>()
let _discoveries: WorldDiscovery[] = []

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns discoveries newest-first. */
export function getDiscoveries(): WorldDiscovery[] {
  return _discoveries
}

export function getDiscoveredCount(): number {
  return _discovered.size
}

export function getTotalCount(): number {
  return DISCOVERY_POINTS.length
}

/**
 * Call from GameLoop every 2 sim-seconds with player world position.
 * For each undiscovered point within triggerRadius, fires the discovery.
 */
export function checkDiscoveries(
  playerX: number,
  playerZ: number,
  _simSeconds: number,
): void {
  for (const point of DISCOVERY_POINTS) {
    if (_discovered.has(point.id)) continue

    const dx = playerX - point.position.x
    const dz = playerZ - point.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < point.triggerRadius) {
      _discovered.add(point.id)

      const entry: WorldDiscovery = {
        id: point.id,
        name: point.name,
        category: point.category,
        icon: point.icon,
        description: point.description,
        position: point.position,
        discoveredAt: Date.now(),
        rewardGold: point.rewardGold,
        rewardXp: point.rewardXp,
      }

      // Prepend so list is newest-first
      _discoveries = [entry, ..._discoveries]

      // Pay gold reward
      usePlayerStore.getState().addGold(point.rewardGold)

      // UI notification
      useUiStore
        .getState()
        .addNotification(
          `${point.icon} Discovered: ${point.name} (+${point.rewardGold}g)`,
          'discovery',
        )

      // Dispatch CustomEvent for WorldEventLogger + any other listeners
      window.dispatchEvent(
        new CustomEvent('location-discovered', {
          detail: {
            name: point.name,
            category: point.category,
            icon: point.icon,
            rewardGold: point.rewardGold,
            rewardXp: point.rewardXp,
          },
        }),
      )
    }
  }
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function serializeDiscoveries(): string {
  return JSON.stringify({
    discovered: Array.from(_discovered),
    discoveries: _discoveries,
  })
}

export function deserializeDiscoveries(data: string): void {
  try {
    const parsed = JSON.parse(data)
    if (Array.isArray(parsed.discovered)) {
      _discovered.clear()
      for (const id of parsed.discovered) _discovered.add(id)
    }
    if (Array.isArray(parsed.discoveries)) {
      _discoveries = parsed.discoveries as WorldDiscovery[]
    }
  } catch {
    // Corrupted data — silently ignore
  }
}
