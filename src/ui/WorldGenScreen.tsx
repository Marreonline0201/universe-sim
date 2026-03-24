/**
 * WorldGenScreen
 *
 * Full-screen overlay shown while the WASM pipeline is generating the world.
 * Displays a starfield animation, the current stage name, and a progress bar.
 */

import { useEffect, useRef } from 'react'
import type { WorldGenState } from '../hooks/useWorldGen'

const STAGES: Record<string, string> = {
  'loading WASM modules':         'Loading physics engines…',
  'simulating star formation':    'Simulating stellar formation…',
  'running tectonic simulation':  'Running tectonic simulation…',
  'extracting heightmap':         'Extracting terrain heightmap…',
  'evolving atmosphere':          'Evolving atmosphere & oceans…',
  'finalising world':             'Assembling world descriptor…',
  'cache':                        'Loading world from cache…',
  'done':                         'World ready.',
  'error':                        'Generation failed.',
}

interface Props {
  state: WorldGenState
}

export function WorldGenScreen({ state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Simple starfield animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0

    const stars = Array.from({ length: 200 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.5 + 0.5,
      v: Math.random() * 0.0002 + 0.00005,
    }))

    const draw = () => {
      const { width, height } = canvas
      ctx.fillStyle = '#000008'
      ctx.fillRect(0, 0, width, height)
      for (const s of stars) {
        s.x = (s.x + s.v) % 1
        ctx.beginPath()
        ctx.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${0.3 + s.r / 2})`
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)
    draw()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  const label = STAGES[state.stage] ?? 'Simulating universe…'
  const isError = state.status === 'error'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace',
      color: '#e8eaf6',
    }}>
      {/* Starfield */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, width: 480, padding: 32, textAlign: 'center' }}>
        {/* Title */}
        <div style={{ fontSize: 11, letterSpacing: 8, opacity: 0.45, marginBottom: 8 }}>
          UNIVERSE SIM
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2, marginBottom: 32 }}>
          WORLD GENESIS
        </div>

        {/* Stage label */}
        <div style={{
          fontSize: 13, letterSpacing: 1, opacity: 0.8, marginBottom: 16,
          color: isError ? '#ff6b6b' : '#7eb8f7',
          minHeight: 20,
        }}>
          {isError ? (state.error ?? 'Unknown error') : label}
        </div>

        {/* Progress bar */}
        {!isError && (
          <div style={{
            height: 4, background: 'rgba(255,255,255,0.1)',
            borderRadius: 2, overflow: 'hidden', marginBottom: 12,
          }}>
            <div style={{
              height: '100%',
              width: `${state.pct}%`,
              background: 'linear-gradient(90deg, #3d5afe, #7eb8f7)',
              borderRadius: 2,
              transition: 'width 0.4s ease',
            }} />
          </div>
        )}

        {/* Pct */}
        {!isError && (
          <div style={{ fontSize: 11, opacity: 0.35 }}>{state.pct.toFixed(0)} %</div>
        )}

        {/* Error hint */}
        {isError && (
          <div style={{ fontSize: 11, opacity: 0.4, marginTop: 16 }}>
            Physics engines not yet compiled? Run: <code>npm run wasm</code>
          </div>
        )}
      </div>
    </div>
  )
}
