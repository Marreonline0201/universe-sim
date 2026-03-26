// ── HomePanel ───────────────────────────────────────────────────────────────────
// M34 Track A: Player Home Base management panel.
//
// Tabs:
//   Storage  — 20-slot grid. Transfer items between inventory and home storage.
//   Travel   — Fast travel home (free if within 50m, otherwise 20 gold).
//   Upgrade  — 3 tiers: Cozy → Upgraded (+10 slots) → Fortified (chest range)

import React, { useState, useEffect } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { useUiStore, computeFastTravelCost } from '../../store/uiStore'
import { inventory } from '../../game/GameSingletons'
import { MAT, ITEM } from '../../player/Inventory'
import { Position } from '../../ecs/world'

// ── Display name maps ─────────────────────────────────────────────────────────
const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

type HomeTab = 'storage' | 'travel' | 'upgrade'

// Tier upgrade definitions
const TIER_UPGRADES: Array<{
  tier: 0 | 1 | 2
  label: string
  desc: string
  cost: Array<{ matId: number; qty: number; label: string }>
}> = [
  {
    tier: 0,
    label: 'Cozy Cabin',
    desc: '20 storage slots, warm respawn point.',
    cost: [],
  },
  {
    tier: 1,
    label: 'Upgraded Home',
    desc: '+10 storage slots (30 total). Reinforced walls.',
    cost: [
      { matId: MAT.WOOD,  qty: 50, label: '50 Wood' },
      { matId: MAT.STONE, qty: 20, label: '20 Stone' },
      { matId: MAT.IRON,  qty: 10, label: '10 Iron' },
    ],
  },
  {
    tier: 2,
    label: 'Fortified Hold',
    desc: 'Max storage, chest auto-loot range 5m, visual upgrade.',
    cost: [
      { matId: MAT.WOOD,  qty: 50, label: '50 Wood' },
      { matId: MAT.STONE, qty: 20, label: '20 Stone' },
      { matId: MAT.IRON,  qty: 10, label: '10 Iron' },
    ],
  },
]

const mono: React.CSSProperties = { fontFamily: '"Courier New", monospace' }
const RUST = '#cd4420'

function TabButton({ id, active, onClick, label }: { id: HomeTab; active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...mono,
        flex: 1,
        padding: '7px 4px',
        background: active ? 'rgba(205,68,32,0.15)' : 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? RUST : 'transparent'}`,
        color: active ? RUST : '#555',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1,
        cursor: 'pointer',
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  )
}

// ── Storage Tab ───────────────────────────────────────────────────────────────

function StorageTab() {
  const homeStorage  = usePlayerStore(s => s.homeStorage)
  const addToHomeStorage     = usePlayerStore(s => s.addToHomeStorage)
  const removeFromHomeStorage = usePlayerStore(s => s.removeFromHomeStorage)
  const homeTier     = usePlayerStore(s => s.homeTier)
  const addNotif     = useUiStore(s => s.addNotification)
  const [, setTick]  = useState(0)

  const slotCount = homeTier >= 1 ? 30 : 20

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 400)
    return () => clearInterval(id)
  }, [])

  function handleSlotClick(slotIdx: number) {
    const stored = homeStorage[slotIdx]
    if (stored !== undefined) {
      // Transfer from home storage → inventory
      const ok = inventory.addItem({ itemId: 0, materialId: stored, quantity: 1, quality: 0.7 })
      if (ok) {
        removeFromHomeStorage(stored)
        addNotif(`Took ${MAT_NAMES[stored] ?? `mat${stored}`} from home storage.`, 'info')
      } else {
        addNotif('Inventory full!', 'warning')
      }
    } else {
      // Transfer from inventory → home storage (pick first raw material in inventory)
      let transferred = false
      for (let i = 0; i < inventory.slotCount; i++) {
        const s = inventory.getSlot(i)
        if (!s || s.itemId !== 0) continue
        const ok = inventory.removeItem(i, 1)
        if (ok) {
          addToHomeStorage(s.materialId)
          addNotif(`Stored ${MAT_NAMES[s.materialId] ?? `mat${s.materialId}`} at home.`, 'info')
          transferred = true
          break
        }
      }
      if (!transferred) {
        addNotif('No raw materials in inventory to store.', 'warning')
      }
    }
  }

  return (
    <div>
      <div style={{ ...mono, fontSize: 9, color: '#555', marginBottom: 10, letterSpacing: 1 }}>
        HOME STORAGE — {homeStorage.length}/{slotCount} SLOTS USED
        {homeTier === 0 && (
          <span style={{ color: '#444', marginLeft: 8 }}>(Upgrade to expand)</span>
        )}
      </div>
      <div style={{ ...mono, fontSize: 9, color: '#666', marginBottom: 8 }}>
        Click an empty slot to store a material from inventory. Click a filled slot to take it.
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 4,
      }}>
        {Array.from({ length: slotCount }).map((_, i) => {
          const matId = homeStorage[i]
          const hasItem = matId !== undefined
          return (
            <div
              key={i}
              onClick={() => handleSlotClick(i)}
              title={hasItem ? `${MAT_NAMES[matId] ?? `mat${matId}`} — click to take` : 'Empty — click to store material'}
              style={{
                width: '100%',
                aspectRatio: '1',
                background: hasItem ? 'rgba(123,75,42,0.15)' : 'rgba(0,0,0,0.4)',
                border: `1px solid ${hasItem ? 'rgba(123,75,42,0.5)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.1s',
                padding: 2,
                minHeight: 44,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hasItem ? 'rgba(123,75,42,0.3)' : 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = hasItem ? 'rgba(123,75,42,0.15)' : 'rgba(0,0,0,0.4)' }}
            >
              {hasItem ? (
                <span style={{ fontSize: 8, color: '#e8c97a', textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-word' }}>
                  {(MAT_NAMES[matId] ?? `mat${matId}`).split(' ').slice(0, 2).join('\n')}
                </span>
              ) : (
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.1)' }}>{i + 1}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Travel Tab ────────────────────────────────────────────────────────────────

function TravelTab() {
  const homePosition  = usePlayerStore(s => s.homePosition)
  const homeSet       = usePlayerStore(s => s.homeSet)
  const { x: px, z: pz } = usePlayerStore(s => s)
  const spendGold     = usePlayerStore(s => s.spendGold)
  const gold          = usePlayerStore(s => s.gold)
  const setTravelFading = useUiStore(s => s.setTravelFading)
  const closePanel    = useUiStore(s => s.closePanel)
  const addNotif      = useUiStore(s => s.addNotification)
  const entityId      = usePlayerStore(s => s.entityId)

  if (!homeSet || !homePosition) {
    return (
      <div style={{ ...mono, textAlign: 'center', padding: '32px 20px', color: '#555', fontSize: 12 }}>
        No home placed yet. Use a Home Deed to place your cabin.
      </div>
    )
  }

  const [hx, , hz] = homePosition
  const cost = computeFastTravelCost(px, pz, hx, hz)

  function handleTravel() {
    if (cost > 0) {
      if (gold < cost) {
        addNotif(`Need ${cost} gold to fast-travel home. You have ${gold}.`, 'warning')
        return
      }
      spendGold(cost)
    }
    // Trigger fade + teleport
    const snapPos = homePosition as [number, number, number]
    setTravelFading(true)
    setTimeout(() => {
      if (entityId !== null) {
        const [tx, ty, tz] = snapPos
        // Update ECS position
        Position.x[entityId] = tx
        Position.y[entityId] = ty
        Position.z[entityId] = tz
        usePlayerStore.getState().setPosition(tx, ty, tz)
      }
      setTravelFading(false)
      closePanel()
      addNotif('Arrived at home!', 'discovery')
    }, 600)
  }

  const dist = Math.sqrt((hx - px) ** 2 + (hz - pz) ** 2)

  return (
    <div style={{ ...mono, padding: '16px 0' }}>
      <div style={{ marginBottom: 16, color: '#888', fontSize: 11 }}>
        Your home is {dist < 1 ? 'right here' : `${dist.toFixed(0)}m away`}.
      </div>
      <div style={{
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 4,
        padding: '14px 16px',
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 10, color: '#555', letterSpacing: 1, marginBottom: 6 }}>FAST TRAVEL COST</div>
        <div style={{ fontSize: 20, color: cost === 0 ? '#2ecc71' : '#f1c40f', fontWeight: 700 }}>
          {cost === 0 ? 'FREE' : `${cost} gold`}
        </div>
        <div style={{ fontSize: 9, color: '#444', marginTop: 4 }}>
          {cost === 0 ? 'Within 50m — no charge.' : 'Distance fee. Free within 50m.'}
        </div>
      </div>
      <button
        onClick={handleTravel}
        style={{
          ...mono,
          width: '100%',
          padding: '10px 0',
          background: cost > gold ? 'rgba(100,0,0,0.3)' : 'rgba(205,68,32,0.2)',
          border: `1px solid ${cost > gold ? '#5a0000' : RUST}`,
          borderRadius: 3,
          color: cost > gold ? '#500' : RUST,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 2,
          cursor: cost > gold ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (cost <= gold) (e.currentTarget as HTMLElement).style.background = 'rgba(205,68,32,0.35)' }}
        onMouseLeave={e => { if (cost <= gold) (e.currentTarget as HTMLElement).style.background = 'rgba(205,68,32,0.2)' }}
      >
        TRAVEL HOME
      </button>
    </div>
  )
}

// ── Upgrade Tab ───────────────────────────────────────────────────────────────

function UpgradeTab() {
  const homeTier    = usePlayerStore(s => s.homeTier)
  const setHomeTier = usePlayerStore(s => s.setHomeTier)
  const addNotif    = useUiStore(s => s.addNotification)

  function handleUpgrade(targetTier: 0 | 1 | 2) {
    if (homeTier >= targetTier) return
    const upgrade = TIER_UPGRADES[targetTier]
    // Check materials
    for (const req of upgrade.cost) {
      if (inventory.countMaterial(req.matId) < req.qty) {
        addNotif(`Need ${req.label} to upgrade!`, 'warning')
        return
      }
    }
    // Consume materials
    for (const req of upgrade.cost) {
      let remaining = req.qty
      for (let i = 0; i < inventory.slotCount && remaining > 0; i++) {
        const s = inventory.getSlot(i)
        if (!s || s.itemId !== 0 || s.materialId !== req.matId) continue
        const take = Math.min(s.quantity, remaining)
        inventory.removeItem(i, take)
        remaining -= take
      }
    }
    setHomeTier(targetTier)
    addNotif(`Home upgraded to ${upgrade.label}!`, 'discovery')
  }

  return (
    <div style={{ ...mono }}>
      {TIER_UPGRADES.map((upg, idx) => {
        const isOwned    = homeTier >= upg.tier
        const isNext     = homeTier === upg.tier - 1
        const isLocked   = homeTier < upg.tier - 1

        return (
          <div
            key={idx}
            style={{
              background: isOwned ? 'rgba(46,204,113,0.07)' : 'rgba(0,0,0,0.35)',
              border: `1px solid ${isOwned ? 'rgba(46,204,113,0.25)' : isNext ? 'rgba(205,68,32,0.3)' : 'rgba(255,255,255,0.05)'}`,
              borderRadius: 4,
              padding: '12px 14px',
              marginBottom: 8,
              opacity: isLocked ? 0.45 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: isOwned ? '#2ecc71' : '#ccc', fontWeight: 700 }}>
                {isOwned ? '\u2713 ' : ''}{upg.label}
              </span>
              {isOwned && (
                <span style={{ fontSize: 9, color: '#2ecc71', letterSpacing: 1 }}>OWNED</span>
              )}
            </div>
            <div style={{ fontSize: 10, color: '#666', marginBottom: isNext && !isOwned ? 10 : 0 }}>
              {upg.desc}
            </div>
            {isNext && (
              <>
                <div style={{ fontSize: 9, color: '#555', marginBottom: 8, marginTop: 6, letterSpacing: 1 }}>
                  REQUIRES:
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {upg.cost.map((c, ci) => {
                    const has = inventory.countMaterial(c.matId) >= c.qty
                    return (
                      <span key={ci} style={{
                        fontSize: 9,
                        color: has ? '#2ecc71' : '#e74c3c',
                        background: 'rgba(0,0,0,0.4)',
                        border: `1px solid ${has ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}`,
                        borderRadius: 2,
                        padding: '2px 6px',
                      }}>
                        {c.label}
                      </span>
                    )
                  })}
                </div>
                <button
                  onClick={() => handleUpgrade(upg.tier)}
                  style={{
                    ...mono,
                    width: '100%',
                    padding: '7px 0',
                    background: 'rgba(205,68,32,0.15)',
                    border: `1px solid ${RUST}`,
                    borderRadius: 3,
                    color: RUST,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 2,
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(205,68,32,0.3)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(205,68,32,0.15)' }}
                >
                  UPGRADE
                </button>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── HomePanel (exported) ──────────────────────────────────────────────────────

export function HomePanel() {
  const [tab, setTab] = useState<HomeTab>('storage')
  const homeSet = usePlayerStore(s => s.homeSet)

  return (
    <div style={{ ...mono, color: '#ccc' }}>
      {/* Header */}
      <div style={{
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid #222',
      }}>
        <div style={{ fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 4 }}>M34 — PLAYER HOUSING</div>
        {!homeSet ? (
          <div style={{ fontSize: 11, color: '#666' }}>
            Craft a <span style={{ color: RUST }}>Home Deed</span> (30 Wood + 10 Stone + 5 Rope) and press{' '}
            <span style={{ color: '#fff' }}>B</span> to enter placement mode.
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#888' }}>
            Your home base — storage, fast travel, and upgrades.
          </div>
        )}
      </div>

      {/* Tab strip */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #222',
        marginBottom: 16,
      }}>
        <TabButton id="storage"  active={tab === 'storage'}  onClick={() => setTab('storage')}  label="STORAGE" />
        <TabButton id="travel"   active={tab === 'travel'}   onClick={() => setTab('travel')}   label="FAST TRAVEL" />
        <TabButton id="upgrade"  active={tab === 'upgrade'}  onClick={() => setTab('upgrade')}  label="UPGRADE" />
      </div>

      {/* Tab content */}
      {tab === 'storage'  && <StorageTab />}
      {tab === 'travel'   && <TravelTab />}
      {tab === 'upgrade'  && <UpgradeTab />}
    </div>
  )
}
