/// River extraction from flow-accumulation on the terrain heightmap.
///
/// Algorithm:
///   1. Determine flow direction for each cell: steepest downhill neighbour.
///   2. Compute flow accumulation (Tarboton D8 method):
///      each cell accumulates flow from all upstream cells.
///   3. Cells whose accumulation exceeds a threshold become river cells.
///   4. Trace each source (high-accumulation start) downstream to ocean →
///      one contiguous River path.

use crate::tectonics::{idx, neighbours, GRID};

const FLOW_THRESHOLD: u32 = 600; // cells upstream required to classify as river
const MIN_RIVER_CELLS: usize = 20;
const MAX_RIVERS: usize = 14;

/// For each land cell, compute the index of the steepest downhill neighbour.
/// Returns a flat Vec of `next_idx` (usize::MAX if local minimum / ocean).
pub fn compute_flow_directions(elev: &[f32]) -> Vec<usize> {
    let mut dirs = vec![usize::MAX; GRID * GRID];
    for i in 0..GRID {
        for j in 0..GRID {
            let h = elev[idx(i, j)];
            let best = neighbours(i, j)
                .iter()
                .map(|&(ni, nj)| (idx(ni, nj), elev[idx(ni, nj)]))
                .filter(|&(_, hn)| hn < h)
                .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
                .map(|(fi, _)| fi);
            dirs[idx(i, j)] = best.unwrap_or(usize::MAX);
        }
    }
    dirs
}

/// Compute flow accumulation (number of upstream cells draining through each cell).
pub fn compute_flow_accumulation(dirs: &[usize]) -> Vec<u32> {
    let n = GRID * GRID;
    let mut accum = vec![1u32; n];

    // Topological sort-like: count how many cells flow into each cell
    let mut in_degree = vec![0u32; n];
    for fi in 0..n {
        if dirs[fi] != usize::MAX {
            in_degree[dirs[fi]] += 1;
        }
    }

    // Start from cells with no incoming flow
    let mut queue: Vec<usize> = (0..n).filter(|&i| in_degree[i] == 0).collect();
    let mut order = Vec::with_capacity(n);

    while let Some(curr) = queue.pop() {
        order.push(curr);
        let next = dirs[curr];
        if next != usize::MAX {
            in_degree[next] -= 1;
            if in_degree[next] == 0 {
                queue.push(next);
            }
        }
    }

    // Propagate accumulation in topological order
    for &curr in &order {
        let next = dirs[curr];
        if next != usize::MAX {
            let val = accum[curr];
            accum[next] += val;
        }
    }

    accum
}

/// Extract river paths: trace from high-accumulation headwaters to ocean/sink.
/// Returns rivers as Vec<Vec<u32>> (flat indices), sorted longest-first.
pub fn extract_rivers(elev: &[f32]) -> Vec<Vec<u32>> {
    let dirs  = compute_flow_directions(elev);
    let accum = compute_flow_accumulation(&dirs);

    // Mark all river cells
    let is_river: Vec<bool> = accum.iter().map(|&a| a >= FLOW_THRESHOLD).collect();

    // Find source cells: river cells with no upstream river neighbours
    let mut visited = vec![false; GRID * GRID];
    let mut rivers: Vec<Vec<u32>> = Vec::new();

    // Sort all river cells by descending accumulation — higher ones are headwaters
    let mut river_cells: Vec<usize> = (0..GRID * GRID)
        .filter(|&i| is_river[i] && elev[i] > -200.0) // only land rivers
        .collect();
    river_cells.sort_by(|&a, &b| accum[b].cmp(&accum[a]));

    for start in river_cells {
        if visited[start] { continue; }

        // Trace downstream from this cell
        let mut path: Vec<u32> = Vec::new();
        let mut cur = start;

        loop {
            if visited[cur] { break; }
            visited[cur] = true;
            path.push(cur as u32);

            // Stop at ocean (< −100 m) or local sink
            if elev[cur] < -100.0 { break; }

            let next = dirs[cur];
            if next == usize::MAX { break; }
            cur = next;
        }

        if path.len() >= MIN_RIVER_CELLS {
            rivers.push(path);
        }

        if rivers.len() >= MAX_RIVERS { break; }
    }

    rivers
}
