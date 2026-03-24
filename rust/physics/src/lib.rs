mod constants;
mod rng;
mod types;
mod cosmology;
mod stellar;
mod planetary;

use wasm_bindgen::prelude::*;
use types::{StellarSystemResult, PlanetType};

/// Initialise panic → console.error bridge (no-op in non-WASM builds).
#[cfg(target_arch = "wasm32")]
fn init_panic_hook() {
    console_error_panic_hook::set_once();
}
#[cfg(not(target_arch = "wasm32"))]
fn init_panic_hook() {}

/// **Main entry point** — called from TypeScript during world generation.
///
/// Simulates the full pipeline:
///   Big Bang → galaxy → star formation → planetary accretion → planet composition
///
/// Returns a JSON string containing `StellarSystemResult`.
/// Pass this JSON to the terrain and chemistry crates to continue the pipeline.
///
/// # Panics
/// Panics (caught by panic hook → console.error) if serialisation fails.
#[wasm_bindgen]
pub fn simulate_stellar_system(seed: u64) -> String {
    init_panic_hook();

    let mut rng = rng::Rng::new(seed);

    // ── Step 1: Cosmological context ────────────────────────────────────────
    let formation_gyr = cosmology::sample_formation_time(&mut rng);
    let snapshot      = cosmology::build_snapshot(formation_gyr, &mut rng);

    // ── Step 2: Star formation ───────────────────────────────────────────────
    let star = stellar::build_star(&mut rng, formation_gyr, snapshot.ism_metallicity_z);

    // ── Step 3: Planetary system ─────────────────────────────────────────────
    let mut planet_rng = rng.fork(0xDEAD_BEEF_CAFE_BABE);
    let planets = planetary::build_planets(&star, snapshot.ism_metallicity_z, &mut planet_rng);

    // ── Step 4: Identify game world ──────────────────────────────────────────
    let habitable_planet_index = planets.iter().position(|p| {
        p.in_habitable_zone && matches!(p.planet_type, PlanetType::Rocky | PlanetType::SuperEarth)
    });
    let game_planet_index = planetary::select_game_planet(&planets, &star);

    let result = StellarSystemResult {
        seed,
        cosmology: snapshot,
        star,
        planets,
        habitable_planet_index,
        game_planet_index,
    };

    serde_json::to_string(&result).expect("serialisation failed")
}

/// Convenience: return only the game-world `PlanetDescriptor` as JSON.
/// Equivalent to parsing the full result and picking `planets[game_planet_index]`.
#[wasm_bindgen]
pub fn get_game_planet(seed: u64) -> String {
    init_panic_hook();
    let full_json = simulate_stellar_system(seed);
    let result: StellarSystemResult = serde_json::from_str(&full_json)
        .expect("deserialisation failed");
    let planet = &result.planets[result.game_planet_index];
    serde_json::to_string(planet).expect("serialisation failed")
}
