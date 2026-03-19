export interface Civilization {
  id: number
  name: string
  tier: number                         // 0-9
  population: number
  territory: Array<[number, number]>   // chunk coordinates controlled
  treasury: number                     // currency units
  researchPoints: number               // accumulated RP for tech research
  relations: Map<number, number>       // civId → diplomacy score (-1 war, 0 neutral, 1 ally)
  capital: [number, number, number]    // world position of capital
  founded: number                      // sim time
  color: string                        // hex color for map rendering
}

export type DiplomacyEvent = 'trade' | 'war' | 'peace' | 'alliance' | 'rivalry'

const DIPLOMACY_DELTAS: Record<DiplomacyEvent, number> = {
  trade: 0.05,
  alliance: 0.2,
  peace: 0.1,
  rivalry: -0.1,
  war: -0.5,
}

const CIV_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#ecf0f1', '#95a5a6', '#34495e',
]

export class CivilizationTracker {
  private civs: Map<number, Civilization> = new Map()
  private nextId = 1

  createCivilization(name: string, foundingPos: [number, number, number], simTime = 0): Civilization {
    const id = this.nextId++
    const civ: Civilization = {
      id,
      name,
      tier: 0,
      population: 10 + Math.floor(Math.random() * 40),
      territory: [[Math.floor(foundingPos[0] / 256), Math.floor(foundingPos[2] / 256)]],
      treasury: 100,
      researchPoints: 0,
      relations: new Map(),
      capital: [...foundingPos] as [number, number, number],
      founded: simTime,
      color: CIV_COLORS[(id - 1) % CIV_COLORS.length],
    }
    // Initialise neutral relations with all existing civs
    for (const existing of this.civs.values()) {
      civ.relations.set(existing.id, 0)
      existing.relations.set(id, 0)
    }
    this.civs.set(id, civ)
    return civ
  }

  /**
   * Advance the civilisation simulation.
   * dtSim: simulation seconds since last tick.
   */
  tick(dtSim: number): void {
    const dtDays = dtSim / 86400

    for (const civ of this.civs.values()) {
      this.tickPopulation(civ, dtDays)
      this.tickEconomy(civ, dtDays)
      this.tickResearch(civ, dtDays)
      this.tickExpansion(civ, dtDays)
      this.updateTier(civ)
    }

    // Inter-civilisation interactions
    const civList = Array.from(this.civs.values())
    for (let i = 0; i < civList.length; i++) {
      for (let j = i + 1; j < civList.length; j++) {
        this.interactCivs(civList[i], civList[j], dtDays)
      }
    }
  }

  /** Returns the civilisation whose territory contains the given position, or null. */
  getCivAtPosition(pos: [number, number, number]): Civilization | null {
    const cx = Math.floor(pos[0] / 256)
    const cz = Math.floor(pos[2] / 256)
    for (const civ of this.civs.values()) {
      if (civ.territory.some(([tx, tz]) => tx === cx && tz === cz)) return civ
    }
    return null
  }

  /** Apply a diplomacy event between two civilisations. */
  diplomacy(civAId: number, civBId: number, event: DiplomacyEvent): void {
    const civA = this.civs.get(civAId)
    const civB = this.civs.get(civBId)
    if (!civA || !civB) return

    const delta = DIPLOMACY_DELTAS[event]
    const currentAB = civA.relations.get(civBId) ?? 0
    const currentBA = civB.relations.get(civAId) ?? 0

    civA.relations.set(civBId, Math.max(-1, Math.min(1, currentAB + delta)))
    civB.relations.set(civAId, Math.max(-1, Math.min(1, currentBA + delta)))

    // War: reduce populations proportional to military strength
    if (event === 'war') {
      const casualtyFactor = 0.001 * dtSimFromEvent(civA.tier, civB.tier)
      civA.population = Math.max(1, Math.floor(civA.population * (1 - casualtyFactor)))
      civB.population = Math.max(1, Math.floor(civB.population * (1 - casualtyFactor)))
    }

    // Trade: exchange treasury
    if (event === 'trade') {
      const tradeVolume = Math.min(civA.treasury, civB.treasury) * 0.02
      civA.treasury += tradeVolume * 0.5
      civB.treasury += tradeVolume * 0.5
    }
  }

  getCivilization(id: number): Civilization | undefined {
    return this.civs.get(id)
  }

  getAllCivilizations(): Civilization[] {
    return Array.from(this.civs.values())
  }

  getRelation(civAId: number, civBId: number): number {
    return this.civs.get(civAId)?.relations.get(civBId) ?? 0
  }

  get count(): number {
    return this.civs.size
  }

  // ── Private tick helpers ──────────────────────────────────────────────────

  private tickPopulation(civ: Civilization, dtDays: number): void {
    // Logistic growth: r proportional to tier (better medicine, food production)
    // Real human population growth rate: ~0.5-3% per year
    const rPerYear = 0.005 + civ.tier * 0.003
    const rPerDay = rPerYear / 365
    const carryingCapacity = 1000 * Math.pow(10, civ.tier * 0.8)  // grows exponentially with tier

    const growth = civ.population * rPerDay * (1 - civ.population / carryingCapacity) * dtDays
    civ.population = Math.max(1, Math.floor(civ.population + growth))
  }

  private tickEconomy(civ: Civilization, dtDays: number): void {
    // Treasury grows from taxes: pop × GDP_per_capita × tax_rate
    // Simplified: linear with population and tier
    const gdpPerCapPerDay = 0.01 * Math.pow(2, civ.tier)  // doubles per tier
    const taxRate = 0.1
    const income = civ.population * gdpPerCapPerDay * taxRate * dtDays

    // Expenses: fixed costs for territory, military, infrastructure
    const expenses = (civ.territory.length * 0.1 + civ.tier * 5) * dtDays

    civ.treasury = Math.max(0, civ.treasury + income - expenses)
  }

  private tickResearch(civ: Civilization, dtDays: number): void {
    // Research scales with population (more minds) and treasury investment
    const rpPerDay = Math.sqrt(civ.population) * (1 + civ.tier * 0.5)
    civ.researchPoints += rpPerDay * dtDays
  }

  private tickExpansion(civ: Civilization, dtDays: number): void {
    // Civilisations expand their territory when they have sufficient population
    const targetTerritory = Math.floor(civ.population / 500) + 1
    if (civ.territory.length < targetTerritory && civ.treasury > 100) {
      // Expand to adjacent chunk
      const lastChunk = civ.territory[civ.territory.length - 1]
      const dx = Math.round(Math.random() * 2 - 1)
      const dz = Math.round(Math.random() * 2 - 1)
      if (dx !== 0 || dz !== 0) {
        const newChunk: [number, number] = [lastChunk[0] + dx, lastChunk[1] + dz]
        const alreadyOwned = civ.territory.some(([tx, tz]) => tx === newChunk[0] && tz === newChunk[1])
        if (!alreadyOwned) {
          civ.territory.push(newChunk)
          civ.treasury -= 50
        }
      }
    }
  }

  private updateTier(civ: Civilization): void {
    // Tier thresholds based on research points and population
    const tierThresholds = [0, 1000, 10000, 100000, 1e6, 1e7, 1e8, 1e9, 1e11, 1e13]
    for (let t = 9; t >= 0; t--) {
      if (civ.researchPoints >= tierThresholds[t] && civ.population >= Math.pow(10, t)) {
        civ.tier = t
        break
      }
    }
  }

  private interactCivs(civA: Civilization, civB: Civilization, dtDays: number): void {
    const relation = civA.relations.get(civB.id) ?? 0

    // Proximity check: do their territories overlap or border?
    const sharedBorder = civA.territory.some(([ax, az]) =>
      civB.territory.some(([bx, bz]) => Math.abs(ax - bx) <= 1 && Math.abs(az - bz) <= 1)
    )

    if (!sharedBorder) return

    // Spontaneous trade when relations are neutral+
    if (relation > 0 && Math.random() < 0.001 * dtDays) {
      this.diplomacy(civA.id, civB.id, 'trade')
    }

    // Spontaneous conflict when relations are hostile
    if (relation < -0.5 && Math.random() < 0.0005 * dtDays) {
      this.diplomacy(civA.id, civB.id, 'war')
    }
  }
}

/** Helper: estimate casualty scale factor based on military tiers */
function dtSimFromEvent(tierA: number, tierB: number): number {
  return 1 + (tierA + tierB) * 0.2
}
