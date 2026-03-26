// ── PlayerStatsDashboard.tsx ───────────────────────────────────────────────────
// M60 Track C: Comprehensive player stats aggregation panel.
// Dark monospace theme, category-colored stat tiles, 5s refresh.

import React, { useState, useEffect } from 'react'
import { usePlayerStatsStore } from '../../store/playerStatsStore'
import { usePlayerStore } from '../../store/playerStore'
import { useGameStore } from '../../store/gameStore'
import { skillSystem, SkillSystem, type SkillId } from '../../game/SkillSystem'
import { getEquippedTitle, getUnlockedTitles } from '../../game/TitleProgressionSystem'
import { getMilestones } from '../../game/AchievementShowcaseSystem'

// ── Category color palette ────────────────────────────────────────────────────

const CAT_COLORS = {
  combat:    { fg: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)' },
  explore:   { fg: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.2)'  },
  economy:   { fg: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.2)'  },
  crafting:  { fg: '#4ade80', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.2)'  },
  header:    { fg: '#e2e8f0', bg: 'rgba(226,232,240,0.04)', border: 'rgba(226,232,240,0.1)' },
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtDist(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${Math.round(meters)} m`
}

function fmtPlaytime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtGold(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ── XP progress bar ──────────────────────────────────────────────────────────

const XP_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 4000, 7000, 11000, 16000, 22000]

function xpProgress(xp: number, level: number): number {
  if (level >= 10) return 1
  const lo = XP_THRESHOLDS[level]
  const hi = XP_THRESHOLDS[level + 1]
  return Math.max(0, Math.min(1, (xp - lo) / (hi - lo)))
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      color,
      fontFamily: 'monospace',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 2,
      textTransform: 'uppercase',
      borderBottom: `1px solid ${color}33`,
      paddingBottom: 4,
      marginBottom: 8,
      marginTop: 16,
    }}>
      {label}
    </div>
  )
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  cat,
}: {
  label: string
  value: string | number
  cat: keyof typeof CAT_COLORS
}) {
  const c = CAT_COLORS[cat]
  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 4,
      padding: '7px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}>
      <div style={{
        color: '#666',
        fontFamily: 'monospace',
        fontSize: 9,
        letterSpacing: 1,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {label}
      </div>
      <div style={{
        color: c.fg,
        fontFamily: 'monospace',
        fontSize: 15,
        fontWeight: 700,
        lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  )
}

// ── 3-column tile grid ────────────────────────────────────────────────────────

function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 6,
    }}>
      {children}
    </div>
  )
}

// ── XP Bar ────────────────────────────────────────────────────────────────────

function XpBar({ progress, color }: { progress: number; color: string }) {
  return (
    <div style={{
      height: 4,
      background: 'rgba(255,255,255,0.08)',
      borderRadius: 2,
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{
        height: '100%',
        width: `${Math.round(progress * 100)}%`,
        background: color,
        borderRadius: 2,
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

// ── Skill row ─────────────────────────────────────────────────────────────────

function SkillRow({ skillId }: { skillId: SkillId }) {
  const data = skillSystem.getSkill(skillId)
  const progress = skillSystem.getXpProgress(skillId)
  const color = SkillSystem.getSkillColor(skillId)
  const name = SkillSystem.getSkillName(skillId)
  const icon = SkillSystem.getSkillIcon(skillId)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 0',
      borderBottom: '1px solid #1a1a1a',
    }}>
      <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 10, width: 20, flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 11, width: 72, flexShrink: 0 }}>
        {name}
      </span>
      <span style={{ color, fontFamily: 'monospace', fontSize: 11, fontWeight: 700, width: 22, flexShrink: 0 }}>
        {data.level}
      </span>
      <div style={{ flex: 1 }}>
        <XpBar progress={data.level >= 10 ? 1 : progress} color={color} />
      </div>
      <span style={{ color: '#444', fontFamily: 'monospace', fontSize: 9, flexShrink: 0 }}>
        {data.level >= 10 ? 'MAX' : `${Math.round(data.xp)} xp`}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PlayerStatsDashboard() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(id)
  }, [])

  // Store reads
  const stats = usePlayerStatsStore(s => s.stats)
  // Cast to loose record to safely access optional stats not yet in the store type
  const statsLoose = stats as unknown as Record<string, number>
  const gold = usePlayerStore(s => s.gold)
  const health = usePlayerStore(s => s.health)
  const simSeconds = useGameStore(s => s.simSeconds)

  // Systems (not reactive stores — refreshed on 5s tick via re-render)
  const equippedTitle = getEquippedTitle()
  const unlockedTitles = getUnlockedTitles()
  const milestones = getMilestones()
  const claimedCount = milestones.filter(m => m.claimed).length
  const unlockedCount = milestones.filter(m => m.unlocked).length
  const totalMilestones = milestones.length
  const skillIds = SkillSystem.getAllSkillIds()

  // Health bar color
  const hpColor = health > 0.6 ? '#4ade80' : health > 0.3 ? '#fbbf24' : '#f87171'
  const hpPct = Math.round(health * 100)

  return (
    <div style={{
      fontFamily: 'monospace',
      color: '#ccc',
      fontSize: 12,
      paddingBottom: 24,
    }}>

      {/* ── Header: level, XP, title, playtime ─────────────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #2a2a2a',
        borderRadius: 6,
        padding: '12px 14px',
        marginBottom: 4,
      }}>
        {/* Row 1: health + gold */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#555', fontSize: 9 }}>HP</span>
            <div style={{ width: 80, height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${hpPct}%`, height: '100%', background: hpColor, borderRadius: 3 }} />
            </div>
            <span style={{ color: hpColor, fontSize: 11 }}>{hpPct}%</span>
          </div>
          <div style={{ color: '#fbbf24', fontSize: 12, fontWeight: 700 }}>
            {fmtGold(gold)} <span style={{ color: '#666', fontWeight: 400 }}>gold</span>
          </div>
        </div>

        {/* Row 2: equipped title */}
        <div style={{ marginBottom: 8 }}>
          {equippedTitle ? (
            <span style={{
              display: 'inline-block',
              background: 'rgba(250,204,21,0.08)',
              border: '1px solid rgba(250,204,21,0.3)',
              borderRadius: 3,
              padding: '2px 8px',
              color: '#fbbf24',
              fontSize: 11,
            }}>
              {equippedTitle.icon} {equippedTitle.title}
            </span>
          ) : (
            <span style={{ color: '#3a3a3a', fontSize: 10 }}>— no title equipped —</span>
          )}
          <span style={{ color: '#444', fontSize: 10, marginLeft: 8 }}>
            {unlockedTitles.length} title{unlockedTitles.length !== 1 ? 's' : ''} unlocked
          </span>
        </div>

        {/* Row 3: playtime */}
        <div style={{ color: '#555', fontSize: 10 }}>
          Playtime: <span style={{ color: '#888' }}>{fmtPlaytime(simSeconds)}</span>
        </div>
      </div>

      {/* ── Combat ─────────────────────────────────────────────────────────── */}
      <SectionHeader label="Combat" color={CAT_COLORS.combat.fg} />
      <TileGrid>
        <StatTile label="Kills" value={stats.killCount} cat="combat" />
        <StatTile label="Bosses" value={stats.bossesKilled} cat="combat" />
        <StatTile label="Deaths" value={statsLoose['deathCount'] ?? 0} cat="combat" />
        <StatTile label="Spells Cast" value={statsLoose['spellsCast'] ?? 0} cat="combat" />
      </TileGrid>

      {/* ── Exploration ────────────────────────────────────────────────────── */}
      <SectionHeader label="Exploration" color={CAT_COLORS.explore.fg} />
      <TileGrid>
        <StatTile label="Distance" value={fmtDist(stats.distanceTraveled)} cat="explore" />
        <StatTile label="Settlements" value={stats.settlementsDiscovered} cat="explore" />
        <StatTile label="Sieges" value={statsLoose['siegesParticipated'] ?? 0} cat="explore" />
      </TileGrid>

      {/* ── Economy ────────────────────────────────────────────────────────── */}
      <SectionHeader label="Economy" color={CAT_COLORS.economy.fg} />
      <TileGrid>
        <StatTile label="Gold Earned" value={fmtGold(stats.totalGoldEarned)} cat="economy" />
        <StatTile label="Traders Met" value={statsLoose['tradersInteracted'] ?? 0} cat="economy" />
        <StatTile label="Current Gold" value={fmtGold(gold)} cat="economy" />
      </TileGrid>

      {/* ── Crafting & Gathering ───────────────────────────────────────────── */}
      <SectionHeader label="Crafting & Gathering" color={CAT_COLORS.crafting.fg} />
      <TileGrid>
        <StatTile label="Resources" value={stats.resourcesGathered} cat="crafting" />
        <StatTile label="Crafted" value={stats.itemsCrafted} cat="crafting" />
        <StatTile label="Potions" value={stats.potionsBrewed} cat="crafting" />
        <StatTile label="Tamed" value={stats.animalsTamed} cat="crafting" />
        <StatTile label="Gold Fish" value={stats.goldenFishCaught} cat="crafting" />
      </TileGrid>

      {/* ── Skills ─────────────────────────────────────────────────────────── */}
      <SectionHeader label="Skills" color="#a78bfa" />
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid #1e1e1e',
        borderRadius: 4,
        padding: '4px 10px',
      }}>
        {skillIds.map(id => (
          <SkillRow key={id} skillId={id} />
        ))}
      </div>

      {/* ── Achievements ───────────────────────────────────────────────────── */}
      <SectionHeader label="Achievements" color="#c084fc" />
      <div style={{
        background: 'rgba(192,132,252,0.05)',
        border: '1px solid rgba(192,132,252,0.15)',
        borderRadius: 4,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ color: '#c084fc', fontSize: 18, fontWeight: 700 }}>
            {claimedCount}
          </span>
          <span style={{ color: '#555', fontSize: 12 }}>
            {' '}/ {totalMilestones} claimed
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#fbbf24', fontSize: 11 }}>
            {unlockedCount - claimedCount > 0
              ? `${unlockedCount - claimedCount} claimable!`
              : 'all claimed'}
          </div>
          <div style={{ color: '#444', fontSize: 9, marginTop: 2 }}>
            Open Showcase panel to claim
          </div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div style={{ color: '#2a2a2a', fontSize: 9, textAlign: 'center', marginTop: 20 }}>
        refreshes every 5s
      </div>
    </div>
  )
}
