// ── RiverRenderer.tsx ─────────────────────────────────────────────────────────
// M9 Track 1: Photorealistic river visual.
//
// Renders each river as a flat ribbon mesh following the path positions.
// Material: custom MeshPhongMaterial with animated normal offset (water shimmer),
// Fresnel-style view-angle opacity, and deep-water depth color.
//
// Width lerp: 2m at source (t=0) → 15m at mouth (t=1).
// Ribbon geometry: one quad per path segment, width = lerp(t).
// Orientation: each segment oriented so the quad lies flat on the sphere surface
//   (up = surface normal = normalised world position).
//
// Performance: geometry built once on mount. useFrame only updates the time uniform.

import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RIVERS } from '../world/RiverSystem'
import { PLANET_RADIUS } from '../world/SpherePlanet'

// ── Water shader — injected into MeshPhongMaterial ────────────────────────────

const WATER_VERT_INJECT = /* glsl */`
varying vec3 vRiverWorldPos;
varying vec3 vRiverNormal;
`

const WATER_FRAG_INJECT_UNIFORMS = /* glsl */`
varying vec3 vRiverWorldPos;
varying vec3 vRiverNormal;
uniform float uTime;
`

function makeRiverMaterial(): THREE.MeshPhongMaterial {
  const mat = new THREE.MeshPhongMaterial({
    color:       new THREE.Color(0.06, 0.30, 0.65),
    transparent: true,
    opacity:     0.82,
    shininess:   120,
    specular:    new THREE.Color(0.5, 0.7, 1.0),
    side:        THREE.FrontSide,
    depthWrite:  false,
  })

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }

    // Vertex: pass world pos + normal for Fresnel
    shader.vertexShader = WATER_VERT_INJECT + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vRiverWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vRiverNormal   = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
    )

    // Fragment: animated shimmer via simple noise on UV + Fresnel opacity
    shader.fragmentShader = WATER_FRAG_INJECT_UNIFORMS + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Animated wave brightness — scroll along world Y axis (up the sphere)
      float wavePhase = vRiverWorldPos.y * 0.12 + uTime * 1.8;
      float wave      = 0.5 + 0.5 * sin(wavePhase) * 0.5 + 0.25 * sin(wavePhase * 2.3 + 0.7);
      diffuseColor.rgb *= 0.82 + wave * 0.25;

      // Depth color: deeper blue toward centre (approximate by using y coord variation)
      float deepFactor = 0.5 + 0.5 * sin(vRiverWorldPos.x * 0.08 + uTime * 0.5);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.15, 0.45), deepFactor * 0.3);
      `
    )

    // Fresnel-style edge transparency: more opaque when looking straight down
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `// Fresnel: edges of ribbon appear more transparent
      vec3 viewDir = normalize(cameraPosition - vRiverWorldPos);
      float fresnel = 1.0 - abs(dot(viewDir, normalize(vRiverNormal)));
      float opacity = 0.60 + 0.38 * (1.0 - fresnel * fresnel);
      #include <opaque_fragment>
      gl_FragColor.a *= opacity;
      `
    )

    // Store ref so useFrame can drive uTime
    ;(mat as any)._shaderUniforms = shader.uniforms
  }

  return mat
}

// ── Ribbon geometry builder ────────────────────────────────────────────────────

function buildRibbonGeometry(): THREE.BufferGeometry | null {
  if (RIVERS.length === 0) return null

  // Count total quads needed across all rivers
  let totalQuads = 0
  for (const river of RIVERS) {
    if (river.points.length >= 2) totalQuads += river.points.length - 1
  }
  if (totalQuads === 0) return null

  const positions = new Float32Array(totalQuads * 4 * 3)  // 4 verts per quad
  const normals   = new Float32Array(totalQuads * 4 * 3)
  const indices   = new Uint32Array(totalQuads * 6)         // 2 tris per quad

  let vi = 0  // vertex index (in units of 3 floats)
  let ii = 0  // index array pointer
  let qi = 0  // quad count (for index offset)

  for (const river of RIVERS) {
    const pts = river.points
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]

      // Surface normal at midpoint = normalised world position
      const mx = (a.x + b.x) * 0.5, my = (a.y + b.y) * 0.5, mz = (a.z + b.z) * 0.5
      const mLen = Math.sqrt(mx*mx + my*my + mz*mz) || 1
      const nx = mx / mLen, ny = my / mLen, nz = mz / mLen

      // Segment direction (tangent along river)
      let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z
      const tLen = Math.sqrt(tx*tx + ty*ty + tz*tz) || 1
      tx /= tLen; ty /= tLen; tz /= tLen

      // Right vector = cross(tangent, normal) → lies in the tangent plane perpendicular to flow
      const rx = ty * nz - tz * ny
      const ry = tz * nx - tx * nz
      const rz = tx * ny - ty * nx
      const rLen = Math.sqrt(rx*rx + ry*ry + rz*rz) || 1
      const rwx = rx / rLen, rwy = ry / rLen, rwz = rz / rLen

      const w0 = a.width * 0.5  // half-width at start of segment
      const w1 = b.width * 0.5  // half-width at end

      // Lift ribbon 0.3m above terrain to avoid z-fighting with terrain mesh
      const lift = 0.3
      const lax = a.x + nx * lift, lay = a.y + ny * lift, laz = a.z + nz * lift
      const lbx = b.x + nx * lift, lby = b.y + ny * lift, lbz = b.z + nz * lift

      // 4 verts: [left-start, right-start, left-end, right-end]
      // v0: left start
      positions[vi*3]   = lax - rwx * w0; positions[vi*3+1] = lay - rwy * w0; positions[vi*3+2] = laz - rwz * w0
      normals[vi*3]     = nx; normals[vi*3+1] = ny; normals[vi*3+2] = nz; vi++
      // v1: right start
      positions[vi*3]   = lax + rwx * w0; positions[vi*3+1] = lay + rwy * w0; positions[vi*3+2] = laz + rwz * w0
      normals[vi*3]     = nx; normals[vi*3+1] = ny; normals[vi*3+2] = nz; vi++
      // v2: left end
      positions[vi*3]   = lbx - rwx * w1; positions[vi*3+1] = lby - rwy * w1; positions[vi*3+2] = lbz - rwz * w1
      normals[vi*3]     = nx; normals[vi*3+1] = ny; normals[vi*3+2] = nz; vi++
      // v3: right end
      positions[vi*3]   = lbx + rwx * w1; positions[vi*3+1] = lby + rwy * w1; positions[vi*3+2] = lbz + rwz * w1
      normals[vi*3]     = nx; normals[vi*3+1] = ny; normals[vi*3+2] = nz; vi++

      // Two triangles: (v0, v1, v2) and (v1, v3, v2)
      const base = qi * 4
      indices[ii++] = base;   indices[ii++] = base+1; indices[ii++] = base+2
      indices[ii++] = base+1; indices[ii++] = base+3; indices[ii++] = base+2
      qi++
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal',   new THREE.BufferAttribute(normals,   3))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  return geo
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RiverRenderer() {
  const geo = useMemo(() => buildRibbonGeometry(), [])
  const mat = useMemo(() => makeRiverMaterial(),   [])
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const uniforms = (mat as any)._shaderUniforms
    if (uniforms?.uTime) {
      uniforms.uTime.value = clock.getElapsedTime()
    }
    // Also modulate opacity gently for wave effect
    mat.opacity = 0.78 + Math.sin(clock.getElapsedTime() * 0.6) * 0.04
  })

  if (!geo) return null

  return (
    <mesh ref={meshRef} geometry={geo} material={mat} />
  )
}
