import { preview } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import os from 'node:os';
import assert from 'node:assert/strict';
import { acquireCaptureLock } from '../../../scripts/lib/capture-lock.mjs';
const label = process.argv[2] ?? 'after';
const dir = `output/playwright/living-world/animation-${label}`;
await mkdir(dir, { recursive: true });
const lock = await acquireCaptureLock(`community-animation-${label}`);
let browser, server;
const report = { errors: [], failedRequests: [], cases: [] };
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
const cases = [
 { id:'baker', actor:'village-baker', camera:[[-172,2.3,8.3],[-175.1,1,5]], minTravel:.02 },
 { id:'gardener', actor:'village-gardener', camera:[[-212.9,1.9,9],[-215.3,.7,10.7]], minTravel:.05 },
 { id:'rest', actor:'mill-engineer', camera:[[-29.2,2.4,-8.4],[-34,.9,-11.5]], minTravel:.02 },
 { id:'operator', actor:'mill-operator-west', camera:[[-27,2.5,37.5],[-24,1.1,33.5]], minTravel:.01 },
];
try {
 server = await preview({preview:{host:'127.0.0.1',port:4403,strictPort:true}});
 browser = await chromium.launch({channel:'chrome',headless:false,args:['--mute-audio']});
 for (const c of cases) {
  const context = await browser.newContext({viewport:{width:960,height:640},serviceWorkers:'block', recordVideo:{dir,size:{width:960,height:640}}});
  const page = await context.newPage();
  await page.addInitScript(() => {
   localStorage.setItem('millos-audio',JSON.stringify({version:2,muted:true,volume:0,musicEnabled:false,musicVolume:0,machineVolume:0}));
   window.__audioPlayAttempts=0;
   HTMLMediaElement.prototype.play=function(){window.__audioPlayAttempts++;return Promise.reject(Error('Silent QA'));};
  });
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
  await page.goto('http://127.0.0.1:4403/?benchmark=village&art=on&quality=medium&time=10.15&pa=off',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__MILLOS_RUNTIME__?.ready&&document.documentElement.dataset.millosWorldReady==='true'&&!document.querySelector('[aria-label="Loading MillOS"]'),null,{timeout:240000});
  await page.evaluate(([position,target])=>window.__MILLOS_RUNTIME__.setCameraPose(position,target),c.camera);
  const speed = async value => page.evaluate(async value=>{
   const api=window.__MILLOS_AGENT__,uri='millos://simulation/main';
   const d=api.draft({capabilityId:'simulation.set-speed',targetUri:uri,parameters:{simulationUri:uri,speed:value},reason:'Silent local motion verification'});
   const p=await api.preview(d); if(p.status!=='ready')throw Error('Not ready');
   const r=await api.commit(p); if(r.status!=='verified')throw Error('Not verified');
  },value);
  const sample = ()=>page.evaluate(actor=>({
   bones:window.__MILLOS_RUNTIME__.sampleObjects(actor,450).filter(o=>['Head','WristL','WristR','FootL','FootR','Hips','Abdomen','Middle1L','Middle2L','Middle1R','Middle2R','worker-held-tool'].includes(o.name)),
   people:window.__MILLOS_RUNTIME__.snapshot().humanPresence.people.filter(p=>p.id===actor)
  }),c.actor);
  await speed(1);
  await page.waitForTimeout(1200);
  await page.evaluate(()=>window.__MILLOS_RUNTIME__.reset());
  const samples=[];
  for(let i=0;i<26;i++) {
   await page.waitForTimeout(250); samples.push(await sample());
   if(i===2||i===14) await page.screenshot({path:`${dir}/${c.id}-${i}.png`});
  }
  const performance=await page.evaluate(()=>{const s=window.__MILLOS_RUNTIME__.snapshot();return {averageFps:s.averageFps,averageFrameMs:s.averageFrameMs,p95FrameMs:s.p95FrameMs,calls:s.renderer.calls};});
  await speed(0); await page.waitForTimeout(100); const pausedA=await sample();
  await page.waitForTimeout(700); const pausedB=await sample();
  const audio=await page.evaluate(()=>({audio:window.__MILLOS_RUNTIME__.snapshot().audio,attempts:window.__audioPlayAttempts}));
  assert.equal(audio.attempts,0); assert.equal(audio.audio.activeNodes,0);
  const ranges={};
  for(const b of samples[0].bones) {
   const series=samples.map(s=>s.bones.find(o=>o.uuid===b.uuid));
   ranges[b.name]=Math.max(...series.flatMap(a=>series.map(b=>distance(a.worldPosition,b.worldPosition))));
  }
  const pauseStable=JSON.stringify(pausedA)===JSON.stringify(pausedB);
  assert(pauseStable,`${c.id}: pause changed pose`);
  assert(ranges.WristL>c.minTravel,`${c.id}: hand travel ${ranges.WristL} too small`);
  assert(ranges.FootL<.003&&ranges.FootR<.003,`${c.id}: stationary feet sliding`);
  let gripDrift=null;
  if(c.id==='baker'||c.id==='gardener') {
   const offsets=samples.map(s=>{
    const find=n=>s.bones.find(b=>b.name===n).worldPosition;
    const tool=find('worker-held-tool');const palm=find('Middle1L').map((v,i)=>(v+find('Middle2L')[i])*.5);
    return palm.map((v,i)=>v-tool[i]);
   });
   gripDrift=Math.max(...offsets.map(o=>distance(o,offsets[0])));
   // The authored finger curl flexes the palm midpoint by ~2mm within its 25mm handle.
   // Require <3mm drift; exact wrist IK is separately checked on both GLBs.
   assert(gripDrift<.003,`${c.id}: hand separated from prop by ${gripDrift}`);
  }
  const video=page.video(); await context.close();
  await rename(await video.path(),`${dir}/${c.id}.webm`);
  report.cases.push({...c,samples,ranges,gripDrift,pauseStable,audio,performance,loadPerCore:os.loadavg()[0]/os.cpus().length});
  console.log(JSON.stringify({id:c.id,ranges,gripDrift,pauseStable,audio,performance}));
 }
 assert.equal(report.errors.length,0,'Browser errors');
 assert.equal(report.failedRequests.length,0,'Failed requests');
} finally {
 await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));
 await browser?.close(); if(server)await new Promise(r=>server.httpServer.close(r)); await lock.release();
}
