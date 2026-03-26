// ── MarketPricePanel.tsx ───────────────────────────────────────────────────────
// M59 Track C: Resource Market Price Panel
// Table of all market items with trend arrows, price bars, and sort toggle.

import { useState, useEffect } from 'react'
import {
  getMarketItems,
  type MarketItem,
} from '../../game/MarketPriceSystem'

// ── Helpers ────────────────────────────────────────────────────────────────────

function trendArrow(item: MarketItem): string {
  if (item.trend === 'rising')  return '↑'
  if (item.trend === 'falling') return '↓'
  return '→'
}

function trendColor(item: MarketItem): string {
  if (item.trend === 'rising')  return '#4ade80'
  if (item.trend === 'falling') return '#f87171'
  return '#888'
}

function rowBg(item: MarketItem): string {
  if (item.trend === 'rising')  return 'rgba(74,222,128,0.05)'
  if (item.trend === 'falling') return 'rgba(248,113,113,0.05)'
  return 'rgba(30,30,30,0.6)'
}

function priceBarWidth(item: MarketItem): number {
  const range = item.maxPrice - item.minPrice
  if (range <= 0) return 50
  return Math.round(((item.currentPrice - item.minPrice) / range) * 100)
}

function priceBarColor(item: MarketItem): string {
  const pct = priceBarWidth(item)
  if (pct >= 75) return '#f87171'
  if (pct >= 50) return '#fbbf24'
  return '#4ade80'
}

function formatPrice(p: number): string {
  return p.toFixed(1) + 'g'
}

function formatTimestamp(simSeconds: number): string {
  if (simSeconds === 0) return 'Never'
  const m = Math.floor(simSeconds / 60)
  const s = Math.floor(simSeconds % 60)
  return `${m}m ${s}s`
}

// ── ItemRow ────────────────────────────────────────────────────────────────────

function ItemRow({ item }: { item: MarketItem }) {
  const pct = priceBarWidth(item)
  const barColor = priceBarColor(item)
  const arrow = trendArrow(item)
  const arrowColor = trendColor(item)
  const bg = rowBg(item)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 1fr 64px 20px 80px',
      alignItems: 'center',
      gap: 8,
      padding: '7px 10px',
      background: bg,
      border: '1px solid #2a2a2a',
      borderRadius: 4,
      marginBottom: 4,
    }}>
      {/* Icon */}
      <span style={{ fontSize: 16, textAlign: 'center', lineHeight: 1 }}>
        {item.icon}
      </span>

      {/* Name */}
      <span style={{
        color: '#ccc',
        fontFamily: 'monospace',
        fontSize: 11,
        fontWeight: 600,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {item.name}
      </span>

      {/* Price */}
      <span style={{
        color: arrowColor,
        fontFamily: 'monospace',
        fontSize: 12,
        fontWeight: 700,
        textAlign: 'right',
      }}>
        {formatPrice(item.currentPrice)}
      </span>

      {/* Trend arrow */}
      <span style={{
        color: arrowColor,
        fontFamily: 'monospace',
        fontSize: 14,
        fontWeight: 700,
        textAlign: 'center',
        lineHeight: 1,
      }}>
        {arrow}
      </span>

      {/* Price bar: min → max range */}
      <div style={{
        position: 'relative',
        height: 6,
        background: '#222',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${pct}%`,
          background: barColor,
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

// ── MarketPricePanel ───────────────────────────────────────────────────────────

type SortMode = 'name' | 'price'

export function MarketPricePanel() {
  const [items, setItems]           = useState<MarketItem[]>([])
  const [sortMode, setSortMode]     = useState<SortMode>('name')
  const [lastUpdated, setLastUpdated] = useState(0)

  // Refresh every 10 seconds
  useEffect(() => {
    function refresh() {
      const raw = getMarketItems()
      setItems([...raw])
      // Last updated = max lastUpdated across items
      const maxTs = raw.reduce((acc, i) => Math.max(acc, i.lastUpdated), 0)
      setLastUpdated(maxTs)
    }
    refresh()
    const id = setInterval(refresh, 10_000)
    return () => clearInterval(id)
  }, [])

  const sorted = [...items].sort((a, b) => {
    if (sortMode === 'name')  return a.name.localeCompare(b.name)
    if (sortMode === 'price') return b.currentPrice - a.currentPrice
    return 0
  })

  const risingCount  = items.filter(i => i.trend === 'rising').length
  const fallingCount = items.filter(i => i.trend === 'falling').length

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        paddingBottom: 10,
        borderBottom: '1px solid #2a2a2a',
      }}>
        <div>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
            MARKET SNAPSHOT
          </div>
          <div style={{ color: '#555', fontSize: 10, marginTop: 2 }}>
            Last tick: {formatTimestamp(lastUpdated)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#4ade80', fontSize: 11 }}>↑ {risingCount}</span>
          <span style={{ color: '#f87171', fontSize: 11 }}>↓ {fallingCount}</span>
        </div>
      </div>

      {/* Sort controls */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <span style={{ color: '#555', fontSize: 10, alignSelf: 'center' }}>SORT:</span>
        {(['name', 'price'] as SortMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setSortMode(mode)}
            style={{
              padding: '3px 10px',
              background: sortMode === mode ? 'rgba(205,68,32,0.25)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${sortMode === mode ? '#cd4420' : '#333'}`,
              borderRadius: 3,
              color: sortMode === mode ? '#cd4420' : '#666',
              fontFamily: 'monospace',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 64px 20px 80px',
        gap: 8,
        padding: '4px 10px',
        marginBottom: 4,
        color: '#444',
        fontSize: 10,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}>
        <span />
        <span>ITEM</span>
        <span style={{ textAlign: 'right' }}>PRICE</span>
        <span />
        <span>RANGE</span>
      </div>

      {/* Item list */}
      {sorted.length === 0 ? (
        <div style={{ color: '#444', textAlign: 'center', padding: 32, fontSize: 11 }}>
          Market not initialized...
        </div>
      ) : (
        <div>
          {sorted.map(item => (
            <ItemRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{
        marginTop: 14,
        padding: '8px 10px',
        background: 'rgba(20,20,20,0.6)',
        border: '1px solid #222',
        borderRadius: 4,
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <span style={{ color: '#4ade80', fontSize: 10 }}>↑ Rising</span>
        <span style={{ color: '#f87171', fontSize: 10 }}>↓ Falling</span>
        <span style={{ color: '#888',    fontSize: 10 }}>→ Stable</span>
        <span style={{ color: '#444',    fontSize: 10 }}>Bar = min→max range</span>
      </div>
    </div>
  )
}
