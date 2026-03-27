// ── GameSingletons ─────────────────────────────────────────────────────────────
// Single import point for stateful game-system class instances.
// These are module-level singletons — created once, shared everywhere.

import { Inventory } from '../player/Inventory'

export const inventory = new Inventory()
