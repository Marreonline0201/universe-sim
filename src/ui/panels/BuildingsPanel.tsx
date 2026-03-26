// ── BuildingsPanel.tsx ────────────────────────────────────────────────────────
// M36 Track C: Settlement Building Upgrades
//
// Shows available buildings for the nearest settlement, their progress, and
// lets the player donate materials from their inventory.
//
// Opens when near a settlement (triggered by GameLoop proximity check).
// Tabs: [Under Construction] [Completed]

import { useState, useCallback } from 'react'
import { useSettlementStore } from '../../store/settlementStore'
import { useBuildingStore } from '../../store/buildingStore'
import { BUILDING_DEFS, ALL_BUILDING_TYPES, type BuildingType } from '../../game/BuildingSystem'
import { inventory } from '../../game/GameSingletons'
import { MAT } from '../../player/Inventory'

// ── Material label map ─────────────────────────────────────────────────────────

const MAT_LABELS: Record<number, string> = {
  [MAT.WOOD]:     'Wood',
  [MAT.STONE]:    'Stone',
  [MAT.IRON]:     'Iron',
  [MAT.COAL]:     'Coal',
  [MAT.ROPE]:     'Rope',
  [MAT.CLOTH]:    'Cloth',
  [MAT.MUSHROOM]: 'Mushroom',
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{
      width: '100%',
      height: 6,
      background: 'rgba(255,255,255,0.08)',
      borderRadius: 3,
      overflow: 'hidden',
      marginTop: 4,
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        background: pct >= 100 ? '#4caf50' : '#cd8820',
        transition: 'width 0.3s ease',
        borderRadius: 3,
      }} />
    </div>
  )
}

// ── Donate overlay ─────────────────────────────────────────────────────────────

interface DonateOverlayProps {
  settlementId: number
  settlementName: string
  buildingType: BuildingType
  onClose: () => void
}

function DonateOverlay({ settlementId, settlementName, buildingType, onClose }: DonateOverlayProps) {
  const def = BUILDING_DEFS[buildingType]
  const { donateToBuilding, getBuilding } = useBuildingStore()
  const building = getBuilding(settlementId, buildingType)

  const [feedback, setFeedback] = useState<string | null>(null)

  const handleDonate = useCallback((matId: number, qty: number) => {
    const donated = donateToBuilding(settlementId, settlementName, buildingType, matId, qty)
    if (donated) {
      setFeedback(`Donated ${qty}x ${MAT_LABELS[matId] ?? 'material'}!`)
      setTimeout(() => setFeedback(null), 2000)
    } else {
      const inInv = inventory.countMaterial(matId)
      if (inInv === 0) {
        setFeedback(`You have no ${MAT_LABELS[matId] ?? 'material'}.`)
      } else {
        setFeedback('Nothing more needed for that material.')
      }
      setTimeout(() => setFeedback(null), 2000)
    }
  }, [settlementId, settlementName, buildingType, donateToBuilding])

  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      borderRadius: 8,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#cd8820' }}>
          {def.icon} Donate to {def.name}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: 16,
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#aaa' }}>{def.description}</div>

      {feedback && (
        <div style={{
          padding: '6px 10px',
          background: 'rgba(205,136,32,0.2)',
          border: '1px solid rgba(205,136,32,0.4)',
          borderRadius: 4,
          fontSize: 11,
          color: '#cd8820',
        }}>
          {feedback}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {def.donationRequirements.map(req => {
          const donated  = building?.donated[req.matId] ?? 0
          const needed   = Math.max(0, req.qty - donated)
          const inInv    = inventory.countMaterial(req.matId)
          const canGive  = Math.min(inInv, needed)
          const pct      = Math.floor((donated / req.qty) * 100)

          return (
            <div key={req.matId} style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 6,
              padding: '8px 10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: '#ddd' }}>{req.label}</span>
                <span style={{ color: '#888' }}>{donated}/{req.qty}</span>
              </div>
              <ProgressBar pct={pct} />
              {needed > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: '#888', flex: 1 }}>
                    You have: {inInv}
                  </span>
                  {([1, 5, canGive] as const).filter((n, i, a) => n > 0 && a.indexOf(n) === i).map(n => (
                    <button
                      key={n}
                      onClick={() => handleDonate(req.matId, n)}
                      disabled={inInv < n}
                      style={{
                        padding: '3px 8px',
                        fontSize: 10,
                        fontFamily: 'monospace',
                        background: inInv >= n ? 'rgba(205,136,32,0.2)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${inInv >= n ? 'rgba(205,136,32,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 4,
                        color: inInv >= n ? '#cd8820' : '#444',
                        cursor: inInv >= n ? 'pointer' : 'not-allowed',
                      }}
                    >
                      +{n}
                    </button>
                  ))}
                </div>
              )}
              {needed === 0 && (
                <div style={{ fontSize: 10, color: '#4caf50', marginTop: 4 }}>Complete</div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 10, color: '#666', marginTop: 'auto' }}>
        Benefit: {def.benefit}
      </div>
    </div>
  )
}

// ── Building card ──────────────────────────────────────────────────────────────

interface BuildingCardProps {
  settlementId: number
  settlementName: string
  type: BuildingType
  onDonate: (type: BuildingType) => void
}

function BuildingCard({ settlementId, type, settlementName, onDonate }: BuildingCardProps) {
  const def = BUILDING_DEFS[type]
  const pct = useBuildingStore(s => s.getBuildingProgress(settlementId, type))
  const done = useBuildingStore(s => s.isBuildingComplete(settlementId, type))

  return (
    <div style={{
      background: done ? 'rgba(76,175,80,0.08)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${done ? 'rgba(76,175,80,0.3)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 6,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: done ? '#4caf50' : '#ddd' }}>
          {def.icon} {def.name}
        </div>
        {done
          ? <span style={{ fontSize: 10, color: '#4caf50' }}>BUILT</span>
          : <span style={{ fontSize: 10, color: '#888' }}>{pct}%</span>
        }
      </div>

      <div style={{ fontSize: 10, color: '#888' }}>{def.description}</div>

      {!done && (
        <>
          <ProgressBar pct={pct} />
          <button
            onClick={() => onDonate(type)}
            style={{
              marginTop: 4,
              padding: '4px 10px',
              fontSize: 10,
              fontFamily: 'monospace',
              background: 'rgba(205,136,32,0.2)',
              border: '1px solid rgba(205,136,32,0.5)',
              borderRadius: 4,
              color: '#cd8820',
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            Donate Materials
          </button>
        </>
      )}

      {done && (
        <div style={{ fontSize: 10, color: '#4caf50', marginTop: 2 }}>
          {def.benefit}
        </div>
      )}
    </div>
  )
}

// ── BuildingsPanel ─────────────────────────────────────────────────────────────

interface BuildingsPanelProps {
  settlementId: number
  onClose: () => void
}

export function BuildingsPanel({ settlementId, onClose }: BuildingsPanelProps) {
  const settlement = useSettlementStore(s => s.settlements.get(settlementId))
  const getAvailableBuildings = useBuildingStore(s => s.getAvailableBuildings)
  const [donatingType, setDonatingType] = useState<BuildingType | null>(null)
  const [tab, setTab] = useState<'available' | 'completed'>('available')

  if (!settlement) return null

  const civLevel = settlement.civLevel
  const availableTypes = getAvailableBuildings(civLevel)
  const completedTypes = useBuildingStore.getState().getCompletedBuildings(settlementId)

  const tabTypes = tab === 'available'
    ? availableTypes.filter(t => !useBuildingStore.getState().isBuildingComplete(settlementId, t))
    : completedTypes

  return (
    <div style={{
      position: 'relative',
      color: '#fff',
      fontFamily: 'monospace',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 10,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 10,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#cd8820' }}>
            {settlement.name} — Buildings
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
            Settlement Tier {civLevel}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['available', 'completed'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '4px 12px',
              fontSize: 10,
              fontFamily: 'monospace',
              background: tab === t ? 'rgba(205,136,32,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${tab === t ? 'rgba(205,136,32,0.5)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 4,
              color: tab === t ? '#cd8820' : '#888',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {t === 'available' ? 'Under Construction' : `Completed (${completedTypes.length})`}
          </button>
        ))}
      </div>

      {/* Building list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1 }}>
        {tabTypes.length === 0 ? (
          <div style={{ fontSize: 11, color: '#666', padding: '10px 0' }}>
            {tab === 'available'
              ? 'All available buildings are complete!'
              : 'No buildings completed yet. Donate materials to help build.'}
          </div>
        ) : (
          tabTypes.map(type => (
            <BuildingCard
              key={type}
              settlementId={settlementId}
              settlementName={settlement.name}
              type={type}
              onDonate={setDonatingType}
            />
          ))
        )}
      </div>

      {/* Donate overlay (shown over the panel) */}
      {donatingType && (
        <DonateOverlay
          settlementId={settlementId}
          settlementName={settlement.name}
          buildingType={donatingType}
          onClose={() => setDonatingType(null)}
        />
      )}
    </div>
  )
}
