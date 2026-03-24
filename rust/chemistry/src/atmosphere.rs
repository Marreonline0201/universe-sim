/// Atmospheric evolution over geological timescales.
///
/// One-zone box model. State vector:
///   [CO2, N2, O2, H2O, CH4, SO2, Ar]  — all in bar
///
/// Key reactions integrated with Euler steps (dt = 0.5 Myr):
///
/// 1. Volcanic outgassing:
///    Sources: CO2, SO2, H2O, N2, Ar from mantle.
///    Rate proportional to tectonic activity × (1 − exp(−t/τ_cool)).
///
/// 2. CO2 silicate weathering (Walker–Hays–Kasting feedback):
///    d[CO2]/dt = −k_w × [CO2] × f(T)  where f(T) = exp((T−T_ref)/13.7 K)
///
/// 3. CO2 carbonate formation (ocean):
///    Rapid sink when ocean present: d[CO2]/dt = −k_carb × [CO2]
///
/// 4. H2O condensation / photodissociation:
///    If T_surf < 373 K: water condenses, removes H2O from atm.
///    UV splitting at D: d[H2O]/dt = −k_uv × [H2O] if no ozone
///
/// 5. Biological O2 production (after abiogenesis + GOE):
///    d[O2]/dt = P_bio − k_ox × [O2]   (photosynthesis − oxidation sink)
///
/// 6. Greenhouse warming:
///    ΔT = f_CO2×log₂([CO2]/280e-6) + f_CH4×log₂([CH4]/700e-9)
///    (Simplified Caldeira/Kasting approximation)

use crate::rng::Rng;
use crate::types::{AtmosphericEvent, AtmosphereResult, ChemInput};

const DT_MYR: f64 = 0.5;                  // integration step (Myr)
const K_W_REF: f64 = 1.0e-4;              // silicate weathering rate constant (bar/Myr at T_ref)
const T_REF: f64 = 288.0;                 // reference temperature K (Earth)
const K_CARB: f64 = 5.0e-4;               // ocean carbonate sink rate (bar/Myr per bar CO2)
const K_UV: f64 = 2.0e-5;                 // UV H2O photodissociation rate (bar/Myr per UV unit)
const K_OX: f64 = 1.0e-3;                 // O2 oxidation sink (bar/Myr per bar O2)
const P_BIO_MODERN: f64 = 2.5e-3;         // modern-Earth-scale O2 photosynthesis flux (bar/Myr)
const GREENHOUSE_CO2_FORCING: f64 = 3.7;  // W/m² per CO2 doubling from 280 ppm
const CLIMATE_SENS: f64 = 3.0;            // K per W/m² forcing (ECS ~ 3 K per doubling)

/// Run the atmospheric evolution model.
/// Integrates from t=0 (planet solidification) to `age_gyr` Gyr.
pub fn run_atmosphere(inp: &ChemInput, rng: &mut Rng) -> (Vec<AtmosphericEvent>, AtmosphereState) {
    let total_myr = inp.system_age_gyr * 1_000.0;
    let n_steps   = (total_myr / DT_MYR) as u64;

    // ── Initial conditions ────────────────────────────────────────────────────
    // Start with a hot, thick volcanic atmosphere (Hadean-like)
    let mut st = AtmosphereState {
        co2:  inp.co2_initial_bar * 0.5, // half has already been sequestered by early rain
        n2:   inp.n2_initial_bar,
        o2:   0.0,
        h2o:  0.0,          // vapour — condensed water in ocean tracked separately
        ch4:  1.0e-6,
        so2:  inp.so2_initial_bar,
        ar:   0.0001,       // Small primordial argon (from K-40 decay, accumulates slowly)
        has_ocean:   false,
        ocean_frac:  0.0,
        t_surf_k:    inp.equilibrium_temp_k,
        has_life:    false,
        bio_age_myr: 0.0,
    };

    // UV flux normalised to Earth = 1.0 (scales with L/L_sun / distance²)
    let uv_flux = (inp.star_luminosity_lsun / (inp.orbital_radius_au * inp.orbital_radius_au))
        .clamp(0.01, 10.0);

    // Volcanic outgassing rate (fraction of initial inventory per Myr)
    // Decays exponentially as the planet cools. Higher tectonic activity → faster.
    let tau_volcanic_myr: f64 = 1_500.0 * (1.0 / inp.volcanic_fraction.clamp(0.01, 1.0).sqrt());

    let mut events: Vec<AtmosphericEvent> = Vec::new();
    let mut ocean_formed_myr: Option<f64> = None;
    let mut life_emerged_myr: Option<f64> = None;
    let mut goe_happened = false;

    for step in 0..n_steps {
        let t_myr = step as f64 * DT_MYR;

        // ── Volcanic outgassing ───────────────────────────────────────────────
        let outgas_rate = (-t_myr / tau_volcanic_myr).exp() * inp.volcanic_fraction;
        // CO2, SO2, H2O, N2 emitted from mantle at current rate
        let co2_emit = 0.005 * outgas_rate * DT_MYR;
        let so2_emit = 0.001 * outgas_rate * DT_MYR;
        let h2o_emit = 0.003 * outgas_rate * DT_MYR;
        let n2_emit  = 0.0002 * outgas_rate * DT_MYR;
        let ar_emit  = 1e-6 * DT_MYR; // K-40 → Ar-40 radiogenic decay

        st.co2 += co2_emit;
        st.so2  = (st.so2 + so2_emit).min(5.0);
        st.h2o += h2o_emit;
        st.n2  += n2_emit;
        st.ar  += ar_emit;

        // ── Surface temperature (greenhouse) ──────────────────────────────────
        let t_surf = compute_temp(st.co2, st.ch4, inp.equilibrium_temp_k);
        st.t_surf_k = t_surf;

        // ── Ocean formation ───────────────────────────────────────────────────
        if t_surf < 373.0 && st.h2o > 0.001 && inp.h2o_mass_fraction > 0.0 {
            if !st.has_ocean {
                st.has_ocean = true;
                st.ocean_frac = (inp.h2o_mass_fraction * inp.mass_mearth * 80.0)
                    .clamp(0.0, 0.85);
                ocean_formed_myr = Some(t_myr);
                events.push(AtmosphericEvent {
                    time_myr: t_myr,
                    event: format!(
                        "Liquid water oceans formed at {:.0} Myr. \
                         Ocean coverage: {:.0}%.",
                        t_myr, st.ocean_frac * 100.0
                    ),
                });
            }
            // Water condenses: atmospheric H2O limited to saturation vapour
            let sat = saturation_bar(t_surf);
            st.h2o = sat;
        } else if t_surf > 647.0 {
            // Beyond critical point: runaway greenhouse (Venus-like)
            st.has_ocean = false;
            st.ocean_frac = 0.0;
        }

        // ── CO2 sinks ─────────────────────────────────────────────────────────
        // Silicate weathering (Walker feedback) — suppressed below 0°C
        if t_surf > 272.0 {
            let fw = K_W_REF * st.co2 * ((t_surf - T_REF) / 13.7).exp().clamp(0.01, 100.0);
            st.co2 = (st.co2 - fw * DT_MYR).max(0.0);
        }
        // Ocean carbonate sequestration
        if st.has_ocean {
            let f_carb = K_CARB * st.co2.min(10.0) * DT_MYR;
            st.co2 = (st.co2 - f_carb).max(0.0);
        }

        // ── SO2 sink (reacts with H2O → H2SO4 rain) ──────────────────────────
        if st.has_ocean {
            st.so2 = (st.so2 * (1.0 - 0.02 * DT_MYR)).max(0.0);
        }

        // ── UV photodissociation of H2O (pre-ozone) ──────────────────────────
        if st.o2 < 0.001 {
            let uv_loss = K_UV * uv_flux * st.h2o * DT_MYR;
            st.h2o = (st.h2o - uv_loss).max(0.0);
            // Hydrogen escapes to space; oxygen accumulates (very slowly)
            st.o2 += uv_loss * 0.5;
        }

        // ── Abiogenesis ───────────────────────────────────────────────────────
        if !st.has_life && st.has_ocean && life_probability(t_myr, inp, &st) > rng.f64() * DT_MYR {
            st.has_life = true;
            st.bio_age_myr = 0.0;
            life_emerged_myr = Some(t_myr);
            events.push(AtmosphericEvent {
                time_myr: t_myr,
                event: format!(
                    "First life emerged at {:.0} Myr. \
                     RNA-world chemistry in hydrothermal environments.",
                    t_myr,
                ),
            });
        }

        if st.has_life {
            st.bio_age_myr += DT_MYR;

            // Early life: anaerobic; methane produced by methanogens
            if st.bio_age_myr < 500.0 {
                st.ch4 = (st.ch4 + 2e-5 * DT_MYR).min(0.05);
            }

            // Great Oxidation Event: cyanobacteria overwhelm O2 sinks after ~1–2 Gyr of life
            let goe_threshold_myr = 1_200.0 * rng.range(0.6, 1.4);
            if !goe_happened && st.bio_age_myr > goe_threshold_myr {
                goe_happened = true;
                events.push(AtmosphericEvent {
                    time_myr: t_myr,
                    event: format!(
                        "Great Oxidation Event at {:.0} Myr. \
                         Cyanobacteria oxidise the atmosphere. O₂ begins rising.",
                        t_myr,
                    ),
                });
            }

            // O2 production by photosynthesis
            if goe_happened {
                let bio_flux = P_BIO_MODERN * (st.bio_age_myr / 2_000.0).min(1.0) * DT_MYR;
                st.o2 = (st.o2 + bio_flux - K_OX * st.o2 * DT_MYR).clamp(0.0, 0.50);
                // CH4 oxidised when O2 appears
                st.ch4 = (st.ch4 - st.o2 * 0.01 * DT_MYR).max(0.0);
            }
        }

        // Periodic milestone events
        if step % (500_000_000 / DT_MYR as u64) == 0 && t_myr > 10.0 {
            record_snapshot(t_myr, &st, &mut events);
        }
    }

    (events, st)
}

pub struct AtmosphereState {
    pub co2:         f64, // bar
    pub n2:          f64,
    pub o2:          f64,
    pub h2o:         f64, // vapour bar
    pub ch4:         f64,
    pub so2:         f64,
    pub ar:          f64,
    pub has_ocean:   bool,
    pub ocean_frac:  f64,
    pub t_surf_k:    f64,
    pub has_life:    bool,
    pub bio_age_myr: f64,
}

/// Mean surface temperature including CO2/CH4 greenhouse warming.
fn compute_temp(co2_bar: f64, ch4_bar: f64, t_eq_k: f64) -> f64 {
    // CO2 forcing: ΔF = 5.35 × ln(C/C_ref)  W/m²  (Myhre 1998)
    let co2_ppm = (co2_bar * 1e6 / 1.01325).max(1e-6); // bar → ppm ≈ rough
    let co2_ref = 280.0; // pre-industrial ppm
    let df_co2  = 5.35 * (co2_ppm / co2_ref).ln().max(-10.0);

    // CH4 simplified
    let ch4_ppb = (ch4_bar * 1e9 / 1.01325).max(1e-9);
    let df_ch4  = 0.036 * (ch4_ppb.sqrt() - 700.0_f64.sqrt()).max(-100.0);

    let df_total = (df_co2 + df_ch4).max(-50.0);
    let delta_t  = CLIMATE_SENS * df_total / GREENHOUSE_CO2_FORCING;

    (t_eq_k + delta_t).clamp(50.0, 1_500.0)
}

/// Water vapour saturation pressure (bar) at temperature T (K).
/// Antoine equation for liquid water, valid 273–373 K.
fn saturation_bar(t_k: f64) -> f64 {
    if t_k < 273.0 { return 0.006 * (-(2_838.0 / t_k).exp()) } // ice Clausius-Clapeyron
    let t_c = t_k - 273.15;
    let log_p = 8.07131 - 1_730.63 / (233.426 + t_c); // Antoine (kPa, log10)
    let p_kpa = 10.0_f64.powf(log_p);
    p_kpa / 100.0 // kPa → bar
}

/// Per-Myr probability that life emerges given current conditions.
fn life_probability(t_myr: f64, inp: &ChemInput, st: &AtmosphereState) -> f64 {
    if !st.has_ocean { return 0.0; }
    if t_myr < 50.0  { return 0.0; } // crust must have solidified

    let temp_ok = st.t_surf_k > 273.0 && st.t_surf_k < 393.0;
    let chem_ok = st.co2 > 0.001; // CO2 needed as carbon source

    if !temp_ok || !chem_ok { return 0.0; }

    // Earth-calibrated: life appeared ~500 Myr after formation
    // Rate such that P(life by 500 Myr) ≈ 0.5 for Earth-like conditions
    let base_rate = 0.000_002; // per Myr
    let hydrothermal_bonus = if inp.volcanic_fraction > 0.05 { 3.0 } else { 1.0 };
    let hz_bonus = if inp.in_habitable_zone { 2.0 } else { 0.2 };

    base_rate * hydrothermal_bonus * hz_bonus
}

fn record_snapshot(t_myr: f64, st: &AtmosphereState, events: &mut Vec<AtmosphericEvent>) {
    events.push(AtmosphericEvent {
        time_myr: t_myr,
        event: format!(
            "{:.0} Myr — Atmosphere: N₂={:.2} bar, O₂={:.3} bar, CO₂={:.4} bar, \
             T_surf={:.0} K, Ocean={}.",
            t_myr, st.n2, st.o2, st.co2, st.t_surf_k,
            if st.has_ocean { "present" } else { "absent" }
        ),
    });
}
