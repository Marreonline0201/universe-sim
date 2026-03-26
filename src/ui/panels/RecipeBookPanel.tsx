// ── RecipeBookPanel.tsx ────────────────────────────────────────────────────────
// M68 Track A: Crafting Recipe Book panel
// Visual browser for all known crafting recipes with discovery state,
// material requirements, and category filtering.

import React, { useState, useEffect, useCallback } from 'react'
import {
  getAllRecipes,
  getRecipeBookStats,
  type RecipeBookEntry,
  type RecipeCategory,
} from '../../game/RecipeBookSystem'

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterCategory = 'all' | RecipeCategory

const CATEGORIES: Array<{ id: FilterCategory; label: string }> = [
  { id: 'all',         label: 'ALL' },
  { id: 'weapons',     label: 'WEAPONS' },
  { id: 'armor',       label: 'ARMOR' },
  { id: 'tools',       label: 'TOOLS' },
  { id: 'consumables', label: 'CONSUMABLES' },
  { id: 'materials',   label: 'MATERIALS' },
  { id: 'structures',  label: 'STRUCTURES' },
  { id: 'misc',        label: 'MISC' },
]

const MASTERY_STARS = ['', '⭐', '⭐⭐', '⭐⭐⭐']

const CATEGORY_COLORS: Record<RecipeCategory, string> = {
  weapons:     '#e05c5c',
  armor:       '#7b9de0',
  tools:       '#d4a84b',
  consumables: '#5cb85c',
  materials:   '#a07850',
  structures:  '#8e7cc3',
  misc:        '#6c9090',
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: '#0d0d0d',
    color: '#ccc',
    fontFamily: 'monospace',
    overflow: 'hidden',
  },
  header: {
    padding: '12px 16px 8px',
    borderBottom: '1px solid #222',
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 2,
    color: '#e8c97a',
    marginBottom: 4,
  },
  countLabel: {
    fontSize: 11,
    color: '#888',
  },
  searchBar: {
    margin: '8px 12px',
    padding: '6px 10px',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 4,
    color: '#ccc',
    fontFamily: 'monospace',
    fontSize: 12,
    width: 'calc(100% - 24px)',
    boxSizing: 'border-box' as const,
    outline: 'none',
  },
  tabsWrapper: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 2,
    padding: '4px 12px 8px',
    borderBottom: '1px solid #222',
  },
  tab: (active: boolean) => ({
    padding: '3px 7px',
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: 700,
    letterSpacing: 1,
    background: active ? '#2a2a2a' : 'transparent',
    border: active ? '1px solid #555' : '1px solid #2a2a2a',
    borderRadius: 3,
    color: active ? '#e8c97a' : '#666',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  }),
  badge: {
    display: 'inline-block',
    marginLeft: 4,
    padding: '0 4px',
    background: '#333',
    borderRadius: 8,
    fontSize: 9,
    color: '#999',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    padding: '8px 12px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  card: (discovered: boolean, selected: boolean) => ({
    background: selected ? '#1e1e1e' : '#141414',
    border: selected ? '1px solid #555' : '1px solid #222',
    borderRadius: 6,
    padding: '8px 10px',
    cursor: 'pointer',
    opacity: discovered ? 1 : 0.6,
    filter: discovered ? 'none' : 'grayscale(100%)',
    transition: 'border-color 0.15s, background 0.15s',
  }),
  cardIcon: {
    fontSize: 22,
    lineHeight: 1,
    marginBottom: 4,
  },
  cardName: (discovered: boolean) => ({
    fontSize: 11,
    fontWeight: 700,
    color: discovered ? '#ddd' : '#666',
    marginBottom: 3,
    wordBreak: 'break-word' as const,
  }),
  cardCategoryBadge: (cat: RecipeCategory) => ({
    display: 'inline-block',
    padding: '1px 5px',
    borderRadius: 3,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1,
    background: CATEGORY_COLORS[cat] + '33',
    color: CATEGORY_COLORS[cat],
    marginBottom: 4,
  }),
  cardIngredients: {
    fontSize: 9,
    color: '#777',
    marginTop: 2,
  },
  masteryStars: {
    fontSize: 9,
    marginTop: 2,
  },
  // Expanded detail view
  detail: {
    background: '#111',
    borderTop: '1px solid #222',
    padding: '12px 16px',
    flexShrink: 0,
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  detailIcon: {
    fontSize: 28,
  },
  detailName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#e8c97a',
  },
  detailDesc: {
    fontSize: 11,
    color: '#888',
    marginBottom: 8,
    fontStyle: 'italic' as const,
  },
  detailSection: {
    fontSize: 10,
    fontWeight: 700,
    color: '#555',
    letterSpacing: 2,
    marginBottom: 4,
  },
  ingredientRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: '#bbb',
    marginBottom: 3,
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#5cb85c',
    fontWeight: 700,
    marginTop: 6,
  },
  timesCrafted: {
    fontSize: 10,
    color: '#555',
    marginTop: 6,
    fontStyle: 'italic' as const,
  },
  emptyState: {
    gridColumn: '1 / -1',
    textAlign: 'center' as const,
    color: '#444',
    fontSize: 11,
    padding: '32px 0',
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RecipeBookPanel() {
  const [recipes, setRecipes] = useState<RecipeBookEntry[]>([])
  const [stats, setStats] = useState({ total: 0, discovered: 0, byCategory: {} as Record<RecipeCategory, { total: number; discovered: number }> })
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setRecipes(getAllRecipes())
    setStats(getRecipeBookStats())
  }, [])

  useEffect(() => {
    refresh()

    const onCraft = () => refresh()
    const onDiscover = () => refresh()
    const onMastery = () => refresh()

    window.addEventListener('item-crafted', onCraft)
    window.addEventListener('recipe-discovered', onDiscover)
    window.addEventListener('crafting-mastery-levelup', onMastery)

    return () => {
      window.removeEventListener('item-crafted', onCraft)
      window.removeEventListener('recipe-discovered', onDiscover)
      window.removeEventListener('crafting-mastery-levelup', onMastery)
    }
  }, [refresh])

  // Filter recipes
  const filtered = recipes.filter(r => {
    const matchCat = filterCategory === 'all' || r.category === filterCategory
    const matchSearch = searchQuery === '' ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.category.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCat && matchSearch
  })

  const selected = selectedId ? recipes.find(r => r.id === selectedId) ?? null : null

  function getCatCount(cat: FilterCategory): number {
    if (cat === 'all') return recipes.length
    return recipes.filter(r => r.category === cat).length
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>RECIPE BOOK</div>
        <div style={styles.countLabel}>
          {stats.discovered} / {stats.total} Recipes Discovered
        </div>
      </div>

      {/* Search */}
      <input
        style={styles.searchBar}
        placeholder="Search recipes..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        spellCheck={false}
      />

      {/* Category tabs */}
      <div style={styles.tabsWrapper}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            style={styles.tab(filterCategory === cat.id)}
            onClick={() => setFilterCategory(cat.id)}
          >
            {cat.label}
            <span style={styles.badge}>{getCatCount(cat.id)}</span>
          </button>
        ))}
      </div>

      {/* Recipe grid */}
      <div style={styles.grid}>
        {filtered.length === 0 ? (
          <div style={styles.emptyState}>No recipes found.</div>
        ) : (
          filtered.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              selected={selectedId === recipe.id}
              onClick={() => setSelectedId(selectedId === recipe.id ? null : recipe.id)}
            />
          ))
        )}
      </div>

      {/* Expanded detail */}
      {selected && (
        <RecipeDetail recipe={selected} />
      )}
    </div>
  )
}

// ── RecipeCard ────────────────────────────────────────────────────────────────

function RecipeCard({
  recipe,
  selected,
  onClick,
}: {
  recipe: RecipeBookEntry
  selected: boolean
  onClick: () => void
}) {
  const isUnknown = !recipe.discovered

  return (
    <div
      style={styles.card(recipe.discovered, selected)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div style={styles.cardIcon}>
        {isUnknown ? '❓' : recipe.icon}
      </div>
      <div style={styles.cardName(recipe.discovered)}>
        {isUnknown ? '???' : recipe.name}
      </div>
      {!isUnknown && (
        <div style={styles.cardCategoryBadge(recipe.category)}>
          {recipe.category.toUpperCase()}
        </div>
      )}
      {!isUnknown && (
        <div style={styles.cardIngredients}>
          {recipe.ingredients.slice(0, 3).map((ing, i) => (
            <span key={i}>
              {ing.icon} {ing.amount}
              {i < Math.min(2, recipe.ingredients.length - 1) ? ' · ' : ''}
            </span>
          ))}
          {recipe.ingredients.length > 3 && <span> +{recipe.ingredients.length - 3}</span>}
        </div>
      )}
      {!isUnknown && (recipe.masteryLevel ?? 0) > 0 && (
        <div style={styles.masteryStars}>
          {MASTERY_STARS[recipe.masteryLevel ?? 0]}
        </div>
      )}
    </div>
  )
}

// ── RecipeDetail ──────────────────────────────────────────────────────────────

function RecipeDetail({ recipe }: { recipe: RecipeBookEntry }) {
  if (!recipe.discovered) {
    return (
      <div style={styles.detail}>
        <div style={{ color: '#555', fontSize: 11 }}>
          This recipe has not been discovered yet.
        </div>
      </div>
    )
  }

  return (
    <div style={styles.detail}>
      <div style={styles.detailHeader}>
        <div style={styles.detailIcon}>{recipe.icon}</div>
        <div>
          <div style={styles.detailName}>{recipe.name}</div>
          <div style={styles.cardCategoryBadge(recipe.category)}>
            {recipe.category.toUpperCase()}
          </div>
          {(recipe.masteryLevel ?? 0) > 0 && (
            <span style={{ marginLeft: 6, fontSize: 11 }}>
              {MASTERY_STARS[recipe.masteryLevel ?? 0]}
            </span>
          )}
        </div>
      </div>

      <div style={styles.detailDesc}>{recipe.description}</div>

      <div style={styles.detailSection}>INGREDIENTS</div>
      {recipe.ingredients.map((ing, i) => (
        <div key={i} style={styles.ingredientRow}>
          <span>{ing.icon}</span>
          <span>{ing.item}</span>
          <span style={{ color: '#888' }}>×{ing.amount}</span>
        </div>
      ))}

      <div style={styles.resultRow}>
        <span>→</span>
        <span>{recipe.result.icon}</span>
        <span>{recipe.result.item}</span>
        <span style={{ color: '#888', fontWeight: 400 }}>×{recipe.result.amount}</span>
      </div>

      {recipe.timesCrafted > 0 && (
        <div style={styles.timesCrafted}>
          Crafted {recipe.timesCrafted} time{recipe.timesCrafted !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
