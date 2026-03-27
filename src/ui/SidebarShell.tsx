// ── SidebarShell ───────────────────────────────────────────────────────────────
// Right-edge icon strip + animated panel mount.
// RPG panels removed. Only simulation/info panels remain.

import React, { useEffect, Suspense, lazy } from 'react'
import { useUiStore, type PanelId } from '../store/uiStore'
import { useGameStore } from '../store/gameStore'

// Lazy-loaded panels
const MapPanel      = lazy(() => import('./panels/MapPanel').then(m => ({ default: m.MapPanel })))
const SettingsPanel = lazy(() => import('./panels/SettingsPanel').then(m => ({ default: m.SettingsPanel })))
const PlayerListPanel = lazy(() => import('./panels/PlayerListPanel').then(m => ({ default: m.PlayerListPanel })))

const PANEL_LABEL: Record<PanelId, string> = {
  map:     'MAP',
  settings:'SETTINGS',
  players: 'PLAYERS ONLINE',
}

const PANEL_WIDTH = 480

const ICON_BUTTONS: Array<{ id: PanelId; icon: string; hint: string }> = [
  { id: 'map',     icon: 'MAP', hint: 'Map (M)' },
  { id: 'players', icon: 'PLR', hint: 'Players Online' },
  { id: 'settings',icon: 'SET', hint: 'Settings (Esc)' },
]

const PANEL_COMPONENTS: Record<PanelId, React.ComponentType> = {
  map:      MapPanel,
  players:  PlayerListPanel,
  settings: SettingsPanel,
}

export function SidebarShell() {
  const { activePanel, togglePanel, closePanel } = useUiStore()
  const { setInputBlocked } = useGameStore()

  // Block/unblock game input when panel opens/closes
  const setGatherPrompt = useGameStore(s => s.setGatherPrompt)
  useEffect(() => {
    setInputBlocked(activePanel !== null)
    if (activePanel !== null) {
      setGatherPrompt(null)
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }, [activePanel, setInputBlocked, setGatherPrompt])

  // Global hotkey listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (document.pointerLockElement) return

      switch (e.key) {
        case 'm': case 'M': e.preventDefault(); togglePanel('map');      break
        case 'Escape':       e.preventDefault(); togglePanel('settings'); break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [togglePanel])

  const PanelComponent = activePanel ? PANEL_COMPONENTS[activePanel] : null

  return (
    <>
      {/* Right-edge icon strip */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0,
        width: 48, zIndex: 200,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 16, gap: 4,
        background: 'rgba(0,0,0,0.7)',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
      }}>
        {ICON_BUTTONS.map(btn => (
          <button
            key={btn.id}
            title={btn.hint}
            onClick={() => togglePanel(btn.id)}
            style={{
              width: 40, height: 40,
              background: activePanel === btn.id ? 'rgba(255,255,255,0.2)' : 'transparent',
              border: activePanel === btn.id ? '1px solid rgba(255,255,255,0.4)' : '1px solid transparent',
              borderRadius: 4,
              color: '#ddd',
              fontSize: 10,
              fontFamily: 'monospace',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              userSelect: 'none',
            }}
          >
            {btn.icon}
          </button>
        ))}
      </div>

      {/* Sliding panel */}
      {activePanel && PanelComponent && (
        <div style={{
          position: 'fixed', right: 48, top: 0, bottom: 0,
          width: PANEL_WIDTH, zIndex: 199,
          background: 'rgba(10,10,15,0.97)',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ color: '#aaa', fontSize: 11, fontFamily: 'monospace', letterSpacing: 2 }}>
              {PANEL_LABEL[activePanel]}
            </span>
            <button
              onClick={closePanel}
              style={{
                background: 'transparent', border: 'none',
                color: '#888', cursor: 'pointer', fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>
          {/* Panel content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <Suspense fallback={
              <div style={{ color: '#555', padding: 32, textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>
                Loading...
              </div>
            }>
              <PanelComponent />
            </Suspense>
          </div>
        </div>
      )}
    </>
  )
}
