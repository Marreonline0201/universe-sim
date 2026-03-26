// PlayerHousingPanel.tsx - M64 Track B: Player Housing Panel
// House tiers, upgrades, bonuses display

import { useState, useEffect, useCallback } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import {
  getPlayerHouse,
  getAllUpgrades,
  upgradeHouseTier,
  purchaseHousingUpgrade,
  getTierInfo,
  renameHouse,
  type HouseTier,
  type HouseUpgrade,
} from '../../game/PlayerHousingSystem'

const TIER_ICONS: Record<HouseTier, string> = {
  tent: '⛺', cabin: '🏠', cottage: '🏡', manor: '🏘️', castle: '🏰',
}

const TIER_COLORS: Record<HouseTier, string> = {
  tent: '#888', cabin: '#4ade80', cottage: '#60a5fa', manor: '#a78bfa', castle: '#f59e0b',
}

const TIER_NAMES: Record<HouseTier, string> = {
  tent: 'Tent', cabin: 'Cabin', cottage: 'Cottage', manor: 'Manor', castle: 'Castle',
}

const TIER_ORDER_IDX: Record<HouseTier, number> = {
  tent: 0, cabin: 1, cottage: 2, manor: 3, castle: 4,
}

function snap() {
  return {
    house: getPlayerHouse(),
    upgrades: getAllUpgrades(),
    tierInfo: getTierInfo(),
    gold: usePlayerStore.getState().gold,
  }
}

export function PlayerHousingPanel() {
  const [state, setState] = useState(snap)
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(state.house.name)

  const refresh = useCallback(() => setState(snap()), [])

  useEffect(() => {
    window.addEventListener('player-housing-tier', refresh)
    window.addEventListener('player-housing-upgrade', refresh)
    const unsub = usePlayerStore.subscribe(() => setState(snap()))
    return () => {
      window.removeEventListener('player-housing-tier', refresh)
      window.removeEventListener('player-housing-upgrade', refresh)
      unsub()
    }
  }, [refresh])

  const { house, upgrades, tierInfo, gold } = state
  const tierColor = TIER_COLORS[house.tier]
  const tierIcon = TIER_ICONS[house.tier]

  function handleRename() {
    renameHouse(nameInput)
    setEditing(false)
    refresh()
  }

  function handleUpgradeTier() {
    upgradeHouseTier()
    refresh()
  }

  function handleBuyUpgrade(id: string) {
    purchaseHousingUpgrade(id)
    refresh()
  }

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#ccc', padding: 4 }}>

      {/* House header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '12px',
        background: 'rgba(255,255,255,0.04)', borderRadius: 6, border: `1px solid ${tierColor}44` }}>
        <span style={{ fontSize: 32 }}>{tierIcon}</span>
        <div style={{ flex: 1 }}>
          {editing ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRename() }}
                style={{ background: '#1a1a1a', border: '1px solid #444', color: '#fff',
                  padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', fontSize: 13, flex: 1 }}
                autoFocus
              />
              <button onClick={handleRename}
                style={{ background: tierColor, border: 'none', color: '#000', padding: '4px 8px',
                  borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
                SAVE
              </button>
              <button onClick={() => setEditing(false)}
                style={{ background: '#333', border: 'none', color: '#aaa', padding: '4px 8px',
                  borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontSize: 11 }}>
                ✕
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{house.name}</span>
              <button onClick={() => { setNameInput(house.name); setEditing(true) }}
                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 11, padding: 2 }}>
                ✏️
              </button>
            </div>
          )}
          <span style={{ color: tierColor, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {TIER_NAMES[house.tier]}
          </span>
        </div>
      </div>

      {/* Upgrade tier button */}
      {tierInfo.next && (
        <button
          onClick={handleUpgradeTier}
          disabled={gold < tierInfo.nextCost}
          style={{
            width: '100%', marginBottom: 16, padding: '10px',
            background: gold >= tierInfo.nextCost ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
            border: gold >= tierInfo.nextCost ? '1px solid #f59e0b' : '1px solid #333',
            color: gold >= tierInfo.nextCost ? '#f59e0b' : '#555',
            borderRadius: 6,
            cursor: gold >= tierInfo.nextCost ? 'pointer' : 'not-allowed',
            fontFamily: 'monospace', fontSize: 12, fontWeight: 700, letterSpacing: 1,
          }}
        >
          UPGRADE TO {TIER_NAMES[tierInfo.next!].toUpperCase()} {TIER_ICONS[tierInfo.next!]}
          {` \u2014 ${tierInfo.nextCost.toLocaleString()} GOLD`}
          {gold < tierInfo.nextCost && (
            <span style={{ fontSize: 10, marginLeft: 8, opacity: 0.6 }}>
              (need {(tierInfo.nextCost - gold).toLocaleString()} more)
            </span>
          )}
        </button>
      )}
      {!tierInfo.next && (
        <div style={{ textAlign: 'center', color: '#f59e0b', marginBottom: 16, fontSize: 11, letterSpacing: 1 }}>
          MAX TIER REACHED
        </div>
      )}

      {/* Active bonuses */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: '#666', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
          marginBottom: 8, borderBottom: '1px solid #222', paddingBottom: 4 }}>Active Bonuses</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <BonusChip label="Storage" value={house.storageBonus > 0 ? `+${house.storageBonus} slots` : "None"} />
          <BonusChip label="XP" value={house.xpBonus > 0 ? `+${house.xpBonus}%` : "None"} />
          <BonusChip label="Gold" value={house.goldBonus > 0 ? `+${house.goldBonus}%` : "None"} />
        </div>
      </div>

      {/* Comfort meter */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 10, color: '#888' }}>
          <span>COMFORT</span>
          <span>{house.comfortLevel}/100</span>
        </div>
        <div style={{ height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${house.comfortLevel}%`,
            background: `linear-gradient(90deg, #4ade80, ${tierColor})`, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Upgrades grid */}
      <div style={{ color: '#666', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
        marginBottom: 8, borderBottom: '1px solid #222', paddingBottom: 4 }}>Upgrades</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {upgrades.map(u => (
          <UpgradeCard
            key={u.id}
            upgrade={u}
            canBuy={!u.purchased && gold >= u.cost && TIER_ORDER_IDX[house.tier] >= TIER_ORDER_IDX[u.requires]}
            meetsRequirement={TIER_ORDER_IDX[house.tier] >= TIER_ORDER_IDX[u.requires]}
            onBuy={handleBuyUpgrade}
          />
        ))}
      </div>
    </div>
  )
}

function BonusChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '4px 8px',
      display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ color: '#555', fontSize: 10 }}>{label}</span>
      <span style={{ color: value !== 'None' ? '#4ade80' : '#444', fontSize: 11, fontWeight: 700 }}>{value}</span>
    </div>
  )
}

interface UpgradeCardProps {
  upgrade: HouseUpgrade
  canBuy: boolean
  meetsRequirement: boolean
  onBuy: (id: string) => void
}

function UpgradeCard({ upgrade, canBuy, meetsRequirement, onBuy }: UpgradeCardProps) {
  const owned = upgrade.purchased
  const locked = !meetsRequirement

  let borderColor = '#222'
  if (owned) borderColor = '#166534'
  else if (canBuy) borderColor = '#854d0e'

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 6, padding: 10,
      background: owned ? 'rgba(20,83,45,0.2)' : locked ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
      opacity: locked ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>{upgrade.icon}</span>
        {owned && <span style={{ color: '#4ade80', fontSize: 10, fontWeight: 700, alignSelf: 'center' }}>✓ OWNED</span>}
      </div>
      <div style={{ fontWeight: 700, color: '#ddd', marginBottom: 3, fontSize: 11 }}>{upgrade.name}</div>
      <div style={{ color: '#4ade80', fontSize: 10, marginBottom: 4 }}>{upgrade.effect}</div>
      {locked && (
        <div style={{ color: '#666', fontSize: 9, letterSpacing: 0.5 }}>
          Requires: {upgrade.requires.charAt(0).toUpperCase() + upgrade.requires.slice(1)}
        </div>
      )}
      {!owned && !locked && (
        <button
          onClick={() => onBuy(upgrade.id)}
          disabled={!canBuy}
          style={{
            marginTop: 6, width: '100%', padding: '5px',
            background: canBuy ? 'rgba(245,158,11,0.15)' : 'transparent',
            border: canBuy ? '1px solid #f59e0b' : '1px solid #333',
            color: canBuy ? '#f59e0b' : '#555',
            borderRadius: 4, cursor: canBuy ? 'pointer' : 'not-allowed',
            fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
          }}
        >
          {canBuy ? 'BUY' : 'NEED GOLD'} — {upgrade.cost.toLocaleString()}g
        </button>
      )}
    </div>
  )
}