/// Tectonic plate simulation on an equirectangular grid.
///
/// Algorithm:
///   1. Generate N_PLATES plates with random seed positions and velocity vectors.
///   2. Assign each grid cell to its nearest plate (spherical great-circle distance).
///   3. Initialize crust: large plates → continental (35 km thick, +500 m above SL);
///      small plates → oceanic (7 km thick, −3500 m).
///   4. Run STEPS geological time-steps of DT_MYR Myr each:
///      a. Detect boundary cells (adjacent to a different plate).
///      b. Compute relative convergence from plate velocity vectors.
///      c. Convergent → mountain building / subduction / volcanic arc.
///      d. Divergent  → rift valleys / mid-ocean ridges / new oceanic crust.
///      e. Age all oceanic crust.  Apply thermal subsidence z(age) = −2.5 − 0.35√age km.
///      f. Apply isostasy: compute surface elevation from crust density/thickness.
///   5. Smooth over sharp numerical boundaries (5 Gaussian-like passes).

use crate::rng::Rng;
use crate::types::{Cell, CrustType};

pub const GRID: usize = 256;
const N_PLATES: usize = 14;
const STEPS: u32 = 80;
const DT_MYR: f32 = 6.0;       // 480 Myr total geological time
const CONV_MOUNTAIN_RATE: f32 = 0.025; // km/step at 1 cm/yr convergence
const DIV_RIFT_RATE: f32 = 0.018;
const CRUST_MIN_KM: f32 = 5.0;
const CRUST_MAX_KM: f32 = 90.0;

/// Tectonic plate descriptor
#[derive(Clone)]
pub struct Plate {
    pub id:         u8,
    pub seed_lat:   f32,  // degrees
    pub seed_lon:   f32,
    pub vel_lat:    f32,  // degrees / Myr  (≈ 0-0.5° = 0-55 km/Myr = 0-5.5 cm/yr at equator)
    pub vel_lon:    f32,
    pub is_oceanic: bool,
    pub area_cells: u32,  // filled after assignment
}

/// Spherical great-circle distance (degrees), equirectangular approximation
/// accurate enough for cell assignment at this resolution.
fn great_circle_deg(lat1: f32, lon1: f32, lat2: f32, lon2: f32) -> f32 {
    use core::f32::consts::PI;
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let a = (dlat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlon / 2.0).sin().powi(2);
    2.0 * a.sqrt().asin().to_degrees()
}

/// Latitude for grid row i.  Range [−90, 90].
pub fn lat(i: usize) -> f32 {
    -90.0 + (i as f32 / (GRID - 1) as f32) * 180.0
}

/// Longitude for grid column j.  Range [−180, 180].
pub fn lon(j: usize) -> f32 {
    -180.0 + (j as f32 / (GRID - 1) as f32) * 360.0
}

/// Convert (row, col) to flat index.
#[inline]
pub fn idx(i: usize, j: usize) -> usize {
    i * GRID + j
}

/// 4-connected neighbours, wrapping longitude, clamping latitude.
pub fn neighbours(i: usize, j: usize) -> [(usize, usize); 4] {
    let up   = if i > 0         { i - 1 } else { 0 };
    let down = if i < GRID - 1  { i + 1 } else { GRID - 1 };
    let left  = if j > 0        { j - 1 } else { GRID - 1 }; // wrap
    let right = if j < GRID - 1 { j + 1 } else { 0 };         // wrap
    [(up, j), (down, j), (i, left), (i, right)]
}

/// Generate plate seeds and velocities.
pub fn generate_plates(rng: &mut Rng) -> Vec<Plate> {
    let mut plates = Vec::with_capacity(N_PLATES);
    for id in 0..N_PLATES {
        // Slight polar-avoidance: latitude biased ±60°
        let seed_lat = rng.range_f32(-65.0, 65.0);
        let seed_lon = rng.range_f32(-180.0, 180.0);
        // Plate velocity: ±0.4°/Myr ≈ ±44 km/Myr ≈ ±4.4 cm/yr
        let vel_lat  = rng.range_f32(-0.4, 0.4);
        let vel_lon  = rng.range_f32(-0.4, 0.4);

        plates.push(Plate {
            id: id as u8,
            seed_lat, seed_lon,
            vel_lat, vel_lon,
            is_oceanic: rng.f64() < 0.45, // ~45% oceanic seed plates
            area_cells: 0,
        });
    }
    plates
}

/// Assign each cell to its nearest plate seed.
pub fn assign_plates(grid: &mut Vec<Cell>, plates: &mut Vec<Plate>) {
    for i in 0..GRID {
        for j in 0..GRID {
            let cell_lat = lat(i);
            let cell_lon = lon(j);
            let best = plates
                .iter()
                .enumerate()
                .min_by(|(_, a), (_, b)| {
                    let da = great_circle_deg(cell_lat, cell_lon, a.seed_lat, a.seed_lon);
                    let db = great_circle_deg(cell_lat, cell_lon, b.seed_lat, b.seed_lon);
                    da.partial_cmp(&db).unwrap()
                })
                .map(|(i, _)| i)
                .unwrap_or(0);

            let cell = &mut grid[idx(i, j)];
            cell.plate_id = best as u8;
            cell.crust_type = if plates[best].is_oceanic {
                CrustType::Oceanic
            } else {
                CrustType::Continental
            };
            cell.thickness_km = if plates[best].is_oceanic { 7.0 } else {
                // Continental thickness: 30–40 km, thicker near plate centre
                let dist = great_circle_deg(cell_lat, cell_lon, plates[best].seed_lat, plates[best].seed_lon);
                (38.0 - dist * 0.08).clamp(28.0, 45.0)
            };
            cell.crust_age_myr = if plates[best].is_oceanic {
                rng_age_init() // will be overridden in first sim step
            } else {
                200.0 // old continental crust
            };

            plates[best].area_cells += 1;
        }
    }

    // Any plate with fewer than 50 cells is too small → convert to oceanic
    for i in 0..GRID {
        for j in 0..GRID {
            let pid = grid[idx(i, j)].plate_id as usize;
            if plates[pid].area_cells < 50 {
                let c = &mut grid[idx(i, j)];
                c.crust_type   = CrustType::Oceanic;
                c.thickness_km = 7.0;
            }
        }
    }
}

fn rng_age_init() -> f32 { 50.0 } // placeholder before sim starts

/// Run the full geological simulation in-place on the grid.
pub fn run_simulation(grid: &mut Vec<Cell>, plates: &Vec<Plate>, rng: &mut Rng) {
    for step in 0..STEPS {
        let t_myr = step as f32 * DT_MYR;

        // Update ages
        for cell in grid.iter_mut() {
            cell.crust_age_myr += DT_MYR;
        }

        // Build velocity lookup: plate_id → (vel_lat, vel_lon)
        let vels: Vec<(f32, f32)> = plates.iter().map(|p| (p.vel_lat, p.vel_lon)).collect();

        // Detect boundaries and apply tectonic forces
        // We need a read-only copy of plate IDs and crust types first
        let snap: Vec<(u8, CrustType, f32)> = grid.iter()
            .map(|c| (c.plate_id, c.crust_type, c.thickness_km))
            .collect();

        for i in 0..GRID {
            for j in 0..GRID {
                let flat = idx(i, j);
                let (self_pid, self_ctype, _) = snap[flat];
                let nbs = neighbours(i, j);

                // Find if any neighbour is a different plate
                let foreign: Vec<(u8, CrustType)> = nbs.iter()
                    .map(|&(ni, nj)| (snap[idx(ni, nj)].0, snap[idx(ni, nj)].1))
                    .filter(|&(pid, _)| pid != self_pid)
                    .collect();

                if foreign.is_empty() {
                    continue; // interior cell
                }

                let (sv_lat, sv_lon) = vels[self_pid as usize];

                for (o_pid, o_ctype) in foreign.iter() {
                    let (ov_lat, ov_lon) = vels[*o_pid as usize];

                    // Relative velocity: positive = converging (approaching boundary)
                    let rel_lat = sv_lat - ov_lat;
                    let rel_lon = sv_lon - ov_lon;
                    let convergence = (rel_lat * rel_lat + rel_lon * rel_lon).sqrt();
                    // Sign: project onto outward-normal direction at the latitude
                    // Simplified: use sign of rel_lat as convergence indicator
                    let is_converging = rel_lat.abs() + rel_lon.abs() > 0.02;
                    let is_diverging  = !is_converging && (rel_lat.abs() + rel_lon.abs()) > 0.005;

                    let cell = &mut grid[flat];

                    if is_converging {
                        match (self_ctype, o_ctype) {
                            (CrustType::Continental, CrustType::Continental) => {
                                // Collision orogeny: thicken continental crust
                                cell.thickness_km += CONV_MOUNTAIN_RATE * convergence * DT_MYR;
                                cell.thickness_km  = cell.thickness_km.min(CRUST_MAX_KM);
                                cell.volcanic_arc  = false;
                            }
                            (CrustType::Continental, CrustType::Oceanic) => {
                                // Subduction: oceanic under continental → volcanic arc
                                cell.volcanic_arc   = true;
                                cell.thickness_km  += CONV_MOUNTAIN_RATE * 0.7 * convergence * DT_MYR;
                                cell.thickness_km   = cell.thickness_km.min(55.0);
                            }
                            (CrustType::Oceanic, CrustType::Continental) => {
                                // This side subducts — thin and sink
                                cell.thickness_km  -= CONV_MOUNTAIN_RATE * 0.5 * convergence * DT_MYR;
                                cell.thickness_km   = cell.thickness_km.max(CRUST_MIN_KM);
                            }
                            (CrustType::Oceanic, CrustType::Oceanic) => {
                                // Ocean-ocean subduction → island arc
                                cell.volcanic_arc   = true;
                            }
                        }
                    } else if is_diverging {
                        match self_ctype {
                            CrustType::Continental => {
                                // Continental rift
                                cell.thickness_km -= DIV_RIFT_RATE * DT_MYR;
                                cell.thickness_km  = cell.thickness_km.max(CRUST_MIN_KM);
                                cell.rift_zone     = true;
                                if cell.thickness_km < 12.0 {
                                    // Rift has torn open → oceanic floor
                                    cell.crust_type   = CrustType::Oceanic;
                                    cell.thickness_km = 7.0;
                                    cell.crust_age_myr = 0.0;
                                }
                            }
                            CrustType::Oceanic => {
                                // Mid-ocean ridge: fresh crust
                                cell.crust_age_myr = 0.0;
                                cell.thickness_km  = 7.0;
                                cell.rift_zone     = true;
                            }
                        }
                    }
                }
            }
        }

        // Thermal subsidence for oceanic crust: z = −2.5 − 0.35√age (km)
        for cell in grid.iter_mut() {
            if cell.crust_type == CrustType::Oceanic {
                let age = cell.crust_age_myr.max(0.0);
                let subsidence_km = -2.5 - 0.35 * age.sqrt();
                // elevation will be computed from isostasy, store depth signal in thickness
                cell.thickness_km = (7.0 - subsidence_km.abs() * 0.2).clamp(CRUST_MIN_KM, 10.0);
            }
        }

        // Mass wasting every 4 steps: slope-collapse of very steep terrain
        if step % 4 == 0 {
            let thick_snap: Vec<f32> = grid.iter().map(|c| c.thickness_km).collect();
            for i in 0..GRID {
                for j in 0..GRID {
                    let flat = idx(i, j);
                    let nbs = neighbours(i, j);
                    let max_nb = nbs.iter()
                        .map(|&(ni, nj)| thick_snap[idx(ni, nj)])
                        .fold(f32::NEG_INFINITY, f32::max);
                    let diff = thick_snap[flat] - max_nb;
                    if diff > 8.0 {
                        grid[flat].thickness_km -= (diff - 8.0) * 0.15;
                    }
                }
            }
        }
    }
}

/// Compute surface elevation (m) from isostasy using Airy isostasy model.
/// Continental:  z = (H − H_ref) / ρ_c_correction × 1000 m/km
/// Oceanic:      z = thermal subsidence + depth correction
pub fn compute_elevations(grid: &mut Vec<Cell>) {
    const H_REF_CONT: f32 = 35.0;   // reference continental crust thickness (km)
    const H_REF_OCEAN: f32 = 7.0;
    const RHO_MANTLE:  f32 = 3_300.0; // kg/m³
    const RHO_CRUST:   f32 = 2_800.0;
    const ISOSTATIC:   f32 = (RHO_MANTLE - RHO_CRUST) / RHO_MANTLE; // ≈ 0.152

    for cell in grid.iter_mut() {
        cell.elevation_m = match cell.crust_type {
            CrustType::Continental => {
                let excess_km = cell.thickness_km - H_REF_CONT;
                // Positive excess → mountain belt, negative → basin
                let base_m = excess_km * ISOSTATIC * 1_000.0;
                // Add hotspot / rift modification
                if cell.volcanic_arc { base_m + 500.0 }
                else if cell.rift_zone { base_m - 800.0 }
                else { base_m }
            }
            CrustType::Oceanic => {
                let age = cell.crust_age_myr.max(0.0);
                // Age-depth curve + ridge high-point
                let depth_km = if cell.rift_zone {
                    -2.0 // mid-ocean ridge ~2 km below sea
                } else {
                    -2.5 - 0.35 * age.sqrt()
                };
                let base_m = depth_km * 1_000.0;
                // Subduction trenches
                if cell.volcanic_arc { base_m - 1_000.0 } else { base_m }
            }
        };
    }
}

/// Apply 3-pass Gaussian-like smoothing over the elevation field
/// (avoids step-function artefacts at plate boundaries).
pub fn smooth_elevations(grid: &mut Vec<Cell>, passes: u32) {
    for _ in 0..passes {
        let snap: Vec<f32> = grid.iter().map(|c| c.elevation_m).collect();
        for i in 0..GRID {
            for j in 0..GRID {
                let nbs = neighbours(i, j);
                let sum: f32 = nbs.iter().map(|&(ni, nj)| snap[idx(ni, nj)]).sum();
                let mine  = snap[idx(i, j)];
                // Weighted: 60% self, 40% average of neighbours
                grid[idx(i, j)].elevation_m = mine * 0.60 + (sum / 4.0) * 0.40;
            }
        }
    }
}
