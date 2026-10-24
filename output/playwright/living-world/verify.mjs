import {preview} from 'vite';
import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
import {acquireCaptureLock} from '../../../scripts/lib/capture-lock.mjs';
const dir='output/playwright/living-world';
const report={errors:[],failedRequests:[],cases:[]};
const lock=await acquireCaptureLock('living-world-visual-verification');let browser,server,page;
const selected=process.argv.find(a=>a.startsWith('--cases='))?.slice(8)?.split(',');
const cases=[
 {id:'day',hour:10.15,quality:'medium',shots:['work','rest','bakery','gardener','courier','bird','scarecrow']},
 {id:'delivery',hour:9.4,quality:'medium',shots:['courier']},
 {id:'bus-arrival',hour:7.36,quality:'medium',shots:['bus']},
 {id:'bus-boarding',hour:7.72,quality:'medium',shots:['bus','passenger']},
 {id:'village',hour:12,quality:'medium',shots:['bike','pub','village'],motion:true},
 {id:'night',hour:22,quality:'medium',shots:['work','village','bird']},
 {id:'low',hour:12,quality:'low',shots:['work','bike','bird']},
].filter(c=>!selected||selected.includes(c.id));
async function setSpeed(speed){return page.evaluate(async speed=>{
 const api=window.__MILLOS_AGENT__;const targetUri='millos://simulation/main';
 const cmd=api.draft({capabilityId:'simulation.set-speed',targetUri,parameters:{simulationUri:targetUri,speed},reason:'Silent local living-world animation verification'});
 const p=await api.preview(cmd);if(p.status!=='ready')throw Error(JSON.stringify(p.problems));
 const receipt=await api.commit(p);if(receipt.status!=='verified')throw Error(JSON.stringify(receipt));return receipt.status;
},speed);}
try {
 await mkdir(dir,{recursive:true});
 server=await preview({preview:{host:'127.0.0.1',port:4403,strictPort:true}});
 browser=await chromium.launch({channel:'chrome',headless:false,args:['--mute-audio']});
 for(const c of cases){
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  page=await context.newPage();
  await page.addInitScript(()=>{
   localStorage.setItem('millos-audio',JSON.stringify({version:2,muted:true,volume:0,musicEnabled:false,musicVolume:0,machineVolume:0}));
   window.__audioPlayAttempts=0;HTMLMediaElement.prototype.play=function(){window.__audioPlayAttempts++;return Promise.reject(Error('Audio disabled during verification'));};
  });
  page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});page.on('requestfailed',r=>report.failedRequests.push(r.url()));
  await page.goto(`http://127.0.0.1:4403/?benchmark=village&art=on&quality=${c.quality}&time=${c.hour}&pa=off`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__MILLOS_RUNTIME__?.ready&&document.documentElement.dataset.millosWorldReady==='true'&&!document.querySelector('[aria-label="Loading MillOS"]'),null,{timeout:240000});
  const state=await page.evaluate(()=>({snapshot:window.__MILLOS_RUNTIME__.snapshot(),bird:window.__MILLOS_RUNTIME__.inspectObjects('fountain-bird',30),crow:window.__MILLOS_RUNTIME__.inspectObjects('scarecrow',30),playAttempts:window.__audioPlayAttempts}));
  if(!state.snapshot.humanPresence.passed||state.snapshot.humanPresence.personCount!==14)throw Error(`Actual people missing: ${JSON.stringify(state.snapshot.humanPresence)}`);
  if(!state.snapshot.worldIntegrity.passed)throw Error('World integrity failed');
  if(!state.bird.length||!state.crow.length)throw Error('Bird or scarecrow absent');
  if(state.playAttempts!==0||state.snapshot.audio.activeNodes!==0)throw Error('Audio activity');
  const people=state.snapshot.humanPresence.people;
  const actor=(id)=>people.find(p=>p.id===id)?.position;
  const cameras={
   work:[[-28,2.5,36.8],[-24,1.15,33.5]],
   rest:[[-29.2,2.4,-8.4],[-34,.9,-11.5]],
   bakery:[[-179,3.1,9],[-174.8,1.2,6]],
   gardener:[[-212.5,2.1,13.5],[-215.3,.65,10.7]],
   courier:[[-198,3,35],[-203.4,.9,32]],
   bird:[[-190.7,2.3,8.4],[-188.52,1.55,6]],
   scarecrow:[[79,3.7,156.5],[75,2.2,162]],
   bus:[[27,2.5,132],[25.5,1,138]],
   passenger:[[24,2.3,143],[29.55,1,140.5]],
   pub:[[-203,3,-11.3],[-208,1,-13.3]],
   village:[[-223,15,34],[-198,2,13]],
  };
  const courier=actor('village-courier');cameras.courier=[[courier[0]+3.6,2.4,courier[2]+3],[courier[0],.85,courier[2]-1]];
  const rider=actor('village-cyclist');cameras.bike=[[rider[0]+3.3,2.1,rider[2]+2.2],[rider[0],.85,rider[2]]];
  const shots=[];
  for(const name of c.shots){const [position,target]=cameras[name];await page.evaluate(({position,target})=>window.__MILLOS_RUNTIME__.setCameraPose(position,target),{position,target});await page.waitForTimeout(900);const file=`${c.id}-${name}.png`;await page.screenshot({path:`${dir}/${file}`});shots.push(file);}
  let motion;
  if(c.motion){
   const before=await page.evaluate(()=>({people:window.__MILLOS_RUNTIME__.snapshot().humanPresence.people,bird:window.__MILLOS_RUNTIME__.sampleObjects('fountain-bird-head',5),bike:window.__MILLOS_RUNTIME__.sampleObjects('village-cyclist',5)}));
   await setSpeed(180);await page.waitForTimeout(4000);await setSpeed(0);
   const after=await page.evaluate(()=>({people:window.__MILLOS_RUNTIME__.snapshot().humanPresence.people,bird:window.__MILLOS_RUNTIME__.sampleObjects('fountain-bird-head',5),bike:window.__MILLOS_RUNTIME__.sampleObjects('village-cyclist',5)}));
   const changed=after.people.filter(p=>{const old=before.people.find(o=>o.id===p.id);return Math.hypot(...p.position.map((v,i)=>v-old.position[i]))>.01;}).map(p=>p.id);
   if(!changed.includes('village-cyclist')||changed.length<2)throw Error('Living-world motion inert');
   await page.waitForTimeout(1500);
   const paused=await page.evaluate(()=>window.__MILLOS_RUNTIME__.snapshot().humanPresence.people);
   if(JSON.stringify(paused.map(p=>p.position))!==JSON.stringify(after.people.map(p=>p.position)))throw Error('People drift while paused');
   motion={before,after,changed,pauseStable:true};
  }
  const final=await page.evaluate(()=>({audio:window.__MILLOS_RUNTIME__.snapshot().audio,playAttempts:window.__audioPlayAttempts}));
  if(final.playAttempts||final.audio.activeNodes)throw Error('Audio activity after motion test');
  report.cases.push({...c,shots,people,bird:state.bird,crow:state.crow,renderer:state.snapshot.renderer,motion,...final});
  console.log(JSON.stringify({id:c.id,people:people.length,visible:people.filter(p=>p.visible).length,shots,moving:motion?.changed,audio:final.audio}));
  await context.close();page=null;
 }
 if(report.errors.length||report.failedRequests.length)throw Error('Browser diagnostics failed');
}catch(e){report.failure=String(e);if(page)await page.screenshot({path:`${dir}/failure.png`}).catch(()=>{});throw e;}
finally{await writeFile(`${dir}/report${selected?'-'+selected.join('-'):''}.json`,JSON.stringify(report,null,2));await browser?.close();if(server)await new Promise(r=>server.httpServer.close(r));await lock.release();}
