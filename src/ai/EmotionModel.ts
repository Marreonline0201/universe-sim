/**
 * EmotionModel.ts
 *
 * OCC (Ortony-Clore-Collins) emotion model.
 *
 * Emotions arise from the *appraisal* of events relative to the creature's
 * goals and standards.  They are NOT decorative: they directly modulate GOAP
 * goal priorities and behaviour tree weights every tick.
 *
 * Reference: Ortony, A., Clore, G. L., & Collins, A. (1988).
 *            The Cognitive Structure of Emotions. Cambridge University Press.
 */

// ─── Emotion state ─────────────────────────────────────────────────────────────

export interface EmotionState {
  // ── Valenced emotions ───────────────────────────────────────────────────────
  /** Happiness / pleasure from goal achievement. */
  joy:             number  // 0-1
  /** Unhappiness from goal failure or pain. */
  distress:        number  // 0-1
  /** Positive anticipation toward a future goal. */
  hope:            number  // 0-1
  /** Negative anticipation of harm. */
  fear:            number  // 0-1
  /** Joy from a confirmed hope. */
  satisfaction:    number  // 0-1
  /** Distress from a disconfirmed hope. */
  disappointment:  number  // 0-1
  /** Pride: positive self-evaluation after a successful action. */
  pride:           number  // 0-1
  /** Shame: negative self-evaluation after a failed action. */
  shame:           number  // 0-1

  // ── Social emotions ─────────────────────────────────────────────────────────
  /** Attachment bond to a specific individual. */
  love:       number  // 0-1
  /** Aversion / hostility toward a specific individual. */
  hate:       number  // 0-1
  /** Positive regard for someone who helped. */
  gratitude:  number  // 0-1
  /** Hostility toward someone who harmed. */
  anger:      number  // 0-1

  // ── Exploratory ─────────────────────────────────────────────────────────────
  curiosity:  number  // 0-1
  boredom:    number  // 0-1

  // ── Survival-linked ─────────────────────────────────────────────────────────
  /** Revulsion from contaminated food / water. */
  disgust:    number  // 0-1
  /** Brief response to novel stimuli. */
  surprise:   number  // 0-1

  // ── Derived summary fields ───────────────────────────────────────────────────
  dominantEmotion: string  // name of the highest-valued emotion
  /** Overall hedonic tone: -1 (very negative) to +1 (very positive). */
  valence:         number
  /** Activation / arousal level: 0 (calm) to 1 (highly aroused). */
  arousal:         number
}

// ─── Appraisal event ──────────────────────────────────────────────────────────

export interface AppraisalEvent {
  type:
    | 'goal_achieved'    | 'goal_failed'
    | 'threat_detected'  | 'threat_gone'
    | 'bonded_with'      | 'lost_bonded'
    | 'novel_stimulus'   | 'familiar_boring'
    | 'praised'          | 'criticized'
    | 'succeeded'        | 'failed'
    | 'helped_by'        | 'harmed_by'
    | 'food_found'       | 'food_lost'
    | 'offspring_born'   | 'offspring_died'
  intensity:        number     // 0-1
  targetEntityId?:  number
}

// ─── Real emotion half-lives (seconds of simulation time) ────────────────────

const HALF_LIVES: Partial<Record<keyof EmotionState, number>> = {
  surprise:      2,     // very transient
  fear:          8,     // decays fast once threat gone
  anger:         20,    // moderate persistence
  joy:           15,
  distress:      30,
  hope:          60,
  disappointment: 40,
  satisfaction:  30,
  pride:         45,
  shame:         60,
  love:          3600,  // very persistent (hours)
  hate:          7200,
  gratitude:     1800,
  curiosity:     20,
  boredom:       120,
  disgust:       10,
}

// ─── EmotionModel ─────────────────────────────────────────────────────────────

export class EmotionModel {
  private state: EmotionState

  constructor() {
    this.state = this._neutral()
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Update emotions based on appraised events this tick.
   * Each event type maps to specific OCC emotion categories.
   */
  appraise(events: AppraisalEvent[]): void {
    for (const e of events) {
      const i = Math.min(1, Math.max(0, e.intensity))
      this._appraiseSingle(e.type, i)
    }
    this._recalcDerived()
  }

  /**
   * Exponential decay toward neutral.
   * Each emotion has its own biologically-motivated half-life.
   * @param dt  Elapsed simulation time in seconds.
   */
  decay(dt: number): void {
    const keys: Array<keyof Omit<EmotionState, 'dominantEmotion' | 'valence' | 'arousal'>> = [
      'joy', 'distress', 'hope', 'fear', 'satisfaction', 'disappointment',
      'pride', 'shame', 'love', 'hate', 'gratitude', 'anger',
      'curiosity', 'boredom', 'disgust', 'surprise',
    ]

    for (const k of keys) {
      const halfLife = HALF_LIVES[k] ?? 30
      // Exponential decay: value * (0.5)^(dt / halfLife)
      const decay = Math.pow(0.5, dt / halfLife)
      ;(this.state as any)[k] = (this.state as any)[k] * decay
    }

    this._recalcDerived()
  }

  getState(): EmotionState {
    return { ...this.state }
  }

  /**
   * Return priority multipliers for GOAP goals based on current emotional state.
   * Multipliers > 1 amplify a goal's urgency; < 1 suppress it.
   */
  getGoalModifiers(): Record<string, number> {
    const s = this.state
    return {
      survive:     1 + s.fear * 3,
      eat:         1 + s.distress * 1.5 + (1 - s.joy) * 0.5,
      rest:        1 + (1 - s.arousal) * 0.5,
      reproduce:   1 + s.love * 2,
      explore:     1 + s.curiosity * 1.5 - s.boredom * 0.3,
      socialise:   1 + s.love * 1.2 + s.gratitude * 0.8 - s.hate * 0.5,
      buildShelter: 1 + s.fear * 1.2 + s.distress * 0.5,
      fight:       1 + s.anger * 2 - s.fear * 0.8,
      teach:       1 + s.pride * 1.5 + s.love * 0.5,
      mourn:       1 + s.distress * 2,
    }
  }

  /**
   * Produce a human-readable emotion summary for LLM prompts.
   */
  toPromptString(): string {
    const s = this.state
    const parts: string[] = []

    if (s.fear > 0.3)          parts.push(`fearful (${(s.fear * 100).toFixed(0)}%)`)
    if (s.anger > 0.3)         parts.push(`angry (${(s.anger * 100).toFixed(0)}%)`)
    if (s.joy > 0.3)           parts.push(`joyful (${(s.joy * 100).toFixed(0)}%)`)
    if (s.distress > 0.3)      parts.push(`distressed (${(s.distress * 100).toFixed(0)}%)`)
    if (s.love > 0.3)          parts.push(`loving (${(s.love * 100).toFixed(0)}%)`)
    if (s.curiosity > 0.3)     parts.push(`curious (${(s.curiosity * 100).toFixed(0)}%)`)
    if (s.disgust > 0.3)       parts.push(`disgusted (${(s.disgust * 100).toFixed(0)}%)`)
    if (s.pride > 0.3)         parts.push(`proud (${(s.pride * 100).toFixed(0)}%)`)
    if (s.shame > 0.3)         parts.push(`ashamed (${(s.shame * 100).toFixed(0)}%)`)
    if (s.hope > 0.3)          parts.push(`hopeful (${(s.hope * 100).toFixed(0)}%)`)
    if (s.disappointment > 0.3) parts.push(`disappointed (${(s.disappointment * 100).toFixed(0)}%)`)
    if (s.gratitude > 0.3)     parts.push(`grateful (${(s.gratitude * 100).toFixed(0)}%)`)
    if (s.surprise > 0.3)      parts.push(`surprised (${(s.surprise * 100).toFixed(0)}%)`)

    if (parts.length === 0) return 'emotionally neutral'
    return `Dominant emotion: ${s.dominantEmotion}. Feeling: ${parts.join(', ')}.`
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _appraiseSingle(
    type: AppraisalEvent['type'],
    intensity: number,
  ): void {
    const s = this.state
    switch (type) {
      case 'goal_achieved':
        s.joy          = this._add(s.joy, intensity)
        s.satisfaction = this._add(s.satisfaction, intensity)
        s.hope         = this._add(s.hope, intensity * 0.5)
        s.pride        = this._add(s.pride, intensity * 0.4)
        break

      case 'goal_failed':
        s.distress      = this._add(s.distress, intensity)
        s.disappointment = this._add(s.disappointment, intensity * 0.8)
        s.shame          = this._add(s.shame, intensity * 0.3)
        break

      case 'threat_detected':
        s.fear    = this._add(s.fear, intensity)
        s.distress = this._add(s.distress, intensity * 0.5)
        s.surprise = this._add(s.surprise, intensity * 0.4)
        break

      case 'threat_gone':
        s.fear    = Math.max(0, s.fear - intensity * 0.6)
        s.joy     = this._add(s.joy, intensity * 0.3)
        break

      case 'bonded_with':
        s.love     = this._add(s.love, intensity)
        s.joy      = this._add(s.joy, intensity * 0.6)
        s.gratitude = this._add(s.gratitude, intensity * 0.4)
        break

      case 'lost_bonded':
        s.distress = this._add(s.distress, intensity)
        s.love     = this._add(s.love, intensity * 0.3) // grief keeps love alive
        s.hope     = Math.max(0, s.hope - intensity * 0.4)
        break

      case 'novel_stimulus':
        s.curiosity = this._add(s.curiosity, intensity)
        s.surprise  = this._add(s.surprise, intensity * 0.5)
        s.boredom   = Math.max(0, s.boredom - intensity * 0.8)
        break

      case 'familiar_boring':
        s.boredom   = this._add(s.boredom, intensity)
        s.curiosity = Math.max(0, s.curiosity - intensity * 0.3)
        break

      case 'praised':
        s.pride = this._add(s.pride, intensity)
        s.joy   = this._add(s.joy, intensity * 0.5)
        break

      case 'criticized':
        s.shame    = this._add(s.shame, intensity)
        s.anger    = this._add(s.anger, intensity * 0.5)
        s.distress = this._add(s.distress, intensity * 0.3)
        break

      case 'succeeded':
        s.joy          = this._add(s.joy, intensity * 0.6)
        s.satisfaction = this._add(s.satisfaction, intensity * 0.6)
        s.pride        = this._add(s.pride, intensity * 0.5)
        break

      case 'failed':
        s.distress      = this._add(s.distress, intensity * 0.5)
        s.disappointment = this._add(s.disappointment, intensity * 0.5)
        break

      case 'helped_by':
        s.gratitude = this._add(s.gratitude, intensity)
        s.joy       = this._add(s.joy, intensity * 0.4)
        break

      case 'harmed_by':
        s.anger    = this._add(s.anger, intensity)
        s.hate     = this._add(s.hate, intensity * 0.5)
        s.distress = this._add(s.distress, intensity * 0.4)
        break

      case 'food_found':
        s.joy       = this._add(s.joy, intensity * 0.4)
        s.hope      = this._add(s.hope, intensity * 0.3)
        s.curiosity = this._add(s.curiosity, intensity * 0.2)
        break

      case 'food_lost':
        s.distress = this._add(s.distress, intensity * 0.5)
        s.anger    = this._add(s.anger, intensity * 0.3)
        break

      case 'offspring_born':
        s.joy  = this._add(s.joy, intensity)
        s.love = this._add(s.love, intensity)
        break

      case 'offspring_died':
        s.distress = this._add(s.distress, 1.0) // maximum grief
        s.love     = this._add(s.love, 0.3)     // love persists through grief
        break
    }
  }

  /** Clamp-add: result stays in [0, 1]. */
  private _add(current: number, delta: number): number {
    return Math.min(1, Math.max(0, current + delta))
  }

  /** Recalculate derived fields (dominantEmotion, valence, arousal). */
  private _recalcDerived(): void {
    const s = this.state

    // Dominant emotion = highest-intensity primary emotion.
    const candidates: Array<[string, number]> = [
      ['joy',           s.joy],
      ['distress',      s.distress],
      ['fear',          s.fear],
      ['anger',         s.anger],
      ['love',          s.love],
      ['curiosity',     s.curiosity],
      ['disgust',       s.disgust],
      ['surprise',      s.surprise],
      ['pride',         s.pride],
      ['shame',         s.shame],
      ['hope',          s.hope],
      ['disappointment', s.disappointment],
      ['gratitude',     s.gratitude],
      ['hate',          s.hate],
      ['boredom',       s.boredom],
      ['satisfaction',  s.satisfaction],
    ]
    candidates.sort((a, b) => b[1] - a[1])
    s.dominantEmotion = candidates[0][1] > 0.05 ? candidates[0][0] : 'neutral'

    // Valence: positive emotions push toward +1, negative toward -1.
    const positive = s.joy + s.satisfaction + s.hope + s.pride + s.love + s.gratitude
    const negative = s.distress + s.disappointment + s.fear + s.shame + s.anger + s.hate + s.disgust
    s.valence = Math.max(-1, Math.min(1, (positive - negative) / 3.5))

    // Arousal: high emotions (fear, anger, surprise, joy) → high arousal.
    s.arousal = Math.min(1, (s.fear + s.anger + s.surprise + s.joy + s.disgust) / 2.5)
  }

  private _neutral(): EmotionState {
    return {
      joy: 0, distress: 0, hope: 0, fear: 0,
      satisfaction: 0, disappointment: 0, pride: 0, shame: 0,
      love: 0, hate: 0, gratitude: 0, anger: 0,
      curiosity: 0.1, boredom: 0,
      disgust: 0, surprise: 0,
      dominantEmotion: 'neutral',
      valence: 0,
      arousal: 0,
    }
  }
}
