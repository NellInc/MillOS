import {preview} from 'vite';
import {chromium} from 'playwright';
import {writeFile,readFile} from 'node:fs/promises';
import {acquireCaptureLock} from '../../../scripts/lib/capture-lock.mjs';
const dir='output/playwright/sign-illumination';
const remaining=process.argv.includes('--remaining');
const report=remaining?JSON.parse(await readFile(`${dir}/report.json`,'utf8')):{errors:[],failedRequests:[],cases:[]};
if(report.failure){report.previousHarnessFailure=report.failure;delete report.failure;}
const lock=await acquireCaptureLock('sign-illumination-verification');let browser,server,page;
const cameras=[
 ['shelter',[44,5,122],[29,2,140]],
 ['shelter-flour',[35,2.4,133],[29,1.4,138]],
 ['shelter-dino',[24,2.4,147],[29,1.4,142]],
 ['station',[-64,9,116],[-84,4,136]],
 ['pylon-reverse',[-76,8,147],[-75,7.2,131.5]],
];
try {
 server=await preview({preview:{host:'127.0.0.1',port:4403,strictPort:true}});
 browser=await chromium.launch({channel:'chrome',headless:false,args:['--mute-audio']});
 for(const [hour,quality] of (remaining?[[17,'medium'],[22,'low']]:[[22,'medium'],[12,'medium'],[17,'medium'],[22,'low']])){
  page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block',reducedMotion:'reduce'});
  await page.addInitScript(()=>{
   localStorage.setItem('millos-audio',JSON.stringify({version:2,muted:true,volume:0,musicEnabled:false,musicVolume:0,machineVolume:0}));
   window.__audioPlayAttempts=0;HTMLMediaElement.prototype.play=function(){window.__audioPlayAttempts++;return Promise.reject(Error('Audio disabled during verification'));};
  });
  page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});page.on('requestfailed',r=>report.failedRequests.push(r.url()));
  await page.goto(`http://127.0.0.1:4403/?benchmark=busstop&art=on&quality=${quality}&time=${hour}&pa=off`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__MILLOS_RUNTIME__?.ready&&document.documentElement.dataset.millosWorldReady==='true'&&!document.querySelector('[aria-label="Loading MillOS"]'),null,{timeout:240000});
  await page.waitForTimeout(3000);
  const state=await page.evaluate(()=>({signs:window.__MILLOS_RUNTIME__.inspectObjects('sign-backlight',100),audio:window.__MILLOS_RUNTIME__.snapshot().audio,lights:window.__MILLOS_RUNTIME__.lightRig(),playAttempts:window.__audioPlayAttempts}));
  const illuminated=state.signs.filter(s=>/heritage-(?:dino|flour)-poster|dead-dino-enamel-pylon-face|station-(?:canopy|shop)-wordmark/.test(s.path));
  const printed=state.signs.filter(s=>!illuminated.includes(s));
  if(illuminated.length!==43)throw Error(`Missing live sign faces: ${illuminated.length}`);
  if(printed.length!==1||printed.some(s=>s.material.emissiveIntensity!==0))throw Error('Bakery print must remain unlit');
  const intensities=illuminated.map(s=>s.material.emissiveIntensity);
  if(hour===22&&intensities.some(v=>v<0.84))throw Error(`Night sign not illuminated: ${intensities}`);
  if(hour===12&&intensities.some(v=>v>0.001))throw Error(`Daytime emission: ${intensities}`);
  if(hour===17&&intensities.some(v=>v<=0||v>=0.85))throw Error(`Dusk dimmer: ${intensities}`);
  if(state.playAttempts!==0||state.audio.activeNodes!==0)throw Error('Audio activity');
  const shots=[];
  for(const [name,position,target] of cameras){
   if(hour!==22&&!['shelter','station'].includes(name))continue;
   await page.evaluate(({position,target})=>window.__MILLOS_RUNTIME__.setCameraPose(position,target),{position,target});
   await page.waitForTimeout(1500);
   const file=`${hour}-${quality}-${name}.png`;await page.screenshot({path:`${dir}/${file}`});shots.push(file);
  }
  report.cases.push({hour,quality,...state,shots});console.log(JSON.stringify({hour,quality,signs:state.signs.length,emissiveRange:[Math.min(...intensities),Math.max(...intensities)],audio:state.audio,shots}));
  await page.close();page=null;
 }
 if(report.errors.length||report.failedRequests.length)throw Error('Browser diagnostics failed');
}catch(e){report.failure=String(e);if(page)await page.screenshot({path:`${dir}/failure.png`}).catch(()=>{});throw e;}
finally{await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));await browser?.close();if(server)await new Promise(r=>server.httpServer.close(r));await lock.release();}
