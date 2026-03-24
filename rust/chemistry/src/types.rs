use serde::{Deserialize, Serialize};

// ── Input ─────────────────────────────────────────────────────────────────────

/// Subset of PlanetDescriptor + TerrainResult needed by chemistry
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChemInput {
    pub mass_mearth:          f64,
    pub radius_rearth:        f64,
    pub surface_gravity_g:    f64,
    pub equilibrium_temp_k:   f64,
    pub in_habitable_zone:    bool,
    pub iron_core_fraction:   f64,
    pub h2o_mass_fraction:    f64,
    pub co2_initial_bar:      f64,
    pub n2_initial_bar:       f64,
    pub so2_initial_bar:      f64,
    /// Star luminosity (solar units) — needed for photodissociation rate
    pub star_luminosity_lsun: f64,
    /// Distance from star (AU) — for UV flux calculation
    pub orbital_radius_au:    f64,
    /// Age of the planetary system today (Gyr)
    pub system_age_gyr:       f64,
    /// Number of volcanic / rift cells from terrain (fraction of total)
    pub volcanic_fraction:    f64,
    /// Ocean area fraction from terrain (0–1)
    pub ocean_fraction:       f64,
}

// ── Output ────────────────────────────────────────────────────────────────────

/// Final atmospheric state at the current age of the system.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AtmosphereResult {
    // ── Atmospheric composition (mole fractions) ──────────────────────────────
    pub n2_fraction:   f64,
    pub o2_fraction:   f64,
    pub co2_fraction:  f64,
    pub h2o_fraction:  f64, // humidity
    pub ar_fraction:   f64,
    pub ch4_fraction:  f64,
    pub so2_fraction:  f64,

    // ── Physical state ────────────────────────────────────────────────────────
    /// Total surface pressure (bar)
    pub surface_pressure_bar: f64,
    /// Mean surface temperature including greenhouse (K)
    pub mean_surface_temp_k: f64,
    /// Whether an ozone layer has formed (O₂ > 1%)
    pub has_ozone_layer: bool,

    // ── Hydrosphere ───────────────────────────────────────────────────────────
    pub ocean_fraction:       f64,
    pub mean_ocean_depth_m:   f64,
    pub ocean_salinity_ppt:   f64, // parts per thousand (Earth = 35 ppt)
    pub ocean_ph:             f64,

    // ── Life ──────────────────────────────────────────────────────────────────
    pub has_life:             bool,
    pub biosphere_age_myr:    f64,
    pub dominant_biome:       String, // "ocean", "temperate", "arid", "frozen", "volcanic"

    // ── Timeline events (for lore / journal display) ──────────────────────────
    pub events: Vec<AtmosphericEvent>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AtmosphericEvent {
    pub time_myr: f64,
    pub event:    String,
}
