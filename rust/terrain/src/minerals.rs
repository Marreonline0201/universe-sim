/// Mineral deposit placement — geologically motivated.
///
/// Ground truth mapping:
///  - Iron ore (BIF/banded iron formations): exposed old continental crust, ancient
///    marine sediments oxidised during the Great Oxidation Event.  High in shields.
///  - Copper:   porphyry deposits at convergent margins (subduction-related granite).
///  - Tin:      cassiterite in granite plutons and alluvial reworking.
///  - Gold:     epithermal (volcanic arc) and orogenic (mountain belt deformation).
///  - Silver:   co-located with gold and copper in hydrothermal veins.
///  - Coal:     sedimentary basins, low-gradient swampy terrain.
///  - Sulfur:   volcanic craters, hydrothermal vents, volcanic arcs.
///  - Saltpeter: arid/semi-arid cave floors and evaporite deposits.
///  - Uranium:  felsic granite intrusives, enriched as silicic magma differentiates.
///  - Silicon (sand/quartz): coastal beaches, river bars, desert dunes.
///  - Limestone: shallow tropical carbonate platforms.
///  - Clay: river banks and deltas, weathered basin sediments.
///  - Stone / Flint: general rock; flint near chalk/limestone formations.

use crate::rng::Rng;
use crate::tectonics::{GRID, idx};
use crate::types::{mineral, Cell, CrustType, MineralInput};

/// Compute per-cell mineral type encoding.
pub fn build_mineral_map(
    grid: &[Cell],
    elev: &[f32],
    river_cells: &[bool],
    mineral_abundance: &MineralInput,
    rng: &mut Rng,
) -> Vec<u8> {
    let mut out = vec![mineral::STONE; GRID * GRID];

    for i in 0..GRID {
        for j in 0..GRID {
            let flat = idx(i, j);
            let cell = &grid[flat];
            let h    = elev[flat];
            let lat_abs = (i as f32 / (GRID - 1) as f32 * 180.0 - 90.0).abs();

            // Ocean floor — no accessible minerals
            if h < -200.0 {
                out[flat] = mineral::NONE;
                continue;
            }

            // ── Determine geological context ─────────────────────────────────
            let is_volcanic  = cell.volcanic_arc;
            let is_rift      = cell.rift_zone;
            let is_old_cont  = cell.crust_type == CrustType::Continental
                && cell.crust_age_myr > 300.0;
            let is_mountain  = h > 1_500.0;
            let is_coast     = h > -50.0 && h < 30.0;
            let is_shallow   = h > -100.0 && h < -50.0;
            let is_lowland   = h > 0.0 && h < 200.0;
            let is_arid      = lat_abs > 20.0 && lat_abs < 35.0; // subtropical desert belt
            let is_river_adj = river_cells[flat];

            // ── Build weighted candidate list (mineral_id, weight) ────────────
            let mut candidates: Vec<(u8, f32)> = Vec::with_capacity(6);

            // Iron — BIF in old continental shields, also mountain ore bodies
            if is_old_cont || is_mountain {
                candidates.push((mineral::IRON, 0.18 * mineral_abundance.iron as f32));
            }
            // Copper — subduction-related porphyry, volcanic arcs
            if is_volcanic || is_mountain {
                candidates.push((mineral::COPPER, 0.12 * mineral_abundance.copper as f32));
            }
            // Tin — granites in old continental cores
            if is_old_cont && !is_volcanic {
                candidates.push((mineral::TIN, 0.06 * mineral_abundance.tin as f32));
            }
            // Gold — volcanic epithermal + deformation zones
            if is_volcanic || (is_mountain && is_old_cont) {
                candidates.push((mineral::GOLD, 0.04 * mineral_abundance.gold as f32));
            }
            // Silver — with copper/gold veins
            if is_volcanic || is_mountain {
                candidates.push((mineral::SILVER, 0.04 * mineral_abundance.silver as f32));
            }
            // Coal — sedimentary lowlands, basins
            if is_lowland && cell.crust_type == CrustType::Continental {
                candidates.push((mineral::COAL, 0.10 * mineral_abundance.coal as f32));
            }
            // Sulfur — volcanic arcs and rifts
            if is_volcanic || is_rift {
                candidates.push((mineral::SULFUR, 0.15 * mineral_abundance.sulfur as f32));
            }
            // Saltpeter — arid cave floors / evaporite zones
            if is_arid && is_lowland {
                candidates.push((mineral::SALTPETER, 0.08 * mineral_abundance.saltpeter as f32));
            }
            // Uranium — felsic intrusives, old crustal roots
            if is_old_cont && is_mountain {
                candidates.push((mineral::URANIUM, 0.03 * mineral_abundance.uranium as f32));
            }
            // Silicon (sand) — coasts, river bars, deserts
            if is_coast || is_river_adj || (is_arid && is_lowland) {
                candidates.push((mineral::SILICON, 0.20 * mineral_abundance.silicon as f32));
            }
            // Limestone — shallow warm-water carbonate platforms, low lat
            if (is_coast || is_shallow) && lat_abs < 40.0 {
                candidates.push((mineral::LIMESTONE, 0.12 * mineral_abundance.limestone as f32));
            }
            // Clay — riverbanks
            if is_river_adj && is_lowland {
                candidates.push((mineral::CLAY, 0.25));
            }
            // Flint — near chalk/limestone; scattered in plains
            if is_lowland || is_old_cont {
                candidates.push((mineral::FLINT, 0.10));
            }
            // Stone — always fallback
            candidates.push((mineral::STONE, 0.30));

            out[flat] = sample_mineral(&candidates, rng);
        }
    }

    out
}

fn sample_mineral(candidates: &[(u8, f32)], rng: &mut Rng) -> u8 {
    let total: f32 = candidates.iter().map(|(_, w)| w).sum();
    if total <= 0.0 { return mineral::STONE; }
    let mut r = rng.f32() * total;
    for &(id, w) in candidates {
        r -= w;
        if r <= 0.0 { return id; }
    }
    candidates.last().map(|&(id, _)| id).unwrap_or(mineral::STONE)
}

/// Build a boolean mask of all cells that are within 2 cells of a river.
pub fn river_adjacency_mask(rivers: &[Vec<u32>]) -> Vec<bool> {
    let mut mask = vec![false; GRID * GRID];
    for river in rivers {
        for &flat in river {
            mask[flat as usize] = true;
            // Also mark orthogonal neighbours
            let i = flat as usize / GRID;
            let j = flat as usize % GRID;
            let nbs = crate::tectonics::neighbours(i, j);
            for (ni, nj) in nbs {
                mask[idx(ni, nj)] = true;
            }
        }
    }
    mask
}
