---
name: M21 Sprint Complete
description: M21 DONE — Procedural ambient audio (Web Audio API, 6 layers), settlement visual upgrades (roofs/smoke/stalls/NPC dots), enhanced minimap (terrain color/settlements/resources/zoom/weather)
type: project
---

M21 Sprint shipped 2026-03-26. Three tracks:

- **Track A: Procedural Ambient Audio** — `src/audio/AmbientAudioEngine.ts` singleton + `src/audio/AudioHook.tsx` R3F bridge. 6 sound layers: wind (bandpass noise, LFO gusting), rain (highpass noise, 2s crossfade), thunder (noise burst on lightning), footsteps (terrain-dependent: grass/rock/sand/snow/water), fire crackling (1/r falloff near settlements), ocean waves (0.15Hz LFO). Volume slider in SettingsPanel.
- **Track B: Settlement Visual Upgrades** — Upgraded `SettlementRenderer.tsx`: pyramid roofs (ConeGeometry), chimneys + smoke particles (20 instanced spheres, civLevel>=2), market stalls with awnings (civLevel>=1), NPC activity dots (up to 12, random-walk AI, 100m LOD), dirt street paths (civLevel>=2). Zero per-frame allocations.
- **Track C: Enhanced Minimap** — Upgraded `MapPanel.tsx`: terrain biome color grid (44x44 samples, cached), settlement diamond markers (civLevel-colored), resource node dots (type-colored, fog-gated), player direction arrow, zoom controls (100-600m), weather/wind indicator.

Build: 3022 kB main chunk (+27 kB). Commit: c1f4364.

**Why:** These three features (audio, settlement detail, minimap) provide the highest immersion impact per engineering effort, targeting the sensory gaps identified after M20.

**How to apply:** Next IDs unchanged from M20. Audio singleton is at `ambientAudio` export. Settlement smoke uses same instanced mesh pattern as WeatherRenderer. Minimap terrain sampling is throttled (10m movement threshold).
