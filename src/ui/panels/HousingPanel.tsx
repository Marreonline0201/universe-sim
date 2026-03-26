// ── HousingPanel.tsx ───────────────────────────────────────────────────────────
// M44 Track B: Player Housing & Furniture management panel.
// Shows house status, placed furniture with buff descriptions, and a placement grid.
// Hotkey: N

import { useState, useEffect } from 'react'
import { inventory } from '../../game/GameSingletons'
import {
  FurnitureType,
  FURNITURE_DEFS,
  playerHouse,
  claimHouse,
  placeFurniture,
  type PlayerHouse,
} from '../../game/HousingSystem'
import { MAT } from '../../player/Inventory'
import { useSettlementStore } from '../../store/settlementStore'
import { useUiStore } from '../../store/uiStore'

const FURNITURE_ORDER: FurnitureType[] = [
  FurnitureType.BED,
  FurnitureType.WORKBENCH,
  FurnitureType.BOOKSHELF,
  FurnitureType.FIREPLACE,
  FurnitureType.STORAGE_CHEST,
]

// Build a material-name lookup from MAT enum keys
const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [
    v as number,
    k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
  ])
)

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  section: {
    marginBottom: 18,
  } as React.CSSProperties,
  sectionTitle: {
    color: '#7c5cbf',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 8,
    borderBottom: '1px solid #2a2a2a',
    paddingBottom: 4,
  } as React.CSSProperties,
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  } as React.CSSProperties,
  statusLabel: {
    color: '#888',
    fontFamily: 'monospace',
    fontSize: 12,
  } as React.CSSProperties,
  statusValue: {
    color: '#00e5ff',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 700,
  } as React.CSSProperties,
  claimBtn: {
    background: 'rgba(124,92,191,0.18)',
    border: '1px solid #7c5cbf',
    color: '#c9a0ff',
    fontFamily: 'monospace',
    fontSize: 11,
    letterSpacing: 1,
    padding: '6px 16px',
    cursor: 'pointer',
    borderRadius: 3,
    transition: 'all 0.12s',
  } as React.CSSProperties,
  furnitureCard: (active: boolean, canAfford: boolean): React.CSSProperties => ({
    background: active
      ? 'rgba(124,92,191,0.18)'
      : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? '#7c5cbf' : canAfford ? '#333' : '#5a1a1a'}`,
    borderRadius: 4,
    padding: '10px 12px',
    marginBottom: 8,
    cursor: active ? 'default' : canAfford ? 'pointer' : 'not-allowed',
    opacity: active ? 0.7 : 1,
    transition: 'all 0.12s',
  }),
  furnitureName: {
    color: '#e0e0e0',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 2,
  } as React.CSSProperties,
  furnitureBuff: {
    color: '#00e5ff',
    fontFamily: 'monospace',
    fontSize: 11,
    marginBottom: 4,
  } as React.CSSProperties,
  furnitureCost: {
    color: '#666',
    fontFamily: 'monospace',
    fontSize: 10,
  } as React.CSSProperties,
  placedBadge: {
    color: '#4caf50',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
  } as React.CSSProperties,
  noAffordBadge: {
    color: '#e53935',
    fontFamily: 'monospace',
    fontSize: 10,
  } as React.CSSProperties,
  activeBuff: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 6,
  } as React.CSSProperties,
  buffDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#00e5ff',
    flexShrink: 0,
    marginTop: 4,
  } as React.CSSProperties,
  buffText: {
    color: '#ccc',
    fontFamily: 'monospace',
    fontSize: 11,
  } as React.CSSProperties,
  empty: {
    color: '#555',
    fontFamily: 'monospace',
    fontSize: 11,
    fontStyle: 'italic',
  } as React.CSSProperties,
}

// ── Component ─────────────────────────────────────────────────────────────────
export function HousingPanel() {
  const addNotification = useUiStore((s: ReturnType<typeof useUiStore.getState>) => s.addNotification)
  const nearSettlementId = useSettlementStore(s => s.nearSettlementId)
  const settlements = useSettlementStore(s => s.settlements)

  // Local state mirrors module-level mutable playerHouse (refresh on events)
  const [house, setHouse] = useState<PlayerHouse | null>(playerHouse)
  const [, forceRefresh] = useState(0)

  // Refresh on housing events and inventory changes
  useEffect(() => {
    const onClaimed  = () => setHouse({ ...playerHouse! })
    const onPlaced   = () => setHouse(playerHouse ? { ...playerHouse } : null)
    window.addEventListener('house-claimed',     onClaimed)
    window.addEventListener('furniture-placed',  onPlaced)
    const inv = setInterval(() => forceRefresh(r => r + 1), 500)
    return () => {
      window.removeEventListener('house-claimed',    onClaimed)
      window.removeEventListener('furniture-placed', onPlaced)
      clearInterval(inv)
    }
  }, [])

  // Resolve nearby settlement name
  const nearSettlement = nearSettlementId != null ? settlements.get(nearSettlementId) : null
  const settlementName = nearSettlement?.name ?? (nearSettlementId != null ? `Settlement #${nearSettlementId}` : null)

  // House settlement name
  const houseSettlement = house
    ? (settlements.get(Number(house.settlementId))?.name ?? `Settlement #${house.settlementId}`)
    : null

  function handleClaim() {
    if (nearSettlementId == null) return
    claimHouse(String(nearSettlementId))
    addNotification(`House claimed in ${settlementName}!`, 'discovery')
  }

  function handlePlace(type: FurnitureType) {
    if (!house) return
    if (house.furniture.includes(type)) return
    const ok = placeFurniture(type)
    if (ok) {
      addNotification(`${FURNITURE_DEFS[type].name} placed!`, 'info')
    } else {
      addNotification(`Not enough materials for ${FURNITURE_DEFS[type].name}.`, 'warning')
    }
  }

  function canAfford(type: FurnitureType): boolean {
    const def = FURNITURE_DEFS[type]
    return def.cost.every(({ materialId, qty }) => inventory.countMaterial(materialId) >= qty)
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: '0 4px' }}>

      {/* ── House Status ────────────────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>House Status</div>
        <div style={S.statusRow}>
          <span style={S.statusLabel}>Location</span>
          <span style={house ? S.statusValue : { ...S.statusLabel, fontStyle: 'italic' }}>
            {house ? houseSettlement : 'No house claimed'}
          </span>
        </div>

        {!house && nearSettlement && (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: '#888', fontFamily: 'monospace', fontSize: 11, marginBottom: 8 }}>
              You are near <span style={{ color: '#00e5ff' }}>{settlementName}</span>. You can claim a house here.
            </div>
            <button
              style={S.claimBtn}
              onClick={handleClaim}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,92,191,0.32)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,92,191,0.18)' }}
            >
              CLAIM HOUSE
            </button>
          </div>
        )}

        {!house && !nearSettlement && (
          <div style={S.empty}>
            Travel to a settlement to claim a house.
          </div>
        )}
      </div>

      {/* ── Active Buffs ─────────────────────────────────────────────────────── */}
      {house && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Active Buffs</div>
          {house.furniture.length === 0 ? (
            <div style={S.empty}>No furniture placed yet.</div>
          ) : (
            house.furniture.map(type => (
              <div key={type} style={S.activeBuff}>
                <div style={S.buffDot} />
                <span style={S.buffText}>
                  <span style={{ color: '#7c5cbf' }}>{FURNITURE_DEFS[type].name}</span>
                  {' — '}
                  {FURNITURE_DEFS[type].buffDesc}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Place Furniture ───────────────────────────────────────────────────── */}
      {house && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Place Furniture</div>
          {FURNITURE_ORDER.map(type => {
            const def      = FURNITURE_DEFS[type]
            const placed   = house.furniture.includes(type)
            const affordable = canAfford(type)
            return (
              <div
                key={type}
                style={S.furnitureCard(placed, affordable)}
                onClick={() => !placed && handlePlace(type)}
                onMouseEnter={e => {
                  if (!placed && affordable) {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#7c5cbf'
                    ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(124,92,191,0.12)'
                  }
                }}
                onMouseLeave={e => {
                  if (!placed && affordable) {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#333'
                    ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={S.furnitureName}>{def.name}</div>
                  {placed && <span style={S.placedBadge}>PLACED</span>}
                  {!placed && !affordable && <span style={S.noAffordBadge}>NEED MATS</span>}
                </div>
                <div style={S.furnitureBuff}>{def.buffDesc}</div>
                <div style={S.furnitureCost}>
                  Cost:{' '}
                  {def.cost.map(({ materialId, qty }, i) => {
                    const have = inventory.countMaterial(materialId)
                    const ok   = have >= qty
                    return (
                      <span key={materialId} style={{ color: ok ? '#888' : '#e53935' }}>
                        {i > 0 ? ', ' : ''}
                        {MAT_NAMES[materialId] ?? `mat#${materialId}`} ×{qty}
                        {' '}
                        <span style={{ color: ok ? '#4caf50' : '#e53935' }}>({have}/{qty})</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
