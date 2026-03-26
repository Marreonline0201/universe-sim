// ── CombatSystem.ts ──────────────────────────────────────────────────────────
// M24 Track A: Combat state management
// M38 Track B: Combo overhaul, faction abilities, weapon special effects,
//              dodge roll stamina cost, enemy status effects
//
// Manages: attack cooldowns per weapon type, combo counter (3-hit),
// dodge mechanic (Shift, 0.3s iframe, 2s cooldown), block (RMB, 50% DR).
// Floating damage numbers and health bar tracking for recently-damaged entities.

import type { FactionId } from './FactionSystem'

export interface DamageNumber {
  id: number
  x: number; y: number; z: number  // world position
  amount: number
  isCritical: boolean
  isCombo: boolean
  age: number       // seconds since spawn
  maxAge: number    // fade-out duration
}

export interface EnemyHealthBar {
  entityId: number
  species: string
  x: number; y: number; z: number
  health: number
  maxHealth: number
  lastDamageTime: number  // Date.now() when last damaged
}

// ── M38 Track B: Enemy status effects ───────────────────────────────────────

export interface EnemyStatusEffect {
  entityId: number
  stunTimer: number     // seconds remaining stunned (0 = not stunned)
  burnTimer: number     // seconds remaining burning
  markTimer: number     // seconds remaining marked (Hunter's Mark)
  confuseTimer: number  // seconds remaining confused (Golden Bribe)
  fearTimer: number     // seconds remaining fleeing (fear response)
}

// ── M38 Track B: Faction special abilities ───────────────────────────────────

export interface FactionAbility {
  name: string
  description: string
  cooldownMs: number
  lastUsedMs: number
  applyEffect: () => void
}

// ── M38 Track B: Berserk state (Iron Brotherhood) ────────────────────────────

export interface BerserkState {
  active: boolean
  hitsRemaining: number   // hits left with 2x damage
  timer: number           // seconds remaining for the 50% incoming damage buff
}

// Weapon cooldowns by weapon category (seconds)
// M31 Track C: Full tier table
//   Fists:         0.8s  (Tier 0)
//   Stone Axe:     1.2s  (Tier 0)
//   Iron Sword:    0.7s  (Tier 1)
//   Steel Sword:   0.55s (Tier 2)
//   Diamond Blade: 0.45s (Tier 3)
//   Quantum Blade: 0.35s (Tier 4+)
const WEAPON_COOLDOWNS: Record<string, number> = {
  hand:          0.8,
  stone_tool:    1.2,
  stone_axe:     1.2,
  knife:         0.7,
  spear:         1.0,
  axe:           1.1,
  iron_sword:    0.7,
  steel_sword:   0.55,
  diamond_blade: 0.45,
  quantum_blade: 0.35,
  sword:         0.6,
  bow:           1.5,
  musket:        8.0,
  default:       1.0,
}

// ── Weapon damage table (M31 Track C + M38 Track C: authoritative tier table) ──
// Used for validation/display; actual damage comes from EquipSystem ItemStats.
export const WEAPON_TIER_TABLE = [
  { name: 'Fists',           tier: 0,  damage: 5,  cooldown: 0.8  },
  { name: 'Stone Axe',       tier: 0,  damage: 12, cooldown: 1.2  },
  { name: 'Iron Sword',      tier: 1,  damage: 20, cooldown: 0.7  },
  { name: 'Steel Sword',     tier: 2,  damage: 35, cooldown: 0.55 },
  { name: 'Diamond Blade',   tier: 3,  damage: 55, cooldown: 0.45 },
  { name: 'Quantum Blade',   tier: 4,  damage: 80, cooldown: 0.35 },
  // ── M38 Track C: Biome tier 4-5 weapons ─────────────────────────────────
  { name: 'Obsidian Blade',  tier: 4,  damage: 55, cooldown: 0.45 },
  { name: 'Frost Axe',       tier: 4,  damage: 50, cooldown: 0.5  },
  { name: 'Crystal Staff',   tier: 4,  damage: 45, cooldown: 0.6  },
  { name: 'Luminite Dagger', tier: 5,  damage: 70, cooldown: 0.4  },
] as const

// Map weapon name keywords to category
function getWeaponCategory(weaponName: string): string {
  const lower = weaponName.toLowerCase()
  if (lower === 'hand') return 'hand'
  if (lower.includes('musket')) return 'musket'
  if (lower.includes('bow')) return 'bow'
  if (lower.includes('quantum blade')) return 'quantum_blade'
  if (lower.includes('diamond blade')) return 'diamond_blade'
  if (lower.includes('obsidian blade')) return 'diamond_blade'  // same cooldown tier as diamond
  if (lower.includes('luminite dagger')) return 'knife'
  if (lower.includes('crystal staff')) return 'spear'
  if (lower.includes('frost axe')) return 'axe'
  if (lower.includes('steel sword')) return 'steel_sword'
  if (lower.includes('iron sword')) return 'iron_sword'
  if (lower.includes('sword')) return 'sword'
  if (lower.includes('knife') || lower.includes('dagger')) return 'knife'
  if (lower.includes('spear')) return 'spear'
  if (lower.includes('stone axe')) return 'stone_axe'
  if (lower.includes('axe')) return 'axe'
  if (lower.includes('stone tool')) return 'stone_tool'
  return 'default'
}

let _dmgId = 0

// ── M38 Track B: Combo display notification ─────────────────────────────────
export interface ComboNotification {
  count: number
  age: number     // seconds since spawned
  maxAge: number  // 2s display duration
}

export class CombatSystem {
  // ── Attack cooldown ──────────────────────────────────────────────────────
  private attackCooldownTimer = 0
  private attackCooldownMax   = 1.0

  // ── Combo ────────────────────────────────────────────────────────────────
  // M38 Track B: Updated combo window (0.8s), combo resets after 1.5s,
  // +15% per hit in chain (combo 2: 1.15x, combo 3: 1.30x, combo 4+: 1.20x each)
  private comboCount  = 0
  private comboTimer  = 0       // seconds since last hit; resets combo after 1.5s
  private lastAttackTime = 0    // Date.now() of last attack for 0.8s combo window
  private static COMBO_WINDOW  = 0.8   // M38: attack within 0.8s to chain
  private static COMBO_RESET   = 1.5   // M38: reset after 1.5s without attacking

  // M38: combo display notification
  comboNotification: ComboNotification | null = null

  // ── Dodge ────────────────────────────────────────────────────────────────
  private dodgeCooldownTimer = 0
  private dodgeActiveTimer   = 0
  private static DODGE_COOLDOWN = 1.5   // M38: 1.5s cooldown
  private static DODGE_DURATION = 0.4   // M38: 0.4s roll duration
  static readonly DODGE_STAMINA_COST = 20  // M38: costs 20 stamina

  // ── Block ────────────────────────────────────────────────────────────────
  private _isBlocking = false
  private static BLOCK_DR = 0.5    // 50% damage reduction

  // ── Crit configuration (M31 Track C) ─────────────────────────────────────
  // Base: 5% + 2% per combat skill level + 15% backstab bonus
  // Crit multiplier: 2.5x (up from 2x)
  static readonly CRIT_BASE        = 0.05
  static readonly CRIT_PER_LEVEL   = 0.02
  static readonly CRIT_BACKSTAB    = 0.15
  static readonly CRIT_MULTIPLIER  = 2.5

  // ── Last combat time (for HUD visibility) ────────────────────────────────
  private lastCombatTime = 0

  // ── Floating damage numbers (ring buffer) ────────────────────────────────
  readonly damageNumbers: DamageNumber[] = []
  private static MAX_DMG_NUMBERS = 20

  // ── Enemy health bars ────────────────────────────────────────────────────
  readonly enemyHealthBars = new Map<number, EnemyHealthBar>()
  private static HEALTH_BAR_FADE = 5000  // ms after last damage

  // ── M38 Track B: Enemy status effects ────────────────────────────────────
  readonly enemyStatusEffects = new Map<number, EnemyStatusEffect>()

  // ── M38 Track B: Faction abilities ───────────────────────────────────────
  private _factionAbilities = new Map<FactionId, FactionAbility>()

  // ── M38 Track B: Berserk state (Iron Brotherhood) ────────────────────────
  readonly berserkState: BerserkState = { active: false, hitsRemaining: 0, timer: 0 }

  // ── M38 Track B: Hunter's Mark target ────────────────────────────────────
  markedEnemyId: number | null = null

  // ── M38 Track B: No-stamina flash timer ──────────────────────────────────
  noStaminaFlashTimer = 0   // seconds remaining for "No Stamina!" flash

  // ── Public getters ───────────────────────────────────────────────────────

  get cooldownProgress(): number {
    if (this.attackCooldownMax <= 0) return 1
    return 1 - (this.attackCooldownTimer / this.attackCooldownMax)
  }

  get combo(): number { return this.comboCount }

  get isInCombat(): boolean {
    return (Date.now() - this.lastCombatTime) < 10000
  }

  get isDodging(): boolean {
    return this.dodgeActiveTimer > 0
  }

  get dodgeCooldownProgress(): number {
    return 1 - (this.dodgeCooldownTimer / CombatSystem.DODGE_COOLDOWN)
  }

  get isBlocking(): boolean { return this._isBlocking }

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Roll for critical hit.
   * M31 Track C: 5% base + 2% per combat skill level + 15% backstab.
   * Backstab: dot(attackDir, enemyFacing) < -0.5 (attacking from behind).
   * @param combatSkillLevel - player's combat skill level (0-10)
   * @param attackDir - normalised direction from player to enemy
   * @param enemyFacing - normalised forward vector of enemy
   */
  rollCrit(combatSkillLevel: number, attackDir?: { x: number; z: number }, enemyFacing?: { x: number; z: number }): boolean {
    let chance = CombatSystem.CRIT_BASE + combatSkillLevel * CombatSystem.CRIT_PER_LEVEL
    if (attackDir && enemyFacing) {
      const dot = attackDir.x * enemyFacing.x + attackDir.z * enemyFacing.z
      if (dot < -0.5) chance += CombatSystem.CRIT_BACKSTAB
    }
    return Math.random() < chance
  }

  canAttack(): boolean {
    return this.attackCooldownTimer <= 0
  }

  /**
   * M38 Track B: Call when player starts an attack. Returns combo damage multiplier.
   * Combo 1→2→3: each hit in chain deals +15% more damage.
   * Combo x3+: each subsequent hit deals +20% more damage.
   */
  startAttack(weaponName: string): number {
    const category = getWeaponCategory(weaponName)
    this.attackCooldownMax = WEAPON_COOLDOWNS[category] ?? WEAPON_COOLDOWNS.default
    this.attackCooldownTimer = this.attackCooldownMax
    this.lastCombatTime = Date.now()

    // M38 Track B: Advance combo using 0.8s window and 1.5s reset
    const now = Date.now()
    const timeSinceLast = (now - this.lastAttackTime) / 1000
    this.lastAttackTime = now

    if (timeSinceLast <= CombatSystem.COMBO_WINDOW && this.comboCount > 0) {
      this.comboCount++
    } else {
      this.comboCount = 1
    }
    this.comboTimer = 0

    // Show combo notification at combo >= 3
    if (this.comboCount >= 3) {
      this.comboNotification = { count: this.comboCount, age: 0, maxAge: 2.0 }
    }

    return this._getComboMultiplier()
  }

  /**
   * M38 Track B: Combo damage multiplier.
   * Combo 1: 1.0x, Combo 2: 1.15x, Combo 3: 1.30x, Combo 4+: each +20% (1.30 + 0.20*(n-3))
   */
  private _getComboMultiplier(): number {
    if (this.comboCount <= 1) return 1.0
    if (this.comboCount === 2) return 1.15
    if (this.comboCount === 3) return 1.30
    // combo 4+: 1.30 + 0.20 * (count - 3)
    return 1.30 + 0.20 * (this.comboCount - 3)
  }

  get comboMultiplier(): number { return this._getComboMultiplier() }

  startDodge(): boolean {
    if (this.dodgeCooldownTimer > 0 || this.dodgeActiveTimer > 0) return false
    this.dodgeActiveTimer = CombatSystem.DODGE_DURATION
    this.dodgeCooldownTimer = CombatSystem.DODGE_COOLDOWN
    this.lastCombatTime = Date.now()
    return true
  }

  triggerNoStaminaFlash(): void {
    this.noStaminaFlashTimer = 1.5  // show for 1.5s
  }

  setBlocking(active: boolean): void {
    this._isBlocking = active
  }

  /** Returns damage reduction factor (0 = no reduction, 0.5 = 50% reduced). */
  getIncomingDamageMultiplier(): number {
    if (this.isDodging) return 0        // iframe
    if (this._isBlocking) return 1 - CombatSystem.BLOCK_DR
    // M38: Berserk takes 50% more damage
    if (this.berserkState.active && this.berserkState.timer > 0) return 1.5
    return 1
  }

  // ── M38 Track B: Weapon special effects ─────────────────────────────────

  /**
   * Apply on-hit weapon effects. Returns modified damage and any effects triggered.
   * @param weaponName - the equipped weapon name
   * @param baseDamage - base damage before weapon effects
   * @param targetEntityId - enemy entity hit
   * @param enchants - list of active enchantments (e.g. ['fire_edge', 'life_steal'])
   */
  applyWeaponEffects(
    weaponName: string,
    baseDamage: number,
    targetEntityId: number,
    enchants: string[] = [],
  ): { damage: number; healAmount: number; blink: boolean; stunned: boolean } {
    let damage = baseDamage
    let healAmount = 0
    let blink = false
    let stunned = false

    const lower = weaponName.toLowerCase()
    let status = this.enemyStatusEffects.get(targetEntityId)
    if (!status) {
      status = { entityId: targetEntityId, stunTimer: 0, burnTimer: 0, markTimer: 0, confuseTimer: 0, fearTimer: 0 }
      this.enemyStatusEffects.set(targetEntityId, status)
    }

    // Hunter's Mark: +30% damage to marked enemy
    if (this.markedEnemyId === targetEntityId && status.markTimer > 0) {
      damage *= 1.3
    }

    // Berserk: next 3 attacks deal 2x damage
    if (this.berserkState.active && this.berserkState.hitsRemaining > 0) {
      damage *= 2
      this.berserkState.hitsRemaining--
      if (this.berserkState.hitsRemaining <= 0) {
        this.berserkState.active = false
      }
    }

    // Diamond Blade: 10% chance to stun for 1s
    if (lower.includes('diamond blade') && Math.random() < 0.10) {
      status.stunTimer = Math.max(status.stunTimer, 1.0)
      stunned = true
    }

    // Quantum Blade: blink strike — teleport 2m toward enemy
    if (lower.includes('quantum blade')) {
      blink = true
    }

    // Fire Edge enchant: burn enemy for 5s
    if (enchants.includes('fire_edge')) {
      status.burnTimer = Math.max(status.burnTimer, 5.0)
    }

    // Life Steal enchant: heal 5% of damage dealt
    if (enchants.includes('life_steal')) {
      healAmount = damage * 0.05
    }

    return { damage, healAmount, blink, stunned }
  }

  // ── M38 Track B: Faction abilities ───────────────────────────────────────

  /** Register faction abilities (call when player joins a faction). */
  registerFactionAbility(factionId: FactionId, ability: FactionAbility): void {
    this._factionAbilities.set(factionId, ability)
  }

  getFactionAbility(factionId: FactionId): FactionAbility | null {
    return this._factionAbilities.get(factionId) ?? null
  }

  /** Returns remaining cooldown fraction 0–1 (1 = ready). */
  getFactionAbilityCooldownProgress(factionId: FactionId): number {
    const ab = this._factionAbilities.get(factionId)
    if (!ab) return 0
    const elapsed = Date.now() - ab.lastUsedMs
    return Math.min(1, elapsed / ab.cooldownMs)
  }

  /**
   * Attempt to fire the faction ability. Returns false if on cooldown.
   * nearestEnemyId: used for targeted abilities (mark, confuse).
   */
  activateFactionAbility(factionId: FactionId, nearestEnemyId: number | null = null): boolean {
    const ab = this._factionAbilities.get(factionId)
    if (!ab) return false
    const elapsed = Date.now() - ab.lastUsedMs
    if (elapsed < ab.cooldownMs) return false

    ab.lastUsedMs = Date.now()
    ab.applyEffect()
    this.lastCombatTime = Date.now()

    // Apply the faction-specific effect
    switch (factionId) {
      case 'rangers':
        // Hunter's Mark: +30% damage to marked enemy for 10s
        if (nearestEnemyId !== null) {
          this.markedEnemyId = nearestEnemyId
          let status = this.enemyStatusEffects.get(nearestEnemyId)
          if (!status) {
            status = { entityId: nearestEnemyId, stunTimer: 0, burnTimer: 0, markTimer: 0, confuseTimer: 0, fearTimer: 0 }
            this.enemyStatusEffects.set(nearestEnemyId, status)
          }
          status.markTimer = 10.0
        }
        break
      case 'merchants':
        // Golden Bribe: confuse non-boss enemy for 5s
        if (nearestEnemyId !== null) {
          let status = this.enemyStatusEffects.get(nearestEnemyId)
          if (!status) {
            status = { entityId: nearestEnemyId, stunTimer: 0, burnTimer: 0, markTimer: 0, confuseTimer: 0, fearTimer: 0 }
            this.enemyStatusEffects.set(nearestEnemyId, status)
          }
          status.confuseTimer = 5.0
        }
        break
      case 'scholars':
        // Mind Blast: AoE stun all enemies within 10m for 3s (handled by caller using this list)
        // Mark via a special flag; caller reads aoeStunPending
        this._aoeStunPending = true
        break
      case 'outlaws':
        // Berserk: next 3 attacks deal 2x damage, player takes 50% more damage for 5s
        this.berserkState.active = true
        this.berserkState.hitsRemaining = 3
        this.berserkState.timer = 5.0
        break
    }

    return true
  }

  // M38: AoE stun flag for Mind Blast (scholars)
  private _aoeStunPending = false
  get aoeStunPending(): boolean { return this._aoeStunPending }
  consumeAoeStun(): void { this._aoeStunPending = false }

  /** Apply stun to all enemies in the given list (called by GameLoop after AoE stun). */
  applyAoeStun(enemyIds: number[], duration: number): void {
    for (const eid of enemyIds) {
      let status = this.enemyStatusEffects.get(eid)
      if (!status) {
        status = { entityId: eid, stunTimer: 0, burnTimer: 0, markTimer: 0, confuseTimer: 0, fearTimer: 0 }
        this.enemyStatusEffects.set(eid, status)
      }
      status.stunTimer = Math.max(status.stunTimer, duration)
    }
  }

  /** Apply fear to an enemy (flee response when HP < 20%). */
  applyFear(entityId: number, duration: number): void {
    let status = this.enemyStatusEffects.get(entityId)
    if (!status) {
      status = { entityId, stunTimer: 0, burnTimer: 0, markTimer: 0, confuseTimer: 0, fearTimer: 0 }
      this.enemyStatusEffects.set(entityId, status)
    }
    status.fearTimer = Math.max(status.fearTimer, duration)
  }

  getEnemyStatus(entityId: number): EnemyStatusEffect | null {
    return this.enemyStatusEffects.get(entityId) ?? null
  }

  // ── Damage number spawning ───────────────────────────────────────────────

  spawnDamageNumber(x: number, y: number, z: number, amount: number, isCritical: boolean): void {
    const dn: DamageNumber = {
      id: _dmgId++,
      x, y, z,
      amount: Math.round(amount),
      isCritical,
      isCombo: this.comboCount >= 2,
      age: 0,
      maxAge: 1.0,
    }

    if (this.damageNumbers.length >= CombatSystem.MAX_DMG_NUMBERS) {
      // Replace oldest
      let oldestIdx = 0
      let oldestAge = -1
      for (let i = 0; i < this.damageNumbers.length; i++) {
        if (this.damageNumbers[i].age > oldestAge) {
          oldestAge = this.damageNumbers[i].age
          oldestIdx = i
        }
      }
      this.damageNumbers[oldestIdx] = dn
    } else {
      this.damageNumbers.push(dn)
    }
  }

  // ── Enemy health bar tracking ────────────────────────────────────────────

  updateEnemyHealth(entityId: number, species: string, x: number, y: number, z: number, health: number, maxHealth: number): void {
    this.enemyHealthBars.set(entityId, {
      entityId, species, x, y, z, health, maxHealth,
      lastDamageTime: Date.now(),
    })
  }

  // ── Per-frame tick ───────────────────────────────────────────────────────

  tick(dt: number): void {
    // Cooldowns
    if (this.attackCooldownTimer > 0) this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt)
    if (this.dodgeCooldownTimer > 0) this.dodgeCooldownTimer = Math.max(0, this.dodgeCooldownTimer - dt)
    if (this.dodgeActiveTimer > 0) this.dodgeActiveTimer = Math.max(0, this.dodgeActiveTimer - dt)

    // M38: No stamina flash timer
    if (this.noStaminaFlashTimer > 0) this.noStaminaFlashTimer = Math.max(0, this.noStaminaFlashTimer - dt)

    // M38: Combo reset after 1.5s without attacking
    this.comboTimer += dt
    if (this.comboTimer > CombatSystem.COMBO_RESET) {
      this.comboCount = 0
    }

    // M38: Combo notification aging
    if (this.comboNotification) {
      this.comboNotification.age += dt
      if (this.comboNotification.age >= this.comboNotification.maxAge) {
        this.comboNotification = null
      }
    }

    // M38: Berserk timer
    if (this.berserkState.timer > 0) {
      this.berserkState.timer = Math.max(0, this.berserkState.timer - dt)
      if (this.berserkState.timer <= 0 && !this.berserkState.active) {
        this.berserkState.hitsRemaining = 0
      }
    }

    // M38: Tick enemy status effects
    for (const [eid, status] of this.enemyStatusEffects) {
      if (status.stunTimer > 0) status.stunTimer = Math.max(0, status.stunTimer - dt)
      if (status.burnTimer > 0) status.burnTimer = Math.max(0, status.burnTimer - dt)
      if (status.markTimer > 0) status.markTimer = Math.max(0, status.markTimer - dt)
      if (status.confuseTimer > 0) status.confuseTimer = Math.max(0, status.confuseTimer - dt)
      if (status.fearTimer > 0) status.fearTimer = Math.max(0, status.fearTimer - dt)

      // Clean up if marked enemy marker expired
      if (this.markedEnemyId === eid && status.markTimer <= 0) {
        this.markedEnemyId = null
      }

      // Remove status entry if all effects expired
      if (
        status.stunTimer <= 0 &&
        status.burnTimer <= 0 &&
        status.markTimer <= 0 &&
        status.confuseTimer <= 0 &&
        status.fearTimer <= 0
      ) {
        this.enemyStatusEffects.delete(eid)
      }
    }

    // Age damage numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      this.damageNumbers[i].age += dt
      if (this.damageNumbers[i].age >= this.damageNumbers[i].maxAge) {
        this.damageNumbers.splice(i, 1)
      }
    }

    // Prune stale health bars
    const now = Date.now()
    for (const [id, bar] of this.enemyHealthBars) {
      if (now - bar.lastDamageTime > CombatSystem.HEALTH_BAR_FADE || bar.health <= 0) {
        this.enemyHealthBars.delete(id)
      }
    }
  }
}
