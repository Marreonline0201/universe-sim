// ── SidebarShell ───────────────────────────────────────────────────────────────
// Right-edge icon strip (48 px) + animated panel mount.
// Registers global hotkeys. Blocks game input while any panel is open.

import React, { useEffect, Suspense, lazy } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUiStore, type PanelId } from '../store/uiStore'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { cancelFishing, isFishingActive } from '../world/SailingSystem'
import { tryEatFood } from '../game/SurvivalSystems'
import { inventory } from '../game/GameSingletons'
import { rollLoot, applyLootToInventory, CHEST_LOOT_TABLE } from '../game/LootSystem'
import { fishingSystem } from '../game/FishingSystem'
import { spellSystem } from '../game/SpellSystem'
import { useDialogueStore } from '../store/dialogueStore'
import { useSettlementStore } from '../store/settlementStore'

// ── Lazy-loaded panels (M20 code splitting) ──────────────────────────────────
const InventoryPanel = lazy(() => import('./panels/InventoryPanel').then(m => ({ default: m.InventoryPanel })))
const CraftingPanel  = lazy(() => import('./panels/CraftingPanel').then(m => ({ default: m.CraftingPanel })))
const JournalPanel   = lazy(() => import('./panels/JournalPanel').then(m => ({ default: m.JournalPanel })))
const CharacterPanel = lazy(() => import('./panels/CharacterPanel').then(m => ({ default: m.CharacterPanel })))
const MapPanel       = lazy(() => import('./panels/MapPanel').then(m => ({ default: m.MapPanel })))
const SettingsPanel  = lazy(() => import('./panels/SettingsPanel').then(m => ({ default: m.SettingsPanel })))
const BuildPanel     = lazy(() => import('./panels/BuildPanel').then(m => ({ default: m.BuildPanel })))
const SciencePanel   = lazy(() => import('./panels/SciencePanel').then(m => ({ default: m.SciencePanel })))
const DialoguePanel  = lazy(() => import('./panels/DialoguePanel').then(m => ({ default: m.DialoguePanel })))
const SkillTreePanel = lazy(() => import('./panels/SkillPanel').then(m => ({ default: m.SkillTreePanel })))
const QuestPanel       = lazy(() => import('./panels/QuestPanel').then(m => ({ default: m.QuestPanel })))
const AchievementPanel = lazy(() => import('./panels/AchievementPanel').then(m => ({ default: m.AchievementPanel })))
const FishingPanel     = lazy(() => import('./panels/FishingPanel').then(m => ({ default: m.FishingPanel })))
const MerchantPanel    = lazy(() => import('./panels/MerchantPanel').then(m => ({ default: m.MerchantPanel })))
const PlayerListPanel  = lazy(() => import('./panels/PlayerListPanel').then(m => ({ default: m.PlayerListPanel })))
const HomePanel        = lazy(() => import('./panels/HomePanel').then(m => ({ default: m.HomePanel })))
const FactionPanel     = lazy(() => import('./panels/FactionPanel').then(m => ({ default: m.FactionPanel })))
// M36 Track C: Buildings panel (wrapper reads settlementId from store)
const BuildingsPanelLazy = lazy(() => import('./panels/BuildingsPanel').then(m => ({ default: m.BuildingsPanel })))
// M37 Track C: Progression panel (titles, stats, milestones)
const ProgressionPanel = lazy(() => import('./panels/ProgressionPanel').then(m => ({ default: m.ProgressionPanel })))
// M41 Track A: Alchemy workspace panel
const AlchemyPanel = lazy(() => import('./panels/AlchemyPanel').then(m => ({ default: m.AlchemyPanel })))
// M42 Track A: Trade post panel
const TradePostPanel = lazy(() => import('./panels/TradePostPanel').then(m => ({ default: m.TradePostPanel })))
// M43 Track A: Forge / weapon upgrade panel
const ForgePanel = lazy(() => import('./panels/ForgePanel').then(m => ({ default: m.ForgePanel })))
// M44 Track B: Housing & furniture panel
const HousingPanel = lazy(() => import('./panels/HousingPanel').then(m => ({ default: m.HousingPanel })))
// M45 Track A: Pet & companion panel
const PetPanel = lazy(() => import('./panels/PetPanel').then(m => ({ default: m.PetPanel })))
// M48 Track C: World events log panel
const WorldEventsPanel = lazy(() => import('./panels/WorldEventsPanel').then(m => ({ default: m.WorldEventsPanel })))
// M49 Track B: Trading routes panel (player-established routes)
const TradingRoutesPanel = lazy(() => import('./panels/TradingRoutesPanel').then(m => ({ default: m.TradingRoutesPanel })))
// M56 Track A: Dynamic NPC trade routes panel
const TradeRoutesPanel = lazy(() => import('./panels/TradeRoutesPanel').then(m => ({ default: m.TradeRoutesPanel })))
// M49 Track C: Bestiary panel
const BestiaryPanel = lazy(() => import('./panels/BestiaryPanel').then(m => ({ default: m.BestiaryPanel })))
// M50 Track A: Reputation titles panel
const ReputationTitlesPanel = lazy(() => import('./panels/ReputationTitlesPanel').then(m => ({ default: m.ReputationTitlesPanel })))
// M50 Track B: Weather forecast panel
const WeatherForecastPanel = lazy(() => import('./panels/WeatherForecastPanel').then(m => ({ default: m.WeatherForecastPanel })))
// Cave features panel
const CaveFeaturesPanel = lazy(() => import('./panels/CaveFeaturesPanel').then(m => ({ default: m.CaveFeaturesPanel })))
// M51 Track B: NPC Relationship panel
const RelationshipPanel = lazy(() => import('./panels/RelationshipPanel').then(m => ({ default: m.RelationshipPanel })))
// M52 Track A: Faction War panel
const FactionWarPanel = lazy(() => import('./panels/FactionWarPanel').then(m => ({ default: m.FactionWarPanel })))
// M53 Track A: Seasonal events panel
const SeasonalPanel = lazy(() => import('./panels/SeasonalPanel').then(m => ({ default: m.SeasonalPanel })))
// M54 Track B: Bounty board panel
const BountyBoardPanel = lazy(() => import('./panels/BountyBoardPanel').then(m => ({ default: m.BountyBoardPanel })))
// M54 Track C: Exploration discoveries panel
const DiscoveriesPanel = lazy(() => import('./panels/DiscoveriesPanel').then(m => ({ default: m.DiscoveriesPanel })))
// M54 Track A: Merchant Guild panel
const MerchantGuildPanel = lazy(() => import('./panels/MerchantGuildPanel').then(m => ({ default: m.MerchantGuildPanel })))
// M55 Track A: NPC Schedule panel
const NPCSchedulePanel = lazy(() => import('./panels/NPCSchedulePanel').then(m => ({ default: m.NPCSchedulePanel })))
// M55 Track B: Resource tracker panel
const ResourceTrackerPanel = lazy(() => import('./panels/ResourceTrackerPanel').then(m => ({ default: m.ResourceTrackerPanel })))
// M55 Track C: World threat tracker panel
const WorldThreatPanel = lazy(() => import('./panels/WorldThreatPanel').then(m => ({ default: m.WorldThreatPanel })))
// M56 Track C: Recipe feasibility scanner panel
const RecipeFeasibilityPanel = lazy(() => import('./panels/RecipeFeasibilityPanel').then(m => ({ default: m.RecipeFeasibilityPanel })))
// M56 Track B: Faction standing panel
const FactionStandingPanel = lazy(() => import('./panels/FactionStandingPanel').then(m => ({ default: m.FactionStandingPanel })))

// M36 Track C: Wrapper resolves nearSettlementId from store so panel has no props
function BuildingsPanelWrapper() {
  const nearSettlementId = useSettlementStore(s => s.nearSettlementId)
  const closePanel = useUiStore(s => s.closePanel)
  if (!nearSettlementId) {
    return (
      <div style={{ color: '#888', fontFamily: 'monospace', padding: 16, fontSize: 12 }}>
        You need to be near a settlement to view its buildings.
      </div>
    )
  }
  return (
    <React.Suspense fallback={null}>
      <BuildingsPanelLazy settlementId={nearSettlementId} onClose={closePanel} />
    </React.Suspense>
  )
}

const PANEL_LABEL: Record<PanelId, string> = {
  inventory: 'INVENTORY',
  crafting:  'CRAFTING',
  build:     'BUILD',
  journal:   'JOURNAL',
  character: 'CHARACTER',
  map:       'MAP',
  settings:  'SETTINGS',
  science:   'SCIENCE COMPANION',
  dialogue:  'DIALOGUE',
  skills:    'SKILLS',
  quests:       'QUESTS',
  achievements: 'ACHIEVEMENTS',
  fishing:      'FISHING',
  merchant:     'MERCHANT',
  players:      'PLAYERS ONLINE',
  home:         'HOME BASE',
  factions:     'FACTIONS',
  buildings:    'SETTLEMENT BUILDINGS',
  progression:  'PROGRESSION & TITLES',
  alchemy:      'ALCHEMY',
  tradepost:    'TRADE POST',
  forge:        'FORGE',
  housing:      'PLAYER HOUSING',
  pet:          'PET & COMPANIONS',
  worldevents:  'WORLD EVENTS LOG',
  traderoutes:  'TRADING ROUTES',
  bestiary:     'BESTIARY',
  titles:       'TITLES & REPUTATION',
  forecast:     'WEATHER FORECAST',
  cavefeatures:  'CAVE FEATURES',
  relationships: 'NPC RELATIONSHIPS',
  factionwars:   'FACTION WARS',
  seasonal:      'SEASONAL EVENTS',
  bountboard:    'BOUNTY BOARD',
  discoveries:   'EXPLORATIONS',
  merchantguild: 'MERCHANT GUILD',
  npcschedule:   'NPC SCHEDULES',
  resources:     'RESOURCE TRACKER',
  threats:        'WORLD THREAT TRACKER',
  factionstanding: 'FACTION STANDING',
  recipescan:      'RECIPE SCANNER',
}

const PANEL_WIDTH = 480

// Right-edge icon strip entries — order determines vertical position
const ICON_BUTTONS: Array<{ id: PanelId; icon: string; hint: string }> = [
  { id: 'inventory',   icon: 'INV',  hint: 'Inventory (I)' },
  { id: 'crafting',    icon: 'CRF',  hint: 'Crafting (C)' },
  { id: 'build',       icon: 'BLD',  hint: 'Build (B)' },
  { id: 'journal',     icon: 'JRN',  hint: 'Journal (J)' },
  { id: 'character',   icon: 'CHR',  hint: 'Character (Tab)' },
  { id: 'map',         icon: 'MAP',  hint: 'Map (M)' },
  { id: 'skills',      icon: 'SKL',  hint: 'Skills (K)' },
  { id: 'quests',      icon: 'QST',  hint: 'Quests (Q)' },
  { id: 'achievements',icon: '🏆',   hint: 'Achievements (Z)' },
  { id: 'progression', icon: 'TTL',  hint: 'Progression & Titles (X)' },
  { id: 'fishing',     icon: 'FSH',  hint: 'Fishing (F near water)' },
  { id: 'home',        icon: 'HME',  hint: 'Home Base (H)' },
  { id: 'players',     icon: 'PLR',  hint: 'Players Online' },
  { id: 'pet',         icon: '🐾',   hint: 'Pet & Companions (P)' },
  { id: 'factions',    icon: 'FCT',  hint: 'Factions (G)' },
  { id: 'buildings',   icon: 'STL',  hint: 'Settlement Buildings (U)' },
  { id: 'alchemy',     icon: 'ALK',  hint: 'Alchemy (Y)' },
  { id: 'tradepost',   icon: 'TRD',  hint: 'Trade Post (T)' },
  { id: 'forge',       icon: 'FRG',  hint: 'Forge (V)' },
  { id: 'housing',     icon: 'HSE',  hint: 'Housing (N)' },
  { id: 'worldevents', icon: '📜',   hint: 'World Events (L)' },
  { id: 'traderoutes', icon: '💹',   hint: 'Trading Routes' },
  { id: 'bestiary',    icon: '📖',   hint: 'Bestiary' },
  { id: 'titles',      icon: '🎖',   hint: 'Titles & Reputation' },
  { id: 'forecast',      icon: '🌤',   hint: 'Weather Forecast' },
  { id: 'cavefeatures',  icon: '⛏',   hint: 'Cave Features' },
  { id: 'relationships', icon: '🤝',  hint: 'Relations (R)' },
  { id: 'factionwars',   icon: '⚔️',  hint: 'Faction Wars (W)' },
  { id: 'seasonal',      icon: '🍃',   hint: 'Seasons (S)' },
  { id: 'bountboard',    icon: '📋',   hint: 'Bounties (5)' },
  { id: 'discoveries',   icon: '🗺',   hint: 'Discoveries (D)' },
  { id: 'merchantguild', icon: '🏪',   hint: 'Guild (E)' },
  { id: 'npcschedule',   icon: '📅',   hint: 'NPC Schedules' },
  { id: 'resources',     icon: '🌲',   hint: 'Resources' },
  { id: 'threats',       icon: '⚠️',   hint: 'World Threats (A)' },
  { id: 'factionstanding', icon: '🌟',  hint: 'Faction Standing (6)' },
  { id: 'recipescan',      icon: '🔍',  hint: 'Recipe Scanner (7)' },
  { id: 'science',         icon: ' ? ', hint: 'Science Companion (?)' },
  { id: 'settings',    icon: 'SET',  hint: 'Settings (Esc)' },
]

const PANEL_COMPONENTS: Record<PanelId, React.ComponentType> = {
  inventory:   InventoryPanel,
  crafting:    CraftingPanel,
  build:       BuildPanel,
  journal:     JournalPanel,
  character:   CharacterPanel,
  map:         MapPanel,
  settings:    SettingsPanel,
  science:     SciencePanel,
  dialogue:    DialoguePanel,
  skills:      SkillTreePanel,
  quests:      QuestPanel,
  achievements:  AchievementPanel,
  fishing:       FishingPanel,
  merchant:      MerchantPanel,
  players:       PlayerListPanel,
  home:          HomePanel,
  factions:      FactionPanel,
  buildings:     BuildingsPanelWrapper,
  progression:   ProgressionPanel,
  alchemy:       AlchemyPanel,
  tradepost:     TradePostPanel,
  forge:         ForgePanel,
  housing:       HousingPanel,
  pet:           PetPanel,
  worldevents:   WorldEventsPanel,
  traderoutes:   TradeRoutesPanel,
  bestiary:      BestiaryPanel,
  titles:        ReputationTitlesPanel,
  forecast:      WeatherForecastPanel,
  cavefeatures:  CaveFeaturesPanel,
  relationships: RelationshipPanel,
  factionwars:   FactionWarPanel,
  seasonal:      SeasonalPanel,
  bountboard:    BountyBoardPanel,
  discoveries:   DiscoveriesPanel,
  merchantguild: MerchantGuildPanel,
  npcschedule:   NPCSchedulePanel,
  resources:     ResourceTrackerPanel,
  threats:         WorldThreatPanel,
  factionstanding: FactionStandingPanel,
  recipescan:      RecipeFeasibilityPanel,
}

export function SidebarShell() {
  const { activePanel, togglePanel, closePanel } = useUiStore()
  const { setInputBlocked, placementMode, setPlacementMode } = useGameStore()

  // Block/unblock game input when panel opens/closes
  // Also release pointer lock so the cursor becomes visible for panel interaction
  const setGatherPrompt = useGameStore(s => s.setGatherPrompt)
  useEffect(() => {
    setInputBlocked(activePanel !== null)
    if (activePanel !== null) {
      setGatherPrompt(null)
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }, [activePanel, setInputBlocked, setGatherPrompt])

  // M44 Track A: Chest interaction — listens for 'open-chest' events and drops loot
  useEffect(() => {
    function onOpenChest() {
      const drops = rollLoot(CHEST_LOOT_TABLE, 2)
      const labels = applyLootToInventory(drops)
      window.dispatchEvent(new CustomEvent('loot-drop', { detail: { drops: labels, source: 'Treasure Chest' } }))
    }
    window.addEventListener('open-chest', onOpenChest)
    return () => window.removeEventListener('open-chest', onOpenChest)
  }, [])

  // Global hotkey listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input field
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      switch (e.key) {
        case 'i': case 'I':   e.preventDefault(); togglePanel('inventory');  break
        case 'c': case 'C':   e.preventDefault(); togglePanel('crafting');   break
        case 'b': case 'B':   e.preventDefault(); togglePanel('build');      break
        case 'l': case 'L':
          e.preventDefault()
          togglePanel('worldevents')
          break
        case 'j': case 'J':   e.preventDefault(); togglePanel('journal');    break
        case 'k': case 'K':   e.preventDefault(); togglePanel('skills');     break
        case 'q': case 'Q':   e.preventDefault(); togglePanel('quests');     break
        case 'g': case 'G':   e.preventDefault(); togglePanel('factions');  break
        case 'u': case 'U':   e.preventDefault(); togglePanel('buildings'); break
        case 'h': case 'H':   e.preventDefault(); togglePanel('home'); break
        case 'o': case 'O':   e.preventDefault(); togglePanel('players');      break
        case 'p': case 'P':   e.preventDefault(); togglePanel('pet');          break
        case 'x': case 'X':   e.preventDefault(); togglePanel('progression'); break
        case 'y': case 'Y':   e.preventDefault(); togglePanel('alchemy');     break
        case 't': case 'T':   e.preventDefault(); togglePanel('tradepost');  break
        case 'v': case 'V':   e.preventDefault(); togglePanel('forge');      break
        case 'n': case 'N':   e.preventDefault(); togglePanel('housing');      break
        case 'z': case 'Z':   e.preventDefault(); togglePanel('achievements'); break
        case 'd': case 'D':   e.preventDefault(); togglePanel('discoveries');   break
        case 'e': case 'E':   e.preventDefault(); togglePanel('merchantguild'); break
        case 'r': case 'R':   e.preventDefault(); togglePanel('relationships'); break
        case 'w': case 'W':   e.preventDefault(); togglePanel('factionwars');  break
        case 's': case 'S':   e.preventDefault(); togglePanel('seasonal');     break
        case 'a': case 'A':   e.preventDefault(); togglePanel('threats');     break
        case 'Tab':           e.preventDefault(); togglePanel('character');  break
        case 'm': case 'M':   e.preventDefault(); togglePanel('map');        break
        case '?': case '/':
          if (!document.pointerLockElement) { e.preventDefault(); togglePanel('science') }
          break
        case '5':
          e.preventDefault(); togglePanel('bountboard'); break
        case '6':
          e.preventDefault(); togglePanel('factionstanding'); break
        case '7':
          e.preventDefault(); togglePanel('recipescan'); break
        case '1': case '2': case '3': case '4':
          if (!document.pointerLockElement) break  // only when in-game (pointer locked)
          if (activePanel !== null) break
          e.preventDefault()
          spellSystem.castEquippedSpell(parseInt(e.key) - 1)
          break
        case 'Escape':
          e.preventDefault()
          if (isFishingActive()) { cancelFishing(); useGameStore.getState().setGatherPrompt(null) }
          else if (placementMode) setPlacementMode(null)
          else if (activePanel !== null) {
            if (activePanel === 'dialogue') useDialogueStore.getState().closeDialogue()
            closePanel()
          }
          else togglePanel('settings')
          break
        default: break
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activePanel, placementMode, togglePanel, closePanel, setPlacementMode])

  const ActivePanel = activePanel ? PANEL_COMPONENTS[activePanel] : null

  return (
    <>
      {/* Right-edge icon strip — always visible, slides left when panel is open */}
      <div style={{
        position: 'fixed',
        right: activePanel ? PANEL_WIDTH : 0,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 195,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(10,10,10,0.93)',
        borderLeft: '1px solid #2a2a2a',
        borderTop: '1px solid #2a2a2a',
        borderBottom: '1px solid #2a2a2a',
        borderRadius: '6px 0 0 6px',
        transition: 'right 0.28s cubic-bezier(0.4,0,0.2,1)',
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}>
        {ICON_BUTTONS.map(({ id, icon, hint }) => {
          const active = activePanel === id
          return (
            <button
              key={id}
              onClick={() => togglePanel(id)}
              title={hint}
              style={{
                width: 44,
                height: 34,
                background: active ? 'rgba(205,68,32,0.22)' : 'transparent',
                border: 'none',
                borderLeft: `2px solid ${active ? '#cd4420' : 'transparent'}`,
                color: active ? '#cd4420' : '#555',
                fontSize: 9,
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: 0.5,
                cursor: 'pointer',
                transition: 'all 0.12s',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.color = '#ccc'
                  e.currentTarget.style.borderLeftColor = '#444'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.color = '#555'
                  e.currentTarget.style.borderLeftColor = 'transparent'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              {icon}
            </button>
          )
        })}
      </div>

      {/* Sliding panel */}
      <AnimatePresence>
        {activePanel && (
          <motion.div
            key={activePanel}
            initial={{ x: PANEL_WIDTH }}
            animate={{ x: 0 }}
            exit={{ x: PANEL_WIDTH }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: PANEL_WIDTH,
              height: '100vh',
              background: 'rgba(14,14,14,0.97)',
              borderLeft: '1px solid #2a2a2a',
              zIndex: 200,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'auto',
            }}
          >
            {/* Panel header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px 12px',
              borderBottom: '1px solid #2a2a2a',
              borderLeft: '3px solid #cd4420',
              flexShrink: 0,
            }}>
              <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>
                {activePanel ? PANEL_LABEL[activePanel] : ''}
              </span>
              <button
                onClick={closePanel}
                style={{
                  background: 'none', border: 'none', color: '#555',
                  cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ccc')}
                onMouseLeave={e => (e.currentTarget.style.color = '#555')}
                aria-label="Close panel"
              >
                ✕
              </button>
            </div>
            {/* Panel content */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <Suspense fallback={
                <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 12, textAlign: 'center', padding: 32 }}>
                  Loading panel...
                </div>
              }>
                {ActivePanel && <ActivePanel />}
              </Suspense>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
