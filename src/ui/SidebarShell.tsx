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
import { useDialogueStore } from '../store/dialogueStore'

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
const SkillTreePanel = lazy(() => import('./panels/SkillTreePanel').then(m => ({ default: m.SkillTreePanel })))
const QuestPanel       = lazy(() => import('./panels/QuestPanel').then(m => ({ default: m.QuestPanel })))
const AchievementPanel = lazy(() => import('./panels/AchievementPanel').then(m => ({ default: m.AchievementPanel })))

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
}

const PANEL_WIDTH = 480

// Right-edge icon strip entries — order determines vertical position
const ICON_BUTTONS: Array<{ id: PanelId; icon: string; hint: string }> = [
  { id: 'inventory',  icon: 'INV',  hint: 'Inventory (I)' },
  { id: 'crafting',   icon: 'CRF',  hint: 'Crafting (C)' },
  { id: 'build',      icon: 'BLD',  hint: 'Build (B)' },
  { id: 'journal',    icon: 'JRN',  hint: 'Journal (J)' },
  { id: 'character',  icon: 'CHR',  hint: 'Character (Tab)' },
  { id: 'map',        icon: 'MAP',  hint: 'Map (M)' },
  { id: 'skills',     icon: 'SKL',  hint: 'Skills (K)' },
  { id: 'quests',     icon: 'QST',  hint: 'Quests (Q)' },
  { id: 'science',    icon: ' ? ',  hint: 'Science Companion (?)' },
  { id: 'settings',   icon: 'SET',  hint: 'Settings (Esc)' },
]

const PANEL_COMPONENTS: Record<PanelId, React.ComponentType> = {
  inventory:  InventoryPanel,
  crafting:   CraftingPanel,
  build:      BuildPanel,
  journal:    JournalPanel,
  character:  CharacterPanel,
  map:        MapPanel,
  settings:   SettingsPanel,
  science:    SciencePanel,
  dialogue:   DialoguePanel,
  skills:     SkillTreePanel,
  quests:     QuestPanel,
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
        case 'e': case 'E':
          // Try to eat (works even without pointer lock for browser testing)
          if (!document.pointerLockElement) {
            e.preventDefault()
            const ps = usePlayerStore.getState()
            const eid = ps.entityId
            if (eid) tryEatFood(inventory, eid)
          }
          break
        case 'j': case 'J':   e.preventDefault(); togglePanel('journal');    break
        case 'k': case 'K':   e.preventDefault(); togglePanel('skills');     break
        case 'q': case 'Q':   e.preventDefault(); togglePanel('quests');     break
        case 'Tab':           e.preventDefault(); togglePanel('character');  break
        case 'm': case 'M':   e.preventDefault(); togglePanel('map');        break
        case '?': case '/':
          if (!document.pointerLockElement) { e.preventDefault(); togglePanel('science') }
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
