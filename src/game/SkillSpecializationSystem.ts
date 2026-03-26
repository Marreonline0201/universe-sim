// ── SkillSpecializationSystem.ts ──────────────────────────────────────────────
// M49 Track A: Skill Specialization Trees
//
// Players choose one of 2-3 specializations per skill at level 10+.
// Each spec grants unique passive bonuses and flavor.
// One spec per skill; choice is permanent (no switching).

export interface SkillSpec {
  id: string
  skillId: string       // which skill this belongs to (e.g. 'combat', 'crafting')
  name: string
  description: string
  icon: string          // emoji
  bonuses: string[]     // human-readable bonus list
  requiredLevel: number // always 10
}

export const SKILL_SPECS: SkillSpec[] = [
  // Combat specs
  { id: 'berserker',   skillId: 'combat',   name: 'Berserker',   description: 'Raw power over finesse.',           icon: '⚔',  bonuses: ['+25% melee damage', '-10% defense'],                        requiredLevel: 10 },
  { id: 'guardian',    skillId: 'combat',   name: 'Guardian',    description: 'Protect and endure.',               icon: '🛡',  bonuses: ['+20% defense', '+50% shield block chance'],                 requiredLevel: 10 },
  { id: 'duelist',     skillId: 'combat',   name: 'Duelist',     description: 'Precision and speed.',              icon: '🗡',  bonuses: ['+15% attack speed', '+10% critical chance'],               requiredLevel: 10 },
  // Crafting specs
  { id: 'artificer',   skillId: 'crafting', name: 'Artificer',   description: 'Master of tools and gadgets.',      icon: '⚙',  bonuses: ['+30% tool durability', 'Can craft tier 4 tools'],           requiredLevel: 10 },
  { id: 'alchemist_s', skillId: 'crafting', name: 'Alchemist',   description: 'Potions and transmutation.',        icon: '⚗',  bonuses: ['+25% potion potency', 'Unlock rare recipes'],               requiredLevel: 10 },
  // Survival specs
  { id: 'ranger',      skillId: 'survival', name: 'Ranger',      description: 'Master of the wilderness.',         icon: '🏹', bonuses: ['+20% movement speed outdoors', '+15% hunting yield'],       requiredLevel: 10 },
  { id: 'hermit',      skillId: 'survival', name: 'Hermit',      description: 'Self-sufficient and resilient.',    icon: '🏕', bonuses: ['-30% hunger/thirst drain', '+20% HP regeneration'],         requiredLevel: 10 },
  // Smithing specs
  { id: 'weaponsmith', skillId: 'smithing', name: 'Weaponsmith', description: 'Forger of legendary weapons.',      icon: '🔱', bonuses: ['+20% weapon damage bonus from quality', 'Unlock weapon enchants'], requiredLevel: 10 },
  { id: 'armorsmith',  skillId: 'smithing', name: 'Armorsmith',  description: 'Crafter of impenetrable armor.',    icon: '🔩', bonuses: ['+25% armor defense bonus', 'Unlock armor enchants'],        requiredLevel: 10 },
  // Gathering specs
  { id: 'deepwater',   skillId: 'gathering', name: 'Deepwater',   description: 'Expert forager and hunter.',        icon: '🌿', bonuses: ['+30% resource gather yield', '+15% rare resource chance'], requiredLevel: 10 },
  { id: 'angler_s',    skillId: 'gathering', name: 'Angler',      description: 'Patient and skilled at fishing.',   icon: '🐟', bonuses: ['-20% fishing cooldown', '+25% fish quantity per catch'],  requiredLevel: 10 },
]

// Module-level map: skillId → chosen spec id (one per skill)
const chosenSpecs = new Map<string, string>()

/** Returns the chosen SkillSpec for a given skill, or null if none chosen. */
export function getChosenSpec(skillId: string): SkillSpec | null {
  const specId = chosenSpecs.get(skillId)
  if (!specId) return null
  return SKILL_SPECS.find(s => s.id === specId) ?? null
}

/** Returns all specs available for a given skillId. */
export function getSpecsForSkill(skillId: string): SkillSpec[] {
  return SKILL_SPECS.filter(s => s.skillId === skillId)
}

/**
 * Choose a spec by specId.
 * Returns false if:
 *  - spec doesn't exist
 *  - a spec is already chosen for that skill
 *  - skill level is below requiredLevel (checked via the provided level param)
 */
export function chooseSpec(specId: string, skillLevel: number): boolean {
  const spec = SKILL_SPECS.find(s => s.id === specId)
  if (!spec) return false
  if (chosenSpecs.has(spec.skillId)) return false
  if (skillLevel < spec.requiredLevel) return false
  chosenSpecs.set(spec.skillId, specId)
  return true
}

/** Returns true if the given specId has been chosen. */
export function hasSpec(specId: string): boolean {
  const spec = SKILL_SPECS.find(s => s.id === specId)
  if (!spec) return false
  return chosenSpecs.get(spec.skillId) === specId
}

/**
 * Returns true if the player cannot choose a spec yet for this skill
 * (i.e. level < 10).
 */
export function isSpecLocked(skillId: string, skillLevel: number): boolean {
  const specs = getSpecsForSkill(skillId)
  if (specs.length === 0) return false
  return skillLevel < specs[0].requiredLevel
}

// ── Persistence ───────────────────────────────────────────────────────────────

/** Serialize chosen specs to a plain object for save data. */
export function serializeSpecs(): Record<string, string> {
  const result: Record<string, string> = {}
  chosenSpecs.forEach((specId, skillId) => {
    result[skillId] = specId
  })
  return result
}

/** Restore chosen specs from saved data. */
export function deserializeSpecs(data: Record<string, string>): void {
  chosenSpecs.clear()
  if (!data || typeof data !== 'object') return
  for (const [skillId, specId] of Object.entries(data)) {
    if (typeof specId === 'string') {
      chosenSpecs.set(skillId, specId)
    }
  }
}
