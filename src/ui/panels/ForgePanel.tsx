// ── ForgePanel.tsx ─────────────────────────────────────────────────────────────
// M43 Track A: Forge / Weapon Upgrade panel.
// Shows equipped weapon stats, available upgrade paths, and a stat comparison.
// Hotkey: V

import { useState, useEffect } from 'react'
import { inventory } from '../../game/GameSingletons'
import { ITEM, MAT } from '../../player/Inventory'
import { getItemStats } from '../../player/EquipSystem'
import {
  UPGRADE_PATHS,
  getUpgradePathForItem,
  canUpgrade,
  performUpgrade,
  type UpgradePath,
} from '../../game/WeaponUpgradeSystem'
import { usePlayerStore } from '../../store/playerStore'
import { useSettlementStore } from '../../store/settlementStore'
import { useBuildingStore } from '../../store/buildingStore'
import { useUiStore } from '../../store/uiStore'

// ── Name lookup helpers ─────────────────────────────────────────────────────────

const ITEM_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

function capitalize(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

function itemName(itemId: number): string {
  // Prefer EquipSystem's human name (e.g. "Iron Sword"), fall back to enum key
  const stats = getItemStats(itemId)
  if (stats.name !== 'Hand') return stats.name
  return capitalize(ITEM_NAMES[itemId] ?? `item #${itemId}`)
}

function matName(matId: number): string {
  return capitalize(MAT_NAMES[matId] ?? `mat #${matId}`)
}

// ── ForgePanel component ────────────────────────────────────────────────────────

export function ForgePanel() {
  const addNotification = useUiStore((s: ReturnType<typeof useUiStore.getState>) => s.addNotification)
  const equippedSlot    = usePlayerStore(s => s.equippedSlot)
  const nearSettlementId = useSettlementStore(s => s.nearSettlementId)
  const isBuildingComplete = useBuildingStore(s => s.isBuildingComplete)

  const [selectedPath, setSelectedPath] = useState<UpgradePath | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageOk, setMessageOk] = useState(true)
  const [, forceRefresh] = useState(0)

  // Refresh inventory counts every 400ms
  useEffect(() => {
    const id = setInterval(() => forceRefresh(r => r + 1), 400)
    return () => clearInterval(id)
  }, [])

  // Reset selection when equipped weapon changes
  useEffect(() => {
    setSelectedPath(null)
  }, [equippedSlot])

  // ── Derived state ─────────────────────────────────────────────────────────

  // Determine if a completed forge building is nearby
  const hasForge = nearSettlementId != null && isBuildingComplete(nearSettlementId, 'forge')

  // Currently equipped weapon item
  const equippedInventorySlot = equippedSlot != null ? inventory.getSlot(equippedSlot) : null
  const equippedItemId = equippedInventorySlot?.itemId ?? 0

  // Weapon stats for currently equipped item
  const equippedStats = equippedItemId > 0 ? getItemStats(equippedItemId) : null

  // Upgrade paths available for this weapon
  const upgradePath = equippedItemId > 0 ? getUpgradePathForItem(equippedItemId) : null
  const allPathsForWeapon = equippedItemId > 0
    ? UPGRADE_PATHS.filter(p => p.fromItemId === equippedItemId)
    : []

  // Stat comparison for selected path
  const comparisonPath = selectedPath ?? upgradePath
  const toStats = comparisonPath ? getItemStats(comparisonPath.toItemId) : null

  // Can-upgrade check for selected path
  const upgradeCheck = comparisonPath && equippedSlot != null
    ? canUpgrade(comparisonPath.fromItemId, inventory, hasForge)
    : null

  // ── Handlers ──────────────────────────────────────────────────────────────

  function showMessage(text: string, ok: boolean) {
    setMessage(text)
    setMessageOk(ok)
    setTimeout(() => setMessage(null), 2800)
  }

  function handleUpgrade(path: UpgradePath) {
    if (equippedSlot == null) {
      showMessage('No weapon equipped.', false)
      return
    }
    const check = canUpgrade(path.fromItemId, inventory, hasForge)
    if (!check.canUpgrade) {
      showMessage(check.reason, false)
      return
    }
    const ok = performUpgrade(path.fromItemId, inventory, equippedSlot)
    if (ok) {
      const toName = itemName(path.toItemId)
      addNotification(`Upgraded to ${toName}!`, 'discovery')
      showMessage(`[+] Upgraded to ${toName}!`, true)
      setSelectedPath(null)
      // Unequip since the slot was consumed
      usePlayerStore.getState().unequip()
    } else {
      showMessage('Upgrade failed — check materials and inventory space.', false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderStatDiff(label: string, fromVal: number, toVal: number) {
    const diff = toVal - fromVal
    const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)
    const diffColor = diff > 0 ? '#2ecc71' : diff < 0 ? '#e74c3c' : '#888'
    return (
      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
        <span style={{ color: '#888' }}>{label}</span>
        <span>
          <span style={{ color: '#ccc' }}>{fromVal.toFixed(1)}</span>
          <span style={{ color: '#555' }}> → </span>
          <span style={{ color: '#ccc' }}>{toVal.toFixed(1)}</span>
          <span style={{ color: diffColor, marginLeft: 5 }}>({diffStr})</span>
        </span>
      </div>
    )
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#e8a040', letterSpacing: 1 }}>
        [⚒] FORGE PANEL
      </div>

      {/* Forge proximity indicator */}
      <div style={{
        padding: '5px 10px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        background: hasForge ? 'rgba(232,160,64,0.12)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hasForge ? 'rgba(232,160,64,0.5)' : 'rgba(255,255,255,0.1)'}`,
        color: hasForge ? '#e8a040' : '#555',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span>{hasForge ? '●' : '○'}</span>
        {hasForge ? 'NEAR FORGE' : 'No forge nearby'}
      </div>

      {/* Warning if no forge */}
      {!hasForge && (
        <div style={{
          padding: '6px 10px',
          background: 'rgba(231,76,60,0.08)',
          border: '1px solid rgba(231,76,60,0.3)',
          borderRadius: 4,
          fontSize: 10,
          color: '#e74c3c',
        }}>
          No forge nearby — approach a settlement forge to upgrade weapons.
        </div>
      )}

      {/* Equipped weapon stats */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 0.5, marginBottom: 6 }}>
          EQUIPPED WEAPON
        </div>
        {equippedStats ? (
          <div style={{
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 5,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#e8a040' }}>
              {equippedStats.name}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 3 }}>
              <span style={{ fontSize: 10, color: '#aaa' }}>DMG <span style={{ color: '#fff' }}>{equippedStats.damage}</span></span>
              <span style={{ fontSize: 10, color: '#aaa' }}>RNG <span style={{ color: '#fff' }}>{equippedStats.range.toFixed(1)}m</span></span>
              <span style={{ fontSize: 10, color: '#aaa' }}>PWR <span style={{ color: '#fff' }}>{equippedStats.harvestPower}</span></span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#555', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 5, border: '1px solid rgba(255,255,255,0.06)' }}>
            No weapon equipped. Equip a weapon to see upgrade options.
          </div>
        )}
      </div>

      {/* Upgrade paths for this weapon */}
      {equippedItemId > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 0.5, marginBottom: 6 }}>
            UPGRADE OPTIONS
          </div>
          {allPathsForWeapon.length === 0 ? (
            <div style={{ fontSize: 11, color: '#555' }}>No upgrade path for this weapon.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {allPathsForWeapon.map(path => {
                const check = canUpgrade(path.fromItemId, inventory, hasForge)
                const isSelected = selectedPath?.toItemId === path.toItemId
                return (
                  <div
                    key={`${path.fromItemId}-${path.toItemId}`}
                    onClick={() => setSelectedPath(isSelected ? null : path)}
                    style={{
                      padding: '8px 10px',
                      background: isSelected ? 'rgba(232,160,64,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isSelected ? 'rgba(232,160,64,0.5)' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 5,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(232,160,64,0.3)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)'
                    }}
                  >
                    {/* Path name + upgrade button */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: check.canUpgrade ? '#e8a040' : '#666' }}>
                        {path.upgradeName}
                      </span>
                      <button
                        onClick={ev => { ev.stopPropagation(); handleUpgrade(path) }}
                        disabled={!check.canUpgrade}
                        style={{
                          background: check.canUpgrade ? 'rgba(232,160,64,0.2)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${check.canUpgrade ? 'rgba(232,160,64,0.7)' : '#333'}`,
                          borderRadius: 4,
                          color: check.canUpgrade ? '#e8a040' : '#444',
                          cursor: check.canUpgrade ? 'pointer' : 'not-allowed',
                          padding: '3px 10px',
                          fontSize: 10,
                          fontFamily: 'monospace',
                          fontWeight: 700,
                        }}
                      >
                        UPGRADE
                      </button>
                    </div>

                    {/* Material costs */}
                    <div style={{ fontSize: 10, color: '#888' }}>
                      Cost:{' '}
                      {path.materialCosts.map((c, i) => {
                        const have = inventory.countMaterial(c.materialId)
                        const enough = have >= c.quantity
                        return (
                          <span key={c.materialId}>
                            {i > 0 && <span style={{ color: '#555' }}>,  </span>}
                            <span style={{ color: enough ? '#ccc' : '#e74c3c' }}>
                              {c.quantity}x {matName(c.materialId)}
                            </span>
                            <span style={{ color: '#555' }}> ({have}/{c.quantity})</span>
                          </span>
                        )
                      })}
                      {path.requiresForge && (
                        <span style={{ color: hasForge ? '#e8a040' : '#e74c3c', marginLeft: 8 }}>
                          [Forge {hasForge ? '✓' : '✗'}]
                        </span>
                      )}
                    </div>

                    {/* Failure reason */}
                    {!check.canUpgrade && (
                      <div style={{ fontSize: 9, color: '#e74c3c', opacity: 0.8 }}>
                        {check.reason}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Stat comparison for selected/default upgrade path */}
      {equippedStats && comparisonPath && toStats && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 0.5, marginBottom: 6 }}>
            STAT COMPARISON — {comparisonPath.upgradeName}
          </div>
          <div style={{
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 5,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}>
            {renderStatDiff('Damage',        equippedStats.damage,        toStats.damage)}
            {renderStatDiff('Range (m)',      equippedStats.range,         toStats.range)}
            {renderStatDiff('Harvest Power',  equippedStats.harvestPower,  toStats.harvestPower)}
          </div>
        </div>
      )}

      {/* Message feedback */}
      {message && (
        <div style={{
          padding: '6px 10px',
          background: messageOk ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
          border: `1px solid ${messageOk ? 'rgba(46,204,113,0.4)' : 'rgba(231,76,60,0.4)'}`,
          borderRadius: 4,
          fontSize: 11,
          color: messageOk ? '#2ecc71' : '#e74c3c',
        }}>
          {message}
        </div>
      )}

    </div>
  )
}
