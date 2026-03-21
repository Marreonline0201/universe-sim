---
name: M5 Track 3 — Visual Photorealism Pass
description: All 6 photorealism systems implemented in M5 Track 3; shader patterns, material factories, postprocessing setup
type: project
---

M5 Track 3 Visual Photorealism Pass implemented on 2026-03-21. All 6 systems are complete.

## 1. Terrain Wet Edge Darkening (PlanetTerrain.tsx)

`makeTerrainMaterial()` extended via `onBeforeCompile`. Adds `uSeaRadius` uniform (= PLANET_RADIUS + SEA_LEVEL). In `color_fragment`: elevation = `length(vTerrainWorldPos) - uSeaRadius`; wetFactor ramps from 1.0 at sea level to 0.0 at 20m; albedo *= `1.0 - wetFactor * 0.15`. In `roughnessmap_fragment`: `roughnessFactor += wetFactor * 0.20`.

**Why:** SEA_LEVEL = 0, so uSeaRadius = PLANET_RADIUS exactly. The terrain worldPos length minus PLANET_RADIUS gives correct elevation in metres above water.

## 2. Tree Wind Sway — Vertex Shader (SceneRoot.tsx)

`makeWindFoliageMaterial(color, treeHeight)` factory creates MeshStandardMaterial with `onBeforeCompile`. Injects `uTime` + `uTreeHeight` uniforms. Vertex displacement before `<project_vertex>`:
```glsl
float _windT = position.y / uTreeHeight;
transformed.x += sin(uTime * 0.5 + position.z * 0.3) * 0.02 * _windT * uTreeHeight;
transformed.z += sin(uTime * 0.37 + position.x * 0.25) * 0.012 * _windT * uTreeHeight;
```
`_windUniforms` stashed on material object. TreeMesh useFrame updates `uTime.value = clock.elapsedTime + phaseOffset` per tree. Three materials per tree (mat1/mat2/mat3), each with `useMemo([])`. Layered on top of existing crown group rotation sway.

## 3. Rock Specular Face Variation (SceneRoot.tsx)

`makeRockMaterial(color)` factory. `onBeforeCompile` injects into `roughnessmap_fragment`:
```glsl
roughnessFactor *= (0.7 + 0.3 * abs(vNormal.y));
```
Top faces (normal.y=1): 0.7× roughness = shinier. Side faces (normal.y=0): 1.0× = unchanged roughness. RockMesh uses `useMemo([])` for stable material instance.

## 4. Creature SSS (CreatureRenderer.tsx)

`makeCreatureMaterial()` creates MeshStandardMaterial with vertexColors. `onBeforeCompile` injects before `#include <output_fragment>`:
```glsl
float _sssBack = max(0.0, -dot(vNormal, vec3(0,1,0))) * 0.3;
outgoingLight += diffuseColor.rgb * _sssBack * vec3(0.9, 0.6, 0.4);
```
Applied to instanced mesh via `<primitive object={creatureMat} attach="material" />`.

## 5. Night Atmosphere Fog (DayNightCycle.tsx)

Night fog density: `0.016 + 0.002 * abs(sinA)` (was 0.014 flat). Day unchanged: `0.008 + 0.004 * (1-sinA)`. Night peak at midnight = 0.018 — 30% above daytime peak 0.012.

## 6. Post-Processing (SceneRoot.tsx)

`@react-three/postprocessing` installed. Import at top: `EffectComposer, Bloom, Vignette`. Placed inside Canvas after GameLoop block:
- `<Bloom luminanceThreshold={0.8} intensity={0.4} luminanceSmoothing={0.025} />`
- `<Vignette offset={0.3} darkness={0.5} eskil={false} />`

**Why:** Bloom threshold 0.8 limits glow to HDR-bright emissives (fire, uranium nodes) — prevents over-glow on sunlit terrain. Vignette offset 0.3 confines darkening to outer 30% of frame.

## Package

`@react-three/postprocessing` + `postprocessing` added with `--legacy-peer-deps`.

**How to apply:** When adding new materials, follow the `onBeforeCompile` + factory pattern established here. The `_windUniforms` stashing pattern is the correct approach for per-frame uniform updates on compiled shaders.
