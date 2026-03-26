---
name: M22 Completion
description: M22 DONE — Offline save/load (localStorage+IndexedDB), player skill tree (6 skills, 10 levels, XP hooks), day/night visual polish (sun disc, moonlight, fog color, star twinkle, time-of-day widget)
type: project
---

M22 Sprint shipped 2026-03-26. Commit 8f1658b.

**Track A: Offline Save/Load** — OfflineSaveManager.ts. localStorage for small state + IndexedDB for large state (inventory/buildings/journal). Auto-save 60s from GameLoop. Manual Save/Load buttons in SettingsPanel. Atomic swap write pattern. Cloud save preference when auth'd.

**Track B: Player Skill Tree** — SkillSystem.ts singleton. 6 skills: gathering (-5% harvest time/lvl), crafting (+2% quality/lvl), combat (+5% damage/lvl), survival (-3% drain/lvl), exploration (+5% reveal/lvl), smithing (+2.5% quality/lvl). Max level 10, XP thresholds 100-22000. XP hooks in GameLoop (gather, combat kill, dig) and CraftingPanel (craft, smith). SkillTreePanel.tsx with K hotkey. Skills persist in cloud + offline saves.

**Track C: Day/Night Visual Polish** — Sun disc mesh (CircleGeometry + additive glow halo). Moonlight (secondary directional #b0c4de, 1024 shadow map). Fog color modulation (peach at golden hour, deep blue at night). Star twinkle (uTime shader uniform, per-star hash freq 1.5-4Hz). Time-of-day HUD widget (period label + Day counter). dayAngle/dayCount in gameStore.

**Build**: 3041 kB main chunk (+19 kB). SkillTreePanel lazy chunk 3.15 kB.

**Why:** Player retention features — save/load prevents progress loss, skill tree adds visible progression, day/night polish adds immersion.

**How to apply:** Next IDs unchanged from M21. New PanelId 'skills' registered. gameStore now has dayAngle/dayCount. OfflineSaveManager registered with skillSystem via registerSkillSystem().
