---
name: project_m10
description: M10 — Seasonal Cycle, Ocean Sailing, and Advanced NPC Trade Economy — all three tracks DONE, deployed to production
type: project
---

M10 committed as fdaafe9, deployed to production (dpl_8eF4FvUXHeDLXAAdxspGerqMxEpt, READY). Live at universe-sim-beryl.vercel.app.

**Why:** Milestone 10 adds world depth via seasons, naval gameplay, and a functioning economy layer.

**How to apply:** Next MAT ID: 63, next ITEM ID: 63, next recipe ID: 88.

## Track A — Seasonal Cycle
- `server/src/SeasonSystem.js`: SPRING/SUMMER/AUTUMN/WINTER cycling at 10 min/season (40 min/year). Broadcasts `SEASON_CHANGED` every 30s. `getSnapshot()` for WORLD_SNAPSHOT join.
- `src/store/seasonStore.ts`: Zustand store with SeasonName, SeasonState, setSeason().
- `src/rendering/SeasonalTerrainPass.tsx`: AutumnOverlay (BackSide sphere #d4822a, opacity 0→0.12), WinterOverlay (#dfe8f0, 0→0.18), SpringBlossoms (2000 Points, white #f8f4ff).
- HUD: SeasonWidget with season-specific SVG icon (flower/sun/maple/snowflake) after WeatherWidget.
- Winter metabolic rate +20% via seasonStore.metabolicMult applied per-frame in GameLoop.
- SEASON_TEMP_MODIFIER: Spring +2C, Summer +10C, Autumn -2C, Winter -15C.

## Track B — Ocean Sailing and Navigation
- `src/world/SailingSystem.ts`: Module singleton _state. Raft: wind-only + WASD paddle. Boat: tacking with angleOffWind efficiency curve (no-go <45deg, close-hauled 0.6-1.0, beam 1.0, run 0.75). `startFishing()`, `tickFishing(dt)` returns 'bite'|'waiting'|'idle'.
- `src/rendering/SailingRenderer.tsx`: Procedural RaftMesh (5 cylinders + 2 rope lashings) and SailingBoatMesh (hull box + bow cone + mast + sail plane + boom + deck boards). Outer groupRef positioned at PLANET_RADIUS+0.3 along surface normal. Two inner useFrame calls: one for transform, one for raftRef/boatRef visibility toggle.
- Recipes: 81 (rope shortcut 3x fiber), 82 (raft 6xwood+4xfiber+2xrope), 83 (sailing boat 8xwood+4xiron_ingot+6xrope), 84 (compass 1xiron_ingot), 85 (fishing rod 2xwood+3xfiber).
- New items: RAFT:59, SAILING_BOAT:60, COMPASS:61, FISHING_ROD:62.
- Fishing: F key near water, 5-15s bite timer, yields MAT.FISH (60).

## Track C — Advanced NPC Trade Economy
- `server/src/TradeEconomy.js`: settlement_stockpiles table (settlement_id PK, stockpile TEXT, copper_coins INT). Supply/demand: shortage (<10 units) → up to 2.5x multiplier; surplus (>50) → 0.6x. Sell price = buy price x 1.2.
- Settlement specializations: Ashford=wood/leather/hide, Ironhaven=iron/copper/iron_ingot, Saltmere=fish/salt/rope, Thornwall=stone/iron/coal, Ridgepost=grain/fiber/leather.
- Caravans: spawn every 300s, carry 30% of surplus (max 15 units), 3-min one-way travel. Arrive and deposit into destination stockpile.
- `src/store/shopStore.ts`: openShop(settlementId, settlementName, catalog), closeShop(), updateCatalog().
- `src/ui/ShopHUD.tsx`: Fixed dark panel, Buy/Sell tabs, qty input, optimistic client updates, sends SHOP_BUY/SHOP_SELL to server.
- New MATs: COPPER_COIN:59, FISH:60, SALT:61, GRAIN:62. Recipe 86: mint 5x copper → 20x COPPER_COIN.

## Known Issues
- `api/slack-notify.ts` has a pre-existing TS error (`Cannot find module '@vercel/node'`). Does not block build or deployment. Pre-dates M10.
- Chunk size warning (3,886 kB main bundle) — pre-existing, not new.
