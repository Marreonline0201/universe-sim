// ── HUD.tsx ─────────────────────────────────────────────────────────────────
// Minimal HUD for simulation mode. RPG panels/bars removed.
// Keeps: ChatBox, weather widget, SidebarShell, NotificationSystem

import React, { useState, useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { useWeatherStore } from '../store/weatherStore'
import { usePlayerStore } from '../store/playerStore'
import { SidebarShell } from './SidebarShell'
import { NotificationSystem } from './NotificationSystem'
import { TutorialOverlay } from './TutorialOverlay'
import { MobileControls } from './MobileControls'
import { ChatBox } from './ChatBox'
import { RemotePlayerNameTagsOverlay } from './RemotePlayerNameTags'
import { TimeControls } from './TimeControls'
import { getLocalUsername } from '../net/useWorldSocket'
import { WeatherIcon, WeatherWidget } from './components/WeatherWidgets'

// ── Crosshair ────────────────────────────────────────────────────────────────
function Crosshair() {
  return (
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 14, height: 14,
      pointerEvents: 'none', zIndex: 100,
    }}>
      <div style={{ position: 'absolute', top: 6, left: 0, width: 14, height: 1, background: 'rgba(255,255,255,0.6)' }} />
      <div style={{ position: 'absolute', top: 0, left: 6, width: 1, height: 14, background: 'rgba(255,255,255,0.6)' }} />
    </div>
  )
}

// ── Minimal player info corner ────────────────────────────────────────────────
function PlayerInfoCorner() {
  const username = getLocalUsername()
  const connectionStatus = useMultiplayerStore(s => s.connectionStatus)

  return (
    <div style={{
      position: 'fixed', top: 8, left: 8, zIndex: 100,
      fontFamily: 'monospace', fontSize: 11, color: '#888',
      pointerEvents: 'none',
    }}>
      <div>{username}</div>
      <div style={{ color: connectionStatus === 'connected' ? '#2ecc71' : '#e74c3c', fontSize: 10 }}>
        {connectionStatus === 'connected' ? '● ONLINE' : '○ OFFLINE'}
      </div>
    </div>
  )
}

// ── Weather corner ────────────────────────────────────────────────────────────
function WeatherCorner() {
  const playerWeather = useWeatherStore(s => s.getPlayerWeather())
  if (!playerWeather) return null
  return (
    <div style={{
      position: 'fixed', top: 8, right: 56, zIndex: 100,
      pointerEvents: 'none',
    }}>
      <WeatherWidget state={playerWeather.state} tempC={playerWeather.temperature} />
    </div>
  )
}

export function HUD() {
  const paused = useGameStore(s => s.paused)

  return (
    <>
      <Crosshair />
      <PlayerInfoCorner />
      <WeatherCorner />
      <TimeControls />
      <SidebarShell />
      <NotificationSystem />
      <TutorialOverlay />
      <MobileControls />
      <ChatBox />
      <RemotePlayerNameTagsOverlay />
    </>
  )
}
