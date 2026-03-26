// src/ui/panels/ResourceTradingNetworkPanel.tsx
// M66 Track C: Resource Trading Network Panel
// Shows settlement-to-settlement trade routes with prices, investment slots.

import { useState, useEffect, useCallback } from 'react'
import {
  getTradeRoutes,
  investInRoute,
  withdrawFromRoute,
  getPriceDirection,
  getPriceChangedAt,
  type TradeRoute,
} from '../../game/ResourceTradingNetwork'
import { usePlayerStore } from '../../store/playerStore'

// ── Resource icon map ─────────────────────────────────────────────────────────

const RESOURCE_ICON: Record<string, string> = {
  iron_ore:  '⛏',
  wood:      '🪵',
  stone:     '🪨',
  fiber:     '🌿',
  coal:      '🪨',
  copper_ore:'⛏',
  gold:      '🪙',
  default:   '📦',
}

function getResourceIcon(resource: string): string {
  return RESOURCE_ICON[resource] ?? RESOURCE_ICON.default
}

function formatResource(resource: string): string {
  return resource.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── CycleTimer ────────────────────────────────────────────────────────────────

function CycleTimer({ route }: { route: TradeRoute }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // We don't have real-time simSeconds here, so show a progress indicator
  // using lastTradedAt as a reference (0 = ready)
  const cycleMs = route.cycleSeconds * 1000
  // Use a visual approximation: show "READY" if lastTradedAt is 0 (never traded)
  // Otherwise estimate based on wall-clock (rough, good enough for UI)
  const elapsed = route.lastTradedAt === 0 ? cycleMs : (now % cycleMs)
  const pct = Math.min((elapsed / cycleMs) * 100, 100)
  const secsLeft = Math.ceil(((cycleMs - elapsed) / 1000))

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#888', fontSize: 10, fontFamily: 'monospace' }}>CYCLE</span>
        <span style={{ color: '#aaa', fontSize: 10, fontFamily: 'monospace' }}>
          {route.lastTradedAt === 0 ? 'READY' : `${secsLeft}s`}
        </span>
      </div>
      <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: pct >= 100 ? '#2ecc71' : '#cd4420',
          borderRadius: 2,
          transition: 'width 1s linear',
        }} />
      </div>
    </div>
  )
}

// ── PriceDisplay ──────────────────────────────────────────────────────────────

function PriceDisplay({ route }: { route: TradeRoute }) {
  const direction = getPriceDirection(route.id)
  const arrow = direction === 'up' ? ' ▲' : direction === 'down' ? ' ▼' : ''
  const arrowColor = direction === 'up' ? '#2ecc71' : direction === 'down' ? '#e74c3c' : '#888'

  return (
    <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#e0c070' }}>
      {route.pricePerUnit}g/u
      {arrow && (
        <span style={{ color: arrowColor, fontSize: 10, marginLeft: 2 }}>{arrow}</span>
      )}
    </span>
  )
}

// ── RouteCard ─────────────────────────────────────────────────────────────────

interface RouteCardProps {
  route: TradeRoute
  playerGold: number
  onRefresh: () => void
}

function RouteCard({ route, playerGold, onRefresh }: RouteCardProps) {
  const [investInput, setInvestInput] = useState('100')
  const [withdrawInput, setWithdrawInput] = useState('50')
  const [feedback, setFeedback] = useState<string | null>(null)

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 2500)
  }, [])

  const handleInvest = useCallback(() => {
    const amount = parseInt(investInput, 10)
    if (isNaN(amount) || amount <= 0) {
      showFeedback('Enter a valid amount')
      return
    }
    if (amount > playerGold) {
      showFeedback('Not enough gold!')
      return
    }
    const ok = investInRoute(route.id, amount)
    if (ok) {
      showFeedback(`+${amount}g invested`)
      onRefresh()
    } else {
      showFeedback('Investment failed')
    }
  }, [investInput, playerGold, route.id, showFeedback, onRefresh])

  const handleWithdraw = useCallback(() => {
    const amount = parseInt(withdrawInput, 10)
    if (isNaN(amount) || amount <= 0) {
      showFeedback('Enter a valid amount')
      return
    }
    if (amount > route.playerInvestment) {
      showFeedback(`Only ${route.playerInvestment}g invested`)
      return
    }
    const ok = withdrawFromRoute(route.id, amount)
    if (ok) {
      showFeedback(`-${amount}g withdrawn`)
      onRefresh()
    } else {
      showFeedback('Withdraw failed')
    }
  }, [withdrawInput, route.id, route.playerInvestment, showFeedback, onRefresh])

  const estimatedReturn = ((route.playerInvestment / 100) * route.pricePerUnit * 0.15)

  return (
    <div style={{
      background: '#111',
      border: '1px solid #2a2a2a',
      borderRadius: 6,
      padding: '12px 14px',
      marginBottom: 10,
    }}>
      {/* Route header: from → to */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ color: '#cd4420', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
          {route.fromSettlement}
        </span>
        <span style={{ color: '#555', fontSize: 14 }}>→</span>
        <span style={{ color: '#cd4420', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
          {route.toSettlement}
        </span>
      </div>

      {/* Resource + price row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 12 }}>
          {getResourceIcon(route.resource)} {formatResource(route.resource)}
        </span>
        <PriceDisplay route={route} />
      </div>

      {/* Volume row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 10 }}>VOLUME</span>
        <span style={{ color: '#888', fontFamily: 'monospace', fontSize: 11 }}>
          {route.volumePerCycle} units/cycle
        </span>
      </div>

      {/* Cycle timer */}
      <CycleTimer route={route} />

      {/* Investment info */}
      <div style={{
        marginTop: 10,
        padding: '8px 10px',
        background: '#0a0a0a',
        borderRadius: 4,
        border: '1px solid #1e1e1e',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 10 }}>INVESTED</span>
          <span style={{ color: '#e0c070', fontFamily: 'monospace', fontSize: 11 }}>
            {route.playerInvestment}g
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 10 }}>EST. RETURN/CYCLE</span>
          <span style={{ color: '#2ecc71', fontFamily: 'monospace', fontSize: 11 }}>
            ~{estimatedReturn.toFixed(1)}g
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 10 }}>TOTAL EARNED</span>
          <span style={{ color: '#3498db', fontFamily: 'monospace', fontSize: 11 }}>
            {route.totalProfit.toFixed(1)}g
          </span>
        </div>

        {/* Invest row */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input
            type="number"
            min={1}
            value={investInput}
            onChange={e => setInvestInput(e.target.value)}
            style={{
              flex: 1,
              background: '#181818',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#ddd',
              fontFamily: 'monospace',
              fontSize: 11,
              padding: '4px 6px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleInvest}
            style={{
              background: '#1a3a1a',
              border: '1px solid #2ecc71',
              borderRadius: 4,
              color: '#2ecc71',
              fontFamily: 'monospace',
              fontSize: 10,
              fontWeight: 700,
              padding: '4px 8px',
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            INVEST
          </button>
        </div>

        {/* Withdraw row */}
        {route.playerInvestment > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="number"
              min={1}
              max={route.playerInvestment}
              value={withdrawInput}
              onChange={e => setWithdrawInput(e.target.value)}
              style={{
                flex: 1,
                background: '#181818',
                border: '1px solid #333',
                borderRadius: 4,
                color: '#ddd',
                fontFamily: 'monospace',
                fontSize: 11,
                padding: '4px 6px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleWithdraw}
              style={{
                background: '#2a1a1a',
                border: '1px solid #e74c3c',
                borderRadius: 4,
                color: '#e74c3c',
                fontFamily: 'monospace',
                fontSize: 10,
                fontWeight: 700,
                padding: '4px 8px',
                cursor: 'pointer',
                letterSpacing: 0.5,
              }}
            >
              WITHDRAW
            </button>
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div style={{
            marginTop: 6,
            color: feedback.includes('Not') || feedback.includes('failed') || feedback.includes('Only') ? '#e74c3c' : '#2ecc71',
            fontFamily: 'monospace',
            fontSize: 10,
            textAlign: 'center',
          }}>
            {feedback}
          </div>
        )}
      </div>
    </div>
  )
}

// ── ResourceTradingNetworkPanel ───────────────────────────────────────────────

export function ResourceTradingNetworkPanel() {
  const [routes, setRoutes] = useState<TradeRoute[]>([])
  const playerGold = usePlayerStore(s => s.gold)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => {
    setRoutes([...getTradeRoutes()])
  }, [])

  useEffect(() => {
    refresh()
    // Refresh every 2s to show updated prices / profit
    const id = setInterval(() => {
      setTick(t => t + 1)
      refresh()
    }, 2000)
    return () => clearInterval(id)
  }, [refresh])

  // Also refresh on trade-route-completed events
  useEffect(() => {
    function onTradeComplete() {
      refresh()
    }
    window.addEventListener('trade-route-completed', onTradeComplete)
    return () => window.removeEventListener('trade-route-completed', onTradeComplete)
  }, [refresh])

  const totalInvested = routes.reduce((sum, r) => sum + r.playerInvestment, 0)
  const totalProfit = routes.reduce((sum, r) => sum + r.totalProfit, 0)

  return (
    <div style={{ color: '#ccc', fontFamily: 'monospace', fontSize: 12 }}>
      {/* Header summary */}
      <div style={{
        background: '#0e0e0e',
        border: '1px solid #2a2a2a',
        borderRadius: 6,
        padding: '10px 14px',
        marginBottom: 14,
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ color: '#888', fontSize: 10, marginBottom: 2 }}>TOTAL INVESTED</div>
          <div style={{ color: '#e0c070', fontSize: 16, fontWeight: 700 }}>{totalInvested}g</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#888', fontSize: 10, marginBottom: 2 }}>TOTAL PROFIT EARNED</div>
          <div style={{ color: '#2ecc71', fontSize: 16, fontWeight: 700 }}>{totalProfit.toFixed(1)}g</div>
        </div>
      </div>

      {/* Player gold */}
      <div style={{ color: '#888', fontSize: 10, marginBottom: 10, textAlign: 'right' }}>
        WALLET: <span style={{ color: '#e0c070' }}>{playerGold}g</span>
      </div>

      {/* Route cards */}
      {routes.length === 0 ? (
        <div style={{ color: '#555', textAlign: 'center', padding: 24 }}>
          No trade routes active.
        </div>
      ) : (
        routes.map(route => (
          <RouteCard
            key={route.id}
            route={route}
            playerGold={playerGold}
            onRefresh={refresh}
          />
        ))
      )}

      <div style={{ color: '#444', fontSize: 10, textAlign: 'center', marginTop: 8 }}>
        Invest gold in routes to earn 15% return per cycle.
        Prices fluctuate ±10% each cycle.
      </div>
    </div>
  )
}
