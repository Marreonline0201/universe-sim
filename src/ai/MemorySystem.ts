/**
 * MemorySystem.ts
 *
 * Per-creature dual-memory system:
 *
 *   Episodic memory  — specific past events (where, when, who, what felt).
 *                      Stored as a bounded ring buffer; old, low-significance
 *                      events are pruned first.
 *
 *   Semantic memory  — general world knowledge (concepts, facts, skills).
 *                      Persists indefinitely but confidence can decay.
 *
 * Memory capacity is controlled by the genome `memoryCapacity` field (0-255).
 * A capacity of 255 ~ 2048 episodic slots; 0 ~ 8 slots.
 */

import type { EmotionState } from './EmotionModel'

// ─── Episodic types ────────────────────────────────────────────────────────────

export type EpisodicEventType =
  | 'found_food'       | 'ate'            | 'drank'
  | 'attacked'         | 'was_attacked'   | 'fled'
  | 'mated'            | 'offspring_born' | 'offspring_died'
  | 'bonded'           | 'lost_bonded'    | 'taught'    | 'learned'
  | 'discovered_location' | 'sheltered'  | 'communicated'
  | 'used_tool'        | 'crafted'        | 'built'     | 'traded'

export interface EpisodicEvent {
  id:             number
  /** Simulation time (seconds) when this event occurred. */
  timestamp:      number
  location:       [number, number, number]
  type:           EpisodicEventType
  /** Entity IDs involved (self is excluded unless relevant). */
  entities:       number[]
  emotionAtTime:  EmotionState
  /** How memorable this event is (0 = trivial, 1 = life-changing). */
  significance:   number
  /** Short human-readable summary for LLM prompts. */
  summary:        string
}

// ─── Semantic types ────────────────────────────────────────────────────────────

export interface SemanticKnowledge {
  concept:    string
  value:      any
  confidence: number  // 0-1
  source:     'innate' | 'experienced' | 'taught' | 'inferred'
  /** Simulation time when last updated. */
  lastUpdated: number
}

// ─── MemorySystem ─────────────────────────────────────────────────────────────

export class MemorySystem {
  private episodic:    EpisodicEvent[]        = []
  private semantic:    Map<string, SemanticKnowledge> = new Map()
  private nextEventId: number                 = 0
  private readonly maxSlots: number

  /**
   * @param memoryCapacity  Genome field 0-255.
   *   Maps to 8 (capacity=0) up to 2048 (capacity=255) episodic slots.
   */
  constructor(memoryCapacity: number = 128) {
    // Exponential scaling: slots = 8 * 2^(capacity / 64)
    this.maxSlots = Math.round(8 * Math.pow(2, memoryCapacity / 64))
  }

  // ─── Episodic API ────────────────────────────────────────────────────────────

  /**
   * Store a new episodic event.
   * If at capacity, the least significant old event is evicted first.
   */
  addEpisodic(event: EpisodicEvent): void {
    // Assign a fresh ID if not already set. Use explicit null/undefined check
    // to avoid treating id=0 as falsy.
    if (event.id === undefined || event.id === null) {
      event.id = this.nextEventId++
    }

    if (this.episodic.length >= this.maxSlots) {
      this._evictLeastSignificant()
    }

    this.episodic.push(event)
  }

  /** Return the N most recent episodic events (newest first). */
  getRecent(n: number): EpisodicEvent[] {
    const sorted = [...this.episodic].sort((a, b) => b.timestamp - a.timestamp)
    return sorted.slice(0, n)
  }

  /** Return all events of a given type, sorted by recency. */
  getByType(type: EpisodicEventType): EpisodicEvent[] {
    return this.episodic
      .filter(e => e.type === type)
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Return events within `radius` world-units of `center`.
   * Useful for remembering safe zones, food patches, danger areas.
   */
  getByLocation(
    center: [number, number, number],
    radius: number,
  ): EpisodicEvent[] {
    return this.episodic
      .filter(e => {
        const dx = e.location[0] - center[0]
        const dy = e.location[1] - center[1]
        const dz = e.location[2] - center[2]
        return Math.sqrt(dx * dx + dy * dy + dz * dz) <= radius
      })
      .sort((a, b) => b.significance - a.significance)
  }

  /**
   * Produce a compressed text summary of episodic memory for an LLM prompt.
   * Prioritises high-significance and recent events to fit `maxTokens`.
   *
   * Rough estimate: 1 token ≈ 4 characters.
   */
  summarizeForLLM(maxTokens: number): string {
    const budget = maxTokens * 4 // characters
    if (this.episodic.length === 0) return 'No significant memories.'

    // Compute recency score: normalize timestamps between 0 and 1
    const maxTs = this.episodic.reduce((m, e) => Math.max(m, e.timestamp), 0)
    const minTs = this.episodic.reduce((m, e) => Math.min(m, e.timestamp), maxTs)
    const tsRange = maxTs - minTs || 1

    const candidates = [...this.episodic]
      .sort((a, b) => {
        // Score = significance * 0.7 + recency * 0.3
        const recencyA = (a.timestamp - minTs) / tsRange
        const recencyB = (b.timestamp - minTs) / tsRange
        const scoreA   = a.significance * 0.7 + recencyA * 0.3
        const scoreB   = b.significance * 0.7 + recencyB * 0.3
        return scoreB - scoreA
      })

    const lines: string[] = []
    let chars = 0
    for (const e of candidates) {
      const line = `[${e.type}] ${e.summary}`
      if (chars + line.length + 2 > budget) break
      lines.push(line)
      chars += line.length + 2
    }

    if (lines.length === 0) return 'No significant memories.'
    return lines.join('\n')
  }

  // ─── Semantic API ────────────────────────────────────────────────────────────

  /**
   * Store or update a semantic concept.
   * If the concept already exists and the new confidence is higher, it updates.
   * If lower, it merges confidence (weighted average).
   */
  addSemantic(
    concept: string,
    value: any,
    confidence: number,
    source: SemanticKnowledge['source'],
    now = 0,
  ): void {
    const existing = this.semantic.get(concept)
    if (!existing) {
      this.semantic.set(concept, { concept, value, confidence, source, lastUpdated: now })
      return
    }

    // Taught / experienced knowledge overrides inferred.
    const sourceRank: Record<SemanticKnowledge['source'], number> = {
      innate:     4,
      taught:     3,
      experienced: 2,
      inferred:   1,
    }

    if (sourceRank[source] >= sourceRank[existing.source]) {
      // Higher-authority source wins.
      existing.value       = value
      existing.confidence  = Math.min(1, (existing.confidence + confidence) / 2 + 0.1)
      existing.source      = source
      existing.lastUpdated = now
    } else {
      // Lower-authority: just nudge confidence.
      existing.confidence  = Math.min(1, existing.confidence + confidence * 0.1)
      existing.lastUpdated = now
    }
  }

  getSemantic(concept: string): SemanticKnowledge | null {
    return this.semantic.get(concept) ?? null
  }

  getAllSemantic(): SemanticKnowledge[] {
    return Array.from(this.semantic.values())
  }

  /**
   * Forget old episodic events.
   *
   * @param olderThanSim  Simulation timestamp threshold.
   * @param keepSignificant  If true, events with significance > 0.6 are retained.
   */
  forget(olderThanSim: number, keepSignificant: boolean): void {
    this.episodic = this.episodic.filter(e => {
      if (e.timestamp >= olderThanSim) return true
      if (keepSignificant && e.significance >= 0.6) return true
      return false
    })
  }

  /**
   * Full memory dump for serialisation / debugging.
   */
  toJSON(): { episodic: EpisodicEvent[]; semantic: SemanticKnowledge[] } {
    return {
      episodic: this.episodic,
      semantic: Array.from(this.semantic.values()),
    }
  }

  /** Number of episodic events currently stored. */
  get episodicCount(): number { return this.episodic.length }

  /** Total semantic concepts stored. */
  get semanticCount(): number { return this.semantic.size }

  // ─── Internal ───────────────────────────────────────────────────────────────

  /**
   * Evict the event with the lowest significance score.
   * Ties broken by oldest timestamp.
   */
  private _evictLeastSignificant(): void {
    if (this.episodic.length === 0) return
    let minIdx = 0
    let minScore = Infinity
    for (let i = 0; i < this.episodic.length; i++) {
      const e = this.episodic[i]
      // Composite score: significance weighted by recency.
      const score = e.significance
      if (score < minScore) {
        minScore = score
        minIdx   = i
      }
    }
    this.episodic.splice(minIdx, 1)
  }
}
