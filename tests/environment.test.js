import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {trackCatalog} from '../src/data/tracks.js';
import {configureTrack, samples, TRACK_WIDTH} from '../src/track.js';
import {venuePlan,footprintDistance} from '../src/venue/VenueLayout.js';
import {pitSceneryClear} from '../src/strategy/PitLayout.js';
import {environmentPlan,environmentProfile,environmentView} from '../src/graphics/EnvironmentPlan.js';
import {EnvironmentVisuals,groundGeometry} from '../src/graphics/EnvironmentVisuals.js';
for(const t of trackCatalog)test('environment safe deterministic composition: '+t.id,()=>{
 configureTrack(t.id);const venues=venuePlan(),plan=environmentPlan(venues);
 assert.deepEqual(plan,environmentPlan(venues));assert.ok(plan.vegetation.length>200);assert.ok(plan.facilities.length>=18);
 for(const p of [...plan.vegetation,...plan.facilities]){
  const nearest=Math.min(...samples.map(s=>Math.hypot(s.x-p.x,s.z-p.z)));
  assert.ok(nearest-p.radius>TRACK_WIDTH/2+19,'whole footprint outside safety strip');
  assert.ok(pitSceneryClear(p.x,p.z,p.radius),'no pit structure intrusion');
  for(const v of venues)assert.ok(footprintDistance(v,p.x,p.z)>p.radius+7,'no grandstand intrusion');
  assert.ok(Math.hypot(p.x-plan.centre.x,p.z-plan.centre.z)+p.radius<plan.radius,'flat-ground support before distant hills');
 }
 const scene=new THREE.Scene(),ground=new THREE.Mesh(groundGeometry(),new THREE.MeshLambertMaterial());
 const w={scene,ground,venues:{plan:venues},cityBuildings:[]},e=new EnvironmentVisuals(w);
 const camera=new THREE.PerspectiveCamera(55,16/9,.2,1440);camera.position.set(10,5,10);scene.fog=new THREE.Fog('#888888',400,1440);
 e.update(camera,new THREE.Vector3(),w);
 assert.equal(camera.near,.2);assert.ok(camera.far>=3200);
 const count=()=>e.lods.reduce((s,c)=>s+(c.near.visible?c.near.count:0)+(c.far.visible?c.far.count:0),0);
 assert.equal(count(),plan.vegetation.length);
 camera.position.set(0,1800,0);e.update(camera,new THREE.Vector3(),w);
 assert.equal(camera.near,20);assert.equal(count(),plan.vegetation.length);
 const terrain=e.root.children.find(c=>c.name==='continuous-distant-landscape');
 assert.ok(terrain.geometry.attributes.normal.getY(0)>0,'landscape faces upward');
 for(const lod of e.lods){assert.equal(lod.near.instanceMatrix,lod.far.instanceMatrix);assert.equal(lod.near.instanceColor,lod.far.instanceColor);}
 const near=e.treeGeometry();near.computeBoundingBox();assert.ok(near.boundingBox.min.y<.001,'vegetation rests on terrain, not floating');near.dispose();
 const geometries=new Set([ground.geometry]),materials=new Set([ground.material]);scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});
test('every circuit has its own environment identity; view output is reusable',()=>{
 assert.equal(new Set(trackCatalog.map(t=>environmentProfile(t.id).identity)).size,14);
 const out={};assert.equal(environmentView(1000,1300,1400,out),out);assert.ok(out.far>2700);assert.ok(out.fogFar>out.fogNear);
});
