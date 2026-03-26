// src/ui/panels/RecipeFeasibilityPanel.tsx
// M56 Track C: Recipe Feasibility Scanner — groups discovered recipes by craftability.

import { useState, useEffect } from 'react'
import { inventory } from '../../game/GameSingletons'
import { isRecipeDiscovered } from '../../game/RecipeDiscoverySystem'
import { CRAFTING_RECIPES } from '../../player/CraftingRecipes'
import { MAT } from '../../player/Inventory'

// ── Material name lookup ──────────────────────────────────────────────────────

const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecipeAnalysis {
  id: number
  name: string
  icon: string
  canCraft: boolean
  missingCount: number
  totalMissing: number
  ingredients: Array<{
    materialId: number
    needed: number
    have: number
    name: string
  }>
}

// ── Analysis logic ────────────────────────────────────────────────────────────

function analyzeRecipes(): RecipeAnalysis[] {
  return CRAFTING_RECIPES
    .filter(r => isRecipeDiscovered(r.id))
    .map(r => {
      const ingredients = r.inputs.map(inp => {
        const have = inventory.countMaterial(inp.materialId)
        return {
          materialId: inp.materialId,
          needed: inp.quantity,
          have,
          name: MAT_NAMES[inp.materialId] ?? `mat:${inp.materialId}`,
        }
      })

      const missingCount = ingredients.filter(ing => ing.have < ing.needed).length
      const totalMissing = ingredients.reduce((sum, ing) => sum + Math.max(0, ing.needed - ing.have), 0)
      const canCraft = missingCount === 0

      return {
        id: r.id,
        name: r.name,
        icon: '⚒️',
        canCraft,
        missingCount,
        totalMissing,
        ingredients,
      }
    })
}

// ── Section header ────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  label: string
  count: number
  color: string
  open: boolean
  onToggle: () => void
}

function SectionHeader({ label, count, color, open, onToggle }: SectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.03)',
        border: 'none',
        borderLeft: `3px solid ${color}`,
        borderRadius: '3px',
        padding: '7px 10px',
        cursor: 'pointer',
        marginBottom: 6,
      }}
    >
      <span style={{
        color,
        fontFamily: 'monospace',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.5,
      }}>
        {label}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          background: `${color}22`,
          color,
          fontFamily: 'monospace',
          fontSize: 10,
          fontWeight: 700,
          padding: '1px 6px',
          borderRadius: 3,
        }}>
          {count}
        </span>
        <span style={{ color, fontSize: 10, fontFamily: 'monospace' }}>
          {open ? '▼' : '▶'}
        </span>
      </span>
    </button>
  )
}

// ── Recipe card ───────────────────────────────────────────────────────────────

interface RecipeCardProps {
  recipe: RecipeAnalysis
}

function RecipeCard({ recipe }: RecipeCardProps) {
  const borderColor = recipe.canCraft ? '#22c55e' : recipe.missingCount === 1 ? '#f59e0b' : '#555'

  // First missing ingredient (for ALMOST section hint)
  const firstMissing = recipe.ingredients.find(ing => ing.have < ing.needed)

  return (
    <div style={{
      background: 'rgba(20,20,20,0.85)',
      border: '1px solid #2a2a2a',
      borderLeft: `2px solid ${borderColor}`,
      borderRadius: 4,
      padding: '9px 12px',
      marginBottom: 6,
    }}>
      {/* Recipe title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>{recipe.icon}</span>
        <span style={{
          flex: 1,
          color: '#ddd',
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 700,
        }}>
          {recipe.name}
        </span>
        {recipe.canCraft && (
          <span style={{
            background: 'rgba(34,197,94,0.15)',
            color: '#22c55e',
            fontFamily: 'monospace',
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 3,
            letterSpacing: 1,
          }}>
            CRAFT READY
          </span>
        )}
      </div>

      {/* Ingredients list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {recipe.ingredients.map(ing => {
          const met = ing.have >= ing.needed
          return (
            <div
              key={ing.materialId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontFamily: 'monospace',
                fontSize: 11,
              }}
            >
              <span style={{ color: met ? '#22c55e' : '#f87171', minWidth: 14 }}>
                {met ? '✓' : '✗'}
              </span>
              <span style={{ color: '#888', flex: 1 }}>
                {ing.name}
              </span>
              <span style={{
                color: met ? '#4ade80' : '#f87171',
                fontWeight: 700,
              }}>
                {ing.have}/{ing.needed}
              </span>
            </div>
          )
        })}
      </div>

      {/* ALMOST: show what's missing */}
      {recipe.missingCount === 1 && firstMissing && (
        <div style={{
          marginTop: 6,
          padding: '4px 8px',
          background: 'rgba(245,158,11,0.08)',
          borderRadius: 3,
          fontFamily: 'monospace',
          fontSize: 10,
          color: '#f59e0b',
        }}>
          Need {firstMissing.needed - firstMissing.have} more {firstMissing.name}
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function RecipeFeasibilityPanel() {
  const [, setTick] = useState(0)
  const [openSections, setOpenSections] = useState({
    ready: true,
    almost: true,
    needsWork: false,
  })

  // Refresh on interval (inventory isn't evented) and on recipe discovery
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 2000)

    function onDiscovered() { setTick(t => t + 1) }
    window.addEventListener('recipe-discovered', onDiscovered)

    return () => {
      clearInterval(interval)
      window.removeEventListener('recipe-discovered', onDiscovered)
    }
  }, [])

  const allRecipes = analyzeRecipes()

  const ready = allRecipes
    .filter(r => r.canCraft)
    .sort((a, b) => a.id - b.id)

  const almost = allRecipes
    .filter(r => !r.canCraft && r.missingCount === 1)
    .sort((a, b) => a.totalMissing - b.totalMissing)

  const needsWork = allRecipes
    .filter(r => !r.canCraft && r.missingCount >= 2)
    .sort((a, b) => a.missingCount - b.missingCount)

  const toggle = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  return (
    <div style={{ fontFamily: 'monospace' }}>
      {/* Subtitle */}
      <div style={{
        color: '#555',
        fontSize: 11,
        marginBottom: 16,
        lineHeight: 1.4,
      }}>
        Recipes you can craft with your current materials
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 16,
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 4,
        border: '1px solid #2a2a2a',
      }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 18 }}>{ready.length}</div>
          <div style={{ color: '#555', fontSize: 9, letterSpacing: 1 }}>READY</div>
        </div>
        <div style={{ width: 1, background: '#2a2a2a' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: 18 }}>{almost.length}</div>
          <div style={{ color: '#555', fontSize: 9, letterSpacing: 1 }}>ALMOST</div>
        </div>
        <div style={{ width: 1, background: '#2a2a2a' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ color: '#555', fontWeight: 700, fontSize: 18 }}>{needsWork.length}</div>
          <div style={{ color: '#444', fontSize: 9, letterSpacing: 1 }}>NEEDS WORK</div>
        </div>
        <div style={{ width: 1, background: '#2a2a2a' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ color: '#888', fontWeight: 700, fontSize: 18 }}>{allRecipes.length}</div>
          <div style={{ color: '#555', fontSize: 9, letterSpacing: 1 }}>DISCOVERED</div>
        </div>
      </div>

      {/* READY section */}
      <SectionHeader
        label="READY TO CRAFT"
        count={ready.length}
        color="#22c55e"
        open={openSections.ready}
        onToggle={() => toggle('ready')}
      />
      {openSections.ready && (
        <div style={{ marginBottom: 12 }}>
          {ready.length === 0 ? (
            <div style={{ color: '#444', fontSize: 11, padding: '8px 12px', fontStyle: 'italic' }}>
              No recipes craftable right now
            </div>
          ) : (
            ready.map(r => <RecipeCard key={r.id} recipe={r} />)
          )}
        </div>
      )}

      {/* ALMOST section */}
      <SectionHeader
        label="ALMOST THERE"
        count={almost.length}
        color="#f59e0b"
        open={openSections.almost}
        onToggle={() => toggle('almost')}
      />
      {openSections.almost && (
        <div style={{ marginBottom: 12 }}>
          {almost.length === 0 ? (
            <div style={{ color: '#444', fontSize: 11, padding: '8px 12px', fontStyle: 'italic' }}>
              No recipes missing just 1 material
            </div>
          ) : (
            almost.map(r => <RecipeCard key={r.id} recipe={r} />)
          )}
        </div>
      )}

      {/* NEEDS WORK section */}
      <SectionHeader
        label="NEEDS WORK"
        count={needsWork.length}
        color="#555"
        open={openSections.needsWork}
        onToggle={() => toggle('needsWork')}
      />
      {openSections.needsWork && (
        <div style={{ marginBottom: 12 }}>
          {needsWork.length === 0 ? (
            <div style={{ color: '#444', fontSize: 11, padding: '8px 12px', fontStyle: 'italic' }}>
              No recipes in this category
            </div>
          ) : (
            needsWork.map(r => <RecipeCard key={r.id} recipe={r} />)
          )}
        </div>
      )}
    </div>
  )
}
