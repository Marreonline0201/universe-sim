/**
 * WorldGenPipeline.ts
 *
 * Orchestrates the full Big Bang → planet world generation pipeline:
 *
 *   1. Physics WASM  — cosmology + stellar + planetary formation
 *   2. Terrain WASM  — tectonics + erosion + rivers + minerals
 *   3. Chemistry WASM — atmospheric/ocean/biosphere evolution
 *
 * The three WASM modules are loaded lazily on first call.
 * Results are cached in IndexedDB after first generation so subsequent
 * loads are instant.
 *
 * Usage:
 *   const world = await WorldGenPipeline.generate(seed);
 *   // world.planet, world.terrain, world.atmosphere are now available
 *   // world.terrain.heightmap is a Float32Array (512×512)
 */

import { openDB } from 'idb';

// ── Type re-exports (mirroring the Rust structs) ──────────────────────────────

export interface StellarSystemResult {
  seed: number;
  cosmology: CosmologySnapshot;
  star: StarDescriptor;
  planets: PlanetDescriptor[];
  habitable_planet_index: number | null;
  game_planet_index: number;
}

export interface CosmologySnapshot {
  universe_age_at_formation_gyr: number;
  universe_age_now_gyr: number;
  primordial_h_fraction: number;
  primordial_he4_fraction: number;
  ism_metallicity_z: number;
  fe_h_solar: number;
  first_stars_myr: number;
  galaxy_formation_gyr: number;
}

export interface StarDescriptor {
  mass_msun: number;
  radius_rsun: number;
  luminosity_lsun: number;
  surface_temp_k: number;
  spectral_class: string;
  age_gyr: number;
  main_seq_lifetime_gyr: number;
  hz_inner_au: number;
  hz_outer_au: number;
  snow_line_au: number;
  nucleosynthesis_yields: ElementalAbundances;
}

export interface ElementalAbundances {
  h: number; he: number; c: number; n: number; o: number;
  ne: number; mg: number; si: number; s: number; ca: number;
  fe: number; ni: number; other: number;
}

export interface PlanetDescriptor {
  index: number;
  orbital_radius_au: number;
  orbital_period_yr: number;
  mass_mearth: number;
  radius_rearth: number;
  surface_gravity_ms2: number;
  surface_gravity_g: number;
  planet_type: string;
  equilibrium_temp_k: number;
  albedo: number;
  in_habitable_zone: boolean;
  has_magnetosphere: boolean;
  iron_core_fraction: number;
  silicate_mantle_fraction: number;
  water_ice_fraction: number;
  carbon_fraction: number;
  h2o_mass_fraction: number;
  co2_initial_bar: number;
  n2_initial_bar: number;
  so2_initial_bar: number;
  mineral_abundance: MineralAbundance;
}

export interface MineralAbundance {
  iron: number; copper: number; tin: number; gold: number; silver: number;
  coal: number; sulfur: number; saltpeter: number; uranium: number;
  silicon: number; limestone: number;
}

export interface TerrainDescriptor {
  size: number;
  elevation_min_m: number;
  elevation_max_m: number;
  biome_map: number[];
  mineral_map: number[];
  plate_map: number[];
  volcanic_cells: number[];
  rift_cells: number[];
  rivers: number[][];
  planet_radius_m: number;
  surface_gravity_g: number;
  heightmap?: Float32Array; // populated after get_heightmap() call
}

export interface AtmosphereDescriptor {
  n2_fraction: number;
  o2_fraction: number;
  co2_fraction: number;
  h2o_fraction: number;
  ar_fraction: number;
  ch4_fraction: number;
  so2_fraction: number;
  surface_pressure_bar: number;
  mean_surface_temp_k: number;
  has_ozone_layer: boolean;
  ocean_fraction: number;
  mean_ocean_depth_m: number;
  ocean_salinity_ppt: number;
  ocean_ph: number;
  has_life: boolean;
  biosphere_age_myr: number;
  dominant_biome: string;
  events: { time_myr: number; event: string }[];
}

export interface GeneratedWorld {
  seed: bigint;
  system: StellarSystemResult;
  planet: PlanetDescriptor;
  terrain: TerrainDescriptor;
  atmosphere: AtmosphereDescriptor;
  generatedAt: number; // Date.now()
}

// ── WASM loader ───────────────────────────────────────────────────────────────

type PhysicsWasm = {
  simulate_stellar_system: (seed: bigint) => string;
  get_game_planet: (seed: bigint) => string;
};

type TerrainWasm = {
  simulate_terrain: (planetJson: string, seed: bigint) => string;
  get_heightmap: (planetJson: string, seed: bigint) => Float32Array;
};

type ChemistryWasm = {
  simulate_atmosphere: (planetJson: string, seed: bigint) => string;
};

let _physicsWasm: PhysicsWasm | null = null;
let _terrainWasm: TerrainWasm | null = null;
let _chemistryWasm: ChemistryWasm | null = null;

async function loadPhysics(): Promise<PhysicsWasm> {
  if (_physicsWasm) return _physicsWasm;
  const moduleUrl = '/wasm/physics/universe_physics.js';
  const mod = await import(/* @vite-ignore */ moduleUrl);
  await mod.default(); // init WASM
  _physicsWasm = mod as unknown as PhysicsWasm;
  return _physicsWasm;
}

async function loadTerrain(): Promise<TerrainWasm> {
  if (_terrainWasm) return _terrainWasm;
  const moduleUrl = '/wasm/terrain/universe_terrain.js';
  const mod = await import(/* @vite-ignore */ moduleUrl);
  await mod.default();
  _terrainWasm = mod as unknown as TerrainWasm;
  return _terrainWasm;
}

async function loadChemistry(): Promise<ChemistryWasm> {
  if (_chemistryWasm) return _chemistryWasm;
  const moduleUrl = '/wasm/chemistry/universe_chemistry.js';
  const mod = await import(/* @vite-ignore */ moduleUrl);
  await mod.default();
  _chemistryWasm = mod as unknown as ChemistryWasm;
  return _chemistryWasm;
}

// ── Progress callback ─────────────────────────────────────────────────────────

export type ProgressCallback = (stage: string, pct: number) => void;

// ── Main pipeline ─────────────────────────────────────────────────────────────

const IDB_NAME = 'universe-sim-worldgen';
const IDB_STORE = 'world-gen-cache';

async function getDb() {
  return openDB(IDB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    },
  });
}

export const WorldGenPipeline = {
  /**
   * Generate (or retrieve cached) world for a given numeric seed.
   * The seed should match the server's world seed so all clients see the same world.
   */
  async generate(seed: number | bigint, onProgress?: ProgressCallback): Promise<GeneratedWorld> {
    const bigSeed = BigInt(seed);
    const cacheKey = `world-${bigSeed.toString()}`;

    // ── Step 1: Load all WASM modules in parallel ─────────────────────────────
    onProgress?.('loading WASM modules', 5);
    const [physics, terrain, chemistry] = await Promise.all([
      loadPhysics(),
      loadTerrain(),
      loadChemistry(),
    ]);

    // ── Cache check ───────────────────────────────────────────────────────────
    try {
      const db = await getDb();
      const cached = await db.get(IDB_STORE, cacheKey) as GeneratedWorld | undefined;
      if (cached) {
        // Heightmap is not stored in IndexedDB cache to keep payload compact.
        // Rehydrate it quickly from terrain WASM and return the completed world.
        const planetJson = JSON.stringify(cached.planet);
        const heightmap = terrain.get_heightmap(planetJson, bigSeed);
        cached.terrain.heightmap = heightmap;
        onProgress?.('cache', 100);
        return cached;
      }
    } catch {
      // IndexedDB may not be available (e.g. private browsing)
    }
    // ── Step 2: Stellar system formation ─────────────────────────────────────
    onProgress?.('simulating star formation', 15);
    const systemJson = physics.simulate_stellar_system(bigSeed);
    const system: StellarSystemResult = JSON.parse(systemJson);
    const planet: PlanetDescriptor = system.planets[system.game_planet_index];

    // ── Step 3: Terrain generation ────────────────────────────────────────────
    onProgress?.('running tectonic simulation', 35);
    const planetJson = JSON.stringify(planet);
    const terrainJson = terrain.simulate_terrain(planetJson, bigSeed);
    const terrainDesc: TerrainDescriptor = JSON.parse(terrainJson);

    onProgress?.('extracting heightmap', 65);
    // Heightmap is a separate call to avoid JSON serialising 512×512 floats
    const heightmap: Float32Array = terrain.get_heightmap(planetJson, bigSeed);
    terrainDesc.heightmap = heightmap;

    // ── Step 4: Atmospheric evolution ─────────────────────────────────────────
    onProgress?.('evolving atmosphere', 75);

    // Build ChemInput by augmenting planet descriptor with stellar + terrain data
    const chemInput = {
      ...planet,
      star_luminosity_lsun: system.star.luminosity_lsun,
      orbital_radius_au:    planet.orbital_radius_au,
      system_age_gyr:       system.star.age_gyr,
      volcanic_fraction:    terrainDesc.volcanic_cells.length / (terrainDesc.size * terrainDesc.size),
      ocean_fraction:       terrainDesc.biome_map.filter((b) => b <= 1).length
                            / (terrainDesc.size * terrainDesc.size),
    };
    const atmosphereJson = chemistry.simulate_atmosphere(JSON.stringify(chemInput), bigSeed);
    const atmosphere: AtmosphereDescriptor = JSON.parse(atmosphereJson);

    // ── Assemble result ───────────────────────────────────────────────────────
    onProgress?.('finalising world', 95);
    const world: GeneratedWorld = {
      seed: bigSeed,
      system,
      planet,
      terrain: terrainDesc,
      atmosphere,
      generatedAt: Date.now(),
    };

    // Cache (exclude heavyweight Float32Array from JSON — re-generated on next load)
    try {
      const cachePayload = { ...world, terrain: { ...terrainDesc, heightmap: undefined } };
      const db = await getDb();
      await db.put(IDB_STORE, cachePayload, cacheKey);
    } catch {
      // Non-fatal
    }

    onProgress?.('done', 100);
    return world;
  },

  /** Clear cached world generation data (force re-simulation) */
  async clearCache(seed: number | bigint): Promise<void> {
    const cacheKey = `world-${BigInt(seed).toString()}`;
    try {
      const db = await getDb();
      await db.delete(IDB_STORE, cacheKey);
    } catch { /* noop */ }
  },
};
