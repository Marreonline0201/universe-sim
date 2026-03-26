import React, { useState } from 'react'
import { useStatusSocket } from './hooks/useStatusSocket'
import { EpochBar }      from './components/EpochBar'
import { SatelliteMap }  from './components/SatelliteMap'
import { ServerStats }   from './components/ServerStats'
import { PlayerRoster }  from './components/PlayerRoster'
import { PlayerDetail }  from './components/PlayerDetail'
import { AgentControlCenter } from './components/AgentControlCenter'

// ── Global CSS (injected as style tag) ────────────────────────────────────────
const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg-deep:      #060810;
    --bg-panel:     rgba(8, 14, 28, 0.92);
    --bg-elevated:  rgba(10, 18, 36, 0.96);
    --border:       rgba(0, 180, 255, 0.13);
    --border-glow:  rgba(0, 180, 255, 0.35);
    --cyan:         #00d4ff;
    --orange:       #ff6b35;
    --green:        #00ff88;
    --gold:         #ffd700;
    --text:         rgba(255, 255, 255, 0.85);
    --text-dim:     rgba(150, 185, 220, 0.55);
    --text-muted:   rgba(80, 120, 180, 0.35);
  }

  html, body, #root {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--bg-deep);
    color: var(--text);
    font-family: 'IBM Plex Mono', monospace;
  }

  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
  ::-webkit-scrollbar-thumb { background: rgba(0,180,255,0.2); border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(0,180,255,0.4); }

  @keyframes starfield {
    from { transform: translateY(0); }
    to   { transform: translateY(-50%); }
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .status-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    animation: fadeInUp 0.4s ease-out both;
  }

  /* Starfield background */
  .status-root::before {
    content: '';
    position: absolute;
    inset: -50% 0;
    background-image:
      radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.35) 0%, transparent 100%),
      radial-gradient(1px 1px at 25% 65%, rgba(255,255,255,0.2) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 40% 10%, rgba(255,255,255,0.3) 0%, transparent 100%),
      radial-gradient(1px 1px at 55% 80%, rgba(255,255,255,0.15) 0%, transparent 100%),
      radial-gradient(1px 1px at 70% 35%, rgba(255,255,255,0.25) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 80% 55%, rgba(255,255,255,0.2) 0%, transparent 100%),
      radial-gradient(1px 1px at 90% 90%, rgba(255,255,255,0.3) 0%, transparent 100%),
      radial-gradient(1px 1px at 15% 45%, rgba(255,255,255,0.18) 0%, transparent 100%),
      radial-gradient(1px 1px at 60% 60%, rgba(255,255,255,0.22) 0%, transparent 100%),
      radial-gradient(1px 1px at 35% 85%, rgba(255,255,255,0.15) 0%, transparent 100%),
      radial-gradient(1px 1px at 48% 48%, rgba(200,220,255,0.25) 0%, transparent 100%),
      radial-gradient(1px 1px at 78% 15%, rgba(200,220,255,0.2) 0%, transparent 100%);
    pointer-events: none;
    z-index: 0;
    animation: starfield 120s linear infinite;
  }

  /* Subtle blue atmosphere glow */
  .status-root::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 100% 60% at 50% 0%, rgba(0,60,120,0.18) 0%, transparent 60%),
      radial-gradient(ellipse 80% 40% at 50% 100%, rgba(0,20,60,0.25) 0%, transparent 60%);
    pointer-events: none;
    z-index: 0;
  }
`

export function StatusApp() {
  const world = useStatusSocket()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedPlayer = world.players.find(p => p.userId === selectedId) ?? null

  function handleSelect(id: string) {
    setSelectedId(prev => prev === id ? null : id)
  }

  return (
    <>
      <style>{GLOBAL_CSS}</style>

      <div className="status-root">

        {/* ── Epoch bar (top strip) ──────────────────────────────────────── */}
        <div style={{ position: 'relative', zIndex: 10, flexShrink: 0 }}>
          <EpochBar world={world} />
        </div>

        {/* ── Main content (map + stats sidebar) ────────────────────────── */}
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 5,
          minHeight: 0,
        }}>

          {/* Satellite map */}
          <div style={{
            flex: 1,
            minWidth: 0,
            position: 'relative',
            borderRight: '1px solid rgba(0,180,255,0.1)',
          }}>
            <SatelliteMap
              players={world.players}
              npcs={world.npcs}
              onPlayerClick={handleSelect}
            />
          </div>

          {/* Stats sidebar */}
          <div style={{
            width: 240,
            flexShrink: 0,
            background: 'rgba(6,10,20,0.82)',
            backdropFilter: 'blur(8px)',
            overflowY: 'auto',
            borderLeft: '1px solid rgba(0,180,255,0.1)',
          }}>
            <ServerStats world={world} />
          </div>
        </div>

        {/* ── Agent Control Center ──────────────────────────────────────── */}
        <div style={{
          height: 300,
          flexShrink: 0,
          background: 'rgba(4,8,18,0.88)',
          borderTop: '1px solid rgba(0,180,255,0.1)',
          position: 'relative',
          zIndex: 8,
          backdropFilter: 'blur(6px)',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: 'linear-gradient(90deg, transparent 0%, rgba(0,200,255,0.15) 20%, rgba(0,200,255,0.15) 80%, transparent 100%)',
          }} />
          <AgentControlCenter agentState={world.agentState} />
        </div>

        {/* ── Player roster (bottom strip) ──────────────────────────────── */}
        <div style={{
          height: 90,
          flexShrink: 0,
          background: 'rgba(4,8,18,0.9)',
          borderTop: '1px solid rgba(0,180,255,0.1)',
          position: 'relative',
          zIndex: 10,
          backdropFilter: 'blur(6px)',
        }}>
          {/* Top glow line */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: 'linear-gradient(90deg, transparent 0%, rgba(0,200,255,0.25) 20%, rgba(0,200,255,0.25) 80%, transparent 100%)',
          }} />
          <PlayerRoster
            players={world.players}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>

        {/* ── Player detail modal ────────────────────────────────────────── */}
        {selectedPlayer && (
          <PlayerDetail
            player={selectedPlayer}
            onClose={() => setSelectedId(null)}
          />
        )}

      </div>
    </>
  )
}
