import React from 'react'
import type { WorldStatus } from '../hooks/useStatusSocket'

const EPOCH_DESCRIPTIONS: Record<string, string> = {
  planck:            'The Planck epoch — universe is 10⁻⁴³s old, gravity not yet separated.',
  grand_unification: 'Grand Unification era — fundamental forces are still merged into one.',
  electroweak:       'Electroweak epoch — electromagnetic and weak forces still unified.',
  quark_epoch:       'Quark epoch — quarks and gluons fill the universe as a hot plasma.',
  nucleosynthesis:   'Nucleosynthesis — protons fuse into the first hydrogen and helium.',
  photon_epoch:      'Photon epoch — a glowing plasma; light cannot yet travel freely.',
  dark_ages:         'Cosmic Dark Ages — hydrogen fills the void but no stars shine yet.',
  reionization:      'Reionization — the first stars ignite and burn away the hydrogen fog.',
  stellar:           'Stellar Era — galaxies and star systems form across the cosmos.',
  galactic:          'Galactic Era — the Milky Way matures, stellar nurseries are active.',
  contemporary:      'Contemporary Era — our solar system and Earth exist right now.',
  stellar_late:      'Late Stellar Era — main-sequence stars are dying, white dwarfs rise.',
  degenerate:        'Degenerate Era — only white dwarfs, neutron stars and black holes remain.',
  dark_era:          'Dark Era — all stars dead. Only black holes in an eternal cold cosmos.',
}

function npcStateColor(state: string): string {
  const m: Record<string, string> = {
    wander:    '#4a9a5a',
    gather:    '#cc8830',
    eat:       '#55cc55',
    rest:      '#4477bb',
    socialize: '#bb44bb',
  }
  return m[state] ?? '#888'
}

interface StatRowProps {
  label: string
  value: string
  accent?: string
  large?: boolean
}

function StatRow({ label, value, accent, large }: StatRowProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      padding: '8px 0',
      borderBottom: '1px solid rgba(0,180,255,0.07)',
    }}>
      <span style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 8,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: 'rgba(0,180,255,0.4)',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: large ? 16 : 12,
        fontWeight: large ? 700 : 500,
        color: accent ?? 'rgba(255,255,255,0.82)',
        letterSpacing: 1,
      }}>
        {value}
      </span>
    </div>
  )
}

interface Props {
  world: WorldStatus
}

export function ServerStats({ world }: Props) {
  const epochDesc = EPOCH_DESCRIPTIONS[world.epoch] ?? 'Unknown epoch'

  // Count NPC states
  const stateCounts: Record<string, number> = {}
  for (const npc of world.npcs) {
    stateCounts[npc.state] = (stateCounts[npc.state] ?? 0) + 1
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto',
      padding: '16px 16px',
      gap: 0,
    }}>
      {/* Section header */}
      <div style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 8,
        letterSpacing: 3,
        textTransform: 'uppercase',
        color: 'rgba(0,180,255,0.35)',
        marginBottom: 8,
        paddingBottom: 8,
        borderBottom: '1px solid rgba(0,180,255,0.12)',
      }}>
        SERVER STATUS
      </div>

      {/* Connection */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 0',
        borderBottom: '1px solid rgba(0,180,255,0.07)',
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: world.connected ? '#00ff88' : '#ff4040',
          boxShadow: world.connected
            ? '0 0 8px rgba(0,255,120,0.7)'
            : '0 0 8px rgba(255,40,40,0.7)',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 11,
          fontWeight: 600,
          color: world.connected ? 'rgba(0,255,120,0.9)' : 'rgba(255,80,80,0.9)',
          letterSpacing: 1,
        }}>
          {world.connected ? 'CONNECTED' : 'DISCONNECTED'}
        </span>
      </div>

      <StatRow
        label="Players Online"
        value={String(world.players.length)}
        accent="rgba(0,200,255,0.9)"
        large
      />

      <StatRow
        label="NPCs Active"
        value={String(world.npcs.length)}
        accent="rgba(180,180,255,0.75)"
      />

      {/* NPC state breakdown */}
      {world.npcs.length > 0 && (
        <div style={{
          padding: '8px 0',
          borderBottom: '1px solid rgba(0,180,255,0.07)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 8,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'rgba(0,180,255,0.4)',
            marginBottom: 4,
            display: 'block',
          }}>
            NPC BEHAVIOUR
          </span>
          {Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).map(([state, count]) => {
            const pct = count / world.npcs.length
            return (
              <div key={state} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: npcStateColor(state),
                  flexShrink: 0,
                }} />
                <div style={{
                  flex: 1,
                  height: 3,
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${pct * 100}%`,
                    height: '100%',
                    background: npcStateColor(state),
                    borderRadius: 2,
                    transition: 'width 0.6s ease',
                  }} />
                </div>
                <span style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 8,
                  color: 'rgba(180,200,220,0.5)',
                  width: 40,
                  textAlign: 'right',
                }}>
                  {count} {state}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Bootstrap progress */}
      {world.bootstrapPhase && (
        <div style={{
          padding: '8px 0',
          borderBottom: '1px solid rgba(0,180,255,0.07)',
        }}>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 8,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'rgba(255,200,40,0.6)',
            marginBottom: 6,
            display: 'block',
          }}>
            WORLD FORMING
          </span>
          <div style={{
            height: 6,
            background: 'rgba(255,200,40,0.1)',
            borderRadius: 3,
            overflow: 'hidden',
            border: '1px solid rgba(255,200,40,0.2)',
            marginBottom: 4,
          }}>
            <div style={{
              width: `${Math.round(world.bootstrapProgress * 100)}%`,
              height: '100%',
              background: 'linear-gradient(90deg, rgba(255,180,0,0.6), rgba(255,220,60,0.9))',
              borderRadius: 3,
              transition: 'width 1s ease',
            }} />
          </div>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 9,
            color: 'rgba(255,200,40,0.7)',
          }}>
            {Math.round(world.bootstrapProgress * 100)}% complete
          </span>
        </div>
      )}

      {/* Epoch description */}
      <div style={{
        padding: '10px 0',
        borderBottom: '1px solid rgba(0,180,255,0.07)',
      }}>
        <span style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 8,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: 'rgba(0,180,255,0.4)',
          marginBottom: 6,
          display: 'block',
        }}>
          EPOCH
        </span>
        <span style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 10,
          color: 'rgba(255,215,60,0.85)',
          lineHeight: 1.6,
          display: 'block',
        }}>
          {epochDesc}
        </span>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 'auto',
        paddingTop: 14,
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 8,
        color: 'rgba(0,180,255,0.2)',
        letterSpacing: 2,
        lineHeight: 1.8,
      }}>
        UNIVERSE SIM v0.1<br />
        STATUS OBSERVER<br />
        10 Hz TELEMETRY
      </div>
    </div>
  )
}
