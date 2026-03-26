// ── CraftingPanel ──────────────────────────────────────────────────────────────
// M20: Recipe browser with search, tier-grouped sections, and craft animations.
// M37: Added Alchemy tab for potion brewing, transmutation, and enchanting.
// M46: Recipe unlock system — skill-gated and discovery-gated recipes shown dimmed.

import { useState, useEffect, useRef, useCallback } from 'react'
import { inventory, questSystem } from '../../game/GameSingletons'
import { skillSystem } from '../../game/SkillSystem'
import { isRecipeUnlocked, getUnlockDescription } from '../../game/RecipeUnlockSystem'
import { MAT, ITEM, rollCraftRarity, RARITY_NAMES, type CraftingRecipe, type RarityTier } from '../../player/Inventory'
import { CRAFTING_RECIPES } from '../../player/CraftingRecipes'
import { usePlayerStore } from '../../store/playerStore'
import { useUiStore } from '../../store/uiStore'
import { useSettlementQuestStore } from '../../store/settlementQuestStore'
import { ENCHANTS, applyEnchant, activeWeaponEnchant, activeArmorEnchant, type Enchant } from '../../game/EnchantSystem'
import { usePlayerStatsStore } from '../../store/playerStatsStore'
import { checkNewTitles } from '../../game/TitleSystem'

const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)
const ITEM_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

// ── M38 Track C: Biome source icons for ingredients ─────────────────────────
const BIOME_MAT_ICONS: Partial<Record<number, { icon: string; label: string }>> = {
  [MAT.VOLCANIC_GLASS]:  { icon: '🌋', label: 'Volcano' },
  [MAT.GLACIER_ICE]:     { icon: '🧊', label: 'Tundra'  },
  [MAT.DESERT_CRYSTAL]:  { icon: '🏜', label: 'Desert'  },
  [MAT.DEEP_CORAL]:      { icon: '🌊', label: 'Ocean'   },
  [MAT.ANCIENT_WOOD]:    { icon: '🌲', label: 'Forest'  },
  [MAT.SHADOW_IRON]:     { icon: '⛏', label: 'Cave'    },
  [MAT.LUMINITE]:        { icon: '⛏', label: 'Cave'    },
}

// Tier badge color for recipes
function getTierBadge(tier: number): { color: string; label: string } | null {
  if (tier === 4) return { color: '#ffd700', label: 'T4' }
  if (tier >= 5) return { color: '#cc88ff', label: 'T5' }
  return null
}

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

type PanelTab = 'crafting' | 'alchemy'

export function CraftingPanel() {
  const civTier = usePlayerStore(s => s.civTier)
  const addNotification = useUiStore(s => s.addNotification)
  void civTier
  const [, forceRefresh] = useState(0)
  const [activeTab, setActiveTab] = useState<PanelTab>('crafting')
  const [filter, setFilter] = useState<'all' | 'available'>('available')
  const [search, setSearch] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<CraftingRecipe | null>(null)
  const [collapsedTiers, setCollapsedTiers] = useState<Set<number>>(new Set())
  const [showUnlockedOnly, setShowUnlockedOnly] = useState(false)
  const [craftFlash, setCraftFlash] = useState(false)
  const [floatingText, setFloatingText] = useState<string | null>(null)
  const [enchantNotice, setEnchantNotice] = useState<string | null>(null)
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

  // Skill level getter to pass into isRecipeUnlocked
  const getSkillLevel = (skillId: string): number => skillSystem.getLevel(skillId as Parameters<typeof skillSystem.getLevel>[0])

  const recipes = CRAFTING_RECIPES.filter(r => {
    // Alchemy tab shows only alchemy recipes; crafting tab excludes them
    if (activeTab === 'alchemy' && !r.requiresAlchemyTable) return false
    if (activeTab === 'crafting' && r.requiresAlchemyTable) return false
    if (effectiveFilter === 'available' && !canCraft(r)) return false
    if (showUnlockedOnly && !isRecipeUnlocked(r.id, getSkillLevel)) return false
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
    const ok = inventory.craft(selectedRecipe, civTier)
    if (ok) {
      // M23: Roll rarity for the crafted item based on recipe tier + crafting skill
      const craftLevel = skillSystem.getLevel('crafting')
      const rarity = rollCraftRarity(selectedRecipe.tier, craftLevel) as RarityTier
      // Find the newly crafted slot (not in prevItems) and assign rarity
      if (rarity > 0) {
        for (let i = 0; i < inventory.slotCount; i++) {
          if (!prevItems.includes(i)) {
            const newSlot = inventory.getSlot(i)
            if (newSlot) { newSlot.rarity = rarity }
            break
          }
        }
      }

      // M23: Quest progress on craft
      questSystem.onCraft(selectedRecipe.id)
      // M33: Settlement quest board progress on craft
      {
        const sqStore = useSettlementQuestStore.getState()
        const active = sqStore.getActiveQuests()
        for (const q of active) {
          if (q.type === 'craft' && (q.targetId === 0 || q.targetId === selectedRecipe.id)) {
            sqStore.updateProgress(q.id, 1)
            const updated = useSettlementQuestStore.getState().quests[q.id]
            if (updated && updated.progress >= updated.targetCount) {
              sqStore.completeQuest(q.id)
              usePlayerStore.getState().addGold(q.reward.gold)
              skillSystem.addXp('crafting', q.reward.xp)
              useUiStore.getState().addNotification(
                `Quest Complete: "${q.title}" +${q.reward.xp} XP +${q.reward.gold} gold`,
                'discovery'
              )
            }
          }
        }
      }

      // Craft flash animation
      setCraftFlash(true)
      const rarityLabel = rarity > 0 ? ` [${RARITY_NAMES[rarity]}]` : ''
      setFloatingText(`+1 ${selectedRecipe.name}${rarityLabel}`)
      setTimeout(() => setCraftFlash(false), 400)
      setTimeout(() => setFloatingText(null), 1200)
      // M37 Track C: Track craft stat + check titles
      usePlayerStatsStore.getState().incrementStat('itemsCrafted')
      checkNewTitles()

      // M22: Crafting XP — 15-50 based on recipe tier
      import('../../game/SkillSystem').then(m => {
        m.skillSystem.addXp('crafting', 15 + selectedRecipe.tier * 7)
        if (selectedRecipe.name.toLowerCase().includes('iron') || selectedRecipe.name.toLowerCase().includes('steel')) {
          m.skillSystem.addXp('smithing', 20 + selectedRecipe.tier * 5)
        }
      })
      addNotification(`Crafted: ${selectedRecipe.name}${rarityLabel}`, 'info')
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

  function handleEnchant(enchant: Enchant) {
    const ok = applyEnchant(enchant)
    if (ok) {
      const def = ENCHANTS[enchant]
      setEnchantNotice(`Enchanted: ${def.name} — ${def.effect}`)
      addNotification(`Enchanted weapon/armor: ${def.name}`, 'info')
      setTimeout(() => setEnchantNotice(null), 3000)
      forceRefresh(r => r + 1)
    } else {
      addNotification('Not enough materials to enchant', 'warning')
    }
  }

  const MAT_NAMES_LOCAL: Record<number, string> = Object.fromEntries(
    Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
  )

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Tab header */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['crafting', 'alchemy'] as PanelTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSelectedRecipe(null) }}
            style={{
              background: activeTab === tab ? 'rgba(180,100,220,0.25)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${activeTab === tab ? 'rgba(180,100,220,0.7)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 4,
              color: activeTab === tab ? '#c87dff' : '#888',
              cursor: 'pointer',
              padding: '4px 14px',
              fontSize: 12,
              fontFamily: 'monospace',
            }}
          >
            {tab === 'crafting' ? 'Crafting' : '🧪 Alchemy'}
          </button>
        ))}
      </div>

      {/* Main content area */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>

      {/* Recipe list */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
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
          <button
            onClick={() => setShowUnlockedOnly(v => !v)}
            title={showUnlockedOnly ? 'Show all recipes (including locked)' : 'Hide locked recipes'}
            style={{
              background: showUnlockedOnly ? 'rgba(200,100,255,0.25)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showUnlockedOnly ? 'rgba(200,100,255,0.6)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 4,
              color: showUnlockedOnly ? '#c87dff' : '#888',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            {showUnlockedOnly ? 'Unlocked' : 'All'}
          </button>
        </div>

        {recipes.length === 0 && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
            {debouncedSearch
              ? 'No matching recipes.'
              : filter === 'available'
                ? 'No craftable recipes right now.'
                : showUnlockedOnly
                  ? 'No unlocked recipes match this filter.'
                  : 'No recipes found.'}
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
                      const unlocked = isRecipeUnlocked(r.id, getSkillLevel)
                      const lockDesc = getUnlockDescription(r.id)
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
                            // Locked recipes are visually dimmed but still visible
                            opacity: !unlocked ? 0.38 : craftable ? 1 : 0.5,
                            transition: 'background 0.3s',
                            filter: !unlocked ? 'grayscale(0.6)' : undefined,
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                            {!unlocked && (
                              <span title={lockDesc ?? 'Locked'} style={{ fontSize: 11, color: '#888' }}>🔒</span>
                            )}
                            {r.name}
                            {r.requiresCampfire && (
                              <span title="Requires campfire" style={{ fontSize: 10, color: '#f39c12', opacity: 0.85 }}>🔥</span>
                            )}
                            {r.requiresAlchemyTable && (
                              <span title="Requires alchemy table" style={{ fontSize: 10, color: '#c87dff', opacity: 0.85 }}>🧪</span>
                            )}
                            {(() => {
                              const badge = getTierBadge(r.tier)
                              return badge ? (
                                <span title={`Tier ${r.tier} recipe`} style={{
                                  fontSize: 9, color: badge.color,
                                  border: `1px solid ${badge.color}`,
                                  borderRadius: 3, padding: '0 3px', opacity: 0.9,
                                }}>{badge.label}</span>
                              ) : null
                            })()}
                          </div>
                          {!unlocked && lockDesc ? (
                            <div style={{ fontSize: 9, color: '#c87dff', marginTop: 2, opacity: 0.85 }}>
                              {lockDesc}
                            </div>
                          ) : (
                            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                              {r.inputs.map(inp => `${inp.quantity}x ${MAT_NAMES[inp.materialId] ?? inp.materialId}`).join(', ')}
                            </div>
                          )}
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

          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {!isRecipeUnlocked(selectedRecipe.id, getSkillLevel) && (
              <span style={{ marginRight: 4 }}>🔒</span>
            )}
            {selectedRecipe.name}
          </div>
          <div style={{ fontSize: 10, color: '#aaa' }}>
            {TIER_NAMES[selectedRecipe.tier] ?? `Tier ${selectedRecipe.tier}`}
          </div>
          {!isRecipeUnlocked(selectedRecipe.id, getSkillLevel) && getUnlockDescription(selectedRecipe.id) && (
            <div style={{
              fontSize: 10, color: '#c87dff',
              background: 'rgba(180,100,255,0.1)',
              border: '1px solid rgba(180,100,255,0.3)',
              borderRadius: 3, padding: '3px 6px', marginTop: 2,
            }}>
              {getUnlockDescription(selectedRecipe.id)}
            </div>
          )}

          <div style={{ fontSize: 11, color: '#ccc', marginTop: 4 }}>Requires:</div>
          {selectedRecipe.inputs.map((inp, i) => {
            const have = inventory.countMaterial(inp.materialId)
            const ok = have >= inp.quantity
            const biomeSrc = BIOME_MAT_ICONS[inp.materialId]
            return (
              <div key={i} style={{ fontSize: 11, color: ok ? '#2ecc71' : '#e74c3c', display: 'flex', alignItems: 'center', gap: 3 }}>
                {inp.quantity}x {MAT_NAMES[inp.materialId] ?? inp.materialId}
                {biomeSrc && (
                  <span title={`Found in: ${biomeSrc.label}`} style={{ fontSize: 10, opacity: 0.85 }}>{biomeSrc.icon}</span>
                )}
                <span style={{ color: '#666' }}>({have})</span>
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

          {(() => {
            const recipeUnlocked = isRecipeUnlocked(selectedRecipe.id, getSkillLevel)
            const craftReady = recipeUnlocked && canCraft(selectedRecipe)
            return (
              <>
                <button
                  onClick={() => handleCraft(false)}
                  disabled={!craftReady}
                  style={{
                    marginTop: 8,
                    background: craftReady ? 'rgba(46,204,113,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${craftReady ? '#2ecc71' : '#444'}`,
                    borderRadius: 4,
                    color: craftReady ? '#2ecc71' : '#555',
                    cursor: craftReady ? 'pointer' : 'not-allowed',
                    padding: '6px 0',
                    fontSize: 12,
                    fontFamily: 'monospace',
                  }}
                >
                  {recipeUnlocked ? 'CRAFT' : 'LOCKED'}
                </button>
                {!selectedRecipe.output.isMaterial && (
                  <button
                    onClick={() => handleCraft(true)}
                    disabled={!craftReady}
                    style={{
                      background: craftReady ? 'rgba(52,152,219,0.25)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${craftReady ? '#3498db' : '#444'}`,
                      borderRadius: 4,
                      color: craftReady ? '#3498db' : '#555',
                      cursor: craftReady ? 'pointer' : 'not-allowed',
                      padding: '6px 0',
                      fontSize: 11,
                      fontFamily: 'monospace',
                    }}
                  >
                    CRAFT + EQUIP
                  </button>
                )}
              </>
            )
          })()}
        </div>
      )}

      {/* Alchemy tab: Enchanting sub-section */}
      {activeTab === 'alchemy' && (
        <div style={{
          width: 170,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          overflowY: 'auto',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#c87dff', borderBottom: '1px solid rgba(200,100,255,0.3)', paddingBottom: 4, marginBottom: 4 }}>
            Enchanting
          </div>

          {/* Active enchants display */}
          <div style={{ fontSize: 10, color: '#aaa' }}>Weapon:</div>
          <div style={{ fontSize: 11, color: activeWeaponEnchant ? '#f1c40f' : '#555', marginBottom: 4 }}>
            {activeWeaponEnchant
              ? `${ENCHANTS[activeWeaponEnchant].icon} ${ENCHANTS[activeWeaponEnchant].name}`
              : 'None'}
          </div>
          <div style={{ fontSize: 10, color: '#aaa' }}>Armor:</div>
          <div style={{ fontSize: 11, color: activeArmorEnchant ? '#f1c40f' : '#555', marginBottom: 8 }}>
            {activeArmorEnchant
              ? `${ENCHANTS[activeArmorEnchant].icon} ${ENCHANTS[activeArmorEnchant].name}`
              : 'None'}
          </div>

          {enchantNotice && (
            <div style={{ fontSize: 10, color: '#2ecc71', background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.3)', borderRadius: 3, padding: '3px 6px', marginBottom: 4 }}>
              {enchantNotice}
            </div>
          )}

          {/* Enchant selection */}
          {(Object.entries(ENCHANTS) as [Enchant, typeof ENCHANTS[Enchant]][]).map(([key, def]) => {
            const canAfford = inventory.isGodMode() || def.materialCost.every(({ matId, qty }) => inventory.countMaterial(matId) >= qty)
            return (
              <div key={key} style={{
                padding: '5px 7px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 5,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {def.icon} {def.name}
                  <span style={{ fontSize: 9, color: '#888', marginLeft: 'auto' }}>{def.applyTo}</span>
                </div>
                <div style={{ fontSize: 9, color: '#aaa', margin: '2px 0' }}>{def.effect}</div>
                <div style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>
                  Cost: {def.materialCost.map(({ matId, qty }) => `${qty}x ${MAT_NAMES_LOCAL[matId] ?? matId}`).join(', ')}
                </div>
                <button
                  onClick={() => handleEnchant(key)}
                  disabled={!canAfford}
                  style={{
                    width: '100%',
                    background: canAfford ? 'rgba(180,100,220,0.2)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${canAfford ? 'rgba(180,100,220,0.6)' : '#333'}`,
                    borderRadius: 3,
                    color: canAfford ? '#c87dff' : '#444',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    padding: '3px 0',
                    fontSize: 10,
                    fontFamily: 'monospace',
                  }}
                >
                  ENCHANT
                </button>
              </div>
            )
          })}
        </div>
      )}

      </div>{/* end main content area */}

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
