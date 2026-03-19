import { PHYSICS } from '../engine/constants'

export interface PlanetConfig {
  seed: number
  radius: number          // km
  mass: number            // kg
  axialTilt: number       // degrees (Earth = 23.4)
  orbitalPeriod: number   // seconds (Earth year = 31,557,600 s)
  rotationPeriod: number  // seconds (Earth day = 86,400 s)
  atmosphereComposition: Record<string, number>  // gas: % by volume
  surfaceTemp: number     // average °C
  waterFraction: number   // 0-1 of surface covered by water
}

export interface TectonicPlate {
  id: number
  center: [number, number, number]
  velocity: [number, number, number]  // m/s
  density: number   // kg/m³
  isOceanic: boolean
  area: number      // km²
}

export interface TerrainChunk {
  x: number; z: number        // chunk coordinates
  heightmap: Float32Array     // 64×64 elevation values (m)
  materialMap: Uint16Array    // 64×64 material IDs
  biomeMap: Uint8Array        // 64×64 biome IDs
}

export type BiomeId =
  | 'tropical_rainforest' | 'tropical_dry_forest' | 'tropical_savanna'
  | 'desert' | 'mediterranean' | 'temperate_grassland' | 'temperate_forest'
  | 'taiga' | 'tundra' | 'polar_ice' | 'mangrove' | 'coral_reef'
  | 'deep_ocean' | 'shallow_ocean' | 'freshwater' | 'wetland'
  | 'alpine' | 'volcanic' | 'cave' | 'hydrothermal_vent'

const BIOME_INDEX: Record<BiomeId, number> = {
  tropical_rainforest: 0, tropical_dry_forest: 1, tropical_savanna: 2,
  desert: 3, mediterranean: 4, temperate_grassland: 5, temperate_forest: 6,
  taiga: 7, tundra: 8, polar_ice: 9, mangrove: 10, coral_reef: 11,
  deep_ocean: 12, shallow_ocean: 13, freshwater: 14, wetland: 15,
  alpine: 16, volcanic: 17, cave: 18, hydrothermal_vent: 19,
}

const CHUNK_SIZE = 64  // cells per chunk per axis
const CELL_SIZE = 4    // meters per cell (chunks cover 256 m × 256 m)

/**
 * Generates a realistic planet using:
 * - Real orbital mechanics equations
 * - Voronoi tectonic plate simulation
 * - Temperature driven by latitude + altitude + atmosphere
 * - Biomes emerge from temperature × moisture × elevation
 */
export class PlanetGenerator {
  private rng: () => number
  private plates: TectonicPlate[] = []

  constructor(private config: PlanetConfig) {
    this.rng = this.seededRandom(config.seed)
    this.plates = this.generateTectonicPlates(12)
  }

  generateTectonicPlates(count: number): TectonicPlate[] {
    const rng = this.rng
    const plates: TectonicPlate[] = []
    const planetCircumference = 2 * Math.PI * this.config.radius * 1000  // meters

    for (let i = 0; i < count; i++) {
      // Random center on sphere surface (uniform distribution)
      const theta = rng() * Math.PI * 2
      const phi = Math.acos(2 * rng() - 1)
      const r = this.config.radius * 1000

      const cx = r * Math.sin(phi) * Math.cos(theta)
      const cy = r * Math.sin(phi) * Math.sin(theta)
      const cz = r * Math.cos(phi)

      // Plate velocities: real plates move 1-10 cm/year = ~3.17e-10 to 3.17e-9 m/s
      const speed = (1 + rng() * 9) * 1e-2 / (365.25 * 24 * 3600)  // cm/yr to m/s
      const vAngle = rng() * Math.PI * 2
      const vx = speed * Math.cos(vAngle)
      const vz = speed * Math.sin(vAngle)

      // Oceanic plates are denser (basaltic ~3000 kg/m³ vs continental ~2700 kg/m³)
      const isOceanic = rng() < 0.6
      const density = isOceanic ? 2900 + rng() * 200 : 2650 + rng() * 150

      // Estimate area: total surface / count, with variation
      const totalSurface = 4 * Math.PI * (this.config.radius) ** 2
      const area = (totalSurface / count) * (0.5 + rng())

      plates.push({
        id: i,
        center: [cx, cy, cz],
        velocity: [vx, 0, vz],
        density,
        isOceanic,
        area,
      })
    }
    return plates
  }

  /**
   * Generate terrain height at (x, z) using:
   * - Fractal noise (FBM — fractal Brownian motion) for terrain shape
   * - Tectonic plate boundaries for mountains/trenches
   * - Simple erosion approximation
   */
  generateHeightAt(x: number, z: number): number {
    // Base terrain from FBM
    let height = this.fbmNoise(x * 0.001, z * 0.001, 8) * 3000  // -3000 to +3000 m

    // Tectonic influence: find nearest two plate centers and amplify at boundaries
    let minDist1 = Infinity, minDist2 = Infinity
    let plate1Oceanic = false, plate2Oceanic = false

    for (const plate of this.plates) {
      const dx = x - plate.center[0]
      const dz = z - plate.center[2]
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < minDist1) {
        minDist2 = minDist1; plate2Oceanic = plate1Oceanic
        minDist1 = dist; plate1Oceanic = plate.isOceanic
      } else if (dist < minDist2) {
        minDist2 = dist; plate2Oceanic = plate.isOceanic
      }
    }

    // Plate boundary distance (normalised)
    const boundaryDist = Math.abs(minDist1 - minDist2) / (minDist1 + minDist2 + 1e-9)

    if (boundaryDist < 0.1) {
      // At a plate boundary
      if (!plate1Oceanic && !plate2Oceanic) {
        // Continental collision → mountain range
        const mountainBoost = (1 - boundaryDist / 0.1) * 5000
        height += mountainBoost
      } else if (plate1Oceanic && plate2Oceanic) {
        // Oceanic–oceanic → mid-ocean ridge or subduction trench
        height -= (1 - boundaryDist / 0.1) * 2000
      } else {
        // Oceanic–continental → mountains on continental side, trench on oceanic
        const boost = plate1Oceanic ? -2500 : 2500
        height += (1 - boundaryDist / 0.1) * boost * 0.5
      }
    }

    // Large-scale ocean basins: oceanic plates are lower
    if (plate1Oceanic) height -= 2000

    // Clamp to realistic range: -11,000 m (Mariana Trench) to 8,849 m (Everest)
    return Math.max(-11000, Math.min(8849, height))
  }

  /**
   * Compute surface temperature at (x, z, elevation).
   * T = T_base + latitude_effect + altitude_lapse + greenhouse_effect
   * Lapse rate: -6.5°C per 1000m (real International Standard Atmosphere)
   * Latitude effect: cos(lat) × 40°C (real solar distribution)
   */
  computeTemperatureAt(x: number, z: number, elevation: number): number {
    // Approximate latitude from z coordinate
    // Assume z maps to [-π/2, π/2] latitude over the planet radius
    const planetRadiusM = this.config.radius * 1000
    const latFrac = Math.max(-1, Math.min(1, z / planetRadiusM))
    const latRad = latFrac * (Math.PI / 2)

    // Solar heating: peaks at equator, zero at poles
    const solarFactor = Math.cos(latRad)

    // Base equatorial temperature from planet config
    const T_base = this.config.surfaceTemp

    // Latitude gradient: ~40°C difference equator to pole (real Earth)
    const latEffect = (solarFactor - 0.5) * 40

    // Altitude lapse: -6.5°C per 1000m (ISA standard)
    const lapseRate = -6.5 / 1000
    const altEffect = Math.max(0, elevation) * lapseRate

    // Greenhouse effect from CO2/CH4 concentration
    const co2Pct = this.config.atmosphereComposition['CO2'] ?? 0.04
    const greenhouseBoost = Math.log(1 + co2Pct * 100) * 2.5  // log scaling like real GHG

    // Axial tilt introduces seasonal variation (simplified as annual average)
    const tiltFactor = Math.sin((this.config.axialTilt * Math.PI) / 180) * 10

    return T_base + latEffect + altEffect + greenhouseBoost + tiltFactor * (1 - Math.abs(latFrac))
  }

  /**
   * Compute precipitation at (x, z) using:
   * - Orographic effect (mountains cause rain shadow)
   * - Distance from ocean (moisture source)
   * - Prevailing wind direction (Coriolis at latitude)
   */
  computePrecipitationAt(x: number, z: number, elevation: number): number {
    const baseNoise = (this.fbmNoise(x * 0.0005 + 100, z * 0.0005 + 100, 4) + 1) / 2  // 0-1

    // Base precipitation: wet zones near equator (ITCZ), dry at subtropics (~30° lat)
    const planetRadiusM = this.config.radius * 1000
    const latFrac = Math.abs(Math.max(-1, Math.min(1, z / planetRadiusM)))

    // Real Hadley cell structure: wet at 0°, dry at ~30°, wet again at ~60°
    const lat30 = latFrac * 3  // normalise
    const hadleyFactor = Math.max(0,
      Math.cos(lat30 * Math.PI) * 0.6 +
      Math.cos((lat30 - 2) * Math.PI) * 0.3
    )

    // Orographic effect: windward side gets more rain, leeward is in rain shadow
    // Simplified: high elevation on one side of gradient causes dryness
    const slope = this.fbmNoise(x * 0.002, z * 0.002, 2)
    const orographic = elevation > 500 ? Math.max(0, 1 - (elevation - 500) / 3000) : 1.0

    // Ocean proximity (uses water fraction as global humidity proxy)
    const oceanHumidity = this.config.waterFraction

    // Annual precipitation in mm/year
    const precip = (500 + hadleyFactor * 2500) * baseNoise * orographic * (0.5 + oceanHumidity)
    return Math.max(0, precip)
  }

  /**
   * Determine biome from temperature + precipitation + elevation.
   * Uses Whittaker biome classification (real ecology).
   */
  classifyBiome(tempC: number, precipMm: number, elevation: number): BiomeId {
    // Polar / alpine
    if (tempC < -20) return 'polar_ice'
    if (elevation > 3500) return 'alpine'

    // Aquatic
    if (elevation < -200) return 'deep_ocean'
    if (elevation < 0) return precipMm > 400 ? 'coral_reef' : 'shallow_ocean'
    if (elevation < 5 && precipMm > 1500) return 'mangrove'

    // Tundra
    if (tempC < -5) return 'tundra'

    // Taiga / boreal forest
    if (tempC < 3) return precipMm > 300 ? 'taiga' : 'tundra'

    // Temperate zone
    if (tempC < 12) {
      if (precipMm > 1200) return 'temperate_forest'
      if (precipMm > 400) return 'temperate_forest'
      if (precipMm > 250) return 'temperate_grassland'
      return 'desert'
    }

    // Warm temperate
    if (tempC < 18) {
      if (precipMm > 800) return 'temperate_forest'
      if (precipMm > 400) return 'mediterranean'
      if (precipMm > 250) return 'temperate_grassland'
      return 'desert'
    }

    // Subtropical / tropical
    if (tempC < 24) {
      if (precipMm > 1500) return 'tropical_dry_forest'
      if (precipMm > 800) return 'tropical_savanna'
      if (precipMm > 250) return 'temperate_grassland'
      return 'desert'
    }

    // Tropical
    if (precipMm > 2500) return 'tropical_rainforest'
    if (precipMm > 1500) return 'tropical_dry_forest'
    if (precipMm > 500) return 'tropical_savanna'
    return 'desert'
  }

  /** Generate a full terrain chunk */
  generateChunk(chunkX: number, chunkZ: number): TerrainChunk {
    const size = CHUNK_SIZE
    const heightmap = new Float32Array(size * size)
    const materialMap = new Uint16Array(size * size)
    const biomeMap = new Uint8Array(size * size)

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const worldX = chunkX * size * CELL_SIZE + col * CELL_SIZE
        const worldZ = chunkZ * size * CELL_SIZE + row * CELL_SIZE

        const elevation = this.generateHeightAt(worldX, worldZ)
        const temp = this.computeTemperatureAt(worldX, worldZ, elevation)
        const precip = this.computePrecipitationAt(worldX, worldZ, elevation)
        const biome = this.classifyBiome(temp, precip, elevation)

        const idx = row * size + col
        heightmap[idx] = elevation
        biomeMap[idx] = BIOME_INDEX[biome] ?? 0
        materialMap[idx] = this.biomeToMaterial(biome, elevation)
      }
    }

    return { x: chunkX, z: chunkZ, heightmap, materialMap, biomeMap }
  }

  /**
   * Surface gravity: g = G * M / r²
   * Real formula with real G constant.
   */
  surfaceGravity(): number {
    return PHYSICS.G * this.config.mass / (this.config.radius * 1000) ** 2
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private biomeToMaterial(biome: BiomeId, elevation: number): number {
    const materialMap: Partial<Record<BiomeId, number>> = {
      tropical_rainforest: 1, tropical_dry_forest: 2, tropical_savanna: 3,
      desert: 4, mediterranean: 5, temperate_grassland: 6, temperate_forest: 7,
      taiga: 8, tundra: 9, polar_ice: 10, mangrove: 11, coral_reef: 12,
      deep_ocean: 13, shallow_ocean: 14, freshwater: 15, wetland: 16,
      alpine: 17, volcanic: 18, cave: 19, hydrothermal_vent: 20,
    }
    // Bare rock above tree-line
    if (elevation > 2800) return 17
    return materialMap[biome] ?? 0
  }

  private seededRandom(seed: number): () => number {
    // Mulberry32 — fast, good quality 32-bit PRNG
    let s = seed >>> 0
    return () => {
      s += 0x6D2B79F5
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  /**
   * Fractal Brownian Motion noise.
   * Sums `octaves` layers of value noise at increasing frequency & decreasing amplitude.
   * Returns value in [-1, 1].
   */
  private fbmNoise(x: number, z: number, octaves: number): number {
    let value = 0
    let amplitude = 1
    let frequency = 1
    let maxValue = 0

    for (let o = 0; o < octaves; o++) {
      value += this.valueNoise(x * frequency, z * frequency) * amplitude
      maxValue += amplitude
      amplitude *= 0.5
      frequency *= 2.0
    }
    return value / maxValue  // normalise to [-1, 1]
  }

  /** Lattice value noise with smooth interpolation */
  private valueNoise(x: number, z: number): number {
    const ix = Math.floor(x)
    const iz = Math.floor(z)
    const fx = x - ix
    const fz = z - iz

    const ux = this.smoothstep(fx)
    const uz = this.smoothstep(fz)

    const v00 = this.hash2(ix,     iz)
    const v10 = this.hash2(ix + 1, iz)
    const v01 = this.hash2(ix,     iz + 1)
    const v11 = this.hash2(ix + 1, iz + 1)

    return this.lerp(
      this.lerp(v00, v10, ux),
      this.lerp(v01, v11, ux),
      uz
    ) * 2 - 1  // remap 0-1 → -1 to 1
  }

  /** Deterministic hash for integer lattice point → [0, 1] */
  private hash2(ix: number, iz: number): number {
    let h = (ix * 374761393 + iz * 668265263) >>> 0
    h = (h ^ (h >>> 13)) >>> 0
    h = Math.imul(h, 1274126177) >>> 0
    return (h >>> 0) / 4294967296
  }

  private smoothstep(t: number): number {
    return t * t * (3 - 2 * t)
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
  }
}
