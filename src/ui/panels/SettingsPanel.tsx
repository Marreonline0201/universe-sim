// SettingsPanel — game settings
import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { useUiStore } from '../../store/uiStore'

export function SettingsPanel() {
  const { shadowsEnabled, setShadowsEnabled, renderScale, setRenderScale, showFps, setShowFps } = useGameStore()
  const closePanel = useUiStore(s => s.closePanel)

  return (
    <div style={{ padding: 16, fontFamily: 'monospace', color: '#ccc', fontSize: 12 }}>
      <div style={{ color: '#888', marginBottom: 16, letterSpacing: 2 }}>SETTINGS</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={shadowsEnabled}
            onChange={e => setShadowsEnabled(e.target.checked)}
          />
          Shadows
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showFps}
            onChange={e => setShowFps(e.target.checked)}
          />
          Show FPS
        </label>

        <div>
          <div style={{ marginBottom: 6, color: '#888' }}>Render Scale: {renderScale}x</div>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.25}
            value={renderScale}
            onChange={e => setRenderScale(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>
  )
}
