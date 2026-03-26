// ── FactionWarPanel.tsx ───────────────────────────────────────────────────────
// M52 Track A: Shows active faction wars and war history.

import { useState, useEffect } from 'react'
import {
  getActiveWars,
  getWarHistory,
  playerJoinWar,
  type FactionWar,
  type WarPhase,
} from '../../game/FactionWarSystem'
import { FACTIONS } from '../../game/FactionSystem'
import type { FactionId } from '../../game/FactionSystem'

const PHASE_COLORS: Record<WarPhase, string> = {
  skirmish:  '#f97316',
  conflict:  '#ef4444',
  full_war:  '#dc2626',
  ceasefire: '#6b7280',
}

const PHASE_LABELS: Record<WarPhase, string> = {
  skirmish:  'SKIRMISH',
  conflict:  'CONFLICT',
  full_war:  'FULL WAR',
  ceasefire: 'CEASEFIRE',
}

function getFactionName(id: string): string {
  const faction = FACTIONS[id as FactionId]
  return faction ? `${faction.icon} ${faction.name}` : id
}

function getFactionIcon(id: string): string {
  const faction = FACTIONS[id as FactionId]
  return faction ? faction.icon : '?'
}

interface WarCardProps {
  war: FactionWar
}

function WarCard({ war }: WarCardProps) {
  const phaseColor = PHASE_COLORS[war.phase]
  const phaseLabel = PHASE_LABELS[war.phase]

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid #2a2a2a',
      borderRadius: 6,
      padding: '12px 14px',
      marginBottom: 10,
    }}>
      {/* Combatants row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        fontFamily: 'monospace',
        fontSize: 12,
        fontWeight: 700,
        color: '#e0e0e0',
      }}>
        <span>{getFactionName(war.attackingFactionId)}</span>
        <span style={{ color: '#cd4420', fontSize: 14 }}>⚔</span>
        <span>{getFactionName(war.defendingFactionId)}</span>
      </div>

      {/* Phase badge + intensity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{
          background: phaseColor + '22',
          border: `1px solid ${phaseColor}`,
          color: phaseColor,
          fontFamily: 'monospace',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1,
          padding: '2px 7px',
          borderRadius: 3,
        }}>
          {phaseLabel}
        </span>

        {/* Intensity bar */}
        <div style={{ flex: 1, height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${war.intensity}%`,
            height: '100%',
            background: phaseColor,
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }} />
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#666', minWidth: 32 }}>
          {Math.round(war.intensity)}%
        </span>
      </div>

      {/* Win counts */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10,
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#888',
      }}>
        <span>{getFactionIcon(war.attackingFactionId)} {war.attackerWins} wins</span>
        <span style={{ color: '#333' }}>:</span>
        <span>{war.defenderWins} wins {getFactionIcon(war.defendingFactionId)}</span>
      </div>

      {/* Join buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => playerJoinWar(war.id, 'attacker')}
          style={{
            flex: 1,
            padding: '5px 10px',
            background: 'rgba(205,68,32,0.12)',
            border: '1px solid #cd4420',
            borderRadius: 4,
            color: '#cd4420',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(205,68,32,0.25)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(205,68,32,0.12)')}
        >
          Join Attackers
        </button>
        <button
          onClick={() => playerJoinWar(war.id, 'defender')}
          style={{
            flex: 1,
            padding: '5px 10px',
            background: 'rgba(68,170,68,0.12)',
            border: '1px solid #44aa44',
            borderRadius: 4,
            color: '#44aa44',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(68,170,68,0.25)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(68,170,68,0.12)')}
        >
          Join Defenders
        </button>
      </div>
    </div>
  )
}

function HistoryEntry({ war }: { war: FactionWar }) {
  const isAttackerVictor = war.victor && war.victor !== 'ceasefire'
  const victorName = war.victor === 'ceasefire'
    ? 'Ceasefire'
    : war.victor
      ? getFactionName(war.victor)
      : '—'
  const outcomeColor = war.victor === 'ceasefire' ? '#6b7280' : '#f97316'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '7px 10px',
      borderBottom: '1px solid #1a1a1a',
      fontFamily: 'monospace',
      fontSize: 11,
    }}>
      <span style={{ color: '#777' }}>
        {getFactionIcon(war.attackingFactionId)} vs {getFactionIcon(war.defendingFactionId)}
        {' '}
        <span style={{ color: '#555' }}>
          ({war.attackerWins}:{war.defenderWins})
        </span>
      </span>
      <span style={{ color: outcomeColor, fontWeight: 700 }}>
        {isAttackerVictor ? '🏆 ' : ''}{victorName}
      </span>
    </div>
  )
}

export function FactionWarPanel() {
  const [, setTick] = useState(0)

  // Re-render when war events fire
  useEffect(() => {
    function refresh() { setTick(t => t + 1) }
    window.addEventListener('faction-war-started',  refresh)
    window.addEventListener('faction-war-updated',  refresh)
    window.addEventListener('faction-war-resolved', refresh)
    return () => {
      window.removeEventListener('faction-war-started',  refresh)
      window.removeEventListener('faction-war-updated',  refresh)
      window.removeEventListener('faction-war-resolved', refresh)
    }
  }, [])

  const wars   = getActiveWars()
  const history = getWarHistory().slice(0, 5)

  return (
    <div style={{ fontFamily: 'monospace', color: '#ccc' }}>

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: 1, marginBottom: 4 }}>
          FACTION WARS
        </div>
        <div style={{ fontSize: 11, color: '#555' }}>
          Active conflicts between factions — join a side to earn reputation
        </div>
      </div>

      {/* Active Wars */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 2,
          color: '#cd4420',
          marginBottom: 10,
          borderBottom: '1px solid #2a2a2a',
          paddingBottom: 6,
        }}>
          ACTIVE WARS ({wars.length})
        </div>

        {wars.length === 0 ? (
          <div style={{
            color: '#444',
            fontSize: 12,
            textAlign: 'center',
            padding: '24px 0',
            fontStyle: 'italic',
          }}>
            No active wars. Check back later.
          </div>
        ) : (
          wars.map(war => <WarCard key={war.id} war={war} />)
        )}
      </div>

      {/* War History */}
      <div>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 2,
          color: '#555',
          marginBottom: 8,
          borderBottom: '1px solid #1a1a1a',
          paddingBottom: 6,
        }}>
          WAR HISTORY
        </div>

        {history.length === 0 ? (
          <div style={{ color: '#333', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>
            No resolved wars yet.
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 4, overflow: 'hidden' }}>
            {history.map(war => <HistoryEntry key={war.id} war={war} />)}
          </div>
        )}
      </div>
    </div>
  )
}
