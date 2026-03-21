---
name: project_m11
description: M11 Civilization Age — gunpowder/musket, castle structures, mayor/diplomacy, astronomy/telescope — DONE
type: project
---

M11: Civilization Age — all 4 tracks complete, deployed to universe-sim-beryl.vercel.app (commit 5d9b410)

**Why:** Late-game civilization content push. civLevel 4+ unlocks castle architecture and mayors. civLevel 5+ unlocks inter-settlement diplomacy. Gunpowder and telescope bridge into L6 (Space Age) teaser.

**Track A — Gunpowder & Musket:**
- `src/game/GunpowderSystem.ts` — tickMusket(dt), fireMusket(), isMusketReady(), 8s reload, MUSKET_FIRED WS broadcast, smoke cloud array + screen shake struct
- `src/rendering/MusketVFXRenderer.tsx` — 40-particle smoke cloud (grey-white, 2s lifetime, size grows 8→40px), muzzle flash PointLight (#ffe080, intensity 8, 40ms), ShaderMaterial
- EquipSystem: ITEM.MUSKET (dmg 80, range 60m), ITEM.TELESCOPE (dmg 0, range 1m)

**Track B — Castle Structures:**
- `src/rendering/CastleRenderer.tsx` — renders civLevel 4+ settlement perimeters: 4 corner WatchTower (15m), WallSegment with crenellations, CastleGate south face with portcullis, stone PBR roughness 0.88
- BuildingSystem.ts: castle_wall (120 stone+30 mortar), castle_gate (80 stone+20 iron+20 mortar), watchtower (200 stone+50 mortar+20 wood), observatory_tower (150 stone+20 glass+15 iron)

**Track C — Civilization L5 Mayor & Diplomacy:**
- `src/store/diplomacyStore.ts` — Zustand: mayors Map, relations Map (neutral/allied/war/trade_partner), activeWars Set, notification queue (50)
- `src/ui/DiplomacyHUD.tsx` — top-right banners, color-coded (war=red, peace=green, envoy=blue, mayor=orange), 5min auto-clear, last 4 unread
- SettlementManager.js: MAYOR_UNLOCK_LEVEL=4, ENVOY_UNLOCK_LEVEL=5, envoy tick every 5min, neutral→trade_partner→allied, chance of war. getDiplomacy(), getDiplomacySnapshot()
- WorldSocket.ts: MAYOR_APPOINTED handler (sets mayor, unlocks chemistry/optics, discovers recipes 88-92), DIPLOMATIC_EVENT handler

**Track D — Astronomy & Telescope:**
- `src/rendering/NightSkyRenderer.tsx` — 2000 stars Salpeter IMF color distribution, moon sphere, 3 planets as L6 teasers, stars fade by sun angle, custom ShaderMaterial GLSL soft discs additive blending
- `src/ui/TelescopeView.tsx` — telescope barrel overlay (chromatic aberration vignette), SVG moon phase diagram (arc illuminated fraction), 3 planet analysis panels, L6 teaser anomaly on Velar, ESC to close, opened via window.dispatchEvent('open-telescope')

**New MAT/ITEM IDs:**
- MAT 63 = GLASS_INGOT (distinct from raw GLASS=18)
- MAT 64 = MUSKET_BALL
- ITEM 63 = MUSKET
- ITEM 64 = TELESCOPE
- Recipes 88-92 (gunpowder, musket, musket_balls, glass_ingot, telescope)

**Next IDs:** MAT 65, ITEM 65, recipe 93

**How to apply:** Next milestone (M12) starts at MAT 65, ITEM 65, recipe 93. L6 Space Age is the logical progression given telescope teaser. Castle architecture and diplomacy are foundation for inter-settlement warfare systems.
