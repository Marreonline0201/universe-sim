// ── TutorialSystem.ts ──────────────────────────────────────────────────────────
// M24 Track C: Guided onboarding for first 5 minutes of gameplay.
// Linear state machine: MOVE -> CAMERA -> GATHER -> CRAFT -> EQUIP -> BUILD -> COMBAT -> COMPLETE.
// Persists step to OfflineSaveManager so tutorial doesn't repeat.

export type TutorialStep = 'MOVE' | 'CAMERA' | 'GATHER' | 'CRAFT' | 'EQUIP' | 'BUILD' | 'COMBAT' | 'COMPLETE'

const STEP_ORDER: TutorialStep[] = ['MOVE', 'CAMERA', 'GATHER', 'CRAFT', 'EQUIP', 'BUILD', 'COMBAT', 'COMPLETE']

const STEP_MESSAGES: Record<TutorialStep, string> = {
  MOVE: 'Use WASD to move around. Explore your surroundings!',
  CAMERA: 'Click the screen to lock the pointer, then move the mouse to look around.',
  GATHER: 'Walk up to a tree and Left-Click to gather wood.',
  CRAFT: 'Press C to open Crafting. Find "Stone Axe" and craft it.',
  EQUIP: 'Press I to open Inventory. Click the Stone Axe to equip it.',
  BUILD: 'Press B to open Building. Place a Campfire -- you will need it at night!',
  COMBAT: 'Find an animal nearby and Left-Click to attack it. Watch your health!',
  COMPLETE: 'Tutorial complete! The world is yours to explore. Good luck!',
}

export class TutorialSystem {
  private currentStep: TutorialStep = 'MOVE'
  private distanceMoved = 0
  private cameraRotation = 0
  private lastPx = 0
  private lastPy = 0
  private lastPz = 0
  private hasInitialPos = false
  private _completeTimer = 0

  get step(): TutorialStep { return this.currentStep }
  get message(): string { return STEP_MESSAGES[this.currentStep] }
  get isComplete(): boolean { return this.currentStep === 'COMPLETE' }
  get completeTimer(): number { return this._completeTimer }

  skip(): void {
    this.currentStep = 'COMPLETE'
  }

  private advance(): void {
    const idx = STEP_ORDER.indexOf(this.currentStep)
    if (idx < STEP_ORDER.length - 1) {
      this.currentStep = STEP_ORDER[idx + 1]
    }
  }

  tick(
    dt: number,
    px: number, py: number, pz: number,
    hasWood: boolean,
    hasStoneAxe: boolean,
    equippedIsAxe: boolean,
    hasCampfire: boolean,
    hasAttackedAnimal: boolean,
    cameraRotationDelta: number,
  ): void {
    if (this.isComplete) {
      this._completeTimer += dt
      return
    }

    // Track distance
    if (this.hasInitialPos) {
      const dx = px - this.lastPx
      const dy = py - this.lastPy
      const dz = pz - this.lastPz
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist < 50) this.distanceMoved += dist  // ignore teleports
    }
    this.lastPx = px; this.lastPy = py; this.lastPz = pz
    this.hasInitialPos = true

    // Track camera rotation
    this.cameraRotation += Math.abs(cameraRotationDelta)

    // Check step conditions
    switch (this.currentStep) {
      case 'MOVE':
        if (this.distanceMoved >= 5) this.advance()
        break
      case 'CAMERA':
        if (this.cameraRotation >= 1.57) this.advance()  // ~90 degrees in radians
        break
      case 'GATHER':
        if (hasWood) this.advance()
        break
      case 'CRAFT':
        if (hasStoneAxe) this.advance()
        break
      case 'EQUIP':
        if (equippedIsAxe) this.advance()
        break
      case 'BUILD':
        if (hasCampfire) this.advance()
        break
      case 'COMBAT':
        if (hasAttackedAnimal) this.advance()
        break
      case 'COMPLETE':
        this._completeTimer += dt
        break
    }
  }

  serialize(): string {
    return this.currentStep
  }

  deserialize(data: unknown): void {
    if (typeof data === 'string' && STEP_ORDER.includes(data as TutorialStep)) {
      this.currentStep = data as TutorialStep
    }
  }
}
