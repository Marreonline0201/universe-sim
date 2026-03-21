// api/science.ts — Science Companion API
// Answers questions about the game's physical systems (fire, chemistry, biology, geology).
// Uses Anthropic Claude API when ANTHROPIC_API_KEY is set; falls back to curated static
// explanations otherwise so the panel is always functional.

export const config = { runtime: 'nodejs' }

// ── Static fallback knowledge base ──────────────────────────────────────────────
const STATIC_ENTRIES: Record<string, string> = {
  fire: `Fire in this universe obeys the Arrhenius rate equation: k = A·e^(−Ea/RT). Each grid cell tracks temperature (T) and material composition. When a wood cell reaches ignition temperature (~300°C), the pre-exponential factor A and activation energy Ea for cellulose combustion drive the reaction rate. Oxygen (O₂) is consumed, heat is released, and temperature rises until fuel is exhausted or oxygen depletes. The grid updates at ~10 Hz — you can watch the reaction front propagate cell by cell.`,

  smelting: `Copper smelting is a two-stage pyrometallurgical process. Stage 1 (matte smelting): Cu₂S + O₂ → 2Cu + SO₂ requires ~1083°C. Stage 2: charcoal (C) acts as a reducing agent — Cu₂O + C → 2Cu + CO₂. In the game, the furnace cell must exceed 500°C and contain both copper ore and charcoal for the chemical reaction to complete. The thermal worker propagates heat from burning charcoal into adjacent ore cells. The chemistry worker then detects the reaction conditions and yields metallic copper.`,

  infection: `Bacterial infection follows logistic growth: dB/dt = r·B·(1 − B/K). In the game, r = 0.015/s and carrying capacity K = 100 (percent infection). An untreated wound begins at low B and grows exponentially before flattening near K. Treatment with medicinal herbs introduces an antimicrobial compound that reduces r temporarily, allowing the immune response to win. Full infection (B ≥ 90) causes rapid health drain. Apply herb treatment early — logistic curves are slow to start but rapid in mid-phase.`,

  geology: `Ore deposits follow height-band geology rules derived from real Earth stratigraphic columns. Copper and tin form in volcanic hydrothermal zones (high elevation, 60–220m). Iron and coal form in sedimentary organic layers (low elevation, 5–90m). Gold and silver concentrate deep in metamorphic terrains (100–200m). This mirrors how plate tectonics and erosion create real ore bodies. The game uses 60 placement attempts per node and relaxes the constraint after 40 to ensure the world is always playable.`,

  sleep: `Sleep in the game restores energy and clears fatigue following an exponential recovery curve. Energy recovery rate increases 4x while sleeping versus resting awake. Fatigue (a separate variable from energy) decays at 0.008/s during sleep. Biological sleep debt — accumulated fatigue — impairs metabolism efficiency, causing hunger and thirst to deplete faster. A bedroll improves thermal regulation, reducing ambient heat loss and making sleep more efficient in cold biomes.`,

  cooking: `Raw meat contains Salmonella and other pathogens. Placing it in a grid cell above 80°C for 8 seconds denatures bacterial proteins through thermal denaturation — the same process that changes meat texture. The game tracks cooking progress per inventory slot. Cooked meat restores 35% of maximum hunger versus ~5% for raw meat, and eliminates the infection risk. The 80°C threshold matches the WHO food safety guideline for poultry.`,

  wounds: `Wounds in the game simulate laceration biology. Severity (0–1) represents tissue damage depth. Bacteria colonize the wound at logistic growth rate r = 0.015/s. Immune response is modeled implicitly — the body clears bacteria slowly below 50% colonization. Above 50%, the infection overwhelms local defenses and B grows toward K = 100%. Herbs contain salicin and tannins (modeled as a reduction to r for 30s). Wounds never auto-heal above severity 0.3 without treatment.`,

  atmosphere: `The planet's atmosphere runs in a fluid simulation worker using a simplified Navier-Stokes solver on the grid. Pressure gradients drive wind. Temperature differentials between biomes create convection. The thermal worker propagates heat across cells with conductivity coefficients derived from material type (rock: 2 W/m·K, air: 0.025 W/m·K, water: 0.6 W/m·K). This is why fire creates rising hot air columns and cold mountain peaks generate downslope katabatic winds.`,

  npc: `NPCs use utility-based AI with five drives: hunger, fatigue, curiosity, fear, and social trust. Each drive has a utility score u_i = f(current_value). The agent selects the action a* = argmax Σ w_i · u_i(a). Hunger rises at 0.004/s and drives GATHER behavior when above 0.5. Fatigue rises 0.003/s during WANDER and recovers 0.008/s during REST. Trust toward the player increases when the player is nearby without attacking, and decreases exponentially after hostile events.`,
}

const SYSTEM_PROMPT = `You are the Science Companion for a real-time universe simulation game. Your role is to explain the actual physical, chemical, and biological laws that drive the game mechanics. Be precise, reference real science (equations, constants, processes), and connect them explicitly to what the player sees in-game. Keep answers under 200 words. Use a tone that is knowledgeable but accessible — like a scientist who is also a game enthusiast.

The game systems you can explain include:
- Fire and combustion (Arrhenius kinetics, grid simulation, oxygen consumption)
- Copper smelting (pyrometallurgy, Cu₂S reduction, furnace temperature thresholds)
- Wound infection (logistic bacterial growth, herb treatment, immune response)
- Geology and ore placement (stratigraphic columns, hydrothermal deposits, height bands)
- Sleep and energy recovery (fatigue mechanics, thermal regulation)
- Food cooking (thermal denaturation, pathogen elimination, 80°C threshold)
- Atmosphere and weather (Navier-Stokes, pressure gradients, thermal convection)
- NPC AI behavior (utility functions, drive architecture, trust mechanics)

If the question is unrelated to these topics, gently redirect to a science topic you can explain.`

function getBestStaticMatch(query: string): string {
  const q = query.toLowerCase()
  const keywords: Array<[string, string]> = [
    ['fire', 'fire'], ['burn', 'fire'], ['combust', 'fire'], ['ignit', 'fire'], ['flame', 'fire'],
    ['smelt', 'smelting'], ['copper', 'smelting'], ['furnac', 'smelting'], ['ore', 'smelting'], ['charcoal', 'smelting'],
    ['infect', 'infection'], ['wound', 'wounds'], ['bacteria', 'infection'], ['herb', 'wounds'], ['heal', 'wounds'],
    ['geolog', 'geology'], ['mineral', 'geology'], ['ore deposit', 'geology'], ['copper vein', 'geology'],
    ['sleep', 'sleep'], ['rest', 'sleep'], ['fatigue', 'sleep'], ['energy', 'sleep'],
    ['cook', 'cooking'], ['food', 'cooking'], ['meat', 'cooking'], ['hunger', 'cooking'],
    ['atmos', 'atmosphere'], ['wind', 'atmosphere'], ['weather', 'atmosphere'], ['pressure', 'atmosphere'],
    ['npc', 'npc'], ['ai', 'npc'], ['creature', 'npc'], ['trust', 'npc'], ['utility', 'npc'],
  ]
  for (const [keyword, key] of keywords) {
    if (q.includes(keyword)) return STATIC_ENTRIES[key]
  }
  // Default: fire is the most visually obvious system
  return STATIC_ENTRIES.fire
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return }

  const { query } = req.body ?? {}
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'query is required' }); return
  }

  const trimmed = query.trim().slice(0, 500)
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (apiKey) {
    // Live Claude response
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: trimmed }],
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        console.error('[science] Anthropic API error:', response.status, err)
        // Fall through to static
      } else {
        const data = await response.json() as any
        const text: string = data?.content?.[0]?.text ?? ''
        if (text) {
          res.status(200).json({ answer: text, source: 'claude' })
          return
        }
      }
    } catch (e) {
      console.error('[science] fetch error:', e)
      // Fall through to static
    }
  }

  // Static fallback
  const answer = getBestStaticMatch(trimmed)
  res.status(200).json({ answer, source: 'static' })
}
