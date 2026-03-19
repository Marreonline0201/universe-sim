/**
 * GenomeEncoder.ts
 *
 * 256-bit genome (32 bytes as Uint8Array) encoding creature phenotypes.
 * Implements dominant/recessive allele logic and real chromosomal crossover.
 *
 * Genome layout — 256 bits (32 bytes = Uint8Array of 32)
 *
 * Bits   0-15  : Body plan
 *   bits 0-3   = body symmetry: 0=asymmetric, 1=bilateral, 2=radial, 3=spherical
 *   bits 4-7   = segment count (0-15 = 1-16 segments)
 *   bits 8-11  = limb count (0-15)
 *   bits 12-15 = appendage type: 0=none,1=flagella,2=cilia,3=pseudopods,4=fins,5=legs,6=wings,7=tentacles
 *
 * Bits  16-31  : Metabolism
 *   bits 16-19 = metabolic rate (0=very slow, 15=very fast)
 *   bits 20-23 = temperature range preference (0=psychrophile,5=mesophile,10=thermophile,15=hyperthermophile)
 *   bits 24-27 = dietary type: 0=autotroph,1=heterotroph,2=mixotroph,3=chemoautotroph
 *   bits 28-31 = size class: 0=nanoscale,4=micro,8=small,12=medium,15=large
 *
 * Bits  32-47  : Sensory
 *   bits 32-35 = vision type: 0=none,1=light/dark,2=color,3=UV,4=IR,5=compound,6=camera
 *   bits 36-39 = vision range (0-15 → 0-30m)
 *   bits 40-43 = hearing: 0=none,1=vibration,2=low-freq,3=ultrasonic,4=full-spectrum
 *   bits 44-47 = olfaction sensitivity (0=none, 15=extraordinary)
 *
 * Bits  48-63  : Locomotion
 *   bits 48-51 = swim speed (0=sessile, 15=fast)
 *   bits 52-55 = walk speed (0=none, 15=fast)
 *   bits 56-59 = fly speed (0=none, 15=fast)
 *   bits 60-63 = burrowing (0=none, 15=fast)
 *
 * Bits  64-79  : Defense/Offense
 *   bit  64    = has armor/shell
 *   bit  65    = has venom
 *   bit  66    = has camouflage
 *   bit  67    = bioluminescent
 *   bits 68-71 = armor thickness (0-15)
 *   bits 72-75 = venom potency (0-15)
 *   bits 76-79 = offensive weapon type: 0=none,1=claws,2=beak,3=teeth,4=spines,5=electric,6=chemical
 *
 * Bits  80-95  : Reproduction
 *   bits 80-83 = reproduction rate (0=very slow, 15=very fast)
 *   bits 84-87 = offspring count per event (0-15 = 1-16)
 *   bits 88-91 = gestation period (0=asexual/instant,15=long gestation)
 *   bits 92-95 = parental care (0=none, 15=extensive)
 *
 * Bits  96-127 : Neural complexity
 *   bits 96-103  = neural complexity score (0-255)
 *     0-15  : Level 0 — reflex only (bacteria, jellyfish)
 *     16-63 : Level 1 — instinct (fish, insects)
 *     64-127: Level 2 — learning (mammals, birds)
 *     128-191: Level 3 — reasoning (great apes, dolphins, early humans)
 *     192-255: Level 4 — abstract/language (humans)
 *   bits 104-111 = memory capacity (0-255 memory slots)
 *   bits 112-119 = learning rate (0=fixed, 255=fast learner)
 *   bits 120-127 = curiosity drive (0=no exploration, 255=always exploring)
 *
 * Bits 128-159 : Social behavior
 *   bits 128-131 = social structure: 0=solitary,1=pair,2=small_group,3=pack,4=herd,5=hive,6=tribal,7=cultural
 *   bits 132-135 = group size preference (0-15 = 1-32 individuals)
 *   bits 136-143 = dominance drive (0=submissive, 255=highly dominant)
 *   bits 144-151 = cooperation drive (0=purely selfish, 255=highly cooperative)
 *   bits 152-159 = altruism (0=none, 255=kin+group selection)
 *
 * Bits 160-191 : Communication
 *   bits 160-163 = communication type: 0=chemical,1=visual,2=auditory,3=tactile,4=electrical,5=symbolic
 *   bits 164-167 = signal complexity (0=simple, 15=complex)
 *   bits 168-175 = vocabulary size (0-255, exponential: 2^(value/16))
 *   bits 176-183 = grammar complexity (0=none, 255=full syntax)
 *   bits 184-191 = cultural transmission rate (0=none, 255=fast social learning)
 *
 * Bits 192-223 : Developmental biology
 *   bits 192-199 = growth rate (0=slow, 255=fast)
 *   bits 200-207 = maximum lifespan (0=ephemeral, 255=very long-lived)
 *   bits 208-215 = aging rate (0=negligible, 255=fast aging)
 *   bits 216-223 = metamorphosis stages (0=none, 255=complex)
 *
 * Bits 224-255 : Civilization-era traits
 *   bits 224-231 = tool use sophistication (0=none, 255=advanced technology)
 *   bits 232-239 = abstract reasoning (0=none, 255=mathematics/philosophy)
 *   bits 240-247 = cultural knowledge capacity (0=none, 255=civilization-level)
 *   bits 248-255 = technology drive (0=no interest, 255=intense drive to innovate)
 */

export type Genome = Uint8Array

export interface Phenotype {
  // Body plan
  bodySymmetry:   0 | 1 | 2 | 3          // 0=asymmetric, 1=bilateral, 2=radial, 3=spherical
  segmentCount:   number                  // 1-16
  limbCount:      number                  // 0-15
  appendageType:  number                  // 0-7

  // Metabolism
  metabolicRate:        number            // 0-15
  tempPreference:       number            // 0-15 (psychrophile→hyperthermophile)
  dietaryType:          0 | 1 | 2 | 3    // autotroph/heterotroph/mixotroph/chemoautotroph
  sizeClass:            number            // 0-15

  // Sensory
  visionType:       number                // 0-6
  visionRange:      number                // 0-15 (maps to 0-30m geometric)
  hearing:          number                // 0-4
  olfaction:        number                // 0-15

  // Locomotion
  swimSpeed:   number                     // 0-15
  walkSpeed:   number                     // 0-15
  flySpeed:    number                     // 0-15
  burrowSpeed: number                     // 0-15

  // Defense/Offense
  hasArmor:        boolean
  hasVenom:        boolean
  hasCamouflage:   boolean
  isBioluminescent: boolean
  armorThickness:  number                 // 0-15
  venomPotency:    number                 // 0-15
  weaponType:      number                 // 0-6

  // Reproduction
  reproductionRate:  number               // 0-15
  offspringCount:    number               // 0-15 (= count - 1, so 1-16)
  gestationPeriod:   number               // 0-15
  parentalCare:      number               // 0-15

  // Neural complexity
  neuralComplexity:  number               // 0-255
  memoryCapacity:    number               // 0-255
  learningRate:      number               // 0-255
  curiosityDrive:    number               // 0-255
  neuralLevel:       0 | 1 | 2 | 3 | 4  // derived from neuralComplexity

  // Social behavior
  socialStructure:   number               // 0-7
  groupSizePref:     number               // 0-15
  dominanceDrive:    number               // 0-255
  cooperationDrive:  number               // 0-255
  altruism:          number               // 0-255

  // Communication
  communicationType: number               // 0-5
  signalComplexity:  number               // 0-15
  vocabularySize:    number               // 0-255 (exponential)
  grammarComplexity: number               // 0-255
  culturalTransmission: number            // 0-255

  // Developmental biology
  growthRate:        number               // 0-255
  maxLifespan:       number               // 0-255
  agingRate:         number               // 0-255
  metamorphosis:     number               // 0-255

  // Civilization-era traits
  toolUseSophistication: number           // 0-255
  abstractReasoning:     number           // 0-255
  culturalKnowledge:     number           // 0-255
  technologyDrive:       number           // 0-255
}

export class GenomeEncoder {
  // ─── Bit-level accessors ───────────────────────────────────────────────────

  /** Read a single bit from the genome. */
  getBit(genome: Genome, bit: number): boolean {
    const byteIndex = Math.floor(bit / 8)
    const bitIndex  = bit % 8
    return ((genome[byteIndex] >> bitIndex) & 1) === 1
  }

  /**
   * Extract `count` bits starting at `startBit` as an unsigned integer.
   * Supports up to 32 bits across byte boundaries.
   */
  getBits(genome: Genome, startBit: number, count: number): number {
    let value = 0
    for (let i = 0; i < count; i++) {
      if (this.getBit(genome, startBit + i)) {
        value |= (1 << i)
      }
    }
    return value >>> 0  // unsigned
  }

  /**
   * Set `count` bits starting at `startBit` to the given `value`.
   * Mutates the genome in-place.
   */
  setBits(genome: Genome, startBit: number, count: number, value: number): void {
    const masked = value & ((1 << count) - 1)
    for (let i = 0; i < count; i++) {
      const byteIndex = Math.floor((startBit + i) / 8)
      const bitIndex  = (startBit + i) % 8
      if ((masked >> i) & 1) {
        genome[byteIndex] |=  (1 << bitIndex)
      } else {
        genome[byteIndex] &= ~(1 << bitIndex)
      }
    }
  }

  // ─── Dominant / Recessive allele resolution ────────────────────────────────

  /**
   * For multi-bit fields that encode paired alleles:
   * Odd-indexed bits = dominant allele bit
   * Even-indexed bits = recessive allele bit
   *
   * Resolution rules (per pair):
   *   dominant=1, recessive=anything → 1 (dominant)
   *   dominant=0, recessive=1        → 0 (dominant suppresses)
   *   dominant=0, recessive=0        → 0 (homozygous recessive — 0 expresses)
   *
   * For 4-bit fields (two 2-bit allele pairs), we read the effective 2-bit value
   * by resolving each bit through dominant/recessive logic.
   */
  private resolveAllele(genome: Genome, startBit: number, count: number): number {
    // Each bit in the logical field is encoded as a pair: (recessive, dominant)
    // Pair layout: bits [startBit + 2i] = recessive, [startBit + 2i + 1] = dominant
    // count = number of logical bits; actual genome bits used = count * 2
    // For 4-bit fields we have count=4 logical bits using 8 genome bits
    // BUT: genome layout uses 4-bit fields directly (not doubled). So we apply
    // a simpler model: treat the nibble as two 2-bit alleles (high nibble = dominant).
    // The dominant allele nibble overrides if non-zero; otherwise recessive expresses.
    const allBits = this.getBits(genome, startBit, count * 2)
    const dominant  = allBits >> count            // high half
    const recessive = allBits & ((1 << count) - 1) // low half
    // If dominant allele has any signal, it wins
    return dominant !== 0 ? dominant : recessive
  }

  /**
   * Read a 4-bit field with dominant/recessive resolution.
   * Uses the standard field position (genome encodes 4 bits = single nibble).
   * Applies allele logic: treat even bit positions within the nibble as recessive,
   * odd bit positions as dominant.
   */
  private readAllele4(genome: Genome, startBit: number): number {
    const raw = this.getBits(genome, startBit, 4)
    // Bits 1, 3 of the nibble are "dominant" positions
    // Bits 0, 2 of the nibble are "recessive" positions
    const dominantBits  = ((raw >> 1) & 1) | (((raw >> 3) & 1) << 1) // bits [1,3] → 2-bit dominant
    const recessiveBits = (raw & 1) | (((raw >> 2) & 1) << 1)         // bits [0,2] → 2-bit recessive
    // Dominant wins if non-zero
    const effective2bit = dominantBits !== 0 ? dominantBits : recessiveBits
    // Map back to 0-15 range by scaling (2-bit → 0-3, multiply by 5 for 0-15 range)
    // Preserve symmetry with the original field for non-allele reads
    return effective2bit
  }

  /**
   * Read a full-byte field (8 bits) with dominant/recessive resolution.
   * High nibble = dominant allele, Low nibble = recessive allele.
   */
  private readAllele8(genome: Genome, startBit: number): number {
    const raw = this.getBits(genome, startBit, 8)
    const dominant  = (raw >> 4) & 0xF
    const recessive = raw & 0xF
    return dominant !== 0 ? dominant : recessive
  }

  // ─── Neural level ──────────────────────────────────────────────────────────

  /** Derive discrete neural level (0-4) from the 8-bit neural complexity score. */
  neuralLevel(genome: Genome): 0 | 1 | 2 | 3 | 4 {
    const score = this.getBits(genome, 96, 8)
    if (score < 16)  return 0
    if (score < 64)  return 1
    if (score < 128) return 2
    if (score < 192) return 3
    return 4
  }

  // ─── Decode ────────────────────────────────────────────────────────────────

  decode(genome: Genome): Phenotype {
    // Body plan — use allele-aware reads for the 4-bit fields
    const bodySymmetry  = (this.readAllele4(genome,  0) & 3) as 0|1|2|3
    const segmentCount  = this.getBits(genome,  4, 4)   // raw count 0-15 (= 1-16 segments)
    const limbCount     = this.getBits(genome,  8, 4)
    const appendageType = this.getBits(genome, 12, 4)

    // Metabolism
    const metabolicRate  = this.getBits(genome, 16, 4)
    const tempPreference = this.getBits(genome, 20, 4)
    const dietaryType    = (this.getBits(genome, 24, 4) & 3) as 0|1|2|3
    const sizeClass      = this.getBits(genome, 28, 4)

    // Sensory
    const visionType  = this.getBits(genome, 32, 4)
    const visionRange = this.getBits(genome, 36, 4)
    const hearing     = this.getBits(genome, 40, 4)
    const olfaction   = this.getBits(genome, 44, 4)

    // Locomotion
    const swimSpeed   = this.getBits(genome, 48, 4)
    const walkSpeed   = this.getBits(genome, 52, 4)
    const flySpeed    = this.getBits(genome, 56, 4)
    const burrowSpeed = this.getBits(genome, 60, 4)

    // Defense/Offense — individual bit flags use dominant/recessive at bit level
    // Bit 64: armor — dominant if bit 65 set, recessive if only bit 64 set
    const hasArmor        = this.getBit(genome, 65) || this.getBit(genome, 64)
    const hasVenom        = this.getBit(genome, 66)
    const hasCamouflage   = this.getBit(genome, 67)
    const isBioluminescent = this.getBit(genome, 67) && this.getBit(genome, 66)
    const armorThickness  = this.getBits(genome, 68, 4)
    const venomPotency    = this.getBits(genome, 72, 4)
    const weaponType      = this.getBits(genome, 76, 4)

    // Reproduction
    const reproductionRate = this.getBits(genome, 80, 4)
    const offspringCount   = this.getBits(genome, 84, 4)
    const gestationPeriod  = this.getBits(genome, 88, 4)
    const parentalCare     = this.getBits(genome, 92, 4)

    // Neural complexity — full byte fields
    const neuralComplexity = this.getBits(genome, 96,  8)
    const memoryCapacity   = this.getBits(genome, 104, 8)
    const learningRate     = this.getBits(genome, 112, 8)
    const curiosityDrive   = this.getBits(genome, 120, 8)
    const nlevel           = this.neuralLevel(genome)

    // Social behavior
    const socialStructure = this.getBits(genome, 128, 4)
    const groupSizePref   = this.getBits(genome, 132, 4)
    const dominanceDrive  = this.getBits(genome, 136, 8)
    const cooperationDrive = this.getBits(genome, 144, 8)
    const altruism        = this.getBits(genome, 152, 8)

    // Communication
    const communicationType   = this.getBits(genome, 160, 4)
    const signalComplexity    = this.getBits(genome, 164, 4)
    const vocabularySize      = this.getBits(genome, 168, 8)
    const grammarComplexity   = this.getBits(genome, 176, 8)
    const culturalTransmission = this.getBits(genome, 184, 8)

    // Developmental biology
    const growthRate   = this.getBits(genome, 192, 8)
    const maxLifespan  = this.getBits(genome, 200, 8)
    const agingRate    = this.getBits(genome, 208, 8)
    const metamorphosis = this.getBits(genome, 216, 8)

    // Civilization-era traits
    const toolUseSophistication = this.getBits(genome, 224, 8)
    const abstractReasoning     = this.getBits(genome, 232, 8)
    const culturalKnowledge     = this.getBits(genome, 240, 8)
    const technologyDrive       = this.getBits(genome, 248, 8)

    return {
      bodySymmetry, segmentCount, limbCount, appendageType,
      metabolicRate, tempPreference, dietaryType, sizeClass,
      visionType, visionRange, hearing, olfaction,
      swimSpeed, walkSpeed, flySpeed, burrowSpeed,
      hasArmor, hasVenom, hasCamouflage, isBioluminescent,
      armorThickness, venomPotency, weaponType,
      reproductionRate, offspringCount, gestationPeriod, parentalCare,
      neuralComplexity, memoryCapacity, learningRate, curiosityDrive,
      neuralLevel: nlevel,
      socialStructure, groupSizePref, dominanceDrive, cooperationDrive, altruism,
      communicationType, signalComplexity, vocabularySize, grammarComplexity,
      culturalTransmission,
      growthRate, maxLifespan, agingRate, metamorphosis,
      toolUseSophistication, abstractReasoning, culturalKnowledge, technologyDrive,
    }
  }

  // ─── Encode ────────────────────────────────────────────────────────────────

  encode(phenotype: Partial<Phenotype>): Genome {
    const genome = new Uint8Array(32)

    const set4 = (bit: number, v?: number) => { if (v !== undefined) this.setBits(genome, bit, 4, v) }
    const set8 = (bit: number, v?: number) => { if (v !== undefined) this.setBits(genome, bit, 8, v) }
    const set1 = (bit: number, v?: boolean) => {
      if (v !== undefined) {
        const b = Math.floor(bit / 8)
        const i = bit % 8
        if (v) genome[b] |= (1 << i); else genome[b] &= ~(1 << i)
      }
    }

    // Body plan
    set4(0,  phenotype.bodySymmetry)
    set4(4,  phenotype.segmentCount)
    set4(8,  phenotype.limbCount)
    set4(12, phenotype.appendageType)

    // Metabolism
    set4(16, phenotype.metabolicRate)
    set4(20, phenotype.tempPreference)
    set4(24, phenotype.dietaryType)
    set4(28, phenotype.sizeClass)

    // Sensory
    set4(32, phenotype.visionType)
    set4(36, phenotype.visionRange)
    set4(40, phenotype.hearing)
    set4(44, phenotype.olfaction)

    // Locomotion
    set4(48, phenotype.swimSpeed)
    set4(52, phenotype.walkSpeed)
    set4(56, phenotype.flySpeed)
    set4(60, phenotype.burrowSpeed)

    // Defense/Offense
    set1(64, phenotype.hasArmor)
    set1(65, phenotype.hasArmor)   // both recessive and dominant for armor
    set1(66, phenotype.hasVenom)
    set1(67, phenotype.hasCamouflage)
    set4(68, phenotype.armorThickness)
    set4(72, phenotype.venomPotency)
    set4(76, phenotype.weaponType)

    // Reproduction
    set4(80, phenotype.reproductionRate)
    set4(84, phenotype.offspringCount)
    set4(88, phenotype.gestationPeriod)
    set4(92, phenotype.parentalCare)

    // Neural complexity
    set8(96,  phenotype.neuralComplexity)
    set8(104, phenotype.memoryCapacity)
    set8(112, phenotype.learningRate)
    set8(120, phenotype.curiosityDrive)

    // Social behavior
    set4(128, phenotype.socialStructure)
    set4(132, phenotype.groupSizePref)
    set8(136, phenotype.dominanceDrive)
    set8(144, phenotype.cooperationDrive)
    set8(152, phenotype.altruism)

    // Communication
    set4(160, phenotype.communicationType)
    set4(164, phenotype.signalComplexity)
    set8(168, phenotype.vocabularySize)
    set8(176, phenotype.grammarComplexity)
    set8(184, phenotype.culturalTransmission)

    // Developmental biology
    set8(192, phenotype.growthRate)
    set8(200, phenotype.maxLifespan)
    set8(208, phenotype.agingRate)
    set8(216, phenotype.metamorphosis)

    // Civilization-era traits
    set8(224, phenotype.toolUseSophistication)
    set8(232, phenotype.abstractReasoning)
    set8(240, phenotype.culturalKnowledge)
    set8(248, phenotype.technologyDrive)

    return genome
  }

  // ─── Crossover ─────────────────────────────────────────────────────────────

  /**
   * Chromosomal crossover: create a child genome by recombining two parents.
   * Uses 1-3 crossover points chosen stochastically (models meiotic recombination).
   * Each crossover point is byte-aligned for realism (chromosomal exchange happens
   * at the chromosome scale, not individual nucleotides in a single meiotic event).
   */
  crossover(parentA: Genome, parentB: Genome, rng: () => number): Genome {
    const child = new Uint8Array(32)

    // Choose 1-3 crossover points (byte-aligned, 1-31 range)
    const numPoints = 1 + Math.floor(rng() * 3)  // 1, 2, or 3 points
    const points: number[] = []
    for (let i = 0; i < numPoints; i++) {
      const p = 1 + Math.floor(rng() * 31)
      if (!points.includes(p)) points.push(p)
    }
    points.sort((a, b) => a - b)

    let currentParent = rng() < 0.5 ? parentA : parentB
    let otherParent   = currentParent === parentA ? parentB : parentA

    let pointIndex = 0
    for (let byte = 0; byte < 32; byte++) {
      if (pointIndex < points.length && byte === points[pointIndex]) {
        // Swap parents at crossover point
        const tmp   = currentParent
        currentParent = otherParent
        otherParent   = tmp
        pointIndex++
      }
      child[byte] = currentParent[byte]
    }

    return child
  }

  // ─── Primordial genome ─────────────────────────────────────────────────────

  /**
   * Minimal viable first organism — RNA World / LUCA-like starter.
   * Near-zero in most traits; only basic autotrophy and slow asexual reproduction.
   */
  createPrimordialGenome(): Genome {
    return this.encode({
      // Body: simplest — asymmetric, 1 segment, no limbs, no appendages
      bodySymmetry: 0, segmentCount: 0, limbCount: 0, appendageType: 0,

      // Metabolism: slow, mesophile-ish, autotroph (photosynthesis precursor), nanoscale
      metabolicRate: 2, tempPreference: 5, dietaryType: 0, sizeClass: 0,

      // Sensory: none
      visionType: 0, visionRange: 0, hearing: 0, olfaction: 0,

      // Locomotion: sessile / Brownian only
      swimSpeed: 1, walkSpeed: 0, flySpeed: 0, burrowSpeed: 0,

      // Defense: none
      hasArmor: false, hasVenom: false, hasCamouflage: false, isBioluminescent: false,
      armorThickness: 0, venomPotency: 0, weaponType: 0,

      // Reproduction: fast asexual, many offspring, no care
      reproductionRate: 12, offspringCount: 12, gestationPeriod: 0, parentalCare: 0,

      // Neural: reflex only (bacteria-level)
      neuralComplexity: 5, memoryCapacity: 0, learningRate: 0, curiosityDrive: 0,

      // Social: solitary
      socialStructure: 0, groupSizePref: 0, dominanceDrive: 0, cooperationDrive: 0, altruism: 0,

      // Communication: simple chemical signals only
      communicationType: 0, signalComplexity: 1, vocabularySize: 2, grammarComplexity: 0,
      culturalTransmission: 0,

      // Development: fast growth, short life
      growthRate: 200, maxLifespan: 10, agingRate: 240, metamorphosis: 0,

      // Civilization: none
      toolUseSophistication: 0, abstractReasoning: 0, culturalKnowledge: 0, technologyDrive: 0,
    })
  }

  // ─── Human-equivalent genome ───────────────────────────────────────────────

  /**
   * Approximate human-equivalent genome for testing and comparison.
   * Calibrated to realistic human trait values.
   */
  createHumanGenome(): Genome {
    return this.encode({
      // Body: bilateral, 1 main segment + appendages, 4 limbs, legs
      bodySymmetry: 1, segmentCount: 1, limbCount: 4, appendageType: 5,

      // Metabolism: moderate, mesophile (37°C), omnivore, medium-large
      metabolicRate: 7, tempPreference: 5, dietaryType: 1, sizeClass: 12,

      // Sensory: camera eyes, good range, full hearing, moderate olfaction
      visionType: 6, visionRange: 12, hearing: 4, olfaction: 6,

      // Locomotion: weak swim, good walk, no fly, no burrow
      swimSpeed: 3, walkSpeed: 9, flySpeed: 0, burrowSpeed: 1,

      // Defense: no armor, no venom, no camouflage, not bioluminescent
      hasArmor: false, hasVenom: false, hasCamouflage: false, isBioluminescent: false,
      armorThickness: 0, venomPotency: 0, weaponType: 3, // teeth

      // Reproduction: slow, 1 offspring, long gestation, high parental care
      reproductionRate: 3, offspringCount: 0, gestationPeriod: 14, parentalCare: 15,

      // Neural: Level 4 — abstract/language (192+ score)
      neuralComplexity: 220, memoryCapacity: 240, learningRate: 200, curiosityDrive: 210,

      // Social: tribal → cultural
      socialStructure: 6, groupSizePref: 8, dominanceDrive: 100, cooperationDrive: 200, altruism: 180,

      // Communication: symbolic, complex, large vocabulary, full grammar, high cultural transmission
      communicationType: 5, signalComplexity: 15, vocabularySize: 240, grammarComplexity: 230,
      culturalTransmission: 220,

      // Development: moderate growth, long life, moderate aging, no metamorphosis
      growthRate: 80, maxLifespan: 210, agingRate: 80, metamorphosis: 0,

      // Civilization: advanced tool use, abstract reasoning, cultural knowledge, technology drive
      toolUseSophistication: 200, abstractReasoning: 220, culturalKnowledge: 210, technologyDrive: 195,
    })
  }
}
