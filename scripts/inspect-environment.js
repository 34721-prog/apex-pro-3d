// Real production render audit. No source imports are injected into the game.
import { chromium } from '@playwright/test';
import { trackCatalog } from '../src/data/tracks.js';
import fs from 'node:fs';
const tag=process.argv[2]||'before',url=process.env.GAME_URL||'http://localhost:5200';
const dir='tests/performance/environment';fs.mkdirSync(`${dir}/${tag}`,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto(url+'/?test=1');await page.waitForFunction(()=>window.__game?.world.assetsReady);
await page.evaluate(async()=>{__game.frame=()=>{};await new Promise(requestAnimationFrame);Object.assign(__game.save.settings,{controlMode:'manager',quality:'medium',autoQuality:false,bots:5,audio:false});});
const results=[];
for(const t of trackCatalog){
 const initial=await page.evaluate(async id=>{const g=__game;g.race=null;const start=performance.now();await g.loadTrack(id,{page:true});g.save.settings.track=id;g.start();g.race.state='racing';const w=g.world;w.quality('medium');w.elapsed=0;w.venues.clock=0;document.querySelector('#race-hud').style.visibility='hidden';for(let n=0;n<600;n++)g.race.step(1/60,{});return{loadMs:performance.now()-start,venues:w.venues.plan.length,spectators:w.venues.plan.reduce((s,v)=>s+v.spectators,0),environment:w.environment?.stats||null};},t.id);
 const cameras=[];
 for(const mode of ['overview','broadcast','chase','pit-garage']){
  const data=await page.evaluate(mode=>{const g=__game,w=g.world;w.cameraMode=mode;w.cameraReady=false;for(let i=0;i<2;i++)w.render(0,g.race.cars,g.race.state,0,1);w.renderer.getContext().finish();return{mode,camera:w.camera.position.toArray(),near:w.camera.near,far:w.camera.far,fov:w.camera.fov,look:w.look.toArray(),calls:w.renderer.info.render.calls,triangles:w.renderer.info.render.triangles,memory:{...w.renderer.info.memory},environment:w.environment?.stats||null};},mode);
  await page.screenshot({path:`${dir}/${tag}/${t.id}-${mode}.jpg`,quality:80});cameras.push(data);
 }
 results.push({track:t.id,theme:t.theme,...initial,cameras});console.log(tag,t.id,initial.spectators,cameras.map(c=>c.calls));
}
fs.writeFileSync(`${dir}/${tag}-inspection.json`,JSON.stringify({url,viewport:'1280x720',quality:'medium',scenario:'6 autonomous cars, 600 ticks, four actual camera modes; rendering frozen at same authoritative poses',results,errors},null,2));await browser.close();if(errors.length)throw Error(errors.join('\n'));
