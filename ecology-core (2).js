/* NACRE 6.0 - deterministic autonomous ecosystem, no renderer dependencies.
   Units: abstract biomass and simulated seconds. Not an aquarium-care model. */
(function(root){'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), TAU=Math.PI*2;
const SPEC=Object.freeze([
 {name:'Лазурная искра',color:'#7bd8d6',adult:1,L:.88,H:.185,W:.115,speed:1.45,birth:.105,mature:55,life:1500,brood:4,interval:42,incubate:12,plant:1,met:.0038,growth:.012,refuge:15},
 {name:'Солнечный парусник',color:'#edbd79',adult:7,L:1.85,H:.51,W:.245,speed:.72,birth:.43,mature:115,life:2400,brood:2,interval:100,incubate:23,plant:.30,met:.0023,growth:.010,refuge:35},
 {name:'Мраморный землекоп',color:'#b1bbaa',adult:2.4,L:1.16,H:.235,W:.23,speed:.48,birth:.21,mature:80,life:2100,brood:3,interval:68,incubate:18,plant:.85,met:.0030,growth:.011,refuge:20},
 {name:'Сумеречная лента',color:'#a4a6d3',adult:8.5,L:2.65,H:.205,W:.15,speed:.66,birth:.48,mature:145,life:2800,brood:2,interval:130,incubate:30,plant:.16,met:.0020,growth:.009,refuge:70}
].map(Object.freeze));
const DIST=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2;
const position=p=>({x:p.x,y:p.y,z:p.z});
const DEFAULT_ROCKS=[[-8,1.1,-4,3.3,2.4,2.5],[-10,.8,-1,2.2,1.8,2.6],[-6,.6,-5.5,2.5,1.2,1.7],[9,1.8,-4.6,3.1,3.3,2.4],[10.2,1,1,1.8,2,2.4],[6.9,.8,-5.9,2.3,1.8,1.4],[1.7,1.5,-4.7,1.35,2.5,1.3],[6.6,1.6,-4.7,1.4,2.7,1.4],[3.5,.35,-2.8,2.45,.35,2.45]];
class Ecosystem{
 constructor({seed=94831,limit=96,initialize=true}={}){
  this.seed=seed>>>0;this.limit=clamp(Math.floor(limit),32,96);this.time=0;this.nextId=1;this.nextEgg=1;this.nextPellet=1;
  this.agents=[];this.eggs=[];this.pellets=[];this.patches=[];this.events=[];this.history=[];
  this.nutrients=320;this.detritus=42;this.oxygen=.88;this.external=0;this.baseMass=0;
  this.autoCycle=true;this.manualLight=1;this.current=false;this.dayLength=480;
  this.counters={births:0,spawn:0,eaten:0,starved:0,age:0,hypoxia:0,jumps:0};
  this.nextSample=0;this.decisionDebt=0;this.frameEvents=[];this.contacts=0;
  this.rocks=DEFAULT_ROCKS.map(v=>({x:v[0],y:v[1],z:v[2],rx:v[3]*1.04,ry:v[4]*1.04,rz:v[5]*1.04}));
  for(let i=0;i<24;i++){
   const p={x:-9+(i%6)*3.6,y:i<6?1:i<12?3:6.5,z:-3.5+(Math.floor(i/6)%2)*7};
   this.patches.push({id:i,p,food:4.8,cap:11});
  }
  if(initialize)this.initialize();
 }
 random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 rand(a,b){return a+(b-a)*this.random();}
 initialize(){
  const counts=this.limit<80?[27,4,6,2]:[36,4,6,4];
  counts.forEach((n,si)=>{for(let i=0;i<n;i++){
   const sp=SPEC[si],mass=sp.adult*this.rand(.72,1);
   const a=this.add(si,{mass,reserve:mass*.48,age:this.rand(sp.mature,sp.life*.30),sex:i%2?'F':'M',p:{x:this.rand(-9,9),y:si===2?1.1:this.rand(3,8),z:this.rand(-2,5)}});
   this.contain(a);
  }});
  this.baseMass=this.totalMass();this.log('Биотоп запущен. Ручной корм не требуется.');this.sample();return this;
 }
 add(si,o={}){
  const sp=SPEC[si],mass=o.mass??sp.birth,angle=this.rand(0,TAU);
  const a={id:this.nextId++,si,mass,reserve:o.reserve??mass*.4,age:o.age??0,sex:o.sex??(this.random()<.5?'F':'M'),
   genes:o.genes??{size:this.rand(.92,1.08),speed:this.rand(.92,1.08),metabolism:this.rand(.92,1.08)},
   generation:o.generation??1,parents:o.parents??[],p:position(o.p??{x:0,y:3,z:0}),
   v:{x:Math.cos(angle)*sp.speed,y:0,z:Math.sin(angle)*sp.speed},forward:{x:Math.cos(angle),y:0,z:Math.sin(angle)},
   alive:true,health:1,stamina:1,intent:'drift',target:null,threat:null,think:0,attack:0,huntTime:0,
   rest:0,repro:this.rand(12,30),lastMeal:this.time,refuge:o.age?0:sp.refuge,jump:null,jumpRest:30,stuck:0};
  this.agents.push(a);return a;
 }
 scale(a){return Math.cbrt(a.mass/SPEC[a.si].adult);}
 adultMass(a){return SPEC[a.si].adult*a.genes.size**3;}
 length(a){return SPEC[a.si].L*this.scale(a);}
 radius(a){const s=SPEC[a.si];return Math.max(s.W*1.2,s.H*(a.si===1?1.7:1.15),s.L*.12)*this.scale(a);}
 condition(a){return clamp(a.reserve/Math.max(.001,a.mass*.65),0,1);}
 mature(a){return a.age>=SPEC[a.si].mature&&a.mass>=this.adultMass(a)*.65;}
 light(){return this.autoCycle?.18+.82*(.5+.5*Math.sin(this.time/this.dayLength*TAU)):this.manualLight;}
 log(text){this.events.unshift({t:this.time,text});this.events.length=Math.min(50,this.events.length);}
 event(type,data){this.frameEvents.push({type,...data});}
 emitFood(a,amount){
  const used=Math.min(Math.max(0,amount),Math.max(0,a.mass*.65-a.reserve)/.76);
  a.reserve+=used*.76;this.detritus+=used*.24;if(used>0)a.lastMeal=this.time;return used;
 }
 addFood(p,n=14){
  n=Math.min(Math.max(0,Math.floor(n)),36-this.pellets.length);
  for(let i=0;i<n;i++)this.pellets.push({id:this.nextPellet++,mass:.32,age:0,p:{x:clamp(p.x+this.rand(-1,1),-10.5,10.5),y:clamp(p.y,1,10.4),z:clamp(p.z+this.rand(-.7,.7),-6,6)}});
  this.external+=n*.32;if(n)this.log('Ручное кормление: '+n+' частиц.');return n;
 }
 kill(a,cause,predator=null){
  if(!a.alive)return;
  const biomass=a.mass+a.reserve;a.alive=false;
  if(predator?.alive){const eaten=this.emitFood(predator,biomass);this.detritus+=biomass-eaten;this.counters.eaten++;
   predator.rest=this.rand(15,25)+Math.min(35,biomass/Math.max(.1,predator.mass)*55);predator.attack=0;predator.target=null;predator.intent='digest';
   this.log(SPEC[predator.si].name+' съедает '+SPEC[a.si].name.toLowerCase()+'.');this.event('meal',{id:predator.id});
  }else{this.detritus+=biomass;this.counters[cause]++;this.log(SPEC[a.si].name+': '+({starved:'истощение',age:'конец жизненного цикла',hypoxia:'нехватка кислорода'}[cause]||cause)+'.');}
  this.event('death',{id:a.id,p:position(a.p),si:a.si});a.mass=0;a.reserve=0;
 }
 refuge(a){return a.refuge>0&&(Math.abs(a.p.x)>7.1||a.p.y<1.5);}
 canEat(a,b){
  if(a===b||!b.alive||a.jump||b.jump||a.rest>0||this.refuge(b))return false;
  if(b.si===2&&b.p.y<1.6&&a.si!==2)return false;
  if(a.si===0&&a.mass<this.adultMass(a)*.7)return false;
  const as=this.scale(a),bs=this.scale(b),sa=SPEC[a.si],sb=SPEC[b.si];
  return sb.H*bs<sa.H*as*.90&&sb.L*bs<sa.L*as*(a.si===3?.64:a.si===1?.55:.34)&&b.mass<a.mass*.52;
 }
 blocked(p,q){
  const dx=q.x-p.x,dy=q.y-p.y,dz=q.z-p.z;
  for(const o of this.rocks){const x=(p.x-o.x)/o.rx,y=(p.y-o.y)/o.ry,z=(p.z-o.z)/o.rz,vx=dx/o.rx,vy=dy/o.ry,vz=dz/o.rz,aa=vx*vx+vy*vy+vz*vz;
   if(aa<1e-10)continue;const t=clamp(-(x*vx+y*vy+z*vz)/aa,0,1);
   if((x+t*vx)**2+(y+t*vy)**2+(z+t*vz)**2<.98)return true;
  }return false;
 }
 choose(a){
  if(a.jump)return;a.threat=null;let danger=Infinity;
  for(const b of this.agents){if(!b.alive||!this.canEat(b,a)||this.condition(b)>.42)continue;const dd=DIST(a.p,b.p);if(dd<20&&dd<danger&&!this.blocked(a.p,b.p)){danger=dd;a.threat=b.id;}}
  if(a.threat!==null){a.intent='flee';a.target=a.threat;return;}
  if(a.refuge>0){a.intent='nursery';a.target=a.p.x<0?0:5;return;}
  if(a.rest>0||this.condition(a)>.86){a.intent=a.rest>0?'digest':'drift';a.target=null;return;}
  if(this.condition(a)<.80&&this.pellets.length){let food=null,dist=100;for(const p of this.pellets){const dd=DIST(a.p,p.p);if(dd<dist&&!this.blocked(a.p,p.p)){food=p;dist=dd;}}if(food){a.intent='pellet';a.target=food.id;return;}}
  if(this.condition(a)<.40&&a.stamina>.24){let prey=null,best=Infinity;
   for(const b of this.agents){if(!this.canEat(a,b))continue;const dd=DIST(a.p,b.p),score=dd/(.3+b.mass/a.mass);if(dd<75&&score<best&&!this.blocked(a.p,b.p)){best=score;prey=b;}}
   if(prey&&(a.si===1||a.si===3||this.condition(a)<.30)){if(a.target!==prey.id)a.huntTime=0;a.intent='hunt';a.target=prey.id;return;}
  }
  if(this.mature(a)&&a.repro<=0&&this.condition(a)>.58){let mate=null,best=Infinity;
   for(const b of this.agents){if(!b.alive||b.si!==a.si||b.sex===a.sex||!this.mature(b)||b.repro>0||b.jump||this.condition(b)<.58)continue;const dd=DIST(a.p,b.p);if(dd<best&&!this.blocked(a.p,b.p)){best=dd;mate=b;}}
   if(mate){a.intent='court';a.target=mate.id;return;}
  }
  let patch=null,best=Infinity;
  for(const p of this.patches){if(p.food<.03)continue;if(a.si===2&&p.p.y>1.8)continue;const dd=DIST(a.p,p.p)/(1+p.food*.08);if(dd<best){best=dd;patch=p;}}
  a.intent=patch?'graze':'drift';a.target=patch?.id??null;
 }
 spawn(mother,father){
  if(mother.sex!=='F'||father.sex!=='M'||mother.si!==father.si||!mother.alive||!father.alive||mother.repro>0||father.repro>0)return;
  const sp=SPEC[mother.si],count=this.agents.reduce((n,a)=>n+(a.alive&&a.si===mother.si),0),pending=this.eggs.filter(e=>e.si===mother.si).length;
  const room=Math.min(this.limit-this.agents.filter(a=>a.alive).length-this.eggs.length,Math.ceil(this.limit*[.65,.10,.19,.10][mother.si])-count-pending);
  const eggMass=sp.birth*1.4,density=clamp(1-count/(this.limit*(mother.si===0?.72:.24)),.15,1);
  const n=Math.min(room,Math.max(1,Math.round(sp.brood*density)),Math.floor(Math.max(0,mother.reserve-mother.mass*.18)/eggMass));
  if(n<1){mother.repro=3;return;}
  for(let i=0;i<n;i++){
   mother.reserve-=eggMass;const genes={};for(const k of ['size','speed','metabolism'])genes[k]=clamp((mother.genes[k]+father.genes[k])*.5+this.rand(-.025,.025),.82,1.18);
   const p={x:mother.p.x<0?-9.5:9.5,y:mother.si===2?.7:2.2,z:4.7+this.rand(-.3,.3)};
   this.eggs.push({id:this.nextEgg++,si:mother.si,mass:eggMass,hatch:this.time+sp.incubate*this.rand(.9,1.1),p,genes,generation:Math.max(mother.generation,father.generation)+1,parents:[mother.id,father.id]});
  }
  mother.repro=sp.interval*this.rand(.85,1.2);father.repro=sp.interval*.75;this.counters.spawn++;
  this.log(sp.name+': '+n+' икр. в зарослях.');this.event('spawn',{id:mother.id,n});
 }
 requestJump(id=null){
  if(this.agents.some(a=>a.jump))return false;
  const list=this.agents.filter(a=>(id===null||a.id===id)&&(a.si===0||a.si===1)&&!a.refuge&&a.jumpRest<=0&&this.condition(a)>.6&&a.intent!=='flee'&&a.intent!=='hunt');
  list.sort((a,b)=>b.p.y-a.p.y);const a=list[0];if(!a)return false;
  a.jump={phase:'approach',started:this.time,left:false};a.intent='jump';a.target=null;return true;
 }
 contain(a){
  const r=this.radius(a),hl=this.length(a)*.72;
  a.p.x=clamp(a.p.x,-11.6+hl,11.6-hl);a.p.z=clamp(a.p.z,-7+hl,7-hl);
  a.p.y=clamp(a.p.y,.22+r,a.jump?.phase==='flight'?14:10.65-r);
  for(const o of this.rocks){const rx=o.rx+r,ry=o.ry+r,rz=o.rz+r,dx=a.p.x-o.x,dy=a.p.y-o.y,dz=a.p.z-o.z,d=Math.sqrt((dx/rx)**2+(dy/ry)**2+(dz/rz)**2);
   if(d<1){if(d<1e-6){a.p.y=o.y+ry+.01;continue;}a.p.x=o.x+dx/d*1.002;a.p.y=o.y+dy/d*1.002;a.p.z=o.z+dz/d*1.002;}
  }
  a.p.x=clamp(a.p.x,-11.6+hl,11.6-hl);a.p.z=clamp(a.p.z,-7+hl,7-hl);a.p.y=clamp(a.p.y,.22+r,a.jump?.phase==='flight'?14:10.65-r);
 }
 move(dt){
  const byId=new Map(this.agents.map(a=>[a.id,a]));
  const old=this.agents.map(a=>({id:a.id,p:position(a.p),v:position(a.v),si:a.si,r:this.radius(a)}));
  for(let i=0;i<this.agents.length;i++){
   const a=this.agents[i];if(!a.alive)continue;const sp=SPEC[a.si];let speed=sp.speed*a.genes.speed*clamp(Math.sqrt(this.scale(a)),.6,1.15),goal=null;
   if(a.jump?.phase==='flight'){
    a.v.y-=9.81*dt;a.p.x+=a.v.x*dt;a.p.y+=a.v.y*dt;a.p.z+=a.v.z*dt;
    if(!a.jump.left&&a.p.y>=10.88){a.jump.left=true;this.counters.jumps++;this.event('splash',{p:position(a.p),entry:false,si:a.si});}
    if(a.v.y<0&&a.p.y<10.6){this.event('splash',{p:position(a.p),entry:true,si:a.si});a.jump=null;a.jumpRest=50;a.intent='drift';a.v.y=-.6;}
    this.contain(a);continue;
   }
   const target=byId.get(a.target);
   if(a.jump){goal={x:a.p.x,y:10.5,z:a.p.z};speed=2.4;if(a.p.y>=10.0){a.jump.phase='flight';a.v.y=5.3;continue;}if(this.time-a.jump.started>15){a.jump=null;a.jumpRest=12;}}
   else if(a.intent==='hunt'&&target){goal={x:target.p.x+target.v.x*.25,y:target.p.y+target.v.y*.25,z:target.p.z+target.v.z*.25};speed*=2.4*(.65+a.stamina*.35);}
   else if(a.intent==='flee'&&target){goal={x:a.p.x+(a.p.x-target.p.x)*3,y:a.p.y+(a.p.y-target.p.y)*2,z:a.p.z+(a.p.z-target.p.z)*3};speed*=1.9*(.55+a.stamina*.45);}
   else if(a.intent==='court'&&target)goal=target.p;
   else if(a.intent==='pellet')goal=this.pellets.find(p=>p.id===a.target)?.p;
   else if(a.intent==='nursery')goal={x:a.p.x<0?-9.5:9.5,y:a.si===2?1:2.2,z:4.7};
   else if(a.intent==='graze')goal=this.patches[a.target]?.p;
   if(!goal)goal={x:Math.sin(this.time*.08+a.id)*7.5,y:a.si===2?1.0:4.8+Math.sin(this.time*.11+a.id)*1.5,z:2+Math.cos(this.time*.08+a.id)*3};
   let dx=goal.x-a.p.x,dy=goal.y-a.p.y,dz=goal.z-a.p.z,d=Math.hypot(dx,dy,dz);
   if(a.si===2)dy=clamp(goal.y,1,1.4)-a.p.y;
   if(a.intent==='digest')speed*=.65;
   if(d<1.0&&['graze','nursery','court'].includes(a.intent))speed*=clamp(d,.12,1);
   let fx=0,fy=0,fz=0;
   if(d>.001){fx=dx/d*speed;fy=dy/d*speed;fz=dz/d*speed;}
   for(const o of old){if(o.id===a.id||(a.intent==='hunt'&&o.id===a.target))continue;
    const xx=a.p.x-o.p.x,yy=a.p.y-o.p.y,zz=a.p.z-o.p.z,dd=xx*xx+yy*yy+zz*zz,reach=this.radius(a)+o.r+.3;
    if(dd<reach*reach&&dd>1e-8){const k=(reach-Math.sqrt(dd))/Math.sqrt(dd)*1.6;fx+=xx*k;fy+=yy*k;fz+=zz*k;}
   }
   for(const o of this.rocks){const r=this.radius(a)+.6,rx=o.rx+r,ry=o.ry+r,rz=o.rz+r,xx=(a.p.x-o.x)/rx,yy=(a.p.y-o.y)/ry,zz=(a.p.z-o.z)/rz,dd=xx*xx+yy*yy+zz*zz;
    if(dd<1.5){const inv=1/Math.max(.1,Math.sqrt(dd)),k=(1.5-dd)*2.2;fx+=xx*inv*k;fy+=yy*inv*k;fz+=zz*inv*k;
     if(a.stuck>1){fx+=-zz*inv;fz+=xx*inv;}}
   }
   if(this.current){fx+=Math.sin(a.p.z*.4+this.time*.07)*.10;fz+=Math.cos(a.p.x*.3-this.time*.05)*.10;}
   const rate=1-Math.exp(-dt*4);a.v.x+=(fx-a.v.x)*rate;a.v.y+=(fy-a.v.y)*rate;a.v.z+=(fz-a.v.z)*rate;
   const vv=Math.hypot(a.v.x,a.v.y,a.v.z),max=speed*1.6;if(vv>max){a.v.x*=max/vv;a.v.y*=max/vv;a.v.z*=max/vv;}
   const before=position(a.p);a.p.x+=a.v.x*dt;a.p.y+=a.v.y*dt;a.p.z+=a.v.z*dt;this.contain(a);
   if(DIST(before,a.p)<dt*dt*.005&&d>2)a.stuck+=dt;else a.stuck=Math.max(0,a.stuck-dt);
   if(a.stuck>5){a.think=0;a.target=null;a.intent='drift';a.stuck=0;a.v.x=this.rand(-1,1);a.v.z=this.rand(-1,1);}
   const norm=Math.hypot(a.v.x,a.v.y,a.v.z);if(norm>.015){a.forward.x=a.v.x/norm;a.forward.y=a.v.y/norm;a.forward.z=a.v.z/norm;}
  }
  this.contacts=0;
  for(let pass=0;pass<3;pass++)for(let i=0;i<this.agents.length;i++){
   const a=this.agents[i];if(!a.alive||a.jump?.phase==='flight')continue;
   for(let j=i+1;j<this.agents.length;j++){
    const b=this.agents[j];if(!b.alive||b.jump?.phase==='flight')continue;
    const reach=this.length(a)*.6+this.length(b)*.6+this.radius(a)+this.radius(b);
    if(DIST(a.p,b.p)>reach*reach)continue;
    const ra=this.radius(a),rb=this.radius(b),r=ra+rb+.025;
    for(const u of [-.35,.05,.35])for(const v of [-.35,.05,.35]){
     let dx=b.p.x+b.forward.x*v*this.length(b)-a.p.x-a.forward.x*u*this.length(a),dy=b.p.y+b.forward.y*v*this.length(b)-a.p.y-a.forward.y*u*this.length(a),dz=b.p.z+b.forward.z*v*this.length(b)-a.p.z-a.forward.z*u*this.length(a),d=Math.hypot(dx,dy,dz);
     if(d>=r)continue;if(d<1e-7){dx=(a.id%2?1:-1);dy=.13;dz=.31;d=Math.hypot(dx,dy,dz);}
     const pen=(r-d)*.6,wa=b.mass/(a.mass+b.mass),wb=1-wa;dx/=d;dy/=d;dz/=d;
     a.p.x-=dx*pen*wa;a.p.y-=dy*pen*wa;a.p.z-=dz*pen*wa;b.p.x+=dx*pen*wb;b.p.y+=dy*pen*wb;b.p.z+=dz*pen*wb;this.contacts++;
    }
   }this.contain(a);
  }
 }
 biology(dt){
  const light=this.light(),decay=Math.min(this.detritus,this.detritus*.012*dt);this.detritus-=decay;this.nutrients+=decay;
  for(const p of this.patches){const g=Math.min(this.nutrients,Math.max(0,p.cap-p.food)*(.006+.024*light)*dt*this.nutrients/(this.nutrients+35));p.food+=g;this.nutrients-=g;}
  const biomass=this.agents.reduce((n,a)=>n+(a.alive?a.mass:0),0);
  this.oxygen=clamp(this.oxygen+dt*((.9-this.oxygen)*.025+.016*light-biomass*.000045-this.detritus*.000022),0,1);
  for(const a of this.agents){if(!a.alive)continue;const sp=SPEC[a.si];
   a.age+=dt;a.refuge=Math.max(0,a.refuge-dt);a.repro=Math.max(0,a.repro-dt);a.rest=Math.max(0,a.rest-dt);a.jumpRest=Math.max(0,a.jumpRest-dt);
   const effort=a.intent==='flee'?1.8:a.intent==='hunt'?1.55:1,cost=sp.met*Math.pow(Math.max(.01,a.mass),.78)*a.genes.metabolism*effort*dt,used=Math.min(a.reserve,cost);
   a.reserve-=used;this.nutrients+=used;
   if(used+1e-12<cost){a.health-=dt*.035;const loss=Math.min(a.mass*.15*dt,(cost-used)*1.2);a.mass-=loss;this.nutrients+=loss;}else a.health=Math.min(1,a.health+dt*.012);
   if(this.oxygen<.22)a.health-=dt*(.22-this.oxygen)*.20;
   a.stamina=clamp(a.stamina+dt*(effort>1?-.055:.065),0,1);
   if(a.health<=0||a.mass<sp.birth*.45){this.kill(a,this.oxygen<.22?'hypoxia':'starved');continue;}
   if(a.age>sp.life*(.9+a.genes.size*.1)){this.kill(a,'age');continue;}
   const grow=Math.min(Math.max(0,this.adultMass(a)-a.mass),Math.max(0,a.reserve-a.mass*.24)*.8,sp.growth*Math.pow(a.mass,.72)*dt);
   if(grow>0){a.mass+=grow;a.reserve-=grow/.8;this.nutrients+=grow*.25;}
   a.think-=dt;if(a.think<=0){this.choose(a);a.think=this.rand(.35,.65);}
   if(a.intent==='graze'||a.intent==='nursery'){
    let patch=this.patches[a.target];if(a.intent==='nursery')patch=this.patches[a.p.x<0?0:5];
    const reach=a.intent==='nursery'?5.0:a.si===2?2.8:1.85;
    if(patch&&DIST(a.p,patch.p)<reach*reach){const plant=sp.plant+(1-sp.plant)*(1-clamp(a.mass/this.adultMass(a),0,1));const bite=Math.min(patch.food,(sp.met*6+sp.growth*1.8)*Math.pow(a.mass,.78)*plant*dt);const take=this.emitFood(a,bite);patch.food-=take;}
    if(a.si===2&&a.p.y<2.2){const take=Math.min(this.detritus,.045*Math.pow(a.mass,.7)*dt),taken=this.emitFood(a,take);this.detritus-=taken;}
   }
   if(a.intent==='pellet'){
    const p=this.pellets.find(p=>p.id===a.target);if(p&&DIST(a.p,p.p)<(this.length(a)*.65+.18)**2){const used=this.emitFood(a,p.mass);p.mass-=used;if(used>0)this.event('meal',{id:a.id});if(p.mass<1e-6){this.detritus+=p.mass;p.mass=0;}a.think=0;}
   }
   if(a.intent==='hunt'){
    const b=this.agents.find(b=>b.alive&&b.id===a.target);a.huntTime+=dt;
    if(!b||!this.canEat(a,b)||a.huntTime>12||a.stamina<.12){a.rest=2;a.intent='drift';a.target=null;a.attack=0;continue;}
    const dx=b.p.x-a.p.x,dy=b.p.y-a.p.y,dz=b.p.z-a.p.z,d=Math.hypot(dx,dy,dz),dot=d>.0001?(dx*a.forward.x+dy*a.forward.y+dz*a.forward.z)/d:1;
    const reach=this.length(a)*.85+this.length(b)*.4+.10;
    if(d<reach&&dot>.35&&!this.blocked(a.p,b.p)){a.attack+=dt;if(a.attack>=.35)this.kill(b,'eaten',a);}else a.attack=Math.max(0,a.attack-dt*2);
   }
   if(a.intent==='court'&&a.sex==='F'){
    const mate=this.agents.find(b=>b.alive&&b.id===a.target);
    if(mate&&this.mature(a)&&this.mature(mate)&&this.condition(a)>.56&&this.condition(mate)>.56&&DIST(a.p,mate.p)<(this.length(a)+this.length(mate)+1)**2&&!this.blocked(a.p,mate.p))this.spawn(a,mate);
   }
  }
  this.agents=this.agents.filter(a=>a.alive);
  const remaining=[];for(const egg of this.eggs){if(this.time<egg.hatch){remaining.push(egg);continue;}
   if(this.agents.length>=this.limit){this.detritus+=egg.mass;continue;}
   const a=this.add(egg.si,{mass:egg.mass/1.4,reserve:egg.mass*.4/1.4,p:egg.p,genes:egg.genes,generation:egg.generation,parents:egg.parents});this.contain(a);this.counters.births++;this.event('birth',{id:a.id});
  }this.eggs=remaining;
 }
 step(dt){
  if(!Number.isFinite(dt)||dt<=0||dt>.100001)throw Error('Step must be in (0, 0.1]');
  this.frameEvents=[];this.time+=dt;
  for(const p of this.pellets){p.age+=dt;p.p.y=Math.max(.28,p.p.y-dt*.24);if(this.current)p.p.x=clamp(p.p.x+Math.sin(this.time*.3+p.id)*dt*.10,-11,11);if(p.age>42){this.detritus+=p.mass;p.mass=0;}}
  this.pellets=this.pellets.filter(p=>p.mass>0);
  this.move(dt);this.biology(dt);
  if(this.time+1e-8>=this.nextSample){this.sample();this.nextSample=this.time+5;}
  return this.frameEvents;
 }
 totalMass(){return this.nutrients+this.detritus+this.patches.reduce((n,p)=>n+p.food,0)+this.agents.reduce((n,a)=>n+(a.alive?a.mass+a.reserve:0),0)+this.eggs.reduce((n,e)=>n+e.mass,0)+this.pellets.reduce((n,p)=>n+p.mass,0);}
 summary(){return {time:this.time,counts:SPEC.map((_,i)=>this.agents.filter(a=>a.si===i&&a.alive).length),eggs:this.eggs.length,biomass:this.agents.reduce((n,a)=>n+a.mass,0),plankton:this.patches.reduce((n,p)=>n+p.food,0),detritus:this.detritus,nutrients:this.nutrients,oxygen:this.oxygen,generation:Math.max(1,...this.agents.map(a=>a.generation)),...this.counters,massError:this.totalMass()-this.baseMass-this.external};}
 sample(){const s=this.summary();this.history.push({time:s.time,counts:s.counts});if(this.history.length>240)this.history.shift();}
 assert(){
  const nonneg=[this.time,this.nutrients,this.detritus,this.external,this.baseMass,...this.patches.map(p=>p.food),...this.agents.flatMap(a=>[a.mass,a.reserve,a.age,a.health,a.stamina]),...this.eggs.map(e=>e.mass),...this.pellets.map(p=>p.mass)];
  if(nonneg.some(x=>!Number.isFinite(x)||x<-.0000001))throw Error('Invalid or negative biological value');
  for(const a of this.agents){for(const p of [a.p,a.v,a.forward])if(!['x','y','z'].every(k=>Number.isFinite(p[k])))throw Error('Invalid kinematic state');}
  if(this.agents.length+this.eggs.length>this.limit||new Set(this.agents.map(a=>a.id)).size!==this.agents.length||this.oxygen<0||this.oxygen>1)throw Error('Population invariant failed');
  const error=this.summary().massError;if(Math.abs(error)>1e-6)throw Error('Matter balance failed: '+error);return true;
 }
 snapshot(){
  const keys=['seed','limit','time','nextId','nextEgg','nextPellet','nutrients','detritus','oxygen','external','baseMass','autoCycle','manualLight','current','dayLength','counters','nextSample','agents','eggs','pellets','patches','events','history'];
  const o={schema:6};for(const k of keys)o[k]=this[k];return JSON.parse(JSON.stringify(o));
 }
 static restore(raw){
  const d=typeof raw==='string'?JSON.parse(raw):JSON.parse(JSON.stringify(raw));
  if(!d||d.schema!==6)throw Error('Unsupported save version');
  const finite=(x,min,max)=>Number.isFinite(x)&&x>=min&&x<=max,vec=p=>p&&['x','y','z'].every(k=>finite(p[k],-30,30));
  const genes=g=>g&&['size','speed','metabolism'].every(k=>finite(g[k],.8,1.2));
  const array=(v,n)=>Array.isArray(v)&&v.length<=n;
  if(!Number.isInteger(d.limit)||d.limit<32||d.limit>96||!array(d.agents,96)||!array(d.eggs,96)||!array(d.pellets,36)||!array(d.patches,24)||d.patches.length!==24||!array(d.history,240)||!array(d.events,50))throw Error('Invalid save structure');
  for(const k of ['seed','nextId','nextEgg','nextPellet'])if(!Number.isSafeInteger(d[k])||d[k]<0)throw Error('Invalid identifier counter');
  for(const k of ['time','nutrients','detritus','external','baseMass','nextSample'])if(!finite(d[k],0,1e12))throw Error('Invalid saved pool');
  if(!finite(d.oxygen,0,1)||!finite(d.manualLight,.08,1)||d.dayLength!==480||typeof d.autoCycle!=='boolean'||typeof d.current!=='boolean')throw Error('Invalid environment');
  const intents=['drift','digest','flee','hunt','court','pellet','graze','nursery','jump'];
  for(const a of d.agents){
   if(!Number.isSafeInteger(a.id)||a.id<1||!Number.isInteger(a.si)||!SPEC[a.si]||!['F','M'].includes(a.sex)||!intents.includes(a.intent)||!vec(a.p)||!vec(a.v)||!vec(a.forward)||!genes(a.genes)||a.alive!==true||!Number.isInteger(a.generation)||a.generation<1||!array(a.parents,2))throw Error('Invalid saved fish');
   for(const k of ['mass','reserve','age','health','stamina','think','attack','huntTime','rest','repro','lastMeal','refuge','jumpRest','stuck'])if(!finite(a[k],0,1e10))throw Error('Invalid fish value: '+k);
   if(a.mass<=0||a.mass>30||a.health>1||a.stamina>1||a.reserve>a.mass*.66)throw Error('Invalid fish bounds');
   if(a.jump&&(!['approach','flight'].includes(a.jump.phase)||!finite(a.jump.started,0,d.time)||typeof a.jump.left!=='boolean'))throw Error('Invalid jump');
   for(const k of ['target','threat'])if(a[k]!==null&&(!Number.isSafeInteger(a[k])||a[k]<0))throw Error('Invalid target');
  }
  for(const e of d.eggs)if(!Number.isInteger(e.si)||!SPEC[e.si]||!Number.isSafeInteger(e.id)||!vec(e.p)||!genes(e.genes)||!finite(e.mass,.001,5)||!finite(e.hatch,0,1e12)||!Number.isInteger(e.generation)||e.generation<2||!array(e.parents,2))throw Error('Invalid egg');
  for(const p of d.pellets)if(!Number.isSafeInteger(p.id)||!vec(p.p)||!finite(p.mass,0,.320001)||!finite(p.age,0,43))throw Error('Invalid pellet');
  d.patches.forEach((p,i)=>{if(p.id!==i||!vec(p.p)||p.cap!==11||!finite(p.food,0,11.000001))throw Error('Invalid producer');});
  for(const e of d.events)if(!finite(e.t,0,d.time)||typeof e.text!=='string'||e.text.length>500)throw Error('Invalid event');
  for(const p of d.history)if(!finite(p.time,0,d.time)||!Array.isArray(p.counts)||p.counts.length!==4||p.counts.some(n=>!Number.isInteger(n)||n<0||n>96))throw Error('Invalid history');
  const e=new Ecosystem({initialize:false,limit:d.limit});
  const allowed=Object.keys(e.snapshot()).filter(k=>k!=='schema');for(const k of allowed)e[k]=d[k];
  if(!d.counters||Object.keys(e.counters).length!==7)throw Error('Invalid counters');
  for(const k of ['births','spawn','eaten','starved','age','hypoxia','jumps'])if(!Number.isSafeInteger(d.counters[k])||d.counters[k]<0)throw Error('Invalid event counter');
  if(e.nextId<=Math.max(0,...e.agents.map(a=>a.id))||e.nextEgg<=Math.max(0,...e.eggs.map(a=>a.id))||e.nextPellet<=Math.max(0,...e.pellets.map(a=>a.id)))throw Error('Identifier reuse');
  e.frameEvents=[];e.assert();return e;
 }
}
root.NacreEcology={Ecosystem,SPEC,clamp};
if(typeof module!=='undefined'&&module.exports)module.exports=root.NacreEcology;
})(typeof window==='undefined'?globalThis:window);
