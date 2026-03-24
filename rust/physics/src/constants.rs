/// Physical constants — NIST CODATA 2018 / IAU 2015 / PDG 2022

// ── Fundamental ─────────────────────────────────────────────────────────────
/// Gravitational constant (m³ kg⁻¹ s⁻²)
pub const G: f64             = 6.674_30e-11;
/// Speed of light in vacuum (m s⁻¹)
pub const C: f64             = 2.997_924_58e8;
/// Boltzmann constant (J K⁻¹)
pub const K_B: f64           = 1.380_649e-23;
/// Planck constant (J s)
pub const H_PLANCK: f64      = 6.626_070_15e-34;
/// Stefan–Boltzmann constant (W m⁻² K⁻⁴)
pub const SIGMA_SB: f64      = 5.670_374_419e-8;
/// Molar gas constant (J mol⁻¹ K⁻¹)
pub const R_GAS: f64         = 8.314_462_618;
/// Avogadro number (mol⁻¹)
pub const N_A: f64           = 6.022_140_76e23;
/// Atomic mass unit (kg)
pub const AMU: f64           = 1.660_539_066_6e-27;

// ── Solar ───────────────────────────────────────────────────────────────────
/// Solar mass (kg)
pub const M_SUN: f64         = 1.989_0e30;
/// Solar radius (m)
pub const R_SUN: f64         = 6.957e8;
/// Solar luminosity (W)
pub const L_SUN: f64         = 3.846e26;
/// Solar effective surface temperature (K)
pub const T_EFF_SUN: f64     = 5_778.0;
/// Solar main-sequence lifetime (yr)
pub const TAU_SUN_YR: f64    = 1.0e10;

// ── Earth ───────────────────────────────────────────────────────────────────
/// Earth mass (kg)
pub const M_EARTH: f64       = 5.972e24;
/// Earth mean radius (m)
pub const R_EARTH: f64       = 6.371e6;
/// Earth surface gravity (m s⁻²)
pub const G_EARTH: f64       = 9.807;

// ── Astronomical ─────────────────────────────────────────────────────────────
/// Astronomical unit (m)
pub const AU_M: f64          = 1.495_978_707e11;
/// Parsec (m)
pub const PC_M: f64          = 3.085_677_581e16;
/// Seconds per Julian year
pub const YR_S: f64          = 3.155_760e7;

// ── Cosmology — Planck 2018 ──────────────────────────────────────────────────
/// Hubble constant today (km s⁻¹ Mpc⁻¹)
pub const H0_KMS_MPC: f64    = 67.4;
/// Matter density parameter Ω_m
pub const OMEGA_M: f64       = 0.315;
/// Dark-energy density parameter Ω_Λ
pub const OMEGA_LAMBDA: f64  = 0.685;
/// CMB temperature today (K)
pub const T_CMB_K: f64       = 2.725_5;
/// Age of the observable universe (Gyr)
pub const AGE_UNIVERSE_GYR: f64 = 13.787;

// ── Big Bang Nucleosynthesis — PDG 2022 ─────────────────────────────────────
/// Primordial hydrogen mass fraction Y_p(H)
pub const BBN_H_MASS_FRAC: f64   = 0.7514;
/// Primordial helium-4 mass fraction Y_p(He4)
pub const BBN_HE4_MASS_FRAC: f64 = 0.2470;
/// Deuterium-to-hydrogen ratio D/H (by number)
pub const BBN_D_OVER_H: f64      = 2.57e-5;
/// Helium-3 mass fraction (relative to H)
pub const BBN_HE3_MASS_FRAC: f64 = 1.0e-5;
/// Lithium-7-to-hydrogen ratio ⁷Li/H (by number)
pub const BBN_LI7_OVER_H: f64    = 4.8e-10;

// ── Stellar physics ──────────────────────────────────────────────────────────
/// Mass-luminosity exponent for main-sequence stars (L ∝ M^ALPHA)
pub const MS_LUM_ALPHA: f64  = 3.5;
/// Mass-radius exponent (R ∝ M^BETA)
pub const MS_RAD_BETA: f64   = 0.80;
/// Mass-temperature exponent (T ∝ M^GAMMA)
pub const MS_TEMP_GAMMA: f64 = 0.505;
/// Mass-lifetime exponent (τ ∝ M^DELTA), τ = τ_sun × M^DELTA
pub const MS_LIFE_DELTA: f64 = -2.5;
/// Salpeter IMF exponent (ξ(M) ∝ M^{-IMF_ALPHA})
pub const SALPETER_ALPHA: f64 = 2.35;

// ── Habitable zone — Kopparapu 2014 ─────────────────────────────────────────
/// Inner HZ: runaway greenhouse L/L_sun → AU²  (inner_au = sqrt(L / HZ_IN))
pub const HZ_IN_COEFF: f64   = 1.1;
/// Outer HZ: maximum greenhouse (outer_au = sqrt(L / HZ_OUT))
pub const HZ_OUT_COEFF: f64  = 0.53;
/// Snow line coefficient: snow_au ≈ SNOW_COEFF × sqrt(L/L_sun)
pub const SNOW_COEFF: f64    = 2.7;

// ── Planet / disk ────────────────────────────────────────────────────────────
/// Fraction of stellar mass in protoplanetary disk
pub const DISK_MASS_FRACTION: f64   = 0.01;
/// Rocky-planet mass–radius exponent (R ∝ M^ROCKY_MR)
pub const ROCKY_MR_EXP: f64        = 0.27;
/// Gas-giant interior scale radius (Jupiter radii, empirical)
pub const GAS_GIANT_R_JUPITER: f64 = 1.0;
