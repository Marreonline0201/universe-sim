// ── PetPanel.tsx ──────────────────────────────────────────────────────────────
// M45 Track A: Pet & Companion management panel.
// Tame small creatures for passive buffs. Hotkey: P

import { useState, useEffect, useCallback } from 'react'
import {
  PET_DEFS,
  PetType,
  playerPet,
  tamePet,
  dismissPet,
} from '../../game/PetSystem'
import { inventory } from '../../game/GameSingletons'
import { MAT } from '../../player/Inventory'

// Build a material-name lookup from MAT enum keys
const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [
    v as number,
    k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
  ])
)

const PET_ORDER = [
  PetType.FOX,
  PetType.CROW,
  PetType.RABBIT,
  PetType.WOLF,
  PetType.OWL,
]

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root: {
    fontFamily: 'monospace',
    color: '#ccc',
    userSelect: 'none',
  } as React.CSSProperties,
  header: {
    color: '#4dd9ac',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 12,
    borderBottom: '1px solid #1e4a40',
    paddingBottom: 6,
  } as React.CSSProperties,
  activePetCard: {
    background: 'rgba(20,60,50,0.6)',
    border: '1px solid #2a6a55',
    borderRadius: 6,
    padding: '14px 16px',
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  } as React.CSSProperties,
  petIcon: {
    fontSize: 36,
    textAlign: 'center' as const,
    marginBottom: 4,
  } as React.CSSProperties,
  petName: {
    color: '#4dd9ac',
    fontSize: 15,
    fontWeight: 700,
    textAlign: 'center' as const,
    letterSpacing: 1,
  } as React.CSSProperties,
  buffRow: {
    color: '#8de8c8',
    fontSize: 11,
    textAlign: 'center' as const,
    opacity: 0.9,
  } as React.CSSProperties,
  dismissBtn: {
    background: 'rgba(180,40,40,0.18)',
    border: '1px solid #5a1a1a',
    color: '#d47070',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.5,
    padding: '6px 14px',
    cursor: 'pointer',
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'center' as const,
    transition: 'background 0.15s',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  } as React.CSSProperties,
  card: {
    background: 'rgba(14,14,14,0.8)',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    padding: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  } as React.CSSProperties,
  cardIcon: {
    fontSize: 28,
    textAlign: 'center' as const,
  } as React.CSSProperties,
  cardName: {
    color: '#eee',
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'center' as const,
    letterSpacing: 0.5,
  } as React.CSSProperties,
  cardBuff: {
    color: '#4dd9ac',
    fontSize: 10,
    textAlign: 'center' as const,
    lineHeight: 1.4,
  } as React.CSSProperties,
  costRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
    justifyContent: 'center' as const,
    marginTop: 2,
  } as React.CSSProperties,
  tameBtn: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.5,
    padding: '5px 10px',
    cursor: 'pointer',
    borderRadius: 4,
    marginTop: 4,
    transition: 'background 0.15s',
    border: 'none',
    width: '100%',
  } as React.CSSProperties,
}

export function PetPanel() {
  // Tick to trigger re-render for inventory polling + pet state
  const [, setTick] = useState(0)
  const rerender = useCallback(() => setTick(t => t + 1), [])

  // Poll inventory every 500ms to update cost affordability
  useEffect(() => {
    const id = setInterval(rerender, 500)
    return () => clearInterval(id)
  }, [rerender])

  // Re-render on pet events
  useEffect(() => {
    window.addEventListener('pet-tamed', rerender)
    window.addEventListener('pet-dismissed', rerender)
    return () => {
      window.removeEventListener('pet-tamed', rerender)
      window.removeEventListener('pet-dismissed', rerender)
    }
  }, [rerender])

  const activePet = playerPet

  if (activePet) {
    const def = PET_DEFS[activePet.type]
    return (
      <div style={S.root}>
        <div style={S.header}>Active Companion</div>
        <div style={S.activePetCard}>
          <div style={S.petIcon}>{def.icon}</div>
          <div style={S.petName}>{def.name}</div>
          {def.buffDesc.map((desc, i) => (
            <div key={i} style={S.buffRow}>✦ {desc}</div>
          ))}
          <button
            style={S.dismissBtn}
            onClick={() => { dismissPet(); rerender() }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(180,40,40,0.38)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(180,40,40,0.18)')}
          >
            DISMISS
          </button>
        </div>
        <div style={{ color: '#555', fontSize: 10, textAlign: 'center' }}>
          Dismiss your current companion to tame a new one.
        </div>
      </div>
    )
  }

  return (
    <div style={S.root}>
      <div style={S.header}>Tame a Companion</div>
      <div style={{ color: '#666', fontSize: 11, marginBottom: 14 }}>
        Offer materials to tame a creature. Your companion will follow you and grant passive buffs.
      </div>
      <div style={S.grid}>
        {PET_ORDER.map(type => {
          const def = PET_DEFS[type]
          const canAfford = def.tameCost.every(
            ({ materialId, qty }) => inventory.countMaterial(materialId) >= qty
          )
          return (
            <div
              key={type}
              style={{
                ...S.card,
                borderColor: canAfford ? '#2a4a40' : '#2a2a2a',
              }}
            >
              <div style={S.cardIcon}>{def.icon}</div>
              <div style={S.cardName}>{def.name}</div>
              <div style={S.cardBuff}>{def.buffDesc[0]}</div>
              <div style={S.costRow}>
                {def.tameCost.map(({ materialId, qty }) => {
                  const has = inventory.countMaterial(materialId)
                  const enough = has >= qty
                  return (
                    <span
                      key={materialId}
                      style={{
                        fontSize: 9,
                        color: enough ? '#8de8c8' : '#c04040',
                        background: enough ? 'rgba(20,60,50,0.5)' : 'rgba(60,10,10,0.5)',
                        borderRadius: 3,
                        padding: '2px 5px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {MAT_NAMES[materialId] ?? `Mat#${materialId}`} ×{qty}
                    </span>
                  )
                })}
              </div>
              <button
                style={{
                  ...S.tameBtn,
                  background: canAfford ? 'rgba(20,100,80,0.5)' : 'rgba(30,30,30,0.4)',
                  color: canAfford ? '#4dd9ac' : '#444',
                  cursor: canAfford ? 'pointer' : 'not-allowed',
                  border: `1px solid ${canAfford ? '#2a6a55' : '#2a2a2a'}`,
                }}
                disabled={!canAfford}
                onClick={() => {
                  if (tamePet(type)) rerender()
                }}
              >
                TAME
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
