/**
 * MutationEngine.ts
 *
 * Biologically accurate mutation mechanisms for genome evolution.
 * All mutation rates are calibrated to real-world values (E. coli baseline).
 *
 * Mutation types implemented:
 *   - Point mutation  (single bit flip)     ~10^-9 /bit/generation base rate
 *   - Insertion       (shift bits right)    ~1/10th of point rate
 *   - Deletion        (shift bits left)     ~1/10th of point rate
 *   - Transposition   (Barbara McClintock's jumping genes) ~1/100th
 *   - Horizontal transfer (viral transduction / conjugation) ~1/1000th
 *
 * Environmental mutagens amplify rates up to 1000× (ionizing radiation, UV, chemicals).
 */

import type { Genome } from './GenomeEncoder'
import { GenomeEncoder } from './GenomeEncoder'
import { BIOLOGY } from '../engine/constants'

export type MutationType =
  | 'point_mutation'
  | 'insertion'
  | 'deletion'
  | 'duplication'
  | 'inversion'
  | 'transposition'
  | 'crossover'
  | 'horizontal_transfer'

export interface MutationEvent {
  type:      MutationType
  position:  number   // bit position where mutation occurred
  oldValue:  number   // previous bit or byte value
  newValue:  number   // new bit or byte value
  timestamp: number   // simulation time of this mutation
}

// Relative rate multipliers compared to point mutation rate
const RATE_INSERTION      = 0.1
const RATE_DELETION       = 0.1
const RATE_TRANSPOSITION  = 0.01
const RATE_INVERSION      = 0.005
const RATE_DUPLICATION    = 0.005

// Minimum transposon / duplication / inversion segment size in bits
const MIN_SEGMENT_BITS = 8
const MAX_SEGMENT_BITS = 16

// Genome size in bits
const GENOME_BITS = 256

// Critical regulatory bit positions — if zeroed, genome is likely lethal.
// Bits 96-103 (neural score) must not all become 0 for complex organisms.
// Metabolic rate bits 16-19 — if all 0, organism cannot metabolize (lethal above nanoscale).
// Reproduction rate bits 80-83 — if all 0, organism cannot reproduce (lineage extinction).
const CRITICAL_REGIONS: Array<{ start: number; length: number; fatalIfZero: boolean }> = [
  { start: 16, length: 4,  fatalIfZero: true  },  // metabolic rate — must be > 0
  { start: 24, length: 4,  fatalIfZero: false },  // dietary type — 0 is valid (autotroph)
  { start: 80, length: 4,  fatalIfZero: true  },  // reproduction rate — must be > 0
]

export class MutationEngine {
  /** Base mutation rate: ~10^-9 per bit per generation (E. coli calibrated). */
  static readonly BASE_RATE = BIOLOGY.mutation_rate_base  // 1e-9

  private readonly encoder = new GenomeEncoder()

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Apply all mutation types to a genome.
   *
   * Effective rate formula:
   *   effectiveRate = BASE_RATE × (1 + mutagenLevel × 1000) × generationsPassed
   *
   * This means:
   *   - Clean environment (mutagen=0): ~10^-9 /bit/gen (one mutation per ~10^9 bits processed)
   *   - Heavy mutagen (mutagen=1): ~10^-6 /bit/gen (typical UV-damaged bacterial rate)
   *
   * All mutations are applied in-place to the genome. Returns the list of events.
   */
  mutate(
    genome: Genome,
    mutagenLevel: number,
    generationsPassed: number,
    rng: () => number,
    simTime = 0
  ): MutationEvent[] {
    const clampedMutagen = Math.max(0, Math.min(1, mutagenLevel))
    const effectiveRate  = MutationEngine.BASE_RATE
      * (1 + clampedMutagen * 1000)
      * Math.max(1, generationsPassed)

    const events: MutationEvent[] = []

    events.push(...this.pointMutation(genome,    effectiveRate,                      rng, simTime))
    events.push(...this.insertion(genome,        effectiveRate * RATE_INSERTION,     rng, simTime))
    events.push(...this.deletion(genome,         effectiveRate * RATE_DELETION,      rng, simTime))
    events.push(...this.transposition(genome,    effectiveRate * RATE_TRANSPOSITION, rng, simTime))
    events.push(...this.inversion(genome,        effectiveRate * RATE_INVERSION,     rng, simTime))
    events.push(...this.duplication(genome,      effectiveRate * RATE_DUPLICATION,   rng, simTime))

    return events
  }

  /**
   * Horizontal gene transfer from a donor genome.
   * Simulates viral transduction (bacteriophage carrying genes) and
   * bacterial conjugation (direct DNA transfer through pili).
   *
   * A random 8-16 bit segment from the donor is inserted at a random position
   * in the recipient. Only occurs at high population density.
   *
   * Base rate: ~10^-12 per bit per generation (rare but historically significant —
   * responsible for widespread antibiotic resistance spread in bacteria).
   */
  horizontalTransfer(
    recipient: Genome,
    donor: Genome,
    rng: () => number,
    populationDensity: number,  // 0-1, representing relative density
    simTime = 0
  ): MutationEvent[] {
    // HGT only occurs above a minimum density threshold (quorum sensing analog)
    const densityThreshold = 0.1
    if (populationDensity < densityThreshold) return []

    const baseHgtRate = MutationEngine.BASE_RATE * 1e-3  // 1000× rarer than point mutation
    const adjustedRate = baseHgtRate * populationDensity

    const events: MutationEvent[] = []

    // One transfer attempt per call — if rate check passes, transfer a segment
    if (rng() < adjustedRate * GENOME_BITS) {
      const segmentLen  = MIN_SEGMENT_BITS + Math.floor(rng() * (MAX_SEGMENT_BITS - MIN_SEGMENT_BITS + 1))
      const donorStart  = Math.floor(rng() * (GENOME_BITS - segmentLen))
      const recipientPos = Math.floor(rng() * (GENOME_BITS - segmentLen))

      for (let i = 0; i < segmentLen; i++) {
        const srcBit   = donorStart + i
        const destBit  = recipientPos + i
        const oldValue = this.encoder.getBit(recipient, destBit) ? 1 : 0
        const newValue = this.encoder.getBit(donor, srcBit) ? 1 : 0

        if (oldValue !== newValue) {
          this.encoder.setBits(recipient, destBit, 1, newValue)
          events.push({
            type:      'horizontal_transfer',
            position:  destBit,
            oldValue,
            newValue,
            timestamp: simTime,
          })
        }
      }
    }

    return events
  }

  /**
   * Determine if a genome is non-viable (organism would not survive to reproduce).
   * Checks critical regulatory regions for impossible states.
   */
  isLethal(genome: Genome): boolean {
    for (const region of CRITICAL_REGIONS) {
      if (!region.fatalIfZero) continue
      const value = this.encoder.getBits(genome, region.start, region.length)
      if (value === 0) return true
    }
    return false
  }

  // ─── Private mutation implementations ────────────────────────────────────

  /**
   * Point mutation: independently flip each bit with probability `rate`.
   * This is the most common mutation type — analogous to base substitution
   * (A→T, G→C etc.) in real DNA. Modeled as a Poisson process over all bits.
   */
  private pointMutation(
    genome: Genome,
    rate: number,
    rng: () => number,
    simTime: number
  ): MutationEvent[] {
    const events: MutationEvent[] = []

    // Expected number of mutations = rate × GENOME_BITS
    // For very small rates, iterate over all bits; for larger rates use Poisson sampling
    const expectedMutations = rate * GENOME_BITS

    if (expectedMutations < 0.1) {
      // Fast path: Poisson — sample the number of mutations first
      const numMutations = this.poissonSample(expectedMutations, rng)
      for (let m = 0; m < numMutations; m++) {
        const bit      = Math.floor(rng() * GENOME_BITS)
        const oldValue = this.encoder.getBit(genome, bit) ? 1 : 0
        const newValue = 1 - oldValue

        this.encoder.setBits(genome, bit, 1, newValue)
        events.push({ type: 'point_mutation', position: bit, oldValue, newValue, timestamp: simTime })
      }
    } else {
      // High rate: check each bit independently (mutagenic environment)
      for (let bit = 0; bit < GENOME_BITS; bit++) {
        if (rng() < rate) {
          const oldValue = this.encoder.getBit(genome, bit) ? 1 : 0
          const newValue = 1 - oldValue

          this.encoder.setBits(genome, bit, 1, newValue)
          events.push({ type: 'point_mutation', position: bit, oldValue, newValue, timestamp: simTime })
        }
      }
    }

    return events
  }

  /**
   * Insertion: insert a random bit at a chosen position, shifting all subsequent
   * bits one position to the right. The last bit is lost (fixed-length genome).
   * Analogous to frameshift insertions in real genomes.
   */
  private insertion(
    genome: Genome,
    rate: number,
    rng: () => number,
    simTime: number
  ): MutationEvent[] {
    const events: MutationEvent[] = []
    const expected = rate * GENOME_BITS
    const count    = this.poissonSample(expected, rng)

    for (let i = 0; i < count; i++) {
      const position  = Math.floor(rng() * GENOME_BITS)
      const insertBit = Math.round(rng())  // random 0 or 1

      // Shift all bits from `position` to 254 one step right (bit 255 is dropped)
      for (let b = GENOME_BITS - 2; b >= position; b--) {
        const val = this.encoder.getBit(genome, b) ? 1 : 0
        this.encoder.setBits(genome, b + 1, 1, val)
      }
      this.encoder.setBits(genome, position, 1, insertBit)

      events.push({
        type:      'insertion',
        position,
        oldValue:  0,       // nothing was there before (conceptually)
        newValue:  insertBit,
        timestamp: simTime,
      })
    }

    return events
  }

  /**
   * Deletion: remove the bit at a chosen position, shifting all subsequent bits
   * one position left. A 0 bit is appended at position 255.
   * Analogous to frameshift deletions in real genomes.
   */
  private deletion(
    genome: Genome,
    rate: number,
    rng: () => number,
    simTime: number
  ): MutationEvent[] {
    const events: MutationEvent[] = []
    const expected = rate * GENOME_BITS
    const count    = this.poissonSample(expected, rng)

    for (let i = 0; i < count; i++) {
      const position = Math.floor(rng() * GENOME_BITS)
      const oldValue = this.encoder.getBit(genome, position) ? 1 : 0

      // Shift all bits from position+1 to 255 one step left
      for (let b = position; b < GENOME_BITS - 1; b++) {
        const val = this.encoder.getBit(genome, b + 1) ? 1 : 0
        this.encoder.setBits(genome, b, 1, val)
      }
      // Zero out the last bit
      this.encoder.setBits(genome, GENOME_BITS - 1, 1, 0)

      events.push({
        type:      'deletion',
        position,
        oldValue,
        newValue:  0,
        timestamp: simTime,
      })
    }

    return events
  }

  /**
   * Transposition: copy an 8-16 bit segment from one position to another.
   * Named after Barbara McClintock's discovery of "jumping genes" in maize (1950).
   * The source segment is copied (not moved) to a random destination.
   * This can disrupt destination genes or create new gene combinations.
   */
  private transposition(
    genome: Genome,
    rate: number,
    rng: () => number,
    simTime: number
  ): MutationEvent[] {
    const events: MutationEvent[] = []
    const expected = rate * GENOME_BITS
    const count    = this.poissonSample(expected, rng)

    for (let i = 0; i < count; i++) {
      const segLen  = MIN_SEGMENT_BITS + Math.floor(rng() * (MAX_SEGMENT_BITS - MIN_SEGMENT_BITS + 1))
      const srcPos  = Math.floor(rng() * (GENOME_BITS - segLen))
      let   destPos = Math.floor(rng() * (GENOME_BITS - segLen))

      // Avoid trivial self-copy
      while (Math.abs(destPos - srcPos) < segLen) {
        destPos = Math.floor(rng() * (GENOME_BITS - segLen))
      }

      // Read source segment
      const segment: number[] = []
      for (let b = 0; b < segLen; b++) {
        segment.push(this.encoder.getBit(genome, srcPos + b) ? 1 : 0)
      }

      // Write to destination (overwrite — transposon inserts into target locus)
      for (let b = 0; b < segLen; b++) {
        const destBit  = destPos + b
        const oldValue = this.encoder.getBit(genome, destBit) ? 1 : 0
        const newValue = segment[b]

        if (oldValue !== newValue) {
          this.encoder.setBits(genome, destBit, 1, newValue)
          events.push({
            type:      'transposition',
            position:  destBit,
            oldValue,
            newValue,
            timestamp: simTime,
          })
        }
      }
    }

    return events
  }

  /**
   * Inversion: reverse a segment of 8-16 bits in place.
   * Models chromosomal inversions that can alter gene expression by flipping
   * regulatory sequences relative to coding sequences.
   */
  private inversion(
    genome: Genome,
    rate: number,
    rng: () => number,
    simTime: number
  ): MutationEvent[] {
    const events: MutationEvent[] = []
    const expected = rate * GENOME_BITS
    const count    = this.poissonSample(expected, rng)

    for (let i = 0; i < count; i++) {
      const segLen = MIN_SEGMENT_BITS + Math.floor(rng() * (MAX_SEGMENT_BITS - MIN_SEGMENT_BITS + 1))
      const start  = Math.floor(rng() * (GENOME_BITS - segLen))

      // Read segment
      const segment: number[] = []
      for (let b = 0; b < segLen; b++) {
        segment.push(this.encoder.getBit(genome, start + b) ? 1 : 0)
      }

      // Write reversed
      for (let b = 0; b < segLen; b++) {
        const pos      = start + b
        const oldValue = segment[b]
        const newValue = segment[segLen - 1 - b]

        if (oldValue !== newValue) {
          this.encoder.setBits(genome, pos, 1, newValue)
          events.push({
            type:      'inversion',
            position:  pos,
            oldValue,
            newValue,
            timestamp: simTime,
          })
        }
      }
    }

    return events
  }

  /**
   * Duplication: copy a segment and append it to an adjacent location (tandem duplication).
   * Duplicated genes can evolve independently — a major source of evolutionary novelty.
   * Models gene family expansion (e.g. globin family, Hox genes).
   */
  private duplication(
    genome: Genome,
    rate: number,
    rng: () => number,
    simTime: number
  ): MutationEvent[] {
    const events: MutationEvent[] = []
    const expected = rate * GENOME_BITS
    const count    = this.poissonSample(expected, rng)

    for (let i = 0; i < count; i++) {
      const segLen = MIN_SEGMENT_BITS + Math.floor(rng() * (MAX_SEGMENT_BITS - MIN_SEGMENT_BITS + 1))
      const start  = Math.floor(rng() * (GENOME_BITS - segLen * 2))

      // Read source segment
      const segment: number[] = []
      for (let b = 0; b < segLen; b++) {
        segment.push(this.encoder.getBit(genome, start + b) ? 1 : 0)
      }

      // Write copy immediately after source (tandem duplication)
      const destStart = start + segLen
      for (let b = 0; b < segLen; b++) {
        const pos      = destStart + b
        const oldValue = this.encoder.getBit(genome, pos) ? 1 : 0
        const newValue = segment[b]

        if (oldValue !== newValue) {
          this.encoder.setBits(genome, pos, 1, newValue)
          events.push({
            type:      'duplication',
            position:  pos,
            oldValue,
            newValue,
            timestamp: simTime,
          })
        }
      }
    }

    return events
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Sample from a Poisson distribution using Knuth's algorithm.
   * Used to determine how many mutations occur given an expected rate.
   *
   * Knuth's method is accurate for λ < ~30 and efficient for our small rates.
   */
  private poissonSample(lambda: number, rng: () => number): number {
    if (lambda <= 0) return 0
    if (lambda > 30) {
      // For large lambda, use normal approximation N(lambda, sqrt(lambda))
      // Box-Muller transform
      const u1 = Math.max(1e-15, rng())
      const u2 = rng()
      const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z))
    }

    // Knuth's algorithm
    const L = Math.exp(-lambda)
    let k = 0
    let p = 1
    do {
      k++
      p *= rng()
    } while (p > L)
    return k - 1
  }
}
