// ── velarStore.ts ──────────────────────────────────────────────────────────────
// M13: Tracks state for the Velar first-contact sequence.
// Decoding state, cinematic overlay, planet probe results.

import { create } from 'zustand'

export interface PlanetProbeResult {
  planetName:  string
  surfaceTemp: number    // Kelvin
  atmosphere:  string   // e.g. "CO2 96%, N2 3%"
  resources:   string[] // e.g. ["iron_ore", "silicate", "frozen_water"]
  discoveredAt: number  // Date.now()
  discoveredBy: string  // playerId
}

interface VelarState {
  // ── Track A: Decoder ─────────────────────────────────────────────────────
  isDecoded:        boolean
  decodedBy:        string | null  // playerId who decoded first
  decodedByName:    string | null
  decodeTimestamp:  number | null

  // Cinematic overlay
  showFirstContact: boolean
  setShowFirstContact: (v: boolean) => void

  // Decode action — called when player completes the DecoderPanel correctly
  markDecoded: (playerId: string, playerName: string) => void

  // ── Track B: Probe results ───────────────────────────────────────────────
  probeResults: Map<string, PlanetProbeResult>  // key = planetName
  addProbeResult: (result: PlanetProbeResult) => void
  getPlanetResult: (name: string) => PlanetProbeResult | undefined

  // ── Track C: Nuclear reactor state ──────────────────────────────────────
  reactorActive:        boolean
  reactorTemp:          number  // Celsius — safe below 600
  reactorMeltdown:      boolean
  reactorMeltdownPos:   [number, number, number] | null
  setReactorActive:     (v: boolean) => void
  tickReactor:          (dt: number, hasWaterCooling: boolean) => void
  triggerMeltdown:      (pos: [number, number, number]) => void
  clearMeltdown:        () => void

  // ── M14 Track B: Velar Response + Gateway ────────────────────────────────
  velarResponseReceived: boolean   // true after VELAR_RESPONSE server message
  gatewayRevealed:       boolean   // true after player decodes all 5 symbols
  gatewayActive:         boolean   // true after Velar Key is used at gateway
  velarWorldSeed:        number    // seed for the Velar World universe instance
  markResponseReceived:  () => void
  markGatewayRevealed:   () => void
  activateGateway:       (velarSeed: number) => void
}

export const useVelarStore = create<VelarState>((set, get) => ({
  isDecoded:       false,
  decodedBy:       null,
  decodedByName:   null,
  decodeTimestamp: null,
  showFirstContact: false,

  setShowFirstContact: (v) => set({ showFirstContact: v }),

  markDecoded: (playerId, playerName) => {
    if (get().isDecoded) return   // first decode wins
    set({
      isDecoded:        true,
      decodedBy:        playerId,
      decodedByName:    playerName,
      decodeTimestamp:  Date.now(),
      showFirstContact: true,
    })
  },

  probeResults: new Map(),
  addProbeResult: (result) => set((s) => {
    const next = new Map(s.probeResults)
    next.set(result.planetName, result)
    return { probeResults: next }
  }),
  getPlanetResult: (name) => get().probeResults.get(name),

  // ── Nuclear reactor ───────────────────────────────────────────────────────
  reactorActive:      false,
  reactorTemp:        20,    // ambient at start
  reactorMeltdown:    false,
  reactorMeltdownPos: null,

  setReactorActive: (v) => set({ reactorActive: v }),

  tickReactor: (dt, hasWaterCooling) => {
    const s = get()
    if (!s.reactorActive || s.reactorMeltdown) return
    // Fission: +40°C/s when active
    // Water cooling: -60°C/s (net -20°C/s when properly cooled)
    // No cooling: net +40°C/s
    const heatRate  = 40
    const coolRate  = hasWaterCooling ? 60 : 0
    const netRate   = heatRate - coolRate
    const nextTemp  = Math.max(20, s.reactorTemp + netRate * dt)
    set({ reactorTemp: nextTemp })
  },

  triggerMeltdown: (pos) => set({
    reactorMeltdown:    true,
    reactorMeltdownPos: pos,
    reactorActive:      false,
  }),

  clearMeltdown: () => set({
    reactorMeltdown:    false,
    reactorMeltdownPos: null,
    reactorTemp:        20,
  }),

  // ── M14 Track B: Velar Response + Gateway ────────────────────────────────
  velarResponseReceived: false,
  gatewayRevealed:       false,
  gatewayActive:         false,
  velarWorldSeed:        0,

  markResponseReceived: () => set({ velarResponseReceived: true }),

  markGatewayRevealed: () => set({ gatewayRevealed: true }),

  activateGateway: (velarSeed) => set({
    gatewayActive:  true,
    velarWorldSeed: velarSeed,
  }),
}))
