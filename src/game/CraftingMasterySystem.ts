// ── CraftingMasterySystem.ts ───────────────────────────────────────────────────
// M60 Track A: Crafting Mastery System
// Tracks per-category craft counts, grants XP toward mastery levels,
// and unlocks passive bonuses for frequently crafted items.

import { useUiStore } from '../store/uiStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CraftingMastery {
  category: string
  name: string
  icon: string
  xp: number
  level: number
  xpToNext: number
  totalCrafted: number
}

// ── Category definitions ──────────────────────────────────────────────────────

interface CategoryDef {
  category: string
  name: string
  icon: string
}

const CATEGORY_DEFS: CategoryDef[] = [
  { category: 'tools',     name: 'Tools',     icon: '🔨' },
  { category: 'weapons',   name: 'Weapons',   icon: '⚔️' },
  { category: 'armor',     name: 'Armor',     icon: '🛡️' },
  { category: 'potions',   name: 'Potions',   icon: '🧪' },
  { category: 'food',      name: 'Food',      icon: '🍖' },
  { category: 'building',  name: 'Building',  icon: '🏗️' },
  { category: 'alchemy',   name: 'Alchemy',   icon: '⚗️' },
  { category: 'materials', name: 'Materials', icon: '🪨' },
]

// ── Constants ─────────────────────────────────────────────────────────────────

const LEVEL_CAP = 10
const XP_PER_CRAFT = 10

function xpToNext(level: number): number {
  if (level >= LEVEL_CAP) return 0
  return 50 * level * level
}

// ── Module state ──────────────────────────────────────────────────────────────

let _initialized = false
const _masteries = new Map<string, CraftingMastery>()

// ── Init ──────────────────────────────────────────────────────────────────────

export function initCraftingMastery(): void {
  if (_initialized) return
  _initialized = true

  for (const def of CATEGORY_DEFS) {
    if (!_masteries.has(def.category)) {
      _masteries.set(def.category, {
        category: def.category,
        name: def.name,
        icon: def.icon,
        xp: 0,
        level: 1,
        xpToNext: xpToNext(1),
        totalCrafted: 0,
      })
    }
  }

  // Listen for item-crafted events dispatched from any crafting system
  window.addEventListener('item-crafted', _onItemCrafted)
}

function _onItemCrafted(e: Event): void {
  const detail = (e as CustomEvent<{ recipeId?: string; category?: string }>).detail
  if (detail?.category) {
    recordCraft(detail.category, detail.recipeId)
  }
}

// ── Record craft ──────────────────────────────────────────────────────────────

export function recordCraft(category: string, _recipeId?: string): void {
  if (!_initialized) return
  const mastery = _masteries.get(category)
  if (!mastery) return

  mastery.totalCrafted += 1

  if (mastery.level >= LEVEL_CAP) return

  mastery.xp += XP_PER_CRAFT

  // Check for level-ups (can level up multiple times in one craft if xp jumps)
  while (mastery.level < LEVEL_CAP && mastery.xp >= mastery.xpToNext) {
    mastery.xp -= mastery.xpToNext
    mastery.level += 1
    mastery.xpToNext = xpToNext(mastery.level)

    useUiStore.getState().addNotification(
      `Crafting Mastery: ${mastery.name} reached Level ${mastery.level}! ${_masteryBonusSummary(mastery.level)}`,
      'discovery',
    )

    window.dispatchEvent(
      new CustomEvent('crafting-mastery-levelup', {
        detail: { category, level: mastery.level, name: mastery.name },
      }),
    )
  }

  // At cap: clear leftover XP and threshold
  if (mastery.level >= LEVEL_CAP) {
    mastery.xpToNext = 0
    mastery.xp = 0
  }
}

function _masteryBonusSummary(level: number): string {
  const { yieldBonus, materialSaveChance } = getMasteryBonus_computed(level)
  const parts: string[] = []
  if (yieldBonus > 0) parts.push(`+${(yieldBonus * 100).toFixed(0)}% yield`)
  if (materialSaveChance > 0) parts.push(`${(materialSaveChance * 100).toFixed(0)}% material save`)
  return parts.length > 0 ? `(${parts.join(', ')})` : ''
}

// ── Getters ───────────────────────────────────────────────────────────────────

export function getMasteries(): CraftingMastery[] {
  return CATEGORY_DEFS.map(def => {
    const m = _masteries.get(def.category)
    if (m) return m
    // Return a zeroed entry if not yet initialized
    return {
      category: def.category,
      name: def.name,
      icon: def.icon,
      xp: 0,
      level: 1,
      xpToNext: xpToNext(1),
      totalCrafted: 0,
    }
  })
}

// ── Bonus computation ─────────────────────────────────────────────────────────

function getMasteryBonus_computed(level: number): { yieldBonus: number; materialSaveChance: number } {
  // Every 2 levels = +5% yield chance (double output)
  const yieldBonus = Math.floor(level / 2) * 0.05
  // Every 3 levels = -5% material cost (chance to save a material)
  const materialSaveChance = Math.floor(level / 3) * 0.05
  return { yieldBonus, materialSaveChance }
}

export function getMasteryBonus(category: string): { yieldBonus: number; materialSaveChance: number } {
  const mastery = _masteries.get(category)
  const level = mastery ? mastery.level : 1
  return getMasteryBonus_computed(level)
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function serializeMastery(): string {
  const data: Record<string, { xp: number; level: number; totalCrafted: number }> = {}
  for (const [cat, m] of _masteries) {
    data[cat] = { xp: m.xp, level: m.level, totalCrafted: m.totalCrafted }
  }
  return JSON.stringify(data)
}

export function deserializeMastery(raw: string): void {
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as Record<string, { xp: number; level: number; totalCrafted: number }>
    for (const def of CATEGORY_DEFS) {
      const saved = parsed[def.category]
      if (!saved) continue
      const level = Math.min(LEVEL_CAP, Math.max(1, saved.level ?? 1))
      const entry: CraftingMastery = {
        category: def.category,
        name: def.name,
        icon: def.icon,
        level,
        xp: level >= LEVEL_CAP ? 0 : (saved.xp ?? 0),
        xpToNext: xpToNext(level),
        totalCrafted: saved.totalCrafted ?? 0,
      }
      _masteries.set(def.category, entry)
    }
  } catch {
    // corrupted — silently ignore
  }
}
