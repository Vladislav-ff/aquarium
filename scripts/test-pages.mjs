import {chromium} from '../.ci/node_modules/playwright/index.mjs';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';import assert from 'node:assert/strict';
mkdirSync('test-artifacts',{recursive:true});
const html=readFileSync('dist/index.html','utf8'),core=html.match(/<script id="ecology-core">([\s\S]*?)<\/script>/)?.[1];assert(core);
const c=vm.createContext({console});vm.runInContext(core,c);const E=c.NacreEcology.Ecosystem,checks=[];
const check=(name,fn)=>{fn();checks.push({name,passed:true});};
check('10 initial fish and capacity 12 for both profiles',()=>{for(const limit of [96,64]){const w=new E({limit});assert.equal(w.agents.length,10);assert.equal(w.limit,12);w.assert();}});
check('deterministic restore includes behavior and motion',()=>{const a=new E();for(let i=0;i<90;i++)a.step(1/30);const b=E.restore(JSON.stringify(a.snapshot()));for(let i=0;i<120;i++){a.step(1/30);b.step(1/30);}assert.equal(JSON.stringify(a.snapshot()),JSON.stringify(b.snapshot()));const d=a.snapshot();d.agents[0].naturalMotion.ax=null;assert.throws(()=>E.restore(d));});
check('controlled spawning and hatch preserve matter',()=>{const w=new E(),m=w.agents.find(a=>a.si===0&&a.sex==='F'),f=w.agents.find(a=>a.si===0&&a.sex==='M');for(const a of [m,f]){a.p={x:-9.5,y:2.2,z:4.7};a.mass=1;a.reserve=.65;a.age=500;a.repro=0;}w.baseMass=w.totalMass();w.spawn(m,f);assert(w.eggs.length>0);for(const e of w.eggs)e.hatch=w.time;w.step(1/30);assert(w.counters.births>0);w.assert();});
check('emergency avoidance reacts before next scheduled decision',()=>{const w=new E(),a=w.agents.find(a=>a.si===0),b=w.agents.find(a=>a.si===3);w.agents=[a,b];a.mass=.65;a.age=200;a.refuge=0;a.rest=0;a.p={x:0,y:6.3,z:3};a.forward={x:1,y:0,z:0};a.v={x:.3,y:0,z:0};a.think=100;b.mass=8.5;b.reserve=.2;b.rest=0;b.refuge=0;b.p={x:-2,y:6.3,z:3};b.forward={x:1,y:0,z:0};b.v={x:.4,y:0,z:0};w.time+=1/30;w.move(1/30);assert.equal(a.intent,'flee');assert.equal(a.behavior.attacker,b.id);let peak=0;for(let i=0;i<45;i++){w.time+=1/30;w.move(1/30);peak=Math.max(peak,Math.hypot(a.v.x,a.v.y,a.v.z));}assert(peak>2,'Escape burst too slow');});
const evolution=[];for(const seed of [94831,12345]){const w=new E({seed});for(let i=0;i<3600;i++){w.step(1/30);if(i%120===0)w.assert();}w.assert();assert(w.agents.length+w.eggs.length<=12);evolution.push({seed,...w.summary()});}
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
try{for(const [label,width,height]of [['desktop',1440,960],['mobile',390,844]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.NacreApp?.adapter&&!NacreApp.flat,null,{timeout:45000});
 assert.equal(await page.evaluate(()=>NACRE.audit().renderer),'3d');assert.equal(await page.evaluate(()=>NacreApp.model.agents.length),10);assert.equal(await page.evaluate(()=>NACRE.validate()),true);
 await page.click('#ecoOpen');await page.click('#ecoPause');const t=await page.evaluate(()=>NACRE.audit().time);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>NACRE.audit().time),t);
 await page.screenshot({path:`test-artifacts/${label}.png`});assert.deepEqual(errors,[]);await page.close();checks.push({name:`${label}: 3D, density, pause and no JS errors`,passed:true});
}writeFileSync('test-artifacts/results.json',JSON.stringify({checks,evolution},null,2));}finally{await browser.close();}
