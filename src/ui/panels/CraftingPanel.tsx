// ── CraftingPanel ──────────────────────────────────────────────────────────────
// M20: Recipe browser with search, tier-grouped sections, and craft animations.

import { useState, useEffect, useRef, useCallback } from 'react'
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

// ── Tier labels ─────────────────────────────────────────────────────────────
const TIER_NAMES: Record<number, string> = {
  0: 'Primitive',
  1: 'Stone Age',
  2: 'Bronze Age',
  3: 'Iron Age',
  4: 'Steel Age',
  5: 'Gunpowder Age',
  6: 'Industrial',
  7: 'Nuclear',
  8: 'Space Age',
  9: 'Interstellar',
  10: 'Transcendent',
}

function canCraft(recipe: CraftingRecipe): boolean {
  if (inventory.isGodMode()) return true
  for (const input of recipe.inputs) {
    if (inventory.countMaterial(input.materialId) < input.quantity) return false
  }
  return true
}

export function CraftingPanel() {
  const civTier = usePlayerStore(s => s.civTier)
  const addNotification = useUiStore(s => s.addNotification)
  void civTier
  const [, forceRefresh] = useState(0)
  const [filter, setFilter] = useState<'all' | 'available'>('available')
  const [search, setSearch] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<CraftingRecipe | null>(null)
  const [collapsedTiers, setCollapsedTiers] = useState<Set<number>>(new Set())
  const [craftFlash, setCraftFlash] = useState(false)
  const [floatingText, setFloatingText] = useState<string | null>(null)
  const godMode = inventory.isGodMode()
  const effectiveFilter = godMode ? 'available' : filter
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const id = setInterval(() => forceRefresh(r => r + 1), 200)
    return () => clearInterval(id)
  }, [])

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 150)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [search])

  const recipes = CRAFTING_RECIPES.filter(r => {
    if (effectiveFilter === 'available' && !canCraft(r)) return false
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      if (!r.name.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Group by tier
  const tiers = new Map<number, CraftingRecipe[]>()
  for (const r of recipes) {
    const list = tiers.get(r.tier) ?? []
    list.push(r)
    tiers.set(r.tier, list)
  }
  const sortedTiers = [...tiers.entries()].sort(([a], [b]) => a - b)

  const toggleTier = useCallback((tier: number) => {
    setCollapsedTiers(prev => {
      const next = new Set(prev)
      if (next.has(tier)) next.delete(tier)
      else next.add(tier)
      return next
    })
  }, [])

  const equipAction = usePlayerStore(s => s.equip)

  function handleCraft(andEquip = false) {
    if (!selectedRecipe) return
    inventory.discoverRecipe(selectedRecipe.id)
    const prevItems = inventory.listItems().map(e => e.index)
    const ok = inventory.craft(selectedRecipe.id, civTier)
    if (ok) {
      // Craft flash animation
      setCraftFlash(true)
      setFloatingText(`+1 ${selectedRecipe.name}`)
      setTimeout(() => setCraftFlash(false), 400)
      setTimeout(() => setFloatingText(null), 1200)

      // M22: Crafting XP — 15-50 based on recipe tier
      import('../../game/SkillSystem').then(m => {
        m.skillSystem.addXp('crafting', 15 + selectedRecipe.tier * 7)
        if (selectedRecipe.name.toLowerCase().includes('iron') || selectedRecipe.name.toLowerCase().includes('steel')) {
          m.skillSystem.addXp('smithing', 20 + selectedRecipe.tier * 5)
        }
      })
      addNotification(`Crafted: ${selectedRecipe.name}`, 'info')
      if (andEquip && !selectedRecipe.output.isMaterial) {
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
      addNotification('Cannot craft -- check materials', 'warning')
    }
    forceRefresh(r => r + 1)
  }

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace', display: 'flex', gap: 12, height: '100%' }}>
      {/* Recipe list */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Search + filter */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes..."
            style={{
              flex: 1,
              padding: '5px 10px',
              fontSize: 11,
              fontFamily: 'monospace',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              color: '#fff',
              outline: 'none',
            }}
          />
          {!godMode && (['available', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'rgba(52,152,219,0.3)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${filter === f ? 'rgba(52,152,219,0.6)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 4, color: filter === f ? '#3498db' : '#888',
                cursor: 'pointer', padding: '4px 10px', fontSize: 11,
                whiteSpace: 'nowrap',
              }}
            >
              {f === 'available' ? 'Craftable' : 'All'}
            </button>
          ))}
        </div>

        {recipes.length === 0 && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
            {debouncedSearch ? 'No matching recipes.' : filter === 'available' ? 'No craftable recipes right now.' : 'No recipes unlocked yet.'}
          </div>
        )}

        {/* Tier-grouped recipe list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedTiers.map(([tier, tierRecipes]) => {
            const isCollapsed = collapsedTiers.has(tier)
            const available = tierRecipes.filter(r => canCraft(r)).length
            return (
              <div key={tier}>
                {/* Tier header */}
                <div
                  onClick={() => toggleTier(tier)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    marginBottom: isCollapsed ? 0 : 4,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#cd4420' }}>
                    {isCollapsed ? '>' : 'v'} {TIER_NAMES[tier] ?? `Tier ${tier}`}
                  </span>
                  <span style={{ fontSize: 10, color: '#666' }}>
                    {available}/{tierRecipes.length}
                  </span>
                </div>

                {/* Recipes in this tier */}
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {tierRecipes.map(r => {
                      const craftable = canCraft(r)
                      const active = selectedRecipe?.id === r.id
                      return (
                        <div
                          key={r.id}
                          onClick={() => setSelectedRecipe(r)}
                          style={{
                            padding: '7px 10px',
                            background: active
                              ? craftFlash ? 'rgba(46,204,113,0.3)' : 'rgba(52,152,219,0.2)'
                              : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${active ? 'rgba(52,152,219,0.5)' : 'rgba(255,255,255,0.07)'}`,
                            borderRadius: 6,
                            cursor: 'pointer',
                            opacity: craftable ? 1 : 0.5,
                            transition: 'background 0.3s',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700 }}>
                            {r.name}
                          </div>
                          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                            {r.inputs.map(inp => `${inp.quantity}x ${MAT_NAMES[inp.materialId] ?? inp.materialId}`).join(', ')}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
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
          position: 'relative',
        }}>
          {/* Floating craft text */}
          {floatingText && (
            <div style={{
              position: 'absolute',
              top: -20,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 12,
              fontWeight: 700,
              color: '#2ecc71',
              animation: 'floatUp 1.2s ease-out forwards',
              pointerEvents: 'none',
            }}>
              {floatingText}
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedRecipe.name}</div>
          <div style={{ fontSize: 10, color: '#aaa' }}>
            {TIER_NAMES[selectedRecipe.tier] ?? `Tier ${selectedRecipe.tier}`}
          </div>

          <div style={{ fontSize: 11, color: '#ccc', marginTop: 4 }}>Requires:</div>
          {selectedRecipe.inputs.map((inp, i) => {
            const have = inventory.countMaterial(inp.materialId)
            const ok = have >= inp.quantity
            return (
              <div key={i} style={{ fontSize: 11, color: ok ? '#2ecc71' : '#e74c3c' }}>
                {inp.quantity}x {MAT_NAMES[inp.materialId] ?? inp.materialId}
                <span style={{ color: '#666' }}> ({have} owned)</span>
              </div>
            )
          })}

          <div style={{ fontSize: 11, color: '#ccc', marginTop: 4 }}>Produces:</div>
          <div style={{ fontSize: 11, color: '#f1c40f' }}>
            {selectedRecipe.output.quantity}x {selectedRecipe.output.isMaterial
              ? (MAT_NAMES[selectedRecipe.output.itemId] ?? `mat:${selectedRecipe.output.itemId}`)
              : (ITEM_NAMES[selectedRecipe.output.itemId] ?? `item:${selectedRecipe.output.itemId}`)}
          </div>

          {/* M8: Steel carburization hints */}
          {(selectedRecipe.id === 71 || selectedRecipe.id === 72 || selectedRecipe.id === 73) && (
            <div style={{
              marginTop: 6, padding: '4px 6px',
              background: 'rgba(74,158,255,0.08)', border: '1px solid rgba(74,158,255,0.25)',
              borderRadius: 3, fontSize: 9, color: '#88bbff', lineHeight: 1.5,
            }}>
              Blast furnace (1200 C+):<br/>
              1:4 charcoal = 0.8% C = steel<br/>
              1:2 charcoal = 2.4% C = cast iron<br/>
              Quench in water within 30s!
            </div>
          )}
          {(selectedRecipe.id === 74 || selectedRecipe.id === 75) && (
            <div style={{
              marginTop: 6, padding: '4px 6px',
              background: 'rgba(160,100,40,0.12)', border: '1px solid rgba(200,120,40,0.3)',
              borderRadius: 3, fontSize: 9, color: '#cc8844', lineHeight: 1.5,
            }}>
              Uses cast iron (brittle).<br/>
              Blast furnace at 1200 C,<br/>
              2 charcoal per iron ingot.
            </div>
          )}

          <button
            onClick={() => handleCraft(false)}
            disabled={!canCraft(selectedRecipe)}
            style={{
              marginTop: 8,
              background: canCraft(selectedRecipe) ? 'rgba(46,204,113,0.2)' : 'rgba(255,255,255,0.05)',
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
          {!selectedRecipe.output.isMaterial && (
            <button
              onClick={() => handleCraft(true)}
              disabled={!canCraft(selectedRecipe)}
              style={{
                background: canCraft(selectedRecipe) ? 'rgba(52,152,219,0.25)' : 'rgba(255,255,255,0.05)',
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

      {/* CSS animation for floating craft text */}
      <style>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-30px); }
        }
      `}</style>
    </div>
  )
}
