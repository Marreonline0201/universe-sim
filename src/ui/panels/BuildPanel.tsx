// ── BuildPanel ──────────────────────────────────────────────────────────────────
// Lists building types unlocked by tech tree. Clicking a building enters
// placement mode: a ghost footprint appears 6m ahead of the player.
// Press F to confirm placement; press B or Escape to cancel.

import { useState, useEffect } from 'react'
import { BUILDING_TYPES, type BuildingType } from '../../civilization/BuildingSystem'
import { inventory, buildingSystem } from '../../game/GameSingletons'
import { useGameStore } from '../../store/gameStore'
import { useUiStore } from '../../store/uiStore'
import { usePlayerStore } from '../../store/playerStore'
import { MAT } from '../../player/Inventory'

const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

function isTierUnlocked(_tier: number): boolean {
  return true
}

function canAfford(bt: BuildingType): boolean {
  return bt.materialsRequired.every(req =>
    inventory.countMaterial(req.materialId) >= req.quantity
  )
}

const TIER_LABELS = [
  'Stone Age', 'Bronze Age', 'Iron Age', 'Classical', 'Medieval',
  'Industrial', 'Modern', 'Information', 'Fusion', 'Simulation',
]

const TIER_COLORS = [
  '#888', '#b87333', '#7a6a6a', '#c4a44a', '#5a7ab8',
  '#9a7040', '#3a9a5a', '#3a7ab8', '#7a3ab8', '#b83a7a',
]

export function BuildPanel() {
  const [, forceRefresh] = useState(0)
  const [selectedTier, setSelectedTier] = useState<number | null>(null)
  const placementMode = useGameStore(s => s.placementMode)
  const setPlacementMode = useGameStore(s => s.setPlacementMode)
  const closePanel = useUiStore(s => s.closePanel)
  const addNotification = useUiStore(s => s.addNotification)
  const civTier = usePlayerStore(s => s.civTier)

  // Poll so material counts stay current
  useEffect(() => {
    const id = setInterval(() => forceRefresh(r => r + 1), 300)
    return () => clearInterval(id)
  }, [])

  function handlePlace(bt: BuildingType) {
    if (!canAfford(bt)) {
      addNotification(`Need: ${bt.materialsRequired.map(r => `${r.quantity}× ${MAT_NAMES[r.materialId] ?? r.materialId}`).join(', ')}`, 'warning')
      return
    }
    setPlacementMode(bt.id)
    closePanel()
    // Re-acquire pointer lock so F key works immediately (panel exit releases it)
    setTimeout(() => {
      try {
        const canvas = document.querySelector('canvas')
        if (canvas) {
          canvas.requestPointerLock()
        } else {
          document.body.requestPointerLock()
        }
      } catch (err) {
        console.warn('[BuildPanel] Failed to request pointer lock:', err)
      }
    }, 150)
  }

  function handleCancel() {
    setPlacementMode(null)
  }

  // Group buildings by tier — show current tier and below, plus any higher tier already tech-unlocked
  const visibleTiers = Array.from(
    new Set(BUILDING_TYPES.map(b => b.tier))
  ).sort((a, b) => a - b).filter(t => t <= civTier || isTierUnlocked(t))

  const tiersToShow = selectedTier !== null ? [selectedTier] : visibleTiers

  const placed = buildingSystem.getAllBuildings()

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Placement mode status */}
      {placementMode && (
        <div style={{
          background: 'rgba(52,152,219,0.2)', border: '1px solid #3498db',
          borderRadius: 6, padding: '8px 12px', fontSize: 12,
        }}>
          <div style={{ fontWeight: 700, color: '#3498db', marginBottom: 4 }}>PLACEMENT MODE ACTIVE</div>
          <div style={{ color: '#aaa', fontSize: 11 }}>
            {BUILDING_TYPES.find(b => b.id === placementMode)?.name}
          </div>
          <div style={{ color: '#888', fontSize: 10, marginTop: 4 }}>
            Look at desired spot · Press <b style={{ color: '#fff' }}>F</b> to place · <b style={{ color: '#fff' }}>Esc</b> to cancel
          </div>
          <button
            onClick={handleCancel}
            style={{
              marginTop: 8, background: 'rgba(231,76,60,0.2)',
              border: '1px solid #e74c3c', borderRadius: 4,
              color: '#e74c3c', cursor: 'pointer', fontSize: 11,
              padding: '3px 10px', fontFamily: 'monospace',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Placed buildings count */}
      {placed.length > 0 && (
        <div style={{ fontSize: 11, color: '#555', paddingLeft: 2 }}>
          {placed.length} building{placed.length !== 1 ? 's' : ''} placed
        </div>
      )}

      {/* Tier filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <button
          onClick={() => setSelectedTier(null)}
          style={{
            fontSize: 9, padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
            background: selectedTier === null ? 'rgba(52,152,219,0.3)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${selectedTier === null ? '#3498db' : '#333'}`,
            color: selectedTier === null ? '#3498db' : '#888',
          }}
        >All</button>
        {visibleTiers.map(t => (
          <button
            key={t}
            onClick={() => setSelectedTier(selectedTier === t ? null : t)}
            style={{
              fontSize: 9, padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
              background: selectedTier === t ? 'rgba(52,152,219,0.3)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${selectedTier === t ? '#3498db' : '#333'}`,
              color: selectedTier === t ? '#3498db' : '#888',
            }}
          >T{t}</button>
        ))}
      </div>

      {/* Building list by tier */}
      {tiersToShow.map(tier => {
        const buildings = BUILDING_TYPES.filter(b => b.tier === tier)
        const tierUnlocked = isTierUnlocked(tier)
        return (
          <div key={tier}>
            <div style={{
              fontSize: 10, color: TIER_COLORS[tier] ?? '#888',
              letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase',
            }}>
              Tier {tier} — {TIER_LABELS[tier]}
              {!tierUnlocked && <span style={{ color: '#555', marginLeft: 8 }}>🔒 locked</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {buildings.map(bt => {
                const affordable = canAfford(bt)
                const unlocked = tierUnlocked
                const isPlacing = placementMode === bt.id
                return (
                  <div
                    key={bt.id}
                    style={{
                      padding: '8px 10px',
                      background: isPlacing ? 'rgba(52,152,219,0.2)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isPlacing ? '#3498db' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: 6,
                      opacity: unlocked ? 1 : 0.35,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>
                          {!unlocked && <span style={{ color: '#444' }}>🔒 </span>}
                          {bt.name}
                        </div>
                        <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>
                          {bt.size[0]}×{bt.size[2]}m · {bt.provides.join(', ')}
                        </div>
                      </div>
                      {unlocked && (
                        <button
                          onClick={() => handlePlace(bt)}
                          style={{
                            flexShrink: 0,
                            background: affordable ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${affordable ? '#2ecc71' : '#444'}`,
                            borderRadius: 4,
                            color: affordable ? '#2ecc71' : '#555',
                            cursor: 'pointer',
                            padding: '3px 8px',
                            fontSize: 10,
                            fontFamily: 'monospace',
                          }}
                        >
                          BUILD
                        </button>
                      )}
                    </div>

                    {/* Material requirements */}
                    <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {bt.materialsRequired.map((req, i) => {
                        const have = inventory.countMaterial(req.materialId)
                        const ok = have >= req.quantity
                        return (
                          <span
                            key={i}
                            style={{
                              fontSize: 9,
                              color: ok ? '#2ecc71' : unlocked ? '#e74c3c' : '#555',
                              background: 'rgba(255,255,255,0.04)',
                              padding: '1px 5px',
                              borderRadius: 3,
                            }}
                          >
                            {req.quantity}× {MAT_NAMES[req.materialId] ?? `mat:${req.materialId}`}
                            <span style={{ color: '#555' }}> ({have})</span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {tiersToShow.length === 0 && (
        <div style={{ color: '#555', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
          Research technologies to unlock buildings.
        </div>
      )}

      {/* Placed buildings list */}
      {placed.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>
            Placed Buildings
          </div>
          {placed.map(b => {
            const bt = BUILDING_TYPES.find(t => t.id === b.typeId)
            return (
              <div key={b.id} style={{
                padding: '5px 8px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 4,
                fontSize: 11,
                marginBottom: 3,
                display: 'flex',
                justifyContent: 'space-between',
              }}>
                <span>{bt?.name ?? b.typeId}</span>
                <span style={{ color: b.health > 60 ? '#2ecc71' : b.health > 30 ? '#f1c40f' : '#e74c3c', fontSize: 10 }}>
                  {b.health.toFixed(0)}% HP
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
