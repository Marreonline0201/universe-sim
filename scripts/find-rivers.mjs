// Compute river source positions for seed=42 to help navigate to rivers in-game
function seededRand(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}
function hash3(ix, iy, iz) {
  let h = (Math.imul(ix,1664525) ^ Math.imul(iy,22695477) ^ Math.imul(iz,2891336453) ^ 42 ^ 0x9e3779b9) >>> 0;
  h ^= h>>>16; h = Math.imul(h,0x45d9f3b)>>>0; h ^= h>>>16;
  return (h>>>0)/0xffffffff;
}
function smooth(t){return t*t*(3-2*t);}
function lerp(a,b,t){return a+(b-a)*t;}
function noise3(x,y,z){
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const fx=x-ix,fy=y-iy,fz=z-iz;
  const ux=smooth(fx),uy=smooth(fy),uz=smooth(fz);
  return lerp(lerp(lerp(hash3(ix,iy,iz),hash3(ix+1,iy,iz),ux),lerp(hash3(ix,iy+1,iz),hash3(ix+1,iy+1,iz),ux),uy),lerp(lerp(hash3(ix,iy,iz+1),hash3(ix+1,iy,iz+1),ux),lerp(hash3(ix,iy+1,iz+1),hash3(ix+1,iy+1,iz+1),ux),uy),uz)*2-1;
}
function fbm3(x,y,z,oct){let v=0,amp=0.5,freq=1,tot=0;for(let o=0;o<oct;o++){v+=noise3(x*freq,y*freq,z*freq)*amp;tot+=amp;amp*=0.5;freq*=2;}return v/tot;}
function ridgeNoise(x,y,z,oct){let v=0,amp=0.5,freq=1,tot=0;for(let o=0;o<oct;o++){const n=noise3(x*freq,y*freq,z*freq);v+=(1-Math.abs(n))*amp;tot+=amp;amp*=0.5;freq*=2;}return v/tot;}
function terrainH(dir){
  const sc=3,nx=dir.x*sc,ny=dir.y*sc,nz=dir.z*sc;
  const qx=fbm3(nx*.5,ny*.5,nz*.5,4),qy=fbm3(nx*.5+5.2,ny*.5+1.3,nz*.5+3.7,4),qz=fbm3(nx*.5+1.7,ny*.5+9.2,nz*.5+2.1,4);
  const base=fbm3(nx*.5+qx,ny*.5+qy,nz*.5+qz,6);
  const continentH=Math.pow(Math.max(0,base+0.1),.8)*300-120;
  const ridgeH=ridgeNoise(nx*1.5+3.3,ny*1.5+3.3,nz*1.5+3.3,5);
  const mountains=Math.pow(ridgeH,2.5)*200;
  const detailH=fbm3(nx*6+9.1,ny*6+9.1,nz*6+9.1,3)*15;
  const land=Math.max(continentH,-180);
  const hasMounts=continentH>0?1:0;
  return Math.max(-180,Math.min(250,land+mountains*hasMounts+detailH));
}

const PLANET_RADIUS = 4000;
const rand = seededRand(42);
const sources = [];
let attempts = 0;
while (sources.length < 10 && attempts < 300) {
  attempts++;
  const u = rand()*2-1, theta = rand()*Math.PI*2;
  const r = Math.sqrt(1-u*u);
  const dir = {x: r*Math.cos(theta), y: u, z: r*Math.sin(theta)};
  const h = terrainH(dir);
  if (h < 100) continue;
  // worldX/Y/Z are 3D Cartesian coords on sphere surface at this elevation
  const sourceX = dir.x*(PLANET_RADIUS+h);
  const sourceY = dir.y*(PLANET_RADIUS+h);
  const sourceZ = dir.z*(PLANET_RADIUS+h);
  // Latitude/longitude for reference
  const lat = Math.asin(dir.y) * 180 / Math.PI;
  const lon = Math.atan2(dir.z, dir.x) * 180 / Math.PI;
  sources.push({
    id: sources.length,
    h: +h.toFixed(1),
    worldX: +sourceX.toFixed(1),
    worldY: +sourceY.toFixed(1),
    worldZ: +sourceZ.toFixed(1),
    lat: +lat.toFixed(2),
    lon: +lon.toFixed(2),
    dir: {x:+dir.x.toFixed(4), y:+dir.y.toFixed(4), z:+dir.z.toFixed(4)}
  });
}
console.log(`Found ${sources.length} river sources in ${attempts} attempts`);
console.log(JSON.stringify(sources, null, 2));
