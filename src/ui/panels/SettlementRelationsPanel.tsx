// src/ui/panels/SettlementRelationsPanel.tsx
// M67 Track C: Settlement Relations Panel
// Diplomacy matrix, relation detail, player actions, trade agreements.

import React, { useState, useCallback } from 'react'
import {
  getSettlements,
  getRelation,
  getRelationState,
  getAllRelations,
  getTradeAgreements,
  performDiplomacy,
  type Settlement,
  type DiplomacyAction,
  type RelationState,
} from '../../game/SettlementRelationsSystem'
import { usePlayerStore } from '../../store/playerStore'

// ── Helpers ────────────────────────────────────────────────────────────────────

function stateEmoji(state: RelationState): string {
  switch (state) {
    case 'war':      return '⚔️'
    case 'hostile':  return '😤'
    case 'neutral':  return '😐'
    case 'friendly': return '🤝'
    case 'allied':   return '💛'
  }
}

function stateColor(state: RelationState): string {
  switch (state) {
    case 'war':      return '#ef4444'
    case 'hostile':  return '#f97316'
    case 'neutral':  return '#9ca3af'
    case 'friendly': return '#4ade80'
    case 'allied':   return '#facc15'
  }
}

function relationBarColor(rel: number): string {
  if (rel < -50) return '#ef4444'
  if (rel < -20) return '#f97316'
  if (rel <= 20)  return '#9ca3af'
  if (rel <= 60)  return '#4ade80'
  return '#facc15'
}

const DIPLOMACY_ACTIONS: Array<{
  action: DiplomacyAction
  label: string
  cost: number
  desc: string
  minState?: RelationState[]
}> = [
  {
    action: 'broker_peace',
    label: 'Broker Peace',
    cost: 500,
    desc: '+30 relation',
    minState: ['war', 'hostile'],
  },
  {
    action: 'trade_agreement',
    label: 'Trade Agreement',
    cost: 200,
    desc: '+15 relation, +5g/min',
  },
  {
    action: 'incite_rivalry',
    label: 'Incite Rivalry',
    cost: 300,
    desc: '-25 relation',
    minState: ['friendly', 'allied'],
  },
  {
    action: 'gift_delegation',
    label: 'Gift Delegation',
    cost: 100,
    desc: '+10 relation',
  },
]

// ── Component ──────────────────────────────────────────────────────────────────

export function SettlementRelationsPanel() {
  const [selectedPair, setSelectedPair] = useState<{ a: Settlement; b: Settlement } | null>(null)
  const [tick, setTick] = useState(0)
  const gold = usePlayerStore(s => s.gold)

  const settlements = getSettlements()
  const tradeAgreements = getTradeAgreements()

  const handleCellClick = useCallback((a: Settlement, b: Settlement) => {
    setSelectedPair({ a, b })
  }, [])

  const handleAction = useCallback((action: DiplomacyAction) => {
    if (!selectedPair) return
    const ok = performDiplomacy(action, selectedPair.a.id, selectedPair.b.id)
    if (ok) setTick(t => t + 1)
  }, [selectedPair])

  const selectedRelation = selectedPair
    ? getRelation(selectedPair.a.id, selectedPair.b.id)
    : null
  const selectedState = selectedPair
    ? getRelationState(selectedPair.a.id, selectedPair.b.id)
    : null

  return (
    <div style={{
      fontFamily: 'monospace',
      color: '#e2e8f0',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      height: '100%',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ fontSize: 11, letterSpacing: 3, color: '#64748b', fontWeight: 700 }}>
        SETTLEMENT RELATIONS
      </div>

      {/* 5x5 Relation Matrix */}
      <div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
          Click a cell to select a settlement pair
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `80px repeat(${settlements.length}, 1fr)`,
          gap: 2,
          fontSize: 11,
        }}>
          {/* Header row */}
          <div />
          {settlements.map(s => (
            <div key={s.id} style={{
              textAlign: 'center',
              color: '#94a3b8',
              padding: '2px 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 10,
            }}>
              {s.icon}
            </div>
          ))}

          {/* Data rows */}
          {settlements.map(rowS => (
            <React.Fragment key={rowS.id}>
              {/* Row label */}
              <div style={{
                color: '#94a3b8',
                fontSize: 10,
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {rowS.icon} {rowS.name.slice(0, 6)}
              </div>

              {/* Cells */}
              {settlements.map(colS => {
                if (rowS.id === colS.id) {
                  return (
                    <div key={colS.id} style={{
                      textAlign: 'center',
                      color: '#374151',
                      background: '#111827',
                      borderRadius: 3,
                      padding: '4px 2px',
                    }}>
                      —
                    </div>
                  )
                }
                const state = getRelationState(rowS.id, colS.id)
                const isSelected = selectedPair &&
                  ((selectedPair.a.id === rowS.id && selectedPair.b.id === colS.id) ||
                   (selectedPair.a.id === colS.id && selectedPair.b.id === rowS.id))
                return (
                  <div
                    key={colS.id}
                    onClick={() => handleCellClick(rowS, colS)}
                    style={{
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: isSelected ? '#1e3a5f' : '#1e293b',
                      border: isSelected ? '1px solid #3b82f6' : '1px solid #374151',
                      borderRadius: 3,
                      padding: '4px 2px',
                      fontSize: 13,
                      transition: 'background 0.1s',
                    }}
                    title={`${rowS.name} ↔ ${colS.name}: ${state}`}
                  >
                    {stateEmoji(state)}
                  </div>
                )
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {(['war', 'hostile', 'neutral', 'friendly', 'allied'] as RelationState[]).map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
              <span>{stateEmoji(s)}</span>
              <span style={{ color: stateColor(s) }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected pair detail */}
      {selectedPair && selectedRelation !== null && selectedState !== null && (
        <div style={{
          background: '#1e293b',
          borderRadius: 6,
          padding: 10,
          border: '1px solid #334155',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            {selectedPair.a.icon} {selectedPair.a.name} ↔ {selectedPair.b.icon} {selectedPair.b.name}
          </div>

          {/* Relation bar */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>
              <span>-100</span>
              <span style={{ color: stateColor(selectedState), fontWeight: 700 }}>
                {stateEmoji(selectedState)} {selectedState.toUpperCase()} ({selectedRelation > 0 ? '+' : ''}{Math.round(selectedRelation)})
              </span>
              <span>+100</span>
            </div>
            <div style={{ height: 8, background: '#0f172a', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              {/* Center mark */}
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#374151' }} />
              {/* Bar */}
              <div style={{
                position: 'absolute',
                height: '100%',
                background: relationBarColor(selectedRelation),
                borderRadius: 4,
                ...(selectedRelation >= 0
                  ? { left: '50%', width: `${(selectedRelation / 100) * 50}%` }
                  : { right: '50%', width: `${(-selectedRelation / 100) * 50}%` }
                ),
              }} />
            </div>
          </div>

          {/* Diplomacy actions */}
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>DIPLOMACY ACTIONS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {DIPLOMACY_ACTIONS.map(({ action, label, cost, desc }) => {
              const canAfford = gold >= cost
              return (
                <button
                  key={action}
                  onClick={() => handleAction(action)}
                  disabled={!canAfford}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: canAfford ? '#0f172a' : '#1a1a2e',
                    border: `1px solid ${canAfford ? '#334155' : '#1e293b'}`,
                    borderRadius: 4,
                    padding: '5px 8px',
                    color: canAfford ? '#e2e8f0' : '#475569',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    textAlign: 'left',
                  }}
                >
                  <span>{label}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: '#94a3b8', fontSize: 10 }}>{desc}</span>
                    <span style={{ color: canAfford ? '#facc15' : '#475569' }}>🪙 {cost}g</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!selectedPair && (
        <div style={{
          background: '#1e293b',
          borderRadius: 6,
          padding: 10,
          border: '1px solid #334155',
          color: '#64748b',
          fontSize: 11,
          textAlign: 'center',
        }}>
          Select a cell in the matrix to view settlement pair details and diplomacy actions
        </div>
      )}

      {/* Trade agreements */}
      <div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
          ACTIVE TRADE AGREEMENTS ({tradeAgreements.length})
        </div>
        {tradeAgreements.length === 0 ? (
          <div style={{ color: '#374151', fontSize: 11 }}>
            No active trade agreements. Use "Trade Agreement" action to establish one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tradeAgreements.map(ag => {
              const sA = getSettlements().find(s => s.id === ag.settlementA)
              const sB = getSettlements().find(s => s.id === ag.settlementB)
              return (
                <div key={ag.id} style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  padding: '5px 8px',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <span>
                    {sA?.icon ?? '?'} {sA?.name ?? ag.settlementA} ↔ {sB?.icon ?? '?'} {sB?.name ?? ag.settlementB}
                  </span>
                  <span style={{ color: '#4ade80' }}>+{ag.goldPerMin}g/min</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Gold display */}
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 'auto', paddingTop: 4, borderTop: '1px solid #1e293b' }}>
        Gold: <span style={{ color: '#facc15' }}>🪙 {Math.floor(gold)}g</span>
      </div>
    </div>
  )
}
