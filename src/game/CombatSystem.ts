// ── CombatSystem.ts ──────────────────────────────────────────────────────────
// M24 Track A: Combat state management
//
// Manages: attack cooldowns per weapon type, combo counter (3-hit),
// dodge mechanic (Shift, 0.3s iframe, 2s cooldown), block (RMB, 50% DR).
// Floating damage numbers and health bar tracking for recently-damaged entities.

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

// Weapon cooldowns by weapon category (seconds)
const WEAPON_COOLDOWNS: Record<string, number> = {
  hand:       0.8,
  stone_tool: 1.2,
  knife:      0.7,
  spear:      1.0,
  axe:        1.1,
  sword:      0.6,
  bow:        1.5,
  musket:     8.0,
  default:    1.0,
}

// Map weapon name keywords to category
function getWeaponCategory(weaponName: string): string {
  const lower = weaponName.toLowerCase()
  if (lower === 'hand') return 'hand'
  if (lower.includes('musket')) return 'musket'
  if (lower.includes('bow')) return 'bow'
  if (lower.includes('sword')) return 'sword'
  if (lower.includes('knife') || lower.includes('dagger')) return 'knife'
  if (lower.includes('spear')) return 'spear'
  if (lower.includes('axe')) return 'axe'
  if (lower.includes('stone tool')) return 'stone_tool'
  return 'default'
}

let _dmgId = 0

export class CombatSystem {
  // ── Attack cooldown ──────────────────────────────────────────────────────
  private attackCooldownTimer = 0
  private attackCooldownMax   = 1.0

  // ── Combo ────────────────────────────────────────────────────────────────
  private comboCount  = 0
  private comboTimer  = 0       // seconds since last hit; resets combo after 2s
  private static COMBO_WINDOW  = 2.0
  private static COMBO_MULTS   = [1.0, 1.0, 1.2, 1.5]

  // ── Dodge ────────────────────────────────────────────────────────────────
  private dodgeCooldownTimer = 0
  private dodgeActiveTimer   = 0
  private static DODGE_COOLDOWN = 2.0
  private static DODGE_DURATION = 0.3

  // ── Block ────────────────────────────────────────────────────────────────
  private _isBlocking = false
  private static BLOCK_DR = 0.5    // 50% damage reduction

  // ── Last combat time (for HUD visibility) ────────────────────────────────
  private lastCombatTime = 0

  // ── Floating damage numbers (ring buffer) ────────────────────────────────
  readonly damageNumbers: DamageNumber[] = []
  private static MAX_DMG_NUMBERS = 20

  // ── Enemy health bars ────────────────────────────────────────────────────
  readonly enemyHealthBars = new Map<number, EnemyHealthBar>()
  private static HEALTH_BAR_FADE = 5000  // ms after last damage

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

  canAttack(): boolean {
    return this.attackCooldownTimer <= 0
  }

  /** Call when player starts an attack. Returns combo damage multiplier. */
  startAttack(weaponName: string): number {
    const category = getWeaponCategory(weaponName)
    this.attackCooldownMax = WEAPON_COOLDOWNS[category] ?? WEAPON_COOLDOWNS.default
    this.attackCooldownTimer = this.attackCooldownMax
    this.lastCombatTime = Date.now()

    // Advance combo
    if (this.comboTimer < CombatSystem.COMBO_WINDOW) {
      this.comboCount = Math.min(this.comboCount + 1, 3)
    } else {
      this.comboCount = 1
    }
    this.comboTimer = 0

    return CombatSystem.COMBO_MULTS[this.comboCount] ?? 1.0
  }

  startDodge(): boolean {
    if (this.dodgeCooldownTimer > 0 || this.dodgeActiveTimer > 0) return false
    this.dodgeActiveTimer = CombatSystem.DODGE_DURATION
    this.dodgeCooldownTimer = CombatSystem.DODGE_COOLDOWN
    this.lastCombatTime = Date.now()
    return true
  }

  setBlocking(active: boolean): void {
    this._isBlocking = active
  }

  /** Returns damage reduction factor (0 = no reduction, 0.5 = 50% reduced). */
  getIncomingDamageMultiplier(): number {
    if (this.isDodging) return 0        // iframe
    if (this._isBlocking) return 1 - CombatSystem.BLOCK_DR
    return 1
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

    // Combo timeout
    this.comboTimer += dt
    if (this.comboTimer > CombatSystem.COMBO_WINDOW) {
      this.comboCount = 0
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
