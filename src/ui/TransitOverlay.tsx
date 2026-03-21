// ── TransitOverlay.tsx ────────────────────────────────────────────────────────
// M14 Track A: Full-screen 20-second transit animation.
// Renders: star-field with motion blur streaming past, destination planet
// growing from a distant dot, velocity counter, distance countdown.
//
// Purely canvas-2D. No Three.js — this overlays the 3D scene.
// Cinematic framing: the player is inside the orbital capsule looking forward.

import { useEffect, useRef } from 'react'
import { useTransitStore } from '../store/transitStore'
import { finalizeTransit, TRANSIT_DURATION_SEC } from '../game/InterplanetaryTransitSystem'
import { SYSTEM_PLANETS } from '../game/OrbitalMechanicsSystem'

// Seeded LCG — same as FirstContactOverlay to maintain visual consistency
function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

interface Star {
  angle: number    // radians from center
  baseSpeed: number
  r: number        // initial distance from center (0-1)
  brightness: number
  color: string
}

const STAR_COUNT = 300
const STELLAR_COLORS = ['#ffffff', '#ffe8cc', '#ccddff', '#aaddff', '#ffd0a0']

function makeStars(seed: number): Star[] {
  const rand = seededRand(seed)
  return Array.from({ length: STAR_COUNT }, () => ({
    angle:      rand() * Math.PI * 2,
    baseSpeed:  0.2 + rand() * 0.8,
    r:          0.05 + rand() * 0.95,
    brightness: 0.4 + rand() * 0.6,
    color:      STELLAR_COLORS[Math.floor(rand() * STELLAR_COLORS.length)],
  }))
}

interface TransitOverlayProps {
  onComplete: () => void
}

export function TransitOverlay({ onComplete }: TransitOverlayProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const rafRef       = useRef<number>(0)
  const startRef     = useRef<number>(0)
  const doneRef      = useRef(false)
  // Stable ref for onComplete — prevents animation restart on parent re-render
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const setProgress = useTransitStore(s => s.setTransitProgress)
  const toPlanet    = useTransitStore(s => s.toPlanet)
  const destSeed    = useTransitStore(s => s.destinationSeed)

  // Get destination planet color for the growing dot
  const destPlanet = SYSTEM_PLANETS.find(p => p.name === toPlanet)
  const destColor  = destPlanet?.color ?? '#ff9944'
  const destAU     = destPlanet?.semiMajorAU ?? 0.7

  // Re-initialize stars when destSeed changes (new transit destination)
  const stars = useRef<Star[]>([])
  if (stars.current.length === 0) {
    stars.current = makeStars(destSeed ^ 0xbadcafe)
  }

  const draw = (now: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (startRef.current === 0) startRef.current = now
    const elapsed = (now - startRef.current) / 1000  // seconds
    const t = Math.min(1, elapsed / TRANSIT_DURATION_SEC)
    setProgress(t)

    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2

    // Background: deep space black with slight blue tint
    ctx.fillStyle = '#00000f'
    ctx.fillRect(0, 0, W, H)

    // Speed factor: ramps up for first half, holds peak, then ramps down as we approach
    const speed = t < 0.1 ? t / 0.1          // 0→1 ramp-up
                : t > 0.85 ? (1 - t) / 0.15  // 1→0 ramp-down on arrival
                : 1.0                          // peak transit

    // Draw streaming stars (motion blur streaks)
    for (const star of stars.current) {
      const baseR   = star.r * Math.max(W, H) * 0.6
      const streamR = baseR + speed * star.baseSpeed * elapsed * 120  // stream outward

      // Only draw if still on screen
      if (streamR > Math.max(W, H) * 0.8) continue

      const sx = cx + Math.cos(star.angle) * streamR
      const sy = cy + Math.sin(star.angle) * streamR

      // Streak length proportional to speed
      const streakLen = speed * star.baseSpeed * 30
      const ex = cx + Math.cos(star.angle) * (streamR - streakLen)
      const ey = cy + Math.sin(star.angle) * (streamR - streakLen)

      const alpha = star.brightness * Math.min(1, speed * 2)
      ctx.beginPath()
      ctx.moveTo(ex, ey)
      ctx.lineTo(sx, sy)
      const grad = ctx.createLinearGradient(ex, ey, sx, sy)
      grad.addColorStop(0, `rgba(0,0,0,0)`)
      grad.addColorStop(1, star.color + Math.round(alpha * 255).toString(16).padStart(2, '0'))
      ctx.strokeStyle = grad
      ctx.lineWidth = 0.8 + star.brightness * 0.6
      ctx.stroke()
    }

    // ── Destination planet dot (grows from pinpoint to large sphere) ───────────
    const planetR = Math.max(2, t * t * Math.min(W, H) * 0.28)  // grows quadratically
    const planetAlpha = Math.min(1, t * 3)

    // Planet glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, planetR * 3)
    glow.addColorStop(0, destColor + '66')
    glow.addColorStop(0.4, destColor + '22')
    glow.addColorStop(1, 'transparent')
    ctx.beginPath()
    ctx.arc(cx, cy, planetR * 3, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.globalAlpha = planetAlpha
    ctx.fill()

    // Planet disc
    const disc = ctx.createRadialGradient(cx - planetR * 0.25, cy - planetR * 0.25, planetR * 0.1, cx, cy, planetR)
    disc.addColorStop(0, '#ffffff')
    disc.addColorStop(0.3, destColor)
    disc.addColorStop(1, destColor + '88')
    ctx.beginPath()
    ctx.arc(cx, cy, planetR, 0, Math.PI * 2)
    ctx.fillStyle = disc
    ctx.globalAlpha = planetAlpha
    ctx.fill()
    ctx.globalAlpha = 1

    // ── HUD ───────────────────────────────────────────────────────────────────
    ctx.font = '600 13px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.textAlign = 'center'

    // Planet name
    if (t > 0.05) {
      ctx.font = 'bold 18px monospace'
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, t * 4)})`
      ctx.fillText(toPlanet === 'Home' ? 'Returning Home' : toPlanet.toUpperCase(), cx, cy - planetR - 28)
    }

    // Distance display
    const distAU = (destAU * (1 - t)).toFixed(3)
    ctx.font = '600 12px monospace'
    ctx.fillStyle = 'rgba(160,200,255,0.8)'
    ctx.fillText(`Distance: ${distAU} AU`, cx, H - 60)

    // Velocity
    const velKms = Math.round(speed * 42.1)  // peak ~42.1 km/s (real Earth orbital velocity)
    ctx.fillText(`Velocity: ${velKms} km/s`, cx, H - 44)

    // Progress bar (use fillRect for broad browser support — roundRect not universal)
    const barW = 320
    const barH = 4
    const bx   = cx - barW / 2
    const by   = H - 24
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(bx, by, barW, barH)
    ctx.fillStyle = '#88bbff'
    ctx.fillRect(bx, by, barW * t, barH)

    // "ARRIVAL IMMINENT" flash at end
    if (t > 0.88) {
      const flashAlpha = ((t - 0.88) / 0.12) * (0.5 + 0.5 * Math.sin(now * 0.008))
      ctx.fillStyle = `rgba(255,200,100,${flashAlpha})`
      ctx.font = 'bold 20px monospace'
      ctx.fillText('ARRIVAL IMMINENT', cx, cy + planetR + 44)
    }

    if (t >= 1 && !doneRef.current) {
      doneRef.current = true
      finalizeTransit()
      onCompleteRef.current()
      return
    }

    rafRef.current = requestAnimationFrame(draw)
  }

  useEffect(() => {
    doneRef.current  = false
    startRef.current = 0
    stars.current    = makeStars(destSeed ^ 0xbadcafe)

    const canvas = canvasRef.current
    if (canvas) {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }

    rafRef.current = requestAnimationFrame(draw)

    const onResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width  = window.innerWidth
        canvasRef.current.height = window.innerHeight
      }
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
    // draw is defined inline — destSeed / toPlanet changes restart the animation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destSeed, toPlanet])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'block',
        background: '#00000f',
      }}
    />
  )
}
