/**
 * gameConfig.ts — Top-level feature flags shared across game and UI layers.
 *
 * Import from here instead of reading GameLoop internals.
 */

/**
 * When false the game runs as a pure emergent organism simulation.
 * All RPG systems (inventory, crafting, vitals, quests, dungeons,
 * festivals, etc.) are disabled and their UI is hidden.
 */
export const RPG_ENABLED = false
