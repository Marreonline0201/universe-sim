// ── WeatherRenderer.tsx ────────────────────────────────────────────────────────
// M8 Track 1: Photorealistic weather visual effects.
// M23 Track A: Enhanced weather VFX — rain splashes, wet surfaces, snow
//              accumulation, lightning bolt geometry, weather fog density.
//
// Renders into the R3F Canvas (must be mounted inside <Canvas>).
//
// Systems:
//   Rain       — 2000 instanced line segments, velocity = windDir + gravity
//   Snow       — 800 instanced billboard quads, slow spiral descent (temp < 0°C)
//   Storm      — random lightning flash (15-45s interval), bright directional flash
//   Wind       — 300 dust/leaf sprites flying horizontally (CLEAR/CLOUDY only)
//   Clouds     — billboard quad mesh slightly above horizon, opacity = f(state)
//   Splashes   — 150 instanced rings at ground level during rain (M23)
//   Snow Cover — translucent white disc on ground during snowfall (M23)
//   Lightning  — jagged branching line bolt geometry (M23)
//   Wetness    — ramps up during rain, darkens terrain via weatherStore (M23)
//
// Performance budget: all geometry is instanced. No allocations per frame.
// Particle positions stored in Float32Array and uploaded via buffer update.

import * as THREE from 'three'
import { useRef, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useWeatherStore } from '../store/weatherStore'
import { usePlayerStore } from '../store/playerStore'
import { PLANET_RADIUS } from '../world/SpherePlanet'

// ── Constants ─────────────────────────────────────────────────────────────────

const RAIN_COUNT   = 2000
const SNOW_COUNT   = 800
const WIND_COUNT   = 300
const SPLASH_COUNT = 150        // M23: rain splash rings
const RAIN_HEIGHT  = 60         // metres above player — rain spawns here and falls
const RAIN_SPREAD  = 80         // horizontal spread radius in metres
const RAIN_SPEED   = 18         // metres/sec downward velocity
const SNOW_SPEED   = 2.0        // metres/sec downward velocity
const WIND_SPEED_BASE = 6       // multiplied by sector windSpeed for wind particles
const CLOUD_Y_OFFSET  = 200     // metres above planet surface (relative to player)

// M23: Lightning bolt segments
const BOLT_SEGMENTS = 8

// M23: Wetness ramp rates (seconds to ramp 0→1 and 1→0)
const WETNESS_RAMP_UP_S   = 30
const WETNESS_RAMP_DOWN_S = 60

// Wind direction in degrees → unit vector in world XZ plane
function windDirToVec(degrees: number): THREE.Vector3 {
  const rad = (degrees * Math.PI) / 180
  return new THREE.Vector3(Math.sin(rad), 0, Math.cos(rad))
}

// ── WeatherRenderer ───────────────────────────────────────────────────────────

interface WeatherRendererProps {
  /** Player position in world space — needed to follow the camera */
  playerX: number
  playerY: number
  playerZ: number
}

export function WeatherRenderer({ playerX, playerY, playerZ }: WeatherRendererProps) {
  const { scene } = useThree()
  const weatherSectors = useWeatherStore(s => s.sectors)
  const weatherPlayerSectorId = useWeatherStore(s => s.playerSectorId)
  const weather = weatherSectors.find(s => s.sectorId === weatherPlayerSectorId) ?? weatherSectors[0] ?? null
  const setLightning = useWeatherStore(s => s.setLightningActive)
  const setWetness   = useWeatherStore(s => s.setWetness)

  const state     = weather?.state     ?? 'CLEAR'
  const windDir   = weather?.windDir   ?? 0
  const windSpeed = weather?.windSpeed ?? 3
  const tempC     = weather?.temperature ?? 15

  const isRain   = state === 'RAIN' || state === 'STORM'
  const isSnow   = isRain && tempC < 0
  const isStorm  = state === 'STORM'
  const isWindy  = state === 'CLEAR' || state === 'CLOUDY'

  const rainIntensity = state === 'STORM' ? 1.0 : state === 'RAIN' ? 0.5 : 0

  // ── Refs shared across systems ────────────────────────────────────────────
  const lightningTimerRef = useRef(15 + Math.random() * 30)  // seconds until next flash
  const lightningFlashRef = useRef(0)   // countdown seconds for active flash
  const lightDirRef       = useRef<THREE.DirectionalLight | null>(null)

  // ── Rain ──────────────────────────────────────────────────────────────────
  const rainMeshRef      = useRef<THREE.InstancedMesh | null>(null)
  const rainPositions    = useMemo(() => new Float32Array(RAIN_COUNT * 3), [])
  const rainMatrix       = useMemo(() => new THREE.Matrix4(), [])
  const rainQuat         = useMemo(() => new THREE.Quaternion(), [])

  // Pre-allocated scratch objects — zero per-frame heap allocation in inner loops
  const _playerUp   = useMemo(() => new THREE.Vector3(), [])
  const _velNorm    = useMemo(() => new THREE.Vector3(), [])
  const _upRef      = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const _posVec     = useMemo(() => new THREE.Vector3(), [])
  const _scaleVec   = useMemo(() => new THREE.Vector3(), [])

  // ── Snow ──────────────────────────────────────────────────────────────────
  const snowMeshRef      = useRef<THREE.InstancedMesh | null>(null)
  const snowPositions    = useMemo(() => new Float32Array(SNOW_COUNT * 3), [])
  const snowAngles       = useMemo(() => new Float32Array(SNOW_COUNT), [])

  // ── Wind particles ────────────────────────────────────────────────────────
  const windMeshRef      = useRef<THREE.InstancedMesh | null>(null)
  const windPositions    = useMemo(() => new Float32Array(WIND_COUNT * 3), [])
  const windPhases       = useMemo(() => new Float32Array(WIND_COUNT), [])

  // ── M23: Rain splash rings ────────────────────────────────────────────────
  const splashMeshRef    = useRef<THREE.InstancedMesh | null>(null)
  // Each splash: [x, y, z, timer] — timer counts from 0 to 1 (lifetime)
  const splashData       = useMemo(() => new Float32Array(SPLASH_COUNT * 4), [])
  const _splashScale     = useMemo(() => new THREE.Vector3(), [])
  const _splashQuat      = useMemo(() => new THREE.Quaternion(), [])

  // ── M23: Snow ground cover ────────────────────────────────────────────────
  const snowGroundRef    = useRef<THREE.Mesh | null>(null)
  const snowCoverOpacity = useRef(0)   // 0–0.4

  // ── M23: Lightning bolt line ──────────────────────────────────────────────
  const boltLineRef      = useRef<THREE.Line | null>(null)
  const boltPositions    = useMemo(() => new Float32Array(BOLT_SEGMENTS * 3), [])
  const boltTimerRef     = useRef(0)   // countdown for bolt visibility (150ms)

  // ── M23: Wetness tracking ─────────────────────────────────────────────────
  const wetnessRef       = useRef(0)

  // Initialise particle positions randomly around origin (will be offset to player each frame)
  useEffect(() => {
    for (let i = 0; i < RAIN_COUNT; i++) {
      rainPositions[i * 3 + 0] = (Math.random() - 0.5) * RAIN_SPREAD * 2
      rainPositions[i * 3 + 1] = Math.random() * RAIN_HEIGHT
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_SPREAD * 2
    }
    for (let i = 0; i < SNOW_COUNT; i++) {
      snowPositions[i * 3 + 0] = (Math.random() - 0.5) * RAIN_SPREAD * 2
      snowPositions[i * 3 + 1] = Math.random() * RAIN_HEIGHT
      snowPositions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_SPREAD * 2
      snowAngles[i] = Math.random() * Math.PI * 2
    }
    for (let i = 0; i < WIND_COUNT; i++) {
      windPositions[i * 3 + 0] = (Math.random() - 0.5) * RAIN_SPREAD * 2
      windPositions[i * 3 + 1] = (Math.random() * 20) - 2  // 0–20m above player
      windPositions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_SPREAD * 2
      windPhases[i] = Math.random() * Math.PI * 2
    }
    // M23: Init splash timers to random spread so they don't all spawn at once
    for (let i = 0; i < SPLASH_COUNT; i++) {
      splashData[i * 4 + 0] = (Math.random() - 0.5) * 60  // x offset
      splashData[i * 4 + 1] = 0                            // y offset (ground)
      splashData[i * 4 + 2] = (Math.random() - 0.5) * 60  // z offset
      splashData[i * 4 + 3] = Math.random()                // timer (0-1 lifecycle)
    }
  }, [rainPositions, snowPositions, snowAngles, windPositions, windPhases, splashData])

  // ── M23: Create bolt line geometry + material + object once ─────────────────
  const boltGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(boltPositions, 3))
    return geo
  }, [boltPositions])

  const boltMaterial = useMemo(() => new THREE.LineBasicMaterial({
    color: 0xeeeeff,
    linewidth: 2,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
  }), [])

  const boltLineObject = useMemo(() => new THREE.Line(boltGeometry, boltMaterial), [boltGeometry, boltMaterial])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const windVec = windDirToVec(windDir)
    const windX   = windVec.x * windSpeed
    const windZ   = windVec.z * windSpeed

    // Player's "up" direction on the sphere surface — reuse pre-allocated scratch
    _playerUp.set(playerX, playerY, playerZ).normalize()
    const upX = _playerUp.x, upY = _playerUp.y, upZ = _playerUp.z

    // Rain fall velocity (shared across all drops — same direction)
    const gravity = RAIN_SPEED
    const velX = windX - upX * gravity
    const velY =        - upY * gravity
    const velZ = windZ  - upZ * gravity
    const velLen = Math.sqrt(velX * velX + velY * velY + velZ * velZ) || 1
    _velNorm.set(velX / velLen, velY / velLen, velZ / velLen)
    rainQuat.setFromUnitVectors(_upRef, _velNorm)
    const streakLen = 0.3 + rainIntensity * 0.4
    _scaleVec.set(0.02, streakLen, 0.02)

    // ── Rain update ────────────────────────────────────────────────────────
    if (rainMeshRef.current && isRain && !isSnow) {
      const mesh = rainMeshRef.current

      for (let i = 0; i < RAIN_COUNT; i++) {
        // Move down (along planet up direction) and with wind
        let rx = rainPositions[i * 3 + 0]
        let ry = rainPositions[i * 3 + 1]
        let rz = rainPositions[i * 3 + 2]

        rx += windX * dt - upX * gravity * dt
        ry += -gravity * dt * upY
        rz += windZ * dt - upZ * gravity * dt

        // Reset when drop falls below player level (local-y component)
        if (ry < -5) {
          rx = (Math.random() - 0.5) * RAIN_SPREAD * 2
          ry = RAIN_HEIGHT + Math.random() * 10
          rz = (Math.random() - 0.5) * RAIN_SPREAD * 2
        }

        rainPositions[i * 3 + 0] = rx
        rainPositions[i * 3 + 1] = ry
        rainPositions[i * 3 + 2] = rz

        // Compose matrix from pre-allocated scratch objects — no per-loop allocation
        _posVec.set(playerX + rx, playerY + ry, playerZ + rz)
        rainMatrix.compose(_posVec, rainQuat, _scaleVec)
        mesh.setMatrixAt(i, rainMatrix)
      }

      mesh.instanceMatrix.needsUpdate = true
      mesh.visible = true
    } else if (rainMeshRef.current) {
      rainMeshRef.current.visible = false
    }

    // ── Snow update ────────────────────────────────────────────────────────
    if (snowMeshRef.current && isSnow) {
      const mesh = snowMeshRef.current

      for (let i = 0; i < SNOW_COUNT; i++) {
        let sx = snowPositions[i * 3 + 0]
        let sy = snowPositions[i * 3 + 1]
        let sz = snowPositions[i * 3 + 2]
        snowAngles[i] += dt * 0.8

        // Gentle spiral descent — slight horizontal oscillation
        sx += (windX * 0.4 + Math.sin(snowAngles[i]) * 0.3) * dt
        sy -= SNOW_SPEED * dt
        sz += (windZ * 0.4 + Math.cos(snowAngles[i]) * 0.3) * dt

        if (sy < -3) {
          sx = (Math.random() - 0.5) * RAIN_SPREAD * 2
          sy = RAIN_HEIGHT
          sz = (Math.random() - 0.5) * RAIN_SPREAD * 2
        }

        snowPositions[i * 3 + 0] = sx
        snowPositions[i * 3 + 1] = sy
        snowPositions[i * 3 + 2] = sz

        const wx = playerX + sx
        const wy = playerY + sy
        const wz = playerZ + sz

        rainMatrix.compose(
          _posVec.set(wx, wy, wz),
          rainQuat,  // no rotation — snow flakes face camera
          _scaleVec.set(0.15, 0.15, 0.15),
        )
        mesh.setMatrixAt(i, rainMatrix)
      }

      mesh.instanceMatrix.needsUpdate = true
      mesh.visible = true
    } else if (snowMeshRef.current) {
      snowMeshRef.current.visible = false
    }

    // ── Wind particles ─────────────────────────────────────────────────────
    if (windMeshRef.current && isWindy) {
      const mesh = windMeshRef.current
      const effectiveWindX = windVec.x * Math.max(windSpeed, 2)
      const effectiveWindZ = windVec.z * Math.max(windSpeed, 2)

      for (let i = 0; i < WIND_COUNT; i++) {
        let wx2 = windPositions[i * 3 + 0]
        let wy2 = windPositions[i * 3 + 1]
        let wz2 = windPositions[i * 3 + 2]

        wx2 += effectiveWindX * dt * (0.8 + Math.sin(windPhases[i]) * 0.2)
        wy2 += Math.sin(windPhases[i] * 2 + wx2 * 0.1) * 0.5 * dt
        wz2 += effectiveWindZ * dt * (0.8 + Math.cos(windPhases[i]) * 0.2)

        // Wrap around when particle drifts too far downwind
        if (Math.abs(wx2) > RAIN_SPREAD || Math.abs(wz2) > RAIN_SPREAD) {
          wx2 = (Math.random() - 0.5) * RAIN_SPREAD * 2
          wy2 = Math.random() * 20 - 2
          wz2 = (Math.random() - 0.5) * RAIN_SPREAD * 2
        }

        windPositions[i * 3 + 0] = wx2
        windPositions[i * 3 + 1] = wy2
        windPositions[i * 3 + 2] = wz2

        rainMatrix.compose(
          _posVec.set(playerX + wx2, playerY + wy2, playerZ + wz2),
          _splashQuat.setFromAxisAngle(_upRef, windPhases[i]),
          _scaleVec.set(0.06, 0.06, 0.3),
        )
        mesh.setMatrixAt(i, rainMatrix)
      }

      mesh.instanceMatrix.needsUpdate = true
      mesh.visible = true
    } else if (windMeshRef.current) {
      windMeshRef.current.visible = false
    }

    // ── M23: Rain splash rings at ground level ──────────────────────────────
    if (splashMeshRef.current && isRain && !isSnow) {
      const mesh = splashMeshRef.current
      const splashLifetime = 0.3  // seconds for one splash cycle

      for (let i = 0; i < SPLASH_COUNT; i++) {
        let t = splashData[i * 4 + 3]
        t += dt / splashLifetime

        if (t >= 1.0) {
          // Recycle splash at a new random position
          splashData[i * 4 + 0] = (Math.random() - 0.5) * 60
          splashData[i * 4 + 1] = 0.1  // slightly above ground to prevent z-fight
          splashData[i * 4 + 2] = (Math.random() - 0.5) * 60
          t = 0
        }

        splashData[i * 4 + 3] = t

        // Scale expands from 0 to 1, opacity fades from 0.6 to 0
        const scale = t * 1.0
        const opacity = (1 - t) * 0.6

        _posVec.set(
          playerX + splashData[i * 4 + 0],
          playerY + splashData[i * 4 + 1],
          playerZ + splashData[i * 4 + 2],
        )
        _splashScale.set(scale, scale * 0.3, scale)
        rainMatrix.compose(_posVec, _splashQuat.identity(), _splashScale)
        mesh.setMatrixAt(i, rainMatrix)

        // Modulate instance color for opacity effect via the color attribute
        // (instancedMesh with transparent material — opacity is global,
        //  but we scale the mesh to 0 when faded to simulate disappearance)
        if (t > 0.95) {
          // Nearly invisible — scale to zero
          rainMatrix.compose(_posVec, _splashQuat.identity(), _scaleVec.set(0, 0, 0))
          mesh.setMatrixAt(i, rainMatrix)
        }
      }

      mesh.instanceMatrix.needsUpdate = true
      mesh.visible = true
    } else if (splashMeshRef.current) {
      splashMeshRef.current.visible = false
    }

    // ── M23: Snow ground accumulation ────────────────────────────────────────
    if (snowGroundRef.current) {
      if (isSnow) {
        // Ramp opacity up during snowfall (max 0.4)
        snowCoverOpacity.current = Math.min(0.4, snowCoverOpacity.current + dt / 60)
      } else {
        // Fade out over 120s after snow stops
        snowCoverOpacity.current = Math.max(0, snowCoverOpacity.current - dt / 120)
      }
      const mat = snowGroundRef.current.material as THREE.MeshStandardMaterial
      mat.opacity = snowCoverOpacity.current
      snowGroundRef.current.visible = snowCoverOpacity.current > 0.01
      // Follow player
      snowGroundRef.current.position.set(playerX, playerY + 0.05, playerZ)
    }

    // ── Lightning ─────────────────────────────────────────────────────────
    if (isStorm) {
      lightningTimerRef.current -= dt
      if (lightningFlashRef.current > 0) {
        lightningFlashRef.current -= dt
        if (lightDirRef.current) {
          lightDirRef.current.intensity = lightningFlashRef.current > 0 ? 12 : 0
        }
        if (lightningFlashRef.current <= 0) {
          setLightning(false)
          if (lightDirRef.current) lightDirRef.current.intensity = 0
        }
      }

      if (lightningTimerRef.current <= 0) {
        // Trigger a new flash
        lightningFlashRef.current = 0.15   // 150ms flash (M23: extended from 100ms)
        lightningTimerRef.current = 15 + Math.random() * 30  // next flash in 15-45s
        setLightning(true)
        if (lightDirRef.current) {
          lightDirRef.current.intensity = 12
          // Random direction for each bolt
          const angle = Math.random() * Math.PI * 2
          lightDirRef.current.position.set(
            playerX + Math.cos(angle) * 50,
            playerY + 80,
            playerZ + Math.sin(angle) * 50,
          )
        }

        // ── M23: Generate jagged bolt line geometry ───────────────────────
        boltTimerRef.current = 0.15  // bolt visible for 150ms
        const boltAngle = Math.random() * Math.PI * 2
        const startX = playerX + Math.cos(boltAngle) * (10 + Math.random() * 20)
        const startY = playerY + 60
        const startZ = playerZ + Math.sin(boltAngle) * (10 + Math.random() * 20)
        const endX   = playerX + Math.cos(boltAngle) * (5 + Math.random() * 10)
        const endY   = playerY
        const endZ   = playerZ + Math.sin(boltAngle) * (5 + Math.random() * 10)

        for (let s = 0; s < BOLT_SEGMENTS; s++) {
          const t2 = s / (BOLT_SEGMENTS - 1)
          // Lerp from start to end with random lateral jitter
          const jitterX = (s > 0 && s < BOLT_SEGMENTS - 1) ? (Math.random() - 0.5) * 8 : 0
          const jitterZ = (s > 0 && s < BOLT_SEGMENTS - 1) ? (Math.random() - 0.5) * 8 : 0
          boltPositions[s * 3 + 0] = startX + (endX - startX) * t2 + jitterX
          boltPositions[s * 3 + 1] = startY + (endY - startY) * t2
          boltPositions[s * 3 + 2] = startZ + (endZ - startZ) * t2 + jitterZ
        }
        if (boltLineRef.current) {
          const geo = boltLineRef.current.geometry
          const attr = geo.getAttribute('position') as THREE.BufferAttribute
          attr.needsUpdate = true
        }
      }
    } else {
      // Not storming — ensure lightning is off
      if (lightDirRef.current && lightDirRef.current.intensity > 0) {
        lightDirRef.current.intensity = 0
      }
    }

    // ── M23: Bolt line visibility countdown ──────────────────────────────────
    if (boltLineRef.current) {
      if (boltTimerRef.current > 0) {
        boltTimerRef.current -= dt
        boltLineRef.current.visible = true
        boltMaterial.opacity = Math.max(0, boltTimerRef.current / 0.15)
      } else {
        boltLineRef.current.visible = false
      }
    }

    // ── M23: Wetness ramp ────────────────────────────────────────────────────
    if (isRain && !isSnow) {
      wetnessRef.current = Math.min(1, wetnessRef.current + dt / WETNESS_RAMP_UP_S)
    } else {
      wetnessRef.current = Math.max(0, wetnessRef.current - dt / WETNESS_RAMP_DOWN_S)
    }
    setWetness(wetnessRef.current)

    // ── M23: Weather-dependent fog density ──────────────────────────────────
    // Multiply with existing time-of-day fog (don't replace it).
    // We adjust the scene fog density by lerping toward the target.
    if (scene.fog instanceof THREE.FogExp2) {
      const baseDensity = scene.fog.density
      const weatherTarget =
        state === 'STORM'  ? 0.0030 :
        state === 'RAIN'   ? 0.0020 :
        state === 'CLOUDY' ? 0.0012 : 0.0008
      // Gentle lerp toward target (5-second transition)
      const lerpRate = Math.min(1, dt / 5)
      // We only modulate if the weather target is higher than current
      // (DayNightCycle controls the base; we add weather on top)
      if (baseDensity < weatherTarget) {
        scene.fog.density = baseDensity + (weatherTarget - baseDensity) * lerpRate
      }
    }
  })

  // Cloud opacity target based on state
  const cloudOpacity =
    state === 'STORM'  ? 0.85 :
    state === 'RAIN'   ? 0.65 :
    state === 'CLOUDY' ? 0.40 : 0.0

  return (
    <>
      {/* ── Lightning directional flash ─────────────────────────────────── */}
      <directionalLight
        ref={lightDirRef}
        color={0xffffff}
        intensity={0}
        position={[playerX, playerY + 80, playerZ]}
      />

      {/* ── Cloud layer ─────────────────────────────────────────────────── */}
      {cloudOpacity > 0.01 && (
        <mesh
          position={[
            playerX + playerX * 0.001,
            playerY + CLOUD_Y_OFFSET,
            playerZ + playerZ * 0.001,
          ]}
          rotation={[0, 0, 0]}
        >
          <sphereGeometry args={[PLANET_RADIUS + CLOUD_Y_OFFSET + 10, 32, 16]} />
          <meshBasicMaterial
            color={state === 'STORM' ? 0x334455 : 0x9ab0c8}
            transparent
            opacity={cloudOpacity * 0.6}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* ── Rain drops ──────────────────────────────────────────────────── */}
      <instancedMesh
        ref={rainMeshRef}
        args={[undefined, undefined, RAIN_COUNT]}
        frustumCulled={false}
        visible={false}
      >
        <cylinderGeometry args={[0.01, 0.01, 1, 3]} />
        <meshBasicMaterial
          color={0x88aacc}
          transparent
          opacity={0.55 * rainIntensity}
          depthWrite={false}
        />
      </instancedMesh>

      {/* ── Snow flakes ─────────────────────────────────────────────────── */}
      <instancedMesh
        ref={snowMeshRef}
        args={[undefined, undefined, SNOW_COUNT]}
        frustumCulled={false}
        visible={false}
      >
        <sphereGeometry args={[0.5, 4, 4]} />
        <meshBasicMaterial
          color={0xeef8ff}
          transparent
          opacity={0.80}
          depthWrite={false}
        />
      </instancedMesh>

      {/* ── Wind dust/leaf particles ─────────────────────────────────────── */}
      <instancedMesh
        ref={windMeshRef}
        args={[undefined, undefined, WIND_COUNT]}
        frustumCulled={false}
        visible={false}
      >
        <boxGeometry args={[1, 0.05, 0.4]} />
        <meshBasicMaterial
          color={0xaa9966}
          transparent
          opacity={0.50 * Math.min(1, windSpeed / 12)}
          depthWrite={false}
        />
      </instancedMesh>

      {/* ── M23: Rain splash rings at ground level ───────────────────────── */}
      <instancedMesh
        ref={splashMeshRef}
        args={[undefined, undefined, SPLASH_COUNT]}
        frustumCulled={false}
        visible={false}
      >
        <torusGeometry args={[0.3, 0.02, 4, 12]} />
        <meshBasicMaterial
          color={0xaaccee}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </instancedMesh>

      {/* ── M23: Snow ground accumulation disc ───────────────────────────── */}
      <mesh
        ref={snowGroundRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[80, 32]} />
        <meshStandardMaterial
          color={0xeef4ff}
          transparent
          opacity={0}
          roughness={0.25}
          metalness={0.0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── M23: Lightning bolt line ─────────────────────────────────────── */}
      <primitive
        ref={boltLineRef}
        object={boltLineObject}
        visible={false}
      />
    </>
  )
}
