import {chromium} from '../.ci/node_modules/playwright/index.mjs';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
mkdirSync('test-artifacts',{recursive:true});const checks=[],runs=[];
const report=()=>writeFileSync('test-artifacts/results.json',JSON.stringify({checks,runs},null,2));
function check(name,fn){try{fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message});throw e;}finally{report();}}
const html=readFileSync('dist/index.html','utf8'),source=html.match(/<script id="ecology-core">([\s\S]*?)<\/script>/)?.[1];assert(source);
const context=vm.createContext({console});vm.runInContext(source,context);const E=context.NacreEcology.Ecosystem;
check('10 fish; predation and direct predator kills disabled',()=>{const w=new E(),a=w.agents[0],b=w.agents.find(a=>a.si===3),mass=w.totalMass();assert.equal(w.agents.length,10);assert.equal(w.limit,12);assert.equal(w.canEat(b,a),false);assert.equal(w.kill(a,'eaten',b),false);assert(a.alive);assert.equal(w.totalMass(),mass);assert.equal(w.counters.eaten,0);w.assert();});
check('save roundtrip and deterministic continuation',()=>{const a=new E();for(let i=0;i<90;i++)a.step(1/30);const b=E.restore(JSON.stringify(a.snapshot()));for(let i=0;i<90;i++){a.step(1/30);b.step(1/30);}assert.equal(JSON.stringify(a.snapshot()),JSON.stringify(b.snapshot()));const d=a.snapshot();d.agents[0].peaceMotion.ax=null;assert.throws(()=>E.restore(d));});
check('spawning, hatch and feeding retain matter balance',()=>{const w=new E(),m=w.agents.find(a=>a.si===0&&a.sex==='F'),f=w.agents.find(a=>a.si===0&&a.sex==='M');for(const a of [m,f]){a.p={x:-9.5,y:2.2,z:4.7};a.mass=1;a.reserve=.65;a.age=500;a.repro=0;}w.baseMass=w.totalMass();w.spawn(m,f);assert(w.eggs.length>0);for(const e of w.eggs)e.hatch=w.time;w.step(1/30);assert(w.counters.births>0);w.addFood({x:0,y:8,z:0});w.assert();});
check('two 120-second runs: no predation, finite motion and matter balance',()=>{for(const seed of [94831,12345]){const w=new E({seed});for(let i=0;i<3600;i++){w.step(1/30);if(i%120===0)w.assert();assert(!w.agents.some(a=>['hunt','flee'].includes(a.intent)));}w.assert();assert.equal(w.counters.eaten,0);runs.push({seed,...w.summary()});}});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});let page;
try{
 for(const [label,width,height]of [['desktop',1440,960],['mobile',390,844]]){
  page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.NacreApp?.adapter&&!NacreApp.flat&&window.NacreReview,null,{timeout:45000});
  assert.equal(await page.evaluate(()=>NACRE.audit().renderer),'3d');assert.equal(await page.evaluate(()=>NacreApp.model.agents.length),10);assert.equal(await page.evaluate(()=>NACRE.validate()),true);
  const detail=await page.evaluate(()=>NacreReview.details());assert(detail.every(f=>f.vertices>=2600&&f.eyesVisible));
  await page.click('#ecoOpen');await page.click('#ecoPause');const t=await page.evaluate(()=>NACRE.audit().time);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>NACRE.audit().time),t);
  await page.screenshot({path:`test-artifacts/${label}-overview.png`});await page.click('#ecoClose');
  const ids=await page.evaluate(()=>[0,1,2,3].map(si=>NacreApp.model.agents.find(a=>a.si===si)?.id).filter(Boolean));
  for(const id of ids){await page.evaluate(id=>NacreReview.focus(id),id);await page.waitForTimeout(250);await page.screenshot({path:`test-artifacts/${label}-fish-${id}.png`});}
  assert.deepEqual(errors,[]);checks.push({name:`${label}: real WebGL, detailed bodies, visible eye meshes and close-ups`,passed:true});report();await page.close();page=null;
 }
}catch(e){checks.push({name:'browser verification',passed:false,error:e.message});report();if(page)await page.screenshot({path:'test-artifacts/failure.png'}).catch(()=>{});throw e;}finally{await browser.close();}
