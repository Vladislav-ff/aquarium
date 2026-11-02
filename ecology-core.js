/* NACRE V ecology: deterministic, renderer-independent and mass-accounted. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SPEC=[
 {name:'Лазурная искра',adult:1,length:.88,birth:.105,mature:55,life:1500,brood:4,interval:42,incubate:12,plant:1,met:.0038,growth:.012},
 {name:'Солнечный парусник',adult:7,length:1.85,birth:.43,mature:115,life:2400,brood:2,interval:100,incubate:23,plant:.30,met:.0023,growth:.010},
 {name:'Мраморный землекоп',adult:2.4,length:1.16,birth:.21,mature:80,life:2100,brood:3,interval:68,incubate:18,plant:.85,met:.0030,growth:.011},
 {name:'Сумеречная лента',adult:8.5,length:2.65,birth:.48,mature:145,life:2800,brood:2,interval:130,incubate:30,plant:.16,met:.0020,growth:.009}
];
const d2=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2;
class Ecosystem{
 constructor(options={}){
  this.seed=options.seed??94831;this.limit=options.limit??96;this.time=0;this.nextId=1;
  this.agents=[];this.eggs=[];this.patches=[];this.events=[];this.history=[];
  this.nutrients=320;this.detritus=42;this.oxygen=.88;this.light=1;this.autoCycle=true;
  this.external=0;this.baseMass=0;this.counters={births:0,spawn:0,eaten:0,starved:0,age:0,hypoxia:0};
  this.hooks=options.hooks||{};this.sampleAt=0;
  for(let i=0;i<24;i++)this.patches.push({id:i,p:{x:-9+(i%6)*3.6,y:i<12?2.5:6.3,z:-4+Math.floor(i/6)%2*7.5},food:4.8,cap:11});
 }
 random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 rand(a,b){return a+(b-a)*this.random();}
 initialize(counts=[40,4,6,2]){
  counts.forEach((n,si)=>{for(let i=0;i<n;i++){
   const sp=SPEC[si],m=sp.adult*this.rand(.70,1.02);
   this.add(si,{mass:m,reserve:m*.48,age:this.rand(sp.mature,sp.life*.32),sex:i%2?'F':'M',p:{x:this.rand(-9,9),y:si===2?1:this.rand(3,8),z:this.rand(-4,5)}});
  }});
  this.baseMass=this.totalMass();this.log('Система запущена: свет → планктон → рыбы → органика.');return this;
 }
 add(si,o={}){
  const sp=SPEC[si],mass=o.mass??sp.birth;
  const a={id:this.nextId++,si,mass,reserve:o.reserve??mass*.40,age:o.age??0,sex:o.sex??(this.random()<.5?'F':'M'),
   genes:o.genes??{size:this.rand(.92,1.08),speed:this.rand(.92,1.08),metabolism:this.rand(.92,1.08)},
   generation:o.generation??1,parents:o.parents??[],p:o.p?{...o.p}:{x:0,y:2,z:0},forward:{x:1,y:0,z:0},
   alive:true,health:1,stamina:1,intent:'drift',target:null,threat:null,think:0,attack:0,huntTime:0,
   rest:0,repro:this.rand(12,30),lastMeal:this.time,refuge:o.age?0:15,breedTarget:null};
  this.agents.push(a);return a;
 }
 adultMass(a){return SPEC[a.si].adult*a.genes.size**3;}
 length(a){return SPEC[a.si].length*Math.cbrt(a.mass/SPEC[a.si].adult);}
 condition(a){return clamp(a.reserve/Math.max(.001,a.mass*.65),0,1);}
 mature(a){return a.age>=SPEC[a.si].mature&&a.mass>=this.adultMass(a)*.65;}
 log(text){this.events.unshift({t:this.time,text});if(this.events.length>40)this.events.pop();}
 mineralize(n){this.nutrients+=Math.max(0,n);}
 feed(a,amount,source='natural'){
  if(!a?.alive||amount<=0)return 0;
  const accepted=Math.min(amount,Math.max(0,a.mass*.65-a.reserve)/.76);
  a.reserve+=accepted*.76;this.detritus+=accepted*.24;
  if(accepted>0){a.lastMeal=this.time;this.hooks.meal?.(a,source);}
  return accepted;
 }
 externalMeal(a,amount){const used=this.feed(a,amount,'pellet');this.external+=used;return used;}
 kill(a,cause,predator=null){
  if(!a.alive)return;const biomass=a.mass+a.reserve;
  a.alive=false;a.target=null;a.threat=null;
  if(predator?.alive){const eaten=this.feed(predator,biomass,'prey');this.detritus+=biomass-eaten;this.counters.eaten++;
   predator.rest=this.rand(3,6);predator.attack=0;predator.target=null;predator.intent='digest';
   this.log(SPEC[predator.si].name+' съедает '+SPEC[a.si].name.toLowerCase()+'.');
  }else{this.detritus+=biomass;this.counters[cause]=(this.counters[cause]||0)+1;
   this.log(SPEC[a.si].name+': '+({starved:'истощение',age:'завершение жизненного цикла',hypoxia:'нехватка кислорода'}[cause]||cause)+'.');}
  a.mass=0;a.reserve=0;this.hooks.death?.(a,cause);
 }
 canEat(a,b){
  if(a===b||!b.alive||b.refuge>0||a.refuge>0||a.rest>0)return false;
  if(a.si===0&&a.mass<this.adultMass(a)*.7)return false;
  return this.length(b)<this.length(a)*(a.si===3?.64:a.si===1?.55:.34)&&b.mass<a.mass*.52;
 }
 canSee(a,b){return !this.hooks.visible||this.hooks.visible(a,b);}
 choose(a){
  a.threat=null;a.breedTarget=null;
  let danger=Infinity;
  for(const b of this.agents){if(!b.alive||!this.canEat(b,a)||this.condition(b)>.8)continue;
   const dd=d2(a.p,b.p);if(dd<22&&dd<danger&&this.canSee(a,b)){danger=dd;a.threat=b.id;}}
  if(a.threat!==null){a.intent='flee';a.target=a.threat;return;}
  if(a.rest>0||this.condition(a)>.84){a.intent=a.rest>0?'digest':'drift';a.target=null;return;}
  const sp=SPEC[a.si];let prey=null,best=Infinity;
  if(this.condition(a)<.75&&a.stamina>.22){
   for(const b of this.agents){if(!b.alive||!this.canEat(a,b))continue;
    const dd=d2(a.p,b.p);if(dd>75||!this.canSee(a,b))continue;
    const score=dd/(.3+b.mass/a.mass);if(score<best){best=score;prey=b;}}
  }
  if(prey&&(a.si===1||a.si===3||this.condition(a)<.38)){
   if(a.target!==prey.id)a.huntTime=0;a.intent='hunt';a.target=prey.id;return;
  }
  if(this.mature(a)&&a.repro<=0&&this.condition(a)>.58){
   let mate=null,dist=Infinity;
   for(const b of this.agents){if(b.si!==a.si||!b.alive||b.sex===a.sex||!this.mature(b)||b.repro>0||this.condition(b)<.58)continue;
    const dd=d2(a.p,b.p);if(dd<dist&&this.canSee(a,b)){dist=dd;mate=b;}}
   if(mate){a.intent='court';a.target=mate.id;a.breedTarget=mate.id;return;}
  }
  let patch=null;best=Infinity;
  for(const p of this.patches){if(p.food<.03)continue;const score=d2(a.p,p.p)/(1+p.food*.08);if(score<best){best=score;patch=p;}}
  if(patch&&sp.plant>0){a.intent='graze';a.target=patch.id;}else{a.intent='drift';a.target=null;}
 }
 spawn(mother,father){
  if(mother.sex!=='F'||mother.repro>0||father.repro>0||!father.alive)return;
  const sp=SPEC[mother.si],count=this.agents.reduce((n,a)=>n+(a.alive&&a.si===mother.si?1:0),0),room=this.limit-this.agents.filter(a=>a.alive).length-this.eggs.length;
  const birth=sp.birth,eggMass=birth*1.4;
  const density=clamp(1-count/(this.limit*(mother.si===0?.68:.23)),.15,1);
  const n=Math.min(room,Math.max(1,Math.round(sp.brood*density)),Math.floor((mother.reserve-mother.mass*.18)/eggMass));
  if(n<=0)return;
  for(let i=0;i<n;i++){
   mother.reserve-=eggMass;
   const genes={};for(const k of ['size','speed','metabolism'])genes[k]=clamp((mother.genes[k]+father.genes[k])*.5+this.rand(-.025,.025),.82,1.18);
   this.eggs.push({si:mother.si,mass:eggMass,hatch:this.time+sp.incubate*this.rand(.9,1.1),p:{x:clamp(mother.p.x+this.rand(-.4,.4),-10,10),y:mother.si===2?.35:Math.max(.5,mother.p.y-.5),z:clamp(mother.p.z+this.rand(-.4,.4),-6,6)},genes,generation:Math.max(mother.generation,father.generation)+1,parents:[mother.id,father.id]});
  }
  mother.repro=sp.interval*this.rand(.85,1.2);father.repro=sp.interval*.75;
  this.counters.spawn++;this.log(sp.name+': кладка, '+n+' икр.');this.hooks.spawn?.(mother,n);
 }
 step(dt){
  if(!Number.isFinite(dt)||dt<=0||dt>.251)throw Error('Ecology step must be in (0, .25]');
  this.time+=dt;
  const light=this.autoCycle?.18+.82*(.5+.5*Math.sin(this.time/240*Math.PI*2)):clamp(this.light,.08,1);
  const decay=Math.min(this.detritus,this.detritus*.012*dt);this.detritus-=decay;this.nutrients+=decay;
  let production=0;
  for(const p of this.patches){const growth=Math.min(this.nutrients,Math.max(0,p.cap-p.food)*(.006+.024*light)*dt*this.nutrients/(this.nutrients+35));p.food+=growth;this.nutrients-=growth;production+=growth;}
  const alive=this.agents.filter(a=>a.alive),bio=alive.reduce((n,a)=>n+a.mass,0);
  this.oxygen=clamp(this.oxygen+dt*((.9-this.oxygen)*.025+.016*light-bio*.000045-this.detritus*.000022),0,1);
  for(const a of alive){
   const sp=SPEC[a.si];a.age+=dt;a.refuge=Math.max(0,a.refuge-dt);a.repro=Math.max(0,a.repro-dt);a.rest=Math.max(0,a.rest-dt);a.think-=dt;
   const effort=a.intent==='flee'?1.8:a.intent==='hunt'?1.55:1;
   const cost=sp.met*Math.pow(Math.max(.01,a.mass),.78)*a.genes.metabolism*effort*dt;
   const used=Math.min(a.reserve,cost);a.reserve-=used;this.mineralize(used);
   if(used<cost){a.health-=dt*.035;const loss=Math.min(a.mass*.15*dt,(cost-used)*1.2);a.mass-=loss;this.mineralize(loss);}else a.health=Math.min(1,a.health+dt*.012);
   if(this.oxygen<.22)a.health-=dt*(.22-this.oxygen)*.20;
   a.stamina=clamp(a.stamina+dt*(effort>1?-.055:.065),0,1);
   if(a.health<=0||a.mass<sp.birth*.45){this.kill(a,this.oxygen<.22?'hypoxia':'starved');continue;}
   if(a.age>sp.life*(.9+a.genes.size*.1)){this.kill(a,'age');continue;}
   const grow=Math.min(Math.max(0,this.adultMass(a)-a.mass),Math.max(0,a.reserve-a.mass*.24)*.8,sp.growth*Math.pow(a.mass,.72)*dt);
   if(grow>0){a.mass+=grow;a.reserve-=grow/.8;this.mineralize(grow*.25);}
   if(a.think<=0){this.choose(a);a.think=this.rand(.35,.65);}
   if(a.intent==='graze'){
    const p=this.patches[a.target];const reach=a.si===2?2.8:1.8;
    if(p&&d2(a.p,p.p)<reach*reach){const bite=Math.min(p.food,(sp.met*6+sp.growth*1.8)*Math.pow(a.mass,.78)*sp.plant*dt);p.food-=this.feed(a,bite);}
    if(a.si===2&&a.p.y<2.2){const take=Math.min(this.detritus,.045*Math.pow(a.mass,.7)*dt);this.detritus-=this.feed(a,take,'detritus');}
   }
   if(a.intent==='hunt'){
    const prey=this.agents.find(b=>b.id===a.target&&b.alive);a.huntTime+=dt;
    if(!prey||!this.canEat(a,prey)||a.huntTime>12||a.stamina<.12){a.rest=2;a.intent='drift';a.target=null;a.attack=0;continue;}
    const dx=prey.p.x-a.p.x,dy=prey.p.y-a.p.y,dz=prey.p.z-a.p.z,d=Math.hypot(dx,dy,dz),reach=this.length(a)*.85+this.length(prey)*.4+.10;
    const dot=d>.0001?(dx*a.forward.x+dy*a.forward.y+dz*a.forward.z)/d:1;
    if(d<reach&&dot>.35&&this.canSee(a,prey)){a.attack+=dt;if(a.attack>=.35)this.kill(prey,'eaten',a);}else a.attack=Math.max(0,a.attack-dt*2);
   }
   if(a.intent==='court'&&a.sex==='F'){
    const mate=this.agents.find(b=>b.id===a.target&&b.alive);
    if(mate&&this.condition(a)>.56&&this.condition(mate)>.56&&d2(a.p,mate.p)<(this.length(a)+this.length(mate)+1)**2&&this.canSee(a,mate))this.spawn(a,mate);
   }
  }
  const remaining=[];
  for(const egg of this.eggs){
   if(this.time<egg.hatch){remaining.push(egg);continue;}
   if(this.agents.filter(a=>a.alive).length>=this.limit){this.detritus+=egg.mass;continue;}
   const a=this.add(egg.si,{mass:egg.mass/1.4,reserve:egg.mass*.4/1.4,p:egg.p,genes:egg.genes,generation:egg.generation,parents:egg.parents});
   this.counters.births++;this.hooks.birth?.(a);
  }
  this.eggs=remaining;this.agents=this.agents.filter(a=>a.alive);
  if(this.time>=this.sampleAt){this.sampleAt=this.time+5;this.history.push(this.summary());if(this.history.length>180)this.history.shift();}
 }
 totalMass(){return this.nutrients+this.detritus+this.patches.reduce((n,p)=>n+p.food,0)+this.agents.reduce((n,a)=>n+(a.alive?a.mass+a.reserve:0),0)+this.eggs.reduce((n,e)=>n+e.mass,0);}
 summary(){return {time:this.time,counts:SPEC.map((_,si)=>this.agents.filter(a=>a.alive&&a.si===si).length),eggs:this.eggs.length,biomass:this.agents.reduce((n,a)=>n+a.mass,0),plankton:this.patches.reduce((n,p)=>n+p.food,0),detritus:this.detritus,nutrients:this.nutrients,oxygen:this.oxygen,generation:Math.max(1,...this.agents.map(a=>a.generation)),...this.counters,massError:this.totalMass()-this.baseMass-this.external};}
 assert(){
  const nums=[this.time,this.nutrients,this.detritus,this.oxygen,...this.patches.map(p=>p.food),...this.agents.flatMap(a=>[a.mass,a.reserve,a.age,a.health,a.p.x,a.p.y,a.p.z])];
  if(nums.some(n=>!Number.isFinite(n)))throw Error('Non-finite ecology state');
  if(this.nutrients<-.00001||this.detritus<-.00001||this.agents.length>this.limit||new Set(this.agents.map(a=>a.id)).size!==this.agents.length)throw Error('Ecology invariant failed');
  if(Math.abs(this.summary().massError)>1e-6)throw Error('Matter balance failed: '+this.summary().massError);
  return true;
 }
}
root.NacreEcology={Ecosystem,SPEC};
})(typeof window==='undefined'?globalThis:window);
