---
name: M20 Sprint Complete
description: M20 DONE — Code splitting (vendor chunks + lazy panels), NPC Dialogue UI (DialoguePanel + proximity), Inventory/Crafting polish (tooltips, search, tiers)
type: project
---

M20 Sprint shipped 2026-03-26. Commit 8812821.

**Track A — Code Splitting:** vite.config.js (not .ts — .js takes precedence!) manualChunks splits vendor-3d (968kB), vendor-auth (226kB), vendor-ui (126kB). 14 lazy-loaded panel/overlay chunks via React.lazy. Main chunk: 2995kB (was 3820kB single).

**Track B — NPC Dialogue UI:** DialoguePanel.tsx, dialogueStore.ts (Zustand), GameLoop proximity check at 4m with "[F] Talk to" prompt. Procedural fallback responses (no LLM key needed). Registered as lazy 'dialogue' PanelId.

**Track C — Inventory/Crafting Polish:** ItemTooltip.tsx (React portal, quality colors, category badges, tool/food stats). CraftingPanel upgraded with search (debounced 150ms), tier-grouped collapsible sections, craft flash + floating text animation.

**Why:** Code splitting was the #1 performance priority (3820kB single chunk). Dialogue UI unlocks the entire AI backend (LLMBridge, MemorySystem, EmotionModel) for players. Inventory polish improves core gameplay loop.

**How to apply:** vite.config.js is the active config (not .ts). Lazy panels follow the pattern: `const X = lazy(() => import('./panels/X').then(m => ({ default: m.X })))`. New panels must be added to both PANEL_LABEL and PANEL_COMPONENTS in SidebarShell.tsx, and PanelId union in uiStore.ts.
