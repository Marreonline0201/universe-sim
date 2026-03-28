export interface MaterialProps {
  // ── Thermal ────────────────────────────────────────────────────────────────
  k: number               // thermal conductivity (W/m·K)
  Cp: number              // specific heat (J/kg·K)
  density: number         // kg/m³
  ignitionTemp: number    // °C (Infinity = non-combustible)
  combustionJ_kg: number  // energy released during combustion (J/kg); 0 = non-combustible

  // ── Fire / Ignition ────────────────────────────────────────────────────────
  flammability: number    // 0-1 — ease of ignition once ignitionTemp is reached
                          //   0 = never ignites, 1 = ignites instantly

  // ── Mechanical ────────────────────────────────────────────────────────────
  hardness: number        // Mohs scale 0-10; determines tool-making capability,
                          //   sparking ability, and wear resistance
  tensileStrength: number // MPa — ultimate tensile strength; governs weapon / structural use
  workability: number     // 0-1 — ease of shaping; 0.95 = clay, 0.05 = granite

  // ── Thermal Phase ─────────────────────────────────────────────────────────
  meltingPoint: number    // °C — temperature at which material liquefies (Infinity = refractory)

  // ── Moisture / Hydration ──────────────────────────────────────────────────
  moisture: number        // 0-1 — 0 = bone-dry, 1 = saturated; scales flammability down
                          //   and slightly increases effective density
}

// ── Re-exported MAT ID constants (convenience aliases) ──────────────────────
export const MAT_AIR    = 0
export const MAT_STONE  = 1
export const MAT_FLINT  = 2
export const MAT_WOOD   = 3
export const MAT_BARK   = 4
export const MAT_COAL   = 17
export const MAT_TINDER = 21  // alias for FIBER in fire-lighting context

// ── Physics data ────────────────────────────────────────────────────────────
// Sources / conventions:
//   - k, Cp, density: engineering handbooks (CRC, Ashby)
//   - ignitionTemp / combustionJ_kg: fire-safety literature
//   - hardness: Mohs scale (Wikipedia, mineralogy texts)
//   - tensileStrength: ASM handbook, Wikipedia
//   - meltingPoint: NIST WebBook / CRC
//   - flammability, workability, moisture: expert approximation scaled 0-1
//   - Values marked "// approx" are reasonable estimates, not primary-source data

const PROPS: Record<number, MaterialProps> = {

  // ── 0: Air ─────────────────────────────────────────────────────────────────
  0: {
    k: 0.026, Cp: 1005, density: 1.225,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 0, tensileStrength: 0,
    workability: 0, meltingPoint: Infinity, moisture: 0,
  },

  // ── 1: Stone (granite) ────────────────────────────────────────────────────
  // Granite: k≈2.9, hardness 6-7 Mohs, mp ~1215°C (bulk), tensile ~7-25 MPa
  1: {
    k: 2.9, Cp: 790, density: 2700,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 6.5, tensileStrength: 15,  // approx (granite compressive ~200 MPa; tensile ~15)
    workability: 0.1, meltingPoint: 1215, moisture: 0.02, // approx
  },

  // ── 2: Flint (chert / cryptocrystalline quartz) ───────────────────────────
  // Hardness 7 Mohs, density ~2650 kg/m³, non-combustible, makes sparks
  2: {
    k: 1.4, Cp: 730, density: 2650,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 7, tensileStrength: 40,    // approx — brittle, high compressive, low tensile
    workability: 0.25, meltingPoint: 1650, moisture: 0.01, // approx
  },

  // ── 3: Wood (softwood pine reference) ─────────────────────────────────────
  // k≈0.12, Cp≈1700, density≈600 kg/m³, ignition ~250°C, Mohs ~2
  3: {
    k: 0.12, Cp: 1700, density: 600,
    ignitionTemp: 250, combustionJ_kg: 16_700_000,
    flammability: 0.6, hardness: 2, tensileStrength: 50,  // approx pine along grain
    workability: 0.65, meltingPoint: Infinity, moisture: 0.12, // seasoned lumber ~12%
  },

  // ── 4: Bark ────────────────────────────────────────────────────────────────
  4: {
    k: 0.10, Cp: 1600, density: 400,
    ignitionTemp: 220, combustionJ_kg: 15_500_000,
    flammability: 0.7, hardness: 1, tensileStrength: 5,   // approx
    workability: 0.55, meltingPoint: Infinity, moisture: 0.1,
  },

  // ── 5: Leaf (dead foliage / kindling leaves) ──────────────────────────────
  5: {
    k: 0.06, Cp: 1600, density: 80,
    ignitionTemp: 170, combustionJ_kg: 14_000_000,
    flammability: 0.9, hardness: 0.5, tensileStrength: 1, // approx
    workability: 0.7, meltingPoint: Infinity, moisture: 0.05,
  },

  // ── 6: Bone ────────────────────────────────────────────────────────────────
  // Cortical bone: density ~1900, k≈0.5, Cp≈1300, Mohs ~3-4, tensile ~130 MPa
  6: {
    k: 0.5, Cp: 1300, density: 1900,
    ignitionTemp: 450, combustionJ_kg: 5_000_000,       // approx — bone chars slowly
    flammability: 0.05, hardness: 3.5, tensileStrength: 130,
    workability: 0.45, meltingPoint: Infinity, moisture: 0.08, // approx
  },

  // ── 7: Hide / rawhide ─────────────────────────────────────────────────────
  7: {
    k: 0.15, Cp: 1800, density: 860,                    // approx dried hide
    ignitionTemp: 300, combustionJ_kg: 18_000_000,       // approx
    flammability: 0.25, hardness: 1, tensileStrength: 20, // approx
    workability: 0.75, meltingPoint: Infinity, moisture: 0.15, // approx fresh hide
  },

  // ── 8: Clay (unfired) ─────────────────────────────────────────────────────
  // Unfired: very soft, highly workable; firing raises hardness to ~6
  8: {
    k: 1.1, Cp: 920, density: 1800,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 1, tensileStrength: 2,    // approx — weak in tension when unfired
    workability: 0.95, meltingPoint: 1200, moisture: 0.25, // approx plastic-limit clay
  },

  // ── 9: Sand (quartz sand) ──────────────────────────────────────────────────
  9: {
    k: 0.3, Cp: 835, density: 1600,                     // bulk/loose sand
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 7, tensileStrength: 0,    // granular — no tensile strength
    workability: 0.2, meltingPoint: 1700,                // SiO2 melting ~1710°C
    moisture: 0.03,                                       // approx dry desert sand
  },

  // ── 10: Charcoal ───────────────────────────────────────────────────────────
  // Note: MAT.CHARCOAL = 10 in Inventory.ts, but MaterialRegistry currently uses 17 for coal.
  // This entry covers wood charcoal (10); ID 17 = mineral coal is kept below.
  10: {
    k: 0.04, Cp: 840, density: 400,                     // bulk charcoal
    ignitionTemp: 300, combustionJ_kg: 30_000_000,       // approx — charcoal ~30 MJ/kg
    flammability: 0.55, hardness: 1, tensileStrength: 1, // approx brittle
    workability: 0.3, meltingPoint: 3550,               // graphite-like; carbon sublimes ~3550°C
    moisture: 0.04,                                      // approx
  },

  // ── 11: Copper Ore (malachite / chalcopyrite reference) ──────────────────
  11: {
    k: 3.0, Cp: 750, density: 4200,                     // approx mixed ore rock
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 3.5, tensileStrength: 10, // approx
    workability: 0.1, meltingPoint: 1300,               // approx ore smelting temp
    moisture: 0.02,                                      // approx
  },

  // ── 12: Tin Ore (cassiterite) ─────────────────────────────────────────────
  12: {
    k: 2.5, Cp: 700, density: 6900,                     // cassiterite density ~7 g/cm³
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 6, tensileStrength: 8,   // approx brittle ore
    workability: 0.1, meltingPoint: 1100,               // approx ore smelting
    moisture: 0.01,                                      // approx
  },

  // ── 13: Bronze (Cu ~88%, Sn ~12%) ─────────────────────────────────────────
  13: {
    k: 50, Cp: 380, density: 8800,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 3, tensileStrength: 310, // approx cast bronze
    workability: 0.45, meltingPoint: 950,               // bronze mp ~900-950°C
    moisture: 0,
  },

  // ── 14: Iron Ore (hematite / magnetite reference) ────────────────────────
  14: {
    k: 3.5, Cp: 650, density: 5100,                     // approx mixed iron ore
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 5.5, tensileStrength: 8, // approx
    workability: 0.08, meltingPoint: 1400,              // approx smelt temp
    moisture: 0.01,                                      // approx
  },

  // ── 15: Iron (wrought iron / pig iron reference) ──────────────────────────
  15: {
    k: 80, Cp: 449, density: 7874,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 4, tensileStrength: 400,
    workability: 0.35, meltingPoint: 1538,
    moisture: 0,
  },

  // ── 16: Steel (medium-carbon ~0.4% C) ────────────────────────────────────
  16: {
    k: 50, Cp: 490, density: 7850,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 5.5, tensileStrength: 600, // approx medium-carbon
    workability: 0.3, meltingPoint: 1425,
    moisture: 0,
  },

  // ── 17: Coal (bituminous mineral coal) ────────────────────────────────────
  17: {
    k: 0.2, Cp: 710, density: 1300,
    ignitionTemp: 350, combustionJ_kg: 29_000_000,
    flammability: 0.45, hardness: 2, tensileStrength: 3,  // approx — brittle
    workability: 0.2, meltingPoint: 3550,                // carbon sublimation approx
    moisture: 0.05,                                       // approx
  },

  // ── 18: Glass (soda-lime silica) ──────────────────────────────────────────
  18: {
    k: 1.0, Cp: 840, density: 2500,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 5.5, tensileStrength: 50,  // approx — brittle
    workability: 0.6, meltingPoint: 1100,                // softens ~800°C, flows ~1100°C
    moisture: 0,
  },

  // ── 19: Brick (fired clay) ────────────────────────────────────────────────
  19: {
    k: 0.8, Cp: 840, density: 1900,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 5.5, tensileStrength: 3,  // approx — very low tensile, high compressive
    workability: 0.05, meltingPoint: 1350,              // approx
    moisture: 0.01,                                      // approx
  },

  // ── 20: Mortar (lime/cement) ──────────────────────────────────────────────
  20: {
    k: 0.9, Cp: 800, density: 1600,                     // approx cured mortar
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 3, tensileStrength: 2,   // approx
    workability: 0.7, meltingPoint: Infinity,           // decomposes, doesn't melt cleanly
    moisture: 0.08,                                      // approx — curing moisture
  },

  // ── 21: Fiber / Tinder (plant fiber, dry grass, cattail fluff) ───────────
  21: {
    k: 0.06, Cp: 1600, density: 80,
    ignitionTemp: 170, combustionJ_kg: 14_000_000,
    flammability: 0.9, hardness: 0.5, tensileStrength: 2, // approx fibrous plant
    workability: 0.8, meltingPoint: Infinity,
    moisture: 0.05,
  },

  // ── 22: Cloth (woven plant fiber / linen reference) ──────────────────────
  22: {
    k: 0.05, Cp: 1300, density: 300,                    // approx woven fabric
    ignitionTemp: 210, combustionJ_kg: 15_000_000,       // approx
    flammability: 0.65, hardness: 1, tensileStrength: 30, // approx linen
    workability: 0.9, meltingPoint: Infinity,
    moisture: 0.08,                                      // approx
  },

  // ── 23: Rope (twisted plant fiber) ───────────────────────────────────────
  23: {
    k: 0.05, Cp: 1400, density: 350,                    // approx
    ignitionTemp: 230, combustionJ_kg: 15_500_000,       // approx
    flammability: 0.6, hardness: 1, tensileStrength: 50, // approx hemp rope
    workability: 0.85, meltingPoint: Infinity,
    moisture: 0.07,                                      // approx
  },

  // ── 24: Leather (vegetable-tanned) ───────────────────────────────────────
  24: {
    k: 0.15, Cp: 1500, density: 860,
    ignitionTemp: 320, combustionJ_kg: 17_000_000,       // approx
    flammability: 0.2, hardness: 1.5, tensileStrength: 25, // approx
    workability: 0.7, meltingPoint: Infinity,
    moisture: 0.12,                                      // approx
  },

  // ── 25: Copper (pure / near-pure) ────────────────────────────────────────
  25: {
    k: 400, Cp: 385, density: 8960,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 3, tensileStrength: 200,
    workability: 0.6, meltingPoint: 1085,
    moisture: 0,
  },

  // ── 26: Silver ────────────────────────────────────────────────────────────
  26: {
    k: 429, Cp: 235, density: 10490,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 2.5, tensileStrength: 170,
    workability: 0.65, meltingPoint: 962,
    moisture: 0,
  },

  // ── 27: Gold ──────────────────────────────────────────────────────────────
  27: {
    k: 318, Cp: 129, density: 19300,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 2.5, tensileStrength: 120,
    workability: 0.7, meltingPoint: 1064,
    moisture: 0,
  },

  // ── 28: Sulfur ────────────────────────────────────────────────────────────
  // Mohs ~2, mp 115°C, combustible — forms SO₂
  28: {
    k: 0.27, Cp: 710, density: 2000,
    ignitionTemp: 248, combustionJ_kg: 9_200_000,
    flammability: 0.7, hardness: 2, tensileStrength: 1,  // approx — very brittle
    workability: 0.4, meltingPoint: 115,
    moisture: 0,
  },

  // ── 29: Saltpeter (potassium nitrate, KNO₃) ──────────────────────────────
  29: {
    k: 0.5, Cp: 950, density: 2100,
    ignitionTemp: 400, combustionJ_kg: 0,               // oxidizer; energy context-dependent
    flammability: 0.1, hardness: 2, tensileStrength: 1, // approx
    workability: 0.5, meltingPoint: 334,
    moisture: 0.01,                                      // approx hygroscopic
  },

  // ── 30: Charcoal Powder ───────────────────────────────────────────────────
  // Ground charcoal — lower ignitionTemp, higher surface area
  30: {
    k: 0.03, Cp: 840, density: 200,                     // loose powder
    ignitionTemp: 250, combustionJ_kg: 30_000_000,
    flammability: 0.75, hardness: 0.5, tensileStrength: 0, // powder
    workability: 0.5, meltingPoint: 3550,               // carbon sublimation approx
    moisture: 0.02,                                      // approx
  },

  // ── 31: Gunpowder (75% KNO₃ + 15% charcoal + 10% sulfur) ────────────────
  31: {
    k: 0.1, Cp: 900, density: 900,                      // approx loose powder
    ignitionTemp: 250, combustionJ_kg: 3_000_000,        // approx deflagration energy
    flammability: 0.95, hardness: 1, tensileStrength: 0, // powder — no tensile strength
    workability: 0.4, meltingPoint: Infinity,           // detonates before melting
    moisture: 0.01,                                      // approx — must be kept dry
  },

  // ── 32: Silicon (metallurgical grade) ────────────────────────────────────
  32: {
    k: 150, Cp: 710, density: 2330,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 7, tensileStrength: 70,  // approx — brittle semiconductor
    workability: 0.05, meltingPoint: 1414,
    moisture: 0,
  },

  // ── 33: Circuit (copper + silicon composite — treated as bulk) ───────────
  33: {
    k: 150, Cp: 500, density: 3000,                     // approx composite
    ignitionTemp: 300, combustionJ_kg: 500_000,          // approx PCB substrate ignition
    flammability: 0.1, hardness: 5, tensileStrength: 100, // approx
    workability: 0.1, meltingPoint: 800,               // approx solder/substrate
    moisture: 0,
  },

  // ── 34: Wire (copper wire) ────────────────────────────────────────────────
  34: {
    k: 400, Cp: 385, density: 8960,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 3, tensileStrength: 220, // approx drawn copper wire
    workability: 0.7, meltingPoint: 1085,
    moisture: 0,
  },

  // ── 35: Plastic (HDPE reference) ──────────────────────────────────────────
  35: {
    k: 0.5, Cp: 1900, density: 950,
    ignitionTemp: 350, combustionJ_kg: 43_000_000,       // approx polyethylene
    flammability: 0.6, hardness: 2, tensileStrength: 30, // approx HDPE
    workability: 0.75, meltingPoint: 130,
    moisture: 0,
  },

  // ── 36: Rubber (natural vulcanized) ──────────────────────────────────────
  36: {
    k: 0.16, Cp: 2000, density: 1200,
    ignitionTemp: 260, combustionJ_kg: 32_000_000,       // approx
    flammability: 0.45, hardness: 1, tensileStrength: 25, // approx vulcanized
    workability: 0.65, meltingPoint: 180,               // approx — decomposes
    moisture: 0,
  },

  // ── 37: Fuel (petroleum distillate / diesel reference) ───────────────────
  37: {
    k: 0.15, Cp: 2000, density: 850,
    ignitionTemp: 210, combustionJ_kg: 42_000_000,
    flammability: 0.85, hardness: 0, tensileStrength: 0, // liquid
    workability: 0, meltingPoint: Infinity,             // liquid at room temp
    moisture: 0,
  },

  // ── 38: Lubricant (machine oil reference) ────────────────────────────────
  38: {
    k: 0.15, Cp: 1900, density: 900,                    // approx mineral oil
    ignitionTemp: 280, combustionJ_kg: 40_000_000,       // approx
    flammability: 0.3, hardness: 0, tensileStrength: 0, // liquid
    workability: 0, meltingPoint: Infinity,
    moisture: 0,
  },

  // ── 39: Uranium (natural uranium metal) ──────────────────────────────────
  39: {
    k: 27, Cp: 116, density: 19100,
    ignitionTemp: 150, combustionJ_kg: 0,               // pyrophoric — oxidizes rapidly, not combustion
    flammability: 0.05, hardness: 6, tensileStrength: 170, // approx
    workability: 0.2, meltingPoint: 1132,
    moisture: 0,
  },

  // ── 40: Plutonium ─────────────────────────────────────────────────────────
  40: {
    k: 6.7, Cp: 130, density: 19820,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 4, tensileStrength: 170, // approx — close to uranium
    workability: 0.15, meltingPoint: 640,
    moisture: 0,
  },

  // ── 41: Cooked Meat ───────────────────────────────────────────────────────
  41: {
    k: 0.5, Cp: 3200, density: 900,                     // approx cooked flesh
    ignitionTemp: 250, combustionJ_kg: 10_000_000,       // approx calorific value
    flammability: 0.15, hardness: 0.5, tensileStrength: 0.5, // approx tender cooked
    workability: 0.8, meltingPoint: Infinity,
    moisture: 0.45,                                      // approx cooked meat ~45% water
  },

  // ── 42: Raw Meat ──────────────────────────────────────────────────────────
  42: {
    k: 0.5, Cp: 3500, density: 1050,
    ignitionTemp: 300, combustionJ_kg: 8_000_000,        // approx
    flammability: 0.05, hardness: 0.3, tensileStrength: 0.5, // approx
    workability: 0.85, meltingPoint: Infinity,
    moisture: 0.65,                                      // approx fresh meat ~65% water
  },

  // ── 43: Iron Ingot (smelted, wrought) ────────────────────────────────────
  // Same physical properties as iron (15) — refined form
  43: {
    k: 80, Cp: 449, density: 7874,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 4, tensileStrength: 400,
    workability: 0.35, meltingPoint: 1538,
    moisture: 0,
  },

  // ── 44: Steel Ingot (quenched 0.2-2.1% C) ────────────────────────────────
  44: {
    k: 50, Cp: 490, density: 7850,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 6, tensileStrength: 800, // quenched high-C steel
    workability: 0.25, meltingPoint: 1430,
    moisture: 0,
  },

  // ── 45: Cast Iron Ingot (>2.1% C, brittle) ───────────────────────────────
  45: {
    k: 48, Cp: 500, density: 7200,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 5, tensileStrength: 170, // brittle — low tensile
    workability: 0.2, meltingPoint: 1200,               // lower mp than pure iron
    moisture: 0,
  },

  // ── 46: Hot Steel Ingot (intermediate, must be quenched) ─────────────────
  // Same composition as steel_ingot but unquenched — properties degrade if missed
  46: {
    k: 50, Cp: 490, density: 7850,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 5.5, tensileStrength: 600, // approx unquenched
    workability: 0.5, meltingPoint: 1430,               // malleable at high temp
    moisture: 0,
  },

  // ── 47: Soft Steel (hot steel that missed quench window) ─────────────────
  47: {
    k: 50, Cp: 490, density: 7850,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 4.5, tensileStrength: 350, // approx — quality penalty
    workability: 0.4, meltingPoint: 1430,
    moisture: 0,
  },

  // ── Extended coverage: later-game / exotic materials ──────────────────────

  // ── 57: Wolf Pelt ─────────────────────────────────────────────────────────
  57: {
    k: 0.04, Cp: 2000, density: 120,                    // approx fur
    ignitionTemp: 280, combustionJ_kg: 17_000_000,       // approx
    flammability: 0.35, hardness: 0.5, tensileStrength: 10, // approx
    workability: 0.75, meltingPoint: Infinity,
    moisture: 0.2,                                       // approx fresh pelt
  },

  // ── 58: Boar Tusk (ivory-like dense bone) ────────────────────────────────
  58: {
    k: 0.6, Cp: 1200, density: 1800,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 5, tensileStrength: 100, // approx ivory/dense bone
    workability: 0.35, meltingPoint: Infinity,
    moisture: 0.05,                                      // approx
  },

  // ── 59: Copper Coin ───────────────────────────────────────────────────────
  59: {
    k: 400, Cp: 385, density: 8960,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 3, tensileStrength: 200,
    workability: 0.6, meltingPoint: 1085,
    moisture: 0,
  },

  // ── 61: Salt (NaCl) ───────────────────────────────────────────────────────
  61: {
    k: 6.5, Cp: 880, density: 2160,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 2.5, tensileStrength: 0, // granular
    workability: 0.4, meltingPoint: 801,
    moisture: 0.02,                                      // approx hygroscopic
  },

  // ── 62: Grain (wheat / barley reference) ──────────────────────────────────
  62: {
    k: 0.14, Cp: 1800, density: 800,                    // approx bulk grain
    ignitionTemp: 260, combustionJ_kg: 15_000_000,       // approx
    flammability: 0.5, hardness: 2, tensileStrength: 1, // approx
    workability: 0.5, meltingPoint: Infinity,
    moisture: 0.14,                                      // standard storage moisture ~14%
  },

  // ── 63: Glass Ingot ───────────────────────────────────────────────────────
  63: {
    k: 1.0, Cp: 840, density: 2500,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 5.5, tensileStrength: 50, // approx
    workability: 0.6, meltingPoint: 1100,
    moisture: 0,
  },

  // ── 68: Hydrogen (gas at STP) ────────────────────────────────────────────
  68: {
    k: 0.18, Cp: 14300, density: 0.09,
    ignitionTemp: 500, combustionJ_kg: 120_000_000,      // 120 MJ/kg LHV
    flammability: 0.95, hardness: 0, tensileStrength: 0, // gas
    workability: 0, meltingPoint: -259,                 // 14 K
    moisture: 0,
  },

  // ── 69: Velar Crystal (exotic, game-defined) ─────────────────────────────
  69: {
    k: 50, Cp: 500, density: 3500,                      // approx
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 9, tensileStrength: 500, // approx — exotic hard crystal
    workability: 0.05, meltingPoint: 4000,             // approx exotic material
    moisture: 0,
  },

  // ── 70: Velar Alloy (Velar-transmuted steel) ─────────────────────────────
  70: {
    k: 80, Cp: 450, density: 8200,                      // approx exotic alloy
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 8, tensileStrength: 1200, // approx — far exceeds steel
    workability: 0.2, meltingPoint: 2500,              // approx exotic
    moisture: 0,
  },

  // ── 110: Volcanic Glass (obsidian reference) ──────────────────────────────
  110: {
    k: 1.1, Cp: 840, density: 2400,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 5.5, tensileStrength: 70, // approx — conchoidal fracture edge very sharp
    workability: 0.3, meltingPoint: 700,               // obsidian softens ~700-900°C
    moisture: 0,
  },

  // ── 111: Glacier Ice ──────────────────────────────────────────────────────
  111: {
    k: 2.2, Cp: 2090, density: 917,
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 1.5, tensileStrength: 1, // approx ice
    workability: 0.5, meltingPoint: 0,
    moisture: 1,                                         // it IS water
  },

  // ── 112: Desert Crystal (silicate/gypsum reference) ──────────────────────
  112: {
    k: 1.3, Cp: 800, density: 2320,                    // approx selenite gypsum
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 2, tensileStrength: 3,  // approx gypsum
    workability: 0.3, meltingPoint: 1450,              // approx
    moisture: 0.01,                                     // approx
  },

  // ── 115: Shadow Iron (deep-cave dark ore) ────────────────────────────────
  115: {
    k: 60, Cp: 460, density: 8100,                     // approx dense ferrous ore
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 6, tensileStrength: 500, // approx harder than iron
    workability: 0.2, meltingPoint: 1500,              // approx
    moisture: 0,
  },

  // ── 116: Luminite (bioluminescent crystal) ────────────────────────────────
  116: {
    k: 3.0, Cp: 600, density: 2800,                    // approx
    ignitionTemp: Infinity, combustionJ_kg: 0,
    flammability: 0, hardness: 6, tensileStrength: 40, // approx crystal
    workability: 0.15, meltingPoint: 1800,             // approx exotic crystal
    moisture: 0,
  },
}

const AIR_PROPS = PROPS[0]

export function getMaterialProps(materialId: number): MaterialProps {
  return PROPS[materialId] ?? AIR_PROPS
}
