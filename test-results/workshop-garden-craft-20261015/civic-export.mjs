// Bounded adaptation of civic-entry-polish's native exporter. Existing public instrument,
// no renderer hooks or quality overrides. Dev assembly avoids a throwaway build.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {acquireCaptureLock} from '../../scripts/lib/capture-lock.mjs';
const out='test-results/workshop-garden-craft-20261015';
const c=JSON.parse(fs.readFileSync(out+'/custody.json','utf8'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const pins=Object.fromEntries(c.allowed.filter(p=>p.startsWith('src/')).map(p=>[p,hash(p)]));
const record={scope:'Local settled dev assembly export for existing civic baker, not final production visual acceptance',sourcePins:pins,errors:[],pageErrors:[],failedRequests:[]};
const lock=await acquireCaptureLock('V-civic-assembly-export');let server,browser;
try{
 server=await createServer({server:{host:'127.0.0.1',port:4295,strictPort:true,open:false}});await server.listen();
 browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader'],args:['--mute-audio','--use-gl=angle','--use-angle=metal']});
 const cdp=await browser.newBrowserCDPSession();const {gpu}=await cdp.send('SystemInfo.getInfo');await cdp.detach();
 const a=gpu.auxAttributes;if(!a.sandboxed||a.inProcessGpu||!a.glRenderer.includes('Metal'))throw Error('Native GPU admission');
 record.gpu={renderer:a.glRenderer,sandboxed:a.sandboxed,inProcessGpu:a.inProcessGpu};
 const context=await browser.newContext({reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addInitScript(()=>localStorage.setItem('millos-audio',JSON.stringify({version:2,muted:true,volume:0,musicEnabled:false,musicVolume:0,machineVolume:0})));
 const page=await context.newPage();page.on('console',m=>{if(m.type()==='error')record.errors.push(m.text())});page.on('pageerror',e=>record.pageErrors.push(String(e)));page.on('requestfailed',r=>record.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
 await page.goto('http://127.0.0.1:4295/?benchmark=village&quality=medium&time=12&weather=clear&scada=on&pa=off',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>document.documentElement.dataset.millosStartupReady==='true'&&document.documentElement.dataset.millosWorldReady==='true'&&Number(document.documentElement.dataset.millosStaticBatchesPending??0)===0&&!document.querySelector('[aria-label="Loading MillOS"]')&&!!window.__MILLOS_CIVIC_LIGHTING__,null,{timeout:240000});
 record.runtime=await page.evaluate(()=>{const s=window.__MILLOS_RUNTIME__.snapshot();return{world:s.worldIntegrity,audio:s.audio,quality:s.quality,civic:window.__MILLOS_CIVIC_LIGHTING__.status()}});
 if(!record.runtime.world.passed||record.runtime.audio.activeNodes!==0||record.runtime.audio.contextState!=='not-created'||record.runtime.quality!=='medium')throw Error('Assembly incomplete, wrong quality or audio active');
 if(record.errors.length||record.pageErrors.length||record.failedRequests.length)throw Error('Dev assembly diagnostics not clean');
 const data=await page.evaluate(()=>window.__MILLOS_CIVIC_LIGHTING__.exportGeometry());
 fs.writeFileSync(out+'/civic-occluders.json',JSON.stringify(data));
 for(const[p,h]of Object.entries(pins))if(hash(p)!==h)throw Error('Source changed during export: '+p);
 record.export={inputSha256:hash(out+'/civic-occluders.json'),vertices:data.vertices.length/3,triangles:data.triangles.length/3,sources:data.sources.length,bytes:fs.statSync(out+'/civic-occluders.json').size};
 record.passed=true;console.log('V_CIVIC_EXPORT_PASS',JSON.stringify(record.export));
 await context.close();
}catch(e){record.passed=false;record.failure=String(e);throw e}
finally{await browser?.close();await server?.close();await lock.release();fs.writeFileSync(out+'/civic-export-receipt.json',JSON.stringify(record,null,2)+'\n')}
