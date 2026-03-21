---
name: M8 Track 1 Weather System
description: M8 Track 1 emergent weather system — server Markov chain, client particle renderer, HUD widget, fire suppression, hypothermia
type: project
---

M8 Track 1: Weather System — DONE (commit 615a066, deployed to universe-sim-beryl.vercel.app)

**Why:** Atmosphere interacting with terrain — rain, cold snaps, heat waves. Emergent from simulation, not scripted.

**Architecture:**
- `server/src/WeatherSystem.js` — 8-sector Markov-chain state machine. Transitions every 5 real minutes (env WEATHER_TRANSITION_MS). Biome-weighted: polar/desert/temperate/tropical. Broadcasts WEATHER_UPDATE on every transition. Posts Slack on STORM start.
- `src/store/weatherStore.ts` — Zustand store: 8 SectorWeather entries + playerSectorId + lightningActive.
- `src/rendering/WeatherRenderer.tsx` — R3F instanced particles: 2000 rain (oriented along windDir+gravity), 800 snow (spiral when temp<0), 300 wind dust, cloud billboard sphere (opacity scales CLEAR→STORM), lightning DirectionalLight flash (15-45s in STORM, 100ms burst).
- `src/world/WeatherSectors.ts` — Client-side sector ID mapping (mirrors server getSectorForPosition exactly).
- `src/net/WorldSocket.ts` — WEATHER_UPDATE dispatch + WORLD_SNAPSHOT weather hydration.
- `src/engine/LocalSimManager.ts` — suppressFire(wx,wy,wz,radius) sends 'cool' to chem worker (already handled by worker at line 64).
- `src/rendering/SceneRoot.tsx` — WeatherRendererWrapper inside Canvas. GameLoop: sector tracking, rain→suppressFire, cold→wind-chill→setAmbientTemp, hypothermia HP drain (<0°C: STORM=1.5 HP/s, RAIN=0.5 HP/s).
- `src/ui/HUD.tsx` — WeatherWidget SVG icons (sun/cloud/rain/storm) + temp reading in top-right corner.
- `server/src/index.js` — WeatherSystem instantiated, wired, started. weather.getSnapshot() in WORLD_SNAPSHOT JOIN response.

**Pass criteria audit — all PASS:**
1. Weather transitions through states — Markov chain fires every 5 min server-side, WEATHER_UPDATE broadcast to all clients.
2. Rain falls with correct wind angle — velocity = windDirToVec(windDir)*windSpeed + gravity in WeatherRenderer useFrame.
3. Rain extinguishes campfire — suppressFire() calls chem worker 'cool' message during RAIN/STORM frames.
4. Storm causes body heat loss — hypothermia drain: if ambientTemp<0°C and STORM → 1.5 HP/s, RAIN → 0.5 HP/s.
5. HUD shows weather state — WeatherWidget with SVG icon + °C in top-right.

**Pitfalls encountered:**
- Linter injected a simpler WeatherWidget (with emojis) as duplicate at line 344 — removed it, kept SVG version.
- Linter also injected a suppressFire using 'cool' message (correct approach) before my hand-written one landed — removed duplicate, kept linter's cleaner version which already matched chem worker protocol.
- suppressFire must use sendToChem({type:'cool',...}) not direct data mutation — chem worker runs off main thread.

**How to apply:** When adding future weather effects (fog, wind ballistics on projectiles), hook into useWeatherStore.getPlayerWeather() in GameLoop or WeatherRenderer. Server Markov tables in TRANSITION_TABLES are per-biome — add new biomes to SECTOR_BIOMES array with matching base temp.
