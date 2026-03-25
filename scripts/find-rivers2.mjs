// Compute spawn position and nearest river for seed=42
// Replicates SpherePlanet + RiverSystem logic in pure JS

// === Terrain helpers ===
const PLANET_RADIUS = 4000, SEA_LEVEL = 2;

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
  const land=Math.max(continentH,-180);const hasMounts=continentH>0?1:0;
  return Math.max(-180,Math.min(250,land+mountains*hasMounts+detailH));
}

// === Compute Spawn Position (same as SpherePlanet.getSpawnPosition) ===
function getSpawnPosition() {
  const LAT_STEPS=36, LON_STEPS=72;
  let bestScore=-Infinity, bestDir=[0,1,0], bestH=10;
  for (let la=0; la<=LAT_STEPS; la++) {
    const lat=la/LAT_STEPS*Math.PI, sinLat=Math.sin(lat), cosLat=Math.cos(lat);
    for (let lo=0; lo<LON_STEPS; lo++) {
      const lon=lo/LON_STEPS*Math.PI*2;
      const dx=sinLat*Math.cos(lon), dy=cosLat, dz=sinLat*Math.sin(lon);
      const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
      const dir={x:dx/len, y:dy/len, z:dz/len};
      const h=terrainH(dir);
      if (h<10) continue;
      const absY=Math.abs(dir.y);
      const polarPenalty=absY>0.68?(absY-0.68)*12:0;
      const altPenalty=h>120?(h-120)*0.15:0;
      const inlandBonus=h>=30&&h<=100?3:(h>=10?1:0);
      const score=inlandBonus-polarPenalty-altPenalty;
      if (score>bestScore){bestScore=score;bestDir=[dir.x,dir.y,dir.z];bestH=h;}
    }
  }
  const [bx,by,bz]=bestDir;
  const len2=Math.sqrt(bx*bx+by*by+bz*bz);
  const ndx=bx/len2, ndy=by/len2, ndz=bz/len2;
  const r=PLANET_RADIUS+Math.max(bestH,SEA_LEVEL)+1;
  return {x:ndx*r, y:ndy*r, z:ndz*r, h:bestH, dir:{x:+ndx.toFixed(4),y:+ndy.toFixed(4),z:+ndz.toFixed(4)}};
}

// === Compute River Sources ===
function seededRand(seed) {
  let s=seed>>>0;
  return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/0xffffffff;};
}
const rand=seededRand(42);
const sources=[];
let attempts=0;
while (sources.length<10 && attempts<300) {
  attempts++;
  const u=rand()*2-1,theta=rand()*Math.PI*2;
  const r2=Math.sqrt(1-u*u);
  const dir={x:r2*Math.cos(theta),y:u,z:r2*Math.sin(theta)};
  const h=terrainH(dir);
  if (h<100) continue;
  const r=PLANET_RADIUS+h;
  sources.push({id:sources.length,h:+h.toFixed(1),x:+(dir.x*r).toFixed(1),y:+(dir.y*r).toFixed(1),z:+(dir.z*r).toFixed(1),lat:+(Math.asin(dir.y)*180/Math.PI).toFixed(1),lon:+(Math.atan2(dir.z,dir.x)*180/Math.PI).toFixed(1)});
}

const spawn = getSpawnPosition();
console.log("=== SPAWN POSITION ===");
console.log(`World 3D: (${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}, ${spawn.z.toFixed(1)})`);
console.log(`Terrain h at spawn: ${spawn.h.toFixed(1)}m`);
console.log(`Dir: ${JSON.stringify(spawn.dir)}`);
const spawnLat=(Math.asin(spawn.dir.y)*180/Math.PI).toFixed(1);
const spawnLon=(Math.atan2(spawn.dir.z,spawn.dir.x)*180/Math.PI).toFixed(1);
console.log(`Lat/Lon: (${spawnLat}°, ${spawnLon}°)`);
console.log();
console.log("=== RIVER SOURCES (distance from spawn) ===");
const withDist=sources.map(s=>{
  const dx=s.x-spawn.x, dy=s.y-spawn.y, dz=s.z-spawn.z;
  const dist3d=Math.sqrt(dx*dx+dy*dy+dz*dz);
  // Also compute arc distance on sphere surface
  const spawnR=Math.sqrt(spawn.x**2+spawn.y**2+spawn.z**2);
  const srcR=Math.sqrt(s.x**2+s.y**2+s.z**2);
  const dot=(spawn.x*s.x+spawn.y*s.y+spawn.z*s.z)/(spawnR*srcR);
  const arcDeg=Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI;
  const arcDist=(arcDeg/360)*2*Math.PI*PLANET_RADIUS;
  return {...s, dist3d:+dist3d.toFixed(0), arcDist:+arcDist.toFixed(0), arcDeg:+arcDeg.toFixed(1)};
});
withDist.sort((a,b)=>a.arcDist-b.arcDist);
withDist.forEach(s=>{
  console.log(`River ${s.id}: arc=${s.arcDist}m (${s.arcDeg}° away) | h=${s.h}m | lat=${s.lat}° lon=${s.lon}°`);
});
