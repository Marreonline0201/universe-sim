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

function ramp(ctx: AudioContext, param: AudioParam, value: number, duration: number) {
  param.linearRampToValueAtTime(value, ctx.currentTime + duration)
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
      ramp(this.ctx, this.masterGain.gain, this._masterVolume, 0.05)
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
    ramp(this.ctx, this.windGain.gain, targetGain, 0.1)

    // Modulate bandpass center frequency for tonal variation
    const centerFreq = 400 + Math.sin(this.windLfoPhase * 0.7) * 200
    ramp(this.ctx, this.windBandpass.frequency, centerFreq, 0.1)
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

    ramp(this.ctx, this.rainGain.gain, targetGain, 2.0)  // 2-second crossfade
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

    // Step rhythm tied to movement mode
    let interval: number
    if (state.playerCrouching) {
      interval = 0.75
    } else if (state.playerRunning) {
      interval = 0.38
    } else {
      interval = 0.55
    }

    // Surface transition: track terrain changes, fade in new surface over 3 steps
    if (state.terrainType !== this.lastTerrainType) {
      this.lastTerrainType = state.terrainType
      this.terrainTransitionStep = 0
    }

    this.footstepTimer += dt

    if (this.footstepTimer >= interval) {
      this.footstepTimer -= interval

      // Crossfade volume factor: ramp from 0.33 -> 0.66 -> 1.0 over 3 steps
      const crossfade = this.terrainTransitionStep >= 3
        ? 1.0
        : (this.terrainTransitionStep + 1) / 3

      // Impact weight: scale by mass (default 70 kg) and speed
      const speedFactor = clamp01(state.playerSpeed / 12)  // normalise 0-12 m/s
      const massFactor  = clamp01(state.playerMass / 70)   // normalise to 70 kg base
      const impactScale = 0.6 + (speedFactor * 0.3 + massFactor * 0.1)

      this.playFootstep(state.terrainType, this.footstepLeftFoot, crossfade * impactScale)

      // Alternate feet and advance transition counter
      this.footstepLeftFoot = !this.footstepLeftFoot
      if (this.terrainTransitionStep < 3) this.terrainTransitionStep++
    }
  }

  private playFootstep(terrain: string, leftFoot: boolean, volumeScale: number) {
    if (!this.ctx || !this.masterGain) return

    const now = this.ctx.currentTime
    const noiseBuffer = getNoiseBuffer(this.ctx)
    const offset = Math.random() * (noiseBuffer.duration - 0.15)

    // Spatial panning: left foot pans left, right foot pans right
    const panner = this.ctx.createStereoPanner()
    panner.pan.value = leftFoot ? -0.55 : 0.55

    // Route through panner -> master
    panner.connect(this.masterGain)

    const cleanup = () => {
      try { panner.disconnect() } catch { /* noop */ }
    }

    switch (terrain) {
      case 'grass':
        this.playGrassStep(now, noiseBuffer, offset, volumeScale, panner, cleanup)
        break
      case 'rock':
        this.playRockStep(now, noiseBuffer, offset, volumeScale, panner, cleanup)
        break
      case 'sand':
        this.playSandStep(now, noiseBuffer, offset, volumeScale, panner, cleanup)
        break
      case 'snow':
        this.playSnowStep(now, noiseBuffer, offset, volumeScale, panner, cleanup)
        break
      case 'water':
        this.playWaterStep(now, noiseBuffer, offset, volumeScale, panner, cleanup)
        break
      case 'wood':
        this.playWoodStep(now, noiseBuffer, offset, volumeScale, panner, cleanup)
        break
      default:
        this.playGrassStep(now, noiseBuffer, offset, volumeScale, panner, cleanup)
    }
  }

  // ── Terrain step sounds ──────────────────────────────────────────────────────

  // Grass: two-layer (800 Hz body + 200 Hz thud), slight reverb tail
  private playGrassStep(
    now: number, buf: AudioBuffer, offset: number,
    vol: number, out: AudioNode, cleanup: () => void,
  ) {
    if (!this.ctx) return
    const baseVol = 0.14 * vol

    // Layer 1: mid-frequency body
    const src1 = this.ctx.createBufferSource()
    src1.buffer = buf
    const bp1 = this.ctx.createBiquadFilter()
    bp1.type = 'bandpass'; bp1.frequency.value = 800; bp1.Q.value = 1.2
    const env1 = this.ctx.createGain()
    env1.gain.setValueAtTime(0, now)
    env1.gain.linearRampToValueAtTime(baseVol, now + 0.006)
    env1.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
    src1.connect(bp1); bp1.connect(env1); env1.connect(out)
    src1.start(now, offset, 0.08)

    // Layer 2: low thud
    const src2 = this.ctx.createBufferSource()
    src2.buffer = buf
    const lp2 = this.ctx.createBiquadFilter()
    lp2.type = 'lowpass'; lp2.frequency.value = 200
    const env2 = this.ctx.createGain()
    env2.gain.setValueAtTime(0, now)
    env2.gain.linearRampToValueAtTime(baseVol * 0.6, now + 0.01)
    env2.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
    src2.connect(lp2); lp2.connect(env2); env2.connect(out)
    src2.start(now, offset, 0.13)

    // Reverb tail: very soft high-pass noise fading slowly
    const src3 = this.ctx.createBufferSource()
    src3.buffer = buf
    const hp3 = this.ctx.createBiquadFilter()
    hp3.type = 'highpass'; hp3.frequency.value = 1200
    const env3 = this.ctx.createGain()
    env3.gain.setValueAtTime(0, now + 0.04)
    env3.gain.linearRampToValueAtTime(baseVol * 0.15, now + 0.07)
    env3.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
    src3.connect(hp3); hp3.connect(env3); env3.connect(out)
    src3.start(now, offset, 0.26)

    src3.onended = () => {
      try { src1.disconnect(); bp1.disconnect(); env1.disconnect() } catch { /* noop */ }
      try { src2.disconnect(); lp2.disconnect(); env2.disconnect() } catch { /* noop */ }
      try { src3.disconnect(); hp3.disconnect(); env3.disconnect() } catch { /* noop */ }
      cleanup()
    }
  }

  // Rock/stone: sharp attack 2200 Hz + 1800 Hz, metallic resonance
  private playRockStep(
    now: number, buf: AudioBuffer, offset: number,
    vol: number, out: AudioNode, cleanup: () => void,
  ) {
    if (!this.ctx) return
    const baseVol = 0.16 * vol

    // Sharp high crack
    const src1 = this.ctx.createBufferSource()
    src1.buffer = buf
    const bp1 = this.ctx.createBiquadFilter()
    bp1.type = 'bandpass'; bp1.frequency.value = 2200; bp1.Q.value = 2.5
    const env1 = this.ctx.createGain()
    env1.gain.setValueAtTime(0, now)
    env1.gain.linearRampToValueAtTime(baseVol, now + 0.003)   // very sharp attack
    env1.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
    src1.connect(bp1); bp1.connect(env1); env1.connect(out)
    src1.start(now, offset, 0.06)

    // Metallic resonance at 1800 Hz — delayed slightly, longer ring
    const src2 = this.ctx.createBufferSource()
    src2.buffer = buf
    const bp2 = this.ctx.createBiquadFilter()
    bp2.type = 'bandpass'; bp2.frequency.value = 1800; bp2.Q.value = 8  // narrow = resonant
    const env2 = this.ctx.createGain()
    env2.gain.setValueAtTime(0, now + 0.002)
    env2.gain.linearRampToValueAtTime(baseVol * 0.5, now + 0.01)
    env2.gain.exponentialRampToValueAtTime(0.001, now + 0.18)  // long resonance
    src2.connect(bp2); bp2.connect(env2); env2.connect(out)
    src2.start(now, offset, 0.2)

    src2.onended = () => {
      try { src1.disconnect(); bp1.disconnect(); env1.disconnect() } catch { /* noop */ }
      try { src2.disconnect(); bp2.disconnect(); env2.disconnect() } catch { /* noop */ }
      cleanup()
    }
  }

  // Sand: low 300 Hz + white noise burst, soft attack
  private playSandStep(
    now: number, buf: AudioBuffer, offset: number,
    vol: number, out: AudioNode, cleanup: () => void,
  ) {
    if (!this.ctx) return
    const baseVol = 0.12 * vol

    // Low body thud
    const src1 = this.ctx.createBufferSource()
    src1.buffer = buf
    const lp1 = this.ctx.createBiquadFilter()
    lp1.type = 'lowpass'; lp1.frequency.value = 300
    const env1 = this.ctx.createGain()
    env1.gain.setValueAtTime(0, now)
    env1.gain.linearRampToValueAtTime(baseVol, now + 0.015)   // soft attack
    env1.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
    src1.connect(lp1); lp1.connect(env1); env1.connect(out)
    src1.start(now, offset, 0.11)

    // White noise burst (all freq) — simulates grains scattering
    const src2 = this.ctx.createBufferSource()
    src2.buffer = buf
    const hp2 = this.ctx.createBiquadFilter()
    hp2.type = 'highpass'; hp2.frequency.value = 2000
    const lp2b = this.ctx.createBiquadFilter()
    lp2b.type = 'lowpass'; lp2b.frequency.value = 8000
    const env2 = this.ctx.createGain()
    env2.gain.setValueAtTime(0, now)
    env2.gain.linearRampToValueAtTime(baseVol * 0.3, now + 0.02)
    env2.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
    src2.connect(hp2); hp2.connect(lp2b); lp2b.connect(env2); env2.connect(out)
    src2.start(now, offset, 0.09)

    src2.onended = () => {
      try { src1.disconnect(); lp1.disconnect(); env1.disconnect() } catch { /* noop */ }
      try { src2.disconnect(); hp2.disconnect(); lp2b.disconnect(); env2.disconnect() } catch { /* noop */ }
      cleanup()
    }
  }

  // Snow: 500 Hz muffled + crunch (random pitch ±15%)
  private playSnowStep(
    now: number, buf: AudioBuffer, offset: number,
    vol: number, out: AudioNode, cleanup: () => void,
  ) {
    if (!this.ctx) return
    const baseVol = 0.13 * vol
    const pitchVar = 0.85 + Math.random() * 0.30   // ±15% pitch randomisation

    // Muffled body
    const src1 = this.ctx.createBufferSource()
    src1.buffer = buf
    src1.playbackRate.value = pitchVar
    const lp1 = this.ctx.createBiquadFilter()
    lp1.type = 'lowpass'; lp1.frequency.value = 500
    const env1 = this.ctx.createGain()
    env1.gain.setValueAtTime(0, now)
    env1.gain.linearRampToValueAtTime(baseVol, now + 0.01)
    env1.gain.exponentialRampToValueAtTime(0.001, now + 0.09)
    src1.connect(lp1); lp1.connect(env1); env1.connect(out)
    src1.start(now, offset, 0.1)

    // Crunch: short mid-high burst with own pitch variation
    const src2 = this.ctx.createBufferSource()
    src2.buffer = buf
    src2.playbackRate.value = 0.9 + Math.random() * 0.2
    const bp2 = this.ctx.createBiquadFilter()
    bp2.type = 'bandpass'; bp2.frequency.value = 1400 + Math.random() * 400; bp2.Q.value = 1.5
    const env2 = this.ctx.createGain()
    env2.gain.setValueAtTime(0, now + 0.005)
    env2.gain.linearRampToValueAtTime(baseVol * 0.4, now + 0.015)
    env2.gain.exponentialRampToValueAtTime(0.001, now + 0.055)
    src2.connect(bp2); bp2.connect(env2); env2.connect(out)
    src2.start(now, offset, 0.06)

    src2.onended = () => {
      try { src1.disconnect(); lp1.disconnect(); env1.disconnect() } catch { /* noop */ }
      try { src2.disconnect(); bp2.disconnect(); env2.disconnect() } catch { /* noop */ }
      cleanup()
    }
  }

  // Water/shallow: 600 Hz splash + 400 Hz slosh, stereo pan already applied externally
  private playWaterStep(
    now: number, buf: AudioBuffer, offset: number,
    vol: number, out: AudioNode, cleanup: () => void,
  ) {
    if (!this.ctx) return
    const baseVol = 0.15 * vol

    // Splash: high-freq burst
    const src1 = this.ctx.createBufferSource()
    src1.buffer = buf
    const bp1 = this.ctx.createBiquadFilter()
    bp1.type = 'bandpass'; bp1.frequency.value = 600 + Math.random() * 200; bp1.Q.value = 0.8
    const env1 = this.ctx.createGain()
    env1.gain.setValueAtTime(0, now)
    env1.gain.linearRampToValueAtTime(baseVol, now + 0.008)
    env1.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
    src1.connect(bp1); bp1.connect(env1); env1.connect(out)
    src1.start(now, offset, 0.11)

    // Slosh: low rumble following the splash
    const src2 = this.ctx.createBufferSource()
    src2.buffer = buf
    const lp2 = this.ctx.createBiquadFilter()
    lp2.type = 'lowpass'; lp2.frequency.value = 400
    const env2 = this.ctx.createGain()
    env2.gain.setValueAtTime(0, now + 0.04)
    env2.gain.linearRampToValueAtTime(baseVol * 0.45, now + 0.07)
    env2.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
    src2.connect(lp2); lp2.connect(env2); env2.connect(out)
    src2.start(now, offset, 0.23)

    src2.onended = () => {
      try { src1.disconnect(); bp1.disconnect(); env1.disconnect() } catch { /* noop */ }
      try { src2.disconnect(); lp2.disconnect(); env2.disconnect() } catch { /* noop */ }
      cleanup()
    }
  }

  // Wood: 1100 Hz knock + 900 Hz hollow resonance
  private playWoodStep(
    now: number, buf: AudioBuffer, offset: number,
    vol: number, out: AudioNode, cleanup: () => void,
  ) {
    if (!this.ctx) return
    const baseVol = 0.15 * vol

    // Knock: mid-high transient
    const src1 = this.ctx.createBufferSource()
    src1.buffer = buf
    const bp1 = this.ctx.createBiquadFilter()
    bp1.type = 'bandpass'; bp1.frequency.value = 1100; bp1.Q.value = 2
    const env1 = this.ctx.createGain()
    env1.gain.setValueAtTime(0, now)
    env1.gain.linearRampToValueAtTime(baseVol, now + 0.004)
    env1.gain.exponentialRampToValueAtTime(0.001, now + 0.055)
    src1.connect(bp1); bp1.connect(env1); env1.connect(out)
    src1.start(now, offset, 0.065)

    // Hollow resonance: slightly lower, longer ring
    const src2 = this.ctx.createBufferSource()
    src2.buffer = buf
    const bp2 = this.ctx.createBiquadFilter()
    bp2.type = 'bandpass'; bp2.frequency.value = 900; bp2.Q.value = 5  // narrower = more resonant
    const env2 = this.ctx.createGain()
    env2.gain.setValueAtTime(0, now + 0.003)
    env2.gain.linearRampToValueAtTime(baseVol * 0.55, now + 0.015)
    env2.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
    src2.connect(bp2); bp2.connect(env2); env2.connect(out)
    src2.start(now, offset, 0.16)

    src2.onended = () => {
      try { src1.disconnect(); bp1.disconnect(); env1.disconnect() } catch { /* noop */ }
      try { src2.disconnect(); bp2.disconnect(); env2.disconnect() } catch { /* noop */ }
      cleanup()
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
      ramp(this.ctx, this.oceanGain.gain, 0, 1.0)
      return
    }

    // Distance-based gain
    const distFactor = clamp01(1 - state.oceanDistance / 30)

    // Wave surge LFO: slow sine (0.15 Hz) simulates wave cycle
    this.oceanLfoPhase += dt * 0.15 * Math.PI * 2
    const waveSurge = 0.5 + Math.sin(this.oceanLfoPhase) * 0.5  // 0-1

    const targetGain = distFactor * 0.3 * (0.4 + waveSurge * 0.6)
    ramp(this.ctx, this.oceanGain.gain, targetGain, 0.2)

    // Modulate frequency for tonal variety
    const centerFreq = 300 + Math.sin(this.oceanLfoPhase * 0.5) * 100
    ramp(this.ctx, this.oceanBandpass.frequency, centerFreq, 0.2)
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
