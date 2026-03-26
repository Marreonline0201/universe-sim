// ── FishingPanel ───────────────────────────────────────────────────────────────
// Minigame UI for the fishing state machine.
// M25 Track C — base minigame
// M34 Track C — tension meter, catch history, rod durability, golden fish overlay
// M45 Track C — depth selector, rare fish notification, depth-tagged recent catches

import { useEffect, useState, useCallback } from 'react'
import { fishingSystem, type FishingSystemState, ROD_MAX_DURABILITY } from '../../game/FishingSystem'
import {
  type FishDepth,
  type FishEntry,
  currentDepth as getInitialDepth,
  setFishingDepth,
  rollFish,
} from '../../game/FishingDepthSystem'

const mono: React.CSSProperties = { fontFamily: 'monospace' }

// ── CSS keyframes injected once ───────────────────────────────────────────────
const STYLE_ID = 'fishing-panel-keyframes'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    @keyframes bobber-float {
      0%,100% { transform: translateY(0px); }
      50%      { transform: translateY(-8px); }
    }
    @keyframes wave-drift {
      0%   { transform: scaleX(1)   translateY(0px); }
      50%  { transform: scaleX(0.9) translateY(3px); }
      100% { transform: scaleX(1)   translateY(0px); }
    }
    @keyframes bite-pulse {
      0%,100% { opacity: 1; transform: scale(1); }
      50%      { opacity: 0.6; transform: scale(1.08); }
    }
    @keyframes golden-flash {
      0%   { opacity: 0; transform: scale(0.8); }
      20%  { opacity: 1; transform: scale(1.05); }
      80%  { opacity: 1; transform: scale(1); }
      100% { opacity: 0; transform: scale(1); }
    }
    @keyframes rare-catch-in {
      0%   { opacity: 0; transform: translateY(-12px) scale(0.9); }
      20%  { opacity: 1; transform: translateY(0px)  scale(1.04); }
      80%  { opacity: 1; transform: translateY(0px)  scale(1); }
      100% { opacity: 0; transform: translateY(4px)  scale(0.97); }
    }
  `
  document.head.appendChild(s)
}

// ── Progress bar shared component ────────────────────────────────────────────

function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#888', fontSize: 11 }}>{label}</span>
        <span style={{ color, fontSize: 11 }}>{Math.round(value * 100)}%</span>
      </div>
      <div style={{
        height: 12,
        borderRadius: 6,
        background: '#1a1a1a',
        border: '1px solid #333',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(100, value * 100)}%`,
          height: '100%',
          background: color,
          borderRadius: 6,
          transition: 'width 0.1s',
        }} />
      </div>
    </div>
  )
}

// ── Durability bar ────────────────────────────────────────────────────────────

function DurabilityBar({ durability }: { durability: number }) {
  const pct  = durability / ROD_MAX_DURABILITY
  const color = pct > 0.5 ? '#44ff88' : pct > 0.2 ? '#ffcc44' : '#ff4444'
  const label = durability <= 0 ? 'ROD BROKEN' : `Rod: ${durability}/${ROD_MAX_DURABILITY}`

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: '#666', fontSize: 10 }}>Fishing Rod</span>
        <span style={{ color, fontSize: 10, fontWeight: durability <= 0 ? 700 : 400 }}>{label}</span>
      </div>
      <div style={{
        height: 5,
        borderRadius: 3,
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct * 100}%`,
          height: '100%',
          background: color,
          borderRadius: 3,
          transition: 'width 0.3s',
        }} />
      </div>
    </div>
  )
}

// ── Tension meter ─────────────────────────────────────────────────────────────

function TensionMeter({
  tension,
  sweetMin,
  sweetMax,
}: { tension: number; sweetMin: number; sweetMax: number }) {
  const inSweet  = tension >= sweetMin && tension <= sweetMax
  const isCrit   = tension >= 90
  const barColor = isCrit ? '#ff8000' : inSweet ? '#44ff88' : tension > sweetMax ? '#ff4444' : '#4a90e2'
  const label    = isCrit ? 'CRITICAL!' : inSweet ? 'SWEET SPOT — Press F!' : tension < sweetMin ? 'Building...' : 'Too high!'

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#888', fontSize: 11 }}>Tension</span>
        <span style={{ color: barColor, fontSize: 11, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{
        height: 14,
        borderRadius: 7,
        background: '#111',
        border: '1px solid #333',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Sweet spot highlight band */}
        <div style={{
          position: 'absolute',
          left:   `${sweetMin}%`,
          width:  `${sweetMax - sweetMin}%`,
          top: 0,
          bottom: 0,
          background: 'rgba(68,255,136,0.18)',
          borderLeft:  '1px solid rgba(68,255,136,0.5)',
          borderRight: '1px solid rgba(68,255,136,0.5)',
        }} />
        {/* Fill bar */}
        <div style={{
          width:      `${tension}%`,
          height:     '100%',
          background: barColor,
          borderRadius: 7,
          transition: 'width 0.05s, background 0.1s',
        }} />
      </div>
      <div style={{ color: '#555', fontSize: 10, marginTop: 3 }}>
        Sweet spot: {Math.round(sweetMin)}–{Math.round(sweetMax)}% · Press F to hook!
      </div>
    </div>
  )
}

// ── Catch history ─────────────────────────────────────────────────────────────

const FISH_ICONS: Record<string, string> = {
  Sardine:             '🐟',
  Bass:                '🐟',
  Salmon:              '🍣',
  Tuna:                '🐠',
  'Golden Fish':       '⭐',
  'Cave Fish':         '💙',
  'River Trout':       '🐟',
  Minnow:              '🐟',
  'Silver Perch':      '🐟',
  'Deep Tuna':         '🐠',
  'Ancient Leviathan': '🐉',
  'Abyssal Eel':       '🌊',
}

// ── Depth selector ────────────────────────────────────────────────────────────

const DEPTH_LABELS: Record<FishDepth, string> = {
  shallow: 'SHALLOW',
  medium:  'MEDIUM',
  deep:    'DEEP',
}

const DEPTH_COLORS: Record<FishDepth, string> = {
  shallow: '#7ec8e3',
  medium:  '#4a90e2',
  deep:    '#5533aa',
}

function DepthSelector({ depth, onChange }: { depth: FishDepth; onChange: (d: FishDepth) => void }) {
  const depths: FishDepth[] = ['shallow', 'medium', 'deep']
  return (
    <div style={{
      display: 'flex',
      gap: 4,
      padding: '8px 16px',
      borderBottom: '1px solid #2a2a2a',
    }}>
      <span style={{ color: '#555', fontSize: 10, alignSelf: 'center', marginRight: 4, letterSpacing: 0.5 }}>
        DEPTH
      </span>
      {depths.map(d => {
        const active = d === depth
        const color  = DEPTH_COLORS[d]
        return (
          <button
            key={d}
            onClick={() => onChange(d)}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 10,
              fontFamily: 'monospace',
              letterSpacing: 1,
              cursor: 'pointer',
              border: `1px solid ${active ? color : '#333'}`,
              borderRadius: 4,
              background: active ? `${color}22` : 'transparent',
              color: active ? color : '#555',
              fontWeight: active ? 700 : 400,
              transition: 'all 0.15s',
            }}
          >
            {DEPTH_LABELS[d]}
          </button>
        )
      })}
    </div>
  )
}

// ── Rare catch notification ───────────────────────────────────────────────────

interface RareCatch {
  name: string
  key: number
}

function RareCatchNotification({ catch: rc, onDone }: { catch: RareCatch; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [onDone, rc.key])

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 100,
      pointerEvents: 'none',
      animation: 'rare-catch-in 3.5s ease-in-out forwards',
      whiteSpace: 'nowrap',
    }}>
      <div style={{
        background: 'rgba(12, 8, 0, 0.97)',
        border: '1px solid #ffaa00',
        borderRadius: 6,
        padding: '7px 16px',
        boxShadow: '0 0 24px rgba(255, 170, 0, 0.5)',
        fontFamily: 'monospace',
        textAlign: 'center',
      }}>
        <span style={{ color: '#ffcc44', fontSize: 10, letterSpacing: 3 }}>[ RARE CATCH ]</span>
        <span style={{ color: '#ff8000', fontSize: 13, fontWeight: 900, marginLeft: 8 }}>
          {rc.name}!
        </span>
      </div>
    </div>
  )
}

// ── Recent catches with depth info ────────────────────────────────────────────

interface DepthCatchEntry {
  name: string
  depth: FishDepth
  rare: boolean
}

function RecentDepthCatches({ catches }: { catches: DepthCatchEntry[] }) {
  if (catches.length === 0) return null
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid #1e1e1e', paddingTop: 8 }}>
      <div style={{ color: '#555', fontSize: 10, marginBottom: 5, letterSpacing: 0.5 }}>
        RECENT CATCHES (DEPTH)
      </div>
      {catches.map((c, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 3,
          opacity: 1 - i * 0.15,
        }}>
          <span style={{ fontSize: 12 }}>{FISH_ICONS[c.name] ?? '🐟'}</span>
          <span style={{ color: c.rare ? '#ffaa00' : '#bbb', fontSize: 11, flex: 1 }}>
            {c.name}
          </span>
          <span style={{
            fontSize: 9,
            color: DEPTH_COLORS[c.depth],
            padding: '1px 5px',
            border: `1px solid ${DEPTH_COLORS[c.depth]}55`,
            borderRadius: 3,
            letterSpacing: 0.5,
          }}>
            {DEPTH_LABELS[c.depth]}
          </span>
          {c.rare && (
            <span style={{
              fontSize: 9,
              color: '#ffaa00',
              padding: '1px 5px',
              border: '1px solid #ffaa0044',
              borderRadius: 3,
              letterSpacing: 0.5,
            }}>
              RARE
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function CatchHistory({ history }: { history: FishingSystemState['catchHistory'] }) {
  if (history.length === 0) return null

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #1e1e1e', paddingTop: 10 }}>
      <div style={{ color: '#555', fontSize: 10, marginBottom: 6, letterSpacing: 0.5 }}>
        RECENT CATCHES
      </div>
      {history.map((c, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 3,
          opacity: 1 - i * 0.15,
        }}>
          <span style={{ fontSize: 13 }}>{FISH_ICONS[c.name] ?? '🐟'}</span>
          <span style={{ color: '#bbb', fontSize: 11, flex: 1 }}>{c.name}</span>
          <span style={{
            fontSize: 10,
            color: c.rarityColor,
            padding: '1px 5px',
            border: `1px solid ${c.rarityColor}44`,
            borderRadius: 3,
          }}>
            {c.rarity}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Best catch ────────────────────────────────────────────────────────────────

function BestCatch({ best }: { best: FishingSystemState['bestCatch'] }) {
  if (!best) return null

  return (
    <div style={{
      marginTop: 8,
      padding: '6px 10px',
      background: `${best.rarityColor}11`,
      border: `1px solid ${best.rarityColor}33`,
      borderRadius: 4,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span style={{ fontSize: 16 }}>{FISH_ICONS[best.name] ?? '🐟'}</span>
      <div>
        <div style={{ color: '#666', fontSize: 9, letterSpacing: 0.5 }}>BEST CATCH</div>
        <div style={{ color: best.rarityColor, fontSize: 12, fontWeight: 700 }}>{best.name}</div>
      </div>
    </div>
  )
}

// ── Golden fish notification ──────────────────────────────────────────────────

function GoldenFishOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      pointerEvents: 'none',
      background: 'rgba(255, 180, 0, 0.08)',
      animation: 'golden-flash 4s ease-in-out forwards',
    }}>
      <div style={{
        background:   'rgba(20, 14, 0, 0.97)',
        border:       '2px solid #ff8000',
        borderRadius: 8,
        padding:      '28px 48px',
        textAlign:    'center',
        boxShadow:    '0 0 80px rgba(255, 160, 0, 0.6)',
        fontFamily:   'monospace',
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>⭐</div>
        <div style={{ fontSize: 11, color: '#ffcc00', letterSpacing: 4, marginBottom: 6 }}>
          LEGENDARY CATCH
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#ff8000', letterSpacing: 2 }}>
          Golden Fish
        </div>
        <div style={{ fontSize: 13, color: '#ffaa55', marginTop: 10 }}>
          Worth 500 gold at any merchant!
        </div>
      </div>
    </div>
  )
}

// ── Phase sub-views ───────────────────────────────────────────────────────────

function IdleView({ nearGoodSpot }: { nearGoodSpot: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 20px', ...mono }}>
      <div style={{ fontSize: 48 }}>🎣</div>
      {nearGoodSpot && (
        <div style={{
          display: 'inline-block',
          marginTop: 8,
          padding: '3px 10px',
          borderRadius: 4,
          background: '#44ff8822',
          border: '1px solid #44ff8888',
          color: '#44ff88',
          fontSize: 11,
        }}>
          Good fishing spot! +20% catch rate
        </div>
      )}
      <div style={{ color: '#aaa', fontSize: 13, marginTop: 10 }}>
        Stand near water and press <strong style={{ color: '#fff' }}>F</strong> to cast your line.
      </div>
    </div>
  )
}

function CastingView({ progress }: { progress: number }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 20px', ...mono }}>
      <div style={{ fontSize: 36, animation: 'wave-drift 0.8s ease-in-out infinite' }}>🌊</div>
      <div style={{ color: '#7ec8e3', fontSize: 14, marginTop: 16, letterSpacing: 1 }}>
        CASTING...
      </div>
      <div style={{ marginTop: 16 }}>
        <ProgressBar value={progress} color="#7ec8e3" label="Cast" />
      </div>
    </div>
  )
}

function WaitingView({ state }: { state: FishingSystemState }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 20px', ...mono }}>
      <div style={{
        fontSize: 40,
        display: 'inline-block',
        animation: 'bobber-float 1.8s ease-in-out infinite',
      }}>🪣</div>
      <div style={{ color: '#aaa', fontSize: 12, marginTop: 10 }}>
        Wait for the right tension, then press <strong style={{ color: '#fff' }}>F</strong>!
      </div>
      <TensionMeter
        tension={state.tension}
        sweetMin={state.sweetSpotMin}
        sweetMax={state.sweetSpotMax}
      />
    </div>
  )
}

function BitingView({ biteTimer }: { biteTimer: number }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 20px', ...mono }}>
      <div style={{
        fontSize: 22,
        color: '#ff4444',
        fontWeight: 700,
        letterSpacing: 2,
        animation: 'bite-pulse 0.5s ease-in-out infinite',
      }}>
        FISH ON!
      </div>
      <div style={{ color: '#ffcc44', fontSize: 14, marginTop: 10 }}>
        Press <strong style={{ color: '#fff' }}>F</strong> to reel in!
      </div>
      <div style={{ marginTop: 16 }}>
        <ProgressBar value={biteTimer / 2} color="#ff4444" label="Window" />
      </div>
      <div style={{ color: '#888', fontSize: 11, marginTop: 8 }}>
        {biteTimer.toFixed(1)}s remaining
      </div>
    </div>
  )
}

function ReelingView({ reelProgress, resistance }: { reelProgress: number; resistance: number }) {
  const fightColor = resistance > 0.6 ? '#ff4444' : resistance > 0.3 ? '#ffcc44' : '#44ff88'
  return (
    <div style={{ padding: '24px 20px', ...mono }}>
      <div style={{ color: '#7ec8e3', fontSize: 14, fontWeight: 700, letterSpacing: 1, textAlign: 'center' }}>
        REELING IN
      </div>
      <div style={{ color: '#aaa', fontSize: 11, textAlign: 'center', marginTop: 4 }}>
        Hold <strong style={{ color: '#fff' }}>F</strong> to reel
      </div>
      <div style={{ marginTop: 20 }}>
        <ProgressBar value={reelProgress} color="#44ff88" label="Reel" />
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Fish resistance</div>
        <div style={{
          height: 8,
          borderRadius: 4,
          background: '#1a1a1a',
          border: '1px solid #333',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${resistance * 100}%`,
            height: '100%',
            background: fightColor,
            transition: 'width 0.15s, background 0.15s',
            borderRadius: 4,
          }} />
        </div>
        <div style={{ color: fightColor, fontSize: 11, marginTop: 4 }}>
          {resistance > 0.6 ? 'Fighting hard!' : resistance > 0.3 ? 'Pulling back...' : 'Tiring out...'}
        </div>
      </div>
    </div>
  )
}

function LandedView({ lastCatch }: { lastCatch: NonNullable<FishingSystemState['lastCatch']> }) {
  const icon = FISH_ICONS[lastCatch.name] ?? '🐟'
  return (
    <div style={{ textAlign: 'center', padding: '28px 20px', ...mono }}>
      <div style={{ fontSize: 44 }}>{icon}</div>
      <div style={{ color: '#44ff88', fontSize: 18, fontWeight: 700, marginTop: 12, letterSpacing: 1 }}>
        FISH CAUGHT!
      </div>
      <div style={{ color: '#fff', fontSize: 16, marginTop: 8 }}>
        {lastCatch.name}
      </div>
      <div style={{
        display: 'inline-block',
        marginTop: 8,
        padding: '3px 12px',
        borderRadius: 4,
        background: `${lastCatch.rarityColor}22`,
        border: `1px solid ${lastCatch.rarityColor}`,
        color: lastCatch.rarityColor,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1,
      }}>
        {lastCatch.rarity.toUpperCase()}
      </div>
      <div style={{ color: '#888', fontSize: 11, marginTop: 14 }}>
        Added to inventory — press F to cast again.
      </div>
    </div>
  )
}

function EscapedView() {
  return (
    <div style={{ textAlign: 'center', padding: '32px 20px', ...mono }}>
      <div style={{ fontSize: 48 }}>💨</div>
      <div style={{ color: '#ff6644', fontSize: 16, fontWeight: 700, marginTop: 12 }}>
        It got away!
      </div>
      <div style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
        Press F to try again.
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function FishingPanel() {
  const [state, setState] = useState<FishingSystemState>(() => ({ ...fishingSystem.state }))
  const [showGolden, setShowGolden] = useState(false)

  // M45: depth selector state
  const [depth, setDepth] = useState<FishDepth>(() => getInitialDepth)

  // M45: rare catch banner (null = hidden)
  const [rareCatch, setRareCatch] = useState<{ name: string; key: number } | null>(null)

  // M45: recent depth-tagged catches (last 5)
  const [depthCatches, setDepthCatches] = useState<DepthCatchEntry[]>([])

  useEffect(() => {
    const unsub = fishingSystem.subscribe(setState)
    return unsub
  }, [])

  // Listen for golden fish event from GameLoop
  useEffect(() => {
    const handler = () => setShowGolden(true)
    window.addEventListener('golden-fish-caught', handler)
    return () => window.removeEventListener('golden-fish-caught', handler)
  }, [])

  // M45: intercept landed phase to roll a depth-tier fish and show rare notifications
  useEffect(() => {
    if (state.phase !== 'landed' || !state.lastCatch) return

    // Roll using the depth system to decide rare overlays
    const hasFishingRod = true  // player always has a rod if they're fishing
    const rolled: FishEntry | null = rollFish(depth, hasFishingRod)

    if (rolled?.rare) {
      setRareCatch({ name: rolled.name, key: Date.now() })
    }

    // Record catch with depth tag
    setDepthCatches(prev => {
      const entry: DepthCatchEntry = {
        name:  rolled ? rolled.name : state.lastCatch!.name,
        depth,
        rare:  rolled ? rolled.rare : false,
      }
      return [entry, ...prev].slice(0, 5)
    })
  }, [state.phase, state.lastCatch, depth])

  const hideGolden   = useCallback(() => setShowGolden(false), [])
  const hideRareCatch = useCallback(() => setRareCatch(null), [])

  const handleDepthChange = useCallback((d: FishDepth) => {
    setDepth(d)
    setFishingDepth(d)
  }, [])

  return (
    <>
      {showGolden && <GoldenFishOverlay onDone={hideGolden} />}

      <div style={{ color: '#ccc', ...mono, display: 'flex', flexDirection: 'column', minHeight: 260, position: 'relative' }}>
        {/* Rare catch banner (absolute, inside panel) */}
        {rareCatch && (
          <RareCatchNotification catch={rareCatch} onDone={hideRareCatch} />
        )}

        {/* Header */}
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid #2a2a2a',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ color: '#888', fontSize: 11, letterSpacing: 1 }}>
            FISHING — {state.phase.toUpperCase()}
          </span>
          {state.criticalSuccess && state.phase === 'reeling' && (
            <span style={{ color: '#ff8000', fontSize: 10, fontWeight: 700 }}>CRITICAL!</span>
          )}
        </div>

        {/* M45: Depth selector */}
        <DepthSelector depth={depth} onChange={handleDepthChange} />

        {/* Phase view */}
        <div style={{ flex: 1 }}>
          {state.phase === 'idle'     && <IdleView nearGoodSpot={state.nearGoodSpot} />}
          {state.phase === 'casting'  && <CastingView progress={state.progress} />}
          {state.phase === 'waiting'  && <WaitingView state={state} />}
          {state.phase === 'biting'   && <BitingView biteTimer={state.biteTimer} />}
          {state.phase === 'reeling'  && <ReelingView reelProgress={state.reelProgress} resistance={state.resistance} />}
          {state.phase === 'landed'   && state.lastCatch && <LandedView lastCatch={state.lastCatch} />}
          {state.phase === 'escaped'  && <EscapedView />}
        </div>

        {/* Rod durability + catch history + best catch */}
        <div style={{ padding: '0 16px 12px' }}>
          <DurabilityBar durability={state.rodDurability} />
          <BestCatch best={state.bestCatch} />
          <CatchHistory history={state.catchHistory} />
          {/* M45: depth-tagged recent catches */}
          <RecentDepthCatches catches={depthCatches} />
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid #1e1e1e',
          color: '#555',
          fontSize: 10,
          letterSpacing: 0.5,
        }}>
          ESC to cancel · Press F at sweet spot (tension meter) · Deeper = rarer fish
        </div>
      </div>
    </>
  )
}
