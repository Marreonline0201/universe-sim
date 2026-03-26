// src/ui/panels/SettlementEconomyPanel.tsx
// M61 Track B: Settlement Economy Panel — view and invest in settlement economies

import { useState, useEffect, useCallback } from 'react'
import {
  getSettlementEconomies,
  investInSettlement,
  type SettlementEconomy,
  type ProsperityTier,
} from '../../game/SettlementEconomySystem'
import { usePlayerStore } from '../../store/playerStore'

// ── Helpers ────────────────────────────────────────────────────────────────────

const PROSPERITY_COLOR: Record<ProsperityTier, string> = {
  struggling: '#e74c3c',
  stable:     '#e0a030',
  thriving:   '#2ecc71',
  booming:    '#3498db',
}

const PROSPERITY_LABEL: Record<ProsperityTier, string> = {
  struggling: 'STRUGGLING',
  stable:     'STABLE',
  thriving:   'THRIVING',
  booming:    'BOOMING',
}

function WealthBar({ wealth }: { wealth: number }) {
  const pct = (wealth / 1000) * 100
  let barColor = '#e74c3c'
  if (wealth >= 750) barColor = '#3498db'
  else if (wealth >= 450) barColor = '#2ecc71'
  else if (wealth >= 150) barColor = '#e0a030'

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: '#888', fontSize: 10, fontFamily: 'monospace' }}>WEALTH</span>
        <span style={{ color: '#aaa', fontSize: 10, fontFamily: 'monospace' }}>
          {Math.floor(wealth)}/1000
        </span>
      </div>
      <div style={{ height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: barColor,
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

// ── SettlementCard ─────────────────────────────────────────────────────────────

interface SettlementCardProps {
  eco: SettlementEconomy
  playerGold: number
  onInvest: (id: number, gold: number) => void
}

function SettlementCard({ eco, playerGold, onInvest }: SettlementCardProps) {
  const [inputVal, setInputVal] = useState('100')
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleInvest = useCallback(() => {
    const gold = parseInt(inputVal, 10)
    if (isNaN(gold) || gold < 50 || gold > 500) {
      setFeedback('Enter 50–500 gold')
      setTimeout(() => setFeedback(null), 2000)
      return
    }
    if (gold > playerGold) {
      setFeedback('Not enough gold!')
      setTimeout(() => setFeedback(null), 2000)
      return
    }
    const ok = investInSettlement(eco.settlementId, gold)
    if (ok) {
      setFeedback(`Invested ${gold}g!`)
      onInvest(eco.settlementId, gold)
      setTimeout(() => setFeedback(null), 2000)
    } else {
      setFeedback('Investment failed')
      setTimeout(() => setFeedback(null), 2000)
    }
  }, [inputVal, playerGold, eco.settlementId, onInvest])

  const prosColor = PROSPERITY_COLOR[eco.prosperity]
  const prosLabel = PROSPERITY_LABEL[eco.prosperity]

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid #2a2a2a',
      borderRadius: 6,
      padding: '12px 14px',
      marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>
          {eco.name}
        </span>
        <span style={{
          background: prosColor + '22',
          border: `1px solid ${prosColor}44`,
          color: prosColor,
          fontSize: 9,
          fontFamily: 'monospace',
          fontWeight: 700,
          letterSpacing: 1,
          padding: '2px 7px',
          borderRadius: 3,
        }}>
          {prosLabel}
        </span>
      </div>

      {/* Population */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 6 }}>
        <div>
          <span style={{ color: '#555', fontSize: 10, fontFamily: 'monospace' }}>POP </span>
          <span style={{ color: '#ccc', fontSize: 11, fontFamily: 'monospace' }}>
            {Math.floor(eco.population).toLocaleString()}
          </span>
        </div>
        <div>
          <span style={{ color: '#555', fontSize: 10, fontFamily: 'monospace' }}>GROWTH </span>
          <span style={{ color: '#aaa', fontSize: 11, fontFamily: 'monospace' }}>
            +{(eco.growthRate * 100).toFixed(2)}%/tick
          </span>
        </div>
        {eco.playerInvestment > 0 && (
          <div>
            <span style={{ color: '#555', fontSize: 10, fontFamily: 'monospace' }}>INVESTED </span>
            <span style={{ color: '#f0c040', fontSize: 11, fontFamily: 'monospace' }}>
              {eco.playerInvestment}g
            </span>
          </div>
        )}
      </div>

      {/* Wealth bar */}
      <WealthBar wealth={eco.wealth} />

      {/* Invest controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <input
          type="number"
          min={50}
          max={500}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          style={{
            width: 72,
            background: '#111',
            border: '1px solid #333',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: 12,
            padding: '4px 7px',
            borderRadius: 4,
            outline: 'none',
          }}
        />
        <span style={{ color: '#555', fontSize: 11, fontFamily: 'monospace' }}>gold</span>
        <button
          onClick={handleInvest}
          style={{
            background: '#cd4420',
            border: 'none',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            padding: '5px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            letterSpacing: 0.5,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#e05530')}
          onMouseLeave={e => (e.currentTarget.style.background = '#cd4420')}
        >
          INVEST
        </button>
        {feedback && (
          <span style={{ color: feedback.includes('!') ? '#2ecc71' : '#e74c3c', fontSize: 11, fontFamily: 'monospace' }}>
            {feedback}
          </span>
        )}
      </div>
    </div>
  )
}

// ── SettlementEconomyPanel ─────────────────────────────────────────────────────

export function SettlementEconomyPanel() {
  const [economies, setEconomies] = useState<SettlementEconomy[]>(() => getSettlementEconomies())
  const playerGold = usePlayerStore(s => s.gold)

  // Refresh every 5 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setEconomies(getSettlementEconomies())
    }, 5_000)
    return () => clearInterval(id)
  }, [])

  const handleInvest = useCallback(() => {
    // Refresh immediately after investment
    setEconomies(getSettlementEconomies())
  }, [])

  // Summary stats
  const totalPop = economies.reduce((acc, e) => acc + Math.floor(e.population), 0)
  const wealthiest = economies.reduce<SettlementEconomy | null>((best, e) =>
    !best || e.wealth > best.wealth ? e : best, null)

  return (
    <div style={{ fontFamily: 'monospace' }}>
      {/* Summary */}
      <div style={{
        background: 'rgba(205,68,32,0.08)',
        border: '1px solid rgba(205,68,32,0.2)',
        borderRadius: 6,
        padding: '10px 14px',
        marginBottom: 14,
      }}>
        <div style={{ color: '#cd4420', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>WORLD SUMMARY</div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ color: '#555', fontSize: 10 }}>TOTAL POPULATION</div>
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{totalPop.toLocaleString()}</div>
          </div>
          {wealthiest && (
            <div>
              <div style={{ color: '#555', fontSize: 10 }}>WEALTHIEST</div>
              <div style={{ color: '#f0c040', fontSize: 13, fontWeight: 700 }}>
                {wealthiest.name}
              </div>
              <div style={{ color: '#888', fontSize: 10 }}>
                {Math.floor(wealthiest.wealth)} wealth
              </div>
            </div>
          )}
          <div>
            <div style={{ color: '#555', fontSize: 10 }}>YOUR GOLD</div>
            <div style={{ color: '#f0c040', fontSize: 13, fontWeight: 700 }}>{playerGold}g</div>
          </div>
        </div>
      </div>

      {/* Investment hint */}
      <div style={{ color: '#555', fontSize: 10, marginBottom: 12, letterSpacing: 0.5 }}>
        Invest 50–500g per click. Higher prosperity grants reputation bonuses.
      </div>

      {/* Settlement cards */}
      {economies.map(eco => (
        <SettlementCard
          key={eco.settlementId}
          eco={eco}
          playerGold={playerGold}
          onInvest={handleInvest}
        />
      ))}
    </div>
  )
}
