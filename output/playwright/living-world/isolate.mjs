import {preview} from 'vite';
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import os from 'node:os';
import {acquireCaptureLock} from '../../../scripts/lib/capture-lock.mjs';
const dir='output/playwright/living-world';
const lock=await acquireCaptureLock('living-world-paired-population-cost');
let browser,server;
const report={scenes:[],errors:[]};
try {
 server=await preview({preview:{host:'127.0.0.1',port:4403,strictPort:true}});
 browser=await chromium.launch({channel:'chrome',headless:false,args:['--mute-audio']});
 for(const scene of ['interior','village']){
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:2,serviceWorkers:'block'});
  const page=await context.newPage();
  await page.addInitScript(()=>{
   localStorage.setItem('millos-audio',JSON.stringify({version:2,muted:true,volume:0,musicEnabled:false,musicVolume:0,machineVolume:0}));
   window.__audioPlayAttempts=0;HTMLMediaElement.prototype.play=function(){window.__audioPlayAttempts++;return Promise.reject(Error('Audio disabled during verification'));};
  });
  page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
  await page.goto(`http://127.0.0.1:4403/?benchmark=${scene}&art=on&quality=medium&time=12&pa=off`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__MILLOS_RUNTIME__?.ready&&document.documentElement.dataset.millosWorldReady==='true'&&!document.querySelector('[aria-label="Loading MillOS"]'),null,{timeout:240000});
  await page.waitForTimeout(7000);
  const samples=[];
  for(const populated of [true,false,false,true,true,false]){
   await page.evaluate(populated=>window.__MILLOS_RUNTIME__.setPerfDebug({disableCommunityLife:!populated}),populated);
   await page.waitForTimeout(2000);
   await page.evaluate(()=>window.__MILLOS_RUNTIME__.reset());
   await page.waitForTimeout(6000);
   const s=await page.evaluate(()=>{const s=window.__MILLOS_RUNTIME__.snapshot();return {averageFrameMs:s.averageFrameMs,p95FrameMs:s.p95FrameMs,p99FrameMs:s.p99FrameMs,averageFps:s.averageFps,calls:s.renderer.calls,people:s.humanPresence.people.filter(p=>p.visible).length,audio:s.audio,playAttempts:window.__audioPlayAttempts};});
   if(s.audio.activeNodes||s.playAttempts)throw Error('Audio was attempted');
   if(populated?s.people===0:s.people!==0)throw Error('Population isolation is inert');
   samples.push({populated,...s,loadPerCore:os.loadavg()[0]/os.cpus().length});
  }
  const pairs=[[0,1],[3,2],[4,5]].map(([on,off])=>({on:samples[on].averageFrameMs,off:samples[off].averageFrameMs,delta:samples[on].averageFrameMs-samples[off].averageFrameMs,callsAdded:samples[on].calls-samples[off].calls}));
  const controls=samples.filter(s=>!s.populated).map(s=>s.averageFrameMs);
  const result={scene,samples,pairs,controlSpread:Math.max(...controls)-Math.min(...controls)};
  await page.evaluate(()=>window.__MILLOS_RUNTIME__.setPerfDebug({disableCommunityLife:false}));
  await page.evaluate(async()=>{
   const api=window.__MILLOS_AGENT__;const uri='millos://simulation/main';const d=api.draft({capabilityId:'simulation.set-speed',targetUri:uri,parameters:{simulationUri:uri,speed:180},reason:'Silent local animation cost verification'});const p=await api.preview(d);if(p.status!=='ready')throw Error('Preview not ready');const r=await api.commit(p);if(r.status!=='verified')throw Error('Speed not verified');
  });
  await page.waitForTimeout(2000);
  await page.evaluate(()=>window.__MILLOS_RUNTIME__.reset());
  await page.waitForTimeout(8000);
  result.live=await page.evaluate(()=>{const s=window.__MILLOS_RUNTIME__.snapshot();return {averageFrameMs:s.averageFrameMs,p95FrameMs:s.p95FrameMs,averageFps:s.averageFps,calls:s.renderer.calls,audio:s.audio,playAttempts:window.__audioPlayAttempts};});
  if(result.live.audio.activeNodes||result.live.playAttempts)throw Error('Live audio was attempted');
  result.live.loadPerCore=os.loadavg()[0]/os.cpus().length;
  report.scenes.push(result);console.log(JSON.stringify(result));
  await page.evaluate(()=>window.__MILLOS_RUNTIME__.setPerfDebug({disableCommunityLife:false}));
  await context.close();
 }
 if(report.errors.length)throw Error('Browser errors');
} finally {
 await writeFile(`${dir}/population-cost.json`,JSON.stringify(report,null,2));
 await browser?.close();if(server)await new Promise(r=>server.httpServer.close(r));await lock.release();
}
