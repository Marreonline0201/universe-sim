// DayNightCycle — drives the 20-minute real-time day/night cycle.
//
// Physics basis:
//   Sun orbits at distance 8000m from planet center in the XY plane,
//   completing one revolution every 1200 real seconds (20 minutes).
//   Angular velocity = 2π / 1200 rad/s.
//
//   Directional light intensity follows a cosine envelope:
//     intensity = max(0.05, 2.2 * sin(angle))
//   where angle=π/2 is noon and angle=3π/2 is midnight.
//
//   Sky turbidity and rayleigh scattering increase during dawn/dusk
//   to simulate the longer atmospheric path at low sun angles (Rayleigh
//   scattering ∝ 1/λ⁴ — responsible for orange/red sunrises).

import { useRef, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import * as THREE from 'three'
import { usePlayerStore } from '../store/playerStore'
import { useWeatherStore } from '../store/weatherStore'
import { useGameStore } from '../store/gameStore'

// ── M39 Track A: Sky gradient colors (pre-allocated) ─────────────────────────
// Dawn  (sinA near 0, rising)
const _dawnHorizon = new THREE.Color('#ff6633')
const _dawnMidsky  = new THREE.Color('#cc44aa')
const _dawnZenith  = new THREE.Color('#1122aa')
// Day
const _dayHorizon  = new THREE.Color('#88ccff')
const _dayZenith   = new THREE.Color('#1144cc')
// Sunset (sinA near 0, setting)
const _sunsetHorizon = new THREE.Color('#ff4400')
const _sunsetMidsky  = new THREE.Color('#ffaa00')
const _sunsetZenith  = new THREE.Color('#440088')
// Night
const _nightSky    = new THREE.Color('#000011')
// Scratch
const _skyTop      = new THREE.Color()
const _skyBot      = new THREE.Color()

// God ray color
const _godRayColor = new THREE.Color('#ffdd88')

// One full day = 1200 real seconds (20 minutes)
const DAY_DURATION_S = 1200
const ANGULAR_VEL    = (2 * Math.PI) / DAY_DURATION_S

// Sun orbit radius — far enough to be effectively directional
const SUN_ORBIT_R = 8000

// Start at ~10 o'clock (sun well above horizon, not blinding at spawn)
const START_ANGLE = Math.PI * 0.6

interface SkyParams {
  sunPosition: [number, number, number]
  turbidity: number
  rayleigh: number
}

interface Props {
  onDayAngleChange?: (angle: number) => void
}

export function DayNightCycle({ onDayAngleChange }: Props) {
  const dayAngle = useRef(START_ANGLE)

  const dirLightRef  = useRef<THREE.DirectionalLight>(null)
  const ambLightRef  = useRef<THREE.AmbientLight>(null)
  const hemiLightRef = useRef<THREE.HemisphereLight>(null)

  // Sky params as state so React re-renders Sky when they change.
  // We throttle updates to ~4Hz to avoid excessive re-renders.
  const [skyParams, setSkyParams] = useState<SkyParams>({
    sunPosition: [
      SUN_ORBIT_R * Math.cos(START_ANGLE),
      SUN_ORBIT_R * Math.sin(START_ANGLE),
      3000,
    ],
    turbidity: 4,
    rayleigh: 0.4,
  })
  const skyUpdateTimer = useRef(0)

  // Reusable color objects — no per-frame allocations
  const _daySkyColor    = useRef(new THREE.Color('#87ceeb'))
  const _nightSkyColor  = useRef(new THREE.Color('#060a1a'))
  const _dayGroundColor = useRef(new THREE.Color('#3a4a1a'))
  const _nightGroundColor = useRef(new THREE.Color('#0a0a08'))
  const _tmpColor       = useRef(new THREE.Color())

  // M22: Moonlight ref
  const moonLightRef = useRef<THREE.DirectionalLight>(null)

  // M22: Sun disc mesh refs
  const sunDiscRef = useRef<THREE.Mesh>(null)
  const sunGlowRef = useRef<THREE.Mesh>(null)

  // M22: Day counter
  const totalRevolutions = useRef(0)
  const prevAngleRef = useRef(START_ANGLE)

  // M39 Track A: God ray cone meshes (5 cones, refs stored in array)
  const godRayRefs = useRef<(THREE.Mesh | null)[]>([null, null, null, null, null])

  // M39 Track A: Sky gradient sphere (custom ShaderMaterial)
  const skySphereRef = useRef<THREE.Mesh>(null)

  // M39 Track A: Previous weather state for transition detection
  const prevWeatherStateRef = useRef<string>('CLEAR')

  // M22: Fog color targets (pre-allocated)
  const _fogNoon   = useRef(new THREE.Color('#c8d8e8'))
  const _fogDusk   = useRef(new THREE.Color('#ffd4a3'))
  const _fogNight  = useRef(new THREE.Color('#0a1428'))
  const _fogTarget = useRef(new THREE.Color())

  // M22: Throttle gameStore updates to ~2Hz
  const storeUpdateTimer = useRef(0)

  // M39 Track A: Sky gradient shader material
  const skyGradientMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTopColor:    { value: new THREE.Color('#1144cc') },
      uBottomColor: { value: new THREE.Color('#88ccff') },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      varying vec3 vWorldPos;
      void main() {
        // t = 0 at equator (horizon), 1 at top of sphere
        float t = clamp(normalize(vWorldPos).y * 0.5 + 0.5, 0.0, 1.0);
        vec3 color = mix(uBottomColor, uTopColor, t * t);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  }), [])

  useFrame((state, delta) => {
    // Advance day angle
    dayAngle.current = (dayAngle.current + ANGULAR_VEL * delta) % (2 * Math.PI)
    const angle = dayAngle.current

    // sin(angle): 1 at noon, -1 at midnight
    const sinA = Math.sin(angle)
    const sunAboveHorizon = sinA > 0

    // Sun position in world space
    const sx = SUN_ORBIT_R * Math.cos(angle)
    const sy = SUN_ORBIT_R * Math.sin(angle)

    // ── Directional light ────────────────────────────────────────────────────
    if (dirLightRef.current) {
      // Move shadow camera target to follow player so shadows work anywhere on sphere
      const ps = usePlayerStore.getState()
      dirLightRef.current.target.position.set(ps.x, ps.y, ps.z)
      dirLightRef.current.target.updateMatrixWorld()
      dirLightRef.current.position.set(ps.x + sx, ps.y + sy, ps.z + 3000)
      dirLightRef.current.intensity = Math.max(0.02, 2.2 * sinA + 0.05)

      // Warm orange/red at dawn/dusk (low sun angle)
      const horizonProximity = 1 - Math.abs(sinA)
      const isDawnDusk = sunAboveHorizon && horizonProximity > 0.7
      if (isDawnDusk) {
        dirLightRef.current.color.setRGB(1.0, 0.55 + 0.45 * sinA, 0.15 + 0.45 * sinA)
      } else {
        dirLightRef.current.color.setRGB(1.0, 0.97, 0.92)
      }
    }

    // ── Ambient light ────────────────────────────────────────────────────────
    if (ambLightRef.current) {
      const wState = useWeatherStore.getState().getPlayerWeather()?.state
      // Cloudy/rain/storm: raise floor so dark valleys stay visible
      const ambFloor = (wState === 'CLOUDY' || wState === 'RAIN' || wState === 'STORM')
        ? 0.28
        : 0.06
      const baseAmb = sunAboveHorizon ? 0.08 + 0.37 * sinA : 0.06
      ambLightRef.current.intensity = Math.max(baseAmb, ambFloor)
    }

    // ── Hemisphere light ─────────────────────────────────────────────────────
    if (hemiLightRef.current) {
      const t = Math.max(0, sinA)
      _tmpColor.current.copy(_nightSkyColor.current).lerp(_daySkyColor.current, t)
      hemiLightRef.current.color.copy(_tmpColor.current)
      _tmpColor.current.copy(_nightGroundColor.current).lerp(_dayGroundColor.current, t)
      hemiLightRef.current.groundColor.copy(_tmpColor.current)
      hemiLightRef.current.intensity = 0.15 + 0.55 * t
    }

    // ── Fog density ──────────────────────────────────────────────────────────
    // Day: thin fog, thickens slightly at low sun angles (aerosol scattering).
    // Night: +30% denser than day peak to create atmospheric depth and pressure.
    // The 0.0002 night increment above the max-day value matches the spec.
    if (state.scene.fog instanceof THREE.FogExp2) {
      state.scene.fog.density = sunAboveHorizon
        ? 0.008 + 0.004 * (1 - sinA)   // day: 0.008 (noon) → 0.012 (horizon)
        : 0.016 + 0.002 * Math.abs(sinA) // night: 0.016–0.018 (densest at midnight)
    }

    // ── M22: Fog color modulation by time of day ────────────────────────────
    if (state.scene.fog instanceof THREE.FogExp2) {
      const horizPfog = Math.max(0, 1 - Math.abs(sinA))
      const isDawnDuskFog = sunAboveHorizon && horizPfog > 0.6
      if (isDawnDuskFog) {
        // Golden hour: warm peach fog
        const t2 = (horizPfog - 0.6) / 0.4 // 0-1 in the dawn/dusk band
        _fogTarget.current.copy(_fogNoon.current).lerp(_fogDusk.current, t2)
      } else if (sunAboveHorizon) {
        // Daytime: cool grey-blue fog
        _fogTarget.current.copy(_fogNoon.current)
      } else {
        // Night: deep blue fog
        const nightT = Math.min(1, Math.abs(sinA) * 2)
        _fogTarget.current.copy(_fogDusk.current).lerp(_fogNight.current, nightT)
      }
      state.scene.fog.color.lerp(_fogTarget.current, Math.min(1, delta * 2))
    }

    // ── M27 Track C4: Moon glow — soft blue-white, opposite sun, night only ──
    if (moonLightRef.current) {
      const ps2 = usePlayerStore.getState()
      if (!sunAboveHorizon) {
        // Moon direction = -sunDir + slight declination offset (normalized)
        // sunDir vector: (sx, sy, 3000) → opposite = (-sx, -sy, -3000) + (0, 0, 0.1*norm)
        // Approximate: place moon opposite sun with z declination offset
        moonLightRef.current.position.set(ps2.x - sx * 0.5, ps2.y - sy * 0.5, ps2.z + 2000)
        moonLightRef.current.target.position.set(ps2.x, ps2.y, ps2.z)
        moonLightRef.current.target.updateMatrixWorld()
        // Ramp up to 0.08 as sun goes below horizon (abs(sinA) increases)
        moonLightRef.current.intensity = Math.min(0.08, Math.abs(sinA) * 0.10)
        moonLightRef.current.visible = true
      } else {
        moonLightRef.current.intensity = 0
        moonLightRef.current.visible = false
      }
    }

    // ── M22: Sun disc mesh follows sun position ────────────────────────────
    if (sunDiscRef.current) {
      const ps3 = usePlayerStore.getState()
      // Place sun disc at a visible distance (closer than orbit radius)
      const discDist = 4000
      const discX = ps3.x + discDist * Math.cos(angle)
      const discY = ps3.y + discDist * Math.sin(angle)
      const discZ = ps3.z + 1500
      sunDiscRef.current.position.set(discX, discY, discZ)
      sunDiscRef.current.lookAt(ps3.x, ps3.y, ps3.z)
      // Fade out below horizon
      const sunOpacity = sunAboveHorizon ? Math.min(1, sinA * 3) : 0
      const mat = sunDiscRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = sunOpacity
      sunDiscRef.current.visible = sunOpacity > 0.01

      if (sunGlowRef.current) {
        sunGlowRef.current.position.copy(sunDiscRef.current.position)
        sunGlowRef.current.lookAt(ps3.x, ps3.y, ps3.z)
        const glowMat = sunGlowRef.current.material as THREE.MeshBasicMaterial
        glowMat.opacity = sunOpacity * 0.12
        sunGlowRef.current.visible = sunOpacity > 0.01
      }
    }

    // ── M22: Track day count (detect angle wrap past 0) ────────────────────
    if (angle < prevAngleRef.current && prevAngleRef.current > Math.PI) {
      totalRevolutions.current++
    }
    prevAngleRef.current = angle

    // ── M22: Broadcast day angle + count to gameStore (throttled ~2Hz) ──────
    storeUpdateTimer.current += delta
    if (storeUpdateTimer.current >= 0.5) {
      storeUpdateTimer.current = 0
      useGameStore.getState().setDayAngle(angle)
      useGameStore.getState().setDayCount(totalRevolutions.current + 1)
    }

    // ── Sky params (throttled at ~4Hz — Sky re-render is expensive) ──────────
    skyUpdateTimer.current += delta
    if (skyUpdateTimer.current >= 0.25) {
      skyUpdateTimer.current = 0
      const horizP = Math.max(0, 1 - Math.abs(sinA))
      const turb   = sunAboveHorizon ? 4 + horizP * 14 : 20
      const rayl   = sunAboveHorizon ? 0.4 + horizP * 1.6 : 0.05

      setSkyParams({
        sunPosition: [sx, sy, 3000],
        turbidity: turb,
        rayleigh: rayl,
      })
    }

    // ── M39 Track A: Sky gradient update (throttled with sky params ~4Hz) ──
    if (skyUpdateTimer.current === 0) {  // reuse the 0.25s throttle reset above
      // Determine sky phase and pick top/bottom colors
      const horizP = Math.max(0, 1 - Math.abs(sinA))
      const isDawn    = sunAboveHorizon && sinA < 0.35 && angle < Math.PI  // rising
      const isSunset  = sunAboveHorizon && sinA < 0.35 && angle >= Math.PI // setting

      if (!sunAboveHorizon) {
        // Night
        _skyTop.copy(_nightSky)
        _skyBot.copy(_nightSky).lerp(_dawnZenith, 0.05)
      } else if (isDawn) {
        const t = Math.min(1, sinA / 0.35)
        _skyBot.copy(_dawnHorizon).lerp(_dayHorizon, t)
        _skyTop.copy(_dawnZenith).lerp(_dayZenith, t)
      } else if (isSunset) {
        const t = Math.min(1, sinA / 0.35)
        _skyBot.copy(_sunsetHorizon).lerp(_dayHorizon, t)
        _skyTop.copy(_sunsetZenith).lerp(_dayZenith, t)
      } else {
        // Full day
        _skyBot.copy(_dayHorizon)
        _skyTop.copy(_dayZenith)
      }

      if (skySphereRef.current) {
        const mat = skySphereRef.current.material as THREE.ShaderMaterial
        mat.uniforms.uTopColor.value.copy(_skyTop)
        mat.uniforms.uBottomColor.value.copy(_skyBot)
      }
    }

    // ── M39 Track A: God rays (dawn/dusk only — near horizon) ──────────────
    const horizonProximityForRays = 1 - Math.abs(sinA)
    const isGodRayTime = sunAboveHorizon && horizonProximityForRays > 0.8
    const ps4 = usePlayerStore.getState()
    const discDist4 = 3000
    const godRayX = ps4.x + discDist4 * Math.cos(angle)
    const godRayY = ps4.y + discDist4 * Math.sin(angle)
    const godRayZ = ps4.z + 1200

    for (let i = 0; i < 5; i++) {
      const ref = godRayRefs.current[i]
      if (!ref) continue
      if (!isGodRayTime) {
        ref.visible = false
        continue
      }
      // Spread cones in a fan around sun direction
      const fanAngle = (i - 2) * 0.08  // -0.16 to +0.16 radians
      const cosF = Math.cos(fanAngle), sinF = Math.sin(fanAngle)
      const rx = godRayX * cosF - godRayZ * sinF
      const rz = godRayX * sinF + godRayZ * cosF
      ref.position.set(rx, godRayY, rz)
      ref.lookAt(ps4.x, ps4.y, ps4.z)
      ref.rotateX(Math.PI / 2) // ConeGeometry points up; rotate to point toward player

      const rayOpacity = (horizonProximityForRays - 0.8) / 0.2 * 0.06
      const mat = ref.material as THREE.MeshBasicMaterial
      mat.opacity = rayOpacity
      ref.visible = true
    }

    // ── M39 Track A: Weather transition detection ───────────────────────────
    const currentWeatherState = useWeatherStore.getState().getPlayerWeather()?.state ?? 'CLEAR'
    if (currentWeatherState !== prevWeatherStateRef.current) {
      const wasRain = prevWeatherStateRef.current === 'RAIN' || prevWeatherStateRef.current === 'STORM'
      const nowClear = currentWeatherState === 'CLEAR'
      // Trigger rainbow when rain clears
      if (wasRain && nowClear) {
        useWeatherStore.getState().setRainbowActive(true)
      }
      useWeatherStore.getState().setWeatherTransition(
        prevWeatherStateRef.current as any,
        currentWeatherState,
      )
      prevWeatherStateRef.current = currentWeatherState
    }
    // Tick transition + rainbow timers each frame
    useWeatherStore.getState().tickTransition(delta)
    useWeatherStore.getState().tickRainbow(delta)

    onDayAngleChange?.(angle)
  })

  return (
    <>
      {/* Directional sun light with shadow — position driven by dayAngle each frame */}
      <directionalLight
        ref={dirLightRef}
        position={[
          SUN_ORBIT_R * Math.cos(START_ANGLE),
          SUN_ORBIT_R * Math.sin(START_ANGLE),
          3000,
        ]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={10000}
        shadow-camera-left={-600}
        shadow-camera-right={600}
        shadow-camera-top={600}
        shadow-camera-bottom={-600}
      />
      {/* Ambient fill light — dims at night to near-zero */}
      <ambientLight ref={ambLightRef} intensity={0.45} />
      {/* Hemisphere sky/ground bounce — sky color shifts from blue to black at night */}
      <hemisphereLight
        ref={hemiLightRef}
        args={['#87ceeb', '#3a4a1a', 0.7]}
      />
      {/* Sky dome — sun position and atmosphere parameters driven by dayAngle */}
      <Sky
        sunPosition={skyParams.sunPosition}
        turbidity={skyParams.turbidity}
        rayleigh={skyParams.rayleigh}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />

      {/* M22: Sun disc — bright emissive billboard */}
      <mesh ref={sunDiscRef} renderOrder={999}>
        <circleGeometry args={[40, 32]} />
        <meshBasicMaterial
          color="#fff5e0"
          transparent
          opacity={1}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* M22: Sun glow halo — larger, fainter */}
      <mesh ref={sunGlowRef} renderOrder={998}>
        <circleGeometry args={[120, 32]} />
        <meshBasicMaterial
          color="#ffeecc"
          transparent
          opacity={0.12}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* M27 Track C4: Moonlight — cool blue-white, no shadow (GPU cost) */}
      <directionalLight
        ref={moonLightRef}
        color="#c0d0ff"
        intensity={0}
        castShadow={false}
      />

      {/* M39 Track A: Sky gradient sphere — sits behind everything */}
      <mesh ref={skySphereRef} renderOrder={-1000}>
        <sphereGeometry args={[4000, 16, 8]} />
        <primitive object={skyGradientMaterial} attach="material" />
      </mesh>

      {/* M39 Track A: God rays — 5 additive cones from sun at dawn/dusk */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          ref={(el) => { godRayRefs.current[i] = el }}
          visible={false}
          renderOrder={997}
        >
          <coneGeometry args={[200, 800, 4]} />
          <meshBasicMaterial
            color={_godRayColor}
            transparent
            opacity={0.05}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* M39 Track A: Rainbow — TorusGeometry arc after rain clears */}
      <RainbowArc />
    </>
  )
}

// ── M39 Track A: Rainbow arc — appears when rainbowActive is true ────────────
function RainbowArc() {
  const rainbowRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)
  const hueRef = useRef(0)

  useFrame((_, delta) => {
    const { rainbowActive, rainbowTimer } = useWeatherStore.getState()

    if (!rainbowRef.current || !materialRef.current) return

    if (!rainbowActive) {
      rainbowRef.current.visible = false
      return
    }

    // Fade: full at 45-60s remaining, fades to 0 at 0s
    const opacity = Math.min(1, rainbowTimer / 15) * 0.65
    materialRef.current.opacity = opacity
    rainbowRef.current.visible = opacity > 0.01

    // Cycle hue through rainbow spectrum
    hueRef.current = (hueRef.current + delta * 0.12) % 1
    materialRef.current.color.setHSL(hueRef.current, 1.0, 0.55)

    // Follow player, position opposite sun
    const ps = usePlayerStore.getState()
    const dayAngle = useGameStore.getState().dayAngle
    // Rainbow is opposite sun direction (sun at angle → rainbow at angle + PI)
    const oppAngle = dayAngle + Math.PI
    rainbowRef.current.position.set(
      ps.x + Math.cos(oppAngle) * 400,
      ps.y + 150,
      ps.z + Math.sin(oppAngle) * 400,
    )
    rainbowRef.current.lookAt(ps.x, ps.y + 150, ps.z)
    rainbowRef.current.rotateX(Math.PI / 2)
  })

  return (
    <mesh ref={rainbowRef} visible={false} renderOrder={500}>
      <torusGeometry args={[600, 3, 8, 64, Math.PI]} />
      <meshBasicMaterial
        ref={materialRef}
        color="#ff0000"
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
