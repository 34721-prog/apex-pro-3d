import {test,expect} from '@playwright/test';
import {trackCatalog} from '../src/data/tracks.js';
test('environment production: 14 tracks, unchanged population, reversible LOD and camera clipping',async({page})=>{
 test.setTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('/?test=1');await page.waitForFunction(()=>window.__game?.world.assetsReady);
 await page.evaluate(async()=>{__game.frame=()=>{};await new Promise(requestAnimationFrame);Object.assign(__game.save.settings,{bots:5,controlMode:'manager',audio:false});});
 for(const t of trackCatalog){
  const result=await page.evaluate(async id=>{const g=__game;g.race=null;await g.loadTrack(id,{page:true});g.save.settings.track=id;g.start();g.race.state='racing';const w=g.world,e=w.environment;
   const original=JSON.stringify(g.race.cars),population=w.venues.plan.reduce((s,v)=>s+v.spectators,0),rows=[];
   for(const quality of ['low','medium','high']){
    w.quality(quality);
    for(const mode of ['overview','cockpit','pit-garage','broadcast']){
     w.cameraMode=mode;w.cameraReady=false;w.render(0,g.race.cars,g.race.state);
     rows.push({quality,mode,near:w.camera.near,far:w.camera.far,distance:w.camera.position.distanceTo(w.look),fogNear:w.scene.fog.near,fogFar:w.scene.fog.far,count:e.lods.reduce((n,c)=>n+(c.near.visible?c.near.count:0)+(c.far.visible?c.far.count:0),0),spectators:w.venues.plan.reduce((s,v)=>s+v.spectators,0)});
    }
   }
   let shoulders=0;w.scene.traverse(o=>{if(o.material?.color?.getHexString()==='898d81')shoulders++;});
   return{population,rows,vegetation:e.plan.vegetation.length,facilities:e.plan.facilities.length,immutable:original===JSON.stringify(g.race.cars),cars:g.race.cars.length,shoulders,attached:e.root.parent===w.scene};
  },t.id);
  expect(result.immutable,t.id).toBe(true);expect(result.cars).toBe(6);expect(result.shoulders).toBe(2);expect(result.attached).toBe(true);expect(result.vegetation).toBeGreaterThan(200);
  for(const row of result.rows){expect(row.count).toBe(result.vegetation);expect(row.spectators).toBe(result.population);expect(row.fogFar).toBeGreaterThan(row.fogNear);if(row.mode==='overview'){expect(row.far).toBeGreaterThan(row.distance+500);expect(row.near).toBe(20);}else if(row.mode==='cockpit')expect(row.near).toBe(.2);}
 }
 expect(errors).toEqual([]);
});
