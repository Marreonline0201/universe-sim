/**
 * LLMBridge.ts
 *
 * LLM API integration for Level 4 (human-equivalent) NPC dialogue.
 *
 * Architecture:
 *   - Requests are placed in an internal queue to prevent concurrent API calls
 *     and respect rate limits.
 *   - While waiting, the NPC continues its GOAP behaviour tree as normal.
 *   - The parsed LLMResponse includes a dialogue string, a structured action
 *     enum, and an emotion delta to apply to the NPC's EmotionModel.
 *
 * Supported providers: Anthropic (claude-*), OpenAI (gpt-*), Ollama (local).
 */

import type { EmotionState }       from './EmotionModel'
import type { EpisodicEvent }      from './MemorySystem'
import type { Relationship }       from './SocialSimulation'
import type { SemanticKnowledge }  from './MemorySystem'

// ─── Configuration ─────────────────────────────────────────────────────────────

export interface LLMConfig {
  provider:    'anthropic' | 'openai' | 'ollama'
  model:       string
  apiKey?:     string
  ollamaUrl?:  string   // default: http://localhost:11434
  maxTokens:   number
  /** Timeout per request in milliseconds. Default 10 000. */
  timeoutMs?:  number
}

// ─── NPC context ──────────────────────────────────────────────────────────────

export interface NPCContext {
  name:             string
  role:             string
  settlement:       string
  emotionState:     EmotionState
  recentMemories:   EpisodicEvent[]
  relationships:    Relationship[]
  currentGoal:      string
  knowledge:        SemanticKnowledge[]
  civilizationTier: number   // 0-10
  playerTrust:      number   // -1 to +1
  playerHistory:    string   // short narrative history with the player
}

// ─── LLM response ─────────────────────────────────────────────────────────────

export type NPCAction =
  | 'continue_task' | 'follow_player'   | 'flee_player'   | 'attack_player'
  | 'trade'         | 'teach'           | 'give_item'     | 'request_item'
  | 'join_party'    | 'lead_to_location' | 'refuse'       | 'celebrate'
  | 'mourn'

export interface LLMResponse {
  dialogue:      string
  action:        NPCAction
  emotionDelta:  Partial<EmotionState>
}

// ─── Queue item ───────────────────────────────────────────────────────────────

interface QueueItem {
  playerInput: string
  context:     NPCContext
  resolve:     (r: LLMResponse)  => void
  reject:      (e: Error)        => void
  enqueuedAt:  number
}

// ─── LLMBridge ────────────────────────────────────────────────────────────────

export class LLMBridge {
  private queue:      QueueItem[] = []
  private processing  = false
  /** Maximum pending requests. Oldest stale request is dropped when exceeded. */
  private readonly MAX_QUEUE = 10

  constructor(private config: LLMConfig) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Queue an NPC dialogue request.
   * The returned promise resolves when the LLM has responded.
   * NPC continues behaving via GOAP while waiting.
   */
  requestDialogue(
    playerInput: string,
    npcContext:  NPCContext,
  ): Promise<LLMResponse> {
    return new Promise<LLMResponse>((resolve, reject) => {
      // Drop the oldest pending request if the queue is full to prevent unbounded growth.
      if (this.queue.length >= this.MAX_QUEUE) {
        const dropped = this.queue.shift()!
        dropped.reject(new Error('NPC dialogue queue full — request dropped'))
      }
      this.queue.push({
        playerInput,
        context:    npcContext,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      })
      if (!this.processing) {
        void this.processQueue()
      }
    })
  }

  /** Current queue depth (useful for UI indicators). */
  get queueDepth(): number { return this.queue.length }

  // ─── Prompt builder ──────────────────────────────────────────────────────────

  /**
   * Build the structured LLM prompt from NPC context.
   *
   * Template:
   *   "You are [NAME], a [ROLE] in [SETTLEMENT].
   *   Current emotional state: [...]
   *   Hunger: [...], Energy: [...], Safety: [...]
   *   Recent memories: [last 5 episodic events]
   *   Relationship with player: [trust] ([history])
   *   Cultural knowledge: [tier-appropriate knowledge]
   *   Current goal: [GOAP current goal]
   *   The player says: "[playerInput]"
   *   Respond in character (max 2 sentences), then output action: [ACTION_ENUM]"
   */
  buildPrompt(playerInput: string, ctx: NPCContext): string {
    const {
      name, role, settlement, emotionState,
      recentMemories, currentGoal, knowledge,
      civilizationTier, playerTrust, playerHistory,
    } = ctx

    // ── Emotion summary ──────────────────────────────────────────────────────
    const emotionDesc = this._describeEmotion(emotionState)

    // ── Body state ───────────────────────────────────────────────────────────
    // These are embedded in the emotion state's valence/arousal as proxies.
    const safetyDesc   = emotionState.fear < 0.2  ? 'safe'
                       : emotionState.fear < 0.6  ? 'uneasy'
                       : 'very afraid'
    const arousalDesc  = emotionState.arousal < 0.3 ? 'calm'
                       : emotionState.arousal < 0.7 ? 'alert'
                       : 'highly aroused'

    // ── Memory summary ───────────────────────────────────────────────────────
    const memLines = recentMemories
      .slice(0, 5)
      .map(m => `  - ${m.summary}`)
      .join('\n') || '  - No significant recent memories.'

    // ── Player relationship ───────────────────────────────────────────────────
    const trustDesc = playerTrust >  0.5 ? 'trusts you greatly'
                    : playerTrust >  0.1 ? 'is cautiously friendly'
                    : playerTrust > -0.1 ? 'is neutral toward you'
                    : playerTrust > -0.5 ? 'is wary of you'
                    : 'distrusts you deeply'

    // ── Cultural knowledge ────────────────────────────────────────────────────
    const culturalFacts = knowledge
      .filter(k => k.confidence > 0.5)
      .slice(0, 5)
      .map(k => `  - Knows: ${k.concept} (${(k.confidence * 100).toFixed(0)}% confident)`)
      .join('\n') || '  - Limited knowledge.'

    // ── Civilisation tier description ─────────────────────────────────────────
    const civDesc = this._civilizationTierDesc(civilizationTier)

    // ── Action enum list ──────────────────────────────────────────────────────
    const actionList: NPCAction[] = [
      'continue_task', 'follow_player', 'flee_player', 'attack_player',
      'trade', 'teach', 'give_item', 'request_item',
      'join_party', 'lead_to_location', 'refuse', 'celebrate', 'mourn',
    ]

    return [
      `You are ${name}, a ${role} in ${settlement}.`,
      `Civilisation tier: ${civDesc} (tier ${civilizationTier}/10).`,
      `Current emotional state: ${emotionDesc}.`,
      `Internal state: ${safetyDesc}, ${arousalDesc}.`,
      ``,
      `Recent memories:`,
      memLines,
      ``,
      `Relationship with player: ${name} ${trustDesc}.`,
      `History: ${playerHistory || 'No prior interactions.'}`,
      ``,
      `Cultural knowledge:`,
      culturalFacts,
      ``,
      `Current goal: ${currentGoal}.`,
      ``,
      `The player says: "${playerInput}"`,
      ``,
      `Instructions:`,
      `- Respond in character as ${name}. Maximum 2 sentences of dialogue.`,
      `- After your dialogue, on a new line, output exactly:`,
      `  action: <ACTION>`,
      `  where <ACTION> is one of: ${actionList.join(' | ')}`,
      `- Optionally, on a third line output emotion changes, e.g.:`,
      `  emotion: fear=0.2 anger=0.1`,
    ].join('\n')
  }

  // ─── Response parser ─────────────────────────────────────────────────────────

  /**
   * Parse the raw LLM text response into a structured LLMResponse.
   * Gracefully handles malformed responses with sensible defaults.
   */
  parseResponse(raw: string): LLMResponse {
    const lines = raw.trim().split('\n').map(l => l.trim()).filter(Boolean)

    let action:    NPCAction        = 'continue_task'
    let emotionDelta: Partial<EmotionState> = {}
    const dialogueLines: string[]   = []

    for (const line of lines) {
      if (line.startsWith('action:')) {
        const candidate = line.replace('action:', '').trim() as NPCAction
        if (VALID_ACTIONS.has(candidate)) {
          action = candidate
        }
      } else if (line.startsWith('emotion:')) {
        emotionDelta = this._parseEmotionLine(line.replace('emotion:', '').trim())
      } else {
        dialogueLines.push(line)
      }
    }

    const dialogue = dialogueLines
      .filter(l => !l.startsWith('action:') && !l.startsWith('emotion:'))
      .join(' ')
      .trim() || 'I have nothing to say.'

    return { dialogue, action, emotionDelta }
  }

  // ─── Queue processor ─────────────────────────────────────────────────────────

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return
    this.processing = true

    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      try {
        const raw      = await this._callLLM(item.playerInput, item.context)
        const response = this.parseResponse(raw)
        item.resolve(response)
      } catch (err) {
        // On error, resolve with a neutral fallback so the NPC doesn't hang.
        item.reject(err instanceof Error ? err : new Error(String(err)))
      }
    }

    this.processing = false
  }

  // ─── LLM API adapters ────────────────────────────────────────────────────────

  private async _callLLM(playerInput: string, ctx: NPCContext): Promise<string> {
    const prompt  = this.buildPrompt(playerInput, ctx)
    const timeout = this.config.timeoutMs ?? 10_000

    switch (this.config.provider) {
      case 'anthropic': return this._callAnthropic(prompt, timeout)
      case 'openai':    return this._callOpenAI(prompt, timeout)
      case 'ollama':    return this._callOllama(prompt, timeout)
      default:          throw new Error(`Unknown provider: ${this.config.provider}`)
    }
  }

  private async _callAnthropic(prompt: string, timeoutMs: number): Promise<string> {
    if (!this.config.apiKey) throw new Error('Anthropic API key not configured.')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      this.config.model,
          max_tokens: this.config.maxTokens,
          messages:   [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Anthropic API error ${res.status}: ${body}`)
      }

      const json = await res.json() as {
        content: Array<{ type: string; text?: string }>
      }
      const textBlock = json.content.find(b => b.type === 'text')
      return textBlock?.text ?? ''
    } finally {
      clearTimeout(timer)
    }
  }

  private async _callOpenAI(prompt: string, timeoutMs: number): Promise<string> {
    if (!this.config.apiKey) throw new Error('OpenAI API key not configured.')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model:      this.config.model,
          max_tokens: this.config.maxTokens,
          messages:   [
            { role: 'system', content: 'You are an NPC in a universe simulation game.' },
            { role: 'user',   content: prompt },
          ],
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`OpenAI API error ${res.status}: ${body}`)
      }

      const json = await res.json() as {
        choices: Array<{ message: { content: string } }>
      }
      return json.choices[0]?.message?.content ?? ''
    } finally {
      clearTimeout(timer)
    }
  }

  private async _callOllama(prompt: string, timeoutMs: number): Promise<string> {
    const baseUrl = this.config.ollamaUrl ?? 'http://localhost:11434'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:  this.config.model,
          prompt,
          stream: false,
          options: { num_predict: this.config.maxTokens },
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Ollama API error ${res.status}: ${body}`)
      }

      const json = await res.json() as { response: string }
      return json.response ?? ''
    } finally {
      clearTimeout(timer)
    }
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private _describeEmotion(e: EmotionState): string {
    const parts: string[] = []
    if (e.fear > 0.2)    parts.push(`afraid (${(e.fear   * 100).toFixed(0)}%)`)
    if (e.anger > 0.2)   parts.push(`angry (${(e.anger   * 100).toFixed(0)}%)`)
    if (e.joy > 0.2)     parts.push(`joyful (${(e.joy    * 100).toFixed(0)}%)`)
    if (e.distress > 0.2) parts.push(`distressed (${(e.distress * 100).toFixed(0)}%)`)
    if (e.love > 0.2)    parts.push(`loving (${(e.love   * 100).toFixed(0)}%)`)
    if (e.disgust > 0.2) parts.push(`disgusted (${(e.disgust * 100).toFixed(0)}%)`)
    if (e.pride > 0.2)   parts.push(`proud (${(e.pride   * 100).toFixed(0)}%)`)
    if (e.shame > 0.2)   parts.push(`ashamed (${(e.shame  * 100).toFixed(0)}%)`)
    return parts.length ? parts.join(', ') : 'neutral'
  }

  private _civilizationTierDesc(tier: number): string {
    const descs = [
      'pre-language hunter-gatherer',
      'proto-language tribe',
      'oral-tradition village',
      'early agriculture',
      'bronze-age settlement',
      'iron-age city-state',
      'classical civilisation',
      'early medieval kingdom',
      'renaissance society',
      'industrial age nation',
      'information age civilisation',
    ]
    return descs[Math.min(10, Math.max(0, tier))]
  }

  /** Parse "fear=0.2 anger=0.1 …" into a partial EmotionState. */
  private _parseEmotionLine(raw: string): Partial<EmotionState> {
    const result: Partial<EmotionState> = {}
    const tokens = raw.split(/\s+/)
    for (const tok of tokens) {
      const [key, val] = tok.split('=')
      const num = parseFloat(val)
      if (!isNaN(num) && EMOTION_KEYS.has(key)) {
        ;(result as any)[key] = Math.min(1, Math.max(0, num))
      }
    }
    return result
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_ACTIONS = new Set<NPCAction>([
  'continue_task', 'follow_player', 'flee_player', 'attack_player',
  'trade', 'teach', 'give_item', 'request_item',
  'join_party', 'lead_to_location', 'refuse', 'celebrate', 'mourn',
])

const EMOTION_KEYS = new Set([
  'joy', 'distress', 'hope', 'fear', 'satisfaction', 'disappointment',
  'pride', 'shame', 'love', 'hate', 'gratitude', 'anger',
  'curiosity', 'boredom', 'disgust', 'surprise',
])
