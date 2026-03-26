// src/game/WeatherEffectsSystem.ts
// M57 Track C: Weather modifiers — applies gameplay effects based on current weather

export interface WeatherEffect {
  name: string
  icon: string
  description: string
  movementMult: number    // 1.0 = normal, 0.8 = 20% slower
  damageMult: number      // 1.0 = normal, 1.2 = 20% more damage taken
  gatherMult: number      // 1.0 = normal, 1.3 = 30% more resources
  visibilityMult: number  // 1.0 = normal, 0.5 = 50% visibility
}

export const WEATHER_EFFECTS: Record<string, WeatherEffect> = {
  clear:    { name: 'Clear',    icon: '☀️',  description: 'Perfect conditions.',             movementMult: 1.0,  damageMult: 1.0,  gatherMult: 1.0,  visibilityMult: 1.0  },
  sunny:    { name: 'Sunny',   icon: '☀️',  description: 'Bright and warm.',                movementMult: 1.0,  damageMult: 0.9,  gatherMult: 1.1,  visibilityMult: 1.0  },
  cloudy:   { name: 'Cloudy',  icon: '☁️',  description: 'Overcast skies.',                 movementMult: 1.0,  damageMult: 1.0,  gatherMult: 1.0,  visibilityMult: 0.9  },
  rain:     { name: 'Rain',    icon: '🌧',  description: 'Slippery ground, poor sight.',     movementMult: 0.9,  damageMult: 1.1,  gatherMult: 1.2,  visibilityMult: 0.8  },
  storm:    { name: 'Storm',   icon: '⛈',  description: 'Dangerous! Severe penalties.',     movementMult: 0.7,  damageMult: 1.3,  gatherMult: 0.8,  visibilityMult: 0.5  },
  thunder:  { name: 'Thunder', icon: '⛈',  description: 'Lightning strikes are a hazard.',  movementMult: 0.75, damageMult: 1.25, gatherMult: 0.9,  visibilityMult: 0.6  },
  snow:     { name: 'Snow',    icon: '❄️',  description: 'Cold slows movement.',            movementMult: 0.85, damageMult: 1.1,  gatherMult: 0.9,  visibilityMult: 0.7  },
  blizzard: { name: 'Blizzard',icon: '🌨',  description: 'Whiteout. Extreme danger.',       movementMult: 0.6,  damageMult: 1.4,  gatherMult: 0.5,  visibilityMult: 0.3  },
  fog:      { name: 'Fog',     icon: '🌫',  description: 'Hard to see enemies.',             movementMult: 0.95, damageMult: 1.0,  gatherMult: 1.0,  visibilityMult: 0.4  },
  wind:     { name: 'Wind',    icon: '💨',  description: 'Strong gusts affect movement.',    movementMult: 0.85, damageMult: 1.0,  gatherMult: 1.1,  visibilityMult: 0.85 },
}

let _currentWeather = 'clear'
let _initialized = false

export function initWeatherEffectsSystem(): void {
  if (_initialized) return
  _initialized = true

  window.addEventListener('weather-changed', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    _currentWeather = detail.weather ?? detail.type ?? detail.name ?? 'clear'
  })
}

export function getCurrentWeatherEffect(): WeatherEffect {
  return WEATHER_EFFECTS[_currentWeather] ?? WEATHER_EFFECTS.clear
}

export function getWeatherMovementMult(): number {
  return getCurrentWeatherEffect().movementMult
}

export function getWeatherGatherMult(): number {
  return getCurrentWeatherEffect().gatherMult
}

export function getWeatherDamageMult(): number {
  return getCurrentWeatherEffect().damageMult
}
