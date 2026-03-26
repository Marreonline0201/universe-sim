// ── SeasonalEventsSystem.tsx ────────────────────────────────────────────────
// M32 Track A: Seasonal events — meteor showers, aurora borealis, seasonal
// festivals with XP bonus and settlement bonfire.
//
// Meteor shower:
//   Triggered every 7 in-game days. 8–15 LINE streaks across the sky sphere,
//   bright white/orange, moving ~500 m/s diagonally, 2–4 m long. Staggered
//   spawn times. 1% chance each meteor hits terrain within 500 m of player:
//   small dark crater disc + 2–5 iron ore + 1 rare crystal drop, notification.
//
// Aurora borealis:
//   Visible when night + high-latitude player position. Ribbon mesh of sine-
//   wave curved quads with emissive green/purple/blue colors. Undulates via
//   uTime shader uniform. Opacity 0.4, additive blending. Fades at sunrise.
//
// Seasonal festival:
//   First day of each new season (every 30 in-game days). 3-day duration.
//   Centered screen announcement. XP doubled via gameStore.xpMultiplier = 2.0.
//   Large bonfire mesh spawned at nearest settlement center.

import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { useSettlementStore } from '../store/settlementStore'
import { useUiStore } from '../store/uiStore'
import { inventory } from '../game/GameSingletons'
import { MAT } from '../player/Inventory'

// ── Constants ──────────────────────────────────────────────────────────────

const SKY_RADIUS = 4500          // radius of meteor spawn sphere
const METEOR_SPEED = 500         // m/s
const METEOR_INTERVAL_DAYS = 7   // every 7 in-game days
const METEOR_DURATION_REAL = 180 // 3 real-time minutes
const FESTIVAL_INTERVAL_DAYS = 30
const FESTIVAL_DURATION_DAYS = 3
const AURORA_LAT_THRESHOLD = 0.6  // |z/r| > 0.6 → near poles

// ── Types ──────────────────────────────────────────────────────────────────

interface MeteorStreak {
  id: number
  // Start position on sky sphere
  sx: number; sy: number; sz: number
  // Velocity direction (normalized * speed)
  vx: number; vy: number; vz: number
  length: number          // 2–4 m streak visual length
  life: number            // seconds remaining
  maxLife: number         // total life (0.5–1.5s)
  color: string           // '#ffffff' or '#ff8833'
  hasLanded: boolean
  spawnDelay: number      // seconds to wait before becoming visible
}

// ── Seeded random helper ────────────────────────────────────────────────────

function seededRand(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// ── Meteor streak geometry builder ─────────────────────────────────────────

function buildMeteorGeometry(count: number): THREE.BufferGeometry {
  const positions = new Float32Array(count * 2 * 3) // 2 points per streak
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geo
}

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  dayAngle: number   // from DayNightCycle
}

// ── SeasonalEventsSystem ────────────────────────────────────────────────────

export function SeasonalEventsSystem({ dayAngle }: Props) {
  const dayCount       = useGameStore(s => s.dayCount)
  const xpMultiplier   = useGameStore(s => s.xpMultiplier)
  const setXpMult      = useGameStore(s => s.setXpMultiplier)

  // ── Meteor shower state ─────────────────────────────────────────────────
  const [meteorsActive, setMeteorsActive]   = useState(false)
  const meteorTimerRef   = useRef(0)          // real seconds since last shower start
  const meteorStreaksRef = useRef<MeteorStreak[]>([])
  const meteorGroupRef   = useRef<THREE.Group>(null)
  const meteorNextIdRef  = useRef(0)

  // ── Aurora state ────────────────────────────────────────────────────────
  const auroraGroupRef   = useRef<THREE.Group>(null)
  const auroraTimeRef    = useRef(0)
  const auroraFadeRef    = useRef(0)

  // ── Festival state ───────────────────────────────────────────────────────
  const lastFestivalDayRef    = useRef(-1)
  const festivalEndDayRef     = useRef(-1)
  const [festivalBanner, setFestivalBanner] = useState<string | null>(null)
  const bannerTimerRef         = useRef(0)

  // ── Crater + loot drops (rendered as dark discs on ground) ─────────────
  const [craters, setCraters] = useState<Array<{ id: number; x: number; y: number; z: number }>>([])

  // ── Festival bonfire position ─────────────────────────────────────────
  const [bonfirePos, setBonfirePos] = useState<{ x: number; y: number; z: number } | null>(null)

  // ── Check meteor trigger (every 7 days) ──────────────────────────────────
  const lastMeteorDayRef = useRef(-METEOR_INTERVAL_DAYS) // ensure first shower happens at day 7
  useEffect(() => {
    if (!meteorsActive && dayCount - lastMeteorDayRef.current >= METEOR_INTERVAL_DAYS) {
      lastMeteorDayRef.current = dayCount
      setMeteorsActive(true)
      meteorTimerRef.current = 0

      // Spawn 8–15 meteors with staggered delays
      const rand = seededRand(dayCount * 7 + 13)
      const count = 8 + Math.floor(rand() * 8) // 8-15
      const streaks: MeteorStreak[] = []
      for (let i = 0; i < count; i++) {
        // Random point on upper hemisphere of sky sphere
        const theta = rand() * Math.PI * 2
        const phi   = rand() * Math.PI * 0.5  // upper half
        const sx    = SKY_RADIUS * Math.sin(phi) * Math.cos(theta)
        const sy    = SKY_RADIUS * Math.sin(phi) * Math.sin(theta)
        const sz    = SKY_RADIUS * Math.cos(phi) * 0.4 + SKY_RADIUS * 0.4

        // Diagonal downward trajectory
        const vx = (rand() - 0.5) * 1.5
        const vy = -0.5 - rand() * 0.5
        const vz = (rand() - 0.5) * 1.5
        const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz)
        const maxLife = 0.5 + rand() * 1.0

        streaks.push({
          id: meteorNextIdRef.current++,
          sx, sy, sz,
          vx: (vx / vLen) * METEOR_SPEED,
          vy: (vy / vLen) * METEOR_SPEED,
          vz: (vz / vLen) * METEOR_SPEED,
          length: 2 + rand() * 2,
          life: maxLife,
          maxLife,
          color: rand() < 0.6 ? '#ffffff' : '#ff8833',
          hasLanded: false,
          spawnDelay: rand() * 120, // stagger across 2 minutes
        })
      }
      meteorStreaksRef.current = streaks
    }
  }, [dayCount, meteorsActive])

  // ── Festival trigger (every 30 days, lasts 3 days) ────────────────────────
  useEffect(() => {
    const seasonStart = Math.floor((dayCount - 1) / FESTIVAL_INTERVAL_DAYS) * FESTIVAL_INTERVAL_DAYS + 1
    const dayInSeason = dayCount - seasonStart

    // First day of new season
    if (dayInSeason === 0 && seasonStart !== lastFestivalDayRef.current) {
      lastFestivalDayRef.current = seasonStart
      festivalEndDayRef.current  = seasonStart + FESTIVAL_DURATION_DAYS

      // Season name by index
      const seasonIdx = Math.floor((dayCount - 1) / FESTIVAL_INTERVAL_DAYS) % 4
      const banners = [
        '🌸 Spring Festival has begun!',
        '☀ Summer Solstice!',
        '🍂 Harvest Moon!',
        '❄ Winter\'s Eve!',
      ]
      setFestivalBanner(banners[seasonIdx])
      bannerTimerRef.current = 8 // show for 8 seconds
      setXpMult(2.0)
      useUiStore.getState().addNotification('Festival begun! XP doubled for 3 days.', 'discovery')
      // Dispatch to HTML overlay (SeasonalEventsUI outside Canvas)
      window.dispatchEvent(new CustomEvent('seasonal-festival', { detail: { message: banners[seasonIdx] } }))

      // Bonfire at nearest settlement
      const settlements = Array.from(useSettlementStore.getState().settlements.values())
      const ps = usePlayerStore.getState()
      if (settlements.length > 0) {
        let closest = settlements[0]
        let closestDist = Infinity
        for (const s of settlements) {
          const dx = s.x - ps.x, dy = s.y - ps.y, dz = s.z - ps.z
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (d < closestDist) { closestDist = d; closest = s }
        }
        setBonfirePos({ x: closest.x, y: closest.y, z: closest.z })
      }
    }

    // Festival end: restore multiplier
    if (xpMultiplier > 1.0 && dayCount > festivalEndDayRef.current) {
      setXpMult(1.0)
      setBonfirePos(null)
    }
  }, [dayCount, xpMultiplier, setXpMult])

  // ── useFrame: animate meteors, aurora, banners ────────────────────────────
  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime

    // ── Festival banner auto-dismiss ────────────────────────────────────
    if (bannerTimerRef.current > 0) {
      bannerTimerRef.current -= delta
      if (bannerTimerRef.current <= 0) {
        setFestivalBanner(null)
        bannerTimerRef.current = 0
      }
    }

    // ── Meteor shower ────────────────────────────────────────────────────
    if (meteorsActive) {
      meteorTimerRef.current += delta

      // End shower after duration
      if (meteorTimerRef.current > METEOR_DURATION_REAL) {
        setMeteorsActive(false)
        meteorStreaksRef.current = []
        if (meteorGroupRef.current) {
          meteorGroupRef.current.clear()
        }
        return
      }

      const ps = usePlayerStore.getState()
      const addNotif = useUiStore.getState().addNotification

      // Update each streak
      let anyAlive = false
      for (const m of meteorStreaksRef.current) {
        m.spawnDelay -= delta
        if (m.spawnDelay > 0) continue

        m.life -= delta
        if (m.life <= 0) {
          // Meteor expired — 1% chance to land near player
          if (!m.hasLanded && Math.random() < 0.01) {
            m.hasLanded = true
            // Landing position: offset from player
            const angle = Math.random() * Math.PI * 2
            const dist  = 50 + Math.random() * 450
            const lx = ps.x + Math.cos(angle) * dist
            const ly = ps.y + Math.sin(angle) * dist
            const lz = ps.z

            // Add crater
            setCraters(prev => [
              ...prev.slice(-19), // cap at 20 craters
              { id: Date.now(), x: lx, y: ly, z: lz },
            ])

            // Drop iron ore + crystal
            const ironCount = 2 + Math.floor(Math.random() * 4)
            for (let k = 0; k < ironCount; k++) {
              inventory.addItem({ itemId: 0, materialId: MAT.IRON_ORE, quantity: 1, quality: 0.85 + Math.random() * 0.15 })
            }
            inventory.addItem({ itemId: 0, materialId: MAT.VELAR_CRYSTAL, quantity: 1, quality: 1.0 })

            addNotif('A meteor struck nearby! Iron ore and crystal dropped.', 'discovery')
          }
          continue
        }

        anyAlive = true
      }

      if (!anyAlive && meteorTimerRef.current > 10) {
        setMeteorsActive(false)
        meteorStreaksRef.current = []
      }
    }

    // ── Aurora borealis ─────────────────────────────────────────────────
    auroraTimeRef.current = elapsed
    const sinA     = Math.sin(dayAngle)
    const isNight  = sinA < -0.1

    // High-latitude check: |z/r| > threshold
    const ps2 = usePlayerStore.getState()
    const r    = Math.sqrt(ps2.x * ps2.x + ps2.y * ps2.y + ps2.z * ps2.z) || 1
    const lat  = Math.abs(ps2.z / r)
    const auroraTarget = (isNight && lat > AURORA_LAT_THRESHOLD) ? 1.0 : 0.0

    auroraFadeRef.current += (auroraTarget - auroraFadeRef.current) * Math.min(1, delta * 0.3)

    if (auroraGroupRef.current) {
      auroraGroupRef.current.visible = auroraFadeRef.current > 0.01

      // Update all aurora ribbon materials with time and fade
      auroraGroupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.ShaderMaterial
          if (mat.uniforms) {
            mat.uniforms.uTime.value  = elapsed
            mat.uniforms.uFade.value  = auroraFadeRef.current * 0.4
          }
        }
      })
    }
  })

  // ── Aurora ribbon geometry ───────────────────────────────────────────────
  const auroraRibbons = useMemo(() => {
    const ribbons: Array<{ geo: THREE.BufferGeometry; colorA: THREE.Color; colorB: THREE.Color; yOffset: number; phase: number }> = []

    const configs = [
      { colorA: new THREE.Color('#00ff88'), colorB: new THREE.Color('#00aaff'), yOffset: 0,   phase: 0 },
      { colorA: new THREE.Color('#8844ff'), colorB: new THREE.Color('#00ff88'), yOffset: 80,  phase: 1.2 },
      { colorA: new THREE.Color('#4488ff'), colorB: new THREE.Color('#8844ff'), yOffset: 160, phase: 2.4 },
    ]

    for (const cfg of configs) {
      const SEGMENTS = 32
      const WIDTH    = 200
      const HEIGHT   = 40
      const ALTITUDE = 3200

      const positions: number[] = []
      const uvs: number[] = []
      const indices: number[] = []

      for (let i = 0; i <= SEGMENTS; i++) {
        const t  = i / SEGMENTS
        const px = (t - 0.5) * WIDTH * 20  // span 4km wide
        const py = ALTITUDE + cfg.yOffset
        const pz = Math.sin(t * Math.PI * 3) * 300  // gentle curve

        // Two vertices per segment (top and bottom of ribbon)
        positions.push(px, py + HEIGHT / 2, pz)
        positions.push(px, py - HEIGHT / 2, pz)
        uvs.push(t, 1, t, 0)

        if (i < SEGMENTS) {
          const base = i * 2
          indices.push(base, base + 1, base + 2)
          indices.push(base + 1, base + 3, base + 2)
        }
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
      geo.setIndex(indices)
      geo.computeVertexNormals()

      ribbons.push({ geo, colorA: cfg.colorA, colorB: cfg.colorB, yOffset: cfg.yOffset, phase: cfg.phase })
    }

    return ribbons
  }, [])

  // ── Aurora shader material factory ─────────────────────────────────────
  const makeAuroraMaterial = useCallback((colorA: THREE.Color, colorB: THREE.Color, phase: number) => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime:   { value: 0.0 },
        uFade:   { value: 0.0 },
        uColorA: { value: colorA },
        uColorB: { value: colorB },
        uPhase:  { value: phase },
      },
      vertexShader: /* glsl */`
        uniform float uTime;
        uniform float uPhase;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          vUv = uv;
          vec3 pos = position;
          // Undulate ribbon along x-axis using sin wave
          float wave = sin(pos.x * 0.003 + uTime * 0.4 + uPhase) * 30.0
                     + sin(pos.x * 0.007 + uTime * 0.7 + uPhase * 1.5) * 15.0;
          pos.y += wave;
          vWave = (wave + 45.0) / 90.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uFade;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          // Fade at top and bottom edges of ribbon
          float edgeFade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
          vec3 col = mix(uColorA, uColorB, vWave);
          gl_FragColor = vec4(col, edgeFade * uFade);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  }, [])

  // ── Meteor line segments (imperative, updated in useFrame via group) ────
  const MeteorLines = useMemo(() => {
    return null // handled imperatively in useFrame via direct mesh update below
  }, [])
  void MeteorLines

  return (
    <>
      {/* ── Aurora Borealis ribbons ─────────────────────────────────────── */}
      <group ref={auroraGroupRef} visible={false}>
        {auroraRibbons.map((ribbon, i) => (
          <mesh
            key={i}
            geometry={ribbon.geo}
            material={makeAuroraMaterial(ribbon.colorA, ribbon.colorB, ribbon.phase)}
            frustumCulled={false}
          />
        ))}
      </group>

      {/* ── Meteor streaks (Three.js Lines) ────────────────────────────── */}
      {meteorsActive && (
        <group ref={meteorGroupRef}>
          <MeteorStreaksRenderer streaks={meteorStreaksRef.current} />
        </group>
      )}

      {/* ── Impact craters ─────────────────────────────────────────────── */}
      {craters.map(c => (
        <mesh key={c.id} position={[c.x, c.y, c.z + 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2.5, 16]} />
          <meshStandardMaterial color="#1a1008" roughness={1} metalness={0} />
        </mesh>
      ))}

      {/* ── Festival bonfire ───────────────────────────────────────────── */}
      {bonfirePos && (
        <FestivalBonfire position={bonfirePos} />
      )}
    </>
  )
}

// ── MeteorStreaksRenderer ───────────────────────────────────────────────────
// Imperative Three.js line segments for meteor streaks, updated per-frame.

function MeteorStreaksRenderer({ streaks }: { streaks: MeteorStreak[] }) {
  const groupRef = useRef<THREE.Group>(null)
  const linesRef = useRef<Map<number, THREE.Line>>(new Map())

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    const alive = new Set<number>()

    for (const m of streaks) {
      if (m.spawnDelay > 0 || m.life <= 0) continue
      alive.add(m.id)

      const t = 1 - m.life / m.maxLife   // 0=fresh, 1=done
      const cx = m.sx + m.vx * t * m.maxLife
      const cy = m.sy + m.vy * t * m.maxLife
      const cz = m.sz + m.vz * t * m.maxLife

      const ex = cx + (m.vx / METEOR_SPEED) * m.length
      const ey = cy + (m.vy / METEOR_SPEED) * m.length
      const ez = cz + (m.vz / METEOR_SPEED) * m.length

      let line = linesRef.current.get(m.id)
      if (!line) {
        const geo = new THREE.BufferGeometry()
        const pts = new Float32Array(6)
        geo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
        const mat = new THREE.LineBasicMaterial({
          color: new THREE.Color(m.color),
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
        line = new THREE.Line(geo, mat)
        line.frustumCulled = false
        group.add(line)
        linesRef.current.set(m.id, line)
      }

      const pts = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
      pts[0] = cx; pts[1] = cy; pts[2] = cz
      pts[3] = ex; pts[4] = ey; pts[5] = ez
      line.geometry.attributes.position.needsUpdate = true

      // Fade out as life depletes
      const fade = m.life / m.maxLife
      ;(line.material as THREE.LineBasicMaterial).opacity = fade * 0.9
      line.visible = true
    }

    // Remove lines for dead meteors
    for (const [id, line] of linesRef.current) {
      if (!alive.has(id)) {
        group.remove(line)
        line.geometry.dispose()
        ;(line.material as THREE.LineBasicMaterial).dispose()
        linesRef.current.delete(id)
      }
    }

    void delta
  })

  return <group ref={groupRef} />
}

// ── FestivalBonfire ─────────────────────────────────────────────────────────
// Large bonfire mesh at settlement center during festival.

function FestivalBonfire({ position }: { position: { x: number; y: number; z: number } }) {
  const meshRef  = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    // Flicker the point light intensity
    const flicker = 3.5 + Math.sin(t * 7) * 0.8 + Math.sin(t * 13) * 0.4
    if (lightRef.current) lightRef.current.intensity = flicker
    // Gentle sway of flame cone
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(t * 2.1) * 0.08
    }
  })

  return (
    <group position={[position.x, position.y, position.z]}>
      {/* Log pile base */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[3, 3.5, 0.8, 12]} />
        <meshStandardMaterial color="#5a3a1a" roughness={0.9} />
      </mesh>
      {/* Flame cone */}
      <mesh ref={meshRef} position={[0, 2.0, 0]}>
        <coneGeometry args={[1.8, 3.5, 8, 1, true]} />
        <meshStandardMaterial
          color="#ff6600"
          emissive="#ff3300"
          emissiveIntensity={2.5}
          transparent
          opacity={0.85}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Inner bright core */}
      <mesh position={[0, 1.5, 0]}>
        <coneGeometry args={[0.8, 2.0, 6, 1, true]} />
        <meshStandardMaterial
          color="#ffee44"
          emissive="#ffcc00"
          emissiveIntensity={3.5}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Flickering point light */}
      <pointLight
        ref={lightRef}
        color="#ff8844"
        intensity={3.5}
        distance={40}
        decay={2}
        castShadow={false}
      />
    </group>
  )
}

// ── FestivalBannerUI ────────────────────────────────────────────────────────
// Centered fullscreen announcement for seasonal festival start.

interface BannerProps {
  message: string | null
}

export function FestivalBannerUI({ message }: BannerProps) {
  if (!message) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: '30%',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9000,
        pointerEvents: 'none',
        textAlign: 'center',
        fontFamily: 'monospace',
        animation: 'festivalSlideIn 0.5s ease-out',
      }}
    >
      <style>{`
        @keyframes festivalSlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-30px) scale(0.9); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)      scale(1);   }
        }
      `}</style>
      <div style={{
        background:   'rgba(10, 6, 30, 0.92)',
        border:       '2px solid rgba(160, 100, 255, 0.8)',
        borderRadius: 8,
        padding:      '20px 50px',
        boxShadow:    '0 0 60px rgba(120, 60, 255, 0.6), 0 0 120px rgba(60, 200, 150, 0.3)',
      }}>
        <div style={{ fontSize: 12, color: '#a080ff', letterSpacing: 6, marginBottom: 8 }}>
          SEASONAL EVENT
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#ffe080', letterSpacing: 3 }}>
          {message}
        </div>
        <div style={{ fontSize: 12, color: '#80e0a0', letterSpacing: 2, marginTop: 10 }}>
          XP DOUBLED FOR 3 DAYS
        </div>
      </div>
    </div>
  )
}

// ── SeasonalEventsUI ────────────────────────────────────────────────────────
// HTML overlay component for festival banner + XP indicator.
// Mount this outside the Canvas (in SceneRoot.tsx HTML layer).

export function SeasonalEventsUI() {
  const xpMultiplier = useGameStore(s => s.xpMultiplier)
  const [banner, setBanner] = useState<string | null>(null)

  // Listen for festival events dispatched from SeasonalEventsSystem via window events
  useEffect(() => {
    const handler = (e: Event) => {
      const { message } = (e as CustomEvent).detail ?? {}
      if (typeof message === 'string') {
        setBanner(message)
        setTimeout(() => setBanner(null), 8000)
      }
    }
    window.addEventListener('seasonal-festival', handler)
    return () => window.removeEventListener('seasonal-festival', handler)
  }, [])

  return (
    <>
      <FestivalBannerUI message={banner} />
      {xpMultiplier > 1.0 && (
        <div style={{
          position: 'fixed',
          top: 56,
          right: 16,
          zIndex: 200,
          pointerEvents: 'none',
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#ffe080',
          background: 'rgba(10,6,20,0.85)',
          border: '1px solid rgba(160,100,255,0.6)',
          borderRadius: 4,
          padding: '3px 10px',
          letterSpacing: 1,
        }}>
          ✦ XP x{xpMultiplier.toFixed(1)} (Festival)
        </div>
      )}
    </>
  )
}
