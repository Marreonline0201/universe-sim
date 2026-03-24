/// Planetary system formation from a protoplanetary disk.
///
/// Key physics:
///   Disk mass:          M_disk ≈ 0.01 × M_star
///   Planet spacing:     Modified Titius-Bode with stochastic variation
///                       a_n = 0.3 × 2^{n/1.6} AU (+ noise)
///   Planet mass:        Proportional to disk surface density × feeding zone
///   Rocky composition:  Fe fraction decreases with heliocentric distance
///                         (condensation sequence: Fe, FeS, silicates, ices)
///   Equilibrium T:      T_eq = T_star × (R_star / 2a)^{1/2} × (1−A)^{1/4}
///   Radius (rocky):     R/R⊕ = (M/M⊕)^0.27  (Seager 2007)
///   Volatile delivery:  Late Heavy Bombardment from beyond snow line
///   Mineral abundance:  From iron content, siderophile concentrations, and
///                        proximity to snow line / volcanic productivity

use crate::constants::*;
use crate::rng::Rng;
use crate::types::{MineralAbundance, PlanetDescriptor, PlanetType, StarDescriptor};

/// Build the complete planet list for a stellar system.
pub fn build_planets(star: &StarDescriptor, metallicity_z: f64, rng: &mut Rng) -> Vec<PlanetDescriptor> {
    let disk_mass_mearth = star.mass_msun * M_SUN / M_EARTH * DISK_MASS_FRACTION;

    // Number of planets: Poisson-like, mean 6, range [3, 12]
    let n_planets = rng.range(3.0, 13.0).round() as usize;

    // Generate orbital radii using modified Titius-Bode with scatter
    let mut orbital_radii: Vec<f64> = Vec::with_capacity(n_planets);
    let starting_au = rng.range(0.2, 0.5);
    let mut a = starting_au;
    for _ in 0..n_planets {
        orbital_radii.push(a * rng.range(0.85, 1.15)); // ±15% scatter
        a *= rng.range(1.5, 2.2); // Spacing ratio 1.5–2.2× each planet
    }

    // Disk surface density profile: Σ(a) ∝ a^{-1.5} (minimum-mass solar nebula)
    // Normalised so total mass ≈ disk_mass_mearth
    let sigma_norm: f64 = disk_mass_mearth
        / orbital_radii.iter().map(|&a| a.powf(-1.5) * a).sum::<f64>();

    let mut planets = Vec::with_capacity(n_planets);

    for (idx, &a_au) in orbital_radii.iter().enumerate() {
        let snow = star.snow_line_au;
        let inside_snow = a_au < snow;
        let in_hz = a_au >= star.hz_inner_au && a_au <= star.hz_outer_au;

        // ── Planet mass from feeding zone width (~±40% of orbital radius) ──
        let feeding_zone_mearth = sigma_norm * a_au.powf(-1.5) * (0.8 * a_au);
        // Stochastic efficiency: 10%–60% of feeding zone mass accreted
        let base_mass = feeding_zone_mearth * rng.range(0.10, 0.60);
        // Inside snow line: no ice, rocky; outside: can grow to gas giant if > threshold
        let mass_mearth = if inside_snow {
            base_mass.clamp(0.05, 5.0)
        } else {
            // Can accrete gas if mass exceeds ~10 M⊕ (pebble accretion runaway)
            if base_mass > 8.0 {
                base_mass * rng.range(10.0, 300.0) // gas giant
            } else {
                base_mass.clamp(0.05, 15.0)
            }
        };

        // ── Planet type ───────────────────────────────────────────────────────
        let planet_type = classify_planet(mass_mearth, a_au, snow, star.hz_inner_au);

        // ── Interior composition ──────────────────────────────────────────────
        let (fe_core, sil_mantle, water_ice, carbon) =
            bulk_composition(a_au, snow, &planet_type, metallicity_z, rng);

        // ── Radius and gravity ────────────────────────────────────────────────
        let (radius_rearth, surf_grav_ms2) = planet_radius_gravity(mass_mearth, &planet_type);

        // ── Equilibrium temperature ───────────────────────────────────────────
        let albedo = albedo_for_type(&planet_type, in_hz);
        let t_eq = equilibrium_temp(star, a_au, albedo);

        // ── Volatile inventory ────────────────────────────────────────────────
        let (h2o_frac, co2_bar, n2_bar, so2_bar) =
            volatile_inventory(mass_mearth, a_au, snow, &planet_type, t_eq, metallicity_z, rng);

        // ── Magnetosphere ─────────────────────────────────────────────────────
        // Requires: rapidly rotating rocky planet with liquid Fe core
        let has_magnetosphere = matches!(planet_type, PlanetType::Rocky | PlanetType::SuperEarth)
            && fe_core > 0.25
            && mass_mearth > 0.3
            && t_eq < 1_000.0;

        // ── Mineral abundances ────────────────────────────────────────────────
        let minerals = mineral_abundance(a_au, snow, fe_core, metallicity_z, &planet_type, rng);

        planets.push(PlanetDescriptor {
            index: idx,
            orbital_radius_au: a_au,
            orbital_period_yr: orbital_period(a_au, star.mass_msun),
            mass_mearth,
            radius_rearth,
            surface_gravity_ms2: surf_grav_ms2,
            surface_gravity_g:   surf_grav_ms2 / G_EARTH,
            planet_type,
            equilibrium_temp_k:  t_eq,
            albedo,
            in_habitable_zone:   in_hz,
            has_magnetosphere,
            iron_core_fraction:  fe_core,
            silicate_mantle_fraction: sil_mantle,
            water_ice_fraction:  water_ice,
            carbon_fraction:     carbon,
            h2o_mass_fraction:   h2o_frac,
            co2_initial_bar:     co2_bar,
            n2_initial_bar:      n2_bar,
            so2_initial_bar:     so2_bar,
            mineral_abundance:   minerals,
        });
    }

    planets
}

/// Classify a planet from mass, position, and snow line.
fn classify_planet(mass_mearth: f64, a_au: f64, snow_au: f64, hz_inner: f64) -> PlanetType {
    if a_au < 0.15 && mass_mearth > 50.0 {
        return PlanetType::HotJupiter;
    }
    match mass_mearth {
        m if m < 0.12 => PlanetType::IcyDwarf,
        m if m < 2.0  => {
            if a_au > snow_au * 0.8 { PlanetType::OceanWorld } else { PlanetType::Rocky }
        }
        m if m < 10.0 => PlanetType::SuperEarth,
        m if m < 50.0 => {
            if a_au > snow_au { PlanetType::IceGiant } else { PlanetType::SuperEarth }
        }
        _             => PlanetType::GasGiant,
    }
}

/// Interior bulk composition as mass fractions (Fe core, silicate, water/ice, C).
/// Physically: disk condensation sequence as function of disk temperature (∝ 1/a).
fn bulk_composition(
    a_au: f64, snow_au: f64, ptype: &PlanetType, metallicity_z: f64, rng: &mut Rng,
) -> (f64, f64, f64, f64) {
    match ptype {
        PlanetType::GasGiant | PlanetType::IceGiant | PlanetType::HotJupiter => {
            // Mostly H/He envelope; rocky core is ~5-20% by mass
            (0.08, 0.12, 0.05, 0.01)
        }
        _ => {
            // Temperature proxy: T_disk ∝ 1/a^{0.5}; normalise to snow line
            let t_ratio = (snow_au / a_au).sqrt().clamp(0.1, 5.0);

            // Fe fraction: high when disk T is high (inner solar system)
            // Earth: ~32% Fe; Mars: ~25% Fe; Mercury: ~70% Fe
            let fe_base = match a_au {
                a if a < 0.4  => rng.range(0.50, 0.72), // Mercury-like
                a if a < 0.8  => rng.range(0.28, 0.45), // Venus/Earth
                a if a < 1.8  => rng.range(0.22, 0.35), // Earth/Mars
                a if a < snow_au => rng.range(0.15, 0.28),
                _             => rng.range(0.05, 0.15),
            };
            // Scale with metallicity: iron-rich disk → higher core fraction
            let z_scale = (metallicity_z / 0.0142).sqrt().clamp(0.5, 2.0);
            let fe_core  = (fe_base * z_scale).clamp(0.03, 0.75);

            // Water/ice: only condenses beyond the snow line
            let water_ice = if a_au > snow_au * 0.9 {
                rng.range(0.05, 0.40) * (a_au / snow_au).min(3.0)
            } else {
                rng.range(0.0, 0.03) // trace water in rocks
            };

            // Carbon (graphite/carbides): slightly elevated in outer disk
            let carbon = rng.range(0.001, 0.01) * (a_au / 1.5).sqrt().clamp(0.5, 3.0);

            // Silicate = everything remaining
            let sil = (1.0 - fe_core - water_ice - carbon).clamp(0.1, 0.9);

            (fe_core, sil, water_ice, carbon)
        }
    }
}

/// Compute radius (Earth radii) and surface gravity (m/s²).
fn planet_radius_gravity(mass_mearth: f64, ptype: &PlanetType) -> (f64, f64) {
    let radius_rearth = match ptype {
        PlanetType::GasGiant                     => 9.0 + 2.0 * (mass_mearth / 300.0).ln().max(0.0),
        PlanetType::IceGiant                     => 3.5 + (mass_mearth / 15.0).powf(0.4),
        PlanetType::HotJupiter                   => 12.0 + mass_mearth.ln() * 0.5,
        _                                        => mass_mearth.powf(ROCKY_MR_EXP),
    };
    let mass_kg   = mass_mearth * M_EARTH;
    let radius_m  = radius_rearth * R_EARTH;
    let g         = G * mass_kg / (radius_m * radius_m);
    (radius_rearth, g)
}

/// Bond albedo tuned by planet type and HZ membership.
fn albedo_for_type(ptype: &PlanetType, in_hz: bool) -> f64 {
    match ptype {
        PlanetType::Rocky      => if in_hz { 0.30 } else { 0.15 },
        PlanetType::SuperEarth => if in_hz { 0.35 } else { 0.20 },
        PlanetType::OceanWorld => 0.40,
        PlanetType::IcyDwarf   => 0.55,
        PlanetType::GasGiant   => 0.45,
        PlanetType::IceGiant   => 0.40,
        PlanetType::HotJupiter => 0.10,
    }
}

/// Blackbody equilibrium temperature (K).  σ T⁴ = (1-A) L / (16π a²)
/// T_eq = T_star × √(R_star / 2a) × (1-A)^{1/4}
pub fn equilibrium_temp(star: &StarDescriptor, a_au: f64, albedo: f64) -> f64 {
    let r_star_m = star.radius_rsun * R_SUN;
    let a_m      = a_au * AU_M;
    star.surface_temp_k * (r_star_m / (2.0 * a_m)).sqrt() * (1.0 - albedo).powf(0.25)
}

/// Orbital period via Kepler's third law: T² = 4π² a³ / (G M_star)
/// Returns period in years.
pub fn orbital_period(a_au: f64, mass_msun: f64) -> f64 {
    a_au.powf(1.5) / mass_msun.sqrt()
}

/// Volatile inventory (H₂O mass fraction, CO₂/N₂/SO₂ in bar) delivered by
/// late heavy bombardment + primary outgassing.
fn volatile_inventory(
    mass_mearth: f64, a_au: f64, snow_au: f64, ptype: &PlanetType,
    t_eq: f64, metallicity_z: f64, rng: &mut Rng,
) -> (f64, f64, f64, f64) {
    // Non-rocky/super-earth: no surface volatile budget in the usual sense
    if !matches!(ptype, PlanetType::Rocky | PlanetType::SuperEarth | PlanetType::OceanWorld) {
        return (0.0, 0.0, 0.0, 0.0);
    }

    // Water delivery: primarily from cometary bombardment from beyond snow line
    // Decreases exponentially inward from snow line; scales with planet mass
    let water_delivery = if a_au > snow_au {
        rng.range(0.01, 0.05) // formed in water-rich region
    } else {
        let dist_ratio = (a_au / snow_au).clamp(0.01, 1.0);
        // Earth-analog (~0.023% water by mass) near 1 AU / 2.7 AU snow line
        0.0023e-2 * (1.0 - dist_ratio).max(0.0) * rng.range(0.3, 3.0)
    };
    let h2o_frac = (water_delivery * (mass_mearth / 1.0).cbrt()).min(0.1);

    // CO₂: primarily volcanic outgassing; amount scales with interior carbon
    // Normalise: Earth has ~90 bar CO₂ equivalent locked in carbonates
    let co2_bar = 80.0 * (mass_mearth).powf(0.5) * rng.range(0.3, 3.0)
        * (metallicity_z / 0.0142).sqrt();

    // N₂: ~1 bar for Earth-mass; scales mildly with mass
    let n2_bar = 0.78 * mass_mearth.powf(0.4) * rng.range(0.5, 2.0);

    // SO₂: volcanic sourced; higher for tectonically active (rocky, higher gravity)
    let so2_bar = if t_eq < 500.0 {
        0.01 * mass_mearth * rng.range(0.1, 2.0)
    } else {
        0.0
    };

    (h2o_frac, co2_bar, n2_bar, so2_bar)
}

/// Scale mineral abundances from geochemical considerations:
/// - Fe ore:       abundant where iron core fraction is high
/// - Cu/Sn/Au/Ag:  siderophile/chalcophile, moderate at convergent boundaries
/// - Uranium:      lithophile, concentrated in granite, enriched in crustal felsic rock
/// - Sulfur:       elevated near volcanic/back-arc settings
/// - Saltpeter:    arid environments, evaporites
/// - Silicon:      universally abundant in silicate crust
/// - Limestone:    biogenic → only after life, but we budget it from marine carbonate potential
fn mineral_abundance(
    a_au: f64, snow_au: f64, fe_core: f64, metallicity_z: f64,
    ptype: &PlanetType, rng: &mut Rng,
) -> MineralAbundance {
    if !matches!(ptype, PlanetType::Rocky | PlanetType::SuperEarth | PlanetType::OceanWorld) {
        return MineralAbundance::default();
    }

    let z_scale = (metallicity_z / 0.0142).clamp(0.1, 3.0);
    let inner = (1.0 - a_au / snow_au).clamp(0.0, 1.0); // 1 = very inner disk

    MineralAbundance {
        iron:      fe_core / 0.32 * z_scale * rng.range(0.7, 1.3),        // normalised to Earth
        copper:    inner * 1.2 * z_scale * rng.range(0.3, 2.0),
        tin:       inner * 0.8 * z_scale * rng.range(0.2, 1.8),
        gold:      inner * 0.5 * z_scale * rng.range(0.1, 3.0),           // siderophile enrichment
        silver:    inner * 0.6 * z_scale * rng.range(0.2, 2.5),
        coal:      (1.0 - inner).max(0.0) * rng.range(0.0, 1.5),          // organic-rich outer
        sulfur:    (0.5 + inner * 0.5) * z_scale * rng.range(0.5, 2.0),
        saltpeter: rng.range(0.0, 1.2),                                    // independent of position
        uranium:   inner * 2.0 * z_scale * rng.range(0.1, 2.0),           // lithophile, felsic crust
        silicon:   1.0 * rng.range(0.8, 1.2),                             // ubiquitous silicate
        limestone: 0.8 * rng.range(0.4, 1.6),                             // carbonate potential
    }
}

/// Select the "game world" planet index:
/// Prefer rocky HZ world → any HZ world → closest rocky to HZ → first rocky.
pub fn select_game_planet(planets: &[PlanetDescriptor], star: &StarDescriptor) -> usize {
    // 1. Rocky / SuperEarth in the HZ
    if let Some(i) = planets.iter().position(|p| {
        p.in_habitable_zone && matches!(p.planet_type, PlanetType::Rocky | PlanetType::SuperEarth)
    }) {
        return i;
    }
    // 2. Any HZ world
    if let Some(i) = planets.iter().position(|p| p.in_habitable_zone) {
        return i;
    }
    // 3. Closest rocky planet to inner HZ edge
    if let Some(i) = planets.iter().enumerate()
        .filter(|(_, p)| matches!(p.planet_type, PlanetType::Rocky | PlanetType::SuperEarth))
        .min_by(|(_, a), (_, b)| {
            let da = (a.orbital_radius_au - star.hz_inner_au).abs();
            let db = (b.orbital_radius_au - star.hz_inner_au).abs();
            da.partial_cmp(&db).unwrap()
        })
        .map(|(i, _)| i)
    {
        return i;
    }
    // 4. Fallback: first planet
    0
}
