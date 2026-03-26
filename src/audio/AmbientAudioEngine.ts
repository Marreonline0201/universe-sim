// ── AmbientAudioEngine.ts ─────────────────────────────────────────────────────
// M21 Track A: Procedural ambient audio using Web Audio API.
//
// Zero external dependencies — all sounds are procedurally generated from
// oscillators, noise buffers, and filters. No audio files required.
//
// Systems:
//   Wind       — bandpass-filtered white noise, gain = f(windSpeed), LFO gusting
//   Rain       — highpass white noise, gain = f(weatherState), 2s crossfade
//   Thunder    — noise burst + lowpass rumble on lightning flash
//   Footsteps  — short noise bursts triggered by player movement
//   Fire       — random crackle bursts near settlements/campfires
//   Ocean      — LFO-modulated filtered noise near coastline
//
// Lifecycle: init() on first user interaction, update() each frame, dispose() on unmount.
// Browser autoplay policy: AudioContext created in 'suspended' state, resumed on click.

import type { WeatherState } from '../store/weatherStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AudioUpdateState {
  // Weather
  weatherState: WeatherState
  windSpeed: number        // m/s
  windDir: number          // degrees
  lightningActive: boolean
  temperature: number      // C

  // Player
  playerX: number
  playerY: number
  playerZ: number
  playerMoving: boolean
  playerRunning: boolean
  playerCrouching: boolean // crouch = slower step rhythm
  playerGrounded: boolean
  playerElevation: number  // height above sea level
  playerSpeed: number      // m/s — used for step interval + impact weight
  playerMass: number       // kg — default 70; heavier = louder footsteps
  terrainType: 'grass' | 'rock' | 'sand' | 'snow' | 'water' | 'wood'

  // Proximity triggers
  nearFire: boolean        // within 15m of a fire source
  fireDistance: number      // metres to nearest fire
  nearOcean: boolean       // within 30m of coastline
  oceanDistance: number     // metres to sea level shoreline

  // Settlements
  nearSettlement: boolean
  settlementDistance: number
}

// ── White noise buffer (shared, created once) ─────────────────────────────────

let _noiseBuffer: AudioBuffer | null = null

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (_noiseBuffer && _noiseBuffer.sampleRate === ctx.sampleRate) return _noiseBuffer
  const length = ctx.sampleRate * 2  // 2 seconds of noise
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  _noiseBuffer = buffer
  return buffer
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ramp(param: AudioParam, value: number, duration: number) {
  param.linearRampToValueAtTime(value, param.context.currentTime + duration)
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

// ── AmbientAudioEngine ───────────────────────────────────────────────────────

export class AmbientAudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private _masterVolume = 0.5
  private _initialized = false

  // Wind chain: noiseSource -> bandpass -> gain -> master
  private windSource: AudioBufferSourceNode | null = null
  private windBandpass: BiquadFilterNode | null = null
  private windGain: GainNode | null = null
  private windLfoPhase = 0

  // Rain chain: noiseSource -> highpass -> lowpass -> gain -> master
  private rainSource: AudioBufferSourceNode | null = null
  private rainHighpass: BiquadFilterNode | null = null
  private rainLowpass: BiquadFilterNode | null = null
  private rainGain: GainNode | null = null

  // Thunder: triggered on-demand
  private lastLightningActive = false

  // Footsteps: triggered by movement timer
  private footstepTimer = 0
  private lastFootstepTime = 0
  private footstepLeftFoot = true           // alternates L/R for panning
  private lastTerrainType = ''             // for surface transition crossfade
  private terrainTransitionStep = 3        // 0-2: count up to 3 for full new-surface volume

  // Fire: random crackle timer
  private fireTimer = 0

  // Ocean chain: noiseSource -> bandpass -> gain -> master
  private oceanSource: AudioBufferSourceNode | null = null
  private oceanBandpass: BiquadFilterNode | null = null
  private oceanGain: GainNode | null = null
  private oceanLfoPhase = 0

  // ── Init ────────────────────────────────────────────────────────────────────

  init(): boolean {
    if (this._initialized) return true
    try {
      this.ctx = new AudioContext()
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.value = this._masterVolume
      this.masterGain.connect(this.ctx.destination)

      const noiseBuffer = getNoiseBuffer(this.ctx)

      // ── Wind ──────────────────────────────────────────────────────────────
      this.windSource = this.ctx.createBufferSource()
      this.windSource.buffer = noiseBuffer
      this.windSource.loop = true
      this.windBandpass = this.ctx.createBiquadFilter()
      this.windBandpass.type = 'bandpass'
      this.windBandpass.frequency.value = 500
      this.windBandpass.Q.value = 0.8
      this.windGain = this.ctx.createGain()
      this.windGain.gain.value = 0
      this.windSource.connect(this.windBandpass)
      this.windBandpass.connect(this.windGain)
      this.windGain.connect(this.masterGain)
      this.windSource.start()

      // ── Rain ──────────────────────────────────────────────────────────────
      this.rainSource = this.ctx.createBufferSource()
      this.rainSource.buffer = noiseBuffer
      this.rainSource.loop = true
      this.rainHighpass = this.ctx.createBiquadFilter()
      this.rainHighpass.type = 'highpass'
      this.rainHighpass.frequency.value = 3000
      this.rainLowpass = this.ctx.createBiquadFilter()
      this.rainLowpass.type = 'lowpass'
      this.rainLowpass.frequency.value = 8000
      this.rainGain = this.ctx.createGain()
      this.rainGain.gain.value = 0
      this.rainSource.connect(this.rainHighpass)
      this.rainHighpass.connect(this.rainLowpass)
      this.rainLowpass.connect(this.rainGain)
      this.rainGain.connect(this.masterGain)
      this.rainSource.start()

      // ── Ocean ─────────────────────────────────────────────────────────────
      this.oceanSource = this.ctx.createBufferSource()
      this.oceanSource.buffer = noiseBuffer
      this.oceanSource.loop = true
      this.oceanBandpass = this.ctx.createBiquadFilter()
      this.oceanBandpass.type = 'bandpass'
      this.oceanBandpass.frequency.value = 400
      this.oceanBandpass.Q.value = 0.6
      this.oceanGain = this.ctx.createGain()
      this.oceanGain.gain.value = 0
      this.oceanSource.connect(this.oceanBandpass)
      this.oceanBandpass.connect(this.oceanGain)
      this.oceanGain.connect(this.masterGain)
      this.oceanSource.start()

      this._initialized = true

      // Resume if suspended (autoplay policy)
      if (this.ctx.state === 'suspended') {
        this.ctx.resume()
      }

      return true
    } catch {
      console.warn('[AmbientAudio] Web Audio API not available')
      return false
    }
  }

  get initialized() { return this._initialized }

  // ── Volume control ──────────────────────────────────────────────────────────

  setMasterVolume(v: number) {
    this._masterVolume = clamp01(v)
    if (this.masterGain && this.ctx) {
      ramp(this.masterGain.gain, this._masterVolume, 0.05)
    }
  }

  getMasterVolume(): number { return this._masterVolume }

  // ── Per-frame update ────────────────────────────────────────────────────────

  update(state: AudioUpdateState, dt: number) {
    if (!this._initialized || !this.ctx || !this.masterGain) return

    // Resume context if it got suspended
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }

    this.updateWind(state, dt)
    this.updateRain(state)
    this.updateThunder(state)
    this.updateFootsteps(state, dt)
    this.updateFire(state, dt)
    this.updateOcean(state, dt)
  }

  // ── Wind ────────────────────────────────────────────────────────────────────

  private updateWind(state: AudioUpdateState, dt: number) {
    if (!this.windGain || !this.windBandpass || !this.ctx) return

    // Base gain from wind speed (0-15 m/s mapped to 0-0.35)
    const baseGain = clamp01(state.windSpeed / 15) * 0.35

    // LFO gusting effect: slow sine modulation of gain
    this.windLfoPhase += dt * 0.1 * Math.PI * 2  // 0.1 Hz
    const lfoMod = 1 + Math.sin(this.windLfoPhase) * 0.3

    const targetGain = baseGain * lfoMod
    ramp(this.windGain.gain, targetGain, 0.1)

    // Modulate bandpass center frequency for tonal variation
    const centerFreq = 400 + Math.sin(this.windLfoPhase * 0.7) * 200
    ramp(this.windBandpass.frequency, centerFreq, 0.1)
  }

  // ── Rain ────────────────────────────────────────────────────────────────────

  private updateRain(state: AudioUpdateState) {
    if (!this.rainGain || !this.ctx) return

    let targetGain = 0
    if (state.weatherState === 'STORM') targetGain = 0.5
    else if (state.weatherState === 'RAIN') targetGain = 0.25

    // Add snow damping (snow is quieter than rain)
    if (state.temperature < 0 && targetGain > 0) {
      targetGain *= 0.4  // Snow is softer
    }

    ramp(this.rainGain.gain, targetGain, 2.0)  // 2-second crossfade
  }

  // ── Thunder ─────────────────────────────────────────────────────────────────

  private updateThunder(state: AudioUpdateState) {
    if (!this.ctx || !this.masterGain) return

    // Trigger on rising edge of lightningActive
    if (state.lightningActive && !this.lastLightningActive) {
      this.playThunderClap()
    }
    this.lastLightningActive = state.lightningActive
  }

  private playThunderClap() {
    if (!this.ctx || !this.masterGain) return

    const now = this.ctx.currentTime
    const noiseBuffer = getNoiseBuffer(this.ctx)

    // Create a one-shot noise burst
    const source = this.ctx.createBufferSource()
    source.buffer = noiseBuffer
    source.playbackRate.value = 0.8 + Math.random() * 0.4  // pitch randomization

    // Lowpass for rumble
    const lowpass = this.ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 150 + Math.random() * 80
    lowpass.Q.value = 0.7

    // Envelope: sharp attack, long decay
    const envelope = this.ctx.createGain()
    envelope.gain.setValueAtTime(0, now)
    envelope.gain.linearRampToValueAtTime(0.7, now + 0.01)   // 10ms attack
    envelope.gain.linearRampToValueAtTime(0.5, now + 0.2)    // sustain
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 2.0)  // 2s decay

    source.connect(lowpass)
    lowpass.connect(envelope)
    envelope.connect(this.masterGain)

    source.start(now)
    source.stop(now + 2.5)

    // Cleanup
    source.onended = () => {
      source.disconnect()
      lowpass.disconnect()
      envelope.disconnect()
    }
  }

  // ── Footsteps ───────────────────────────────────────────────────────────────

  private updateFootsteps(state: AudioUpdateState, dt: number) {
    if (!this.ctx || !this.masterGain) return
    if (!state.playerMoving || !state.playerGrounded) {
      this.footstepTimer = 0
      return
    }

    const interval = state.playerRunning ? 0.22 : 0.35  // seconds between steps
    this.footstepTimer += dt

    if (this.footstepTimer >= interval) {
      this.footstepTimer -= interval
      this.playFootstep(state.terrainType)
    }
  }

  private playFootstep(terrain: string) {
    if (!this.ctx || !this.masterGain) return

    const now = this.ctx.currentTime
    const noiseBuffer = getNoiseBuffer(this.ctx)

    // Terrain-dependent filter frequency
    const freqMap: Record<string, number> = {
      grass: 800,
      rock: 2200,
      sand: 400,
      snow: 600,
      water: 500,
    }
    const freq = freqMap[terrain] ?? 800

    const source = this.ctx.createBufferSource()
    source.buffer = noiseBuffer
    // Random start offset for variety
    const offset = Math.random() * (noiseBuffer.duration - 0.1)

    const bandpass = this.ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.value = freq + Math.random() * 200 - 100
    bandpass.Q.value = 1.5

    const envelope = this.ctx.createGain()
    envelope.gain.setValueAtTime(0, now)
    envelope.gain.linearRampToValueAtTime(0.15, now + 0.005)  // 5ms attack
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.06)  // 60ms total

    source.connect(bandpass)
    bandpass.connect(envelope)
    envelope.connect(this.masterGain)

    source.start(now, offset, 0.08)

    source.onended = () => {
      source.disconnect()
      bandpass.disconnect()
      envelope.disconnect()
    }
  }

  // ── Fire crackling ──────────────────────────────────────────────────────────

  private updateFire(state: AudioUpdateState, dt: number) {
    if (!this.ctx || !this.masterGain) return
    if (!state.nearFire || state.fireDistance > 15) return

    this.fireTimer += dt
    const nextCrackle = 0.05 + Math.random() * 0.15  // 50-200ms between crackles

    if (this.fireTimer >= nextCrackle) {
      this.fireTimer = 0
      this.playFireCrackle(state.fireDistance)
    }
  }

  private playFireCrackle(distance: number) {
    if (!this.ctx || !this.masterGain) return

    const now = this.ctx.currentTime
    const noiseBuffer = getNoiseBuffer(this.ctx)

    // Distance attenuation (1/r falloff, max at 15m)
    const distGain = clamp01(1 - distance / 15) * 0.12

    const source = this.ctx.createBufferSource()
    source.buffer = noiseBuffer
    const offset = Math.random() * (noiseBuffer.duration - 0.05)

    const bandpass = this.ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 1500 + Math.random() * 2500
    bandpass.Q.value = 2

    const envelope = this.ctx.createGain()
    const duration = 0.005 + Math.random() * 0.01  // 5-15ms burst
    envelope.gain.setValueAtTime(0, now)
    envelope.gain.linearRampToValueAtTime(distGain, now + 0.002)
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.02)

    source.connect(bandpass)
    bandpass.connect(envelope)
    envelope.connect(this.masterGain)

    source.start(now, offset, duration + 0.03)

    source.onended = () => {
      source.disconnect()
      bandpass.disconnect()
      envelope.disconnect()
    }
  }

  // ── Ocean waves ─────────────────────────────────────────────────────────────

  private updateOcean(state: AudioUpdateState, dt: number) {
    if (!this.oceanGain || !this.oceanBandpass || !this.ctx) return

    if (!state.nearOcean || state.oceanDistance > 30) {
      ramp(this.oceanGain.gain, 0, 1.0)
      return
    }

    // Distance-based gain
    const distFactor = clamp01(1 - state.oceanDistance / 30)

    // Wave surge LFO: slow sine (0.15 Hz) simulates wave cycle
    this.oceanLfoPhase += dt * 0.15 * Math.PI * 2
    const waveSurge = 0.5 + Math.sin(this.oceanLfoPhase) * 0.5  // 0-1

    const targetGain = distFactor * 0.3 * (0.4 + waveSurge * 0.6)
    ramp(this.oceanGain.gain, targetGain, 0.2)

    // Modulate frequency for tonal variety
    const centerFreq = 300 + Math.sin(this.oceanLfoPhase * 0.5) * 100
    ramp(this.oceanBandpass.frequency, centerFreq, 0.2)
  }

  // ── Dispose ─────────────────────────────────────────────────────────────────

  dispose() {
    if (this.windSource) { try { this.windSource.stop() } catch { /* noop */ } }
    if (this.rainSource) { try { this.rainSource.stop() } catch { /* noop */ } }
    if (this.oceanSource) { try { this.oceanSource.stop() } catch { /* noop */ } }
    if (this.ctx) { this.ctx.close() }
    this._initialized = false
    this.ctx = null
    this.masterGain = null
    this.windSource = null
    this.rainSource = null
    this.oceanSource = null
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const ambientAudio = new AmbientAudioEngine()
