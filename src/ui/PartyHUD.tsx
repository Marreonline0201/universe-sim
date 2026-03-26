/**
 * PartyHUD — M39 Track B
 *
 * Top-right widget showing party members, HP bars, distance arrows,
 * and a ping-location button for each member.
 * Also renders the pending party invite banner.
 */

import React, { useEffect, useState } from 'react'
import { usePartyStore } from '../store/partyStore'
import { usePlayerStore } from '../store/playerStore'
import { getLocalUserId } from '../net/useWorldSocket'
import { useUiStore } from '../store/uiStore'
import { useMultiplayerStore } from '../store/multiplayerStore'

// ── Direction arrow from local player toward party member ──────────────────

function directionArrow(
  px: number, pz: number,
  tx: number, tz: number
): string {
  const dx = tx - px
  const dz = tz - pz
  const angle = Math.atan2(dz, dx) * (180 / Math.PI)
  // Map angle to 8-dir arrow
  const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗']
  const idx = Math.round(((angle + 360) % 360) / 45) % 8
  return arrows[idx]
}

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2)
}

// ── Pending invite banner ──────────────────────────────────────────────────

function PartyInviteBanner() {
  const pendingInvite = usePartyStore(s => s.pendingInvite)
  const acceptInvite  = usePartyStore(s => s.acceptInvite)
  const declineInvite = usePartyStore(s => s.declineInvite)

  if (!pendingInvite) return null

  return (
    <div style={{
      position: 'fixed',
      top: 110,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.88)',
      border: '1px solid #6abf6a',
      borderTop: '2px solid #6abf6a',
      borderRadius: 4,
      padding: '10px 18px',
      zIndex: 800,
      fontFamily: 'monospace',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      pointerEvents: 'auto',
    }}>
      <div style={{ fontSize: 10, color: '#6abf6a', letterSpacing: 2, fontWeight: 700 }}>
        PARTY INVITE
      </div>
      <div style={{ fontSize: 11, color: '#e0d6c8' }}>
        {pendingInvite.leaderName} invited you to their party
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => acceptInvite(pendingInvite.leaderId)}
          style={{
            background: 'rgba(106,191,106,0.2)',
            border: '1px solid #6abf6a',
            borderRadius: 3,
            color: '#6abf6a',
            fontFamily: 'monospace',
            fontSize: 10,
            padding: '3px 12px',
            cursor: 'pointer',
          }}
        >
          Accept
        </button>
        <button
          onClick={declineInvite}
          style={{
            background: 'rgba(231,76,60,0.15)',
            border: '1px solid #e74c3c',
            borderRadius: 3,
            color: '#e74c3c',
            fontFamily: 'monospace',
            fontSize: 10,
            padding: '3px 12px',
            cursor: 'pointer',
          }}
        >
          Decline
        </button>
      </div>
    </div>
  )
}

// ── Main party HUD widget ──────────────────────────────────────────────────

export function PartyHUD() {
  const party         = usePartyStore(s => s.party)
  const leaveParty    = usePartyStore(s => s.leaveParty)
  const kickMember    = usePartyStore(s => s.kickMember)
  const remotePlayers = useMultiplayerStore(s => s.remotePlayers)
  const addNotification = useUiStore((s: any) => s.addNotification as (msg: string, type?: string) => void)
  const localUserId   = getLocalUserId()
  const { x: px, y: py, z: pz } = usePlayerStore(s => s)
  const localHealth   = usePlayerStore(s => s.health)

  // Merge party member health from remotePlayers store (which has live data)
  // and keep own entry up to date
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 500)
    return () => clearInterval(id)
  }, [])

  if (!party || party.members.length < 2) return <PartyInviteBanner />

  const isLeader = party.leaderId === localUserId

  function pingLocation(member: { userId: string; username: string; x?: number; z?: number }) {
    if (member.x === undefined || member.z === undefined) return
    // Dispatch a minimap beacon event
    window.dispatchEvent(new CustomEvent('party-ping-location', {
      detail: { x: member.x, z: member.z, username: member.username }
    }))
    addNotification(`Pinged ${member.username}'s location`, 'info')
  }

  return (
    <>
      <PartyInviteBanner />
      <div style={{
        position: 'fixed',
        top: 14,
        right: 110,
        zIndex: 300,
        fontFamily: 'monospace',
        pointerEvents: 'auto',
        minWidth: 150,
        maxWidth: 180,
      }}>
        {/* Header */}
        <div style={{
          background: 'rgba(0,0,0,0.75)',
          border: '1px solid rgba(106,191,106,0.4)',
          borderRadius: '3px 3px 0 0',
          padding: '3px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 9,
          color: '#6abf6a',
          fontWeight: 700,
          letterSpacing: 1,
        }}>
          <span>PARTY ({party.members.length}/4)</span>
          <div style={{ flex: 1 }} />
          {isLeader && <span style={{ fontSize: 9, color: '#f1c40f' }}>★ Leader</span>}
        </div>

        {/* Members */}
        <div style={{
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid rgba(106,191,106,0.25)',
          borderTop: 'none',
          borderRadius: '0 0 3px 3px',
          padding: '4px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}>
          {party.members.map(member => {
            const isMe = member.userId === localUserId
            const remote = remotePlayers.get(member.userId)
            const hp = isMe ? localHealth : (remote ? remote.health : member.health)
            const hpPct = Math.max(0, Math.min(1, hp))
            const hpColor = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#e74c3c'

            // Distance + direction
            const memberX = isMe ? px : (remote?.x ?? member.x)
            const memberZ = isMe ? pz : (remote?.z ?? member.z)
            const d = (!isMe && memberX !== undefined && memberZ !== undefined)
              ? dist(px, pz, memberX, memberZ)
              : null
            const arrow = (!isMe && memberX !== undefined && memberZ !== undefined)
              ? directionArrow(px, pz, memberX, memberZ)
              : null

            return (
              <div key={member.userId}>
                {/* Name row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginBottom: 2,
                }}>
                  {/* Online dot */}
                  <div style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: isMe ? '#6abf6a' : (remote ? '#6abf6a' : '#555'),
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 10,
                    color: member.userId === party.leaderId ? '#f1c40f' : '#e0d6c8',
                    fontWeight: member.userId === party.leaderId ? 700 : 400,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {member.username}
                    {isMe && ' (you)'}
                  </span>
                  {/* Distance + arrow */}
                  {!isMe && d !== null && (
                    <button
                      title={`Ping ${member.username}'s location on minimap`}
                      onClick={() => pingLocation({ ...member, x: memberX, z: memberZ })}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255,255,255,0.5)',
                        fontFamily: 'monospace',
                        fontSize: 9,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      {arrow} {d < 1000 ? `${Math.round(d)}m` : `${(d / 1000).toFixed(1)}k`}
                    </button>
                  )}
                  {/* Kick button (leader only, not self) */}
                  {isLeader && !isMe && (
                    <button
                      title={`Kick ${member.username}`}
                      onClick={() => kickMember(member.userId, localUserId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(231,76,60,0.6)',
                        fontFamily: 'monospace',
                        fontSize: 9,
                        cursor: 'pointer',
                        padding: 0,
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* HP bar */}
                <div style={{
                  height: 3,
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${hpPct * 100}%`,
                    height: '100%',
                    background: hpColor,
                    borderRadius: 2,
                    transition: 'width 0.3s ease, background 0.3s',
                  }} />
                </div>
                <div style={{
                  fontSize: 8,
                  color: '#888',
                  fontFamily: 'monospace',
                  marginTop: 1,
                }}>
                  HP {Math.round(hpPct * 100)}%
                </div>
              </div>
            )
          })}

          {/* Leave button */}
          <button
            onClick={leaveParty}
            style={{
              marginTop: 2,
              background: 'rgba(231,76,60,0.1)',
              border: '1px solid rgba(231,76,60,0.35)',
              borderRadius: 2,
              color: '#e74c3c',
              fontFamily: 'monospace',
              fontSize: 9,
              padding: '2px 0',
              cursor: 'pointer',
              width: '100%',
              letterSpacing: 1,
            }}
          >
            Leave Party
          </button>
        </div>
      </div>
    </>
  )
}
