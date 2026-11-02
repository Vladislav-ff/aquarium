import {chromium} from '../.ci/node_modules/playwright/index.mjs';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';import assert from 'node:assert/strict';
mkdirSync('test-artifacts',{recursive:true});
const html=readFileSync('dist/index.html','utf8'),core=html.match(/<script id="ecology-core">([\s\S]*?)<\/script>/)?.[1];assert(core);
const c=vm.createContext({console});vm.runInContext(core,c);const E=c.NacreEcology.Ecosystem,checks=[];
const check=(name,fn)=>{fn();checks.push({name,passed:true});};
check('desktop 10 fish / capacity 20; small profile 8 / 13',()=>{for(const [limit,n,cap]of [[96,10,20],[64,8,13]]){const w=new E({limit});assert.equal(w.agents.length,n);assert.equal(w.limit,cap);w.assert();}});
check('deterministic restore includes natural motion',()=>{const a=new E();for(let i=0;i<90;i++)a.step(1/30);const b=E.restore(JSON.stringify(a.snapshot()));for(let i=0;i<120;i++){a.step(1/30);b.step(1/30);}assert.equal(JSON.stringify(a.snapshot()),JSON.stringify(b.snapshot()));const d=a.snapshot();d.agents[0].naturalMotion.ax=null;assert.throws(()=>E.restore(d));});
check('controlled spawning, hatch and mass balance',()=>{const w=new E(),m=w.agents.find(a=>a.si===0&&a.sex==='F'),f=w.agents.find(a=>a.si===0&&a.sex==='M');for(const a of [m,f]){a.p={x:-9.5,y:2.2,z:4.7};a.mass=1;a.reserve=.65;a.age=500;a.repro=0;}w.baseMass=w.totalMass();w.spawn(m,f);assert(w.eggs.length>0);for(const e of w.eggs)e.hatch=w.time;w.step(1/30);assert(w.counters.births>0);w.assert();});
check('controlled predation and external food preserve mass',()=>{const w=new E(),pred=w.agents.find(a=>a.si===3),prey=w.agents.find(a=>a.si===0);w.kill(prey,'eaten',pred);w.agents=w.agents.filter(a=>a.alive);assert.equal(w.counters.eaten,1);w.addFood({x:0,y:8,z:0});w.assert();});
const evolution=[];for(const seed of [94831,12345]){const w=new E({seed});for(let i=0;i<3600;i++){w.step(1/30);if(i%120===0)w.assert();}w.assert();evolution.push({seed,...w.summary()});}
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
try{for(const [label,width,height,count]of [['desktop',1440,960,10],['mobile',390,844,8]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.NacreApp?.adapter&&!NacreApp.flat,null,{timeout:45000});
 assert.equal(await page.evaluate(()=>NACRE.audit().renderer),'3d');assert.equal(await page.evaluate(()=>NacreApp.model.agents.length),count);assert.equal(await page.evaluate(()=>NACRE.validate()),true);
 await page.click('#ecoOpen');await page.click('#ecoPause');const t=await page.evaluate(()=>NACRE.audit().time);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>NACRE.audit().time),t);
 await page.screenshot({path:`test-artifacts/${label}.png`});assert.deepEqual(errors,[]);await page.close();checks.push({name:`${label}: 3D shaders, initial density, pause, no JS errors`,passed:true});
}writeFileSync('test-artifacts/results.json',JSON.stringify({checks,evolution},null,2));}finally{await browser.close();}
