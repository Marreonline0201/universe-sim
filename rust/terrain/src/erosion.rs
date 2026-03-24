/// Hydraulic erosion and terrain smoothing.
///
/// Algorithm: simplified particle-based hydraulic erosion (Smith 2010 / Benes & Forsbach 2001)
/// Each "water droplet" starts at a random cell, flows downhill, picks up sediment
/// proportional to slope/speed, deposits when slope decreases.
/// After many droplets, valleys deepen and plains fill in — producing natural-looking terrain.
///
/// We also add a fBm detail-noise layer (using value noise, not Perlin) at fine scales
/// to simulate rock heterogeneity that tectonics cannot capture.

use crate::rng::Rng;
use crate::tectonics::{idx, neighbours, lat, GRID};
use crate::types::Cell;

// ── Erosion parameters ────────────────────────────────────────────────────────
const N_DROPLETS:      u32   = 150_000;
const MAX_STEPS_DROP:  u32   = 64;
const INERTIA:         f32   = 0.05;   // droplet direction inertia
const CAPACITY_FACTOR: f32   = 8.0;    // max sediment × slope × speed
const EROSION_RATE:    f32   = 0.3;
const DEPOSITION_RATE: f32   = 0.3;
const EVAPORATION:     f32   = 0.01;
const GRAVITY_FACTOR:  f32   = 4.0;
const MIN_SLOPE:       f32   = 0.0001;

// ── Detail noise parameters ────────────────────────────────────────────────────
const DETAIL_AMPLITUDE: f32 = 180.0;  // metres
const DETAIL_SCALE:     usize = 32;   // wavelength ~ GRID/DETAIL_SCALE cells

pub fn run_erosion(grid: &mut Vec<Cell>, rng: &mut Rng) {
    // Build mutable elevation buffer
    let mut elev: Vec<f32> = grid.iter().map(|c| c.elevation_m).collect();

    // Only erode above sea level (ocean floor is shaped by tectonics, not rivers)
    erosion_pass(&mut elev, rng);
    add_detail_noise(&mut elev, rng);

    // Write back
    for (i, cell) in grid.iter_mut().enumerate() {
        cell.elevation_m = elev[i];
    }
}

fn erosion_pass(elev: &mut Vec<f32>, rng: &mut Rng) {
    let mut sediment_map = vec![0.0f32; GRID * GRID];

    for _ in 0..N_DROPLETS {
        // Spawn at random land cell (skip deep ocean — no river erosion there)
        let row0 = rng.range(0.0, GRID as f64) as usize;
        let col0 = rng.range(0.0, GRID as f64) as usize;
        if elev[idx(row0, col0)] < -500.0 {
            continue; // skip deep ocean droplets
        }

        let mut row = row0;
        let mut col = col0;
        let mut speed     = 1.0f32;
        let mut water     = 1.0f32;
        let mut sediment  = 0.0f32;
        let mut dir_r     = 0.0f32;
        let mut dir_c     = 0.0f32;

        for _ in 0..MAX_STEPS_DROP {
            let flat  = idx(row, col);
            let h_cur = elev[flat];

            // Compute gradient to steepest downhill neighbour
            let nbs = neighbours(row, col);
            let (best_r, best_c, h_next) = nbs.iter()
                .map(|&(ni, nj)| (ni, nj, elev[idx(ni, nj)]))
                .min_by(|a, b| a.2.partial_cmp(&b.2).unwrap())
                .unwrap();

            let slope = (h_cur - h_next).max(MIN_SLOPE);

            // Update direction with inertia
            let new_dr = best_r as f32 - row as f32;
            let new_dc = best_c as f32 - col as f32;
            dir_r = dir_r * (1.0 - INERTIA) + new_dr * INERTIA;
            dir_c = dir_c * (1.0 - INERTIA) + new_dc * INERTIA;

            // Move to next cell (integer step to nearest neighbour)
            let next_row = ((row as i32 + dir_r.signum() as i32)
                .clamp(0, GRID as i32 - 1)) as usize;
            let next_col = ((col as i32 + dir_c.signum() as i32)
                .clamp(0, GRID as i32 - 1)) as usize;

            // Speed update from gravity along slope
            speed = (speed * speed + slope * GRAVITY_FACTOR).sqrt();
            speed = speed.clamp(0.01, 4.0);

            // Sediment capacity
            let capacity = slope * speed * water * CAPACITY_FACTOR;

            if sediment > capacity || slope < 0.0 {
                // Depositing
                let deposit = if slope < 0.0 {
                    sediment // uphill: dump all
                } else {
                    (sediment - capacity) * DEPOSITION_RATE
                };
                sediment -= deposit;
                elev[flat]          += deposit;
                sediment_map[flat]  += deposit;
            } else {
                // Eroding
                let erode = ((capacity - sediment) * EROSION_RATE).min(slope * 0.2);
                sediment += erode;
                elev[flat] -= erode;
                // Distribute erosion to neighbours slightly
                for &(ni, nj) in nbs.iter() {
                    elev[idx(ni, nj)] -= erode * 0.05;
                }
            }

            water    *= 1.0 - EVAPORATION;
            row = next_row;
            col = next_col;

            if water < 0.01 || (row == row0 && col == col0) {
                break;
            }
        }
    }
}

/// Add layered value-noise for small-scale rocky texture.
fn add_detail_noise(elev: &mut Vec<f32>, rng: &mut Rng) {
    // Two octaves: DETAIL_SCALE and DETAIL_SCALE/2
    let noise1 = generate_value_noise(DETAIL_SCALE, rng);
    let noise2 = generate_value_noise(DETAIL_SCALE / 2, rng);

    for i in 0..GRID * GRID {
        let n = noise1[i] * DETAIL_AMPLITUDE + noise2[i] * (DETAIL_AMPLITUDE * 0.5);
        // Only add noise to land (elevations > −200 m) to avoid disrupting ocean depth
        if elev[i] > -200.0 {
            elev[i] += n;
        }
    }
}

/// Generate a GRID×GRID value-noise map with the given wavelength.
fn generate_value_noise(wavelength: usize, rng: &mut Rng) -> Vec<f32> {
    let wl = wavelength.max(1);
    // Random lattice values at coarse resolution
    let lattice_size = GRID / wl + 2;
    let lattice: Vec<f32> = (0..lattice_size * lattice_size)
        .map(|_| rng.range_f32(-1.0, 1.0))
        .collect();

    let mut out = vec![0.0f32; GRID * GRID];
    for i in 0..GRID {
        for j in 0..GRID {
            let gi = (i / wl).min(lattice_size - 2);
            let gj = (j / wl).min(lattice_size - 2);
            let ti = (i % wl) as f32 / wl as f32;
            let tj = (j % wl) as f32 / wl as f32;

            // Bilinear interpolation
            let v00 = lattice[gi * lattice_size + gj];
            let v10 = lattice[(gi + 1) * lattice_size + gj];
            let v01 = lattice[gi * lattice_size + (gj + 1)];
            let v11 = lattice[(gi + 1) * lattice_size + (gj + 1)];

            // Smoothstep
            let u = ti * ti * (3.0 - 2.0 * ti);
            let v = tj * tj * (3.0 - 2.0 * tj);

            let top    = v00 + u * (v10 - v00);
            let bottom = v01 + u * (v11 - v01);
            let val    = top + v * (bottom - top);

            out[idx(i, j)] = val;
        }
    }
    out
}
