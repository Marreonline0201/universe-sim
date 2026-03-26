// ── HousingUpgradePanel.tsx ──────────────────────────────────────────────────
// M58 Track A: Housing upgrade tree — 15 upgrades across 3 tiers with passive bonuses.
// Embedded inside HousingPanel via "Upgrade Tree" collapsible section.

import { useState, useEffect } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import {
  getUpgrades,
  canPurchase,
  purchaseUpgrade,
  type HousingUpgrade,
} from '../../game/HousingUpgradeSystem'

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  tierLabel: {
    color: '#7c5cbf',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
    marginTop: 12,
    borderBottom: '1px solid #2a2a2a',
    paddingBottom: 3,
  } as React.CSSProperties,
  card: (status: 'owned' | 'available' | 'locked'): React.CSSProperties => ({
    background:
      status === 'owned'
        ? 'rgba(76,175,80,0.08)'
        : status === 'available'
        ? 'rgba(255,255,255,0.04)'
        : 'rgba(255,255,255,0.02)',
    border: `1px solid ${
      status === 'owned' ? '#4caf50' : status === 'available' ? '#333' : '#222'
    }`,
    borderRadius: 4,
    padding: '10px 12px',
    marginBottom: 8,
    opacity: status === 'locked' ? 0.6 : 1,
  }),
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  } as React.CSSProperties,
  cardTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: '#e0e0e0',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 700,
  } as React.CSSProperties,
  cardDesc: {
    color: '#777',
    fontFamily: 'monospace',
    fontSize: 10,
    marginBottom: 3,
  } as React.CSSProperties,
  cardBonus: {
    color: '#00e5ff',
    fontFamily: 'monospace',
    fontSize: 11,
    marginBottom: 5,
  } as React.CSSProperties,
  cardCost: (canAfford: boolean): React.CSSProperties => ({
    color: canAfford ? '#888' : '#e53935',
    fontFamily: 'monospace',
    fontSize: 10,
    marginBottom: 5,
  }),
  prereqList: {
    color: '#e53935',
    fontFamily: 'monospace',
    fontSize: 10,
    marginBottom: 5,
  } as React.CSSProperties,
  statusBadge: (status: 'owned' | 'available' | 'locked'): React.CSSProperties => ({
    color: status === 'owned' ? '#4caf50' : status === 'locked' ? '#555' : '#ffd54f',
    fontFamily: 'monospace',
    fontSize: 9,
    letterSpacing: 1,
    flexShrink: 0,
  }),
  buyBtn: (disabled: boolean): React.CSSProperties => ({
    background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(124,92,191,0.18)',
    border: `1px solid ${disabled ? '#2a2a2a' : '#7c5cbf'}`,
    color: disabled ? '#444' : '#c9a0ff',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    padding: '4px 14px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: 3,
    transition: 'all 0.12s',
  }),
  flash: {
    background: 'rgba(124,92,191,0.18)',
    border: '1px solid #7c5cbf',
    color: '#c9a0ff',
    fontFamily: 'monospace',
    fontSize: 11,
    padding: '6px 12px',
    borderRadius: 3,
    marginBottom: 12,
    textAlign: 'center' as const,
  } as React.CSSProperties,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getUpgradeStatus(
  upgrade: HousingUpgrade,
  allUpgrades: HousingUpgrade[],
  gold: number
): 'owned' | 'available' | 'locked' {
  if (upgrade.purchased) return 'owned'
  // Check if all prerequisites are met
  const prereqsMet = upgrade.requires.every(reqId => {
    const req = allUpgrades.find(u => u.id === reqId)
    return req?.purchased === true
  })
  if (!prereqsMet) return 'locked'
  // Prerequisites met — available (regardless of gold)
  return 'available'
}

function getMissingPrereqs(
  upgrade: HousingUpgrade,
  allUpgrades: HousingUpgrade[]
): string[] {
  return upgrade.requires
    .filter(reqId => {
      const req = allUpgrades.find(u => u.id === reqId)
      return !req?.purchased
    })
    .map(reqId => {
      const req = allUpgrades.find(u => u.id === reqId)
      return req ? `${req.icon} ${req.name}` : reqId
    })
}

// ── Component ─────────────────────────────────────────────────────────────────
export function HousingUpgradePanel() {
  const gold = usePlayerStore(s => s.gold)
  const [upgrades, setUpgrades] = useState<HousingUpgrade[]>(() => getUpgrades())
  const [flashMsg, setFlashMsg] = useState<string | null>(null)

  // Listen for housing-upgrade events and refresh
  useEffect(() => {
    const onUpgrade = () => setUpgrades(getUpgrades())
    window.addEventListener('housing-upgrade', onUpgrade)
    return () => window.removeEventListener('housing-upgrade', onUpgrade)
  }, [])

  function handleBuy(id: string) {
    const ok = purchaseUpgrade(id)
    if (ok) {
      setUpgrades(getUpgrades())
      const upg = upgrades.find(u => u.id === id)
      setFlashMsg(`${upg?.icon ?? ''} ${upg?.name ?? 'Upgrade'} purchased!`)
      setTimeout(() => setFlashMsg(null), 2500)
    }
  }

  const tier1 = upgrades.filter(u => u.tier === 1)
  const tier2 = upgrades.filter(u => u.tier === 2)
  const tier3 = upgrades.filter(u => u.tier === 3)

  function renderUpgrade(upgrade: HousingUpgrade) {
    const status = getUpgradeStatus(upgrade, upgrades, gold)
    const missingPrereqs = status === 'locked' ? getMissingPrereqs(upgrade, upgrades) : []
    const canAfford = gold >= upgrade.cost.gold
    const buyDisabled = status !== 'available' || !canAfford

    return (
      <div key={upgrade.id} style={S.card(status)}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>
            <span>{upgrade.icon}</span>
            <span>{upgrade.name}</span>
          </span>
          <span style={S.statusBadge(status)}>
            {status === 'owned' ? 'OWNED' : status === 'locked' ? 'LOCKED' : 'CAN BUY'}
          </span>
        </div>

        <div style={S.cardDesc}>{upgrade.description}</div>
        <div style={S.cardBonus}>{upgrade.bonus}</div>

        {status !== 'owned' && (
          <div style={S.cardCost(canAfford)}>
            Cost: {upgrade.cost.gold}g
            {' '}
            <span style={{ color: canAfford ? '#4caf50' : '#e53935' }}>
              ({gold}/{upgrade.cost.gold})
            </span>
          </div>
        )}

        {missingPrereqs.length > 0 && (
          <div style={S.prereqList}>
            Requires: {missingPrereqs.join(', ')}
          </div>
        )}

        {status !== 'owned' && (
          <button
            style={S.buyBtn(buyDisabled)}
            disabled={buyDisabled}
            onClick={() => !buyDisabled && handleBuy(upgrade.id)}
            onMouseEnter={e => {
              if (!buyDisabled) e.currentTarget.style.background = 'rgba(124,92,191,0.32)'
            }}
            onMouseLeave={e => {
              if (!buyDisabled) e.currentTarget.style.background = 'rgba(124,92,191,0.18)'
            }}
          >
            BUY
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'monospace' }}>
      {flashMsg && <div style={S.flash}>{flashMsg}</div>}

      <div style={S.tierLabel}>Tier 1 — Foundation</div>
      {tier1.map(renderUpgrade)}

      <div style={S.tierLabel}>Tier 2 — Expanded</div>
      {tier2.map(renderUpgrade)}

      <div style={S.tierLabel}>Tier 3 — Master</div>
      {tier3.map(renderUpgrade)}
    </div>
  )
}
