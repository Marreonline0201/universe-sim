import React, { useEffect, useRef, useState } from 'react'
import type { WorldStatus } from '../hooks/useStatusSocket'

const EPOCH_LABELS: Record<string, string> = {
  planck:            'Planck Epoch',
  grand_unification: 'Grand Unification',
  electroweak:       'Electroweak Era',
  quark_epoch:       'Quark Epoch',
  nucleosynthesis:   'Nucleosynthesis',
  photon_epoch:      'Photon Epoch',
  dark_ages:         'Cosmic Dark Ages',
  reionization:      'Reionization',
  stellar:           'Stellar Era',
  galactic:          'Galactic Era',
  contemporary:      'Contemporary Era',
  stellar_late:      'Late Stellar Era',
  degenerate:        'Degenerate Era',
  dark_era:          'Dark Era',
}

function formatSimTime(secs: number): string {
  if (secs <= 0) return '0 s'
  const years = secs / 31_557_600
  if (years < 1e-6)  return `${secs.toFixed(2)} s`
  if (years < 0.01)  return `${(secs / 60).toFixed(1)} min`
  if (years < 1)     return `${years.toFixed(4)} yr`
  if (years < 1000)  return `${years.toFixed(2)} yr`
  if (years < 1e6)   return `${(years / 1000).toFixed(2)} kyr`
  if (years < 1e9)   return `${(years / 1e6).toFixed(3)} Myr`
  return `${(years / 1e9).toFixed(3)} Gyr`
}

function formatTimeScale(ts: number): string {
  if (ts < 1000) return `${ts.toFixed(0)}×`
  const exp = Math.floor(Math.log10(ts))
  const mantissa = ts / Math.pow(10, exp)
  return `${mantissa.toFixed(2)}e+${exp}×`
}

interface Props {
  world: WorldStatus
}

export function EpochBar({ world }: Props) {
  const label = EPOCH_LABELS[world.epoch] ?? world.epoch.replace(/_/g, ' ').toUpperCase()
  const prevEpochRef = useRef(world.epoch)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (prevEpochRef.current !== world.epoch) {
      prevEpochRef.current = world.epoch
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 2000)
      return () => clearTimeout(t)
    }
  }, [world.epoch])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      height: 48,
      flexShrink: 0,
      background: 'rgba(0,0,0,0.6)',
      borderBottom: '1px solid rgba(0,180,255,0.18)',
      backdropFilter: 'blur(4px)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Animated top edge glow */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.5) 30%, rgba(0,200,255,0.5) 70%, transparent)',
      }} />

      {/* Left: logo + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          fontFamily: '"Orbitron", monospace',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 3,
          color: 'rgba(0,200,255,0.9)',
        }}>
          UNIVERSE SIM
        </div>
        <div style={{ width: 1, height: 20, background: 'rgba(0,200,255,0.2)' }} />
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 9,
          letterSpacing: 2,
          color: 'rgba(0,200,255,0.45)',
          textTransform: 'uppercase',
        }}>
          MISSION CONTROL
        </div>
      </div>

      {/* Center: epoch name */}
      <div style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: '"Orbitron", monospace',
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: flash ? '#ffd700' : 'rgba(255,255,255,0.9)',
          transition: 'color 0.4s ease',
          animation: flash ? 'epochFlash 2s ease-out forwards' : 'none',
        }}>
          {label}
        </div>
      </div>

      {/* Right: sim time + controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: 1,
          }}>
            {formatSimTime(world.simTime)}
          </span>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 8,
            color: 'rgba(0,200,255,0.4)',
            letterSpacing: 2,
          }}>
            WORLD TIME
          </span>
        </div>

        <div style={{ width: 1, height: 20, background: 'rgba(0,200,255,0.15)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 11,
            color: 'rgba(255,165,40,0.85)',
            letterSpacing: 1,
          }}>
            {formatTimeScale(world.timeScale)}
          </span>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 8,
            color: 'rgba(0,200,255,0.4)',
            letterSpacing: 2,
          }}>
            TIME SCALE
          </span>
        </div>

        <div style={{ width: 1, height: 20, background: 'rgba(0,200,255,0.15)' }} />

        {/* Paused / Live badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 8px',
          borderRadius: 2,
          border: world.paused
            ? '1px solid rgba(255,80,80,0.4)'
            : '1px solid rgba(0,255,100,0.3)',
          background: world.paused
            ? 'rgba(255,30,30,0.08)'
            : 'rgba(0,255,100,0.06)',
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: world.paused ? '#ff4040' : '#00ff88',
            boxShadow: world.paused
              ? '0 0 6px rgba(255,40,40,0.8)'
              : '0 0 6px rgba(0,255,120,0.8)',
          }} />
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: 2,
            color: world.paused ? 'rgba(255,80,80,0.9)' : 'rgba(0,255,120,0.9)',
          }}>
            {world.paused ? 'PAUSED' : 'LIVE'}
          </span>
        </div>

        {/* Connection dot */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: world.connected ? '#00d4ff' : '#666',
            boxShadow: world.connected ? '0 0 6px rgba(0,200,255,0.8)' : 'none',
          }} />
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 8,
            color: world.connected ? 'rgba(0,200,255,0.6)' : 'rgba(120,120,120,0.6)',
            letterSpacing: 1,
          }}>
            {world.connected ? 'SYNC' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* CSS keyframes */}
      <style>{`
        @keyframes epochFlash {
          0%   { color: #ffd700; text-shadow: 0 0 20px rgba(255,215,0,0.8); }
          100% { color: rgba(255,255,255,0.9); text-shadow: none; }
        }
      `}</style>
    </div>
  )
}
