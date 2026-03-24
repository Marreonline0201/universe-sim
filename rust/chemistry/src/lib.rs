mod rng;
mod types;
mod atmosphere;

use wasm_bindgen::prelude::*;
use types::{AtmosphericEvent, AtmosphereResult, ChemInput};
use atmosphere::AtmosphereState;

#[cfg(target_arch = "wasm32")]
fn init_panic_hook() { console_error_panic_hook::set_once(); }
#[cfg(not(target_arch = "wasm32"))]
fn init_panic_hook() {}

/// Run the full atmospheric/ocean/biosphere evolution pipeline.
///
/// Accepts `planet_json` (PlanetDescriptor from physics crate, augmented with
/// stellar and terrain data) and `seed`.
/// Returns a JSON `AtmosphereResult` string.
#[wasm_bindgen]
pub fn simulate_atmosphere(planet_json: &str, seed: u64) -> String {
    init_panic_hook();
    let inp: ChemInput = serde_json::from_str(planet_json)
        .expect("invalid ChemInput JSON");
    let mut rng = rng::Rng::new(seed);

    let (mut events, st) = atmosphere::run_atmosphere(&inp, &mut rng);

    // Truncate event log to most important 50 entries
    events.sort_by(|a, b| a.time_myr.partial_cmp(&b.time_myr).unwrap());
    events.dedup_by(|a, b| (a.time_myr - b.time_myr).abs() < 1.0);
    events.truncate(50);

    let total = st.co2 + st.n2 + st.o2 + st.h2o + st.ch4 + st.so2 + st.ar;
    let total = total.max(1e-9);

    let dominant_biome = dominant_biome_str(&st, &inp);
    let ocean_depth = estimate_ocean_depth(&inp, &st);

    let result = AtmosphereResult {
        n2_fraction:           st.n2 / total,
        o2_fraction:           st.o2 / total,
        co2_fraction:          st.co2 / total,
        h2o_fraction:          st.h2o / total,
        ar_fraction:           st.ar / total,
        ch4_fraction:          st.ch4 / total,
        so2_fraction:          st.so2 / total,
        surface_pressure_bar:  total,
        mean_surface_temp_k:   st.t_surf_k,
        has_ozone_layer:       st.o2 > 0.005,
        ocean_fraction:        st.ocean_frac,
        mean_ocean_depth_m:    ocean_depth,
        ocean_salinity_ppt:    estimate_salinity(&inp, &st),
        ocean_ph:              estimate_ph(st.co2, &st),
        has_life:              st.has_life,
        biosphere_age_myr:     st.bio_age_myr,
        dominant_biome,
        events,
    };

    serde_json::to_string(&result).expect("serialisation failed")
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn dominant_biome_str(st: &AtmosphereState, inp: &ChemInput) -> String {
    if st.t_surf_k > 600.0 {
        "volcanic".to_string()
    } else if !st.has_ocean || st.ocean_frac < 0.05 {
        "arid".to_string()
    } else if st.t_surf_k < 250.0 {
        "frozen".to_string()
    } else if st.ocean_frac > 0.70 {
        "ocean".to_string()
    } else if st.has_life && st.o2 > 0.01 {
        "temperate".to_string()
    } else {
        "primordial".to_string()
    }
}

fn estimate_ocean_depth(inp: &ChemInput, st: &AtmosphereState) -> f64 {
    if !st.has_ocean || st.ocean_frac < 0.01 { return 0.0; }
    // Total water mass → volume → spread over ocean fraction of planet surface
    let water_mass_kg = inp.h2o_mass_fraction * inp.mass_mearth * 5.972e24;
    let rho_water = 1_025.0; // kg/m³ seawater
    let water_vol_m3 = water_mass_kg / rho_water;
    let planet_surface_m2 = 4.0 * core::f64::consts::PI
        * (inp.radius_rearth * 6.371e6).powi(2);
    let ocean_area = planet_surface_m2 * st.ocean_frac;
    if ocean_area < 1.0 { return 0.0; }
    (water_vol_m3 / ocean_area).clamp(50.0, 20_000.0)
}

fn estimate_salinity(inp: &ChemInput, st: &AtmosphereState) -> f64 {
    if !st.has_ocean { return 0.0; }
    // Earth: ~35 ppt. Scale with SO2 history (sulfate contribution) and CO2 (carbonate)
    // More volcanic → more solutes → higher salinity
    let base = 35.0 * (inp.volcanic_fraction / 0.05).sqrt().clamp(0.3, 3.0);
    (base + inp.so2_initial_bar * 5.0).clamp(1.0, 120.0)
}

fn estimate_ph(co2_bar: f64, st: &AtmosphereState) -> f64 {
    if !st.has_ocean { return 7.0; }
    // pH ≈ 8.1 (modern Earth) decreases with dissolved CO2
    // pH = 8.1 − 0.3 × log10([CO2_atm] / 400ppm)
    let co2_ppm = (co2_bar * 1e6 / 1.01325).max(1.0);
    let ph = 8.1 - 0.3 * (co2_ppm / 400.0).log10();
    ph.clamp(3.5, 9.5)
}
