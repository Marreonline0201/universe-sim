mod rng;
mod types;
mod tectonics;
mod erosion;
mod rivers;
mod minerals;

use wasm_bindgen::prelude::*;
use types::{Cell, PlanetInput, TerrainResult, biome};
use tectonics::GRID;

#[cfg(target_arch = "wasm32")]
fn init_panic_hook() { console_error_panic_hook::set_once(); }
#[cfg(not(target_arch = "wasm32"))]
fn init_panic_hook() {}

// ── Public WASM API ──────────────────────────────────────────────────────────

/// Run the full terrain pipeline from a planet descriptor JSON (from physics crate).
/// Returns a `TerrainResult` JSON string (heightmap excluded — fetch that separately).
/// This call is the slow one (~300-800 ms depending on hardware).  Call once at world init.
#[wasm_bindgen]
pub fn simulate_terrain(planet_json: &str, seed: u64) -> String {
    init_panic_hook();
    let result = run_pipeline(planet_json, seed);
    serde_json::to_string(&result).expect("serialisation failed")
}

/// Return the flat heightmap as a `Float32Array` (size² floats, values in metres).
/// Call this after `simulate_terrain` if you need the raw elevation data for rendering.
#[wasm_bindgen]
pub fn get_heightmap(planet_json: &str, seed: u64) -> Vec<f32> {
    init_panic_hook();
    run_pipeline(planet_json, seed).heightmap
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

fn run_pipeline(planet_json: &str, seed: u64) -> TerrainResult {
    let planet: PlanetInput =
        serde_json::from_str(planet_json).expect("invalid planet JSON");

    let mut rng = rng::Rng::new(seed);

    // Scale planet modifiers
    // Heavier gravity → thicker crust, more mountains; hotter → more volcanic activity
    let g_factor     = planet.surface_gravity_g.clamp(0.3, 2.5) as f32;
    let hot_planet   = planet.equilibrium_temp_k > 400.0;

    // ── 1. Initialise grid ────────────────────────────────────────────────────
    let mut grid: Vec<Cell> = vec![Cell::default(); GRID * GRID];

    // ── 2. Generate plates ────────────────────────────────────────────────────
    let mut plates = tectonics::generate_plates(&mut rng);
    tectonics::assign_plates(&mut grid, &mut plates);

    // ── 3. Tectonic simulation (geological timescale) ─────────────────────────
    let mut sim_rng = rng.fork(0xB00B_5);
    tectonics::run_simulation(&mut grid, &plates, &mut sim_rng);

    // ── 4. Compute elevations from isostasy ───────────────────────────────────
    tectonics::compute_elevations(&mut grid);

    // ── 5. Smooth plate-boundary artefacts ───────────────────────────────────
    tectonics::smooth_elevations(&mut grid, 6);

    // ── 6. Hydraulic erosion + detail noise ──────────────────────────────────
    let mut ero_rng = rng.fork(0xCAFE_BABE);
    erosion::run_erosion(&mut grid, &mut ero_rng);

    // ── 7. Scale elevation by planetary gravity (heavier → less relief) ───────
    // On a planet with 2g, isostatic compensation reduces relief by ~50%.
    let relief_scale = 1.0 / g_factor.sqrt();
    for cell in grid.iter_mut() {
        cell.elevation_m *= relief_scale;
        // Boost volcanic activity on hot planets
        if hot_planet && cell.volcanic_arc {
            cell.elevation_m += 400.0;
        }
    }

    // ── 8. River extraction ───────────────────────────────────────────────────
    let elev: Vec<f32> = grid.iter().map(|c| c.elevation_m).collect();
    let rivers_raw = rivers::extract_rivers(&elev);

    // ── 9. Upsample to output size (512×512) ──────────────────────────────────
    let out_size = 512usize;
    let heightmap = upsample(&elev, GRID, out_size);

    // ── 10. Biome map ─────────────────────────────────────────────────────────
    let biome_map = compute_biome_map(&grid, &elev, planet.equilibrium_temp_k as f32);

    // ── 11. Mineral map ───────────────────────────────────────────────────────
    let river_mask = minerals::river_adjacency_mask(&rivers_raw);
    let mut min_rng = rng.fork(0xFEED_FACE);
    let mineral_map = minerals::build_mineral_map(
        &grid, &elev, &river_mask, &planet.mineral_abundance, &mut min_rng,
    );

    // ── 12. Collect diagnostic data ───────────────────────────────────────────
    let volcanic_cells: Vec<u32> = (0..GRID * GRID)
        .filter(|&i| grid[i].volcanic_arc)
        .map(|i| i as u32)
        .collect();
    let rift_cells: Vec<u32> = (0..GRID * GRID)
        .filter(|&i| grid[i].rift_zone)
        .map(|i| i as u32)
        .collect();
    let plate_map: Vec<u8> = grid.iter().map(|c| c.plate_id).collect();

    let elev_min = elev.iter().cloned().fold(f32::INFINITY, f32::min);
    let elev_max = elev.iter().cloned().fold(f32::NEG_INFINITY, f32::max);

    let planet_radius_m = planet.radius_rearth * 6.371e6;

    TerrainResult {
        size: out_size,
        heightmap,
        elevation_min_m: elev_min,
        elevation_max_m: elev_max,
        biome_map,
        mineral_map,
        plate_map,
        volcanic_cells,
        rift_cells,
        rivers: rivers_raw,
        planet_radius_m,
        surface_gravity_g: planet.surface_gravity_g,
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Bilinear upsample from src_size×src_size to dst_size×dst_size.
fn upsample(src: &[f32], src_size: usize, dst_size: usize) -> Vec<f32> {
    let mut dst = vec![0.0f32; dst_size * dst_size];
    let scale = (src_size - 1) as f32 / (dst_size - 1) as f32;
    for di in 0..dst_size {
        for dj in 0..dst_size {
            let si_f = di as f32 * scale;
            let sj_f = dj as f32 * scale;
            let si0 = (si_f as usize).min(src_size - 2);
            let sj0 = (sj_f as usize).min(src_size - 2);
            let ti = si_f - si0 as f32;
            let tj = sj_f - sj0 as f32;
            let v00 = src[si0 * src_size + sj0];
            let v10 = src[(si0 + 1) * src_size + sj0];
            let v01 = src[si0 * src_size + (sj0 + 1)];
            let v11 = src[(si0 + 1) * src_size + (sj0 + 1)];
            dst[di * dst_size + dj] =
                v00 * (1.0 - ti) * (1.0 - tj)
                + v10 * ti * (1.0 - tj)
                + v01 * (1.0 - ti) * tj
                + v11 * ti * tj;
        }
    }
    dst
}

/// Assign biome IDs from elevation + latitude + temperature.
fn compute_biome_map(grid: &[Cell], elev: &[f32], planet_temp_k: f32) -> Vec<u8> {
    let mut out = vec![biome::PLAINS; GRID * GRID];
    let base_temp_c = planet_temp_k - 273.15;

    for i in 0..GRID {
        for j in 0..GRID {
            let flat  = idx_local(i, j);
            let h     = elev[flat];
            let lat   = -90.0 + (i as f32 / (GRID - 1) as f32) * 180.0;
            let cell  = &grid[flat];
            let lat_a = lat.abs();

            out[flat] = if h < -500.0 {
                biome::DEEP_OCEAN
            } else if h < -50.0 {
                biome::SHALLOW_OCEAN
            } else if h < 30.0 {
                biome::BEACH
            } else if cell.volcanic_arc && h > 500.0 {
                biome::VOLCANIC
            } else if cell.rift_zone && h < 100.0 {
                biome::RIFT
            } else if h > 3_200.0 {
                biome::SNOW_CAP
            } else if h > 2_000.0 {
                biome::MOUNTAIN
            } else if lat_a > 65.0 || base_temp_c < -15.0 {
                biome::TUNDRA
            } else if lat_a > 50.0 {
                biome::TAIGA
            } else if lat_a < 15.0 {
                biome::TROPICAL
            } else if lat_a < 35.0 && h < 300.0 {
                biome::DESERT   // subtropical desert belt
            } else if lat_a < 20.0 && h < 600.0 {
                biome::SAVANNA
            } else {
                biome::FOREST
            };
        }
    }
    out
}

fn idx_local(i: usize, j: usize) -> usize { i * GRID + j }
