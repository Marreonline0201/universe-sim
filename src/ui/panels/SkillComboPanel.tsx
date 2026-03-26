// ── SkillComboPanel.tsx ────────────────────────────────────────────────────────
// M61 Track A: Skill Combo System UI
//
// Lists all 8 combos with icon, name, sequence badges, and effect description.
// Flashes the triggered combo for 2s. Shows real-time action buffer at bottom.

import { useState, useEffect, useRef } from 'react'
import {
  getComboDefinitions,
  getRecentActions,
  getComboCooldownRemaining,
  type ComboDefinition,
  type BufferEntry,
} from '../../game/SkillComboSystem'

// ── Action badge colors ────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  fire:      '#e74c3c',
  ice:       '#3498db',
  lightning: '#f1c40f',
  heal:      '#2ecc71',
  spell:     '#9b59b6',
  attack:    '#e67e22',
  combat:    '#c0392b',
  dodge:     '#1abc9c',
  sprint:    '#16a085',
  gather:    '#27ae60',
}

function getActionColor(action: string): string {
  return ACTION_COLORS[action] ?? '#666'
}

// ── Sequence Badge ─────────────────────────────────────────────────────────────

function SequenceBadge({ action }: { action: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 3,
      background: getActionColor(action),
      color: '#fff',
      fontSize: 10,
      fontFamily: 'monospace',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    }}>
      {action}
    </span>
  )
}

// ── Combo Row ──────────────────────────────────────────────────────────────────

function ComboRow({
  combo,
  highlighted,
  cooldown,
}: {
  combo: ComboDefinition
  highlighted: boolean
  cooldown: number
}) {
  const onCooldown = cooldown > 0

  return (
    <div style={{
      padding: '10px 12px',
      marginBottom: 8,
      borderRadius: 4,
      border: `1px solid ${highlighted ? '#cd4420' : '#2a2a2a'}`,
      background: highlighted
        ? 'rgba(205,68,32,0.18)'
        : onCooldown
          ? 'rgba(255,255,255,0.02)'
          : 'rgba(255,255,255,0.04)',
      transition: 'all 0.2s',
      opacity: onCooldown ? 0.55 : 1,
    }}>
      {/* Header row: icon + name + cooldown */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{combo.icon}</span>
          <span style={{
            color: highlighted ? '#cd4420' : '#ddd',
            fontFamily: 'monospace',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}>
            {combo.name}
          </span>
        </div>
        {onCooldown ? (
          <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 10 }}>
            {cooldown.toFixed(1)}s
          </span>
        ) : (
          <span style={{ color: '#2ecc71', fontFamily: 'monospace', fontSize: 10 }}>READY</span>
        )}
      </div>

      {/* Sequence badges */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
        {combo.sequence.map((action, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <SequenceBadge action={action} />
            {i < combo.sequence.length - 1 && (
              <span style={{ color: '#444', fontSize: 10 }}>→</span>
            )}
          </span>
        ))}
        <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 10, marginLeft: 4 }}>
          within {combo.windowSeconds}s
        </span>
      </div>

      {/* Description */}
      <div style={{ color: '#888', fontFamily: 'monospace', fontSize: 11 }}>
        {combo.description}
      </div>
    </div>
  )
}

// ── Buffer Entry Badge ─────────────────────────────────────────────────────────

function BufferBadge({ entry, now }: { entry: BufferEntry; now: number }) {
  const ageMs = now - entry.ts
  const ageSec = (ageMs / 1000).toFixed(1)
  const opacity = Math.max(0.2, 1 - ageMs / 6000)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      opacity,
    }}>
      <span style={{
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: 3,
        background: getActionColor(entry.action),
        color: '#fff',
        fontSize: 10,
        fontFamily: 'monospace',
        fontWeight: 700,
        textTransform: 'uppercase',
      }}>
        {entry.action}
      </span>
      <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 9 }}>
        {ageSec}s
      </span>
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

export function SkillComboPanel() {
  const [, setTick] = useState(0)
  const [highlightedCombo, setHighlightedCombo] = useState<string | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Poll buffer + cooldowns every 500ms
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 500)
    return () => clearInterval(id)
  }, [])

  // Listen for combo-triggered events
  useEffect(() => {
    function onComboTriggered(e: Event) {
      const detail = (e as CustomEvent).detail as { comboId: string }
      setHighlightedCombo(detail.comboId)
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = setTimeout(() => setHighlightedCombo(null), 2000)
    }
    window.addEventListener('combo-triggered', onComboTriggered)
    return () => {
      window.removeEventListener('combo-triggered', onComboTriggered)
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    }
  }, [])

  const combos = getComboDefinitions()
  const recentActions = getRecentActions()
  const last5 = recentActions.slice(-5)
  const now = Date.now()

  return (
    <div style={{ fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{
        marginBottom: 14,
        paddingBottom: 10,
        borderBottom: '1px solid #2a2a2a',
      }}>
        <div style={{ color: '#888', fontSize: 11 }}>
          Chain actions in sequence within the time window to unleash powerful combos.
        </div>
      </div>

      {/* Combo list */}
      <div>
        {combos.map(combo => (
          <ComboRow
            key={combo.id}
            combo={combo}
            highlighted={highlightedCombo === combo.id}
            cooldown={getComboCooldownRemaining(combo.id)}
          />
        ))}
      </div>

      {/* Recent action buffer */}
      <div style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid #2a2a2a',
      }}>
        <div style={{
          color: '#555',
          fontSize: 10,
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          Recent Actions
        </div>
        {last5.length === 0 ? (
          <div style={{ color: '#444', fontSize: 11 }}>No recent actions</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {last5.map((entry, i) => (
              <BufferBadge key={i} entry={entry} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
