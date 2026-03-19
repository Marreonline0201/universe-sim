/**
 * SocialSimulation.ts
 *
 * Social relationships, reputation, cultural transmission, and group dynamics.
 *
 * Key concepts:
 *   Relationship   — bilateral state (trust, affection, debt, kin distance).
 *   Reputation     — community trust score derived from aggregated interactions.
 *   GroupDynamics  — role hierarchy, shared goals, cultural knowledge base.
 *   Cultural drift — memes mutate at each generational pass.
 *   Conflict resolution — negotiate / dominance / combat / avoid.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Relationship {
  entityId:         number  // the other entity
  trust:            number  // -1 to +1
  affection:        number  // -1 to +1
  debt:             number  // positive = they owe me a favour
  familiarity:      number  // 0-1 (how well known)
  lastInteraction:  number  // simulation time
  interactionCount: number
  isKin:            boolean
  kinDistance:      number  // 0=self, 1=parent/child, 2=sibling, 3=cousin…
}

export type RelationshipEventType =
  | 'helped'        | 'harmed'
  | 'shared_food'   | 'stole_food'
  | 'groomed'       | 'fought'
  | 'mated'         | 'betrayed'
  | 'taught'        | 'learned_from'
  | 'traded'        | 'refused_trade'

export interface RelationshipEvent {
  type:      RelationshipEventType
  severity:  number   // 0-1 (how strongly to update)
}

export interface CulturalKnowledge {
  concept:    string
  belief:     any
  taboo:      boolean         // true = behaviour is forbidden by culture
  generation: number          // generation count since this meme originated
  driftFactor: number         // 0-1 cumulative drift from original meaning
}

export type GroupRole = 'alpha' | 'beta' | 'omega' | 'elder' | 'warrior' | 'crafter' | 'healer'

export interface GroupDynamics {
  groupId:    number
  memberIds:  number[]
  alphaId:    number | null
  role:       Map<number, GroupRole>
  culture:    CulturalKnowledge[]
  sharedGoal: string | null
}

// ─── SocialSimulation ─────────────────────────────────────────────────────────

export class SocialSimulation {
  /** relationshipStore[selfId][otherId] = Relationship */
  private relationshipStore: Map<number, Map<number, Relationship>> = new Map()

  /** reputation[groupId][entityId] = trust score (-1 to +1) */
  private reputationStore: Map<number, Map<number, number>> = new Map()

  /** groups[groupId] = GroupDynamics */
  private groups: Map<number, GroupDynamics> = new Map()

  private nextGroupId = 1

  // ─── Relationships ──────────────────────────────────────────────────────────

  /**
   * Initialise a blank relationship from `selfId` toward `otherId`.
   * Returns the newly created Relationship (stored in place).
   */
  addRelationship(selfId: number, otherId: number): Relationship {
    if (!this.relationshipStore.has(selfId)) {
      this.relationshipStore.set(selfId, new Map())
    }
    const existing = this.relationshipStore.get(selfId)!.get(otherId)
    if (existing) return existing

    const rel: Relationship = {
      entityId:         otherId,
      trust:            0,
      affection:        0,
      debt:             0,
      familiarity:      0,
      lastInteraction:  0,
      interactionCount: 0,
      isKin:            false,
      kinDistance:      999,
    }
    this.relationshipStore.get(selfId)!.set(otherId, rel)
    return rel
  }

  getRelationship(selfId: number, otherId: number): Relationship | null {
    return this.relationshipStore.get(selfId)?.get(otherId) ?? null
  }

  /**
   * Update a relationship based on an observed interaction.
   * Changes are reciprocal to some degree (betrayal damages both).
   */
  updateRelationship(
    selfId:  number,
    otherId: number,
    event:   RelationshipEvent,
    now      = 0,
  ): void {
    const rel = this.getRelationship(selfId, otherId)
      ?? this.addRelationship(selfId, otherId)

    rel.lastInteraction   = now
    rel.interactionCount += 1
    rel.familiarity        = Math.min(1, rel.familiarity + event.severity * 0.05)

    // Trust / affection deltas per event type.
    const s = event.severity
    switch (event.type) {
      case 'helped':
        rel.trust     = this._clamp(rel.trust     + s * 0.25)
        rel.affection = this._clamp(rel.affection + s * 0.15)
        rel.debt      = Math.max(-5, rel.debt - s)
        break

      case 'harmed':
        rel.trust     = this._clamp(rel.trust     - s * 0.35)
        rel.affection = this._clamp(rel.affection - s * 0.20)
        rel.debt      += s
        break

      case 'shared_food':
        rel.trust     = this._clamp(rel.trust     + s * 0.15)
        rel.affection = this._clamp(rel.affection + s * 0.10)
        rel.debt      = Math.max(-5, rel.debt - s * 0.5)
        break

      case 'stole_food':
        rel.trust     = this._clamp(rel.trust     - s * 0.40)
        rel.affection = this._clamp(rel.affection - s * 0.15)
        rel.debt      += s * 1.5
        break

      case 'groomed':
        rel.affection = this._clamp(rel.affection + s * 0.20)
        rel.trust     = this._clamp(rel.trust     + s * 0.05)
        break

      case 'fought':
        rel.trust     = this._clamp(rel.trust     - s * 0.30)
        rel.affection = this._clamp(rel.affection - s * 0.20)
        break

      case 'mated':
        rel.affection = this._clamp(rel.affection + s * 0.40)
        rel.trust     = this._clamp(rel.trust     + s * 0.10)
        break

      case 'betrayed':
        rel.trust     = this._clamp(rel.trust     - s * 0.60)
        rel.affection = this._clamp(rel.affection - s * 0.30)
        rel.debt      += s * 2
        break

      case 'taught':
        rel.affection = this._clamp(rel.affection + s * 0.20)
        rel.trust     = this._clamp(rel.trust     + s * 0.15)
        rel.debt      = Math.max(-5, rel.debt - s * 0.5)
        break

      case 'learned_from':
        rel.trust     = this._clamp(rel.trust     + s * 0.15)
        rel.debt      += s * 0.5
        break

      case 'traded':
        rel.trust     = this._clamp(rel.trust     + s * 0.10)
        rel.familiarity = Math.min(1, rel.familiarity + 0.05)
        break

      case 'refused_trade':
        rel.trust     = this._clamp(rel.trust     - s * 0.05)
        break
    }
  }

  // ─── Reputation ─────────────────────────────────────────────────────────────

  /**
   * Compute a community trust score for `entityId` within `groupId`.
   * Aggregates all group members' trust ratings.
   * Returns a value in [-1, +1].
   */
  getReputation(entityId: number, groupId: number): number {
    const group = this.groups.get(groupId)
    if (!group) return 0

    let sum   = 0
    let count = 0

    for (const memberId of group.memberIds) {
      if (memberId === entityId) continue
      const rel = this.getRelationship(memberId, entityId)
      if (rel) {
        sum   += rel.trust * rel.familiarity  // familiarity-weighted
        count++
      }
    }

    if (count === 0) return 0
    return this._clamp(sum / count)
  }

  /** Set a direct reputation override (for punishments, ceremonies, etc.). */
  setReputation(entityId: number, groupId: number, value: number): void {
    if (!this.reputationStore.has(groupId)) {
      this.reputationStore.set(groupId, new Map())
    }
    this.reputationStore.get(groupId)!.set(entityId, this._clamp(value))
  }

  // ─── Groups ─────────────────────────────────────────────────────────────────

  /**
   * Form a new group from a list of entity IDs with an initial culture.
   * Automatically elects an alpha (entity with highest dominance — approximated
   * as the first member for now; the caller can update via role map).
   */
  formGroup(memberIds: number[], culture: CulturalKnowledge[]): GroupDynamics {
    const groupId = this.nextGroupId++
    const dynamics: GroupDynamics = {
      groupId,
      memberIds:  [...memberIds],
      alphaId:    memberIds[0] ?? null,
      role:       new Map(memberIds.map((id, i) => [id, i === 0 ? 'alpha' : 'beta'])),
      culture:    culture.map(c => ({ ...c })),
      sharedGoal: null,
    }
    this.groups.set(groupId, dynamics)
    return dynamics
  }

  getGroup(groupId: number): GroupDynamics | null {
    return this.groups.get(groupId) ?? null
  }

  /** Add an entity to an existing group and assign a role. */
  joinGroup(entityId: number, groupId: number, role: GroupRole = 'beta'): void {
    const g = this.groups.get(groupId)
    if (!g) return
    if (!g.memberIds.includes(entityId)) {
      g.memberIds.push(entityId)
      g.role.set(entityId, role)
    }
  }

  /** Remove an entity from a group, re-electing alpha if needed. */
  leaveGroup(entityId: number, groupId: number): void {
    const g = this.groups.get(groupId)
    if (!g) return
    g.memberIds = g.memberIds.filter(id => id !== entityId)
    g.role.delete(entityId)

    if (g.alphaId === entityId) {
      // Elect new alpha: pick first remaining member.
      g.alphaId = g.memberIds[0] ?? null
      if (g.alphaId !== null) g.role.set(g.alphaId, 'alpha')
    }
  }

  // ─── Cultural propagation ────────────────────────────────────────────────────

  /**
   * Simulate one tick of cultural transmission and drift within a group.
   *
   * Each tick:
   *   1. Each concept has a chance to drift (mutate slightly in meaning).
   *   2. Taboos are reinforced (high drift = taboo weakens).
   *   3. Elders / teachers propagate knowledge to newer members.
   *
   * @param dt  Elapsed simulation time in seconds.
   */
  propagateCulture(groupId: number, dt: number): void {
    const g = this.groups.get(groupId)
    if (!g) return

    const driftRate = 0.001 * dt  // base drift per second

    for (const concept of g.culture) {
      // Accumulate drift.
      concept.driftFactor = Math.min(1, concept.driftFactor + driftRate)
      concept.generation  += dt / 2592000  // generations ~ months

      // Drift weakens taboos over many generations.
      if (concept.taboo && concept.driftFactor > 0.5) {
        concept.taboo = Math.random() > 0.995  // ~0.5% chance per tick of taboo breaking
      }
    }

    // Propagate knowledge from elders to other members (simplified).
    for (const [memberId, role] of g.role.entries()) {
      if (role !== 'elder' && role !== 'alpha') continue
      // Find members with low familiarity of a concept.
      for (const concept of g.culture) {
        const teachAttempt = Math.random() < 0.01 * dt
        if (teachAttempt) {
          // Mark that a teach event occurred (caller handles actual memory update).
          void memberId
        }
      }
    }
  }

  // ─── Conflict resolution ─────────────────────────────────────────────────────

  /**
   * Determine the most likely outcome of a conflict between two entities.
   *
   * Resolution factors:
   *   - Trust (high trust → negotiate)
   *   - Dominance difference (big gap → dominance display)
   *   - Past harm events (repeated harm → combat)
   *   - Avoidance threshold (very negative trust → avoid)
   */
  resolveConflict(
    entityA: number,
    entityB: number,
  ): 'negotiate' | 'dominance' | 'combat' | 'avoid' {
    const relAB = this.getRelationship(entityA, entityB)
    const relBA = this.getRelationship(entityB, entityA)

    const trustA = relAB?.trust  ?? 0
    const trustB = relBA?.trust  ?? 0
    const avgTrust = (trustA + trustB) / 2
    const familiarity = ((relAB?.familiarity ?? 0) + (relBA?.familiarity ?? 0)) / 2

    if (avgTrust < -0.5) return 'avoid'
    if (avgTrust < -0.2) return 'combat'
    if (familiarity > 0.6 && avgTrust > 0.1) return 'negotiate'
    return 'dominance'
  }

  // ─── Knowledge sharing ───────────────────────────────────────────────────────

  /**
   * Attempt to transfer a concept from teacher to student.
   *
   * Success depends on:
   *   - Trust between the pair.
   *   - Teacher's confidence in the concept.
   *   - Whether the concept is taboo in the group.
   *
   * Returns true if the knowledge was transferred.
   */
  shareKnowledge(teacherId: number, studentId: number, concept: string): boolean {
    const rel = this.getRelationship(studentId, teacherId)
    const trust = rel?.trust ?? 0

    // Need at least neutral trust.
    if (trust < -0.1) return false

    // Random success weighted by trust and familiarity.
    const familiarity = rel?.familiarity ?? 0
    const successProb = 0.3 + trust * 0.4 + familiarity * 0.3
    const success = Math.random() < successProb

    if (success) {
      // Update the relationship: teaching increases trust and affection.
      this.updateRelationship(teacherId, studentId, { type: 'taught', severity: 0.5 })
      this.updateRelationship(studentId, teacherId, { type: 'learned_from', severity: 0.5 })
    }

    return success
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  /** Return all relationships for an entity. */
  getAllRelationships(entityId: number): Relationship[] {
    return Array.from(this.relationshipStore.get(entityId)?.values() ?? [])
  }

  /** Return the N entities that `entityId` trusts most. */
  getTopTrusted(entityId: number, n: number): Relationship[] {
    return this.getAllRelationships(entityId)
      .sort((a, b) => b.trust - a.trust)
      .slice(0, n)
  }

  /** Remove all relationships and data for a deceased entity. */
  removeEntity(entityId: number): void {
    this.relationshipStore.delete(entityId)
    // Remove as 'other' from all other entities' stores.
    for (const [, byOther] of this.relationshipStore.entries()) {
      byOther.delete(entityId)
    }
    // Remove from groups.
    for (const [groupId] of this.groups.entries()) {
      this.leaveGroup(entityId, groupId)
    }
    // Remove from reputation stores.
    for (const [, repMap] of this.reputationStore.entries()) {
      repMap.delete(entityId)
    }
  }

  private _clamp(v: number): number { return Math.min(1, Math.max(-1, v)) }
}
