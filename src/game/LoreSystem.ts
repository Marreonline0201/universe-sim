// src/game/LoreSystem.ts
// M57 Track B: World Lore & Codex — unlockable lore entries discovered through gameplay

export type LoreCategory = 'history' | 'bestiary' | 'alchemy' | 'geography' | 'factions' | 'artifacts'

export interface LoreEntry {
  id: string
  category: LoreCategory
  title: string
  icon: string
  summary: string    // short 1-2 sentence teaser
  fullText: string   // 3-5 sentence full lore entry
  unlocked: boolean
  unlockedAt?: number  // Date.now()
}

export const LORE_CATEGORY_ICONS: Record<LoreCategory, string> = {
  history:   '📜',
  bestiary:  '🦅',
  alchemy:   '⚗️',
  geography: '🗺️',
  factions:  '⚔️',
  artifacts: '💎',
}

// ── Lore entries (18 total, 3 per category) ───────────────────────────────────

export const LORE_ENTRIES: LoreEntry[] = [
  // ── History ─────────────────────────────────────────────────────────────────
  {
    id: 'history-sundering',
    category: 'history',
    title: 'The Sundering',
    icon: '💥',
    summary: 'An ancient cataclysm tore the world apart, scattering the elder races and reshaping the land.',
    fullText: `Three thousand years ago, the Sundering rent the sky itself and drove molten rock through the heartlands of the old world. The elder races — the Aurath, the Stonekith, and the Velari — were scattered to the four winds, their great cities swallowed by ash and tidal flood. Those who survived fled to the high places, carrying only what legends they could keep alive in song. Modern scholars debate whether the Sundering was a natural disaster or the consequence of a forbidden experiment conducted beneath the Worldforge. Whatever its cause, it remains the dividing line between the age of myth and the age of men.`,
    unlocked: false,
  },
  {
    id: 'history-first-kings',
    category: 'history',
    title: 'The First Kings',
    icon: '👑',
    summary: 'Crude chieftains carved the first settlements from the wilderness in the centuries following the Sundering.',
    fullText: `In the long silence after the Sundering, scattered bands of survivors pooled around whatever could sustain them — fresh springs, defensible ridgelines, fields untouched by ash. The strongest among these groups rose to lead through necessity rather than birthright, earning the title of King with callused hands and good judgment. The First Kings built no palaces; they built walls, granaries, and forge-pits. Their legacy endures not in grand monuments but in the trade roads that still follow the paths they first hacked through the wilderness. To trace a king's road is to walk in the footsteps of civilization itself.`,
    unlocked: false,
  },
  {
    id: 'history-lost-age',
    category: 'history',
    title: 'The Lost Age',
    icon: '🌟',
    summary: 'Before the Sundering lay a golden era of prosperity and arcane mastery now almost entirely forgotten.',
    fullText: `The Lost Age is known only through fragments — scorched vellum scrolls, half-melted metal tablets, and the rare intact chamber deep in an Undercroft ruin. In that time, alchemy and architecture had reached heights modern scholars can barely conceive: flying citadels, self-tending farmlands, and medicines that could regrow severed limbs. The people of the Lost Age had cracked the language of the planet itself, which is what made their fall so total. When the Sundering came, it erased not just their bodies but the very knowledge they had spent millennia accumulating. What little remains is fiercely contested by every guild, faction, and throne on the continent.`,
    unlocked: false,
  },

  // ── Bestiary ─────────────────────────────────────────────────────────────────
  {
    id: 'bestiary-ironhide-bear',
    category: 'bestiary',
    title: 'Ironhide Bear',
    icon: '🐻',
    summary: 'A massive predator whose hide has calcified into dense natural armour, making it nearly impervious to bladed weapons.',
    fullText: `The Ironhide Bear is found primarily in the deep taiga and volcanic highland fringes, where mineral-rich springs saturate the soil. Over generations of consuming iron-rich vegetation and bathing in mineral pools, its outer hide has fused with crystallised iron salts into a rigid carapace. Conventional swords skid off the plating; blunt weapons and fire are the preferred methods of attack among experienced hunters. Despite their ferocious reputation, Ironhide Bears are territorial rather than aggressive, attacking only when cornered or defending a den. Their shed hide plates are prized by blacksmiths as a tempering additive that produces unusually resilient steel.`,
    unlocked: false,
  },
  {
    id: 'bestiary-plague-wraith',
    category: 'bestiary',
    title: 'Plague Wraith',
    icon: '💀',
    summary: 'An undead creature of drifting mist that haunts mass burial sites, spreading rot wherever it passes.',
    fullText: `Plague Wraiths form when a large number of corpses decompose together without proper rite of burial — battlefield pits, collapsed mines, and flood-drowned villages are common birthplaces. They have no solid form, appearing instead as a sickly yellow-green mist that carries the stench of necrosis. Prolonged exposure to a Plague Wraith's vapours causes a wasting sickness indistinguishable from natural plague, making outbreaks near ruined settlements dangerously difficult to diagnose. They are dispersed by strong wind and destroyed by alchemical fire or concentrated salt crystals. Alchemists occasionally harvest their residue — a thick black ichor called wraith-drop — for use in corrosive compounds.`,
    unlocked: false,
  },
  {
    id: 'bestiary-stoneback-turtle',
    category: 'bestiary',
    title: 'Stoneback Turtle',
    icon: '🐢',
    summary: 'A colossal freshwater turtle whose flat shell serves nomadic communities as a living fortress and mobile platform.',
    fullText: `The Stoneback Turtle can grow to thirty metres in length over its centuries-long lifespan, its shell accumulating a thick crust of moss, soil, and embedded stone that makes it virtually indistinguishable from a low rocky island. Several nomadic peoples, most notably the Thornborn, have learned to coax Stonebacks along desired river routes using specific low drum rhythms and offerings of fermented grain mash. Entire villages have been constructed atop these creatures, moving with them through seasonal migrations. The Stoneback's temperament is placid to the point of indifference; it ignores the settlements on its back entirely, focused only on consuming the vast quantities of river algae it requires to sustain its bulk.`,
    unlocked: false,
  },

  // ── Alchemy ──────────────────────────────────────────────────────────────────
  {
    id: 'alchemy-transmutation',
    category: 'alchemy',
    title: 'Transmutation Basics',
    icon: '⚗️',
    summary: 'The foundational art of altering the essential nature of base materials through heat, pressure, and reagent bonding.',
    fullText: `Transmutation is the oldest branch of alchemy and the most misunderstood. Common folk believe alchemists can turn lead to gold — a persistent myth that has earned the discipline as many enemies as admirers. True transmutation is the precise manipulation of a material's structural bonds using controlled heat, specific pressure, and reagent catalysts. A skilled transmuter can harden soft wood to rival iron, render cloth waterproof, or coax a brittle mineral into a flexible sheet. The core principle is that no material is destroyed in transmutation — only transformed — which means the process is fully reversible given the correct inverse reagents. Mastery begins with understanding that every substance has an opposite, and the art lies in finding it.`,
    unlocked: false,
  },
  {
    id: 'alchemy-blood-salt',
    category: 'alchemy',
    title: 'Blood Salt',
    icon: '🧂',
    summary: 'A rare crimson reagent crystallised from the evaporated blood of deep-earth creatures, prized for its binding and preservative properties.',
    fullText: `Blood Salt forms naturally in deep cave systems where the carcasses of ironvein worms and magma leeches evaporate slowly over decades in mineral-dry air, leaving behind dense red crystal deposits. It is one of the most powerful binding reagents known, capable of fusing two otherwise chemically incompatible substances into a stable compound. Plague doctors prize it as a preservative for field-mixed medicines, while armourers use trace quantities to bond enchantment-laced metal inlays. The colour of Blood Salt grades its purity: pale pink is common grade, crimson is reagent grade, and near-black is grand-alchemist grade and worth its weight in gold. Handling raw Blood Salt without gloves stains the skin a reddish-brown for weeks.`,
    unlocked: false,
  },
  {
    id: 'alchemy-voidite',
    category: 'alchemy',
    title: 'Voidite Compound',
    icon: '💣',
    summary: 'An extremely unstable explosive substance formed by combining voidstone dust with reactive salts — prized and feared in equal measure.',
    fullText: `Voidite Compound is the reason alchemist guilds require liability bonds before admitting new apprentices. It is formed when powdered voidstone — a porous mineral found near the Undercroft's deepest strata — is combined with Blood Salt and an oxidising reagent and then compressed. The result is a dense black paste that remains stable at rest but detonates violently when subjected to sharp impact or direct flame. Siege engineers use pre-formed Voidite charges to bring down walls and clear cave blockages. Two recorded incidents of accidental guild-hall detonations have resulted in the compound being classified as restricted in most city-states. A stable long-term storage method remains the subject of active and extremely careful research.`,
    unlocked: false,
  },

  // ── Geography ────────────────────────────────────────────────────────────────
  {
    id: 'geography-ashwastes',
    category: 'geography',
    title: 'The Ashwastes',
    icon: '🌋',
    summary: 'A vast volcanic plain of grey ash and dormant calderas stretching across the continent\'s southern interior.',
    fullText: `The Ashwastes cover nearly a fifth of the continent's landmass, a consequence of a chain of volcanic eruptions that began during the Sundering and continued sporadically for the next five centuries. Nothing grows in the deep Ashwastes; the soil is too alkaline and too porous to hold moisture, and the sky above is perpetually overcast by suspended particulate. Travellers describe the region as a silence so complete it feels physical — no wind, no insects, no birdsong. Despite this, the Ashwastes hold tremendous value: deep ore veins of iron and copper are exposed by erosion at thousands of surface points, and the volcanic rock itself is ideal building material. Prospecting camps ring the outer Ashwastes, growing larger and more permanent with each generation.`,
    unlocked: false,
  },
  {
    id: 'geography-crystalmere',
    category: 'geography',
    title: 'Crystalmere Lake',
    icon: '❄️',
    summary: 'A vast high-altitude lake that freezes perfectly solid each winter, its surface becoming a mirror of such clarity it seems to hold the sky inside it.',
    fullText: `Crystalmere Lake sits at the top of the Greyveil plateau, fed by glacial meltwater so pure that even frozen solid it remains transparent to a depth of eight metres. In winter, merchants drive heavy-laden carts across its surface with confidence; the ice is routinely two metres thick before the solstice. Locals harvest the ice in blocks and sell it to lowland cities as a luxury cooling material. The name derives from the extraordinary optical phenomenon at first freeze, when the surface forms a single unbroken crystal plane that reflects the stars above with such precision that astronomers once used it as a natural telescope. On still clear nights the reflection is so perfect that standing at the edge, one cannot tell which direction is up.`,
    unlocked: false,
  },
  {
    id: 'geography-undercroft',
    category: 'geography',
    title: 'The Undercroft',
    icon: '⛏️',
    summary: 'A labyrinthine network of natural and carved cave passages running beneath much of the continent.',
    fullText: `The Undercroft is not a single cave system but a continent-spanning network of passages, some natural, many carved by the elder races in the Lost Age, and some whose origin remains entirely unknown. Mapping efforts have been ongoing for two centuries with no end in sight — each survey party returns with evidence of tunnels that simply were not there on the last expedition. The deeper levels contain ecosystems of fungal forests, underground rivers, and creatures that have never seen light. Lost Age ruins are more concentrated in the Undercroft than anywhere on the surface, making it the primary destination for relic hunters and arcane scholars. The Iron Veil maintains at least three undisclosed Undercroft entrances, which is widely known and never officially acknowledged.`,
    unlocked: false,
  },

  // ── Factions ─────────────────────────────────────────────────────────────────
  {
    id: 'factions-iron-veil',
    category: 'factions',
    title: 'The Iron Veil',
    icon: '🏦',
    summary: 'A secretive mercantile brotherhood that controls the flow of rare materials across the continent through a network of agents and unmarked warehouses.',
    fullText: `The Iron Veil has no official headquarters, no public roster, and no acknowledged leader — only a sigil, a three-link iron chain on a black field, that appears on shipping manifests, wax seals, and, occasionally, on bodies. Members identify one another through a complex system of coded phrases embedded in ordinary conversation. Publicly, the Iron Veil presents as a loose association of independent traders sharing market intelligence. In practice, it operates as a continent-spanning cartel with the ability to create or collapse commodity markets within weeks. Rival guilds, city-state treasuries, and at least two kings have attempted to dismantle it; none have succeeded, partly because the Veil's membership almost certainly includes the investigators sent to uncover it.`,
    unlocked: false,
  },
  {
    id: 'factions-dawnwatch',
    category: 'factions',
    title: 'The Dawnwatch',
    icon: '🛡️',
    summary: 'An ancient order of sentinels originally sworn to guard the borders of the Lost Age civilisation, still operating on an oath that predates the Sundering.',
    fullText: `The Dawnwatch claims an unbroken lineage stretching back before the Sundering, an assertion most historians find implausible but are unable to definitively disprove. Each member undergoes a year-long isolation vigil before taking the oath — a tradition said to strip away personal loyalty until only duty to the land itself remains. They patrol borders, ruins, and deep passes without pay and without asking for recognition, funded by a trust whose original endowment has never been fully accounted for. Their grey cloaks and single-candle torches are a reassuring sight to travellers in the wilderness. The Dawnwatch has no official political alignment, but it has quietly intervened in three succession crises in the past century, always on the side of stability rather than legitimacy.`,
    unlocked: false,
  },
  {
    id: 'factions-thornborn',
    category: 'factions',
    title: 'The Thornborn',
    icon: '⚔️',
    summary: 'Nomadic raiders of the eastern steppes who follow the great Stoneback Turtle herds, living off tribute and ambush in equal measure.',
    fullText: `The Thornborn do not consider themselves raiders — they are taxers of those who cross their land without invitation. The eastern steppes and the river basins that feed into the Ashwastes are their ancestral territory, and any caravan that traverses it without paying the toll road fee is considered fair game. Their riders are among the finest in the known world, capable of fighting from horseback at full gallop with either sword or recurve bow. Contrary to settled-people mythology, the Thornborn maintain an elaborate oral legal code governing tribute, surrender, ransoming, and the treatment of prisoners. They are also the foremost experts on Stoneback Turtle husbandry, a skill they guard jealously and have never shared with outside scholars.`,
    unlocked: false,
  },

  // ── Artifacts ────────────────────────────────────────────────────────────────
  {
    id: 'artifacts-eclipsed-crown',
    category: 'artifacts',
    title: 'The Eclipsed Crown',
    icon: '👁️',
    summary: 'A royal artifact of the First Kings that grants its wearer uncanny authority over others — while slowly consuming their identity.',
    fullText: `The Eclipsed Crown is a circlet of blackened gold set with a single dark gemstone of uncertain type that seems to absorb rather than reflect light. Historical records from three separate dynasties confirm that its wearers invariably became brilliant, commanding rulers — and invariably ended their reigns in madness, disappearance, or transformation into something barely recognisable as human. The leading theory is that the Crown does not grant charisma but rather strips the wearer's internal barriers, allowing raw social influence to flow outward while simultaneously allowing external influences to flow inward. Its current location is unknown; the last confirmed sighting placed it in a sealed vault beneath a city that was subsequently swallowed by an Ashwaste caldera event.`,
    unlocked: false,
  },
  {
    id: 'artifacts-worldforge-shard',
    category: 'artifacts',
    title: 'Shard of the Worldforge',
    icon: '🪨',
    summary: 'A palm-sized fragment of the ancient machine or force that the Lost Age people believed shaped the planet itself.',
    fullText: `The Worldforge is a concept as much as a place — the Lost Age civilisation believed the planet was not a natural formation but a constructed one, shaped by a vast machine or intelligence they called the Forge. A handful of palm-sized crystalline shards bearing irregular geometric facets have been recovered from the deepest Undercroft levels, and their properties resist conventional alchemical analysis: they do not conduct heat, do not respond to reagents, and register no density that makes physical sense. Attempting to strike one produces no damage to the shard but an immediate and inexplicable cessation of hostility in any creature within ten metres — a property that has prevented several notable deaths. Whether the shards are components, by-products, or symbolic relics of the Worldforge remains entirely unknown.`,
    unlocked: false,
  },
  {
    id: 'artifacts-hollow-key',
    category: 'artifacts',
    title: 'The Hollow Key',
    icon: '🗝️',
    summary: 'A key that opens doors that do not yet exist — or perhaps doors that exist somewhere else.',
    fullText: `The Hollow Key is a finger-length iron key with a bow shaped like an open eye and teeth that don't match any known lock manufacture, ancient or modern. When pressed against an unmarked wall, sealed cliff face, or apparently solid surface with intent, it turns of its own accord and a door-sized section of the surface becomes briefly traversable. What lies beyond varies — most reports describe the space as a short corridor leading to a room that was clearly designed for someone, containing personal effects and environmental details that feel intimate but belong to no one present. A Dawnwatch archivist who spent ten years cataloguing reported Hollow Key openings concluded the key does not create spaces but rather finds them: rooms that exist or will exist in the future, briefly made adjacent to the present.`,
    unlocked: false,
  },
]

// ── Module state ──────────────────────────────────────────────────────────────

let _entries: LoreEntry[] = []
let _initialized = false

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLockedByCategory(category: LoreCategory): LoreEntry | undefined {
  return _entries.find(e => e.category === category && !e.unlocked)
}

function autoUnlock(category: LoreCategory): void {
  const entry = getLockedByCategory(category)
  if (entry) {
    unlockLore(entry.id)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initLoreSystem(): void {
  if (_initialized) return
  _initialized = true

  // Deep copy all entries, all start locked
  _entries = LORE_ENTRIES.map(e => ({ ...e, unlocked: false, unlockedAt: undefined }))

  // Event-based auto-unlock listeners
  window.addEventListener('location-discovered', () => autoUnlock('geography'))
  window.addEventListener('seasonal-change', () => autoUnlock('history'))
  window.addEventListener('bounty-claimed', () => autoUnlock('bestiary'))
  window.addEventListener('recipe-discovered', () => autoUnlock('alchemy'))
  window.addEventListener('faction-war-started', () => autoUnlock('factions'))
  window.addEventListener('trade-route-completed', () => autoUnlock('artifacts'))
  // M64: additional unlock triggers
  window.addEventListener('boss-defeated', () => autoUnlock('bestiary'))
  window.addEventListener('item-crafted', () => autoUnlock('alchemy'))
  window.addEventListener('faction-standing-changed', (e) => {
    const tier = (e as CustomEvent).detail?.tier
    if (tier === 'friendly' || tier === 'honored' || tier === 'exalted') autoUnlock('factions')
  })
  window.addEventListener('delve-completed', () => autoUnlock('geography'))
  window.addEventListener('seasonal-event-started', () => autoUnlock('history'))
}

export function getLoreEntries(): LoreEntry[] {
  return _entries.map(e => ({ ...e }))
}

export function unlockLore(id: string): void {
  const entry = _entries.find(e => e.id === id)
  if (!entry || entry.unlocked) return
  entry.unlocked = true
  entry.unlockedAt = Date.now()
  window.dispatchEvent(new CustomEvent('lore-unlocked', { detail: { id, category: entry.category } }))
}

export function isUnlocked(id: string): boolean {
  const entry = _entries.find(e => e.id === id)
  return entry?.unlocked ?? false
}

export function serializeLore(): string {
  return JSON.stringify(
    _entries.map(e => ({ id: e.id, unlocked: e.unlocked, unlockedAt: e.unlockedAt }))
  )
}

export function deserializeLore(data: string): void {
  try {
    const saved = JSON.parse(data) as Array<{ id: string; unlocked: boolean; unlockedAt?: number }>
    for (const s of saved) {
      const entry = _entries.find(e => e.id === s.id)
      if (entry) {
        entry.unlocked = s.unlocked
        entry.unlockedAt = s.unlockedAt
      }
    }
  } catch {
    // Corrupted data — silently skip
  }
}
