// src/ui/panels/TradeRoutesPanel.tsx
// M56 Track A: Dynamic NPC Trade Routes panel

import { useState, useEffect } from 'react'
import { getTradeRoutes, type TradeRoute, type RouteStatus } from '../../game/TradeRouteSystem'

function StatusBadge({ status }: { status: RouteStatus }) {
  const config: Record<RouteStatus, { label: string; color: string; bg: string }> = {
    active:    { label: 'ACTIVE',    color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
    disrupted: { label: 'DISRUPTED', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
    completed: { label: 'COMPLETED', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  }
  const c = config[status]
  return (
    <span style={{
      background: c.bg,
      border: `1px solid ${c.color}`,
      color: c.color,
      borderRadius: 3,
      padding: '2px 6px',
      fontFamily: 'monospace',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 0.5,
    }}>
      {c.label}
    </span>
  )
}

function RouteCard({ route }: { route: TradeRoute }) {
  const etaSeconds = Math.max(0, route.estimatedArrival - route.departedAt) * (1 - route.progressPct / 100)
  const etaDisplay = route.progressPct >= 100
    ? 'Arrived'
    : `${Math.round(etaSeconds)}s remaining`

  return (
    <div style={{
      background: '#0e0e0e',
      border: `1px solid ${route.status === 'disrupted' ? 'rgba(251,191,36,0.3)' : '#2a2a2a'}`,
      borderRadius: 6,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Route header: from → to + cargo + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 16 }}>{route.cargoIcon}</span>
          <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {route.fromName}
            <span style={{ color: '#555', margin: '0 4px' }}>→</span>
            {route.toName}
          </span>
        </div>
        <StatusBadge status={route.status} />
      </div>

      {/* Cargo label */}
      <div style={{ color: '#888', fontFamily: 'monospace', fontSize: 10 }}>
        Cargo: <span style={{ color: '#ccc' }}>{route.cargoType}</span>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          height: 4,
          background: '#1a1a1a',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${route.progressPct}%`,
            background: route.status === 'disrupted' ? '#fbbf24' : '#4ade80',
            borderRadius: 2,
            transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 10 }}>
            {Math.round(route.progressPct)}%
          </span>
          <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 10 }}>
            {etaDisplay}
          </span>
        </div>
      </div>

      {/* Disruption reason */}
      {route.status === 'disrupted' && route.disruptionReason && (
        <div style={{
          color: '#fbbf24',
          fontFamily: 'monospace',
          fontSize: 10,
          background: 'rgba(251,191,36,0.06)',
          border: '1px solid rgba(251,191,36,0.15)',
          borderRadius: 3,
          padding: '4px 8px',
        }}>
          ⚠ {route.disruptionReason}
        </div>
      )}
    </div>
  )
}

export function TradeRoutesPanel() {
  const [routes, setRoutes] = useState<TradeRoute[]>(() => getTradeRoutes())

  useEffect(() => {
    function refresh() {
      setRoutes(getTradeRoutes())
    }

    // Refresh on completed trade route event
    window.addEventListener('trade-route-completed', refresh)

    // Refresh every 5 seconds to update progress bars
    const interval = setInterval(refresh, 5_000)

    return () => {
      window.removeEventListener('trade-route-completed', refresh)
      clearInterval(interval)
    }
  }, [])

  const activeCount = routes.filter(r => r.status === 'active').length
  const disruptedCount = routes.filter(r => r.status === 'disrupted').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{
        background: '#111',
        border: '1px solid #2a2a2a',
        borderRadius: 6,
        padding: '10px 14px',
      }}>
        <div style={{ color: '#fff', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ACTIVE TRADE ROUTES
        </div>
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 10, marginTop: 4 }}>
          NPC merchant caravans between settlements
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <span style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: 11 }}>
            {activeCount} active
          </span>
          {disruptedCount > 0 && (
            <span style={{ color: '#fbbf24', fontFamily: 'monospace', fontSize: 11 }}>
              {disruptedCount} disrupted
            </span>
          )}
          <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 11 }}>
            {routes.length} total
          </span>
        </div>
      </div>

      {/* Route list */}
      {routes.length === 0 ? (
        <div style={{
          color: '#444',
          fontFamily: 'monospace',
          fontSize: 12,
          padding: '32px 0',
          textAlign: 'center',
          borderTop: '1px solid #1e1e1e',
        }}>
          No active trade routes. Check back soon.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {routes.map(route => (
            <RouteCard key={route.id} route={route} />
          ))}
        </div>
      )}

    </div>
  )
}
