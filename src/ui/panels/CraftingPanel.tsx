// ── CraftingPanel ──────────────────────────────────────────────────────────────
// Recipe browser. Filters by available materials. Crafts on button click.

import { useState, useEffect } from 'react'
import { inventory, techTree } from '../../game/GameSingletons'
import { CRAFTING_RECIPES, MAT, ITEM, type CraftingRecipe } from '../../player/Inventory'
import { TECH_NODES } from '../../civilization/TechTree'
import { usePlayerStore } from '../../store/playerStore'
import { useUiStore } from '../../store/uiStore'

/** Map each knowledge string to the tech node IDs that unlock it */
const KNOWLEDGE_TO_TECH: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {}
  // Hand-coded mapping from recipe knowledgeRequired strings → tech node IDs
  const entries: [string, string[]][] = [
    ['tool_use',            ['stone_knapping']],
    ['fire_making',         ['fire']],
    ['ranged_weapons',      ['hunting']],
    ['pottery',             ['pottery']],
    ['metallurgy',          ['copper_smelting']],
    ['smelting',            ['copper_smelting']],
    ['weapon_smithing',     ['copper_smelting', 'iron_smelting', 'steel_making']],
    ['armor_smithing',      ['copper_smelting', 'iron_smelting']],
    ['agriculture',         ['agriculture']],
    ['navigation',          ['sailing']],
    ['carpentry',           ['wheel']],
    ['iron_smelting',       ['iron_smelting']],
    ['steel_making',        ['steel_making']],
    ['mechanics',           ['mechanics']],
    ['glassblowing',        ['glassblowing']],
    ['wind_power',          ['windmill']],
    ['hydraulics',          ['watermill']],
    ['writing',             ['writing']],
    ['optics',              ['optics']],
    ['thermodynamics',      ['steam_engine']],
    ['steam_power',         ['steam_engine']],
    ['engineering',         ['structural_engineering']],
    ['electromagnetism',    ['electromagnetism']],
    ['communication',       ['telegraph']],
    ['chemistry',           ['chemistry']],
    ['alchemy',             ['alchemy']],
    ['internal_combustion', ['internal_combustion']],
    ['aerodynamics',        ['aerodynamics']],
    ['electronics',         ['electronics']],
    ['nuclear_physics',     ['nuclear_fission']],
    ['semiconductor_physics',['transistor']],
    ['logic',               ['computer_science']],
    ['aerospace',           ['rocketry']],
    ['orbital_mechanics',   ['orbital_mechanics']],
    ['propulsion',          ['advanced_propulsion']],
    ['plasma_physics',      ['nuclear_fusion']],
    ['superconductivity',   ['superconductivity']],
    ['nanotechnology',      ['nanotechnology']],
    ['molecular_assembly',  ['molecular_assembly']],
    ['AI',                  ['artificial_intelligence']],
    ['quantum_mechanics',   ['quantum_computing']],
    ['cryogenics',          ['cryogenics']],
    ['exotic_matter',       ['exotic_matter']],
    ['general_relativity',  ['general_relativity']],
    ['fusion_power',        ['nuclear_fusion']],
    ['megastructure_engineering', ['megastructure_engineering']],
    ['stellar_engineering', ['stellar_engineering']],
    ['self_replicating_machines', ['von_neumann_probes']],
    ['computronium',        ['computronium']],
    ['dyson_sphere',        ['dyson_sphere']],
    ['superintelligence',   ['superintelligence']],
    ['matrioshka_brain',    ['matrioshka_brain']],
    ['simulation_hypothesis',['simulation_hypothesis']],
    ['reality_engineering', ['reality_engineering']],
    ['materials_science',   ['steel_making', 'iron_smelting']],
  ]
  for (const [k, nodes] of entries) map[k] = nodes
  return map
})()

function hasKnowledge(key: string): boolean {
  const techIds = KNOWLEDGE_TO_TECH[key]
  if (!techIds) return true  // unknown key — don't gate it
  return techIds.some(id => techTree.isResearched(id))
}

const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)
const ITEM_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

function hasAllKnowledge(recipe: CraftingRecipe): boolean {
  return recipe.knowledgeRequired.every(k => hasKnowledge(k))
}

function canCraft(recipe: CraftingRecipe, civTier: number): boolean {
  // God mode: all recipes craftable regardless of tier, knowledge, or materials
  if (inventory.isGodMode()) return true
  if (civTier < recipe.tier) return false
  if (!hasAllKnowledge(recipe)) return false
  for (const input of recipe.inputs) {
    const idx = inventory.findItem(input.materialId)
    if (idx === -1) return false
    const slot = inventory.getSlot(idx)
    if (!slot || slot.quantity < input.quantity) return false
  }
  return true
}

function isUnlocked(recipe: CraftingRecipe, civTier: number): boolean {
  if (inventory.isGodMode()) return true
  return civTier >= recipe.tier && hasAllKnowledge(recipe)
}

export function CraftingPanel() {
  const civTier = usePlayerStore(s => s.civTier)
  const addNotification = useUiStore(s => s.addNotification)
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
    if (effectiveFilter === 'available') return canCraft(r, civTier)
    return true
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
            const craftable = canCraft(r, civTier)
            const unlocked  = isUnlocked(r, civTier)
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
