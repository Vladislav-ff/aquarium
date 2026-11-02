import { chromium } from '../.ci/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

mkdirSync('test-artifacts', {recursive:true});
const html=readFileSync('dist/index.html','utf8');
const core=html.match(/<script id="ecology-core">([\s\S]*?)<\/script>/)?.[1];
assert(core,'Missing engine');
const context=vm.createContext({console});
vm.runInContext(core,context);
const {Ecosystem}=context.NacreEcology;
const tests=[];
function check(name,fn){fn();tests.push({name,passed:true});}
check('initial state and invalid step',()=>{
 const m=new Ecosystem();m.assert();assert.throws(()=>m.step(0));assert.throws(()=>m.step(NaN));
});
check('manual food conserves accounted biomass',()=>{
 const m=new Ecosystem();m.addFood({x:0,y:8,z:0});m.assert();assert(m.external>0);
});
check('snapshot roundtrip and deterministic continuation',()=>{
 const a=new Ecosystem();for(let i=0;i<30;i++)a.step(1/30);
 const b=Ecosystem.restore(JSON.stringify(a.snapshot()));
 for(let i=0;i<90;i++){a.step(1/30);b.step(1/30);}
 assert.equal(JSON.stringify(a.snapshot()),JSON.stringify(b.snapshot()));
 const bad=a.snapshot();bad.agents[0].p.x=null;assert.throws(()=>Ecosystem.restore(bad));
});
const evolution=[];
for(const seed of [94831,12345]){
 const m=new Ecosystem({seed,limit:64});
 for(let i=0;i<3600;i++){m.step(1/30);if(i%120===0)m.assert();}
 m.assert();evolution.push({seed,...m.summary()});
}
assert(evolution.some(s=>s.births>0),'No births in autonomous runs');
assert(evolution.some(s=>s.eaten>0),'No predation in autonomous runs');
tests.push({name:'two 120-second autonomous runs: births, predation and mass balance',passed:true});
const browser=await chromium.launch({headless:true,args:[
 '--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader'
]});
let page;
try{
 page=await browser.newPage({viewport:{width:1440,height:960}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  return ['127.0.0.1','localhost'].includes(u.hostname)||['blob:','data:'].includes(u.protocol)?route.continue():route.abort();
 });
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.NACRE&&window.NacreApp?.adapter&&!window.NacreApp.flat,null,{timeout:45000});
 await page.waitForTimeout(2000);
 assert.equal(await page.evaluate(()=>NACRE.audit().renderer),'3d');
 assert.equal(await page.evaluate(()=>NACRE.validate()),true);
 await page.click('#ecoOpen');
 await page.click('#ecoPause');
 const before=await page.evaluate(()=>NACRE.audit().time);
 await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>NACRE.audit().time),before);
 await page.click('#ecoPause');
 await page.evaluate(()=>NacreApp.model.addFood({x:0,y:9,z:0}));
 assert.equal(await page.evaluate(()=>NACRE.validate()),true);
 await page.screenshot({path:'test-artifacts/desktop.png'});
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(500);
 const box=await page.locator('#ecoPanel').boundingBox();
 assert(box&&box.x>=0&&box.x+box.width<=391);
 await page.screenshot({path:'test-artifacts/mobile.png'});
 assert.deepEqual(errors,[]);
 tests.push({name:'real 3D without external network; pause, feed, mobile panel and browser errors',passed:true});
 writeFileSync('test-artifacts/results.json',JSON.stringify({tests,evolution,browser:'Chromium WebGL SwiftShader'},null,2));
} catch(error){
 if(page)await page.screenshot({path:'test-artifacts/failure.png'}).catch(()=>{});
 throw error;
} finally {await browser.close();}
