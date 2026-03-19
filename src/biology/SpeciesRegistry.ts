/**
 * SpeciesRegistry.ts
 *
 * Tracks all species that have ever existed: lineages, population counts,
 * extinction events, biodiversity metrics, and phylogenetic relationships.
 *
 * Species identity is determined by genetic distance from the parent species.
 * When cumulative drift exceeds a speciation threshold (analogous to Biological
 * Species Concept + phylogenetic distance), a new species is registered.
 *
 * Naming system: Latin-style binomial nomenclature with procedurally generated
 * genus and species epithets. Names are seeded for reproducibility.
 */

export type ExtinctionCause =
  | 'competition'
  | 'predation'
  | 'climate'
  | 'disease'
  | 'asteroid'
  | 'volcanic'
  | 'player_action'
  | 'habitat_loss'
  | 'starvation'
  | 'unknown'

export type TrophicLevel =
  | 'producer'
  | 'primary_consumer'
  | 'secondary_consumer'
  | 'tertiary_consumer'
  | 'decomposer'
  | 'omnivore'

export interface Species {
  id:             number
  name:           string          // Genus species (Latin binomial)
  parentId:       number | null   // ancestral species ID (null = first life)
  firstSeenAt:    number          // simulation time of first appearance
  extinctAt:      number | null   // simulation time of extinction
  extinctCause:   ExtinctionCause | null
  currentPop:     number
  peakPop:        number
  genomeTemplate: Uint8Array      // representative genome
  biome:          string[]        // biomes currently inhabited
  trophicLevel:   TrophicLevel
  children:       number[]        // child species IDs
}

// ─── Name Generator ────────────────────────────────────────────────────────

/**
 * Deterministic Latin-style name generator.
 * Uses a seeded LCG (linear congruential generator) so names are reproducible
 * for the same species ID.
 *
 * Real Latin naming inspiration: body traits, environments, discoverer names.
 * Keeps names pronounceable and roughly Latin/Greek in feel.
 */
const GENUS_PREFIXES = [
  'Acro', 'Adeno', 'Agro', 'Albo', 'Alti', 'Ambi', 'Amphi', 'Aniso',
  'Aqua', 'Arbo', 'Arco', 'Argi', 'Astro', 'Atro', 'Avi', 'Bathy',
  'Bio', 'Brachy', 'Brevi', 'Carni', 'Chemo', 'Chiro', 'Chromo',
  'Cirri', 'Coelo', 'Crypto', 'Cyclo', 'Cyno', 'Dactyl', 'Dendro',
  'Echino', 'Ecto', 'Electro', 'Endo', 'Euri', 'Ferro', 'Flavi',
  'Glio', 'Gymno', 'Haemo', 'Haplo', 'Hemi', 'Hetero', 'Holo',
  'Homo', 'Hydro', 'Hyper', 'Hypo', 'Ichthyo', 'Iso', 'Lago',
  'Lepto', 'Litho', 'Lopho', 'Luco', 'Macro', 'Mega', 'Melano',
  'Meso', 'Meta', 'Micro', 'Mio', 'Mono', 'Morpho', 'Myco',
  'Myxo', 'Nano', 'Necto', 'Neo', 'Nitro', 'Noctua', 'Octo',
  'Oligo', 'Ortho', 'Osteo', 'Pachy', 'Paleo', 'Para', 'Penta',
  'Petro', 'Phago', 'Phyto', 'Placo', 'Plati', 'Pleio', 'Poly',
  'Proto', 'Pseudo', 'Ptero', 'Pyro', 'Rhizo', 'Sauro', 'Sclerio',
  'Sphaero', 'Spiro', 'Stego', 'Steno', 'Strepto', 'Stylo', 'Sym',
  'Tachy', 'Thermo', 'Topo', 'Trachy', 'Tri', 'Tropho', 'Uro',
  'Xeno', 'Xylo', 'Zoo', 'Zygo',
]

const GENUS_SUFFIXES = [
  'acea', 'ales', 'alis', 'aster', 'ax', 'cephalus', 'ceras', 'dactylus',
  'derma', 'don', 'forma', 'gaster', 'gnathus', 'gracilis', 'ichthys',
  'lobus', 'morphus', 'nema', 'odon', 'oides', 'ops', 'phila', 'philus',
  'phora', 'phyta', 'poda', 'saura', 'saurus', 'soma', 'sphaera',
  'spira', 'stigma', 'tera', 'theca', 'thelys', 'thrix', 'thyris',
  'us', 'vora', 'zoa',
]

const SPECIES_EPITHETS = [
  'aequalis', 'agilis', 'albus', 'altus', 'amplus', 'angustus', 'antiquus',
  'arbustivus', 'arcuatus', 'arenarius', 'armatus', 'asper', 'ater',
  'aureus', 'australis', 'barbatus', 'borealis', 'brevis', 'caeruleus',
  'calvus', 'capillatus', 'carnivorus', 'caudatus', 'cinereus', 'communis',
  'compactus', 'cordatus', 'corniculatus', 'coronatus', 'crassus',
  'cristatus', 'curvatus', 'deciduus', 'dentatus', 'depressus', 'digitatus',
  'dilatatus', 'dimorphus', 'dissimilis', 'distans', 'divergens', 'dubius',
  'elegans', 'elongatus', 'eminens', 'equalis', 'fasciatus', 'ferox',
  'festivus', 'filamentosus', 'flavus', 'fluviatilis', 'foetidus',
  'fragilis', 'fulvus', 'fusiformis', 'fuscus', 'gigas', 'glaber',
  'glacialis', 'gracilis', 'grandis', 'granulatus', 'griseus', 'hastatus',
  'horridus', 'humilis', 'immaculatus', 'incertus', 'infimus', 'integer',
  'lacustris', 'laevis', 'lanceolatus', 'latifolius', 'latus', 'lepidus',
  'lineatus', 'longicaudus', 'longus', 'lucidus', 'luridus', 'maculatus',
  'magnus', 'marginatus', 'marinus', 'maximus', 'medius', 'melanocephalus',
  'microphthalmus', 'minimus', 'mirabilis', 'mollis', 'multidentatus',
  'murinus', 'mutabilis', 'nanus', 'niger', 'nitidus', 'nobilis', 'nocturnus',
  'nordicus', 'novus', 'obesus', 'obscurus', 'obtusus', 'occidentalis',
  'ochroleucus', 'olivaceus', 'operculatus', 'orientalis', 'ovatus',
  'pallidus', 'palmatus', 'parvus', 'patagonicus', 'patulus', 'paucus',
  'pectoralis', 'pelagicus', 'pellucidus', 'pennatus', 'planus', 'plumbeus',
  'politus', 'polyphagus', 'porrectus', 'productus', 'profundus', 'prolixus',
  'punctatus', 'pustulatus', 'quadratus', 'rectus', 'reticulatus',
  'robustus', 'roseus', 'rotundus', 'rubens', 'ruber', 'rufus', 'rugosus',
  'rupestris', 'scaber', 'scoparius', 'serratus', 'sordidus', 'spinosus',
  'squamosus', 'stellatus', 'striatus', 'suturalis', 'sylvaticus',
  'tenuirostris', 'tenuis', 'terrestris', 'testaceus', 'tricolor',
  'tuberculatus', 'tumidus', 'turbinatus', 'undulatus', 'unicolor',
  'validus', 'variegatus', 'velatus', 'venosus', 'verrucosus', 'vestitus',
  'viridis', 'vittatus', 'vulgaris', 'xanthocephalus', 'zonatus',
]

/** Fast LCG for seeded name generation. State is not persisted — ephemeral use only. */
function lcgRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0
    return s / 0x100000000
  }
}

function generateSpeciesName(id: number, parentId: number | null): string {
  const rng = lcgRand(id * 2654435761 + (parentId ?? 0) * 1234567)

  const prefix  = GENUS_PREFIXES[Math.floor(rng() * GENUS_PREFIXES.length)]
  const suffix  = GENUS_SUFFIXES[Math.floor(rng() * GENUS_SUFFIXES.length)]
  const epithet = SPECIES_EPITHETS[Math.floor(rng() * SPECIES_EPITHETS.length)]

  // Capitalize genus, lowercase epithet (standard binomial nomenclature)
  const genus = prefix + suffix
  return `${genus} ${epithet}`
}

// ─── SpeciesRegistry ───────────────────────────────────────────────────────

export class SpeciesRegistry {
  private species  = new Map<number, Species>()
  private nextId   = 1
  private simTime  = 0

  // ─── Registration ──────────────────────────────────────────────────────

  /**
   * Register a new species derived from a parent (or null for first life).
   * The genome template is stored as a snapshot for phylogenetic comparison.
   */
  register(
    genome:    Uint8Array,
    parentId:  number | null,
    simTime:   number,
    options?: {
      initialPop?:   number
      biome?:        string[]
      trophicLevel?: TrophicLevel
    }
  ): Species {
    const id = this.nextId++
    this.simTime = simTime

    const species: Species = {
      id,
      name:           generateSpeciesName(id, parentId),
      parentId,
      firstSeenAt:    simTime,
      extinctAt:      null,
      extinctCause:   null,
      currentPop:     options?.initialPop ?? 1,
      peakPop:        options?.initialPop ?? 1,
      genomeTemplate: genome.slice(),  // deep copy
      biome:          options?.biome ?? [],
      trophicLevel:   options?.trophicLevel ?? 'heterotroph' as TrophicLevel,
      children:       [],
    }

    this.species.set(id, species)

    // Register this as a child of the parent
    if (parentId !== null) {
      const parent = this.species.get(parentId)
      if (parent) {
        parent.children.push(id)
      }
    }

    return species
  }

  // ─── Population management ────────────────────────────────────────────

  /**
   * Update a species' population by a delta (positive = growth, negative = decline).
   * Updates peak population tracking. Does not auto-trigger extinction — callers
   * must call markExtinct when population reaches 0.
   */
  updatePopulation(speciesId: number, delta: number): void {
    const s = this.species.get(speciesId)
    if (!s) return

    s.currentPop = Math.max(0, s.currentPop + delta)
    if (s.currentPop > s.peakPop) {
      s.peakPop = s.currentPop
    }
  }

  /** Set a species' population to an absolute value. */
  setPopulation(speciesId: number, population: number): void {
    const s = this.species.get(speciesId)
    if (!s) return

    s.currentPop = Math.max(0, population)
    if (s.currentPop > s.peakPop) {
      s.peakPop = s.currentPop
    }
  }

  // ─── Extinction ───────────────────────────────────────────────────────

  markExtinct(speciesId: number, cause: ExtinctionCause, simTime: number): void {
    const s = this.species.get(speciesId)
    if (!s || s.extinctAt !== null) return  // already extinct

    s.extinctAt    = simTime
    s.extinctCause = cause
    s.currentPop   = 0
    this.simTime   = simTime
  }

  // ─── Queries ──────────────────────────────────────────────────────────

  getSpecies(id: number): Species | undefined {
    return this.species.get(id)
  }

  /** All species currently alive (not extinct). */
  getAliveSpecies(): Species[] {
    const alive: Species[] = []
    for (const s of this.species.values()) {
      if (s.extinctAt === null) alive.push(s)
    }
    return alive
  }

  /** All species that have ever existed. */
  getAllSpecies(): Species[] {
    return Array.from(this.species.values())
  }

  /** All extinct species. */
  getExtinctSpecies(): Species[] {
    return Array.from(this.species.values()).filter(s => s.extinctAt !== null)
  }

  /**
   * Return the full ancestor chain for a species, from LUCA to the given species.
   * Index 0 is the oldest ancestor; last element is the requested species.
   */
  getLineage(speciesId: number): Species[] {
    const chain: Species[] = []
    let   current: Species | undefined = this.species.get(speciesId)

    while (current) {
      chain.unshift(current)  // prepend so oldest ancestor is first
      current = current.parentId !== null
        ? this.species.get(current.parentId)
        : undefined
    }

    return chain
  }

  /**
   * Return all descendants of a species (recursive BFS).
   * Does not include the species itself.
   */
  getDescendants(speciesId: number): Species[] {
    const root = this.species.get(speciesId)
    if (!root) return []

    const result: Species[] = []
    const queue: number[] = [...root.children]

    while (queue.length > 0) {
      const id   = queue.shift()!
      const spec = this.species.get(id)
      if (spec) {
        result.push(spec)
        queue.push(...spec.children)
      }
    }

    return result
  }

  /**
   * Get the most recent common ancestor of two species.
   * Returns undefined if no common ancestor found.
   */
  getMostRecentCommonAncestor(idA: number, idB: number): Species | undefined {
    const lineageA = new Set(this.getLineage(idA).map(s => s.id))

    let current: Species | undefined = this.species.get(idB)
    while (current) {
      if (lineageA.has(current.id)) return current
      current = current.parentId !== null
        ? this.species.get(current.parentId)
        : undefined
    }

    return undefined
  }

  // ─── Biodiversity metrics ─────────────────────────────────────────────

  /**
   * Shannon entropy biodiversity index (H').
   *
   * H' = -Σ (pᵢ × ln(pᵢ))
   *
   * where pᵢ = population fraction of species i among all alive species.
   *
   * H' = 0 → single species dominates completely
   * H' = ln(S) → perfectly equal distribution across S species (maximum diversity)
   *
   * Real ecosystems typically range H' = 1.5 – 3.5
   */
  getBiodiversityIndex(): number {
    const alive  = this.getAliveSpecies().filter(s => s.currentPop > 0)
    if (alive.length === 0) return 0

    const total  = alive.reduce((sum, s) => sum + s.currentPop, 0)
    if (total === 0) return 0

    let H = 0
    for (const s of alive) {
      const p = s.currentPop / total
      if (p > 0) H -= p * Math.log(p)
    }

    return H
  }

  /**
   * Simpson's Diversity Index (D).
   * D = 1 - Σ (nᵢ × (nᵢ - 1)) / (N × (N - 1))
   * Range: 0 (no diversity) → 1 (maximum diversity)
   *
   * More robust to rare species than Shannon entropy.
   */
  getSimpsonsIndex(): number {
    const alive = this.getAliveSpecies().filter(s => s.currentPop > 0)
    if (alive.length <= 1) return 0

    const N = alive.reduce((sum, s) => sum + s.currentPop, 0)
    if (N <= 1) return 0

    const sumPairs = alive.reduce((sum, s) => {
      const n = s.currentPop
      return sum + n * (n - 1)
    }, 0)

    return 1 - sumPairs / (N * (N - 1))
  }

  /**
   * Species richness: raw count of alive species.
   */
  getSpeciesRichness(): number {
    return this.getAliveSpecies().length
  }

  /**
   * Phylogenetic diversity: sum of branch lengths in the phylogenetic tree.
   * Approximated as total number of speciation events in the lineage tree,
   * weighted by time between speciation events.
   * Higher = more evolutionary history represented.
   */
  getPhylogeneticDiversity(): number {
    let total = 0
    for (const s of this.species.values()) {
      if (s.parentId === null) continue  // root species — no branch length
      const parent = this.species.get(s.parentId)
      if (!parent) continue

      // Branch length = time between parent appearance and this species appearance
      const branchLength = s.firstSeenAt - parent.firstSeenAt
      total += Math.max(0, branchLength)
    }
    return total
  }

  // ─── Statistics ───────────────────────────────────────────────────────

  getStatistics(): {
    totalSpeciesEver:     number
    aliveSpeciesCount:    number
    extinctSpeciesCount:  number
    biodiversityH:        number
    biodiversityD:        number
    totalBiomass:         number
    extinctionsByCategory: Record<ExtinctionCause, number>
  } {
    const all     = Array.from(this.species.values())
    const alive   = all.filter(s => s.extinctAt === null)
    const extinct = all.filter(s => s.extinctAt !== null)

    const extinctionsByCategory = {} as Record<ExtinctionCause, number>
    for (const s of extinct) {
      const cause = s.extinctCause ?? 'unknown'
      extinctionsByCategory[cause] = (extinctionsByCategory[cause] ?? 0) + 1
    }

    return {
      totalSpeciesEver:    all.length,
      aliveSpeciesCount:   alive.length,
      extinctSpeciesCount: extinct.length,
      biodiversityH:       this.getBiodiversityIndex(),
      biodiversityD:       this.getSimpsonsIndex(),
      totalBiomass:        alive.reduce((sum, s) => sum + s.currentPop, 0),
      extinctionsByCategory,
    }
  }

  // ─── Serialization ────────────────────────────────────────────────────

  /** Serialize to a plain object for persistence (IndexedDB / JSON). */
  serialize(): object {
    const entries: object[] = []
    for (const [id, s] of this.species) {
      entries.push({
        id,
        name:           s.name,
        parentId:       s.parentId,
        firstSeenAt:    s.firstSeenAt,
        extinctAt:      s.extinctAt,
        extinctCause:   s.extinctCause,
        currentPop:     s.currentPop,
        peakPop:        s.peakPop,
        genomeTemplate: Array.from(s.genomeTemplate),
        biome:          s.biome,
        trophicLevel:   s.trophicLevel,
        children:       s.children,
      })
    }
    return { nextId: this.nextId, simTime: this.simTime, species: entries }
  }

  /** Restore from a serialized object. */
  static deserialize(data: ReturnType<SpeciesRegistry['serialize']>): SpeciesRegistry {
    const reg = new SpeciesRegistry()
    const d   = data as {
      nextId: number
      simTime: number
      species: Array<{
        id: number; name: string; parentId: number | null
        firstSeenAt: number; extinctAt: number | null; extinctCause: ExtinctionCause | null
        currentPop: number; peakPop: number; genomeTemplate: number[]
        biome: string[]; trophicLevel: TrophicLevel; children: number[]
      }>
    }

    reg.nextId  = d.nextId
    reg.simTime = d.simTime

    for (const s of d.species) {
      reg.species.set(s.id, {
        ...s,
        genomeTemplate: new Uint8Array(s.genomeTemplate),
      })
    }

    return reg
  }
}
