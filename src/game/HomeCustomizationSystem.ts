// ── HomeCustomizationSystem.ts ────────────────────────────────────────────────
// M53 Track B: Player Home Customization
// Cosmetic themes, decorations, and home identity (name/description).

import { usePlayerStore } from '../store/playerStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RoomTheme = 'rustic' | 'noble' | 'arcane' | 'wilderness' | 'industrial'

export interface HomeDecoration {
  id: string
  name: string
  icon: string
  description: string
  theme: RoomTheme
  cost: { gold: number }
  owned: boolean
  equipped: boolean  // only one decoration per theme can be equipped
}

export interface HomeProfile {
  homeName: string        // player-chosen name, default: "My Homestead"
  homeDescription: string // player bio for their home
  activeTheme: RoomTheme | null
  equippedDecorations: string[]  // decoration IDs
}

// ── Decoration catalogue ──────────────────────────────────────────────────────

const DECORATIONS: HomeDecoration[] = [
  // Rustic
  { id: 'fireplace',    name: 'Stone Fireplace',     icon: '🔥', theme: 'rustic',     cost: { gold: 50 },  description: 'A crackling hearth.',                owned: false, equipped: false },
  { id: 'hunting_rack', name: 'Hunting Trophy Rack', icon: '🦌', theme: 'rustic',     cost: { gold: 80 },  description: 'Display your trophies.',             owned: false, equipped: false },
  // Noble
  { id: 'tapestry',     name: 'Royal Tapestry',      icon: '🏰', theme: 'noble',      cost: { gold: 150 }, description: 'Fine woven art.',                    owned: false, equipped: false },
  { id: 'chandelier',   name: 'Crystal Chandelier',  icon: '💎', theme: 'noble',      cost: { gold: 200 }, description: 'Lights the hall.',                   owned: false, equipped: false },
  // Arcane
  { id: 'crystal_orb',  name: 'Crystal Orb',         icon: '🔮', theme: 'arcane',     cost: { gold: 120 }, description: 'Hums with magic.',                   owned: false, equipped: false },
  { id: 'bookshelf',    name: 'Arcane Bookshelf',    icon: '📚', theme: 'arcane',     cost: { gold: 100 }, description: 'Tomes of knowledge.',                owned: false, equipped: false },
  // Wilderness
  { id: 'herb_garden',  name: 'Herb Garden',         icon: '🌿', theme: 'wilderness', cost: { gold: 60 },  description: 'Fresh herbs always available.',      owned: false, equipped: false },
  { id: 'animal_pen',   name: 'Small Animal Pen',    icon: '🐾', theme: 'wilderness', cost: { gold: 90 },  description: 'A place for creatures.',             owned: false, equipped: false },
  // Industrial
  { id: 'forge_nook',   name: 'Personal Forge Nook', icon: '⚙',  theme: 'industrial', cost: { gold: 180 }, description: '+5% smithing speed.',               owned: false, equipped: false },
  { id: 'storage_rack', name: 'Storage Rack',        icon: '📦', theme: 'industrial', cost: { gold: 70 },  description: '+2 inventory slots.',               owned: false, equipped: false },
]

// ── Module state ──────────────────────────────────────────────────────────────

let _decorations: HomeDecoration[] = DECORATIONS.map(d => ({ ...d }))

let _homeProfile: HomeProfile = {
  homeName: 'My Homestead',
  homeDescription: '',
  activeTheme: null,
  equippedDecorations: [],
}

// ── API ───────────────────────────────────────────────────────────────────────

export function getHomeProfile(): HomeProfile {
  return { ..._homeProfile, equippedDecorations: [..._homeProfile.equippedDecorations] }
}

export function getDecorations(): HomeDecoration[] {
  return _decorations.map(d => ({ ...d }))
}

/**
 * Purchase a decoration by id. Deducts gold via usePlayerStore.
 * Returns true on success, false if already owned or insufficient gold.
 */
export function purchaseDecoration(id: string, _playerGold: number): boolean {
  const dec = _decorations.find(d => d.id === id)
  if (!dec || dec.owned) return false

  const spent = usePlayerStore.getState().spendGold(dec.cost.gold)
  if (!spent) return false

  dec.owned = true
  return true
}

/**
 * Equip a decoration. Only one decoration per theme can be equipped at a time.
 * Dispatches 'home-customized'.
 */
export function equipDecoration(id: string): void {
  const dec = _decorations.find(d => d.id === id)
  if (!dec || !dec.owned) return

  // Unequip any other decoration of the same theme
  for (const other of _decorations) {
    if (other.theme === dec.theme && other.id !== id) {
      other.equipped = false
    }
  }

  dec.equipped = true

  // Update activeTheme to match equipped decoration's theme
  _homeProfile.activeTheme = dec.theme

  // Sync equippedDecorations list
  _syncEquippedList()

  window.dispatchEvent(new CustomEvent('home-customized', {
    detail: { decorationId: id, decorationName: dec.name, theme: dec.theme },
  }))
}

export function unequipDecoration(id: string): void {
  const dec = _decorations.find(d => d.id === id)
  if (!dec) return
  dec.equipped = false
  _syncEquippedList()
}

export function setHomeName(name: string): void {
  _homeProfile.homeName = name.slice(0, 32)
}

export function setHomeDescription(desc: string): void {
  _homeProfile.homeDescription = desc.slice(0, 120)
}

/** Set the active room theme without equipping a decoration. */
export function setActiveTheme(theme: RoomTheme | null): void {
  _homeProfile.activeTheme = theme
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function serializeHome(): string {
  return JSON.stringify({
    profile: _homeProfile,
    decorations: _decorations.map(d => ({ id: d.id, owned: d.owned, equipped: d.equipped })),
  })
}

export function deserializeHome(data: string): void {
  try {
    const parsed = JSON.parse(data)
    if (parsed.profile) {
      _homeProfile = {
        homeName: parsed.profile.homeName ?? 'My Homestead',
        homeDescription: parsed.profile.homeDescription ?? '',
        activeTheme: parsed.profile.activeTheme ?? null,
        equippedDecorations: Array.isArray(parsed.profile.equippedDecorations)
          ? parsed.profile.equippedDecorations
          : [],
      }
    }
    if (Array.isArray(parsed.decorations)) {
      for (const saved of parsed.decorations) {
        const dec = _decorations.find(d => d.id === saved.id)
        if (dec) {
          dec.owned = saved.owned ?? false
          dec.equipped = saved.equipped ?? false
        }
      }
    }
    _syncEquippedList()
  } catch {
    // Corrupted data — keep defaults
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _syncEquippedList(): void {
  _homeProfile.equippedDecorations = _decorations
    .filter(d => d.equipped)
    .map(d => d.id)
}
