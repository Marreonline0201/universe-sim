// ── HomeCustomizationPanel.tsx ────────────────────────────────────────────────
// M53 Track B: Player Home Customization
// Room themes, decorations, and home identity editor.

import { useState, useEffect, useCallback } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import {
  type RoomTheme,
  type HomeDecoration,
  type HomeProfile,
  getDecorations,
  getHomeProfile,
  purchaseDecoration,
  equipDecoration,
  unequipDecoration,
  setHomeName,
  setHomeDescription,
  setActiveTheme,
} from '../../game/HomeCustomizationSystem'

// ── Theme config ──────────────────────────────────────────────────────────────

const THEMES: { id: RoomTheme; label: string; icon: string }[] = [
  { id: 'rustic',     label: 'Rustic',      icon: '🪵' },
  { id: 'noble',      label: 'Noble',       icon: '👑' },
  { id: 'arcane',     label: 'Arcane',      icon: '🔮' },
  { id: 'wilderness', label: 'Wilderness',  icon: '🌿' },
  { id: 'industrial', label: 'Industrial',  icon: '⚙' },
]

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  root: {
    fontFamily: 'monospace',
  } as React.CSSProperties,

  goldBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginBottom: 14,
  } as React.CSSProperties,
  goldLabel: {
    color: '#888',
    fontFamily: 'monospace',
    fontSize: 11,
  } as React.CSSProperties,
  goldValue: {
    color: '#ffd54f',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 700,
  } as React.CSSProperties,

  sectionTitle: {
    color: '#7c5cbf',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 8,
    borderBottom: '1px solid #2a2a2a',
    paddingBottom: 4,
  } as React.CSSProperties,

  section: {
    marginBottom: 18,
  } as React.CSSProperties,

  inputLabel: {
    color: '#888',
    fontFamily: 'monospace',
    fontSize: 10,
    marginBottom: 4,
    display: 'block',
  } as React.CSSProperties,

  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid #333',
    borderRadius: 3,
    color: '#e0e0e0',
    fontFamily: 'monospace',
    fontSize: 12,
    padding: '5px 8px',
    boxSizing: 'border-box' as const,
    outline: 'none',
    marginBottom: 10,
  } as React.CSSProperties,

  textarea: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid #333',
    borderRadius: 3,
    color: '#e0e0e0',
    fontFamily: 'monospace',
    fontSize: 12,
    padding: '5px 8px',
    boxSizing: 'border-box' as const,
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: 52,
    marginBottom: 4,
  } as React.CSSProperties,

  charCount: {
    color: '#555',
    fontFamily: 'monospace',
    fontSize: 10,
    textAlign: 'right' as const,
    marginBottom: 6,
  } as React.CSSProperties,

  themeBar: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,

  themeBtn: (active: boolean): React.CSSProperties => ({
    flex: '1 1 0',
    minWidth: 60,
    padding: '6px 4px',
    background: active ? 'rgba(124,92,191,0.28)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? '#7c5cbf' : '#2a2a2a'}`,
    borderRadius: 3,
    color: active ? '#c9a0ff' : '#888',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.12s',
  }),

  decorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  } as React.CSSProperties,

  decorCard: (owned: boolean, canAfford: boolean): React.CSSProperties => ({
    background: owned ? 'rgba(76,175,80,0.07)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${owned ? '#4caf50' : canAfford ? '#333' : '#5a1a1a'}`,
    borderRadius: 4,
    padding: '8px 10px',
  }),

  decorIcon: {
    fontSize: 20,
    display: 'block',
    marginBottom: 4,
  } as React.CSSProperties,

  decorName: {
    color: '#e0e0e0',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 2,
  } as React.CSSProperties,

  decorDesc: {
    color: '#666',
    fontFamily: 'monospace',
    fontSize: 10,
    marginBottom: 6,
  } as React.CSSProperties,

  decorCost: (canAfford: boolean): React.CSSProperties => ({
    color: canAfford ? '#888' : '#e53935',
    fontFamily: 'monospace',
    fontSize: 10,
    marginBottom: 6,
  }),

  btn: (variant: 'buy' | 'equip' | 'unequip' | 'disabled'): React.CSSProperties => {
    const colors: Record<string, { bg: string; border: string; color: string }> = {
      buy:      { bg: 'rgba(124,92,191,0.18)', border: '#7c5cbf', color: '#c9a0ff' },
      equip:    { bg: 'rgba(0,229,255,0.10)',  border: '#00e5ff', color: '#00e5ff' },
      unequip:  { bg: 'rgba(76,175,80,0.12)',  border: '#4caf50', color: '#4caf50' },
      disabled: { bg: 'rgba(255,255,255,0.03)', border: '#333',   color: '#444'    },
    }
    const c = colors[variant]
    return {
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.color,
      fontFamily: 'monospace',
      fontSize: 10,
      letterSpacing: 1,
      padding: '3px 10px',
      cursor: variant === 'disabled' ? 'not-allowed' : 'pointer',
      borderRadius: 3,
      transition: 'all 0.12s',
      width: '100%',
    }
  },

  flash: (ok: boolean): React.CSSProperties => ({
    background: ok ? 'rgba(76,175,80,0.15)' : 'rgba(229,57,53,0.15)',
    border: `1px solid ${ok ? '#4caf50' : '#e53935'}`,
    color: ok ? '#81c784' : '#ef9a9a',
    fontFamily: 'monospace',
    fontSize: 11,
    padding: '6px 12px',
    borderRadius: 3,
    marginBottom: 12,
    textAlign: 'center' as const,
  }),

  equippedBadge: {
    color: '#4caf50',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 4,
    display: 'block',
  } as React.CSSProperties,
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HomeCustomizationPanel() {
  const gold = usePlayerStore(s => s.gold)

  const [profile, setProfile] = useState<HomeProfile>(getHomeProfile)
  const [decorations, setDecorations] = useState<HomeDecoration[]>(getDecorations)
  const [flashMsg, setFlashMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [nameInput, setNameInput] = useState(profile.homeName)
  const [descInput, setDescInput] = useState(profile.homeDescription)

  const refresh = useCallback(() => {
    setProfile(getHomeProfile())
    setDecorations(getDecorations())
  }, [])

  // Refresh on home-customized events
  useEffect(() => {
    window.addEventListener('home-customized', refresh)
    return () => window.removeEventListener('home-customized', refresh)
  }, [refresh])

  function showFlash(text: string, ok: boolean) {
    setFlashMsg({ text, ok })
    setTimeout(() => setFlashMsg(null), 2500)
  }

  function handleNameBlur() {
    setHomeName(nameInput)
    setProfile(getHomeProfile())
  }

  function handleDescBlur() {
    setHomeDescription(descInput)
    setProfile(getHomeProfile())
  }

  function handleThemeClick(theme: RoomTheme) {
    // Equip first owned decoration of this theme, or just set active theme for filtering
    const firstOwned = decorations.find(d => d.theme === theme && d.owned)
    if (firstOwned) {
      equipDecoration(firstOwned.id)
    } else {
      setActiveTheme(theme)
      setProfile(prev => ({ ...prev, activeTheme: theme }))
    }
    refresh()
  }

  function handleBuy(dec: HomeDecoration) {
    const ok = purchaseDecoration(dec.id, gold)
    if (ok) {
      showFlash(`Purchased ${dec.name}!`, true)
    } else {
      showFlash(`Not enough gold for ${dec.name}.`, false)
    }
    refresh()
  }

  function handleEquip(dec: HomeDecoration) {
    equipDecoration(dec.id)
    showFlash(`${dec.name} equipped!`, true)
    refresh()
  }

  function handleUnequip(dec: HomeDecoration) {
    unequipDecoration(dec.id)
    showFlash(`${dec.name} unequipped.`, true)
    refresh()
  }

  // Filter decorations by active theme (if set), else show all
  const visibleDecorations = profile.activeTheme
    ? decorations.filter(d => d.theme === profile.activeTheme)
    : decorations

  return (
    <div style={S.root}>

      {/* Gold bar */}
      <div style={S.goldBar}>
        <span style={S.goldLabel}>Your Gold:</span>
        <span style={S.goldValue}>{gold} g</span>
      </div>

      {/* Flash */}
      {flashMsg && <div style={S.flash(flashMsg.ok)}>{flashMsg.text}</div>}

      {/* Section 1: Home Identity */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Home Identity</div>

        <label style={S.inputLabel}>Home Name (max 32)</label>
        <input
          style={S.input}
          type="text"
          maxLength={32}
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onBlur={handleNameBlur}
          placeholder="My Homestead"
        />

        <label style={S.inputLabel}>Description (max 120)</label>
        <textarea
          style={S.textarea}
          maxLength={120}
          value={descInput}
          onChange={e => setDescInput(e.target.value)}
          onBlur={handleDescBlur}
          placeholder="A short bio for your home..."
        />
        <div style={S.charCount}>{descInput.length}/120</div>
      </div>

      {/* Section 2: Theme Selector */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Room Theme</div>
        <div style={S.themeBar}>
          {THEMES.map(t => (
            <button
              key={t.id}
              style={S.themeBtn(profile.activeTheme === t.id)}
              onClick={() => handleThemeClick(t.id)}
              onMouseEnter={e => {
                if (profile.activeTheme !== t.id) {
                  e.currentTarget.style.borderColor = '#7c5cbf'
                  e.currentTarget.style.color = '#c9a0ff'
                }
              }}
              onMouseLeave={e => {
                if (profile.activeTheme !== t.id) {
                  e.currentTarget.style.borderColor = '#2a2a2a'
                  e.currentTarget.style.color = '#888'
                }
              }}
            >
              <span style={{ display: 'block', fontSize: 14, marginBottom: 2 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
        {profile.activeTheme && (
          <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 10, marginTop: 6 }}>
            Showing decorations for:{' '}
            <span style={{ color: '#7c5cbf' }}>
              {THEMES.find(t => t.id === profile.activeTheme)?.label}
            </span>
            {' '}— click another theme to filter, or{' '}
            <span
              style={{ color: '#7c5cbf', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => { setActiveTheme(null); setProfile(prev => ({ ...prev, activeTheme: null })) }}
            >
              show all
            </span>
          </div>
        )}
      </div>

      {/* Section 3: Decorations Grid */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Decorations</div>
        <div style={S.decorGrid}>
          {visibleDecorations.map(dec => {
            const canAfford = gold >= dec.cost.gold
            return (
              <div key={dec.id} style={S.decorCard(dec.owned, canAfford)}>
                <span style={S.decorIcon}>{dec.icon}</span>
                <div style={S.decorName}>{dec.name}</div>
                <div style={S.decorDesc}>{dec.description}</div>

                {!dec.owned && (
                  <div style={S.decorCost(canAfford)}>{dec.cost.gold} gold</div>
                )}

                {dec.owned && dec.equipped && (
                  <span style={S.equippedBadge}>EQUIPPED ✓</span>
                )}

                {!dec.owned && (
                  <button
                    style={S.btn(canAfford ? 'buy' : 'disabled')}
                    disabled={!canAfford}
                    onClick={() => canAfford && handleBuy(dec)}
                  >
                    BUY
                  </button>
                )}

                {dec.owned && !dec.equipped && (
                  <button
                    style={S.btn('equip')}
                    onClick={() => handleEquip(dec)}
                  >
                    EQUIP
                  </button>
                )}

                {dec.owned && dec.equipped && (
                  <button
                    style={S.btn('unequip')}
                    onClick={() => handleUnequip(dec)}
                  >
                    UNEQUIP
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
