use serde::{Deserialize, Serialize};

// ── Output types — serialised to JSON and consumed by TypeScript ──────────────

/// Top-level result returned by `simulate_stellar_system(seed)`
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StellarSystemResult {
    /// World generation seed
    pub seed: u64,
    /// Cosmic context at the moment this star system formed
    pub cosmology: CosmologySnapshot,
    /// The host star
    pub star: StarDescriptor,
    /// All planets in the system (inner → outer)
    pub planets: Vec<PlanetDescriptor>,
    /// Index into `planets` of the most habitable rocky world (None if none)
    pub habitable_planet_index: Option<usize>,
    /// Game-world planet (habitable_planet_index or best rocky candidate)
    pub game_planet_index: usize,
}

/// Cosmic state when the star formed
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CosmologySnapshot {
    /// Universe age when this system formed (Gyr)
    pub universe_age_at_formation_gyr: f64,
    /// Current universe age (Gyr)
    pub universe_age_now_gyr: f64,
    /// Primordial H mass fraction (BBN)
    pub primordial_h_fraction: f64,
    /// Primordial He-4 mass fraction (BBN)
    pub primordial_he4_fraction: f64,
    /// ISM metallicity Z (metals mass fraction) at system formation
    pub ism_metallicity_z: f64,
    /// [Fe/H] relative to solar (dex)
    pub fe_h_solar: f64,
    /// Approximate age when first Population III stars lit up (Myr)
    pub first_stars_myr: f64,
    /// Galaxy formation epoch (Gyr after Big Bang)
    pub galaxy_formation_gyr: f64,
}

/// Host star properties
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StarDescriptor {
    /// Mass in solar masses
    pub mass_msun: f64,
    /// Radius in solar radii
    pub radius_rsun: f64,
    /// Luminosity in solar luminosities
    pub luminosity_lsun: f64,
    /// Effective surface temperature (K)
    pub surface_temp_k: f64,
    /// Morgan–Keenan spectral class string (e.g. "G2V")
    pub spectral_class: String,
    /// Current age (Gyr)
    pub age_gyr: f64,
    /// Total main-sequence lifetime (Gyr)
    pub main_seq_lifetime_gyr: f64,
    /// Inner edge of classical habitable zone (AU)
    pub hz_inner_au: f64,
    /// Outer edge of classical habitable zone (AU)
    pub hz_outer_au: f64,
    /// Water-ice condensation snow line (AU)
    pub snow_line_au: f64,
    /// Elemental abundances recycled into ISM at end of stellar life
    pub nucleosynthesis_yields: ElementalAbundances,
}

/// Elemental mass fractions (sum ≤ 1)
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ElementalAbundances {
    pub h:   f64,
    pub he:  f64,
    pub c:   f64,
    pub n:   f64,
    pub o:   f64,
    pub ne:  f64,
    pub mg:  f64,
    pub si:  f64,
    pub s:   f64,
    pub ca:  f64,
    pub fe:  f64,
    pub ni:  f64,
    pub other: f64,
}

/// Classification of a planet
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum PlanetType {
    /// M < 2 M⊕, rocky, no substantial H/He envelope
    Rocky,
    /// 2–10 M⊕, may retain thin to moderate H/He
    SuperEarth,
    /// Large water fraction, 0.1–10 M⊕
    OceanWorld,
    /// Small icy body, M < 0.1 M⊕
    IcyDwarf,
    /// M > 10 M⊕, mostly H/He, beyond snow line
    GasGiant,
    /// Ice/rock giant, 10–50 M⊕, high water/methane
    IceGiant,
    /// Gas giant inside 0.1 AU (migration)
    HotJupiter,
}

/// Per-planet descriptor — sufficient for terrain and chemistry crates
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlanetDescriptor {
    pub index: usize,
    /// Semi-major axis (AU)
    pub orbital_radius_au: f64,
    /// Orbital period (yr)
    pub orbital_period_yr: f64,
    /// Mass (Earth masses)
    pub mass_mearth: f64,
    /// Radius (Earth radii)
    pub radius_rearth: f64,
    /// Surface gravity (m s⁻²)
    pub surface_gravity_ms2: f64,
    /// Surface gravity (Earth g)
    pub surface_gravity_g: f64,
    pub planet_type: PlanetType,
    /// Bond-albedo-corrected equilibrium temperature (K)
    pub equilibrium_temp_k: f64,
    /// Bond albedo used
    pub albedo: f64,
    /// True if orbital radius falls within stellar HZ
    pub in_habitable_zone: bool,
    /// Has a significant dipolar magnetic field (> 0.1 × Earth)
    pub has_magnetosphere: bool,

    // ── Bulk interior composition (mass fractions) ───────────────────────────
    /// Iron-nickel core fraction
    pub iron_core_fraction: f64,
    /// Silicate (Mg, Si, O) mantle fraction
    pub silicate_mantle_fraction: f64,
    /// Water-ice / hydrosphere fraction
    pub water_ice_fraction: f64,
    /// Refractory carbon & graphite fraction
    pub carbon_fraction: f64,

    // ── Initial volatile inventory (before geology/chemistry) ────────────────
    /// H₂O as fraction of planet mass
    pub h2o_mass_fraction: f64,
    /// If all CO₂ outgassed instantly, pressure in bar
    pub co2_initial_bar: f64,
    /// N₂ atmospheric budget (bar)
    pub n2_initial_bar: f64,
    /// Volcanic SO₂ (bar equivalent)
    pub so2_initial_bar: f64,

    // ── Mineral availability (0–1 normalised, feeds in-game deposit density) ──
    pub mineral_abundance: MineralAbundance,
}

/// Relative mineral availability on this planet (0 = absent, 1 = Earth-normal, >1 = enriched)
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct MineralAbundance {
    pub iron:      f64,
    pub copper:    f64,
    pub tin:       f64,
    pub gold:      f64,
    pub silver:    f64,
    pub coal:      f64,
    pub sulfur:    f64,
    pub saltpeter: f64,
    pub uranium:   f64,
    pub silicon:   f64,
    pub limestone: f64,
}
