// ── VelarLanguageSystem.ts ────────────────────────────────────────────────────
// M14 Track B: Procedural Velar symbol alphabet and message decoding.
//
// The Velar are an ancient civilization that seeded life across the galaxy.
// They communicate through a procedural symbol system — 5 unique glyphs —
// seeded from the world seed so every universe has a different Velar language.
//
// Decoding mechanic:
//   Players see 5 symbols in the VELAR_RESPONSE message.
//   Each symbol maps to a concept (life, star, path, here, come).
//   Players decode by pattern-matching each symbol to its concept using
//   contextual clues from probe data and the Velar response message.
//   When all 5 are decoded, the gateway coordinates are revealed.
//
// Symbol geometry: each symbol is an SVG path string generated from the seed.
// The same seed always produces the same alphabet — deterministic across sessions.

// ── Seeded random ─────────────────────────────────────────────────────────────

function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// ── Symbol concepts (fixed order — only the GLYPHS vary per seed) ─────────────

export const VELAR_CONCEPTS = ['life', 'star', 'path', 'here', 'come'] as const
export type VelarConcept = typeof VELAR_CONCEPTS[number]

export const CONCEPT_HINTS: Record<VelarConcept, string> = {
  life:  'The spiral branching form — organic, recursive, like DNA helix',
  star:  'Radiating lines from a central point — stellar emission pattern',
  path:  'A flowing curve with directional arrow — trajectory, journey',
  here:  'Concentric rings closing inward — a location, a coordinate',
  come:  'Open form reaching outward — invitation, approach, welcome',
}

export const CONCEPT_LABELS: Record<VelarConcept, string> = {
  life:  'Life / Genesis',
  star:  'Star / Origin',
  path:  'Path / Journey',
  here:  'Here / Location',
  come:  'Come / Welcome',
}

// ── SVG glyph generation ──────────────────────────────────────────────────────
// Each glyph is a 64x64 SVG path. The geometry varies by seed but the concept
// category shapes the base structure (organic spiral, radial, flowing, etc.)

function generateLifeGlyph(rand: () => number): string {
  // Spiral double helix — organic, recursive
  const cx = 32, cy = 32
  let d = `M ${cx} ${cy}`
  for (let i = 0; i < 12; i++) {
    const a  = i * 0.6 + rand() * 0.3
    const r  = 4 + i * 2.2 + rand() * 1.5
    const x  = cx + Math.cos(a) * r
    const y  = cy + Math.sin(a) * r
    const xm = cx + Math.cos(a + 0.3) * (r * 0.7)
    const ym = cy + Math.sin(a + 0.3) * (r * 0.7)
    d += ` Q ${xm.toFixed(1)} ${ym.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
  }
  // Branch cross
  const br = 8 + rand() * 4
  d += ` M ${cx - br} ${cy + 5} L ${cx + br} ${cy + 5}`
  d += ` M ${cx} ${cy + 5 - br * 0.6} L ${cx} ${cy + 5 + br * 0.6}`
  return d
}

function generateStarGlyph(rand: () => number): string {
  // Radial spokes from center
  const cx = 32, cy = 32
  const spokes = 6 + Math.floor(rand() * 3)
  let d = ''
  for (let i = 0; i < spokes; i++) {
    const a   = (i / spokes) * Math.PI * 2 + rand() * 0.2
    const len = 16 + rand() * 8
    const x   = cx + Math.cos(a) * len
    const y   = cy + Math.sin(a) * len
    const mx  = cx + Math.cos(a + 0.15) * len * 0.5
    const my  = cy + Math.sin(a + 0.15) * len * 0.5
    d += `M ${cx} ${cy} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)} `
    // Serifs
    const se  = 3 + rand() * 2
    const pa  = a + Math.PI / 2
    d += `M ${x.toFixed(1)} ${y.toFixed(1)} L ${(x + Math.cos(pa) * se).toFixed(1)} ${(y + Math.sin(pa) * se).toFixed(1)} `
    d += `M ${x.toFixed(1)} ${y.toFixed(1)} L ${(x - Math.cos(pa) * se).toFixed(1)} ${(y - Math.sin(pa) * se).toFixed(1)} `
  }
  // Central circle
  d += `M ${cx + 4} ${cy} A 4 4 0 0 1 ${cx - 4} ${cy} A 4 4 0 0 1 ${cx + 4} ${cy}`
  return d
}

function generatePathGlyph(rand: () => number): string {
  // Flowing S-curve with directional terminus
  const startY = 20 + rand() * 8
  const c1x = 20 + rand() * 5, c1y = 10 + rand() * 5
  const c2x = 35 + rand() * 5, c2y = 45 + rand() * 5
  const ey = 32 + rand() * 6   // curve endpoint y — reused for arrowhead
  let d = `M 10 ${startY}`
  d += ` C ${c1x} ${c1y} ${c2x} ${c2y} 54 ${ey}`
  // Arrow head aligned to curve endpoint
  const ex = 54
  d += ` M ${ex - 6} ${ey - 5} L ${ex} ${ey} L ${ex - 6} ${ey + 5}`
  // Tick marks along path
  for (let i = 0; i < 3; i++) {
    const tx = 18 + i * 12 + rand() * 4
    const ty = 28 + rand() * 8
    d += ` M ${tx} ${ty - 4} L ${tx} ${ty + 4}`
  }
  return d
}

function generateHereGlyph(rand: () => number): string {
  // Concentric rings closing inward — target / location
  const cx = 32, cy = 32
  let d = ''
  const rings = 3 + Math.floor(rand() * 2)
  for (let i = 0; i < rings; i++) {
    const r  = 4 + i * (7 + rand() * 2)
    const gap = rand() * 0.4
    d += `M ${(cx + r).toFixed(1)} ${cy.toFixed(1)} `
    d += `A ${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(cx + r * Math.cos(Math.PI + gap)).toFixed(1)} ${(cy + r * Math.sin(Math.PI + gap)).toFixed(1)}`
  }
  // Center dot
  d += ` M ${cx + 2} ${cy} A 2 2 0 0 1 ${cx - 2} ${cy} A 2 2 0 0 1 ${cx + 2} ${cy}`
  // Crosshair
  d += ` M ${cx - 3} ${cy} L ${cx + 3} ${cy} M ${cx} ${cy - 3} L ${cx} ${cy + 3}`
  return d
}

function generateComeGlyph(rand: () => number): string {
  // Open welcoming form — spreading arms, invitation
  const cx = 32, cy = 32
  let d = ''
  const arms = 2 + Math.floor(rand() * 2)
  for (let i = 0; i < arms; i++) {
    const aBase = -Math.PI / 3 + (i / arms) * Math.PI * 0.67
    for (const side of [-1, 1]) {
      const a   = aBase * side
      const len = 16 + rand() * 6
      const cx1 = cx + Math.cos(a + 0.4 * side) * len * 0.5
      const cy1 = cy + Math.sin(a + 0.4 * side) * len * 0.5
      const ex  = cx + Math.cos(a) * len
      const ey  = cy + Math.sin(a) * len
      d += `M ${cx} ${cy} Q ${cx1.toFixed(1)} ${cy1.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)} `
      // Curl at tip
      d += `M ${ex.toFixed(1)} ${ey.toFixed(1)} A 4 4 0 0 ${side > 0 ? 1 : 0} ${(ex + 4 * side).toFixed(1)} ${(ey - 4).toFixed(1)}`
    }
  }
  // Central joining node
  d += ` M ${cx + 3} ${cy} A 3 3 0 0 1 ${cx - 3} ${cy} A 3 3 0 0 1 ${cx + 3} ${cy}`
  return d
}

export interface VelarGlyph {
  concept:   VelarConcept
  svgPath:   string     // SVG path data for the glyph
  hint:      string     // contextual hint for decoding
  label:     string     // human-readable label once decoded
}

/**
 * Generate the Velar alphabet for a given world seed.
 * Returns 5 glyphs, one per concept, in a randomized display order.
 * The concept-to-glyph mapping is seeded — same seed always same glyphs.
 */
export function generateVelarAlphabet(worldSeed: number): VelarGlyph[] {
  const rand = seededRand(worldSeed ^ 0xe1a4a1f)

  const generators: Record<VelarConcept, (rand: () => number) => string> = {
    life:  generateLifeGlyph,
    star:  generateStarGlyph,
    path:  generatePathGlyph,
    here:  generateHereGlyph,
    come:  generateComeGlyph,
  }

  // Shuffle display order so the concept positions differ per seed
  const concepts = [...VELAR_CONCEPTS] as VelarConcept[]
  for (let i = concepts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[concepts[i], concepts[j]] = [concepts[j], concepts[i]]
  }

  return concepts.map(concept => ({
    concept,
    svgPath: generators[concept](seededRand(worldSeed ^ concept.charCodeAt(0) * 0x1000)),
    hint:    CONCEPT_HINTS[concept],
    label:   CONCEPT_LABELS[concept],
  }))
}

/**
 * The 5-symbol Velar response message received after Velar is probed.
 * Decoded meaning: "Life — Origin-Star — Path — Here — Come"
 * = "We are the origin of life. Follow this path. Come here."
 */
export const VELAR_RESPONSE_SEQUENCE: VelarConcept[] = ['life', 'star', 'path', 'here', 'come']

export const VELAR_DECODED_MESSAGE =
  'WE ARE THE ORIGIN OF LIFE. WE SEEDED YOUR STAR. FOLLOW THE PATH. COME HOME.'

export const VELAR_GATEWAY_COORDS = {
  // Gateway appears at a fixed offset from the spawn point —
  // 200m north-east along the sphere surface, at elevation 0 (beach level)
  arcDistFromSpawn: 200,  // meters along sphere surface
  angleFromNorth:   0.78, // radians (NE direction)
}
