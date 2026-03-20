// Reproduce the terrain height calculation from SpherePlanet.ts
// to find where getSpawnPosition() places the player

function valueNoise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const uz = fz * fz * (3 - 2 * fz)

  function hash(a, b, c) {
    let h = ((a * 1619 + b * 31337 + c * 6271 + 1013) ^ 0x56789abc) >>> 0
    h = Math.imul(h, 0x9e3779b9) >>> 0
    h = (h ^ (h >>> 16)) >>> 0
    return (h / 0xffffffff) * 2 - 1
  }

  const c000 = hash(ix, iy, iz)
  const c100 = hash(ix+1, iy, iz)
  const c010 = hash(ix, iy+1, iz)
  const c110 = hash(ix+1, iy+1, iz)
  const c001 = hash(ix, iy, iz+1)
  const c101 = hash(ix+1, iy, iz+1)
  const c011 = hash(ix, iy+1, iz+1)
  const c111 = hash(ix+1, iy+1, iz+1)

  const lerp = (a, b, t) => a + (b - a) * t
  const x0 = lerp(lerp(c000, c100, ux), lerp(c010, c110, ux), uy)
  const x1 = lerp(lerp(c001, c101, ux), lerp(c011, c111, ux), uy)
  return lerp(x0, x1, uz)
}

function fbm3(x, y, z, octaves) {
  let value = 0, amplitude = 0.5, frequency = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    value += valueNoise3(x * frequency, y * frequency, z * frequency) * amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2.0
  }
  return value / total
}

function fbmWarped(x, y, z) {
  const qx = fbm3(x,       y,       z,       4)
  const qy = fbm3(x + 5.2, y + 1.3, z + 3.7, 4)
  const qz = fbm3(x + 1.7, y + 9.2, z + 2.1, 4)
  return fbm3(x + 1.0 * qx, y + 1.0 * qy, z + 1.0 * qz, 6)
}

function ridgeNoise(x, y, z, octaves) {
  let value = 0, amplitude = 0.5, frequency = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise3(x * frequency, y * frequency, z * frequency)
    value    += (1 - Math.abs(n)) * amplitude
    total    += amplitude
    amplitude *= 0.5
    frequency *= 2.0
  }
  return value / total
}

function terrainHeightAt(dx, dy, dz) {
  const scale = 3.0
  const nx = dx * scale, ny = dy * scale, nz = dz * scale

  const baseH = fbmWarped(nx * 0.5, ny * 0.5, nz * 0.5)
  const continentH = Math.pow(Math.max(0, baseH + 0.1), 0.8) * 300 - 120
  const ridgeH = ridgeNoise(nx * 1.5 + 3.3, ny * 1.5 + 3.3, nz * 1.5 + 3.3, 5)
  const mountains = Math.pow(ridgeH, 2.5) * 200
  const detailH = fbm3(nx * 6 + 9.1, ny * 6 + 9.1, nz * 6 + 9.1, 3) * 15

  const land = Math.max(continentH, -180)
  const hasMountains = continentH > 0 ? 1 : 0
  const h = land + mountains * hasMountains + detailH

  return Math.max(-180, Math.min(250, h))
}

function normalize(x, y, z) {
  const len = Math.sqrt(x*x + y*y + z*z)
  return [x/len, y/len, z/len]
}

const PLANET_RADIUS = 2000
const SEA_LEVEL = 0

// Reproduce getSpawnPosition
const LAT_STEPS = 18
const LON_STEPS = 36
let bestH = -Infinity
let bestDir = [0, 1, 0]

for (let la = 0; la <= LAT_STEPS; la++) {
  const lat = (la / LAT_STEPS) * Math.PI
  const sinLat = Math.sin(lat)
  const cosLat = Math.cos(lat)
  for (let lo = 0; lo < LON_STEPS; lo++) {
    const lon = (lo / LON_STEPS) * Math.PI * 2
    const vx = sinLat * Math.cos(lon)
    const vy = cosLat
    const vz = sinLat * Math.sin(lon)
    const [nx, ny, nz] = normalize(vx, vy, vz)
    const h = terrainHeightAt(nx, ny, nz)
    if (h > bestH) {
      bestH = h
      bestDir = [nx, ny, nz]
      if (h >= 10) break
    }
  }
  if (bestH >= 10) break
}

const [bx, by, bz] = bestDir
const r = PLANET_RADIUS + Math.max(bestH, SEA_LEVEL) + 1.0
const spawnX = bx * r
const spawnY = by * r
const spawnZ = bz * r

console.log('Spawn direction:', bestDir.map(v => v.toFixed(4)));
console.log('Spawn terrain height:', bestH.toFixed(1) + 'm')
console.log('Spawn position:', [spawnX, spawnY, spawnZ].map(v => v.toFixed(1)))
console.log('Latitude (dir.y):', Math.abs(by).toFixed(3), '(>0.82 = snow)')

// Now check where resources at north pole (0,1,0) would be in world coords
const northPoleH = terrainHeightAt(0, 1, 0)
console.log('\nNorth pole terrain height:', northPoleH.toFixed(1) + 'm')
console.log('North pole is', northPoleH > 0 ? 'LAND' : 'OCEAN')

// Check distance from spawn to north pole
const dx = spawnX - 0
const dy = spawnY - (PLANET_RADIUS + Math.max(northPoleH, 0))
const dz = spawnZ - 0
const distToNorthPole = Math.sqrt(dx*dx + dz*dz)
console.log('XZ distance from spawn to north pole:', distToNorthPole.toFixed(0) + 'm')

// Check first few wood node positions in XZ
const seededRand = (seed) => {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}
function cross3(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
}
function applyAxisAngle(v, axis, angle) {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const dot = v[0]*axis[0]+v[1]*axis[1]+v[2]*axis[2]
  const c = cross3(axis, v)
  return [v[0]*cos+c[0]*sin+axis[0]*dot*(1-cos), v[1]*cos+c[1]*sin+axis[1]*dot*(1-cos), v[2]*cos+c[2]*sin+axis[2]*dot*(1-cos)]
}

const rand = seededRand(99991)
const NODE_TYPES = [
  { type: 'stone', count: 20 }, { type: 'flint', count: 10 }, { type: 'wood', count: 20 },
]
let id = 0
for (const nt of NODE_TYPES) {
  for (let i = 0; i < nt.count; i++) {
    const angle = rand() * Math.PI * 2
    const arcDist = (12 + rand() * 200) / PLANET_RADIUS
    const ax = normalize(Math.cos(angle), 0, Math.sin(angle))
    const dir = normalize(...applyAxisAngle([0,1,0], ax, arcDist))
    const h = terrainHeightAt(...dir)
    const rr = PLANET_RADIUS + Math.max(h, 0)
    const nx = dir[0]*rr, ny = dir[1]*rr, nz = dir[2]*rr
    // Distance from spawn in XZ
    const ddx = nx - spawnX, ddz = nz - spawnZ
    const dist = Math.sqrt(ddx*ddx + ddz*ddz)
    if (nt.type === 'wood' && i < 5) {
      console.log(`  Wood node ${id}: pos=(${nx.toFixed(1)}, ${ny.toFixed(1)}, ${nz.toFixed(1)}) dist from spawn: ${dist.toFixed(0)}m terrain-h: ${h.toFixed(1)}`)
    }
    id++
  }
}
