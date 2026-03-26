// ── SettlementHUD.tsx ──────────────────────────────────────────────────────────
// M6: NPC Civilization — settlement proximity UI.
//
// Shown when the player is near a settlement. Three states:
//   1. GATES CLOSED — threat > 3. Red banner, no trade.
//   2. TRADE OFFER  — settlement has surplus. Shows offer details, Accept/Decline buttons.
//   3. NEARBY       — in range but no offer available. Shows settlement name + civ level.
//
// Wired in SceneRoot: proximity check runs in useFrame, sends PLAYER_NEAR_SETTLEMENT
// to server which replies with TRADE_OFFER or GATES_CLOSED as appropriate.

import React, { useCallback } from 'react'
import { useSettlementStore } from '../store/settlementStore'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { usePlayerStore } from '../store/playerStore'
import { useOutlawStore } from '../store/outlawStore'
// M42 Track C: Reputation gain on trade
import { useReputationStore } from '../store/reputationStore'

const WANTED_THRESHOLD = 5

// Material display names for the trade UI — keyed by client MAT enum values
// (MAT.STONE=1, MAT.FLINT=2, MAT.WOOD=3, MAT.BARK=4, MAT.FIBER=21, etc.)
const MAT_NAMES: Record<number, string> = {
  1:  'Stone',
  2:  'Flint',
  3:  'Wood',
  4:  'Bark',
  5:  'Leaf',
  6:  'Bone',
  7:  'Hide',
  8:  'Clay',
  10: 'Charcoal',
  11: 'Copper Ore',
  14: 'Iron Ore',
  15: 'Iron',
  17: 'Coal',
  21: 'Fiber',
  22: 'Cloth',
  23: 'Rope',
  24: 'Leather',
  25: 'Copper',
  26: 'Silver',
}

function matName(id: number | string): string {
  return MAT_NAMES[Number(id)] ?? `Mat #${id}`
}

function matList(mats: Record<string, number>): string {
  return Object.entries(mats)
    .map(([id, qty]) => `${qty}× ${matName(id)}`)
    .join(', ')
}

export function SettlementHUD() {
  const { pendingOffer, closedGates, nearSettlementId, setPendingOffer } = useSettlementStore()
  const connectionStatus = useMultiplayerStore(s => s.connectionStatus)
  const murderCount      = usePlayerStore(s => s.murderCount)
  const activeQuest      = useOutlawStore(s => s.activeQuest)

  const socket = _getSocket()

  const handleAccept = useCallback(() => {
    if (!pendingOffer || !socket) return
    socket.send({
      type: 'TRADE_ACCEPT',
      settlementId:   pendingOffer.settlementId,
      playerGives:    pendingOffer.wantMats,
      playerReceives: pendingOffer.offerMats,
    })
    // M42 Track C: Trade → reputation gain
    useReputationStore.getState().addPoints(
      pendingOffer.settlementId,
      pendingOffer.settlementName,
      10
    )
    setPendingOffer(null)
  }, [pendingOffer, socket, setPendingOffer])

  const handleDecline = useCallback(() => {
    setPendingOffer(null)
  }, [setPendingOffer])

  const handleRedemptionRequest = useCallback(() => {
    if (!nearSettlementId || !socket) return
    socket.send({ type: 'REDEMPTION_QUEST_REQUEST', settlementId: nearSettlementId })
  }, [nearSettlementId, socket])

  const handleQuestComplete = useCallback(() => {
    if (!activeQuest || !socket) return
    // For escort and settlement_defense: single completion event.
    // For resource_delivery: also sent as one step here — full delivery.
    socket.send({
      type:    'REDEMPTION_QUEST_PROGRESS',
      questId: activeQuest.questId,
      amount:  activeQuest.required,  // complete in one step for simplicity
    })
  }, [activeQuest, socket])

  // Not connected — don't show settlement UI
  if (connectionStatus !== 'connected') return null

  // Active redemption quest panel (highest priority — shown over other states)
  if (activeQuest && nearSettlementId === activeQuest.settlementId) {
    const questLabels: Record<string, string> = {
      escort:              'Escort an NPC between two waypoints (120s)',
      resource_delivery:   'Deliver 10x Iron Ingot or 20x Wood to the stockpile',
      settlement_defense:  'Kill an attacking predator near the settlement',
    }
    const timeLeft = Math.max(0, Math.floor((activeQuest.expiresAt - Date.now()) / 1000))
    return (
      <div style={styles.container}>
        <div style={{ ...styles.panel, borderColor: 'rgba(200, 160, 30, 0.8)', background: 'rgba(20, 15, 5, 0.94)' }}>
          <div style={{ ...styles.title, color: '#f0c040' }}>REDEMPTION QUEST</div>
          <div style={styles.subtitle}>{questLabels[activeQuest.questType] ?? activeQuest.questType}</div>
          <div style={{ ...styles.detail, color: '#aaa' }}>
            Progress: {activeQuest.progress}/{activeQuest.required}
            &nbsp;&nbsp;|&nbsp;&nbsp;
            Expires in: {timeLeft}s
          </div>
          <div style={{ ...styles.detail, color: '#c08060' }}>
            Completing this task reduces your murder count by 1.
          </div>
          <div style={styles.btnRow}>
            <button style={styles.btnAccept} onClick={handleQuestComplete}>
              COMPLETE TASK
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Gates closed panel (murder_count >= 3)
  if (nearSettlementId !== null && closedGates.has(nearSettlementId)) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.panel, borderColor: 'rgba(200, 30, 30, 0.8)', background: 'rgba(40, 5, 5, 0.92)' }}>
          <div style={styles.title} role="alert">GATES CLOSED</div>
          <div style={styles.subtitle}>You are not welcome here.</div>
          <div style={{ ...styles.detail, color: '#c06060' }}>
            Your threat level is too high. Trade refused.<br />
            Speak to the settlement leader to seek redemption.
          </div>
          {murderCount > 0 && (
            <div style={styles.btnRow}>
              <button style={styles.btnDecline} onClick={handleRedemptionRequest}>
                REQUEST REDEMPTION TASK
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Cautious tier (murder_count 1-2) — wary NPCs but still trading
  if (nearSettlementId !== null && murderCount >= 1 && murderCount <= 2) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.panel, borderColor: 'rgba(180, 120, 30, 0.7)', background: 'rgba(25, 18, 5, 0.90)' }}>
          <div style={{ ...styles.title, color: '#d4a030', fontSize: 14 }}>STRANGERS ARE WARY OF YOU</div>
          <div style={{ ...styles.detail, color: '#a08040', marginBottom: 0 }}>
            Shop prices are 1.5x normal. Your actions are being watched.<br />
            Murder count: {murderCount}
          </div>
        </div>
      </div>
    )
  }

  // Trade offer panel
  if (pendingOffer) {
    const trustStr = pendingOffer.trustScore > 0
      ? `+${pendingOffer.trustScore.toFixed(1)}`
      : pendingOffer.trustScore.toFixed(1)
    return (
      <div style={styles.container}>
        <div style={styles.panel}>
          <div style={styles.settlementRow}>
            <span style={styles.civBadge}>CIV {pendingOffer.civLevel}</span>
            <span style={styles.title}>{pendingOffer.settlementName}</span>
          </div>
          <div style={styles.subtitle}>Trade Offer</div>
          <div style={styles.tradeRow}>
            <div style={styles.tradeBlock}>
              <div style={styles.tradeLabel}>YOU GIVE</div>
              <div style={styles.tradeValue}>{matList(pendingOffer.wantMats)}</div>
            </div>
            <div style={{ color: '#aaa', fontSize: 20, alignSelf: 'center', padding: '0 12px' }}>
              {'/'}
            </div>
            <div style={styles.tradeBlock}>
              <div style={styles.tradeLabel}>YOU GET</div>
              <div style={styles.tradeValue}>{matList(pendingOffer.offerMats)}</div>
            </div>
          </div>
          <div style={styles.detail}>
            Trust: <span style={{ color: pendingOffer.trustScore >= 0 ? '#7ec87e' : '#c07e7e' }}>{trustStr}</span>
          </div>
          <div style={styles.btnRow}>
            <button style={styles.btnAccept} onClick={handleAccept}>
              ACCEPT
            </button>
            <button style={styles.btnDecline} onClick={handleDecline}>
              DECLINE
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    position:  'fixed',
    bottom:    120,
    left:      '50%',
    transform: 'translateX(-50%)',
    zIndex:    2000,
    pointerEvents: 'all',
  },
  panel: {
    background:   'rgba(10, 14, 20, 0.92)',
    border:       '1px solid rgba(120, 160, 200, 0.4)',
    borderRadius: 6,
    padding:      '16px 24px',
    minWidth:     340,
    maxWidth:     480,
    fontFamily:   'monospace',
    boxShadow:    '0 4px 32px rgba(0,0,0,0.7)',
  },
  settlementRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        10,
    marginBottom: 4,
  },
  civBadge: {
    background:   'rgba(60, 100, 160, 0.6)',
    border:       '1px solid rgba(100, 150, 220, 0.5)',
    borderRadius: 3,
    fontSize:     10,
    color:        '#8ab4e8',
    padding:      '2px 7px',
    letterSpacing: 2,
    fontWeight:   700,
  },
  title: {
    fontSize:     18,
    fontWeight:   700,
    color:        '#d4c8b0',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize:     11,
    color:        '#888',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  tradeRow: {
    display:       'flex',
    alignItems:    'stretch',
    marginBottom:  10,
  },
  tradeBlock: {
    flex:       1,
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 4,
    padding:    '8px 12px',
  },
  tradeLabel: {
    fontSize:      9,
    color:         '#666',
    letterSpacing: 2,
    marginBottom:  4,
  },
  tradeValue: {
    fontSize: 13,
    color:    '#c8b880',
    fontWeight: 600,
  },
  detail: {
    fontSize:    10,
    color:       '#777',
    marginBottom: 14,
    letterSpacing: 1,
  },
  btnRow: {
    display: 'flex',
    gap:     10,
  },
  btnAccept: {
    flex:         1,
    background:   'rgba(40, 120, 60, 0.85)',
    border:       '1px solid rgba(80, 200, 100, 0.5)',
    borderRadius: 3,
    color:        '#90e090',
    fontFamily:   'monospace',
    fontSize:     12,
    fontWeight:   700,
    letterSpacing: 3,
    padding:      '9px 0',
    cursor:       'pointer',
    textTransform: 'uppercase',
  },
  btnDecline: {
    flex:         1,
    background:   'rgba(60, 20, 20, 0.6)',
    border:       '1px solid rgba(160, 60, 60, 0.4)',
    borderRadius: 3,
    color:        '#c08080',
    fontFamily:   'monospace',
    fontSize:     12,
    fontWeight:   700,
    letterSpacing: 3,
    padding:      '9px 0',
    cursor:       'pointer',
    textTransform: 'uppercase',
  },
}

// Access the WorldSocket singleton outside of hooks
// (same pattern as getWorldSocket in useWorldSocket.ts)
import { getWorldSocket } from '../net/useWorldSocket'
function _getSocket() {
  try { return getWorldSocket() } catch { return null }
}
