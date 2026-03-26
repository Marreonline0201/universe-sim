// ── FishingPanel ───────────────────────────────────────────────────────────────
// Minigame UI for the fishing state machine.
// M25 Track C

import React, { useEffect, useState } from 'react'
import { fishingSystem, type FishingSystemState } from '../../game/FishingSystem'

const mono: React.CSSProperties = { fontFamily: 'monospace' }

// ── Bobber animation (CSS keyframe injected once) ─────────────────────────────
const BOBBER_STYLE_ID = 'fishing-panel-keyframes'
if (typeof document !== 'undefined' && !document.getElementById(BOBBER_STYLE_ID)) {
  const s = document.createElement('style')
  s.id = BOBBER_STYLE_ID
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
  `
  document.head.appendChild(s)
}

// ── Sub-views ─────────────────────────────────────────────────────────────────

function IdleView() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', ...mono }}>
      <div style={{ fontSize: 48 }}>🎣</div>
      <div style={{ color: '#aaa', fontSize: 13, marginTop: 12 }}>
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

function WaitingView({ progress }: { progress: number }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 20px', ...mono }}>
      <div style={{
        fontSize: 40,
        display: 'inline-block',
        animation: 'bobber-float 1.8s ease-in-out infinite',
      }}>🪣</div>
      <div style={{ color: '#aaa', fontSize: 12, marginTop: 12 }}>
        Waiting for a bite...
      </div>
      <div style={{ marginTop: 16 }}>
        <ProgressBar value={progress} color="#4a90e2" label="Patience" />
      </div>
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
  return (
    <div style={{ textAlign: 'center', padding: '32px 20px', ...mono }}>
      <div style={{ fontSize: 48 }}>🐟</div>
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
      <div style={{ color: '#888', fontSize: 11, marginTop: 16 }}>
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

// ── Main component ─────────────────────────────────────────────────────────────

export function FishingPanel() {
  const [state, setState] = useState<FishingSystemState>(() => ({ ...fishingSystem.state }))

  useEffect(() => {
    const unsub = fishingSystem.subscribe(setState)
    return unsub
  }, [])

  return (
    <div style={{ color: '#ccc', ...mono }}>
      {/* Header strip */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #2a2a2a',
        color: '#888',
        fontSize: 11,
        letterSpacing: 1,
      }}>
        FISHING MINIGAME — {state.phase.toUpperCase()}
      </div>

      {/* State view */}
      {state.phase === 'idle'     && <IdleView />}
      {state.phase === 'casting'  && <CastingView progress={state.progress} />}
      {state.phase === 'waiting'  && <WaitingView progress={state.progress} />}
      {state.phase === 'biting'   && <BitingView biteTimer={state.biteTimer} />}
      {state.phase === 'reeling'  && <ReelingView reelProgress={state.reelProgress} resistance={state.resistance} />}
      {state.phase === 'landed'   && state.lastCatch && <LandedView lastCatch={state.lastCatch} />}
      {state.phase === 'escaped'  && <EscapedView />}

      {/* Quick-tip footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #1e1e1e',
        color: '#555',
        fontSize: 10,
        letterSpacing: 0.5,
        marginTop: 'auto',
      }}>
        ESC to cancel · Longer waits yield rarer fish
      </div>
    </div>
  )
}
