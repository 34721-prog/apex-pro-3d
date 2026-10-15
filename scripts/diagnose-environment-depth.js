import {chromium} from '@playwright/test';
import fs from 'node:fs';
const dir='tests/performance/environment/depth';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}});await page.goto((process.env.GAME_URL||'http://localhost:5201')+'/?test=1');await page.waitForFunction(()=>window.__game?.world.assetsReady);
await page.evaluate(async()=>{const g=__game;g.frame=()=>{};await new Promise(requestAnimationFrame);g.start();g.race.state='racing';document.querySelector('#race-hud').style.visibility='hidden';for(let n=0;n<600;n++)g.race.step(1/60,{});g.world.environment.update=()=>{};});
const results=[];
for(const mode of ['overview','pit-garage'])for(const near of mode==='overview'?[20,100,300]:[.2,1,2])for(const shadows of [true,false]){
 const data=await page.evaluate(({mode,near,shadows})=>{const g=__game,w=g.world;w.cameraMode=mode;w.cameraReady=false;w.camera.near=near;w.camera.far=5000;w.scene.fog.near=3000;w.scene.fog.far=5000;w.camera.updateProjectionMatrix();w.renderer.shadowMap.enabled=shadows;w.render(0,g.race.cars,g.race.state);w.renderer.getContext().finish();return{depthBits:w.renderer.getContext().getParameter(w.renderer.getContext().DEPTH_BITS),near,shadows,mode};},{mode,near,shadows});
 await page.screenshot({path:`${dir}/${mode}-${near}-${shadows}.jpg`,quality:85});results.push(data);
}
fs.writeFileSync(dir+'/results.json',JSON.stringify(results,null,2));await browser.close();
