// ── TradingRoutesPanel.tsx ────────────────────────────────────────────────────
// M49 Track B: Manage settlement trading routes.

import { useState, useEffect } from 'react'
import { useSettlementStore } from '../../store/settlementStore'
import {
  getRoutes,
  establishRoute,
  removeRoute,
  canEstablishRoute,
  MAX_ROUTES,
  type TradingRoute,
} from '../../game/TradingRouteSystem'

export function TradingRoutesPanel() {
  const settlements = useSettlementStore(s => s.settlements)
  const [routes, setRoutes] = useState<TradingRoute[]>(() => getRoutes())
  const [fromId, setFromId] = useState<string>('')
  const [toId, setToId] = useState<string>('')

  // Re-sync when routes change
  useEffect(() => {
    function onRouteEstablished() {
      setRoutes([...getRoutes()])
    }
    window.addEventListener('trade-route-established', onRouteEstablished)
    return () => window.removeEventListener('trade-route-established', onRouteEstablished)
  }, [])

  const settList = Array.from(settlements.values())
  const activeRoutes = routes.filter(r => r.active)

  const totalGoldPerTick = activeRoutes.reduce((sum, r) => sum + r.goldPerTick, 0)
  const goldPerSecond = (totalGoldPerTick / 10).toFixed(1)

  const fromIdNum = parseInt(fromId, 10)
  const toIdNum = parseInt(toId, 10)
  const canAdd = fromId !== '' && toId !== '' && !isNaN(fromIdNum) && !isNaN(toIdNum)
    && canEstablishRoute(fromIdNum, toIdNum)

  function handleEstablish() {
    if (!canAdd) return
    const fromSett = settlements.get(fromIdNum)
    const toSett = settlements.get(toIdNum)
    if (!fromSett || !toSett) return
    establishRoute(fromIdNum, fromSett.name, toIdNum, toSett.name)
    setRoutes([...getRoutes()])
    setFromId('')
    setToId('')
  }

  function handleRemove(routeId: string) {
    removeRoute(routeId)
    setRoutes([...getRoutes()])
  }

  const selectStyle: React.CSSProperties = {
    background: '#1a1a1a',
    border: '1px solid #333',
    color: '#ccc',
    padding: '6px 8px',
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 12,
    flex: 1,
    cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header stats */}
      <div style={{
        background: '#111',
        border: '1px solid #2a2a2a',
        borderRadius: 6,
        padding: '10px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: '#888', fontFamily: 'monospace', fontSize: 11 }}>
          ACTIVE ROUTES
        </span>
        <span style={{ color: '#facc15', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
          {activeRoutes.length} / {MAX_ROUTES}
        </span>
      </div>

      {totalGoldPerTick > 0 && (
        <div style={{
          background: 'rgba(250,204,21,0.08)',
          border: '1px solid rgba(250,204,21,0.2)',
          borderRadius: 4,
          padding: '8px 12px',
          fontFamily: 'monospace',
          fontSize: 12,
          color: '#facc15',
        }}>
          Income: +{goldPerSecond} gold/sec across all routes
        </div>
      )}

      {/* Establish new route */}
      {activeRoutes.length < MAX_ROUTES && (
        <div style={{
          background: '#0e0e0e',
          border: '1px solid #2a2a2a',
          borderRadius: 6,
          padding: 14,
        }}>
          <div style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 11, marginBottom: 10, letterSpacing: 1 }}>
            ESTABLISH NEW ROUTE
          </div>

          {settList.length < 2 ? (
            <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 12 }}>
              No settlements available. Explore to discover settlements.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={fromId}
                  onChange={e => setFromId(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">— From —</option>
                  {settList.map(s => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
                <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 14 }}>→</span>
                <select
                  value={toId}
                  onChange={e => setToId(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">— To —</option>
                  {settList.map(s => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </div>

              {fromId && toId && fromId === toId && (
                <div style={{ color: '#ef4444', fontFamily: 'monospace', fontSize: 11 }}>
                  Cannot route a settlement to itself.
                </div>
              )}
              {fromId && toId && fromId !== toId && !isNaN(fromIdNum) && !isNaN(toIdNum)
                && !canEstablishRoute(fromIdNum, toIdNum) && (
                <div style={{ color: '#f97316', fontFamily: 'monospace', fontSize: 11 }}>
                  Route already exists between these settlements.
                </div>
              )}

              <button
                onClick={handleEstablish}
                disabled={!canAdd}
                style={{
                  background: canAdd ? '#cd4420' : '#1a1a1a',
                  border: `1px solid ${canAdd ? '#cd4420' : '#333'}`,
                  color: canAdd ? '#fff' : '#444',
                  borderRadius: 4,
                  padding: '7px 14px',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  cursor: canAdd ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  transition: 'all 0.15s',
                }}
              >
                Establish Route
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active routes list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 11, letterSpacing: 1 }}>
          ACTIVE ROUTES
        </div>

        {activeRoutes.length === 0 ? (
          <div style={{
            color: '#444',
            fontFamily: 'monospace',
            fontSize: 12,
            padding: '24px 0',
            textAlign: 'center',
            borderTop: '1px solid #1e1e1e',
          }}>
            No trading routes established.<br />
            <span style={{ color: '#333' }}>Find two settlements and connect them.</span>
          </div>
        ) : (
          activeRoutes.map(route => (
            <div
              key={route.id}
              style={{
                background: '#0e0e0e',
                border: '1px solid #2a2a2a',
                borderRadius: 6,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {/* Route header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
                  {route.fromName}
                  <span style={{ color: '#555', margin: '0 6px' }}>→</span>
                  {route.toName}
                </span>
                <button
                  onClick={() => handleRemove(route.id)}
                  title="Remove route"
                  style={{
                    background: 'none',
                    border: '1px solid #333',
                    color: '#555',
                    borderRadius: 3,
                    padding: '2px 8px',
                    fontFamily: 'monospace',
                    fontSize: 10,
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#ef4444'
                    e.currentTarget.style.borderColor = '#ef4444'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = '#555'
                    e.currentTarget.style.borderColor = '#333'
                  }}
                >
                  Remove
                </button>
              </div>

              {/* Route stats */}
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ color: '#facc15', fontFamily: 'monospace', fontSize: 11 }}>
                  +{route.goldPerTick}g / 10s
                </span>
                <span style={{ color: '#a78bfa', fontFamily: 'monospace', fontSize: 11 }}>
                  +{route.reputationPerTick} rep / 10s
                </span>
                <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 11 }}>
                  Total: {route.totalGoldEarned}g earned
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
