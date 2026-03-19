import type { PlanetConfig } from './PlanetGenerator'

/**
 * WeatherSystem — driven by real atmospheric physics.
 *
 * Grid resolution: GRID_RES × GRID_RES cells, each covering CELL_KM km.
 *
 * Physics references:
 *   - Geostrophic wind: v = (1/ρf) × ∇P   (Holton, Introduction to Dynamic Meteorology)
 *   - Coriolis: f = 2Ω sin(φ)             (Ω = planet angular velocity)
 *   - Adiabatic lapse rate: Γ = g/Cp ≈ 9.8°C/km
 *   - Hadley cell: convection + divergence at ~30° lat
 */

const GRID_RES = 128       // grid cells per axis
const CELL_KM  = 50        // km per cell
const AIR_DENSITY = 1.225  // kg/m³ at sea level (ISA standard)
const CP_AIR    = 1005     // J/(kg·K) specific heat of air at constant pressure

export class WeatherSystem {
  private pressureMap: Float32Array    // Pa, one value per cell
  private temperatureMap: Float32Array // °C, one value per cell
  private windMap: Float32Array        // interleaved (x, z) pairs per cell
  private humidityMap: Float32Array    // 0-1 relative humidity per cell
  private precipMap: Float32Array      // mm/hr instantaneous precipitation

  private readonly N = GRID_RES

  constructor() {
    const size = GRID_RES * GRID_RES
    this.pressureMap    = new Float32Array(size)
    this.temperatureMap = new Float32Array(size)
    this.windMap        = new Float32Array(size * 2)
    this.humidityMap    = new Float32Array(size)
    this.precipMap      = new Float32Array(size)
    this.initAtmosphere()
  }

  /**
   * Advance the weather simulation by dtSim seconds.
   * Higher dtSim (fast time-scale) compresses weather changes.
   */
  tick(dtSim: number, planet: PlanetConfig): void {
    const omega = (2 * Math.PI) / planet.rotationPeriod  // rad/s

    // Clamp to prevent numerical explosion at high time scales
    const dtClamped = Math.min(dtSim, 3600)

    this.updateTemperature(dtClamped, planet)
    this.updatePressure(dtClamped)
    this.updateWind(dtClamped, omega)
    this.updateHumidity(dtClamped, planet)
    this.updatePrecipitation(dtClamped)
  }

  getWindAt(x: number, z: number): [number, number] {
    const [ci, cj] = this.worldToCell(x, z)
    const idx = cj * this.N + ci
    return [this.windMap[idx * 2], this.windMap[idx * 2 + 1]]
  }

  getPrecipitationAt(x: number, z: number): number {
    const [ci, cj] = this.worldToCell(x, z)
    return this.precipMap[cj * this.N + ci]
  }

  getTemperatureAt(x: number, z: number): number {
    const [ci, cj] = this.worldToCell(x, z)
    return this.temperatureMap[cj * this.N + ci]
  }

  getPressureAt(x: number, z: number): number {
    const [ci, cj] = this.worldToCell(x, z)
    return this.pressureMap[cj * this.N + ci]
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private initAtmosphere(): void {
    const N = this.N
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i
        // Latitude fraction: -1 (south pole) to +1 (north pole)
        const latFrac = (j / (N - 1)) * 2 - 1

        // Temperature: warmest at equator (latFrac ≈ 0), cold at poles
        const baseTempC = 15 + Math.cos(latFrac * Math.PI * 0.5) * 35 - Math.abs(latFrac) * 50
        this.temperatureMap[idx] = baseTempC

        // Pressure: standard atmosphere with Hadley-cell high pressure at ~30° lat
        // Real: equatorial low (ITCZ ~1010 hPa), subtropical high (~1020 hPa), polar low
        const hadleyHighLat = 0.33   // normalised ~30° lat
        const pressureAnomaly = Math.cos((Math.abs(latFrac) - hadleyHighLat) * Math.PI) * 500
        this.pressureMap[idx] = 101325 + pressureAnomaly

        // Initial humidity: higher in tropics
        this.humidityMap[idx] = Math.max(0.1, 0.8 - Math.abs(latFrac) * 0.6)

        // Winds initially zero
        this.windMap[idx * 2]     = 0
        this.windMap[idx * 2 + 1] = 0
      }
    }
  }

  private updateTemperature(dt: number, planet: PlanetConfig): void {
    const N = this.N
    const tau = 86400 * 30  // thermal relaxation time ~ 30 days

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i
        const latFrac = (j / (N - 1)) * 2 - 1

        // Target temperature from solar forcing
        const targetT = planet.surfaceTemp + Math.cos(latFrac * Math.PI * 0.5) * 35 - Math.abs(latFrac) * 50

        // Advect heat from wind (upstream differencing)
        const wx = this.windMap[idx * 2]
        const wz = this.windMap[idx * 2 + 1]
        const upI = wx > 0 ? Math.max(0, i - 1) : Math.min(N - 1, i + 1)
        const upJ = wz > 0 ? Math.max(0, j - 1) : Math.min(N - 1, j + 1)
        const upstreamT = this.temperatureMap[upJ * N + upI]
        const advection = -(wx * (this.temperatureMap[idx] - upstreamT) +
                            wz * (this.temperatureMap[idx] - upstreamT)) * dt / (CELL_KM * 1000)

        // Relax toward solar target
        const relaxation = (targetT - this.temperatureMap[idx]) * (dt / tau)

        this.temperatureMap[idx] += advection + relaxation
      }
    }
  }

  private updatePressure(dt: number): void {
    const N = this.N
    const tau = 86400 * 3  // pressure relaxation ~3 days

    // Pressure is driven by temperature (warm air = low pressure)
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i
        const T = this.temperatureMap[idx]
        // Ideal gas pressure anomaly: ΔP ≈ -ρRΔT/M_air
        // Simplified linear coupling
        const targetAnomaly = -(T - 15) * 100  // ~100 Pa per °C
        const currentAnomaly = this.pressureMap[idx] - 101325
        this.pressureMap[idx] += (targetAnomaly - currentAnomaly) * (dt / tau)
      }
    }
  }

  private updateWind(dt: number, omega: number): void {
    const N = this.N
    const cellM = CELL_KM * 1000  // meters per cell

    // Compute pressure gradient force and apply Coriolis
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const idx = j * N + i

        // Pressure gradient (central difference)
        const dPdx = (this.pressureMap[j * N + (i + 1)] - this.pressureMap[j * N + (i - 1)]) / (2 * cellM)
        const dPdz = (this.pressureMap[(j + 1) * N + i] - this.pressureMap[(j - 1) * N + i]) / (2 * cellM)

        // Geostrophic acceleration: a = -(1/ρ) ∇P
        const ax = -dPdx / AIR_DENSITY
        const az = -dPdz / AIR_DENSITY

        // Latitude for Coriolis
        const latFrac = (j / (N - 1)) * 2 - 1
        const latRad = latFrac * (Math.PI / 2)

        // Update wind
        let wx = this.windMap[idx * 2]     + ax * dt
        let wz = this.windMap[idx * 2 + 1] + az * dt

        // Apply Coriolis
        ;[wx, wz] = this.applyCoriolis(wx, wz, latRad, omega)

        // Friction damping (surface drag)
        const frictionFactor = Math.exp(-dt / (86400 * 2))
        this.windMap[idx * 2]     = wx * frictionFactor
        this.windMap[idx * 2 + 1] = wz * frictionFactor
      }
    }
  }

  private updateHumidity(dt: number, planet: PlanetConfig): void {
    const N = this.N
    const evapRate = 0.01 * planet.waterFraction * dt / 86400  // evaporation from surface

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i
        const T = this.temperatureMap[idx]

        // Evaporation: higher in warm, wet areas
        const evap = evapRate * Math.max(0, T / 30)
        // Condensation: humidity above saturation threshold → rain
        const condensation = Math.max(0, this.humidityMap[idx] - 0.95) * 0.1 * dt / 3600

        this.humidityMap[idx] = Math.max(0, Math.min(1,
          this.humidityMap[idx] + evap - condensation
        ))
      }
    }
  }

  private updatePrecipitation(dt: number): void {
    const N = this.N
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i
        const H = this.humidityMap[idx]
        const T = this.temperatureMap[idx]

        // Precipitation forms when humidity > 0.8 and temperature above freezing
        if (H > 0.8) {
          const intensity = (H - 0.8) * 5 * Math.max(0, (T + 10) / 40)
          this.precipMap[idx] = intensity  // mm/hr
        } else {
          this.precipMap[idx] *= Math.exp(-dt / 3600)  // decay
        }
      }
    }
  }

  /**
   * Apply Coriolis effect to wind vector.
   * Coriolis parameter: f = 2Ω sin(φ)
   * Deflection: du/dt = fv, dv/dt = -fu (Northern hemisphere turns right)
   */
  private applyCoriolis(wx: number, wz: number, latRad: number, omega: number): [number, number] {
    const f = 2 * omega * Math.sin(latRad)  // Coriolis parameter (s⁻¹)
    // Small angle approximation for one timestep
    const dt = 1  // normalised; caller scales through wind integration
    const newWx = wx + f * wz * dt
    const newWz = wz - f * wx * dt
    return [newWx, newWz]
  }

  private worldToCell(worldX: number, worldZ: number): [number, number] {
    const cellM = CELL_KM * 1000
    const ci = Math.min(this.N - 1, Math.max(0, Math.floor(worldX / cellM) % this.N))
    const cj = Math.min(this.N - 1, Math.max(0, Math.floor(worldZ / cellM) % this.N))
    return [ci, cj]
  }
}
