/**
 * ElementDatabase.ts
 * Real-world data for all 118 elements.
 * Data sourced from: NIST, IUPAC 2021 atomic weights, CRC Handbook of Chemistry and Physics.
 * Values marked null where not applicable (e.g. synthetic radioactive elements with no stable isotopes,
 * noble gases in some categories) or not well-measured.
 */

export interface Element {
  Z:           number         // atomic number
  symbol:      string
  name:        string
  mass:        number         // atomic mass (u / Da) — IUPAC 2021
  meltingC:    number | null  // melting point °C (null = sublimes, decomposes, or unknown)
  boilingC:    number | null  // boiling point °C
  densityGcm3: number | null  // g/cm³ at STP (20°C, 1 atm) — null if gas density listed separately
  electroneg:  number | null  // Pauling electronegativity (null = no data / noble gas)
  oxidStates:  number[]       // common oxidation states
  group:       number | null  // periodic table group (1–18; null = lanthanide/actinide)
  period:      number         // periodic table period (1–7)
  block:       's' | 'p' | 'd' | 'f'
  thermCond:   number | null  // thermal conductivity W/m·K at 25°C
  elecResist:  number | null  // electrical resistivity Ω·m at 20°C
  biological:  boolean        // true if essential to known life
  radioactive: boolean
  colorHex:    string         // approximate color for rendering
}

// Biological essentials (macro + micro nutrients for life)
const BIO = new Set(['H','C','N','O','P','S','Na','K','Ca','Mg','Fe','Cl','Zn','Cu','Mn','I','Mo','Co','Se','Cr'])

export const ELEMENTS: Element[] = [
  // ── Period 1 ──────────────────────────────────────────────────────────────
  { Z:1,  symbol:'H',  name:'Hydrogen',      mass:1.008,      meltingC:-259.16, boilingC:-252.88, densityGcm3:0.00008988, electroneg:2.20, oxidStates:[-1,1],      group:1,  period:1, block:'s', thermCond:0.1805,  elecResist:null,         biological:true,  radioactive:false, colorHex:'#FFFFFF' },
  { Z:2,  symbol:'He', name:'Helium',         mass:4.0026,     meltingC:-272.20, boilingC:-268.93, densityGcm3:0.0001664,  electroneg:null, oxidStates:[0],         group:18, period:1, block:'s', thermCond:0.1513,  elecResist:null,         biological:false, radioactive:false, colorHex:'#D9FFFF' },
  // ── Period 2 ──────────────────────────────────────────────────────────────
  { Z:3,  symbol:'Li', name:'Lithium',        mass:6.94,       meltingC:180.50,  boilingC:1342,    densityGcm3:0.534,      electroneg:0.98, oxidStates:[1],         group:1,  period:2, block:'s', thermCond:84.8,    elecResist:9.28e-8,      biological:false, radioactive:false, colorHex:'#CC80FF' },
  { Z:4,  symbol:'Be', name:'Beryllium',      mass:9.0122,     meltingC:1287,    boilingC:2470,    densityGcm3:1.848,      electroneg:1.57, oxidStates:[2],         group:2,  period:2, block:'s', thermCond:200,     elecResist:3.6e-8,       biological:false, radioactive:false, colorHex:'#C2FF00' },
  { Z:5,  symbol:'B',  name:'Boron',          mass:10.81,      meltingC:2075,    boilingC:4000,    densityGcm3:2.34,       electroneg:2.04, oxidStates:[3],         group:13, period:2, block:'p', thermCond:27.4,    elecResist:1e4,          biological:false, radioactive:false, colorHex:'#FFB5B5' },
  { Z:6,  symbol:'C',  name:'Carbon',         mass:12.011,     meltingC:3550,    boilingC:4827,    densityGcm3:2.267,      electroneg:2.55, oxidStates:[-4,-2,2,4], group:14, period:2, block:'p', thermCond:119,     elecResist:3.5e-5,       biological:true,  radioactive:false, colorHex:'#909090' },
  { Z:7,  symbol:'N',  name:'Nitrogen',       mass:14.007,     meltingC:-210.01, boilingC:-195.79, densityGcm3:0.001251,   electroneg:3.04, oxidStates:[-3,-2,-1,1,2,3,4,5], group:15, period:2, block:'p', thermCond:0.02583, elecResist:null, biological:true,  radioactive:false, colorHex:'#3050F8' },
  { Z:8,  symbol:'O',  name:'Oxygen',         mass:15.999,     meltingC:-218.79, boilingC:-182.96, densityGcm3:0.001429,   electroneg:3.44, oxidStates:[-2,-1,1,2], group:16, period:2, block:'p', thermCond:0.02658, elecResist:null, biological:true,  radioactive:false, colorHex:'#FF0D0D' },
  { Z:9,  symbol:'F',  name:'Fluorine',       mass:18.998,     meltingC:-219.67, boilingC:-188.11, densityGcm3:0.001696,   electroneg:3.98, oxidStates:[-1],        group:17, period:2, block:'p', thermCond:0.0277,  elecResist:null,         biological:false, radioactive:false, colorHex:'#90E050' },
  { Z:10, symbol:'Ne', name:'Neon',           mass:20.180,     meltingC:-248.59, boilingC:-246.08, densityGcm3:0.0008999,  electroneg:null, oxidStates:[0],         group:18, period:2, block:'p', thermCond:0.04906, elecResist:null,         biological:false, radioactive:false, colorHex:'#B3E3F5' },
  // ── Period 3 ──────────────────────────────────────────────────────────────
  { Z:11, symbol:'Na', name:'Sodium',         mass:22.990,     meltingC:97.72,   boilingC:883,     densityGcm3:0.968,      electroneg:0.93, oxidStates:[1],         group:1,  period:3, block:'s', thermCond:142,     elecResist:4.77e-8,      biological:true,  radioactive:false, colorHex:'#AB5CF2' },
  { Z:12, symbol:'Mg', name:'Magnesium',      mass:24.305,     meltingC:650,     boilingC:1090,    densityGcm3:1.738,      electroneg:1.31, oxidStates:[2],         group:2,  period:3, block:'s', thermCond:156,     elecResist:4.42e-8,      biological:true,  radioactive:false, colorHex:'#8AFF00' },
  { Z:13, symbol:'Al', name:'Aluminium',      mass:26.982,     meltingC:660.32,  boilingC:2519,    densityGcm3:2.70,       electroneg:1.61, oxidStates:[3],         group:13, period:3, block:'p', thermCond:237,     elecResist:2.65e-8,      biological:false, radioactive:false, colorHex:'#BFA6A6' },
  { Z:14, symbol:'Si', name:'Silicon',        mass:28.085,     meltingC:1414,    boilingC:3265,    densityGcm3:2.329,      electroneg:1.90, oxidStates:[-4,2,4],    group:14, period:3, block:'p', thermCond:149,     elecResist:6.4e2,        biological:false, radioactive:false, colorHex:'#F0C8A0' },
  { Z:15, symbol:'P',  name:'Phosphorus',     mass:30.974,     meltingC:44.15,   boilingC:280.5,   densityGcm3:1.823,      electroneg:2.19, oxidStates:[-3,1,3,5],  group:15, period:3, block:'p', thermCond:0.236,   elecResist:1e17,         biological:true,  radioactive:false, colorHex:'#FF8000' },
  { Z:16, symbol:'S',  name:'Sulfur',         mass:32.06,      meltingC:115.21,  boilingC:444.72,  densityGcm3:2.067,      electroneg:2.58, oxidStates:[-2,-1,1,2,3,4,5,6], group:16, period:3, block:'p', thermCond:0.205, elecResist:2e15,  biological:true,  radioactive:false, colorHex:'#FFFF30' },
  { Z:17, symbol:'Cl', name:'Chlorine',       mass:35.45,      meltingC:-101.5,  boilingC:-34.05,  densityGcm3:0.003214,   electroneg:3.16, oxidStates:[-1,1,3,5,7], group:17, period:3, block:'p', thermCond:0.0089, elecResist:null,         biological:true,  radioactive:false, colorHex:'#1FF01F' },
  { Z:18, symbol:'Ar', name:'Argon',          mass:39.948,     meltingC:-189.35, boilingC:-185.85, densityGcm3:0.001784,   electroneg:null, oxidStates:[0],         group:18, period:3, block:'p', thermCond:0.01772, elecResist:null,        biological:false, radioactive:false, colorHex:'#80D1E3' },
  // ── Period 4 ──────────────────────────────────────────────────────────────
  { Z:19, symbol:'K',  name:'Potassium',      mass:39.098,     meltingC:63.38,   boilingC:759,     densityGcm3:0.856,      electroneg:0.82, oxidStates:[1],         group:1,  period:4, block:'s', thermCond:102.5,   elecResist:7.2e-8,       biological:true,  radioactive:false, colorHex:'#8F40D4' },
  { Z:20, symbol:'Ca', name:'Calcium',        mass:40.078,     meltingC:842,     boilingC:1484,    densityGcm3:1.55,       electroneg:1.00, oxidStates:[2],         group:2,  period:4, block:'s', thermCond:201,     elecResist:3.36e-8,      biological:true,  radioactive:false, colorHex:'#3DFF00' },
  { Z:21, symbol:'Sc', name:'Scandium',       mass:44.956,     meltingC:1541,    boilingC:2836,    densityGcm3:2.985,      electroneg:1.36, oxidStates:[3],         group:3,  period:4, block:'d', thermCond:15.8,    elecResist:5.5e-7,       biological:false, radioactive:false, colorHex:'#E6E6E6' },
  { Z:22, symbol:'Ti', name:'Titanium',       mass:47.867,     meltingC:1668,    boilingC:3287,    densityGcm3:4.507,      electroneg:1.54, oxidStates:[2,3,4],     group:4,  period:4, block:'d', thermCond:21.9,    elecResist:4.2e-7,       biological:false, radioactive:false, colorHex:'#BFC2C7' },
  { Z:23, symbol:'V',  name:'Vanadium',       mass:50.942,     meltingC:1910,    boilingC:3407,    densityGcm3:6.11,       electroneg:1.63, oxidStates:[2,3,4,5],   group:5,  period:4, block:'d', thermCond:30.7,    elecResist:2.0e-7,       biological:false, radioactive:false, colorHex:'#A6A6AB' },
  { Z:24, symbol:'Cr', name:'Chromium',       mass:51.996,     meltingC:1907,    boilingC:2671,    densityGcm3:7.14,       electroneg:1.66, oxidStates:[2,3,6],     group:6,  period:4, block:'d', thermCond:93.9,    elecResist:1.25e-7,      biological:true,  radioactive:false, colorHex:'#8A99C7' },
  { Z:25, symbol:'Mn', name:'Manganese',      mass:54.938,     meltingC:1246,    boilingC:2061,    densityGcm3:7.47,       electroneg:1.55, oxidStates:[2,3,4,7],   group:7,  period:4, block:'d', thermCond:7.81,    elecResist:1.44e-6,      biological:true,  radioactive:false, colorHex:'#9C7AC7' },
  { Z:26, symbol:'Fe', name:'Iron',           mass:55.845,     meltingC:1538,    boilingC:2861,    densityGcm3:7.874,      electroneg:1.83, oxidStates:[2,3],       group:8,  period:4, block:'d', thermCond:80.4,    elecResist:9.71e-8,      biological:true,  radioactive:false, colorHex:'#E06633' },
  { Z:27, symbol:'Co', name:'Cobalt',         mass:58.933,     meltingC:1495,    boilingC:2927,    densityGcm3:8.90,       electroneg:1.88, oxidStates:[2,3],       group:9,  period:4, block:'d', thermCond:100,     elecResist:6.24e-8,      biological:true,  radioactive:false, colorHex:'#F090A0' },
  { Z:28, symbol:'Ni', name:'Nickel',         mass:58.693,     meltingC:1455,    boilingC:2913,    densityGcm3:8.908,      electroneg:1.91, oxidStates:[2,3],       group:10, period:4, block:'d', thermCond:90.9,    elecResist:6.99e-8,      biological:false, radioactive:false, colorHex:'#50D050' },
  { Z:29, symbol:'Cu', name:'Copper',         mass:63.546,     meltingC:1084.62, boilingC:2562,    densityGcm3:8.96,       electroneg:1.90, oxidStates:[1,2],       group:11, period:4, block:'d', thermCond:401,     elecResist:1.68e-8,      biological:true,  radioactive:false, colorHex:'#C88033' },
  { Z:30, symbol:'Zn', name:'Zinc',           mass:65.38,      meltingC:419.53,  boilingC:907,     densityGcm3:7.133,      electroneg:1.65, oxidStates:[2],         group:12, period:4, block:'d', thermCond:116,     elecResist:5.9e-8,       biological:true,  radioactive:false, colorHex:'#7D80B0' },
  { Z:31, symbol:'Ga', name:'Gallium',        mass:69.723,     meltingC:29.76,   boilingC:2204,    densityGcm3:5.907,      electroneg:1.81, oxidStates:[3],         group:13, period:4, block:'p', thermCond:29.6,    elecResist:1.7e-7,       biological:false, radioactive:false, colorHex:'#C28F8F' },
  { Z:32, symbol:'Ge', name:'Germanium',      mass:72.630,     meltingC:938.25,  boilingC:2833,    densityGcm3:5.323,      electroneg:2.01, oxidStates:[2,4],       group:14, period:4, block:'p', thermCond:59.9,    elecResist:4.6e-1,       biological:false, radioactive:false, colorHex:'#668F8F' },
  { Z:33, symbol:'As', name:'Arsenic',        mass:74.922,     meltingC:817,     boilingC:614,     densityGcm3:5.727,      electroneg:2.18, oxidStates:[-3,3,5],    group:15, period:4, block:'p', thermCond:50.2,    elecResist:2.6e-7,       biological:false, radioactive:false, colorHex:'#BD80E3' },
  { Z:34, symbol:'Se', name:'Selenium',       mass:78.971,     meltingC:221,     boilingC:685,     densityGcm3:4.81,       electroneg:2.55, oxidStates:[-2,4,6],    group:16, period:4, block:'p', thermCond:2.04,    elecResist:1e3,          biological:true,  radioactive:false, colorHex:'#FFA100' },
  { Z:35, symbol:'Br', name:'Bromine',        mass:79.904,     meltingC:-7.25,   boilingC:58.9,    densityGcm3:3.122,      electroneg:2.96, oxidStates:[-1,1,3,5],  group:17, period:4, block:'p', thermCond:0.122,   elecResist:null,         biological:false, radioactive:false, colorHex:'#A62929' },
  { Z:36, symbol:'Kr', name:'Krypton',        mass:83.798,     meltingC:-157.36, boilingC:-153.22, densityGcm3:0.003749,   electroneg:null, oxidStates:[0,2],       group:18, period:4, block:'p', thermCond:0.00943, elecResist:null,         biological:false, radioactive:false, colorHex:'#5CB8D1' },
  // ── Period 5 ──────────────────────────────────────────────────────────────
  { Z:37, symbol:'Rb', name:'Rubidium',       mass:85.468,     meltingC:39.31,   boilingC:688,     densityGcm3:1.532,      electroneg:0.82, oxidStates:[1],         group:1,  period:5, block:'s', thermCond:58.2,    elecResist:1.2e-7,       biological:false, radioactive:false, colorHex:'#702EB0' },
  { Z:38, symbol:'Sr', name:'Strontium',      mass:87.62,      meltingC:777,     boilingC:1382,    densityGcm3:2.64,       electroneg:0.95, oxidStates:[2],         group:2,  period:5, block:'s', thermCond:35.4,    elecResist:1.32e-7,      biological:false, radioactive:false, colorHex:'#00FF00' },
  { Z:39, symbol:'Y',  name:'Yttrium',        mass:88.906,     meltingC:1526,    boilingC:3336,    densityGcm3:4.472,      electroneg:1.22, oxidStates:[3],         group:3,  period:5, block:'d', thermCond:17.2,    elecResist:5.6e-7,       biological:false, radioactive:false, colorHex:'#94FFFF' },
  { Z:40, symbol:'Zr', name:'Zirconium',      mass:91.224,     meltingC:1855,    boilingC:4409,    densityGcm3:6.511,      electroneg:1.33, oxidStates:[4],         group:4,  period:5, block:'d', thermCond:22.6,    elecResist:4.2e-7,       biological:false, radioactive:false, colorHex:'#94E0E0' },
  { Z:41, symbol:'Nb', name:'Niobium',        mass:92.906,     meltingC:2477,    boilingC:4744,    densityGcm3:8.57,       electroneg:1.60, oxidStates:[3,5],       group:5,  period:5, block:'d', thermCond:53.7,    elecResist:1.52e-7,      biological:false, radioactive:false, colorHex:'#73C2C9' },
  { Z:42, symbol:'Mo', name:'Molybdenum',     mass:95.95,      meltingC:2623,    boilingC:4639,    densityGcm3:10.22,      electroneg:2.16, oxidStates:[2,3,4,5,6], group:6,  period:5, block:'d', thermCond:138,     elecResist:5.34e-8,      biological:true,  radioactive:false, colorHex:'#54B5B5' },
  { Z:43, symbol:'Tc', name:'Technetium',     mass:97,         meltingC:2157,    boilingC:4265,    densityGcm3:11.5,       electroneg:1.90, oxidStates:[4,7],       group:7,  period:5, block:'d', thermCond:50.6,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#3B9E9E' },
  { Z:44, symbol:'Ru', name:'Ruthenium',      mass:101.07,     meltingC:2334,    boilingC:4150,    densityGcm3:12.37,      electroneg:2.20, oxidStates:[2,3,4,6,8], group:8,  period:5, block:'d', thermCond:117,     elecResist:7.1e-8,       biological:false, radioactive:false, colorHex:'#248F8F' },
  { Z:45, symbol:'Rh', name:'Rhodium',        mass:102.906,    meltingC:1964,    boilingC:3695,    densityGcm3:12.45,      electroneg:2.28, oxidStates:[3],         group:9,  period:5, block:'d', thermCond:150,     elecResist:4.33e-8,      biological:false, radioactive:false, colorHex:'#0A7D8C' },
  { Z:46, symbol:'Pd', name:'Palladium',      mass:106.42,     meltingC:1554.9,  boilingC:2963,    densityGcm3:12.023,     electroneg:2.20, oxidStates:[2,4],       group:10, period:5, block:'d', thermCond:71.8,    elecResist:1.05e-7,      biological:false, radioactive:false, colorHex:'#006985' },
  { Z:47, symbol:'Ag', name:'Silver',         mass:107.868,    meltingC:961.78,  boilingC:2162,    densityGcm3:10.49,      electroneg:1.93, oxidStates:[1],         group:11, period:5, block:'d', thermCond:429,     elecResist:1.59e-8,      biological:false, radioactive:false, colorHex:'#C0C0C0' },
  { Z:48, symbol:'Cd', name:'Cadmium',        mass:112.414,    meltingC:321.07,  boilingC:767,     densityGcm3:8.65,       electroneg:1.69, oxidStates:[2],         group:12, period:5, block:'d', thermCond:96.9,    elecResist:7.27e-8,      biological:false, radioactive:false, colorHex:'#FFD98F' },
  { Z:49, symbol:'In', name:'Indium',         mass:114.818,    meltingC:156.60,  boilingC:2072,    densityGcm3:7.31,       electroneg:1.78, oxidStates:[3],         group:13, period:5, block:'p', thermCond:81.8,    elecResist:8.37e-8,      biological:false, radioactive:false, colorHex:'#A67573' },
  { Z:50, symbol:'Sn', name:'Tin',            mass:118.710,    meltingC:231.93,  boilingC:2602,    densityGcm3:7.287,      electroneg:1.96, oxidStates:[2,4],       group:14, period:5, block:'p', thermCond:66.8,    elecResist:1.09e-7,      biological:false, radioactive:false, colorHex:'#668080' },
  { Z:51, symbol:'Sb', name:'Antimony',       mass:121.760,    meltingC:630.63,  boilingC:1587,    densityGcm3:6.685,      electroneg:2.05, oxidStates:[-3,3,5],    group:15, period:5, block:'p', thermCond:24.3,    elecResist:3.9e-7,       biological:false, radioactive:false, colorHex:'#9E63B5' },
  { Z:52, symbol:'Te', name:'Tellurium',      mass:127.60,     meltingC:449.51,  boilingC:988,     densityGcm3:6.232,      electroneg:2.10, oxidStates:[-2,4,6],    group:16, period:5, block:'p', thermCond:3.0,     elecResist:1e-4,         biological:false, radioactive:false, colorHex:'#D47A00' },
  { Z:53, symbol:'I',  name:'Iodine',         mass:126.904,    meltingC:113.70,  boilingC:184.4,   densityGcm3:4.933,      electroneg:2.66, oxidStates:[-1,1,3,5,7], group:17, period:5, block:'p', thermCond:0.449,  elecResist:null,         biological:true,  radioactive:false, colorHex:'#940094' },
  { Z:54, symbol:'Xe', name:'Xenon',          mass:131.293,    meltingC:-111.80, boilingC:-108.13, densityGcm3:0.005894,   electroneg:null, oxidStates:[0,2,4,6,8], group:18, period:5, block:'p', thermCond:0.00565, elecResist:null,         biological:false, radioactive:false, colorHex:'#429EB0' },
  // ── Period 6 ──────────────────────────────────────────────────────────────
  { Z:55, symbol:'Cs', name:'Caesium',        mass:132.905,    meltingC:28.44,   boilingC:671,     densityGcm3:1.873,      electroneg:0.79, oxidStates:[1],         group:1,  period:6, block:'s', thermCond:35.9,    elecResist:2.0e-7,       biological:false, radioactive:false, colorHex:'#57178F' },
  { Z:56, symbol:'Ba', name:'Barium',         mass:137.327,    meltingC:727,     boilingC:1845,    densityGcm3:3.51,       electroneg:0.89, oxidStates:[2],         group:2,  period:6, block:'s', thermCond:18.4,    elecResist:3.5e-7,       biological:false, radioactive:false, colorHex:'#00C900' },
  // Lanthanides (group null, period 6, f-block)
  { Z:57, symbol:'La', name:'Lanthanum',      mass:138.905,    meltingC:920,     boilingC:3464,    densityGcm3:6.162,      electroneg:1.10, oxidStates:[3],         group:null, period:6, block:'f', thermCond:13.4,  elecResist:6.15e-7,      biological:false, radioactive:false, colorHex:'#70D4FF' },
  { Z:58, symbol:'Ce', name:'Cerium',         mass:140.116,    meltingC:798,     boilingC:3443,    densityGcm3:6.770,      electroneg:1.12, oxidStates:[3,4],       group:null, period:6, block:'f', thermCond:11.3,  elecResist:7.28e-7,      biological:false, radioactive:false, colorHex:'#FFFFC7' },
  { Z:59, symbol:'Pr', name:'Praseodymium',   mass:140.908,    meltingC:931,     boilingC:3520,    densityGcm3:6.77,       electroneg:1.13, oxidStates:[3,4],       group:null, period:6, block:'f', thermCond:12.5,  elecResist:6.8e-7,       biological:false, radioactive:false, colorHex:'#D9FFC7' },
  { Z:60, symbol:'Nd', name:'Neodymium',      mass:144.242,    meltingC:1021,    boilingC:3074,    densityGcm3:7.01,       electroneg:1.14, oxidStates:[3],         group:null, period:6, block:'f', thermCond:16.5,  elecResist:6.44e-7,      biological:false, radioactive:false, colorHex:'#C7FFC7' },
  { Z:61, symbol:'Pm', name:'Promethium',     mass:145,        meltingC:1042,    boilingC:3000,    densityGcm3:7.26,       electroneg:1.13, oxidStates:[3],         group:null, period:6, block:'f', thermCond:17.9,  elecResist:null,         biological:false, radioactive:true,  colorHex:'#A3FFC7' },
  { Z:62, symbol:'Sm', name:'Samarium',       mass:150.36,     meltingC:1072,    boilingC:1794,    densityGcm3:7.52,       electroneg:1.17, oxidStates:[2,3],       group:null, period:6, block:'f', thermCond:13.3,  elecResist:9.4e-7,       biological:false, radioactive:false, colorHex:'#8FFFC7' },
  { Z:63, symbol:'Eu', name:'Europium',       mass:151.964,    meltingC:822,     boilingC:1529,    densityGcm3:5.244,      electroneg:null, oxidStates:[2,3],       group:null, period:6, block:'f', thermCond:13.9,  elecResist:9.0e-7,       biological:false, radioactive:false, colorHex:'#61FFC7' },
  { Z:64, symbol:'Gd', name:'Gadolinium',     mass:157.25,     meltingC:1313,    boilingC:3273,    densityGcm3:7.90,       electroneg:1.20, oxidStates:[3],         group:null, period:6, block:'f', thermCond:10.6,  elecResist:1.31e-6,      biological:false, radioactive:false, colorHex:'#45FFC7' },
  { Z:65, symbol:'Tb', name:'Terbium',        mass:158.925,    meltingC:1356,    boilingC:3230,    densityGcm3:8.23,       electroneg:null, oxidStates:[3,4],       group:null, period:6, block:'f', thermCond:11.1,  elecResist:1.15e-6,      biological:false, radioactive:false, colorHex:'#30FFC7' },
  { Z:66, symbol:'Dy', name:'Dysprosium',     mass:162.500,    meltingC:1412,    boilingC:2567,    densityGcm3:8.551,      electroneg:1.22, oxidStates:[3],         group:null, period:6, block:'f', thermCond:10.7,  elecResist:9.26e-7,      biological:false, radioactive:false, colorHex:'#1FFFC7' },
  { Z:67, symbol:'Ho', name:'Holmium',        mass:164.930,    meltingC:1474,    boilingC:2700,    densityGcm3:8.795,      electroneg:1.23, oxidStates:[3],         group:null, period:6, block:'f', thermCond:16.2,  elecResist:8.14e-7,      biological:false, radioactive:false, colorHex:'#00FF9C' },
  { Z:68, symbol:'Er', name:'Erbium',         mass:167.259,    meltingC:1529,    boilingC:2868,    densityGcm3:9.066,      electroneg:1.24, oxidStates:[3],         group:null, period:6, block:'f', thermCond:14.5,  elecResist:8.6e-7,       biological:false, radioactive:false, colorHex:'#00E675' },
  { Z:69, symbol:'Tm', name:'Thulium',        mass:168.934,    meltingC:1545,    boilingC:1950,    densityGcm3:9.321,      electroneg:1.25, oxidStates:[2,3],       group:null, period:6, block:'f', thermCond:16.9,  elecResist:6.76e-7,      biological:false, radioactive:false, colorHex:'#00D452' },
  { Z:70, symbol:'Yb', name:'Ytterbium',      mass:173.045,    meltingC:824,     boilingC:1196,    densityGcm3:6.965,      electroneg:null, oxidStates:[2,3],       group:null, period:6, block:'f', thermCond:38.5,  elecResist:2.8e-7,       biological:false, radioactive:false, colorHex:'#00BF38' },
  { Z:71, symbol:'Lu', name:'Lutetium',       mass:174.967,    meltingC:1663,    boilingC:3402,    densityGcm3:9.841,      electroneg:1.27, oxidStates:[3],         group:3,  period:6, block:'d', thermCond:16.4,   elecResist:5.82e-7,      biological:false, radioactive:false, colorHex:'#00AB24' },
  { Z:72, symbol:'Hf', name:'Hafnium',        mass:178.486,    meltingC:2233,    boilingC:4603,    densityGcm3:13.31,      electroneg:1.30, oxidStates:[4],         group:4,  period:6, block:'d', thermCond:23.0,    elecResist:3.3e-7,       biological:false, radioactive:false, colorHex:'#4DC2FF' },
  { Z:73, symbol:'Ta', name:'Tantalum',       mass:180.948,    meltingC:3017,    boilingC:5458,    densityGcm3:16.65,      electroneg:1.50, oxidStates:[5],         group:5,  period:6, block:'d', thermCond:57.5,    elecResist:1.31e-7,      biological:false, radioactive:false, colorHex:'#4DA6FF' },
  { Z:74, symbol:'W',  name:'Tungsten',       mass:183.84,     meltingC:3422,    boilingC:5555,    densityGcm3:19.25,      electroneg:2.36, oxidStates:[4,6],       group:6,  period:6, block:'d', thermCond:173,     elecResist:5.28e-8,      biological:false, radioactive:false, colorHex:'#2194D6' },
  { Z:75, symbol:'Re', name:'Rhenium',        mass:186.207,    meltingC:3186,    boilingC:5596,    densityGcm3:21.02,      electroneg:1.90, oxidStates:[4,7],       group:7,  period:6, block:'d', thermCond:48.0,    elecResist:1.93e-7,      biological:false, radioactive:false, colorHex:'#267DAB' },
  { Z:76, symbol:'Os', name:'Osmium',         mass:190.23,     meltingC:3033,    boilingC:5012,    densityGcm3:22.587,     electroneg:2.20, oxidStates:[4,8],       group:8,  period:6, block:'d', thermCond:87.6,    elecResist:8.1e-8,       biological:false, radioactive:false, colorHex:'#266696' },
  { Z:77, symbol:'Ir', name:'Iridium',        mass:192.217,    meltingC:2446,    boilingC:4428,    densityGcm3:22.562,     electroneg:2.20, oxidStates:[3,4],       group:9,  period:6, block:'d', thermCond:147,     elecResist:4.71e-8,      biological:false, radioactive:false, colorHex:'#175487' },
  { Z:78, symbol:'Pt', name:'Platinum',       mass:195.084,    meltingC:1768.3,  boilingC:3825,    densityGcm3:21.45,      electroneg:2.28, oxidStates:[2,4],       group:10, period:6, block:'d', thermCond:71.6,    elecResist:1.06e-7,      biological:false, radioactive:false, colorHex:'#D0D0E0' },
  { Z:79, symbol:'Au', name:'Gold',           mass:196.967,    meltingC:1064.18, boilingC:2856,    densityGcm3:19.32,      electroneg:2.54, oxidStates:[1,3],       group:11, period:6, block:'d', thermCond:318,     elecResist:2.21e-8,      biological:false, radioactive:false, colorHex:'#FFD123' },
  { Z:80, symbol:'Hg', name:'Mercury',        mass:200.592,    meltingC:-38.83,  boilingC:356.73,  densityGcm3:13.534,     electroneg:2.00, oxidStates:[1,2],       group:12, period:6, block:'d', thermCond:8.30,    elecResist:9.58e-7,      biological:false, radioactive:false, colorHex:'#B8B8D0' },
  { Z:81, symbol:'Tl', name:'Thallium',       mass:204.38,     meltingC:304,     boilingC:1473,    densityGcm3:11.85,      electroneg:1.62, oxidStates:[1,3],       group:13, period:6, block:'p', thermCond:46.1,    elecResist:1.8e-7,       biological:false, radioactive:false, colorHex:'#A6544D' },
  { Z:82, symbol:'Pb', name:'Lead',           mass:207.2,      meltingC:327.46,  boilingC:1749,    densityGcm3:11.34,      electroneg:2.33, oxidStates:[2,4],       group:14, period:6, block:'p', thermCond:35.3,    elecResist:2.08e-7,      biological:false, radioactive:false, colorHex:'#575961' },
  { Z:83, symbol:'Bi', name:'Bismuth',        mass:208.980,    meltingC:271.40,  boilingC:1564,    densityGcm3:9.807,      electroneg:2.02, oxidStates:[3,5],       group:15, period:6, block:'p', thermCond:7.97,    elecResist:1.29e-6,      biological:false, radioactive:false, colorHex:'#9E4FB5' },
  { Z:84, symbol:'Po', name:'Polonium',       mass:209,        meltingC:254,     boilingC:962,     densityGcm3:9.32,       electroneg:2.00, oxidStates:[2,4],       group:16, period:6, block:'p', thermCond:20,      elecResist:4.0e-7,       biological:false, radioactive:true,  colorHex:'#AB5C00' },
  { Z:85, symbol:'At', name:'Astatine',       mass:210,        meltingC:302,     boilingC:337,     densityGcm3:null,       electroneg:2.20, oxidStates:[-1,1,3,5],  group:17, period:6, block:'p', thermCond:2.0,     elecResist:null,         biological:false, radioactive:true,  colorHex:'#754F45' },
  { Z:86, symbol:'Rn', name:'Radon',          mass:222,        meltingC:-71,     boilingC:-61.7,   densityGcm3:0.00973,    electroneg:null, oxidStates:[0,2],       group:18, period:6, block:'p', thermCond:0.00361, elecResist:null,         biological:false, radioactive:true,  colorHex:'#428296' },
  // ── Period 7 ──────────────────────────────────────────────────────────────
  { Z:87, symbol:'Fr', name:'Francium',       mass:223,        meltingC:27,      boilingC:677,     densityGcm3:1.87,       electroneg:0.70, oxidStates:[1],         group:1,  period:7, block:'s', thermCond:15,      elecResist:null,         biological:false, radioactive:true,  colorHex:'#420066' },
  { Z:88, symbol:'Ra', name:'Radium',         mass:226,        meltingC:696,     boilingC:1413,    densityGcm3:5.5,        electroneg:0.90, oxidStates:[2],         group:2,  period:7, block:'s', thermCond:18.6,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#007D00' },
  // Actinides (group null, period 7, f-block)
  { Z:89, symbol:'Ac', name:'Actinium',       mass:227,        meltingC:1050,    boilingC:3200,    densityGcm3:10.07,      electroneg:1.10, oxidStates:[3],         group:null, period:7, block:'f', thermCond:12,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#70ABFA' },
  { Z:90, symbol:'Th', name:'Thorium',        mass:232.038,    meltingC:1750,    boilingC:4788,    densityGcm3:11.72,      electroneg:1.30, oxidStates:[4],         group:null, period:7, block:'f', thermCond:54.0,  elecResist:1.47e-7,      biological:false, radioactive:true,  colorHex:'#00BAFF' },
  { Z:91, symbol:'Pa', name:'Protactinium',   mass:231.036,    meltingC:1572,    boilingC:4000,    densityGcm3:15.37,      electroneg:1.50, oxidStates:[4,5],       group:null, period:7, block:'f', thermCond:47,    elecResist:1.8e-7,       biological:false, radioactive:true,  colorHex:'#00A1FF' },
  { Z:92, symbol:'U',  name:'Uranium',        mass:238.029,    meltingC:1132.2,  boilingC:4131,    densityGcm3:19.05,      electroneg:1.38, oxidStates:[3,4,5,6],   group:null, period:7, block:'f', thermCond:27.5,  elecResist:2.8e-7,       biological:false, radioactive:true,  colorHex:'#008FFF' },
  { Z:93, symbol:'Np', name:'Neptunium',      mass:237,        meltingC:644,     boilingC:4000,    densityGcm3:20.45,      electroneg:1.36, oxidStates:[3,4,5,6],   group:null, period:7, block:'f', thermCond:6.3,   elecResist:1.22e-6,      biological:false, radioactive:true,  colorHex:'#0080FF' },
  { Z:94, symbol:'Pu', name:'Plutonium',      mass:244,        meltingC:640,     boilingC:3228,    densityGcm3:19.816,     electroneg:1.28, oxidStates:[3,4,5,6],   group:null, period:7, block:'f', thermCond:6.74,  elecResist:1.46e-6,      biological:false, radioactive:true,  colorHex:'#006BFF' },
  { Z:95, symbol:'Am', name:'Americium',      mass:243,        meltingC:1176,    boilingC:2011,    densityGcm3:13.67,      electroneg:1.30, oxidStates:[3,4,5,6],   group:null, period:7, block:'f', thermCond:10,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#545CF2' },
  { Z:96, symbol:'Cm', name:'Curium',         mass:247,        meltingC:1340,    boilingC:3110,    densityGcm3:13.51,      electroneg:1.30, oxidStates:[3],         group:null, period:7, block:'f', thermCond:null,  elecResist:null,         biological:false, radioactive:true,  colorHex:'#785CE3' },
  { Z:97, symbol:'Bk', name:'Berkelium',      mass:247,        meltingC:986,     boilingC:null,    densityGcm3:14.78,      electroneg:1.30, oxidStates:[3,4],       group:null, period:7, block:'f', thermCond:10,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#8A4FE3' },
  { Z:98, symbol:'Cf', name:'Californium',    mass:251,        meltingC:900,     boilingC:null,    densityGcm3:15.1,       electroneg:1.30, oxidStates:[3],         group:null, period:7, block:'f', thermCond:null,  elecResist:null,         biological:false, radioactive:true,  colorHex:'#A136D4' },
  { Z:99, symbol:'Es', name:'Einsteinium',    mass:252,        meltingC:860,     boilingC:null,    densityGcm3:null,       electroneg:1.30, oxidStates:[3],         group:null, period:7, block:'f', thermCond:null,  elecResist:null,         biological:false, radioactive:true,  colorHex:'#B31FD4' },
  { Z:100, symbol:'Fm', name:'Fermium',       mass:257,        meltingC:1527,    boilingC:null,    densityGcm3:null,       electroneg:1.30, oxidStates:[3],         group:null, period:7, block:'f', thermCond:null,  elecResist:null,         biological:false, radioactive:true,  colorHex:'#B31FBA' },
  { Z:101, symbol:'Md', name:'Mendelevium',   mass:258,        meltingC:827,     boilingC:null,    densityGcm3:null,       electroneg:1.30, oxidStates:[2,3],       group:null, period:7, block:'f', thermCond:null,  elecResist:null,         biological:false, radioactive:true,  colorHex:'#B30DA6' },
  { Z:102, symbol:'No', name:'Nobelium',      mass:259,        meltingC:827,     boilingC:null,    densityGcm3:null,       electroneg:1.30, oxidStates:[2,3],       group:null, period:7, block:'f', thermCond:null,  elecResist:null,         biological:false, radioactive:true,  colorHex:'#BD0D87' },
  { Z:103, symbol:'Lr', name:'Lawrencium',    mass:262,        meltingC:1627,    boilingC:null,    densityGcm3:null,       electroneg:null, oxidStates:[3],         group:3,  period:7, block:'d', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#C70066' },
  { Z:104, symbol:'Rf', name:'Rutherfordium', mass:267,        meltingC:2100,    boilingC:5500,    densityGcm3:23.2,       electroneg:null, oxidStates:[4],         group:4,  period:7, block:'d', thermCond:23,      elecResist:null,         biological:false, radioactive:true,  colorHex:'#CC0059' },
  { Z:105, symbol:'Db', name:'Dubnium',       mass:268,        meltingC:null,    boilingC:null,    densityGcm3:29.3,       electroneg:null, oxidStates:[5],         group:5,  period:7, block:'d', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#D1004F' },
  { Z:106, symbol:'Sg', name:'Seaborgium',    mass:271,        meltingC:null,    boilingC:null,    densityGcm3:35.0,       electroneg:null, oxidStates:[6],         group:6,  period:7, block:'d', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#D90045' },
  { Z:107, symbol:'Bh', name:'Bohrium',       mass:272,        meltingC:null,    boilingC:null,    densityGcm3:37.1,       electroneg:null, oxidStates:[7],         group:7,  period:7, block:'d', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#E00038' },
  { Z:108, symbol:'Hs', name:'Hassium',       mass:277,        meltingC:null,    boilingC:null,    densityGcm3:40.7,       electroneg:null, oxidStates:[8],         group:8,  period:7, block:'d', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#E6002E' },
  { Z:109, symbol:'Mt', name:'Meitnerium',    mass:278,        meltingC:null,    boilingC:null,    densityGcm3:37.4,       electroneg:null, oxidStates:[],          group:9,  period:7, block:'d', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#EB0026' },
  { Z:110, symbol:'Ds', name:'Darmstadtium',  mass:281,        meltingC:null,    boilingC:null,    densityGcm3:34.8,       electroneg:null, oxidStates:[],          group:10, period:7, block:'d', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#F0001E' },
  { Z:111, symbol:'Rg', name:'Roentgenium',   mass:282,        meltingC:null,    boilingC:null,    densityGcm3:28.7,       electroneg:null, oxidStates:[],          group:11, period:7, block:'d', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#F50016' },
  { Z:112, symbol:'Cn', name:'Copernicium',   mass:285,        meltingC:null,    boilingC:357,     densityGcm3:23.7,       electroneg:null, oxidStates:[],          group:12, period:7, block:'d', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#FA000D' },
  { Z:113, symbol:'Nh', name:'Nihonium',      mass:286,        meltingC:430,     boilingC:1130,    densityGcm3:16,         electroneg:null, oxidStates:[1,3],       group:13, period:7, block:'p', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#FF0005' },
  { Z:114, symbol:'Fl', name:'Flerovium',     mass:289,        meltingC:null,    boilingC:null,    densityGcm3:14,         electroneg:null, oxidStates:[2],         group:14, period:7, block:'p', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#FF0000' },
  { Z:115, symbol:'Mc', name:'Moscovium',     mass:290,        meltingC:400,     boilingC:1100,    densityGcm3:null,       electroneg:null, oxidStates:[1,3],       group:15, period:7, block:'p', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#FF0009' },
  { Z:116, symbol:'Lv', name:'Livermorium',   mass:293,        meltingC:364,     boilingC:762,     densityGcm3:12.9,       electroneg:null, oxidStates:[2,4],       group:16, period:7, block:'p', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#FF0012' },
  { Z:117, symbol:'Ts', name:'Tennessine',    mass:294,        meltingC:350,     boilingC:610,     densityGcm3:7.2,        electroneg:null, oxidStates:[-1,1,3,5],  group:17, period:7, block:'p', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#FF001B' },
  { Z:118, symbol:'Og', name:'Oganesson',     mass:294,        meltingC:52,      boilingC:177,     densityGcm3:7.0,        electroneg:null, oxidStates:[],          group:18, period:7, block:'p', thermCond:null,    elecResist:null,         biological:false, radioactive:true,  colorHex:'#FF0024' },
]

// Mark biological elements based on symbol lookup
ELEMENTS.forEach(el => { el.biological = BIO.has(el.symbol) })

// ── Lookup helpers ────────────────────────────────────────────────────────────

const _byZ   = new Map<number, Element>(ELEMENTS.map(e => [e.Z, e]))
const _bySym = new Map<string, Element>(ELEMENTS.map(e => [e.symbol, e]))

export function getElementById(Z: number): Element {
  const el = _byZ.get(Z)
  if (!el) throw new RangeError(`No element with Z=${Z}`)
  return el
}

export function getBySymbol(sym: string): Element | undefined {
  return _bySym.get(sym)
}

// ── Material type enum ────────────────────────────────────────────────────────

export const enum MaterialType {
  Vacuum   = 0,
  Air      = 1,
  Water    = 2,
  Stone    = 3,
  Soil     = 4,
  Sand     = 5,
  Iron     = 6,
  Gold     = 7,
  Lava     = 8,
  Ice      = 9,
  Wood     = 10,
  Grass    = 11,
  Fire     = 12,
  Smoke    = 13,
  Steam    = 14,
  Oil      = 15,
  Salt     = 16,
  Organic  = 17,
  Bone     = 18,
  Blood    = 19,
  ChemSoup = 20,
}

/**
 * Thermal conductivity (W/m·K) for each MaterialType.
 * Real values from CRC Handbook / engineering references.
 */
export const MATERIAL_THERMAL_CONDUCTIVITY: Record<MaterialType, number> = {
  [MaterialType.Vacuum]:   0,        // perfect insulator
  [MaterialType.Air]:      0.026,    // dry air at 25°C
  [MaterialType.Water]:    0.6,      // liquid water at 25°C
  [MaterialType.Stone]:    2.5,      // granite ~2.5–3.0
  [MaterialType.Soil]:     0.5,      // moist soil average
  [MaterialType.Sand]:     0.27,     // dry quartz sand
  [MaterialType.Iron]:     80.4,     // pure iron at 25°C
  [MaterialType.Gold]:     318,      // gold at 25°C
  [MaterialType.Lava]:     1.0,      // basaltic lava (solid ~2; liquid ~1)
  [MaterialType.Ice]:      2.2,      // water ice at 0°C
  [MaterialType.Wood]:     0.12,     // average wood (pine)
  [MaterialType.Grass]:    0.08,     // vegetative matter
  [MaterialType.Fire]:     0.07,     // hot gas approximation
  [MaterialType.Smoke]:    0.03,     // smoke gas
  [MaterialType.Steam]:    0.025,    // steam at 100°C
  [MaterialType.Oil]:      0.15,     // mineral oil
  [MaterialType.Salt]:     6.0,      // NaCl crystal
  [MaterialType.Organic]:  0.2,      // generic organic tissue
  [MaterialType.Bone]:     0.56,     // cortical bone
  [MaterialType.Blood]:    0.52,     // blood at 37°C
  [MaterialType.ChemSoup]: 0.4,      // aqueous chemical mixture estimate
}
