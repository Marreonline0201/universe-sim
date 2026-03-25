// ── CraftingPanel ──────────────────────────────────────────────────────────────
// Recipe browser. Filters by available materials. Crafts on button click.

import { useState, useEffect } from 'react'
import { inventory } from '../../game/GameSingletons'
import { CRAFTING_RECIPES, MAT, ITEM, type CraftingRecipe } from '../../player/Inventory'
import { usePlayerStore } from '../../store/playerStore'
import { useUiStore } from '../../store/uiStore'

const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)
const ITEM_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

function canCraft(recipe: CraftingRecipe): boolean {
  if (inventory.isGodMode()) return true
  for (const input of recipe.inputs) {
    if (inventory.countMaterial(input.materialId) < input.quantity) return false
  }
  return true
}

function isUnlocked(_recipe: CraftingRecipe): boolean {
  return true
}

export function CraftingPanel() {
  const civTier = usePlayerStore(s => s.civTier)
  const addNotification = useUiStore(s => s.addNotification)
  void civTier  // civTier kept for inventory.craft() compatibility
  const [, forceRefresh] = useState(0)
  const [filter, setFilter] = useState<'all' | 'available'>('available')
  const godMode = inventory.isGodMode()
  // In god mode, override filter to show all (every recipe becomes craftable)
  const effectiveFilter = godMode ? 'available' : filter

  // Poll every 200ms so recipe availability updates as materials are gathered
  useEffect(() => {
    const id = setInterval(() => forceRefresh(r => r + 1), 200)
    return () => clearInterval(id)
  }, [])
  const [selectedRecipe, setSelectedRecipe] = useState<CraftingRecipe | null>(null)

  const recipes = CRAFTING_RECIPES.filter(r => {
    if (effectiveFilter === 'available') return canCraft(r)
    return true
  })

  const equipAction = usePlayerStore(s => s.equip)

  function handleCraft(andEquip = false) {
    if (!selectedRecipe) return
    inventory.discoverRecipe(selectedRecipe.id)
    const prevCount = inventory.slotCount
    const prevItems = inventory.listItems().map(e => e.index)
    const ok = inventory.craft(selectedRecipe.id, civTier)
    if (ok) {
      addNotification(`Crafted: ${selectedRecipe.name}`, 'info')
      // If "Craft & Equip" was requested, find the newly added item slot and equip it
      if (andEquip && !selectedRecipe.output.isMaterial) {
        // The crafted item lands in the first new or changed slot — find it
        for (let i = 0; i < inventory.slotCount; i++) {
          const slot = inventory.getSlot(i)
          if (slot && slot.itemId === selectedRecipe.output.itemId && !prevItems.includes(i)) {
            equipAction(i)
            addNotification(`Equipped: ${selectedRecipe.name}`, 'info')
            break
          }
        }
      }
      setSelectedRecipe(null)
    } else {
      addNotification('Cannot craft — check materials', 'warning')
    }
    forceRefresh(r => r + 1)
  }

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace', display: 'flex', gap: 12, height: '100%' }}>
      {/* Recipe list */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Filter toggle — hidden in god mode (all recipes always craftable) */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {!godMode && (['available', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'rgba(52,152,219,0.3)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${filter === f ? 'rgba(52,152,219,0.6)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 4, color: filter === f ? '#3498db' : '#888',
                cursor: 'pointer', padding: '4px 10px', fontSize: 11,
              }}
            >
              {f === 'available' ? 'Craftable' : 'All known'}
            </button>
          ))}
        </div>

        {recipes.length === 0 && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
            {filter === 'available' ? 'No craftable recipes right now.' : 'No recipes unlocked yet.'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {recipes.map(r => {
            const craftable = canCraft(r)
            const unlocked  = isUnlocked(r)
            const active = selectedRecipe?.id === r.id
            return (
              <div
                key={r.id}
                onClick={() => setSelectedRecipe(r)}
                style={{
                  padding: '8px 10px',
                  background: active ? 'rgba(52,152,219,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? 'rgba(52,152,219,0.5)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  opacity: craftable ? 1 : unlocked ? 0.65 : 0.3,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  {!unlocked && <span style={{ color: '#555' }}>🔒 </span>}
                  {r.name}
                </div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                  Tier {r.tier} · {r.inputs.map(inp => `${inp.quantity}× ${MAT_NAMES[inp.materialId] ?? inp.materialId}`).join(', ')}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right: selected recipe detail + craft button */}
      {selectedRecipe && (
        <div style={{
          width: 160,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedRecipe.name}</div>
          <div style={{ fontSize: 10, color: '#aaa' }}>Tier {selectedRecipe.tier}</div>

          <div style={{ fontSize: 11, color: '#ccc', marginTop: 4 }}>Requires:</div>
          {selectedRecipe.inputs.map((inp, i) => {
            const have = inventory.countMaterial(inp.materialId)
            const ok = have >= inp.quantity
            return (
              <div key={i} style={{ fontSize: 11, color: ok ? '#2ecc71' : '#e74c3c' }}>
                {inp.quantity}× {MAT_NAMES[inp.materialId] ?? inp.materialId}
                <span style={{ color: '#666' }}> ({have} owned)</span>
              </div>
            )
          })}

          <div style={{ fontSize: 11, color: '#ccc', marginTop: 4 }}>Produces:</div>
          <div style={{ fontSize: 11, color: '#f1c40f' }}>
            {selectedRecipe.output.quantity}× {selectedRecipe.output.isMaterial
              ? (MAT_NAMES[selectedRecipe.output.itemId] ?? `mat:${selectedRecipe.output.itemId}`)
              : (ITEM_NAMES[selectedRecipe.output.itemId] ?? `item:${selectedRecipe.output.itemId}`)}
          </div>

          {/* M8: Steel carburization ratio hint — shown for steel/cast-iron recipes */}
          {(selectedRecipe.id === 71 || selectedRecipe.id === 72 || selectedRecipe.id === 73) && (
            <div style={{
              marginTop: 6,
              padding: '4px 6px',
              background: 'rgba(74,158,255,0.08)',
              border: '1px solid rgba(74,158,255,0.25)',
              borderRadius: 3,
              fontSize: 9,
              color: '#88bbff',
              lineHeight: 1.5,
            }}>
              Blast furnace (1200°C+):<br/>
              1:4 charcoal = 0.8% C → steel<br/>
              1:2 charcoal = 2.4% C → cast iron<br/>
              Quench in water within 30s!
            </div>
          )}
          {(selectedRecipe.id === 74 || selectedRecipe.id === 75) && (
            <div style={{
              marginTop: 6,
              padding: '4px 6px',
              background: 'rgba(160,100,40,0.12)',
              border: '1px solid rgba(200,120,40,0.3)',
              borderRadius: 3,
              fontSize: 9,
              color: '#cc8844',
              lineHeight: 1.5,
            }}>
              Uses cast iron (brittle).<br/>
              Blast furnace at 1200°C,<br/>
              2 charcoal per iron ingot.
            </div>
          )}

          <button
            onClick={() => handleCraft(false)}
            disabled={!canCraft(selectedRecipe)}
            style={{
              marginTop: 8,
              background: canCraft(selectedRecipe)
                ? 'rgba(46,204,113,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${canCraft(selectedRecipe) ? '#2ecc71' : '#444'}`,
              borderRadius: 4,
              color: canCraft(selectedRecipe) ? '#2ecc71' : '#555',
              cursor: canCraft(selectedRecipe) ? 'pointer' : 'not-allowed',
              padding: '6px 0',
              fontSize: 12,
              fontFamily: 'monospace',
            }}
          >
            CRAFT
          </button>
          {/* Craft & Equip — only shown for tool/weapon outputs (non-material) */}
          {!selectedRecipe.output.isMaterial && (
            <button
              onClick={() => handleCraft(true)}
              disabled={!canCraft(selectedRecipe)}
              style={{
                background: canCraft(selectedRecipe)
                  ? 'rgba(52,152,219,0.25)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${canCraft(selectedRecipe) ? '#3498db' : '#444'}`,
                borderRadius: 4,
                color: canCraft(selectedRecipe) ? '#3498db' : '#555',
                cursor: canCraft(selectedRecipe) ? 'pointer' : 'not-allowed',
                padding: '6px 0',
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            >
              CRAFT + EQUIP
            </button>
          )}
        </div>
      )}
    </div>
  )
}
