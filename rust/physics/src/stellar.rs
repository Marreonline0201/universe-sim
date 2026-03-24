/// Stellar formation and main-sequence properties.
///
/// Physical relations used:
///   Main-sequence:
///     L = L_sun · (M/M_sun)^3.5         (Eddington/mass-luminosity)
///     R = R_sun · (M/M_sun)^0.80        (empirical MS radius)
///     T_eff = T_sun · (M/M_sun)^0.505   (Stefan-Boltzmann + above)
///     τ_MS = τ_sun · (M/M_sun)^{-2.5}   (fuel / luminosity)
///
///   Initial Mass Function: Kroupa (2001) broken power law
///     ξ(M) ∝ M^{-1.3}  for 0.1 ≤ M < 0.5 M_sun
///     ξ(M) ∝ M^{-2.3}  for M ≥ 0.5 M_sun  (≈ Salpeter)
///
///   Stellar nucleosynthesis yields follow Kobayashi et al. 2020 (simplified).
///
///   Habitable zone (Kopparapu 2014):
///     r_inner = sqrt(L / 1.1)  AU
///     r_outer = sqrt(L / 0.53) AU
///
///   Snow line:
///     r_snow  = 2.7 · sqrt(L / L_sun) AU

use crate::constants::*;
use crate::rng::Rng;
use crate::types::{ElementalAbundances, StarDescriptor};

/// Sample stellar mass from Kroupa (2001) IMF.
/// Returns mass in solar masses, range [0.08, 150].
pub fn sample_stellar_mass(rng: &mut Rng) -> f64 {
    // Rejection-sampling between two power-law segments.
    // We bias toward G/K stars (0.5–1.5 M_sun) because the game needs a
    // long-lived star with a habitable zone.  Stars < 0.3 M_sun or > 3 M_sun
    // are rerolled with 70% probability to avoid ultra-short-lived or dim hosts.
    loop {
        let u = rng.f64();
        let m = if u < 0.35 {
            // Low segment: ξ ∝ M^{-1.3}, M ∈ [0.08, 0.5]
            rng.power_law(0.08, 0.5, 1.3)
        } else {
            // High segment: ξ ∝ M^{-2.3}, M ∈ [0.5, 150]
            rng.power_law(0.5, 150.0, 2.3)
        };

        // Bias: reroll very dim or very short-lived stars 70% of the time
        if (m < 0.3 || m > 3.0) && rng.f64() < 0.70 {
            continue;
        }
        return m.clamp(0.08, 150.0);
    }
}

/// Compute luminosity from mass (solar units).
pub fn luminosity(mass_msun: f64) -> f64 {
    mass_msun.powf(MS_LUM_ALPHA)
}

/// Compute radius from mass (solar units).
pub fn radius(mass_msun: f64) -> f64 {
    mass_msun.powf(MS_RAD_BETA)
}

/// Compute effective surface temperature (K).
pub fn surface_temp(mass_msun: f64) -> f64 {
    T_EFF_SUN * mass_msun.powf(MS_TEMP_GAMMA)
}

/// Main-sequence lifetime (Gyr).
pub fn ms_lifetime_gyr(mass_msun: f64) -> f64 {
    TAU_SUN_YR / 1e9 * mass_msun.powf(MS_LIFE_DELTA)
}

/// Inner habitable-zone boundary (AU), Kopparapu 2014 moist-greenhouse limit.
pub fn hz_inner_au(lum_lsun: f64) -> f64 {
    (lum_lsun / HZ_IN_COEFF).sqrt()
}

/// Outer habitable-zone boundary (AU), maximum-greenhouse CO₂ limit.
pub fn hz_outer_au(lum_lsun: f64) -> f64 {
    (lum_lsun / HZ_OUT_COEFF).sqrt()
}

/// Water-ice condensation snow line (AU).
pub fn snow_line_au(lum_lsun: f64) -> f64 {
    SNOW_COEFF * lum_lsun.sqrt()
}

/// MK spectral class string from effective temperature.
pub fn spectral_class(mass_msun: f64, t_eff: f64) -> String {
    let subtype = |t_lo: f64, t_hi: f64| -> u32 {
        let frac = (t_eff - t_lo) / (t_hi - t_lo);
        (9.0 - frac.clamp(0.0, 1.0) * 9.0).round() as u32
    };
    if t_eff >= 30_000.0 {
        format!("O{}V", subtype(30_000.0, 50_000.0))
    } else if t_eff >= 10_000.0 {
        format!("B{}V", subtype(10_000.0, 30_000.0))
    } else if t_eff >= 7_500.0 {
        format!("A{}V", subtype(7_500.0, 10_000.0))
    } else if t_eff >= 6_000.0 {
        format!("F{}V", subtype(6_000.0, 7_500.0))
    } else if t_eff >= 5_200.0 {
        format!("G{}V", subtype(5_200.0, 6_000.0))
    } else if t_eff >= 3_700.0 {
        format!("K{}V", subtype(3_700.0, 5_200.0))
    } else {
        format!("M{}V", subtype(2_400.0, 3_700.0))
    }
}

/// Nucleosynthesis yields returned to the ISM at end of stellar life.
/// Based on simplified Kobayashi et al. 2020 tables (mass-dependent yields).
/// Returns elemental mass fractions relative to total stellar mass.
pub fn nucleosynthesis_yields(mass_msun: f64, metallicity_z: f64) -> ElementalAbundances {
    // All stars return unprocessed envelope to ISM (H + He)
    let processed_frac = if mass_msun < 0.8 {
        0.0 // low-mass stars: negligible yields, still burning
    } else if mass_msun < 8.0 {
        // AGB stars: C/N/O yields via thermal pulses, 3rd dredge-up
        0.25 // ~25% of mass processed through core
    } else {
        // Core-collapse SN: massive stars, α-elements + Fe peak
        0.60
    };

    let p = processed_frac;
    let z_scale = (metallicity_z / 0.0142).sqrt().clamp(0.01, 3.0);

    if mass_msun < 0.8 {
        // Sub-solar mass: not yet evolved off MS, zero yields
        ElementalAbundances {
            h: BBN_H_MASS_FRAC * (1.0 - metallicity_z),
            he: BBN_HE4_MASS_FRAC * (1.0 - metallicity_z),
            ..Default::default()
        }
    } else if mass_msun < 8.0 {
        // Intermediate mass (AGB): C, N, s-process traces
        let c = p * 0.25 * z_scale.min(1.0);
        let n = p * 0.18 * z_scale.min(1.0);
        let o = p * 0.20;
        let env_h   = BBN_H_MASS_FRAC  * (1.0 - p);
        let env_he  = BBN_HE4_MASS_FRAC * (1.0 - p) + p * 0.30;
        ElementalAbundances { h: env_h, he: env_he, c, n, o,
            mg: p * 0.01, si: p * 0.005, s: p * 0.002,
            ca: p * 0.001, fe: p * 0.002,
            ni: p * 0.001, ne: p * 0.015, other: 0.0 }
    } else {
        // Massive star / core-collapse SN: O, Mg, Si, S, Ca, Fe, Ni
        let o  = p * 0.30 * z_scale;
        let mg = p * 0.08 * z_scale;
        let si = p * 0.07 * z_scale;
        let s  = p * 0.04 * z_scale;
        let ca = p * 0.01 * z_scale;
        let fe = if mass_msun > 25.0 { p * 0.04 } else { p * 0.08 };
        let ni = fe * 0.06;
        let c  = p * 0.05;
        let n  = p * 0.02;
        let ne = p * 0.03;
        let env_h  = BBN_H_MASS_FRAC  * (1.0 - p);
        let env_he = BBN_HE4_MASS_FRAC * (1.0 - p) + p * 0.18;
        ElementalAbundances { h: env_h, he: env_he, c, n, o, ne, mg, si, s, ca, fe, ni, other: 0.0 }
    }
}

/// Build the complete `StarDescriptor` from a seed and ISM metallicity.
pub fn build_star(rng: &mut Rng, formation_gyr: f64, metallicity_z: f64) -> StarDescriptor {
    let mass = sample_stellar_mass(rng);
    let lum  = luminosity(mass);
    let rad  = radius(mass);
    let t    = surface_temp(mass);
    let tau  = ms_lifetime_gyr(mass);
    // Current age = universe age now − formation epoch
    let age  = (AGE_UNIVERSE_GYR - formation_gyr).clamp(0.0, tau);

    StarDescriptor {
        mass_msun:            mass,
        radius_rsun:          rad,
        luminosity_lsun:      lum,
        surface_temp_k:       t,
        spectral_class:       spectral_class(mass, t),
        age_gyr:              age,
        main_seq_lifetime_gyr: tau,
        hz_inner_au:          hz_inner_au(lum),
        hz_outer_au:          hz_outer_au(lum),
        snow_line_au:         snow_line_au(lum),
        nucleosynthesis_yields: nucleosynthesis_yields(mass, metallicity_z),
    }
}
