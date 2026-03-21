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
    // Tier 0 — Stone Age
    ['tool_use',            ['stone_tools']],           // stone_tools = "Stone Knapping"
    ['fire_making',         ['fire']],
    ['ranged_weapons',      ['bow_arrow', 'hunting']],
    ['agriculture',         ['agriculture']],
    ['navigation',          ['sailing']],
    ['carpentry',           ['wheel']],
    ['writing',             ['writing']],
    // Tier 1-2 — Bronze / Iron Age
    ['pottery',             ['pottery']],
    ['metallurgy',          ['metallurgy_copper']],
    ['smelting',            ['metallurgy_copper']],
    ['weapon_smithing',     ['bronze', 'iron_smelting', 'steel_making']],
    ['armor_smithing',      ['bronze', 'iron_smelting']],
    ['iron_smelting',       ['iron_smelting']],
    ['steel_making',        ['steel_making']],
    ['glassblowing',        ['glassblowing']],
    ['materials_science',   ['steel_making', 'iron_smelting']],
    // Tier 3-4 — Classical / Medieval
    ['mechanics',           ['engineering_classical']],
    ['wind_power',          ['wind_power']],
    ['hydraulics',          ['water_power']],
    ['optics',              ['optics_basic']],
    ['engineering',         ['engineering_classical']],
    // Tier 5 — Industrial
    ['thermodynamics',      ['thermodynamics_classical']],
    ['steam_power',         ['steam_engine']],
    ['chemistry',           ['industrial_chemistry']],
    ['electromagnetism',    ['electromagnetism_classical']],
    // Tier 6-7 — Modern
    ['nuclear_physics',     ['nuclear_fission']],
    ['semiconductor_physics',['transistor']],
    ['electronics',         ['transistor', 'integrated_circuit']],
    ['logic',               ['integrated_circuit']],
    ['aerospace',           ['rocketry']],
    ['AI',                  ['artificial_intelligence']],
    // Tier 8-9 — Post-Human / Transcendent
    ['plasma_physics',      ['nuclear_fusion']],
    ['fusion_power',        ['nuclear_fusion']],
    ['nanotechnology',      ['nanotechnology']],
    ['megastructure_engineering', ['megastructure']],
    ['dyson_sphere',        ['dyson_sphere_tech']],
    ['superintelligence',   ['agi']],
    ['matrioshka_brain',    ['matrioshka_brain_tech']],
    ['simulation_hypothesis',['universe_simulation_tech']],
    ['reality_engineering', ['physical_constants_control']],
    ['quantum_mechanics',   ['quantum_physics']],
    ['general_relativity',  ['relativity']],
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
    if (inventory.countMaterial(input.materialId) < input.quantity) return false
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

  const equipAction = usePlayerStore(s => s.equip)

  function handleCraft(andEquip = false) {
    if (!selectedRecipe) return
    // Sync the panel's tech-tree check with inventory's recipe discovery system.
    // If the panel shows this recipe as craftable, the player has the knowledge — mark it discovered.
    if (hasAllKnowledge(selectedRecipe)) inventory.discoverRecipe(selectedRecipe.id)
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
          {/* Craft & Equip — only shown for tool/weapon outputs (non-material) */}
          {!selectedRecipe.output.isMaterial && (
            <button
              onClick={() => handleCraft(true)}
              disabled={!canCraft(selectedRecipe, civTier)}
              style={{
                background: canCraft(selectedRecipe, civTier)
                  ? 'rgba(52,152,219,0.25)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${canCraft(selectedRecipe, civTier) ? '#3498db' : '#444'}`,
                borderRadius: 4,
                color: canCraft(selectedRecipe, civTier) ? '#3498db' : '#555',
                cursor: canCraft(selectedRecipe, civTier) ? 'pointer' : 'not-allowed',
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
