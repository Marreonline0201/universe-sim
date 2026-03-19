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

interface IconDef {
  id: PanelId
  label: string
  hotkey: string
  glyph: string
}

const ICONS: IconDef[] = [
  { id: 'inventory',  label: 'Inventory',    hotkey: 'I',   glyph: '🎒' },
  { id: 'crafting',   label: 'Crafting',     hotkey: 'C',   glyph: '⚒' },
  { id: 'build',      label: 'Build',        hotkey: 'B',   glyph: '🏗' },
  { id: 'tech',       label: 'Tech Tree',    hotkey: 'T',   glyph: '🔬' },
  { id: 'evolution',  label: 'Evolution',    hotkey: 'E',   glyph: '🧬' },
  { id: 'journal',    label: 'Journal',      hotkey: 'J',   glyph: '📖' },
  { id: 'character',  label: 'Character',    hotkey: 'Tab', glyph: '👤' },
  { id: 'map',        label: 'Map',          hotkey: 'M',   glyph: '🗺' },
  { id: 'settings',   label: 'Settings',     hotkey: 'Esc', glyph: '⚙' },
]

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
        case 'e': case 'E':   e.preventDefault(); togglePanel('evolution');  break
        case 'j': case 'J':   e.preventDefault(); togglePanel('journal');    break
        case 'Tab':           e.preventDefault(); togglePanel('character');  break
        case 'm': case 'M':   e.preventDefault(); togglePanel('map');        break
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
            initial={{ x: PANEL_WIDTH + 48 }}
            animate={{ x: 0 }}
            exit={{ x: PANEL_WIDTH + 48 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 48,
              width: PANEL_WIDTH,
              height: '100vh',
              background: 'rgba(10,10,20,0.95)',
              borderLeft: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
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
              padding: '16px 20px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              flexShrink: 0,
            }}>
              <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: 14, letterSpacing: 2, fontWeight: 700 }}>
                {ICONS.find(i => i.id === activePanel)?.label.toUpperCase()}
              </span>
              <button
                onClick={closePanel}
                style={{
                  background: 'none', border: 'none', color: '#888',
                  cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4,
                }}
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

      {/* Right-edge icon strip */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 48,
        height: '100vh',
        background: 'rgba(15,15,25,0.95)',
        borderLeft: '1px solid rgba(255,255,255,0.15)',
        backdropFilter: 'blur(8px)',
        zIndex: 201,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 16,
        gap: 4,
        pointerEvents: 'auto',
      }}>
        {ICONS.map(icon => {
          const active = activePanel === icon.id
          return (
            <button
              key={icon.id}
              onClick={() => togglePanel(icon.id)}
              title={`${icon.label} [${icon.hotkey}]`}
              aria-label={icon.label}
              aria-pressed={active}
              style={{
                width: 38,
                height: 38,
                background: active ? 'rgba(52,152,219,0.35)' : 'rgba(255,255,255,0.08)',
                border: active ? '1px solid rgba(52,152,219,0.8)' : '1px solid rgba(255,255,255,0.18)',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
                flexShrink: 0,
                boxShadow: active ? '0 0 8px rgba(52,152,219,0.4)' : 'none',
              }}
            >
              {icon.glyph}
            </button>
          )
        })}
      </div>
    </>
  )
}
