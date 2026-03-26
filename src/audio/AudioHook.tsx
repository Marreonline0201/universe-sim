// ── AudioHook.tsx ──────────────────────────────────────────────────────────────
// M21 Track A: React bridge between game stores and AmbientAudioEngine.
//
// Mounted inside <Canvas> (via SceneRoot). Reads weatherStore, playerStore,
// settlementStore each frame and feeds the audio engine. Initializes the
// AudioContext on the first user interaction (click/key) to comply with
// browser autoplay policy.
//
// Standalone module — no changes to existing code required except one mount.

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ambientAudio } from './AmbientAudioEngine'
import { useWeatherStore } from '../store/weatherStore'
import { usePlayerStore } from '../store/playerStore'
import { useSettlementStore } from '../store/settlementStore'
import { terrainHeightAt, SEA_LEVEL, PLANET_RADIUS } from '../world/SpherePlanet'
import type { AudioUpdateState } from './AmbientAudioEngine'

// Terrain type from elevation and slope (matches PlanetTerrain biome logic)
function getTerrainType(elevation: number, _px: number, _py: number, _pz: number): 'grass' | 'rock' | 'sand' | 'snow' | 'water' {
  if (elevation < SEA_LEVEL + 0.2) return 'water'
  if (elevation < SEA_LEVEL + 2) return 'sand'
  if (elevation > 35) return 'snow'
  if (elevation > 25) return 'rock'
  return 'grass'
}

export function AudioHook() {
  const initRef = useRef(false)
  const prevPosRef = useRef({ x: 0, y: 0, z: 0 })
  const movingRef = useRef(false)

  // Initialize audio on first user interaction
  useEffect(() => {
    const handler = () => {
      if (!initRef.current) {
        initRef.current = ambientAudio.init()
      }
    }
    // Both click and keydown handle different browsers
    window.addEventListener('click', handler, { once: false })
    window.addEventListener('keydown', handler, { once: false })
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('keydown', handler)
      ambientAudio.dispose()
    }
  }, [])

  useFrame((_, delta) => {
    if (!ambientAudio.initialized) return
    const dt = Math.min(delta, 0.1)

    // Read stores
    const weather = useWeatherStore.getState()
    const playerWeather = weather.getPlayerWeather()
    const player = usePlayerStore.getState()
    const settlements = useSettlementStore.getState().settlements

    // Compute player movement
    const dx = player.x - prevPosRef.current.x
    const dy = player.y - prevPosRef.current.y
    const dz = player.z - prevPosRef.current.z
    const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / Math.max(dt, 0.001)
    prevPosRef.current = { x: player.x, y: player.y, z: player.z }
    movingRef.current = speed > 0.5

    // Compute elevation above sea level
    const distFromCenter = Math.sqrt(player.x * player.x + player.y * player.y + player.z * player.z)
    const elevation = distFromCenter - PLANET_RADIUS

    // Find nearest settlement fire
    let nearestFireDist = Infinity
    for (const s of settlements.values()) {
      const sdx = s.x - player.x, sdy = s.y - player.y, sdz = s.z - player.z
      const sDist = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz)
      if (sDist < nearestFireDist) nearestFireDist = sDist
    }

    // Ocean proximity
    const oceanDist = Math.max(0, elevation - SEA_LEVEL)
    const nearOcean = oceanDist < 30 && elevation < SEA_LEVEL + 30

    const audioState: AudioUpdateState = {
      weatherState: playerWeather?.state ?? 'CLEAR',
      windSpeed: playerWeather?.windSpeed ?? 3,
      windDir: playerWeather?.windDir ?? 0,
      lightningActive: weather.lightningActive,
      temperature: playerWeather?.temperature ?? 15,

      playerX: player.x,
      playerY: player.y,
      playerZ: player.z,
      playerMoving: movingRef.current,
      playerRunning: speed > 8,
      playerGrounded: elevation > SEA_LEVEL - 0.5,
      playerElevation: elevation,
      terrainType: getTerrainType(elevation, player.x, player.y, player.z),

      nearFire: nearestFireDist < 15,
      fireDistance: nearestFireDist,
      nearOcean,
      oceanDistance: nearOcean ? Math.abs(elevation - SEA_LEVEL) : 999,

      nearSettlement: nearestFireDist < 50,
      settlementDistance: nearestFireDist,
    }

    ambientAudio.update(audioState, dt)
  })

  return null
}
