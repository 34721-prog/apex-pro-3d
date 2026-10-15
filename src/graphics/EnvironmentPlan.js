// Visual-only land use. No simulation state, timers or random global state.
import { activeTrack, at, samples, length, TRACK_WIDTH, bounds } from '../track.js';
import { pitPoint, pitFacilities, pitLayout } from '../strategy/PitLayout.js';
import { footprintDistance } from '../venue/VenueLayout.js';

const profiles = {
  aurora: ['Bosques e campus', 'broad', 14, 190, '#557850', '#8b9980', '#c6bb9e', '#6b7764', 1.0],
  veloce: ['Colinas agrícolas', 'pine', 13, 240, '#627a52', '#888f74', '#d0c4a5', '#7b6552', .7],
  serpente: ['Mesas de arenito', 'rock', 8, 250, '#aa7552', '#b78d68', '#d4b894', '#8b6250', .65],
  neon: ['Distrito metropolitano', 'broad', 10, 85, '#42625b', '#697d8a', '#768b98', '#354759', .5],
  titan: ['Complexo do deserto', 'rock', 12, 180, '#92735d', '#a58d72', '#c8bba4', '#6f7474', .75],
  vento: ['Parque marítimo', 'broad', 11, 100, '#70845a', '#9aa38d', '#e5ded0', '#4e8190', .85],
  sahara: ['Dunas e pavilhões', 'rock', 5, 120, '#bc9d72', '#c7ad83', '#e0caa3', '#b48059', .4],
  alpine: ['Florestas de altitude', 'pine', 20, 460, '#4d6b60', '#929fa0', '#c0c7c4', '#596976', 1.1],
  emerald: ['Bosque denso e clareiras', 'broad', 18, 170, '#406b51', '#718c70', '#bdc7ad', '#566756', 1.3],
  oldtown: ['Bairro de telhados', 'broad', 10, 110, '#6e7953', '#a6957c', '#c5b596', '#975f4b', .65],
  sunset: ['Jardins da costa', 'broad', 13, 140, '#7a8259', '#ab9c7f', '#dbc4ac', '#a16c5c', 1.0],
  nordic: ['Taiga de inverno', 'snow', 18, 270, '#a4bcb6', '#bbcbd0', '#b6c5cc', '#62788a', 1.05],
  'desert-night': ['Escarpas e observatório', 'rock', 10, 300, '#8c827d', '#8c929f', '#a9b5c4', '#566787', .7],
  discovery: ['Reserva e centro de visitantes', 'pine', 16, 210, '#5e7858', '#849580', '#c5c5ad', '#657a74', 1.0],
};
export function environmentProfile(id = activeTrack.id) {
  const [identity, form, height, relief, foliage, ridge, wall, roof, density] = profiles[id] || profiles.discovery;
  return { identity, form, height, relief, foliage, ridge, wall, roof, density };
}
function randomFor(id) {
  let seed = 2166136261;
  for (const c of id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed); return ((seed ^ seed >>> 14) >>> 0) / 4294967296; };
}
export function environmentPlan(venues = [], city = []) {
  const profile = environmentProfile(), rand = randomFor(activeTrack.id), b = { ...bounds() };
  const grid = new Map(), cell = 64;
  const insert = (p, radius) => {
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push({ x:p.x, z:p.z, radius });
  };
  // Oversampling margin includes the gap between authoritative road samples.
  for (const p of samples) insert(p, TRACK_WIDTH / 2 + 20 + length / samples.length);
  for (let s = -250; s <= 350; s += 8)
    for (const off of [0, 15, 26, 36, 50, 65, 80, 99, 112]) insert(pitPoint(s, off), 10);
  const buildings = [...pitFacilities(), ...pitLayout().map(v => ({ ...pitPoint(v.s, 50), heading:v.heading, halfWidth:8.5, halfLength:v.garageLength/2+.2 })), ...city]
    .map(v => ({ ...v, halfDepth:v.halfLength }));
  const occupied = [];
  const clear = (x, z, radius) => {
    const reach = radius + TRACK_WIDTH / 2 + 20 + length / samples.length;
    for (let ix=Math.floor((x-reach)/cell);ix<=Math.floor((x+reach)/cell);ix++)
      for(let iz=Math.floor((z-reach)/cell);iz<=Math.floor((z+reach)/cell);iz++)
        for(const p of grid.get(`${ix},${iz}`)||[])
          if(Math.hypot(x-p.x,z-p.z)<radius+p.radius) return false;
    if (activeTrack.theme==='coast' && x+radius > b.maxX+60 && Math.abs(z)<900+radius) return false;
    if (venues.some(v=>footprintDistance(v,x,z)<radius+8)) return false;
    if (buildings.some(v=>footprintDistance(v,x,z)<radius+5)) return false;
    return !occupied.some(p=>Math.hypot(x-p.x,z-p.z)<radius+p.radius+3);
  };
  const facilities=[];
  // Concourse services live behind, not in front of, each existing stand.
  for(const v of venues) {
    for(const distance of [v.halfDepth+31,v.halfDepth+58,v.halfDepth+90]) {
      const x=v.x+Math.sin(v.heading)*distance,z=v.z+Math.cos(v.heading)*distance;
      if(!clear(x,z,22)) continue;
      const p={x,z,heading:v.heading,radius:22,index:facilities.length};
      facilities.push(p);occupied.push(p);break;
    }
  }
  // Small groups of buildings form districts, rather than one isolated box per sector.
  for(let i=0;i<16;i++) {
    const t=at(length*(i+.45)/16),side=i%2?-1:1;
    for(const offset of [145,225,310]) {
      const x=t.p.x+t.right.x*side*offset,z=t.p.z+t.right.z*side*offset;
      if(!clear(x,z,32)) continue;
      const p={x,z,heading:t.heading,radius:32,index:facilities.length,district:true};
      facilities.push(p);occupied.push(p);break;
    }
  }
  const vegetation=[];
  for(let i=0;i<42;i++) {
    const t=at(length*(i+.23)/42),side=i%2?-1:1;
    const offset=75+(i%3)*100, cx=t.p.x+t.right.x*side*offset,cz=t.p.z+t.right.z*side*offset;
    const count=Math.round((18+(i%4)*3)*profile.density);
    for(let n=0;n<count;n++) {
      const angle=rand()*Math.PI*2,r=Math.sqrt(rand())*(35+(i%3)*22);
      const x=cx+Math.cos(angle)*r,z=cz+Math.sin(angle)*r;
      const scale=.65+rand()*.75, radius=profile.height*scale*(profile.form==='rock'?.8:profile.form==='broad'?.43:.3);
      if(!clear(x,z,radius)) continue;
      // Keep neighboring crowns distinct; bare clearing remains readable.
      if(vegetation.some(p=>Math.hypot(x-p.x,z-p.z)<(radius+p.radius)*.7))continue;
      vegetation.push({x,z,scale,radius,heading:rand()*Math.PI*2,tone:.8+rand()*.35});
    }
  }
  const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
  const radius=Math.max(...samples.map(p=>Math.hypot(p.x-cx,p.z-cz)))+520;
  return { profile, bounds:b, vegetation, facilities, centre:{x:cx,z:cz}, radius };
}
// Camera-dependent clipping is presentation only. Near precision matters at kilometre scale.
export function environmentView(height, distance, radius, out = {}) {
  const elevated=Math.max(0,Math.min(1,(height-50)/250));
  out.near=.2+19.8*elevated;
  out.far=Math.max(3200,distance+radius*2.2);
  out.fogNear=400+(distance+radius*.15-400)*elevated;
  out.fogFar=2400+(distance+radius*2.4-2400)*elevated;
  return out;
}
