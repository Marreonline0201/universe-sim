// ── DocsPage ──────────────────────────────────────────────────────────────────
// Player-facing game guide embedded in the status site.

import React, { useState } from 'react'

type Section = 'getting-started' | 'controls' | 'systems' | 'settlements' | 'crafting' | 'multiplayer' | 'tips'

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'getting-started', label: 'Getting Started',  icon: '🚀' },
  { id: 'controls',        label: 'Controls',         icon: '🎮' },
  { id: 'systems',         label: 'Game Systems',     icon: '⚙' },
  { id: 'settlements',     label: 'Settlements',      icon: '🏘' },
  { id: 'crafting',        label: 'Crafting & Forge',icon: '⚒' },
  { id: 'multiplayer',     label: 'Multiplayer',      icon: '👥' },
  { id: 'tips',            label: 'Tips & Tricks',    icon: '💡' },
]

// ── Reusable sub-components ───────────────────────────────────────────────────

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 13,
      letterSpacing: 3,
      color: '#00d4ff',
      marginBottom: 18,
      paddingBottom: 8,
      borderBottom: '1px solid rgba(0,180,255,0.15)',
      textTransform: 'uppercase',
    }}>{children}</h2>
  )
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 11,
      letterSpacing: 2,
      color: 'rgba(180,220,255,0.8)',
      marginBottom: 10,
      marginTop: 22,
      textTransform: 'uppercase',
    }}>{children}</h3>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 12,
      color: 'rgba(170,200,230,0.7)',
      lineHeight: 1.8,
      marginBottom: 12,
    }}>{children}</p>
  )
}

function KeyBadge({ k }: { k: string }) {
  return (
    <kbd style={{
      display: 'inline-block',
      background: 'rgba(0,180,255,0.1)',
      border: '1px solid rgba(0,180,255,0.3)',
      borderRadius: 3,
      padding: '1px 7px',
      fontSize: 10,
      color: '#00d4ff',
      fontFamily: 'inherit',
      letterSpacing: 1,
      marginRight: 4,
    }}>{k}</kbd>
  )
}

function KeyRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 0',
      borderBottom: '1px solid rgba(0,180,255,0.05)',
    }}>
      <div style={{ minWidth: 140 }}>
        {keys.map(k => <KeyBadge key={k} k={k} />)}
      </div>
      <span style={{ fontSize: 11, color: 'rgba(170,200,230,0.65)' }}>{label}</span>
    </div>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(0,180,255,0.04)',
      border: '1px solid rgba(0,180,255,0.1)',
      borderRadius: 4,
      padding: '14px 16px',
      marginBottom: 12,
    }}>
      <div style={{ fontSize: 11, letterSpacing: 1.5, color: '#00d4ff', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block',
      background: `${color}18`,
      border: `1px solid ${color}44`,
      borderRadius: 3,
      padding: '1px 8px',
      fontSize: 10,
      color,
      letterSpacing: 1,
      marginRight: 6,
      marginBottom: 4,
    }}>{children}</span>
  )
}

// ── Section content ───────────────────────────────────────────────────────────

function GettingStarted() {
  return (
    <div>
      <H2>Getting Started</H2>
      <P>
        Universe Sim is an open-world multiplayer survival and civilization game set across cosmic timescales.
        You spawn on a procedurally generated planet, gather resources, craft tools, build relationships with
        NPCs and other players, and shape the fate of settlements across the world.
      </P>

      <H3>First Steps</H3>
      <InfoCard title="1 — ORIENT YOURSELF">
        <P>When you spawn, look around using your mouse. The HUD shows your health (red bar), stamina (green),
        and mana (blue) in the top-left. The bottom bar shows your hotbar items.</P>
      </InfoCard>
      <InfoCard title="2 — GATHER RESOURCES">
        <P>Walk up to trees, rocks, and plants and press <KeyBadge k="E" /> or <KeyBadge k="F" /> to gather.
        Resources go straight into your inventory (<KeyBadge k="I" />). You'll need wood and stone first.</P>
      </InfoCard>
      <InfoCard title="3 — CRAFT YOUR FIRST ITEMS">
        <P>Open Crafting (<KeyBadge k="C" />) and make basic tools — an axe and pickaxe will speed up gathering.
        Then craft a Campfire Kit to set up a base camp.</P>
      </InfoCard>
      <InfoCard title="4 — FIND A SETTLEMENT">
        <P>Open the Map (<KeyBadge k="M" />) to see the 5 settlements. Head to the nearest one to meet NPCs,
        pick up quests, and trade resources for gold.</P>
      </InfoCard>
      <InfoCard title="5 — TAKE A QUEST">
        <P>Open the Quest Board (<KeyBadge k="Q" />) at a settlement to find tasks. Completing quests earns
        gold, XP, reputation, and unlocks new content.</P>
      </InfoCard>
    </div>
  )
}

function Controls() {
  return (
    <div>
      <H2>Controls</H2>

      <H3>Movement</H3>
      <KeyRow keys={['W', 'A', 'S', 'D']} label="Move forward / left / backward / right" />
      <KeyRow keys={['↑', '↓', '←', '→']} label="Move (arrow keys alternative)" />
      <KeyRow keys={['Space']} label="Jump" />
      <KeyRow keys={['Shift']} label="Sprint" />
      <KeyRow keys={['Shift+Space']} label="Dodge roll" />
      <KeyRow keys={['Double-tap W/A/S/D']} label="Dodge roll in direction" />

      <H3>Interaction</H3>
      <KeyRow keys={['E', 'F']} label="Interact / gather / talk to NPC" />
      <KeyRow keys={['Enter']} label="Open chat" />
      <KeyRow keys={['T']} label="Hold to open emote wheel" />
      <KeyRow keys={['Escape']} label="Close current panel / cancel" />

      <H3>Panels</H3>
      <KeyRow keys={['I']} label="Inventory" />
      <KeyRow keys={['C']} label="Crafting" />
      <KeyRow keys={['M']} label="World Map" />
      <KeyRow keys={['J']} label="Journal" />
      <KeyRow keys={['Q']} label="Quests" />
      <KeyRow keys={['K']} label="Skills" />
      <KeyRow keys={['Tab']} label="Character sheet" />
      <KeyRow keys={['B']} label="Build mode" />
      <KeyRow keys={['U']} label="Buildings" />
      <KeyRow keys={['H']} label="Home" />
      <KeyRow keys={['G']} label="Factions" />
      <KeyRow keys={['F']} label="Faction reputation" />
      <KeyRow keys={['W']} label="Faction wars" />
      <KeyRow keys={['V']} label="Forge" />
      <KeyRow keys={['Y']} label="Alchemy" />
      <KeyRow keys={['T']} label="Trade post" />
      <KeyRow keys={['E']} label="Merchant guild" />
      <KeyRow keys={['N']} label="Housing" />
      <KeyRow keys={['O']} label="Online players" />
      <KeyRow keys={['P']} label="Pet" />
      <KeyRow keys={['X']} label="Progression" />
      <KeyRow keys={['Z']} label="Achievements" />
      <KeyRow keys={['D']} label="Discoveries" />
      <KeyRow keys={['R']} label="Relationships" />
      <KeyRow keys={['S']} label="Seasonal events" />
      <KeyRow keys={['A']} label="World threats" />
      <KeyRow keys={['L']} label="Lore codex" />
      <KeyRow keys={['?', '/']} label="Keybind reference (in-game)" />

      <H3>Hotbar</H3>
      <KeyRow keys={['5', '6', '7', '8', '9']} label="Quickslot items / spells" />
      <KeyRow keys={['1–4']} label="Cast equipped spells (slots 1–4)" />
    </div>
  )
}

function Systems() {
  return (
    <div>
      <H2>Game Systems</H2>

      <H3>Health, Stamina & Mana</H3>
      <P>
        Your three core stats are shown in the top-left HUD. Health regenerates slowly over time or faster
        when resting. Stamina drains while sprinting and dodging — it refills quickly when you stop.
        Mana is consumed by spells and recovers passively.
      </P>

      <H3>Skills & Progression</H3>
      <P>
        Every action you take builds skill XP. Gathering builds Foraging, fighting builds Combat, crafting
        builds the relevant craft skill. Open the Skill Tree (<KeyBadge k="K" />) to spend points on passive
        and active upgrades. The Talent Tree and Specialization panels unlock deeper paths.
      </P>

      <H3>Factions</H3>
      <P>
        Five factions compete for influence across the world. Completing quests, trading, and winning
        battles raises your standing with a faction. High reputation unlocks exclusive items, discounts,
        and alliance bonuses. Faction Wars (<KeyBadge k="W" />) shows active conflicts you can join.
      </P>

      <H3>Weather & Seasons</H3>
      <P>
        Weather changes dynamically — rain affects visibility and extinguishes fires, storms damage exposed
        structures, and clear nights let you use the telescope. Seasons shift over long timescales and
        affect crop yields, NPC behaviour, and world events. Check the Weather Forecast panel for upcoming
        conditions.
      </P>

      <H3>World Events</H3>
      <P>
        Random world events fire periodically — bandit raids, merchant caravans, meteor showers, world
        bosses, and more. Watch the Chronicle panel on the right for live event announcements. Some events
        require multiple players to resolve.
      </P>

      <H3>Expeditions</H3>
      <P>
        Launch expeditions from the Expedition Panel to send parties of NPCs to explore distant regions.
        Expeditions return after a timer with loot, discoveries, and lore. Risk and reward scale with
        expedition difficulty.
      </P>

      <H3>Dungeons</H3>
      <P>
        Dungeons are instanced areas accessed from special dungeon entrances on the map. They contain
        layered rooms with enemies, traps, and boss encounters. Use the Dungeon Delve panel to track
        progress and see your current floor.
      </P>

      <H3>Science & Discoveries</H3>
      <P>
        The Science panel unlocks research trees that permanently improve the world — better crops,
        stronger materials, new building types. The Discoveries panel tracks everything you've found
        and logs lore entries about the world.
      </P>
    </div>
  )
}

function Settlements() {
  const settlements = [
    { name: 'Ironhold',  desc: 'Industrial hub. Best for smithing, ore trade, and forge quests.', tier: 'thriving', color: '#fb923c' },
    { name: 'Millhaven', desc: 'Small farming town. Cheap food, struggling economy — good quests for early players.', tier: 'struggling', color: '#94a3b8' },
    { name: 'Coldwater', desc: 'Remote and poor. Hard to reach but has rare resource trades and unique lore.', tier: 'struggling', color: '#94a3b8' },
    { name: 'Ashford',   desc: 'Thriving trade hub. Best merchant prices, rich quest board, faction embassy.', tier: 'thriving', color: '#4cdd88' },
    { name: 'Duskport',  desc: 'Booming harbour city. Fishing, sailing routes, highest-tier merchants.', tier: 'booming', color: '#ffd700' },
  ]

  const tierColors: Record<string, string> = {
    struggling: '#94a3b8',
    stable:     '#60cdcc',
    thriving:   '#4cdd88',
    booming:    '#ffd700',
  }

  return (
    <div>
      <H2>Settlements</H2>
      <P>
        There are 5 settlements across the world. Each has its own economy, prosperity tier, quest board,
        merchants, and NPCs. Settlements grow over time — and player investment speeds that up.
      </P>

      <H3>Prosperity Tiers</H3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {Object.entries(tierColors).map(([tier, color]) => (
          <Tag key={tier} color={color}>{tier.toUpperCase()}</Tag>
        ))}
      </div>
      <P>
        A settlement's tier determines merchant stock quality, quest rewards, and the reputation bonus
        you earn there. Booming settlements offer up to +30 reputation per completed quest.
      </P>

      <H3>The Five Settlements</H3>
      {settlements.map(s => (
        <InfoCard key={s.name} title={s.name.toUpperCase()}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Tag color={tierColors[s.tier]}>{s.tier}</Tag>
          </div>
          <P>{s.desc}</P>
        </InfoCard>
      ))}

      <H3>Investing in Settlements</H3>
      <P>
        Open the Settlement Economy panel and spend gold to invest in any settlement. Investment gives an
        immediate wealth boost and permanently raises the settlement's growth rate. A richer settlement
        means better quests, better prices, and higher reputation bonuses for you.
      </P>

      <H3>Trade Routes</H3>
      <P>
        Settlements trade with each other via automated trade routes. Completing a trade run between two
        settlements boosts both their economies. Open the Trade Routes panel to see active routes and
        assign your own cargo runs for profit.
      </P>
    </div>
  )
}

function Crafting() {
  return (
    <div>
      <H2>Crafting & Forge</H2>

      <H3>Basic Crafting</H3>
      <P>
        Open the Crafting panel (<KeyBadge k="C" />) to see all recipes available with your current
        materials. Recipes unlock as you level up crafting skills or discover blueprints in the world.
        The Blueprint Tree shows the full unlock path.
      </P>

      <H3>The Forge</H3>
      <P>
        The Forge panel (<KeyBadge k="V" />) handles metal-tier crafting — weapons, armour, and advanced
        tools. Forge items require ingots (smelt ore at a furnace first) and have quality tiers based
        on your Smithing skill level.
      </P>

      <H3>Alchemy</H3>
      <P>
        The Alchemy panel (<KeyBadge k="Y" />) lets you brew potions and elixirs from gathered herbs and
        minerals. Higher Alchemy skill unlocks more powerful recipes and improves potion potency.
      </P>

      <H3>Crafting Mastery</H3>
      <P>
        Each crafting discipline (Smithing, Alchemy, Woodworking, etc.) has its own mastery track.
        Reaching mastery tiers unlocks passive bonuses — faster craft times, extra output, and
        exclusive master-tier recipes. Track progress in the Crafting Mastery panel.
      </P>

      <H3>Materials Tier List</H3>
      <div style={{ fontSize: 11, color: 'rgba(170,200,230,0.65)', lineHeight: 2 }}>
        <div><Tag color="#94a3b8">STONE</Tag> Early-game tools and structures</div>
        <div><Tag color="#fb923c">COPPER</Tag> First metal tier — basic weapons and armour</div>
        <div><Tag color="#a78bfa">BRONZE</Tag> Copper + Tin — improved durability</div>
        <div><Tag color="#94a3b8">IRON</Tag> Mid-game workhorse material</div>
        <div><Tag color="#60cdcc">STEEL</Tag> Iron + Carbon — high-tier gear</div>
        <div><Tag color="#ffd700">GOLD</Tag> Luxury items, trading, and enchantments</div>
      </div>
    </div>
  )
}

function Multiplayer() {
  return (
    <div>
      <H2>Multiplayer</H2>

      <H3>Playing with Others</H3>
      <P>
        The game is fully multiplayer. Other players appear in the world with name tags above their heads.
        The tag colour shows ping quality — green is good, yellow is moderate, red is high latency.
        A small dot next to the name shows if a player is AFK (yellow) or active (green).
      </P>

      <H3>Chat</H3>
      <P>
        Press <KeyBadge k="Enter" /> to open the chat box. Messages are visible to all nearby players.
        Press <KeyBadge k="Escape" /> to close chat without sending.
      </P>

      <H3>Party System</H3>
      <P>
        Form a party with other players to share quest progress, loot bonuses, and see each other
        highlighted on the map with a green ring on name tags. Party members gain shared XP on kills
        and quest completions.
      </P>

      <H3>Inspect Players</H3>
      <P>
        Click on another player's name tag or find them in the Online Players panel (<KeyBadge k="O" />)
        to inspect their character — see their title, level, faction standing, and equipped gear.
      </P>

      <H3>Emotes</H3>
      <P>
        Hold <KeyBadge k="T" /> to open the emote wheel. Select an emote with your mouse or press the
        number key shown. Emotes play animations visible to nearby players.
      </P>

      <H3>Spectate Mode</H3>
      <P>
        If you die, you enter spectate mode and can watch other players using the arrow keys to cycle
        between them. You respawn after a short timer.
      </P>
    </div>
  )
}

function Tips() {
  const tips = [
    { icon: '⚡', text: 'Sprint conserves stamina better than dodge rolling — save rolls for combat.' },
    { icon: '🗺', text: 'Check the World Map (M) early. Settlement icons show their prosperity tier at a glance.' },
    { icon: '💰', text: 'Investing gold in Coldwater early gives the highest long-term return — it starts poor but grows fast.' },
    { icon: '🌧', text: 'Rain extinguishes campfires. Build a roof over your crafting station or wait out storms.' },
    { icon: '📋', text: 'The Quest Board refreshes every ~60 seconds of sim time. Check back often for new contracts.' },
    { icon: '🏆', text: 'Achievements aren\'t just trophies — many unlock passive bonuses and title progressions.' },
    { icon: '🤝', text: 'NPCs remember your actions. Being rude in dialogue lowers their mood and affects prices.' },
    { icon: '⚗', text: 'Alchemy potions stack with food buffs. Brew a stamina potion before a long dungeon run.' },
    { icon: '🔥', text: 'The Forge produces better quality at higher skill. Level smithing on cheap copper items first.' },
    { icon: '🌍', text: 'World Events (Chronicle panel) are time-limited. Drop what you\'re doing when a World Boss appears.' },
    { icon: '👑', text: 'Titles give stat bonuses. Open Title Progression (X) to see which are close to unlocking.' },
    { icon: '🐾', text: 'Pets gain XP passively. Equip your pet before logging off — free XP while you\'re away.' },
  ]

  return (
    <div>
      <H2>Tips & Tricks</H2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tips.map((tip, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: 12,
            padding: '10px 14px',
            background: 'rgba(0,180,255,0.03)',
            border: '1px solid rgba(0,180,255,0.08)',
            borderRadius: 4,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{tip.icon}</span>
            <span style={{ fontSize: 12, color: 'rgba(170,200,230,0.7)', lineHeight: 1.7 }}>{tip.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DocsPage() {
  const [active, setActive] = useState<Section>('getting-started')

  const content: Record<Section, React.ReactNode> = {
    'getting-started': <GettingStarted />,
    'controls':        <Controls />,
    'systems':         <Systems />,
    'settlements':     <Settlements />,
    'crafting':        <Crafting />,
    'multiplayer':     <Multiplayer />,
    'tips':            <Tips />,
  }

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      overflow: 'hidden',
      background: 'rgba(4,8,18,0.88)',
    }}>

      {/* ── Left nav ──────────────────────────────────────────────────────── */}
      <div style={{
        width: 180,
        flexShrink: 0,
        borderRight: '1px solid rgba(0,180,255,0.1)',
        overflowY: 'auto',
        padding: '12px 0',
      }}>
        <div style={{
          fontSize: 9, letterSpacing: 3,
          color: 'rgba(0,180,255,0.3)',
          padding: '4px 14px 10px',
        }}>
          GAME GUIDE
        </div>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 14px',
              background: active === s.id ? 'rgba(0,180,255,0.08)' : 'transparent',
              border: 'none',
              borderLeft: `2px solid ${active === s.id ? '#00d4ff' : 'transparent'}`,
              color: active === s.id ? '#00d4ff' : 'rgba(120,160,200,0.5)',
              fontSize: 11,
              fontFamily: 'inherit',
              letterSpacing: 0.5,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 13 }}>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
        minWidth: 0,
      }}>
        {content[active]}
      </div>

    </div>
  )
}
