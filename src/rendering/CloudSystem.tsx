// ── CloudSystem.tsx ────────────────────────────────────────────────────────
// M39 Track A: Volumetric-feeling cloud system.
//
// 10 cloud groups, each made of 4-5 overlapping sphere puffs.
// Clouds drift slowly in wind direction, darken during rain/storm,
// lower altitude during rain, and cast soft shadows on terrain.

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useWeatherStore } from '../store/weatherStore'
import { usePlayerStore } from '../store/playerStore'
import { useGameStore } from '../store/gameStore'

const CLOUD_COUNT = 10

// Base cloud altitude above player in metres
const CLOUD_ALTITUDE_BASE = 250
// How much altitude drops during rain (metres)
const CLOUD_ALTITUDE_RAIN_DROP = 50
// Drift speed (m/s) — slow peaceful drift
const CLOUD_DRIFT_SPEED = 0.5
// Spread radius for cloud placement around player
const CLOUD_SPREAD = 600

interface CloudPuffRef {
  mesh: THREE.Mesh
  offsetX: number
  offsetY: number
  offsetZ: number
  scale: number
}

interface CloudGroupRef {
  group: THREE.Group
  puffs: CloudPuffRef[]
  // Relative offset from player (drifts over time)
  relX: number
  relY: number
  relZ: number
  // Size variation
  baseScale: number
}

// Pre-allocated color objects — no per-frame heap allocation
const _stormColor    = new THREE.Color('#444455')
const _blizzardColor = new THREE.Color('#aabbcc')
const _rainColor     = new THREE.Color('#555566')
const _cloudyColor   = new THREE.Color('#c8c8d0')
const _clearColor    = new THREE.Color('#ffffff')
const _defaultColor  = new THREE.Color('#dddddd')
const _nightTint     = new THREE.Color('#8899aa')
const _tmpColor      = new THREE.Color()

export function CloudSystem() {
  const groupRef = useRef<THREE.Group>(null)
  const cloudGroupsRef = useRef<CloudGroupRef[]>([])
  const initializedRef = useRef(false)

  // Build puff geometry once
  const puffGeometry = useMemo(() => new THREE.SphereGeometry(1, 8, 6), [])

  // Build per-weather materials — we'll update color in useFrame
  const puffMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1.0,
    metalness: 0.0,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  }), [])

  useEffect(() => {
    if (!groupRef.current || initializedRef.current) return
    initializedRef.current = true

    const clouds: CloudGroupRef[] = []

    for (let c = 0; c < CLOUD_COUNT; c++) {
      const grp = new THREE.Group()
      groupRef.current.add(grp)

      const puffs: CloudPuffRef[] = []
      const numPuffs = 3 + Math.floor(Math.random() * 3) // 3–5 puffs
      const baseScale = 40 + Math.random() * 40 // 40–80 unit base radius

      for (let p = 0; p < numPuffs; p++) {
        const mesh = new THREE.Mesh(puffGeometry, puffMaterial.clone())
        const offsetX = (Math.random() - 0.5) * baseScale * 1.2
        const offsetY = (Math.random() - 0.5) * baseScale * 0.3
        const offsetZ = (Math.random() - 0.5) * baseScale * 1.2
        const puffScale = baseScale * (0.6 + Math.random() * 0.8)
        mesh.scale.setScalar(puffScale)
        mesh.position.set(offsetX, offsetY, offsetZ)
        mesh.castShadow = true
        mesh.receiveShadow = false
        grp.add(mesh)
        puffs.push({ mesh, offsetX, offsetY, offsetZ, scale: puffScale })
      }

      // Random starting position around origin
      const angle = (c / CLOUD_COUNT) * Math.PI * 2 + Math.random() * 0.5
      const dist = CLOUD_SPREAD * (0.3 + Math.random() * 0.7)
      const relX = Math.cos(angle) * dist
      const relZ = Math.sin(angle) * dist

      clouds.push({ group: grp, puffs, relX, relY: 0, relZ, baseScale })
    }

    cloudGroupsRef.current = clouds

    return () => {
      // Cleanup: remove all cloud groups
      for (const cloud of cloudGroupsRef.current) {
        groupRef.current?.remove(cloud.group)
      }
      cloudGroupsRef.current = []
      initializedRef.current = false
    }
  }, [puffGeometry, puffMaterial])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const ps = usePlayerStore.getState()
    const weatherStore = useWeatherStore.getState()
    const weather = weatherStore.getPlayerWeather()
    const state = weather?.state ?? 'CLEAR'
    const windDir = weather?.windDir ?? 0
    const windSpeed = weather?.windSpeed ?? 3

    const isRain = state === 'RAIN' || state === 'STORM' || state === 'TORNADO_WARNING'

    // Wind direction vector
    const windRad = (windDir * Math.PI) / 180
    const windX = Math.sin(windRad) * CLOUD_DRIFT_SPEED * (1 + windSpeed * 0.1)
    const windZ = Math.cos(windRad) * CLOUD_DRIFT_SPEED * (1 + windSpeed * 0.1)

    // Cloud color based on weather — copy into scratch object, no allocation
    let cloudOpacity: number
    let altitudeDrop: number

    if (state === 'STORM' || state === 'TORNADO_WARNING') {
      _tmpColor.copy(_stormColor)
      cloudOpacity = 0.88
      altitudeDrop = CLOUD_ALTITUDE_RAIN_DROP * 1.4
    } else if (state === 'BLIZZARD') {
      _tmpColor.copy(_blizzardColor)
      cloudOpacity = 0.90
      altitudeDrop = CLOUD_ALTITUDE_RAIN_DROP * 0.8
    } else if (isRain) {
      _tmpColor.copy(_rainColor)
      cloudOpacity = 0.85
      altitudeDrop = CLOUD_ALTITUDE_RAIN_DROP
    } else if (state === 'CLOUDY') {
      _tmpColor.copy(_cloudyColor)
      cloudOpacity = 0.75
      altitudeDrop = 0
    } else if (state === 'CLEAR') {
      _tmpColor.copy(_clearColor)
      cloudOpacity = 0.70
      altitudeDrop = 0
    } else {
      _tmpColor.copy(_defaultColor)
      cloudOpacity = 0.65
      altitudeDrop = 0
    }

    // Night tint — read dayAngle from gameStore (no window hack)
    const sinA = Math.sin(useGameStore.getState().dayAngle)
    if (sinA < -0.1) {
      _tmpColor.lerp(_nightTint, 0.4)
    }

    const altitude = CLOUD_ALTITUDE_BASE - altitudeDrop

    for (const cloud of cloudGroupsRef.current) {
      // Drift clouds with wind
      cloud.relX += windX * dt
      cloud.relZ += windZ * dt

      // Wrap around if too far from player
      const dx = cloud.relX
      const dz = cloud.relZ
      const dist2 = dx * dx + dz * dz
      if (dist2 > CLOUD_SPREAD * CLOUD_SPREAD * 1.5) {
        // Respawn on the upwind side
        const respawnAngle = Math.atan2(-windZ, -windX) + (Math.random() - 0.5) * 0.8
        cloud.relX = Math.cos(respawnAngle) * CLOUD_SPREAD * (0.8 + Math.random() * 0.4)
        cloud.relZ = Math.sin(respawnAngle) * CLOUD_SPREAD * (0.8 + Math.random() * 0.4)
      }

      // Position cloud group in world space
      cloud.group.position.set(
        ps.x + cloud.relX,
        ps.y + altitude,
        ps.z + cloud.relZ,
      )

      // Update material color/opacity for each puff
      for (const puff of cloud.puffs) {
        const mat = puff.mesh.material as THREE.MeshStandardMaterial
        mat.color.copy(_tmpColor)
        mat.opacity = cloudOpacity
      }
    }
  })

  return <group ref={groupRef} />
}
