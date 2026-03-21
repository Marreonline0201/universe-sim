// ── SidebarShell ───────────────────────────────────────────────────────────────
// Right-edge icon strip (48 px) + animated panel mount.
// Registers global hotkeys. Blocks game input while any panel is open.

import React, { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUiStore, type PanelId } from '../store/uiStore'
import { useGameStore } from '../store/gameStore'
import { InventoryPanel } from './panels/InventoryPanel'
import { CraftingPanel } from './panels/CraftingPanel'
import { TechTreePanel } from './panels/TechTreePanel'
import { EvolutionPanel } from './panels/EvolutionPanel'
import { JournalPanel } from './panels/JournalPanel'
import { CharacterPanel } from './panels/CharacterPanel'
import { MapPanel } from './panels/MapPanel'
import { SettingsPanel } from './panels/SettingsPanel'
import { BuildPanel } from './panels/BuildPanel'
import { SciencePanel } from './panels/SciencePanel'

const PANEL_LABEL: Record<PanelId, string> = {
  inventory: 'INVENTORY',
  crafting:  'CRAFTING',
  build:     'BUILD',
  tech:      'TECH TREE',
  evolution: 'EVOLUTION',
  journal:   'JOURNAL',
  character: 'CHARACTER',
  map:       'MAP',
  settings:  'SETTINGS',
  science:   'SCIENCE COMPANION',
}

const PANEL_WIDTH = 480

const PANEL_COMPONENTS: Record<PanelId, React.ComponentType> = {
  inventory:  InventoryPanel,
  crafting:   CraftingPanel,
  build:      BuildPanel,
  tech:       TechTreePanel,
  evolution:  EvolutionPanel,
  journal:    JournalPanel,
  character:  CharacterPanel,
  map:        MapPanel,
  settings:   SettingsPanel,
  science:    SciencePanel,
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
        case 't': case 'T':   e.preventDefault(); togglePanel('tech');       break
        case 'e': case 'E':
          // Don't intercept E while pointer is locked — PlayerController uses it for eat/interact
          if (!document.pointerLockElement) { e.preventDefault(); togglePanel('evolution') }
          break
        case 'j': case 'J':   e.preventDefault(); togglePanel('journal');    break
        case 'Tab':           e.preventDefault(); togglePanel('character');  break
        case 'm': case 'M':   e.preventDefault(); togglePanel('map');        break
        case '?': case '/':
          if (!document.pointerLockElement) { e.preventDefault(); togglePanel('science') }
          break
        case 'Escape':
          e.preventDefault()
          if (placementMode) setPlacementMode(null)
          else if (activePanel !== null) closePanel()
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
              {ActivePanel && <ActivePanel />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Science companion floating button — bottom right, always visible */}
      <button
          onClick={() => togglePanel('science')}
          title="Science Companion (? or /)"
          style={{
            position: 'fixed',
            bottom: 72,
            right: 16,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: activePanel === 'science' ? '#cd4420' : 'rgba(20,20,20,0.92)',
            border: `1px solid ${activePanel === 'science' ? '#cd4420' : '#333'}`,
            color: activePanel === 'science' ? '#fff' : '#888',
            fontSize: 16,
            fontWeight: 700,
            fontFamily: 'monospace',
            cursor: 'pointer',
            zIndex: 190,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
            pointerEvents: 'auto',
            lineHeight: 1,
          }}
          onMouseEnter={e => {
            if (activePanel !== 'science') {
              e.currentTarget.style.borderColor = '#cd4420'
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.background = 'rgba(205,68,32,0.18)'
            }
          }}
          onMouseLeave={e => {
            if (activePanel !== 'science') {
              e.currentTarget.style.borderColor = '#333'
              e.currentTarget.style.color = '#888'
              e.currentTarget.style.background = 'rgba(20,20,20,0.92)'
            }
          }}
        >
          ?
        </button>

    </>
  )
}
