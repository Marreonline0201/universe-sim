// MapPanel — world map overview
import React from 'react'
import { useUiStore } from '../../store/uiStore'

export function MapPanel() {
  const waypoints = useUiStore(s => s.waypoints)

  return (
    <div style={{ padding: 16, fontFamily: 'monospace', color: '#ccc' }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>WORLD MAP</div>
      <div style={{ fontSize: 11, color: '#666' }}>
        Waypoints: {waypoints.length}
      </div>
      <div style={{ marginTop: 24, fontSize: 11, color: '#555' }}>
        Map view is available in spectator mode.
      </div>
    </div>
  )
}
