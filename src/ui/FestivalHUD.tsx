// ── FestivalHUD.tsx ────────────────────────────────────────────────────────────
// M41 Track C: Banner shown on festival start + persistent corner indicator.
// Listens for 'festival-start' / 'festival-end' CustomEvents.
// Persistent state read from useFestivalStore.

import React, { useState, useEffect } from 'react'
import { useFestivalStore } from '../store/festivalStore'
import type { Festival } from '../game/FestivalSystem'

// ── Banner auto-dismisses after 8 seconds ─────────────────────────────────────

const BANNER_DURATION_MS = 8000

function getBonusLabels(festival: Festival): string[] {
  const labels: string[] = []
  const b = festival.bonuses
  if (b.xpMultiplier)         labels.push(`XP x${b.xpMultiplier.toFixed(2)}`)
  if (b.craftSpeedMultiplier) labels.push(`Craft Speed x${(1 / b.craftSpeedMultiplier).toFixed(1)}`)
  if (b.lootQualityBonus)     labels.push(`Loot Quality +${(b.lootQualityBonus * 100).toFixed(0)}%`)
  if (b.goldDropMultiplier)   labels.push(`Gold x${b.goldDropMultiplier.toFixed(2)}`)
  return labels
}

// Season-based gradient colours
const SEASON_COLORS: Record<string, { from: string; to: string; accent: string }> = {
  AUTUMN:  { from: '#8B4513', to: '#D2691E', accent: '#FFD700' },
  WINTER:  { from: '#1a3a5c', to: '#2e6ba8', accent: '#a8d8f0' },
  SPRING:  { from: '#2d6a2d', to: '#5cb85c', accent: '#d4ffd4' },
  SUMMER:  { from: '#8B6914', to: '#DAA520', accent: '#FFF8DC' },
}

export function FestivalHUD(): React.ReactElement | null {
  const activeFestival = useFestivalStore((s) => s.activeFestival)

  // Banner visibility state — shown for BANNER_DURATION_MS on each festival start
  const [bannerFestival, setBannerFestival] = useState<Festival | null>(null)
  const [bannerVisible, setBannerVisible] = useState(false)

  useEffect(() => {
    function onStart(e: Event) {
      const festival = (e as CustomEvent<Festival>).detail
      setBannerFestival(festival)
      setBannerVisible(true)
    }

    function onEnd() {
      setBannerVisible(false)
    }

    window.addEventListener('festival-start', onStart)
    window.addEventListener('festival-end', onEnd)
    return () => {
      window.removeEventListener('festival-start', onStart)
      window.removeEventListener('festival-end', onEnd)
    }
  }, [])

  // Auto-dismiss banner after BANNER_DURATION_MS
  useEffect(() => {
    if (!bannerVisible) return
    const timer = setTimeout(() => setBannerVisible(false), BANNER_DURATION_MS)
    return () => clearTimeout(timer)
  }, [bannerVisible])

  const colors = bannerFestival
    ? (SEASON_COLORS[bannerFestival.season] ?? SEASON_COLORS.SUMMER)
    : SEASON_COLORS.SUMMER

  const cornerColors = activeFestival
    ? (SEASON_COLORS[activeFestival.season] ?? SEASON_COLORS.SUMMER)
    : SEASON_COLORS.SUMMER

  return (
    <>
      {/* ── Full banner — shown for 8 seconds on festival start ── */}
      {bannerVisible && bannerFestival && (
        <div
          style={{
            position: 'fixed',
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            background: `linear-gradient(135deg, ${colors.from} 0%, ${colors.to} 100%)`,
            border: `2px solid ${colors.accent}`,
            borderRadius: 12,
            padding: '14px 28px',
            zIndex: 1200,
            pointerEvents: 'none',
            boxShadow: `0 4px 24px rgba(0,0,0,0.6), 0 0 20px ${colors.accent}44`,
            textAlign: 'center',
            minWidth: 320,
            maxWidth: 520,
          }}
        >
          <div style={{
            fontSize: 22,
            fontWeight: 700,
            color: colors.accent,
            letterSpacing: '0.08em',
            marginBottom: 4,
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          }}>
            {'\uD83C\uDF89'} {bannerFestival.name.toUpperCase()} {'\uD83C\uDF89'}
          </div>

          <div style={{
            fontSize: 13,
            color: '#ffffff',
            opacity: 0.9,
            marginBottom: 10,
            lineHeight: 1.4,
          }}>
            {bannerFestival.description}
          </div>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            justifyContent: 'center',
          }}>
            {getBonusLabels(bannerFestival).map((label) => (
              <span
                key={label}
                style={{
                  background: 'rgba(0,0,0,0.35)',
                  border: `1px solid ${colors.accent}88`,
                  borderRadius: 6,
                  padding: '3px 10px',
                  fontSize: 12,
                  color: colors.accent,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                }}
              >
                {label}
              </span>
            ))}
          </div>

          <div style={{
            marginTop: 10,
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
          }}>
            Festival active for {bannerFestival.durationDays} days
          </div>
        </div>
      )}

      {/* ── Persistent corner indicator — shown while festival is active ── */}
      {activeFestival && (
        <div
          style={{
            position: 'fixed',
            top: 60,
            right: 12,
            background: `linear-gradient(135deg, ${cornerColors.from}cc 0%, ${cornerColors.to}cc 100%)`,
            border: `1px solid ${cornerColors.accent}88`,
            borderRadius: 8,
            padding: '5px 12px',
            zIndex: 900,
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 14 }}>{'\uD83C\uDF89'}</span>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: cornerColors.accent,
            letterSpacing: '0.05em',
            textShadow: '0 1px 3px rgba(0,0,0,0.7)',
          }}>
            {activeFestival.name.toUpperCase()}
          </span>
        </div>
      )}
    </>
  )
}
