// ── SpellWeatherHint.tsx ───────────────────────────────────────────────────────
// M44 Track C: Weather-Spell Interaction Hint
// Renders a single-line hint below the spell bar showing the weather modifier
// for the currently active spell. Hidden when modifier is 1.0 (neutral).

import React, { useState, useEffect } from 'react'
import { useSpellStore } from '../../store/spellStore'
import { useWeatherStore } from '../../store/weatherStore'
import { getWeatherSpellMultiplier } from '../../game/WeatherSpellSystem'
import { SPELLS } from '../../game/SpellSystem'
import type { SpellId } from '../../game/SpellSystem'

// Emoji icons for spells
const SPELL_EMOJI: Record<SpellId, string> = {
  fireball:     '🔥',
  ice_shard:    '🧊',
  lightning:    '⚡',
  heal:         '💚',
  wind_blast:   '💨',
  stone_shield: '🪨',
}

// Human-readable weather context messages
function getWeatherHintMessage(spellId: SpellId, multiplier: number, weatherCondition: string): string {
  if (multiplier > 1.0) {
    switch (weatherCondition) {
      case 'storm':    return 'Storm amplified!'
      case 'rain':     return 'Rain amplifies lightning'
      case 'blizzard': return 'Blizzard empowers ice'
      case 'sunny':
      case 'clear':    return 'Dry weather boosts fire'
      default:         return 'Weather boosted!'
    }
  } else {
    switch (weatherCondition) {
      case 'rain':     return 'Rain reduces fire'
      case 'storm':    return 'Storm weakens fire'
      case 'blizzard': return 'Blizzard douses fire'
      case 'sunny':
      case 'clear':    return 'Dry air weakens lightning'
      default:         return 'Weather reduced'
    }
  }
}

export function SpellWeatherHint(): React.ReactElement | null {
  const equippedSpells = useSpellStore(s => s.equippedSpells)
  const weatherStore = useWeatherStore.getState()

  // Track hint state with a 2-second poll interval
  const [hint, setHint] = useState<{ spellId: SpellId; multiplier: number; condition: string } | null>(null)

  useEffect(() => {
    function refresh() {
      // Use the first equipped spell as the "active" spell
      const activeSpell = equippedSpells.find(s => s !== null) ?? null
      if (!activeSpell) {
        setHint(null)
        return
      }
      const multiplier = getWeatherSpellMultiplier(activeSpell)
      // Hide when neutral
      if (multiplier === 1.0) {
        setHint(null)
        return
      }
      const weather = useWeatherStore.getState().getPlayerWeather()
      const condition = weather ? weather.state.toLowerCase() : 'clear'
      setHint({ spellId: activeSpell, multiplier, condition })
    }

    // Run immediately, then every 2 seconds
    refresh()
    const interval = setInterval(refresh, 2000)
    return () => clearInterval(interval)
  }, [equippedSpells])

  if (!hint) return null

  const spell = SPELLS[hint.spellId]
  const emoji = SPELL_EMOJI[hint.spellId]
  const multLabel = `×${hint.multiplier.toFixed(1)}`
  const message = getWeatherHintMessage(hint.spellId, hint.multiplier, hint.condition)
  const color = hint.multiplier > 1.0 ? '#4ade80' : '#f87171'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '112px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.65)',
        border: `1px solid ${color}`,
        borderRadius: '6px',
        padding: '4px 12px',
        color,
        fontSize: '13px',
        fontFamily: 'monospace',
        pointerEvents: 'none',
        zIndex: 200,
        whiteSpace: 'nowrap',
      }}
    >
      {emoji} {spell.name}: {multLabel} ({message})
    </div>
  )
}
