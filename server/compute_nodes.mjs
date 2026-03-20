// Compute the first few resource node positions using the same logic as SceneRoot.tsx
// Uses the seeded random and placement logic from the game

const PLANET_RADIUS = 2000;

function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// Simplified 3D vector operations
function normalize(v) {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  return [v[0]/len, v[1]/len, v[2]/len];
}

function cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
  ];
}

function applyAxisAngle(v, axis, angle) {
  // Rodrigues' rotation formula
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = v[0]*axis[0] + v[1]*axis[1] + v[2]*axis[2];
  const c = cross(axis, v);
  return [
    v[0]*cos + c[0]*sin + axis[0]*dot*(1-cos),
    v[1]*cos + c[1]*sin + axis[1]*dot*(1-cos),
    v[2]*cos + c[2]*sin + axis[2]*dot*(1-cos),
  ];
}

const NODE_TYPES = [
  { type: 'stone',       count: 20 },
  { type: 'flint',       count: 10 },
  { type: 'wood',        count: 20 },
  { type: 'clay',        count: 12 },
  { type: 'fiber',       count: 15 },
  { type: 'copper_ore',  count: 8  },
  { type: 'iron_ore',    count: 8  },
  { type: 'coal',        count: 6  },
  { type: 'tin_ore',     count: 5  },
  { type: 'sand',        count: 8  },
  { type: 'sulfur',      count: 4  },
  { type: 'bark',        count: 15 },
];

const rand = seededRand(99991);
const spawnDir = [0, 1, 0]; // north pole

const nodes = [];
let id = 0;
for (const nt of NODE_TYPES) {
  for (let i = 0; i < nt.count; i++) {
    const angle = rand() * Math.PI * 2;
    const arcDist = (12 + rand() * 200) / PLANET_RADIUS; // radians
    const axis = normalize([Math.cos(angle), 0, Math.sin(angle)]);
    const dir = normalize(applyAxisAngle(spawnDir, axis, arcDist));
    // Place at planet surface (approximate - assume sea level height ~0)
    const r = PLANET_RADIUS; // approximate
    nodes.push({
      id: id++,
      type: nt.type,
      x: dir[0] * r,
      y: dir[1] * r,
      z: dir[2] * r,
      arcDist: (arcDist * PLANET_RADIUS).toFixed(1) + 'm',
    });
  }
}

// Print wood nodes (trees) first
console.log('=== WOOD (Tree) nodes ===');
nodes.filter(n => n.type === 'wood' || n.type === 'bark').slice(0, 5).forEach(n => {
  console.log(`  id=${n.id} pos=(${n.x.toFixed(1)}, ${n.y.toFixed(1)}, ${n.z.toFixed(1)}) dist=${n.arcDist}`);
});

console.log('\n=== STONE nodes ===');
nodes.filter(n => n.type === 'stone').slice(0, 5).forEach(n => {
  console.log(`  id=${n.id} pos=(${n.x.toFixed(1)}, ${n.y.toFixed(1)}, ${n.z.toFixed(1)}) dist=${n.arcDist}`);
});

console.log('\n=== All nodes (first 10) ===');
nodes.slice(0, 10).forEach(n => {
  console.log(`  id=${n.id} type=${n.type} pos=(${n.x.toFixed(1)}, ${n.y.toFixed(1)}, ${n.z.toFixed(1)}) dist=${n.arcDist}`);
});

// Calculate how far these are from north pole in world coords
// and average position
const woodNodes = nodes.filter(n => n.type === 'wood');
const avgX = woodNodes.reduce((s,n) => s+n.x, 0) / woodNodes.length;
const avgY = woodNodes.reduce((s,n) => s+n.y, 0) / woodNodes.length;
const avgZ = woodNodes.reduce((s,n) => s+n.z, 0) / woodNodes.length;
console.log(`\nWood nodes average position: (${avgX.toFixed(1)}, ${avgY.toFixed(1)}, ${avgZ.toFixed(1)})`);
console.log(`North pole position: (0, ${PLANET_RADIUS}, 0)`);

// The player spawn position: getSpawnPosition scans from north pole
// If spawn is at (0, 2000+h, 0), the nodes are also near Y=2000
// The distance in XZ between spawn and nodes would tell us how far to walk

// Assuming player spawns near (0, 2000, 0), calculate XZ distance to first wood node
const firstWood = nodes.find(n => n.type === 'wood');
if (firstWood) {
  // In the game, the player is on the sphere surface near north pole
  // Resources are at firstWood.x, firstWood.z in the XZ plane
  const xzDist = Math.sqrt(firstWood.x**2 + firstWood.z**2);
  console.log(`\nFirst wood node at (${firstWood.x.toFixed(1)}, ${firstWood.y.toFixed(1)}, ${firstWood.z.toFixed(1)})`);
  console.log(`XZ distance from planet axis: ${xzDist.toFixed(1)}m`);
}
