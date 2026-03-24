use serde::{Deserialize, Serialize};

// ── Input (parsed from physics crate JSON) ────────────────────────────────────

/// Minimal subset of `PlanetDescriptor` that the terrain crate needs.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlanetInput {
    pub mass_mearth:            f64,
    pub radius_rearth:          f64,
    pub surface_gravity_g:      f64,
    pub equilibrium_temp_k:     f64,
    pub iron_core_fraction:     f64,
    pub h2o_mass_fraction:      f64,
    pub co2_initial_bar:        f64,
    pub in_habitable_zone:      bool,
    pub mineral_abundance:      MineralInput,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct MineralInput {
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

// ── Grid cell data ─────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum CrustType { Continental, Oceanic }

#[derive(Clone, Copy, Debug)]
pub struct Cell {
    pub plate_id:        u8,
    pub crust_type:      CrustType,
    /// Crustal thickness (km)
    pub thickness_km:    f32,
    /// Age since last crustal recycling (Myr)
    pub crust_age_myr:   f32,
    /// Computed surface elevation (m above/below sea level)
    pub elevation_m:     f32,
    /// Is this cell at a volcanic arc?
    pub volcanic_arc:    bool,
    /// Is this cell at a mid-ocean ridge or continental rift?
    pub rift_zone:       bool,
}

impl Default for Cell {
    fn default() -> Self {
        Cell {
            plate_id: 0,
            crust_type: CrustType::Oceanic,
            thickness_km: 7.0,
            crust_age_myr: 0.0,
            elevation_m: -3_500.0,
            volcanic_arc: false,
            rift_zone: false,
        }
    }
}

// ── Output ─────────────────────────────────────────────────────────────────────

/// Full terrain result returned as JSON to TypeScript.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TerrainResult {
    /// Heightmap resolution (square)
    pub size: usize,
    /// Flat row-major heightmap in metres (sea level = 0).
    /// Length = size×size.  Transferred separately via `get_heightmap()` as Float32Array.
    #[serde(skip)]
    pub heightmap: Vec<f32>,
    /// Min/max elevation (m) for normalisation in TS
    pub elevation_min_m: f32,
    pub elevation_max_m: f32,
    /// Flat biome ID map (0–7).  Length = size×size.
    pub biome_map: Vec<u8>,
    /// Flat mineral type map (MineralCell encoding).  Length = size×size.
    pub mineral_map: Vec<u8>,
    /// Plate ID for each cell (diagnostic / minimap)
    pub plate_map: Vec<u8>,
    /// Set of cells with volcanic activity (indices into the flat array)
    pub volcanic_cells: Vec<u32>,
    /// Set of cells along rift zones
    pub rift_cells: Vec<u32>,
    /// River paths as lists of flat indices
    pub rivers: Vec<Vec<u32>>,
    /// Planet physical stats (passed through for TS convenience)
    pub planet_radius_m:   f64,
    pub surface_gravity_g: f64,
}

/// Biome IDs (matches the existing TypeScript BiomeType values)
pub mod biome {
    pub const DEEP_OCEAN:       u8 = 0;
    pub const SHALLOW_OCEAN:    u8 = 1;
    pub const BEACH:            u8 = 2;
    pub const PLAINS:           u8 = 3;
    pub const FOREST:           u8 = 4;
    pub const TAIGA:            u8 = 5;
    pub const MOUNTAIN:         u8 = 6;
    pub const SNOW_CAP:         u8 = 7;
    pub const DESERT:           u8 = 8;
    pub const TROPICAL:         u8 = 9;
    pub const TUNDRA:           u8 = 10;
    pub const VOLCANIC:         u8 = 11;
    pub const RIFT:             u8 = 12;
    pub const SAVANNA:          u8 = 13;
}

/// Dominant mineral encoding per cell (matches game MAT enum indices)
pub mod mineral {
    pub const NONE:     u8 = 0;
    pub const IRON:     u8 = 1;
    pub const COPPER:   u8 = 2;
    pub const TIN:      u8 = 3;
    pub const GOLD:     u8 = 4;
    pub const SILVER:   u8 = 5;
    pub const COAL:     u8 = 6;
    pub const SULFUR:   u8 = 7;
    pub const SALTPETER:u8 = 8;
    pub const URANIUM:  u8 = 9;
    pub const SILICON:  u8 = 10;
    pub const LIMESTONE:u8 = 11;
    pub const CLAY:     u8 = 12;
    pub const STONE:    u8 = 13;
    pub const FLINT:    u8 = 14;
}
