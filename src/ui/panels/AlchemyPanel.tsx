// ── AlchemyPanel.tsx ──────────────────────────────────────────────────────────
// M41 Track A: Alchemy Workspace — ingredient slots, BREW button, mutation discoveries.

import { useState, useEffect, useCallback } from 'react'
import { inventory } from '../../game/GameSingletons'
import { MAT } from '../../player/Inventory'
import { CRAFTING_RECIPES } from '../../player/CraftingRecipes'
import { checkAlchemyMutation, discoveriesLog, addDiscovery } from '../../game/PotionSystem'
import { useUiStore } from '../../store/uiStore'

const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

// Alchemy recipes only
const ALCHEMY_RECIPES = CRAFTING_RECIPES.filter(r => r.requiresAlchemyTable === true)

interface SlotState {
  matId: number | null
}

const EMPTY_SLOTS: [SlotState, SlotState, SlotState] = [
  { matId: null },
  { matId: null },
  { matId: null },
]

export function AlchemyPanel() {
  const addNotification = useUiStore((s: ReturnType<typeof useUiStore.getState>) => s.addNotification)
  const [slots, setSlots] = useState<[SlotState, SlotState, SlotState]>([...EMPTY_SLOTS])
  const [pickerOpen, setPickerOpen] = useState<number | null>(null) // slot index (0-2)
  const [message, setMessage] = useState<string | null>(null)
  const [messageOk, setMessageOk] = useState(true)
  const [, forceRefresh] = useState(0)

  // Refresh inventory counts every 300ms
  useEffect(() => {
    const id = setInterval(() => forceRefresh(r => r + 1), 300)
    return () => clearInterval(id)
  }, [])

  const setSlot = useCallback((index: number, matId: number | null) => {
    setSlots(prev => {
      const next: [SlotState, SlotState, SlotState] = [{ ...prev[0] }, { ...prev[1] }, { ...prev[2] }]
      next[index] = { matId }
      return next
    })
    setPickerOpen(null)
  }, [])

  const clearSlot = useCallback((index: number) => {
    setSlot(index, null)
  }, [setSlot])

  // Compute what recipe matches the current slots (ignoring order)
  const filledMats = slots.map(s => s.matId).filter((m): m is number => m !== null)

  const matchedRecipe = (() => {
    if (filledMats.length < 2) return null
    for (const recipe of ALCHEMY_RECIPES) {
      if (recipe.inputs.length !== filledMats.length) continue
      // Check if all inputs are satisfied by current slots (order-insensitive)
      const inputMats = recipe.inputs.map(i => i.materialId)
      const sortedInputs = [...inputMats].sort((a, b) => a - b)
      const sortedFilled = [...filledMats].sort((a, b) => a - b)
      const matches = sortedInputs.length === sortedFilled.length &&
        sortedInputs.every((v, i) => v === sortedFilled[i])
      if (matches) return recipe
    }
    return null
  })()

  // Mutation check (only when 3 slots filled)
  const mutation = slots.every(s => s.matId !== null)
    ? checkAlchemyMutation(slots[0].matId!, slots[1].matId!, slots[2].matId!)
    : null

  // Preview label
  const previewLabel = (() => {
    if (mutation) {
      if (mutation === 'fireball') return 'Fire Explosion Potion [MUTATION]'
      if (mutation === 'lightning') return 'Shock Potion [MUTATION]'
    }
    if (matchedRecipe) return matchedRecipe.name
    if (filledMats.length === 0) return 'Add ingredients to begin'
    return 'No matching recipe'
  })()

  function showMessage(text: string, ok: boolean) {
    setMessage(text)
    setMessageOk(ok)
    setTimeout(() => setMessage(null), 2500)
  }

  function handleBrew() {
    // 1. Check for mutation first
    if (mutation && slots.every(s => s.matId !== null)) {
      // Atomic check: validate ALL slots have ingredients before consuming any
      const indices = slots.map(s => s.matId !== null ? inventory.findItem(s.matId) : -1)
      if (indices.some(i => i === -1)) {
        showMessage('Missing ingredients to brew!', false)
        return
      }
      // All valid — consume in reverse order to avoid index shifting
      for (let i = indices.length - 1; i >= 0; i--) inventory.removeItem(indices[i], 1)
      // Grant the mutation potion item
      const outputMat = mutation === 'fireball' ? MAT.POTION_FIRE_RESIST : MAT.POTION_SPEED
      const outputName = mutation === 'fireball' ? 'Fire Explosion Potion' : 'Shock Potion'
      inventory.addMaterial(outputMat, 1)
      // Record discovery (only here, not during preview render)
      addDiscovery(`${outputName} discovered!`)
      addNotification(`${outputName} created!`, 'discovery')
      showMessage(`[~] MUTATION: ${outputName} brewed!`, true)
      setSlots([{ matId: null }, { matId: null }, { matId: null }])
      return
    }

    // 2. Standard recipe
    if (!matchedRecipe) {
      showMessage('No matching recipe for these ingredients.', false)
      return
    }

    // Check material quantities
    for (const input of matchedRecipe.inputs) {
      if (inventory.countMaterial(input.materialId) < input.quantity) {
        showMessage(`Not enough ${MAT_NAMES[input.materialId] ?? input.materialId}!`, false)
        return
      }
    }

    // Consume inputs + add output
    const ok = inventory.craft(matchedRecipe, 0)
    if (ok) {
      addNotification(`Brewed: ${matchedRecipe.name}`, 'info')
      showMessage(`Brewed: ${matchedRecipe.name}!`, true)
      setSlots([{ matId: null }, { matId: null }, { matId: null }])
    } else {
      showMessage('Brew failed — check inventory space.', false)
    }
  }

  // Build a flat list of materials with qty > 0 for the picker
  const availableMaterials: Array<{ matId: number; qty: number; name: string }> = []
  const seen = new Set<number>()
  for (let i = 0; i < inventory.slotCount; i++) {
    const slot = inventory.getSlot(i)
    if (slot && slot.itemId === 0 && slot.materialId > 0 && !seen.has(slot.materialId)) {
      const qty = inventory.countMaterial(slot.materialId)
      if (qty > 0) {
        seen.add(slot.materialId)
        availableMaterials.push({
          matId: slot.materialId,
          qty,
          name: MAT_NAMES[slot.materialId] ?? `mat:${slot.materialId}`,
        })
      }
    }
  }
  availableMaterials.sort((a, b) => a.name.localeCompare(b.name))

  const canBrew = mutation !== null || matchedRecipe !== null

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#c87dff', letterSpacing: 1 }}>
        [~] ALCHEMY WORKSPACE
      </div>

      {/* Ingredient Slots */}
      <div style={{ display: 'flex', gap: 8 }}>
        {slots.map((slot, i) => (
          <div key={i} style={{ flex: 1, position: 'relative' }}>
            <div
              onClick={() => { if (!slot.matId) setPickerOpen(pickerOpen === i ? null : i) }}
              style={{
                border: `1px solid ${slot.matId ? 'rgba(200,125,255,0.6)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 6,
                padding: '10px 6px',
                textAlign: 'center',
                background: slot.matId ? 'rgba(200,125,255,0.08)' : 'rgba(255,255,255,0.03)',
                cursor: slot.matId ? 'default' : 'pointer',
                minHeight: 48,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
              }}
            >
              {slot.matId ? (
                <>
                  <span style={{ fontSize: 11, color: '#ddd', wordBreak: 'break-all' }}>
                    {MAT_NAMES[slot.matId] ?? `mat:${slot.matId}`}
                  </span>
                  <span style={{ fontSize: 9, color: '#888' }}>
                    x{inventory.countMaterial(slot.matId)}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 10, color: '#555' }}>-- empty --</span>
              )}
            </div>

            {/* Clear button */}
            {slot.matId && (
              <button
                onClick={() => clearSlot(i)}
                style={{
                  position: 'absolute',
                  top: 2, right: 2,
                  background: 'rgba(255,80,80,0.15)',
                  border: '1px solid rgba(255,80,80,0.4)',
                  borderRadius: 3,
                  color: '#f88',
                  cursor: 'pointer',
                  fontSize: 9,
                  lineHeight: 1,
                  padding: '1px 4px',
                }}
              >
                [X]
              </button>
            )}

            {/* Picker dropdown */}
            {pickerOpen === i && !slot.matId && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                zIndex: 50,
                background: 'rgba(20,20,20,0.98)',
                border: '1px solid rgba(200,125,255,0.4)',
                borderRadius: 5,
                maxHeight: 180,
                overflowY: 'auto',
                minWidth: 130,
                boxShadow: '0 4px 16px rgba(0,0,0,0.8)',
              }}>
                {availableMaterials.length === 0 ? (
                  <div style={{ padding: '6px 10px', fontSize: 10, color: '#666' }}>No materials</div>
                ) : (
                  availableMaterials.map(({ matId, qty, name }) => (
                    <div
                      key={matId}
                      onClick={() => setSlot(i, matId)}
                      style={{
                        padding: '5px 10px',
                        fontSize: 11,
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,125,255,0.12)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ color: '#ccc' }}>{name}</span>
                      <span style={{ color: '#777' }}>x{qty}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Result preview */}
      <div style={{
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${mutation ? 'rgba(255,200,50,0.4)' : matchedRecipe ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 5,
        fontSize: 11,
        color: mutation ? '#ffd700' : matchedRecipe ? '#2ecc71' : '#666',
      }}>
        <span style={{ color: '#888', marginRight: 6 }}>Result:</span>
        {previewLabel}
      </div>

      {/* Message feedback */}
      {message && (
        <div style={{
          padding: '6px 10px',
          background: messageOk ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
          border: `1px solid ${messageOk ? 'rgba(46,204,113,0.4)' : 'rgba(231,76,60,0.4)'}`,
          borderRadius: 4,
          fontSize: 11,
          color: messageOk ? '#2ecc71' : '#e74c3c',
        }}>
          {message}
        </div>
      )}

      {/* BREW button */}
      <button
        onClick={handleBrew}
        disabled={!canBrew}
        style={{
          background: canBrew ? 'rgba(200,125,255,0.2)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${canBrew ? 'rgba(200,125,255,0.7)' : '#333'}`,
          borderRadius: 5,
          color: canBrew ? '#c87dff' : '#444',
          cursor: canBrew ? 'pointer' : 'not-allowed',
          padding: '9px 0',
          fontSize: 13,
          fontFamily: 'monospace',
          fontWeight: 700,
          letterSpacing: 1,
        }}
      >
        BREW
      </button>

      {/* Discoveries section */}
      <div style={{ marginTop: 8 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#c87dff',
          borderBottom: '1px solid rgba(200,125,255,0.2)',
          paddingBottom: 4,
          marginBottom: 6,
          letterSpacing: 0.5,
        }}>
          DISCOVERIES
        </div>
        {discoveriesLog.length === 0 ? (
          <div style={{ fontSize: 10, color: '#555' }}>No alchemy mutations discovered yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {discoveriesLog.map((entry, i) => (
              <div key={i} style={{
                fontSize: 10,
                color: '#ffd700',
                padding: '3px 6px',
                background: 'rgba(255,215,0,0.05)',
                border: '1px solid rgba(255,215,0,0.15)',
                borderRadius: 3,
              }}>
                {entry}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Known alchemy recipes reference */}
      <div style={{ marginTop: 4 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#888',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: 4,
          marginBottom: 6,
        }}>
          KNOWN RECIPES
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {ALCHEMY_RECIPES.map(r => {
            const craftable = r.inputs.every(inp => inventory.countMaterial(inp.materialId) >= inp.quantity)
            return (
              <div
                key={r.id}
                style={{
                  padding: '4px 8px',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${craftable ? 'rgba(46,204,113,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 4,
                  opacity: craftable ? 1 : 0.5,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: craftable ? '#ccc' : '#666' }}>{r.name}</div>
                <div style={{ fontSize: 9, color: '#666', marginTop: 1 }}>
                  {r.inputs.map(inp => `${inp.quantity}x ${MAT_NAMES[inp.materialId] ?? inp.materialId}`).join(' + ')}
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
