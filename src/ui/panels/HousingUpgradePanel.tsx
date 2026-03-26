// ── HousingUpgradePanel.tsx ──────────────────────────────────────────────────
// M48 Track A: Housing upgrade shop — lets players improve their home base.
// Embedded inside HousingPanel via "Upgrades" section.

import { useState, useEffect } from 'react'
import { inventory } from '../../game/GameSingletons'
import { usePlayerStore } from '../../store/playerStore'
import { MAT } from '../../player/Inventory'
import {
  HOUSING_UPGRADES,
  applyUpgrade,
  isUpgradeOwned,
  getOwnedUpgrades,
} from '../../game/HousingUpgradeSystem'

// Build a material-name lookup
const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [
    v as number,
    k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
  ])
)

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  tabBar: {
    display: 'flex',
    gap: 4,
    marginBottom: 14,
  } as React.CSSProperties,
  tab: (active: boolean, locked: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '5px 0',
    background: active ? 'rgba(124,92,191,0.22)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? '#7c5cbf' : '#2a2a2a'}`,
    borderRadius: 3,
    color: locked ? '#444' : active ? '#c9a0ff' : '#888',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    cursor: locked ? 'not-allowed' : 'pointer',
    textTransform: 'uppercase' as const,
    transition: 'all 0.12s',
  }),
  lockHint: {
    color: '#555',
    fontFamily: 'monospace',
    fontSize: 10,
    fontStyle: 'italic',
    marginBottom: 12,
    textAlign: 'center' as const,
  } as React.CSSProperties,
  card: (owned: boolean, canBuy: boolean): React.CSSProperties => ({
    background: owned ? 'rgba(76,175,80,0.08)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${owned ? '#4caf50' : canBuy ? '#333' : '#5a1a1a'}`,
    borderRadius: 4,
    padding: '10px 12px',
    marginBottom: 8,
  }),
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 3,
  } as React.CSSProperties,
  cardName: {
    color: '#e0e0e0',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 700,
  } as React.CSSProperties,
  cardDesc: {
    color: '#888',
    fontFamily: 'monospace',
    fontSize: 10,
    marginBottom: 4,
  } as React.CSSProperties,
  cardEffect: {
    color: '#00e5ff',
    fontFamily: 'monospace',
    fontSize: 11,
    marginBottom: 6,
  } as React.CSSProperties,
  cardCost: {
    color: '#666',
    fontFamily: 'monospace',
    fontSize: 10,
    marginBottom: 6,
  } as React.CSSProperties,
  ownedBadge: {
    color: '#4caf50',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    flexShrink: 0,
  } as React.CSSProperties,
  purchaseBtn: (disabled: boolean): React.CSSProperties => ({
    background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(124,92,191,0.18)',
    border: `1px solid ${disabled ? '#333' : '#7c5cbf'}`,
    color: disabled ? '#444' : '#c9a0ff',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    padding: '4px 12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: 3,
    transition: 'all 0.12s',
  }),
  flash: {
    background: 'rgba(124,92,191,0.22)',
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

// ── Component ────────────────────────────────────────────────────────────────
export function HousingUpgradePanel() {
  const gold = usePlayerStore(s => s.gold)

  const [activeTab, setActiveTab] = useState<1 | 2 | 3>(1)
  const [, forceRefresh] = useState(0)
  const [flashMsg, setFlashMsg] = useState<string | null>(null)

  // Re-read inventory and owned upgrades on mount and after each purchase event
  useEffect(() => {
    const onUpgrade = () => forceRefresh(r => r + 1)
    window.addEventListener('housing-upgrade', onUpgrade)
    const inv = setInterval(() => forceRefresh(r => r + 1), 500)
    return () => {
      window.removeEventListener('housing-upgrade', onUpgrade)
      clearInterval(inv)
    }
  }, [])

  // Determine which tiers are unlocked
  const owned = getOwnedUpgrades()
  const tier2Unlocked = owned.includes('storage_room')
  const tier3Unlocked = owned.includes('trophy_room')

  function getUnlockedTier(): number {
    if (tier3Unlocked) return 3
    if (tier2Unlocked) return 2
    return 1
  }

  const unlockedTier = getUnlockedTier()

  // When a higher tier gets unlocked, jump to it
  useEffect(() => {
    if (activeTab === 2 && !tier2Unlocked) setActiveTab(1)
    if (activeTab === 3 && !tier3Unlocked) setActiveTab(1)
  }, [tier2Unlocked, tier3Unlocked, activeTab])

  function handlePurchase(upgradeId: string) {
    applyUpgrade(upgradeId)
    forceRefresh(r => r + 1)
    setFlashMsg('Upgrade applied!')
    setTimeout(() => setFlashMsg(null), 2000)
  }

  function canAffordUpgrade(upgradeId: string): boolean {
    const upg = HOUSING_UPGRADES.find(u => u.id === upgradeId)
    if (!upg) return false
    if (gold < upg.cost.gold) return false
    for (const { matId, qty } of upg.cost.materials) {
      if (inventory.countMaterial(matId) < qty) return false
    }
    return true
  }

  const tierUpgrades = HOUSING_UPGRADES.filter(u => u.tier === activeTab)

  return (
    <div style={{ fontFamily: 'monospace' }}>

      {/* Flash notification */}
      {flashMsg && <div style={S.flash}>{flashMsg}</div>}

      {/* Tab bar */}
      <div style={S.tabBar}>
        {([1, 2, 3] as const).map(tier => {
          const locked = tier === 2 ? !tier2Unlocked : tier === 3 ? !tier3Unlocked : false
          const active = activeTab === tier
          return (
            <button
              key={tier}
              style={S.tab(active, locked)}
              onClick={() => !locked && setActiveTab(tier)}
              onMouseEnter={e => {
                if (!locked && !active) {
                  e.currentTarget.style.borderColor = '#7c5cbf'
                  e.currentTarget.style.color = '#c9a0ff'
                }
              }}
              onMouseLeave={e => {
                if (!locked && !active) {
                  e.currentTarget.style.borderColor = '#2a2a2a'
                  e.currentTarget.style.color = '#888'
                }
              }}
            >
              Tier {tier}{locked ? ' 🔒' : ''}
            </button>
          )
        })}
      </div>

      {/* Lock hint */}
      {activeTab === 2 && !tier2Unlocked && (
        <div style={S.lockHint}>Purchase Storage Room (Tier 1) to unlock Tier 2 upgrades.</div>
      )}
      {activeTab === 3 && !tier3Unlocked && (
        <div style={S.lockHint}>Purchase Trophy Room (Tier 2) to unlock Tier 3 upgrades.</div>
      )}

      {/* Upgrade cards */}
      {tierUpgrades.map(upg => {
        const owned = isUpgradeOwned(upg.id)
        const affordable = canAffordUpgrade(upg.id)
        const purchaseDisabled = owned || !affordable

        return (
          <div key={upg.id} style={S.card(owned, affordable)}>
            <div style={S.cardHeader}>
              <span style={S.cardName}>{upg.name}</span>
              {owned && <span style={S.ownedBadge}>OWNED ✓</span>}
            </div>
            <div style={S.cardDesc}>{upg.description}</div>
            <div style={S.cardEffect}>{upg.effect}</div>
            <div style={S.cardCost}>
              <span style={{ color: gold >= upg.cost.gold ? '#888' : '#e53935' }}>
                Gold: {upg.cost.gold}{' '}
                <span style={{ color: gold >= upg.cost.gold ? '#4caf50' : '#e53935' }}>
                  ({gold}/{upg.cost.gold})
                </span>
              </span>
              {upg.cost.materials.map(({ matId, qty }) => {
                const have = inventory.countMaterial(matId)
                const ok = have >= qty
                return (
                  <span key={matId}>
                    {', '}
                    <span style={{ color: ok ? '#888' : '#e53935' }}>
                      {MAT_NAMES[matId] ?? `mat#${matId}`} ×{qty}{' '}
                      <span style={{ color: ok ? '#4caf50' : '#e53935' }}>({have}/{qty})</span>
                    </span>
                  </span>
                )
              })}
            </div>
            {!owned && (
              <button
                style={S.purchaseBtn(purchaseDisabled)}
                disabled={purchaseDisabled}
                onClick={() => !purchaseDisabled && handlePurchase(upg.id)}
                onMouseEnter={e => {
                  if (!purchaseDisabled) {
                    e.currentTarget.style.background = 'rgba(124,92,191,0.32)'
                  }
                }}
                onMouseLeave={e => {
                  if (!purchaseDisabled) {
                    e.currentTarget.style.background = 'rgba(124,92,191,0.18)'
                  }
                }}
              >
                PURCHASE
              </button>
            )}
          </div>
        )
      })}

      {/* Tier unlock hint in the footer of a tier card list */}
      {unlockedTier < 3 && activeTab <= unlockedTier && (
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 10, marginTop: 6, fontStyle: 'italic' }}>
          {unlockedTier === 1
            ? 'Buy Storage Room to unlock Tier 2 upgrades.'
            : 'Buy Trophy Room to unlock Tier 3 upgrades.'}
        </div>
      )}
    </div>
  )
}
