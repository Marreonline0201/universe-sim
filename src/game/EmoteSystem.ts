/**
 * EmoteSystem — M26 Track B
 *
 * Manages local player emote state and broadcasts emotes to the server.
 * Other players' emotes arrive as EMOTE messages from the server and are
 * stored here so RemotePlayersRenderer can display floating chat bubbles.
 */

import { getWorldSocket } from '../net/useWorldSocket'

export interface EmoteDef {
  emoji: string
  label: string
  key: string  // 1–8
}

export const EMOTES: EmoteDef[] = [
  { emoji: '👋', label: 'Wave',   key: '1' },
  { emoji: '💃', label: 'Dance',  key: '2' },
  { emoji: '🧘', label: 'Sit',    key: '3' },
  { emoji: '😂', label: 'Laugh',  key: '4' },
  { emoji: '🎉', label: 'Cheer',  key: '5' },
  { emoji: '😢', label: 'Sad',    key: '6' },
  { emoji: '😠', label: 'Angry',  key: '7' },
  { emoji: '🤷', label: 'Shrug',  key: '8' },
]

export const EMOTE_DURATION_MS = 3000

// ── Local player emote ────────────────────────────────────────────────────────

let _localEmoji: string | null = null
let _localExpiresAt = 0

export function triggerLocalEmote(index: number): void {
  if (index < 0 || index >= EMOTES.length) return
  const emote = EMOTES[index]
  _localEmoji = emote.emoji
  _localExpiresAt = Date.now() + EMOTE_DURATION_MS

  // Broadcast to server so other clients see it
  try {
    getWorldSocket()?.send({ type: 'EMOTE', emoji: emote.emoji } as any)
  } catch { /* ignore if socket not connected */ }
}

export function getLocalEmote(): string | null {
  if (!_localEmoji) return null
  if (Date.now() > _localExpiresAt) {
    _localEmoji = null
    return null
  }
  return _localEmoji
}

// ── Remote player emotes ──────────────────────────────────────────────────────

interface RemoteEmoteEntry {
  emoji: string
  expiresAt: number
}

const _remoteEmotes = new Map<string, RemoteEmoteEntry>()

/** Called by the WebSocket message handler when an EMOTE message arrives. */
export function setRemoteEmote(userId: string, emoji: string): void {
  _remoteEmotes.set(userId, { emoji, expiresAt: Date.now() + EMOTE_DURATION_MS })
}

/** Returns the current emote emoji for a remote player, or null if none active. */
export function getRemoteEmote(userId: string): string | null {
  const entry = _remoteEmotes.get(userId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    _remoteEmotes.delete(userId)
    return null
  }
  return entry.emoji
}

// ── Tick (called from GameLoop each frame) ────────────────────────────────────

/** Cleans up expired remote emotes. Call once per frame from GameLoop. */
export function tickEmoteSystem(): void {
  const now = Date.now()
  for (const [uid, entry] of _remoteEmotes) {
    if (now > entry.expiresAt) _remoteEmotes.delete(uid)
  }
}
