// ── CraftingPanel ──────────────────────────────────────────────────────────────
// Recipe browser. Filters by available materials. Crafts on button click.

import { useState, useEffect } from 'react'
import { inventory, techTree } from '../../game/GameSingletons'
import { CRAFTING_RECIPES, MAT, ITEM, type CraftingRecipe } from '../../player/Inventory'
import { usePlayerStore } from '../../store/playerStore'
import { useUiStore } from '../../store/uiStore'

const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)
const ITEM_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

function canCraft(recipe: CraftingRecipe, civTier: number): boolean {
  if (civTier < recipe.tier) return false
  // Mirror the knowledge gate from Inventory.craft()
  if (recipe.knowledgeRequired.length > 0) {
    const known = new Set(inventory.getKnownRecipes())
    if (!known.has(recipe.id)) return false
  }
  for (const input of recipe.inputs) {
    const idx = inventory.findItem(input.materialId)
    if (idx === -1) return false
    const slot = inventory.getSlot(idx)
    if (!slot || slot.quantity < input.quantity) return false
  }
  return true
}

export function CraftingPanel() {
  const civTier = usePlayerStore(s => s.civTier)
  const addNotification = useUiStore(s => s.addNotification)
  const [, forceRefresh] = useState(0)
  const [filter, setFilter] = useState<'all' | 'available'>('available')

  // Poll every 200ms so recipe availability updates as materials are gathered
  useEffect(() => {
    const id = setInterval(() => forceRefresh(r => r + 1), 200)
    return () => clearInterval(id)
  }, [])
  const [selectedRecipe, setSelectedRecipe] = useState<CraftingRecipe | null>(null)

  const recipes = CRAFTING_RECIPES.filter(r => {
    if (filter === 'available') return canCraft(r, civTier)
    return r.tier <= civTier + 1 // show current + next tier
  })

  function handleCraft() {
    if (!selectedRecipe) return
    const ok = inventory.craft(selectedRecipe.id, civTier)
    if (ok) {
      addNotification(`Crafted: ${selectedRecipe.name}`, 'info')
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
        {/* Filter toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['available', 'all'] as const).map(f => (
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
            const craftable = canCraft(r, civTier)
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
                  opacity: craftable ? 1 : 0.5,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>{r.name}</div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                  Tier {r.tier} · {r.time}s ·{' '}
                  {r.inputs.map(inp => `${inp.quantity}× ${MAT_NAMES[inp.materialId] ?? inp.materialId}`).join(', ')}
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
            const idx = inventory.findItem(inp.materialId)
            const have = idx !== -1 ? (inventory.getSlot(idx)?.quantity ?? 0) : 0
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
            {selectedRecipe.output.quantity}× {ITEM_NAMES[selectedRecipe.output.itemId] ?? MAT_NAMES[selectedRecipe.output.itemId] ?? `id:${selectedRecipe.output.itemId}`}
          </div>

          <button
            onClick={handleCraft}
            disabled={!canCraft(selectedRecipe, civTier)}
            style={{
              marginTop: 8,
              background: canCraft(selectedRecipe, civTier)
                ? 'rgba(46,204,113,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${canCraft(selectedRecipe, civTier) ? '#2ecc71' : '#444'}`,
              borderRadius: 4,
              color: canCraft(selectedRecipe, civTier) ? '#2ecc71' : '#555',
              cursor: canCraft(selectedRecipe, civTier) ? 'pointer' : 'not-allowed',
              padding: '6px 0',
              fontSize: 12,
              fontFamily: 'monospace',
            }}
          >
            CRAFT
          </button>
        </div>
      )}
    </div>
  )
}
