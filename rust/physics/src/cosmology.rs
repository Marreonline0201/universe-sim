/// Cosmological timeline: Big Bang → galaxy formation → ISM metallicity enrichment
///
/// Equations used:
///   Friedmann expansion:  H(z) = H₀ √[Ω_m(1+z)³ + Ω_Λ]
///   Lookback time integral (analytic approx)
///   Metallicity enrichment:  Z(t) = Z_max · (1 − exp(−t / τ_enrich))
///   Population III ignition: ~ 200 Myr after Big Bang
///   Galaxy formation:        ~ 1 Gyr after Big Bang (first disk galaxies)

use crate::constants::*;
use crate::rng::Rng;
use crate::types::CosmologySnapshot;

/// Milky Way-like galaxy enrichment time-scale (Gyr) for ISM metallicity
const TAU_ENRICH_GYR: f64 = 4.5;
/// Maximum achievable metallicity Z (solar Z ≈ 0.0142, MW disk can reach ~2× solar)
const Z_MAX: f64 = 0.028;
/// Age of first Population III stars (Myr after Big Bang — JWST observations)
const FIRST_STARS_MYR: f64 = 200.0;
/// Galaxy disk formation epoch (Gyr)
const GALAXY_FORM_GYR: f64 = 1.2;

/// Compute the fraction of the Hubble time elapsed at redshift z.
/// Approximate analytic form valid for flat ΛCDM with Ω_m + Ω_Λ = 1.
pub fn cosmic_age_at_z(z: f64) -> f64 {
    // t(z) ≈ (2/3) · (1/H₀) · (1/√Ω_Λ) · ln[(1 + √(Ω_Λ/Ω_m · (1+z)^{-3})) / √(Ω_Λ/Ω_m · (1+z)^{-3})]
    // Converted from 1/H₀ in Gyr: 1/H₀ = 977.8 / H0_KMS_MPC Gyr
    let h0_inv_gyr = 977.8 / H0_KMS_MPC;
    let x = (OMEGA_LAMBDA / OMEGA_M).sqrt() / (1.0 + z).powf(1.5);
    let t = (2.0 / 3.0) * h0_inv_gyr / OMEGA_LAMBDA.sqrt()
        * ((1.0 + x) / x).ln();
    t.max(1e-6)
}

/// Metallicity Z of the ISM at a given time (Gyr after Big Bang)
/// Uses a one-zone chemical evolution model with instantaneous recycling approx.
pub fn ism_metallicity(time_gyr: f64) -> f64 {
    if time_gyr < GALAXY_FORM_GYR {
        return 1e-4; // pre-galactic: almost pristine, tiny contribution from Pop III
    }
    let dt = time_gyr - GALAXY_FORM_GYR;
    Z_MAX * (1.0 - (-dt / TAU_ENRICH_GYR).exp())
}

/// [Fe/H] in dex relative to solar (Z_sun = 0.0142)
pub fn fe_h_solar(z: f64) -> f64 {
    const Z_SUN: f64 = 0.0142;
    (z / Z_SUN).log10()
}

/// Build the cosmological snapshot for a star that formed at `formation_gyr`
/// (Gyr after the Big Bang).  The seed is used for small stochastic variations
/// around the mean enrichment (galaxy arms, molecular cloud patches, etc.)
pub fn build_snapshot(formation_gyr: f64, rng: &mut Rng) -> CosmologySnapshot {
    let z = ism_metallicity(formation_gyr) * rng.range(0.6, 1.4);
    let z = z.clamp(1e-6, Z_MAX * 1.5);

    CosmologySnapshot {
        universe_age_at_formation_gyr: formation_gyr,
        universe_age_now_gyr: AGE_UNIVERSE_GYR,
        primordial_h_fraction: BBN_H_MASS_FRAC,
        primordial_he4_fraction: BBN_HE4_MASS_FRAC,
        ism_metallicity_z: z,
        fe_h_solar: fe_h_solar(z),
        first_stars_myr: FIRST_STARS_MYR,
        galaxy_formation_gyr: GALAXY_FORM_GYR,
    }
}

/// Pick a realistic system formation time (Gyr after Big Bang).
/// Stars can form from ~1 Gyr to present.  We weight toward 4–10 Gyr (disk peak).
pub fn sample_formation_time(rng: &mut Rng) -> f64 {
    // Gaussian centred at 8 Gyr with σ=3 Gyr, clipped to [1.5, 13.5]
    let t = rng.normal_pos(8.0, 3.0).clamp(1.5, AGE_UNIVERSE_GYR - 0.3);
    t
}
