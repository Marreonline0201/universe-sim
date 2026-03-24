/**
 * generate-car.mjs
 * Procedurally builds a realistic sedan GLB using @gltf-transform/core.
 * Run: node scripts/generate-car.mjs
 * Output: public/models/car.glb
 *
 * No Blender or browser required — pure Node.js.
 *
 * Geometry strategy:
 *   Every part is built as a list of quads/triangles from parametric box/cylinder
 *   functions, merged into named meshes with separate PBR materials.
 *   Parts: body, glass, wheels×4, bumpers, lights, chrome trim.
 */

import { Document, NodeIO, Primitive } from '@gltf-transform/core'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH  = join(__dirname, '../public/models/car.glb')

// ── Tiny math helpers ─────────────────────────────────────────────────────────

function vec3(x, y, z) { return [x, y, z] }
function add3(a, b)    { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]] }
function mul3(v, s)    { return [v[0]*s, v[1]*s, v[2]*s] }
function cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
  ]
}
function normalize(v) {
  const l = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2) || 1
  return [v[0]/l, v[1]/l, v[2]/l]
}

// ── Geometry builders ─────────────────────────────────────────────────────────
// Each returns { positions: Float32Array, normals: Float32Array, indices: Uint16Array }

/**
 * Build a box (axis-aligned, then transformed by position + euler rotation).
 * rx/ry/rz are rotation angles in radians applied in XYZ order.
 */
function buildBox(w, h, d, tx=0, ty=0, tz=0, rx=0, ry=0, rz=0) {
  const hw=w/2, hh=h/2, hd=d/2

  // 8 corners in local space
  const local = [
    [-hw,-hh,-hd],[+hw,-hh,-hd],[+hw,+hh,-hd],[-hw,+hh,-hd], // -Z face
    [-hw,-hh,+hd],[+hw,-hh,+hd],[+hw,+hh,+hd],[-hw,+hh,+hd], // +Z face
  ]

  // Rotation matrices (applied RZ * RY * RX)
  function rotX(p) {
    const c=Math.cos(rx), s=Math.sin(rx)
    return [p[0], p[1]*c - p[2]*s, p[1]*s + p[2]*c]
  }
  function rotY(p) {
    const c=Math.cos(ry), s=Math.sin(ry)
    return [p[0]*c + p[2]*s, p[1], -p[0]*s + p[2]*c]
  }
  function rotZ(p) {
    const c=Math.cos(rz), s=Math.sin(rz)
    return [p[0]*c - p[1]*s, p[0]*s + p[1]*c, p[2]]
  }
  function transform(p) {
    const r = rotZ(rotY(rotX(p)))
    return [r[0]+tx, r[1]+ty, r[2]+tz]
  }

  // 6 faces, each two triangles
  const faces = [
    [0,3,2, 0,2,1], // -Z
    [4,5,6, 4,6,7], // +Z
    [0,1,5, 0,5,4], // -Y
    [2,3,7, 2,7,6], // +Y
    [0,4,7, 0,7,3], // -X
    [1,2,6, 1,6,5], // +X
  ]
  const faceNormals = [
    [0,0,-1],[0,0,1],[0,-1,0],[0,1,0],[-1,0,0],[1,0,0],
  ]

  const positions = []
  const normals   = []
  const indices   = []
  let base = 0

  for (let fi = 0; fi < 6; fi++) {
    const fn = faceNormals[fi]
    const [a,b,c,d,e,f] = faces[fi]
    const tris = [[a,b,c],[d,e,f]]
    for (const tri of tris) {
      for (const vi of tri) {
        const tp = transform(local[vi])
        positions.push(...tp)
        // Transform normal by rotation only (no translate)
        const tn = rotZ(rotY(rotX(fn)))
        normals.push(...normalize(tn))
        indices.push(base++)
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals:   new Float32Array(normals),
    indices:   new Uint16Array(indices),
  }
}

/**
 * Build a cylinder (axis along Z, then transformed).
 */
function buildCylinder(rt, rb, h, tx=0, ty=0, tz=0, rx=0, ry=0, rz=0, segs=16) {
  function rotX(p) { const c=Math.cos(rx),s=Math.sin(rx); return [p[0],p[1]*c-p[2]*s,p[1]*s+p[2]*c] }
  function rotY(p) { const c=Math.cos(ry),s=Math.sin(ry); return [p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c] }
  function rotZ(p) { const c=Math.cos(rz),s=Math.sin(rz); return [p[0]*c-p[1]*s,p[0]*s+p[1]*c,p[2]] }
  function xf(p)   { const r=rotZ(rotY(rotX(p))); return [r[0]+tx,r[1]+ty,r[2]+tz] }

  const positions = [], normals = [], indices = []
  let base = 0

  const PI2 = Math.PI * 2
  for (let i = 0; i < segs; i++) {
    const a0 = (i/segs)*PI2, a1 = ((i+1)/segs)*PI2
    const c0=Math.cos(a0), s0=Math.sin(a0)
    const c1=Math.cos(a1), s1=Math.sin(a1)

    // Side quad (two triangles)
    const p0 = [c0*rb, s0*rb, 0]
    const p1 = [c1*rb, s1*rb, 0]
    const p2 = [c1*rt, s1*rt, h]
    const p3 = [c0*rt, s0*rt, h]
    const sn0 = normalize([c0, s0, 0])
    const sn1 = normalize([c1, s1, 0])
    const snM = normalize([(c0+c1)*0.5, (s0+s1)*0.5, 0])
    const quads = [[p0,p1,p2, sn0,sn1,snM],[p0,p2,p3, sn0,snM,sn0]]
    for (const [a,b,c,na,nb,nc] of quads) {
      positions.push(...xf(a),...xf(b),...xf(c))
      normals.push(...normalize(rotZ(rotY(rotX(na)))),...normalize(rotZ(rotY(rotX(nb)))),...normalize(rotZ(rotY(rotX(nc)))))
      indices.push(base, base+1, base+2); base+=3
    }

    // Bottom cap
    const bN = [0,0,-1]
    positions.push(...xf([0,0,0]),...xf(p1),...xf(p0))
    const bnT = normalize(rotZ(rotY(rotX(bN))))
    normals.push(...bnT,...bnT,...bnT)
    indices.push(base,base+1,base+2); base+=3

    // Top cap
    const tN = [0,0,1]
    positions.push(...xf([0,0,h]),...xf(p3),...xf(p2))
    const tnT = normalize(rotZ(rotY(rotX(tN))))
    normals.push(...tnT,...tnT,...tnT)
    indices.push(base,base+1,base+2); base+=3
  }

  return {
    positions: new Float32Array(positions),
    normals:   new Float32Array(normals),
    indices:   new Uint16Array(indices),
  }
}

/**
 * Build a torus ring (axis along Z, no rotation — wheel stands vertically in XY plane).
 * r = ring radius, tube = tube radius.
 */
function buildTorus(r, tube, rSegs=12, tSegs=36) {
  const positions = [], normals = [], indices = []
  let base = 0
  const PI2 = Math.PI * 2

  for (let i = 0; i < rSegs; i++) {
    const u0 = (i/rSegs)*PI2, u1 = ((i+1)/rSegs)*PI2
    for (let j = 0; j < tSegs; j++) {
      const v0 = (j/tSegs)*PI2, v1 = ((j+1)/tSegs)*PI2

      function pt(u, v) {
        const cx = Math.cos(u) * r, cy = Math.sin(u) * r
        const dx = Math.cos(u) * Math.cos(v) * tube
        const dy = Math.sin(u) * Math.cos(v) * tube
        const dz = Math.sin(v) * tube
        return [cx+dx, cy+dy, dz]
      }
      function nm(u, v) {
        return normalize([Math.cos(u)*Math.cos(v), Math.sin(u)*Math.cos(v), Math.sin(v)])
      }

      const pts = [pt(u0,v0),pt(u1,v0),pt(u1,v1),pt(u0,v1)]
      const nms = [nm(u0,v0),nm(u1,v0),nm(u1,v1),nm(u0,v1)]
      for (const [a,b,c] of [[0,1,2],[0,2,3]]) {
        positions.push(...pts[a],...pts[b],...pts[c])
        normals.push(...nms[a],...nms[b],...nms[c])
        indices.push(base,base+1,base+2); base+=3
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals:   new Float32Array(normals),
    indices:   new Uint16Array(indices),
  }
}

// ── Merge multiple geo objects into one ───────────────────────────────────────

function mergeGeos(geos) {
  let totalV = 0, totalI = 0
  for (const g of geos) { totalV += g.positions.length/3; totalI += g.indices.length }

  const positions = new Float32Array(totalV * 3)
  const normals   = new Float32Array(totalV * 3)
  const indices   = new Uint32Array(totalI)
  let vOff = 0, iOff = 0

  for (const g of geos) {
    const cnt = g.positions.length / 3
    positions.set(g.positions, vOff * 3)
    normals.set(g.normals,     vOff * 3)
    for (let i = 0; i < g.indices.length; i++) indices[iOff + i] = g.indices[i] + vOff
    vOff += cnt; iOff += g.indices.length
  }
  return { positions, normals, indices }
}

// ── Car geometry constants ────────────────────────────────────────────────────

const GC   = 0.15   // ground clearance
const WR   = 0.31   // wheel outer radius
const BW   = 1.76   // body full width
const HBW  = 0.88   // half body width
const BB   = GC + 0.15  // body bottom Y

// ── Build each named part ──────────────────────────────────────────────────────

function buildBodyGeo() {
  return mergeGeos([
    buildBox(4.52,0.15,BW-0.04,  0, GC+0.075, 0),
    buildBox(4.22,0.72,BW-0.08,  0, BB+0.36,  0),
    buildBox(0.70,0.26,BW+0.04, -1.35, BB+0.85, 0),
    buildBox(0.66,0.26,BW+0.04, +1.35, BB+0.85, 0),
    buildBox(1.34,0.06,BW-0.14, +1.63, 1.21, 0, 0,0,-0.14),
    buildBox(0.28,0.10,BW-0.18, +0.96, 1.215, 0),
    buildBox(1.08,0.06,BW-0.16, -1.66, 1.21, 0, 0,0,+0.10),
    buildBox(0.06,0.28,BW-0.06, -2.28, BB+0.86, 0),
    buildBox(0.10,0.58,BW-0.12, +0.93, 1.26, 0, 0,0,-0.50),
    buildBox(0.09,0.52,BW-0.12, -1.10, 1.24, 0, 0,0,+0.38),
    buildBox(2.08,0.08,BW-0.22, -0.10, 1.42, 0),
    buildBox(0.08,0.42,0.10, -0.14, 1.24, +HBW-0.07),
    buildBox(0.08,0.42,0.10, -0.14, 1.24, -(HBW-0.07)),
    buildBox(0.18,0.40,BW-0.10, +2.22, BB+0.93, 0),
    // mirrors
    buildBox(0.14,0.11,0.07, +0.82, 1.08, +(HBW+0.055)),
    buildBox(0.04,0.04,0.11, +0.82, 1.04, +(HBW+0.01)),
    buildBox(0.14,0.11,0.07, +0.82, 1.08, -(HBW+0.055)),
    buildBox(0.04,0.04,0.11, +0.82, 1.04, -(HBW+0.01)),
  ])
}

function buildGlassGeo() {
  return mergeGeos([
    buildBox(0.06,0.56,BW-0.24, +0.70, 1.22, 0, 0,0,-0.95),
    buildBox(0.06,0.48,BW-0.28, -0.96, 1.22, 0, 0,0,+0.78),
    buildBox(0.84,0.40,0.06, +0.26, 1.24, +(HBW-0.06)),
    buildBox(0.84,0.40,0.06, +0.26, 1.24, -(HBW-0.06)),
    buildBox(0.72,0.36,0.06, -0.60, 1.24, +(HBW-0.06)),
    buildBox(0.72,0.36,0.06, -0.60, 1.24, -(HBW-0.06)),
    buildBox(0.22,0.22,0.06, -1.17, 1.15, +(HBW-0.06)),
    buildBox(0.22,0.22,0.06, -1.17, 1.15, -(HBW-0.06)),
    buildBox(0.10,0.09,0.012, +0.82, 1.08, +(HBW+0.098)),
    buildBox(0.10,0.09,0.012, +0.82, 1.08, -(HBW+0.098)),
  ])
}

function buildBumperGeo() {
  return mergeGeos([
    buildBox(0.20,0.42,BW+0.04, +2.28, GC+0.21, 0),
    buildBox(0.10,0.10,BW,      +2.34, GC+0.05, 0),
    buildBox(0.07,0.24,1.10,    +2.34, GC+0.47, 0),
    buildBox(0.18,0.44,BW+0.02, -2.28, GC+0.22, 0),
    buildBox(0.12,0.09,BW-0.24, -2.34, GC+0.045, 0),
    // grille
    buildBox(0.06,0.22,1.04, +2.35, GC+0.47, 0),
    buildBox(0.04,0.030,1.04, +2.36, GC+0.60, 0),
    // wheel arch liners ×4
    ...([1,-1]).flatMap(s =>
      buildCylinder(WR+0.045, WR+0.045, 0.26,
        +1.35, BB+0.72, s*(HBW+0.02), Math.PI/2, 0, 0, 20)
    ),
    ...([1,-1]).flatMap(s =>
      buildCylinder(WR+0.045, WR+0.045, 0.26,
        -1.35, BB+0.72, s*(HBW+0.02), Math.PI/2, 0, 0, 20)
    ),
  ])
}

function buildHeadlightGeo() {
  return mergeGeos([
    buildBox(0.06,0.16,0.38, +2.30, 0.86, -0.62),
    buildBox(0.06,0.16,0.38, +2.30, 0.86, +0.62),
    buildBox(0.05,0.042,0.34, +2.32, GC+0.54, -0.60),
    buildBox(0.05,0.042,0.34, +2.32, GC+0.54, +0.60),
  ])
}

function buildTaillightGeo() {
  return mergeGeos([
    buildBox(0.05,0.18,0.42, -2.30, 0.88, -0.62),
    buildBox(0.05,0.18,0.42, -2.30, 0.88, +0.62),
    buildBox(0.03,0.030,1.36, -2.30, 0.98, 0),
    buildBox(0.034,0.034,0.08, -0.28, GC+0.06, -0.52, Math.PI/2, 0, 0),
  ])
}

function buildWheelTireGeo(wx, wy, wz) {
  // Torus at wheel centre — axis along Z (wheel stands in XY plane)
  const t = buildTorus(WR-0.08, 0.10, 10, 36)
  // Translate to wheel position
  for (let i = 0; i < t.positions.length; i += 3) {
    t.positions[i  ] += wx
    t.positions[i+1] += wy
    t.positions[i+2] += wz
  }
  return t
}

function buildWheelRimGeo(wx, wy, wz) {
  // Rim: barrel + face disc + 5 spokes + hub + lug nuts
  const parts = []

  // Barrel along Z
  parts.push(buildCylinder(WR-0.19, WR-0.19, 0.20, wx, wy, wz-0.10, Math.PI/2, 0, 0, 18))
  // Face disc
  parts.push(buildCylinder(WR-0.19, WR-0.19, 0.022, wx, wy, wz+0.10, Math.PI/2, 0, 0, 18))
  // 5 spokes
  for (let i = 0; i < 5; i++) {
    const a = (i/5) * Math.PI * 2
    const sr = (WR-0.19) * 0.5
    const sx = Math.sin(a) * sr
    const sy = Math.cos(a) * sr
    parts.push(buildBox(0.055, WR-0.22, 0.038, wx+sx, wy+sy, wz+0.09, 0, 0, a))
  }
  // Hub
  parts.push(buildCylinder(0.055, 0.055, 0.044, wx, wy, wz+0.105, Math.PI/2, 0, 0, 10))
  // Lug nuts ×5
  for (let i = 0; i < 5; i++) {
    const a = (i/5) * Math.PI * 2
    parts.push(buildCylinder(0.013, 0.013, 0.022,
      wx+Math.sin(a)*0.040, wy+Math.cos(a)*0.040, wz+0.116, Math.PI/2, 0, 0, 6))
  }
  return mergeGeos(parts)
}

// Wheel positions [x,y,z]
const WHEELS = [
  [+1.35, WR, +(HBW+0.02)],
  [+1.35, WR, -(HBW+0.02)],
  [-1.35, WR, +(HBW+0.02)],
  [-1.35, WR, -(HBW+0.02)],
]

// ── Build the GLTF document ───────────────────────────────────────────────────

const doc    = new Document()
const buffer = doc.createBuffer()
const root   = doc.createScene('Car')
const io     = new NodeIO()

// Helper: add a mesh part to the scene
function addMesh(name, geo, colorRGBA, metalness=0, roughness=0.8, emissive=[0,0,0]) {
  const mesh      = doc.createMesh(name)
  const prim      = doc.createPrimitive()

  const posAcc = doc.createAccessor()
    .setBuffer(buffer)
    .setArray(geo.positions)
    .setType('VEC3')
  const norAcc = doc.createAccessor()
    .setBuffer(buffer)
    .setArray(geo.normals)
    .setType('VEC3')
  const idxAcc = doc.createAccessor()
    .setBuffer(buffer)
    .setArray(geo.indices)
    .setType('SCALAR')

  prim.setAttribute('POSITION', posAcc)
  prim.setAttribute('NORMAL', norAcc)
  prim.setIndices(idxAcc)

  const mat = doc.createMaterial(name + '_mat')
    .setBaseColorFactor(colorRGBA)
    .setMetallicFactor(metalness)
    .setRoughnessFactor(roughness)
    .setEmissiveFactor(emissive)
    .setDoubleSided(false)

  prim.setMaterial(mat)
  mesh.addPrimitive(prim)

  const node = doc.createNode(name).setMesh(mesh)
  root.addChild(node)
  return node
}

// ── Add all parts ────────────────────────────────────────────────────────────

console.log('Building body...')
addMesh('body',       buildBodyGeo(),      [0.12, 0.24, 0.36, 1.0], 0.72, 0.28)

console.log('Building glass...')
const glassMat = doc.createMaterial('glass_mat')
  .setBaseColorFactor([0.72, 0.84, 0.92, 0.38])
  .setMetallicFactor(0.0)
  .setRoughnessFactor(0.04)
  .setAlphaMode('BLEND')
  .setDoubleSided(true)
const glassMesh = doc.createMesh('glass')
const glassPrim = doc.createPrimitive()
const glassGeo  = buildGlassGeo()
glassPrim.setAttribute('POSITION', doc.createAccessor().setBuffer(buffer).setArray(glassGeo.positions).setType('VEC3'))
glassPrim.setAttribute('NORMAL',   doc.createAccessor().setBuffer(buffer).setArray(glassGeo.normals).setType('VEC3'))
glassPrim.setIndices(doc.createAccessor().setBuffer(buffer).setArray(glassGeo.indices).setType('SCALAR'))
glassPrim.setMaterial(glassMat)
glassMesh.addPrimitive(glassPrim)
root.addChild(doc.createNode('glass').setMesh(glassMesh))

console.log('Building bumpers/grille...')
addMesh('bumpers', buildBumperGeo(), [0.11, 0.11, 0.11, 1.0], 0.04, 0.82)

console.log('Building headlights...')
addMesh('headlights', buildHeadlightGeo(), [1.0, 1.0, 1.0, 1.0], 0.0, 0.08, [1.0, 1.0, 1.0])

console.log('Building taillights...')
addMesh('taillights', buildTaillightGeo(), [0.9, 0.1, 0.1, 0.9], 0.0, 0.08, [0.8, 0.05, 0.05])

console.log('Building wheels...')
const allTiresGeo = mergeGeos(WHEELS.map(([x,y,z]) => buildWheelTireGeo(x,y,z)))
addMesh('tires', allTiresGeo, [0.08, 0.08, 0.08, 1.0], 0.0, 0.95)

const allRimsGeo = mergeGeos(WHEELS.map(([x,y,z]) => buildWheelRimGeo(x,y,z)))
addMesh('rims', allRimsGeo, [0.78, 0.78, 0.78, 1.0], 0.92, 0.18)

// ── Export ────────────────────────────────────────────────────────────────────

console.log('Exporting GLB...')
const glbBuffer = await io.writeBinary(doc)
writeFileSync(OUT_PATH, glbBuffer)

const kb = (glbBuffer.byteLength / 1024).toFixed(1)
console.log(`✓ Written: ${OUT_PATH} (${kb} KB)`)
console.log('Done! Load in Three.js with: useGLTF("/models/car.glb")')
