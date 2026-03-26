// ── PlayerListPanel.tsx ─────────────────────────────────────────────────────
// M29 Track C: Lists all currently online remote players with ping indicators.
// M37 Track C: Added Leaderboard tab (total level, gold, prestige rank).
// Hotkey: P. Registered in SidebarShell as lazy-loaded panel.

import React, { useState } from 'react'
import { useMultiplayerStore } from '../../store/multiplayerStore'
import { useSkillStore } from '../../store/skillStore'
import { usePlayerStore } from '../../store/playerStore'
import { skillSystem } from '../../game/SkillSystem'
import { getLocalUsername } from '../../net/useWorldSocket'
import { getEquippedTitle } from '../../game/TitleSystem'

const RUST_ORANGE = '#cd4420'
const AFK_THRESHOLD_MS = 60_000

function pingColor(pingMs: number | undefined): string {
  if (pingMs === undefined) return '#666'
  if (pingMs < 100) return '#2ecc71'
  if (pingMs < 250) return '#f39c12'
  return '#e74c3c'
}

function pingLabel(pingMs: number | undefined): string {
  if (pingMs === undefined) return '?ms'
  return `${pingMs}ms`
}

function avatarColor(username: string): string {
  const COLORS = ['#cd4420', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e74c3c', '#e67e22']
  let hash = 0
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) & 0xffff
  return COLORS[hash % COLORS.length]
}

// ── Tab selector ──────────────────────────────────────────────────────────────

type Tab = 'online' | 'leaderboard'

function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'online', label: 'ONLINE' },
    { id: 'leaderboard', label: 'LEADERBOARD' },
  ]
  return (
    <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          style={{
            flex: 1,
            padding: '5px 0',
            fontSize: 10,
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: 1,
            background: active === tab.id ? 'rgba(205,68,32,0.2)' : 'rgba(255,255,255,0.04)',
            border: active === tab.id ? `1px solid ${RUST_ORANGE}88` : '1px solid rgba(255,255,255,0.08)',
            borderRadius: 3,
            color: active === tab.id ? RUST_ORANGE : '#555',
            cursor: 'pointer',
            transition: 'all 0.12s',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── Online players tab ────────────────────────────────────────────────────────

function OnlineTab() {
  const remotePlayers = useMultiplayerStore(s => s.remotePlayers)
  const playerPings   = useMultiplayerStore(s => s.playerPings)
  const players = Array.from(remotePlayers.values())
  const now = Date.now()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h3 style={{
        margin: 0,
        fontSize: 14,
        color: RUST_ORANGE,
        borderBottom: `1px solid #2a2a2a`,
        paddingBottom: 8,
        letterSpacing: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span>PLAYERS ONLINE</span>
        <span style={{
          fontSize: 11,
          background: 'rgba(205,68,32,0.18)',
          border: `1px solid ${RUST_ORANGE}55`,
          borderRadius: 3,
          padding: '1px 6px',
          color: '#ccc',
          letterSpacing: 1,
        }}>
          {players.length}
        </span>
      </h3>

      {players.length === 0 && (
        <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '24px 0', letterSpacing: 1 }}>
          NO OTHER PLAYERS ONLINE
        </div>
      )}

      {players.map(p => {
        const pingMs  = playerPings.get(p.userId)
        const isAFK   = (now - (p.lastMovedAt ?? now)) > AFK_THRESHOLD_MS
        const initial = p.username.charAt(0).toUpperCase()
        const color   = avatarColor(p.username)

        return (
          <div
            key={p.userId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid #1e1e1e',
              borderRadius: 4,
              padding: '8px 10px',
            }}
          >
            <div style={{
              width: 30, height: 30, borderRadius: '50%', background: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {initial}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Title above name if present */}
              {p.title && (
                <div style={{
                  fontSize: 9,
                  color: p.titleColor ?? '#aaa',
                  fontFamily: 'monospace',
                  letterSpacing: 0.5,
                  lineHeight: 1.2,
                }}>
                  [{p.title}]
                </div>
              )}
              <div style={{
                fontSize: 12, fontWeight: 700, color: '#e0d6c8',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {p.username}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{
                  fontSize: 9,
                  background: isAFK ? 'rgba(243,156,18,0.18)' : 'rgba(46,204,113,0.18)',
                  border: `1px solid ${isAFK ? '#f39c1244' : '#2ecc7144'}`,
                  color: isAFK ? '#f39c12' : '#2ecc71',
                  borderRadius: 2, padding: '1px 5px', letterSpacing: 1,
                }}>
                  {isAFK ? 'AFK' : 'ONLINE'}
                </span>
                <span style={{ fontSize: 9, color: '#555', letterSpacing: 0.5 }}>
                  HP {Math.round(p.health * 100)}%
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: pingColor(pingMs),
                boxShadow: `0 0 5px ${pingColor(pingMs)}88`,
              }} />
              <span style={{
                fontSize: 9, color: pingColor(pingMs), fontFamily: 'monospace',
                minWidth: 28, textAlign: 'right',
              }}>
                {pingLabel(pingMs)}
              </span>
            </div>
          </div>
        )
      })}

      <div style={{ marginTop: 8, fontSize: 9, color: '#333', textAlign: 'center', letterSpacing: 1 }}>
        PRESS P TO CLOSE · F TO INSPECT NEARBY PLAYER
      </div>
    </div>
  )
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────

interface LeaderboardEntry {
  userId: string
  username: string
  title: string
  titleColor: string
  totalLevel: number
  gold: number
  prestigeCount: number
  isLocal: boolean
}

type SortKey = 'totalLevel' | 'gold' | 'prestigeCount'

function LeaderboardTab() {
  const [sortBy, setSortBy] = useState<SortKey>('totalLevel')
  const remotePlayers = useMultiplayerStore(s => s.remotePlayers)
  const localGold = usePlayerStore(s => s.gold)
  const prestigeCount = useSkillStore(s => s.prestigeCount)

  // Compute local player total level
  const skillIds = ['gathering', 'crafting', 'combat', 'survival', 'exploration', 'smithing', 'husbandry'] as const
  const localTotalLevel = skillIds.reduce((sum, id) => sum + skillSystem.getLevel(id), 0)
  const localUsername = getLocalUsername()
  const localTitle = getEquippedTitle()

  // Build entries: local + remote
  const entries: LeaderboardEntry[] = [
    {
      userId: 'local',
      username: localUsername,
      title: localTitle.name,
      titleColor: localTitle.color,
      totalLevel: localTotalLevel,
      gold: localGold,
      prestigeCount,
      isLocal: true,
    },
    ...Array.from(remotePlayers.values()).map(p => ({
      userId: p.userId,
      username: p.username,
      title: p.title ?? '',
      titleColor: p.titleColor ?? '#aaa',
      totalLevel: p.totalLevel ?? 0,
      gold: p.gold ?? 0,
      prestigeCount: p.prestigeCount ?? 0,
      isLocal: false,
    })),
  ]

  // Sort
  entries.sort((a, b) => b[sortBy] - a[sortBy])

  const colStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 9,
    color: active ? RUST_ORANGE : '#555',
    fontFamily: 'monospace',
    letterSpacing: 1,
    cursor: 'pointer',
    fontWeight: active ? 700 : 400,
    textAlign: 'right' as const,
    padding: '0 4px',
    flexShrink: 0,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h3 style={{
        margin: 0,
        fontSize: 14,
        color: RUST_ORANGE,
        borderBottom: `1px solid #2a2a2a`,
        paddingBottom: 8,
        letterSpacing: 2,
      }}>
        LEADERBOARD
      </h3>

      {/* Column headers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px', marginBottom: 2 }}>
        <span style={{ width: 22, fontSize: 9, color: '#444', fontFamily: 'monospace', flexShrink: 0 }}>#</span>
        <span style={{ flex: 1, fontSize: 9, color: '#444', fontFamily: 'monospace' }}>PLAYER</span>
        <span
          onClick={() => setSortBy('totalLevel')}
          style={colStyle(sortBy === 'totalLevel')}
          title="Sort by total level"
        >
          LVL
        </span>
        <span
          onClick={() => setSortBy('gold')}
          style={colStyle(sortBy === 'gold')}
          title="Sort by gold"
        >
          GOLD
        </span>
        <span
          onClick={() => setSortBy('prestigeCount')}
          style={colStyle(sortBy === 'prestigeCount')}
          title="Sort by prestige"
        >
          PRE
        </span>
      </div>

      {entries.map((entry, index) => (
        <div
          key={entry.userId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            background: entry.isLocal
              ? 'rgba(205,68,32,0.12)'
              : 'rgba(255,255,255,0.03)',
            border: entry.isLocal
              ? `1px solid ${RUST_ORANGE}44`
              : '1px solid #1e1e1e',
            borderRadius: 4,
          }}
        >
          {/* Rank */}
          <span style={{
            width: 22,
            fontSize: 11,
            color: index === 0 ? '#ffdd00' : index === 1 ? '#aaaaaa' : index === 2 ? '#cd7f32' : '#444',
            fontFamily: 'monospace',
            fontWeight: 700,
            flexShrink: 0,
          }}>
            #{index + 1}
          </span>

          {/* Name + title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {entry.title && (
              <div style={{ fontSize: 9, color: entry.titleColor, fontFamily: 'monospace', lineHeight: 1.2 }}>
                [{entry.title}]
              </div>
            )}
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: entry.isLocal ? '#ffaa88' : '#e0d6c8',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {entry.username}
              {entry.isLocal && (
                <span style={{ fontSize: 8, color: RUST_ORANGE, marginLeft: 4 }}>(YOU)</span>
              )}
            </div>
          </div>

          {/* Total level */}
          <span style={{
            fontSize: 11,
            fontFamily: 'monospace',
            fontWeight: sortBy === 'totalLevel' ? 700 : 400,
            color: sortBy === 'totalLevel' ? '#e0d6c8' : '#666',
            width: 28,
            textAlign: 'right',
            flexShrink: 0,
          }}>
            {entry.totalLevel}
          </span>

          {/* Gold */}
          <span style={{
            fontSize: 11,
            fontFamily: 'monospace',
            fontWeight: sortBy === 'gold' ? 700 : 400,
            color: sortBy === 'gold' ? '#f1c40f' : '#666',
            width: 42,
            textAlign: 'right',
            flexShrink: 0,
          }}>
            {entry.gold.toLocaleString()}
          </span>

          {/* Prestige */}
          <span style={{
            fontSize: 11,
            fontFamily: 'monospace',
            fontWeight: sortBy === 'prestigeCount' ? 700 : 400,
            color: sortBy === 'prestigeCount' ? '#dd44dd' : '#666',
            width: 24,
            textAlign: 'right',
            flexShrink: 0,
          }}>
            {entry.prestigeCount}
          </span>
        </div>
      ))}

      {entries.length <= 1 && (
        <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '12px 0', letterSpacing: 1 }}>
          NO OTHER PLAYERS ONLINE
        </div>
      )}

      <div style={{ marginTop: 4, fontSize: 9, color: '#333', textAlign: 'center', letterSpacing: 1 }}>
        CLICK COLUMN HEADERS TO SORT
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function PlayerListPanel() {
  const [tab, setTab] = useState<Tab>('online')

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontFamily: '"Courier New", monospace',
      color: '#e0d6c8',
    }}>
      <TabBar active={tab} onSelect={setTab} />
      {tab === 'online' ? <OnlineTab /> : <LeaderboardTab />}
    </div>
  )
}
