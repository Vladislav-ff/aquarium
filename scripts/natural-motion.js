/* NACRE Peace 4: one movement controller, no fish-on-fish predation. */
(function(root){'use strict';
const {Ecosystem:E,SPEC,clamp}=root.NacreEcology;
const P=E.prototype,restore=E.restore,kill=P.kill,biology=P.biology,legacyMove=P.move;
const copy=p=>({x:p.x,y:p.y,z:p.z}),norm=p=>Math.hypot(p.x,p.y,p.z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function unit(v){const n=norm(v);return n>1e-8?{x:v.x/n,y:v.y/n,z:v.z/n}:{x:1,y:0,z:0};}
function turn(from,to,angle){
 const a=unit(from),b=unit(to),dot=clamp(a.x*b.x+a.y*b.y+a.z*b.z,-1,1),theta=Math.acos(dot);
 if(theta<1e-7)return b;
 let side={x:b.x-a.x*dot,y:b.y-a.y*dot,z:b.z-a.z*dot},n=norm(side);
 if(n<1e-7){side={x:-a.z,y:0,z:a.x};n=norm(side);if(n<1e-7){side={x:1,y:0,z:0};n=1;}}
 const step=Math.min(theta,angle),c=Math.cos(step),s=Math.sin(step)/n;
 return unit({x:a.x*c+side.x*s,y:a.y*c+side.y*s,z:a.z*c+side.z*s});
}
function bound(p,si){return{x:clamp(p.x,-9.7,9.7),y:si===2?1.15:clamp(p.y,1.6,8.8),z:clamp(p.z,-5.3,5.3)};}
function memory(w,a){return a.peaceMotion??={phase:w.rand(0,6.283185),until:0,mode:'cruise',pace:1,ax:0,ay:0,az:0,turn:0,side:a.id%2?1:-1,goal:copy(a.p)};}
P.initialize=function(){
 this.limit=12;
 [4,2,2,2].forEach((count,si)=>{const sp=SPEC[si];for(let i=0;i<count;i++){
  const mass=sp.adult*this.rand(.84,1),a=this.add(si,{mass,reserve:mass*.50,age:this.rand(sp.mature,sp.life*.20),sex:i%2?'F':'M',p:{x:this.rand(-8.5,8.5),y:si===2?1.15:this.rand(3,8),z:this.rand(-3,4)}});
  this.contain(a);memory(this,a);
 }});this.baseMass=this.totalMass();this.log('Peace 4: 10 рыб; поедание рыб отключено.');this.sample();return this;
};
P.canEat=()=>false;
P.kill=function(a,cause,predator=null){if(predator||cause==='eaten')return false;return kill.call(this,a,cause,null);};
P.choose=function(a){
 a.threat=null;
 if(a.refuge>0){a.intent='nursery';a.target=a.p.x<0?0:5;return;}
 const condition=this.condition(a);
 let nearest=null,best=Infinity;
 if(condition<.93)for(const p of this.pellets){const d=distance(a.p,p.p);if(p.mass>0&&d<best&&!this.blocked(a.p,p.p)){nearest=p;best=d;}}
 if(nearest){a.intent='pellet';a.target=nearest.id;return;}
 if(this.mature(a)&&a.repro<=0&&condition>.66){
  let mate=null;best=Infinity;
  for(const b of this.agents){if(!b.alive||a===b||a.si!==b.si||a.sex===b.sex||!this.mature(b)||b.repro>0||this.condition(b)<.66)continue;const d=distance(a.p,b.p);if(d<best&&!this.blocked(a.p,b.p)){best=d;mate=b;}}
  if(mate){a.intent='court';a.target=mate.id;return;}
 }
 if(condition<.57||(a.intent==='graze'&&condition<.84)){
  best=Infinity;nearest=null;
  for(const p of this.patches){if(p.food<.05||(a.si===2&&p.p.y>1.8))continue;const d=distance(a.p,p.p)/(1+p.food*.03);if(d<best){best=d;nearest=p;}}
  if(nearest){a.intent='graze';a.target=nearest.id;return;}
 }
 a.intent='drift';a.target=null;
};
P.biology=function(dt){
 biology.call(this,dt);
 for(const a of this.agents){if(!a.alive||!['graze','nursery'].includes(a.intent))continue;
  const p=this.patches[a.target];if(p&&distance(a.p,p.p)<2){const amount=Math.min(p.food,.035*Math.pow(a.mass,.72)*dt),used=this.emitFood(a,amount);p.food-=used;}
 }
};
function wander(w,a,m){
 const r=w.random();m.mode=r<.06?'inspect':r<.27?'glide':r<.55?'surge':'cruise';
 m.pace={inspect:.55,glide:.68,surge:1.65,cruise:1.12}[m.mode];
 m.until=w.time+w.rand(m.mode==='glide'?.7:2,m.mode==='inspect'?2.4:5.5);
 const yaw=Math.atan2(a.forward.z,a.forward.x)+w.rand(-1.0,1.0),reach=w.rand(4,7);
 m.goal=bound({x:a.p.x+Math.cos(yaw)*reach,y:a.p.y+w.rand(-1.4,1.4),z:a.p.z+Math.sin(yaw)*reach},a.si);
}
function contacts(w){
 w.contacts=0;
 for(let pass=0;pass<5;pass++){
  for(let i=0;i<w.agents.length;i++)for(let j=i+1;j<w.agents.length;j++){
   const a=w.agents[i],b=w.agents[j];if(!a.alive||!b.alive||distance(a.p,b.p)>w.length(a)+w.length(b)+1)continue;
   const radius=w.radius(a)+w.radius(b)+.025;
   for(const u of [-.30,0,.30])for(const v of [-.30,0,.30]){
    let x=b.p.x+b.forward.x*v*w.length(b)-a.p.x-a.forward.x*u*w.length(a),y=b.p.y+b.forward.y*v*w.length(b)-a.p.y-a.forward.y*u*w.length(a),z=b.p.z+b.forward.z*v*w.length(b)-a.p.z-a.forward.z*u*w.length(a);
    const d=Math.hypot(x,y,z);if(d>=radius)continue;if(d<1e-8){x=a.id%2?1:-1;y=.17;z=.31;}
    const n=Math.hypot(x,y,z);x/=n;y/=n;z/=n;const amount=(radius-d)*.55,wa=b.mass/(a.mass+b.mass),wb=1-wa;
    a.p.x-=x*amount*wa;a.p.y-=y*amount*wa;a.p.z-=z*amount*wa;b.p.x+=x*amount*wb;b.p.y+=y*amount*wb;b.p.z+=z*amount*wb;
    const closing=(b.v.x-a.v.x)*x+(b.v.y-a.v.y)*y+(b.v.z-a.v.z)*z;
    if(closing<0){a.v.x+=closing*x*wa;a.v.y+=closing*y*wa;a.v.z+=closing*z*wa;b.v.x-=closing*x*wb;b.v.y-=closing*y*wb;b.v.z-=closing*z*wb;}w.contacts++;
   }
  }
  for(const a of w.agents)if(a.alive)w.contain(a);
 }
}
P.move=function(dt){
 if(this.agents.some(a=>a.jump)){legacyMove.call(this,dt);return;}
 const old=this.agents.map(a=>({id:a.id,si:a.si,p:copy(a.p),v:copy(a.v),radius:this.radius(a)})),ids=new Map(this.agents.map(a=>[a.id,a]));
 for(const a of this.agents){if(!a.alive)continue;const m=memory(this,a),sp=SPEC[a.si],before=copy(a.p);m.phase+=dt*(.8+.35*Math.hypot(a.v.x,a.v.y,a.v.z));let goal=null;
  if(a.intent==='pellet')goal=this.pellets.find(p=>p.id===a.target)?.p;
  else if(a.intent==='court')goal=ids.get(a.target)?.p;
  else if(a.intent==='nursery')goal={x:a.p.x<0?-9.4:9.4,y:a.si===2?1.15:2.2,z:4.7};
  else if(a.intent==='graze'){
   const p=this.patches[a.target];if(p)goal={x:p.p.x+Math.cos(m.phase)*1.15,y:a.si===2?1.15:p.p.y+Math.sin(m.phase*.61)*.30,z:p.p.z+Math.sin(m.phase)*1.15};
  }
  if(this.time>=m.until||distance(a.p,m.goal)<1)wander(this,a,m);
  goal=bound(goal??m.goal,a.si);
  const offset={x:goal.x-a.p.x,y:goal.y-a.p.y,z:goal.z-a.p.z};let wanted=unit(offset);
  let sx=0,sy=0,sz=0,neighbors=0;
  for(const b of old){if(a.id===b.id)continue;const dx=a.p.x-b.p.x,dy=a.p.y-b.p.y,dz=a.p.z-b.p.z,d=Math.hypot(dx,dy,dz),safe=this.radius(a)+b.radius+.65;
   if(d<safe&&d>.00001){const k=(safe-d)/d*2.8;sx+=dx*k;sy+=dy*k;sz+=dz*k;}
   else if(a.si===0&&b.si===0&&d<4.2){sx+=(b.p.x-a.p.x)*.045+b.v.x*.075;sy+=(b.p.y-a.p.y)*.045+b.v.y*.075;sz+=(b.p.z-a.p.z)*.045+b.v.z*.075;neighbors++;}
  }
  const speed=Math.max(sp.speed,sp.L*.48)*a.genes.speed*clamp(Math.sqrt(this.scale(a)),.5,1.1);
  const look=1+Math.hypot(a.v.x,a.v.y,a.v.z)*.7,probe={x:a.p.x+a.forward.x*look,y:a.p.y+a.forward.y*look,z:a.p.z+a.forward.z*look};
  for(const o of this.rocks){const r=this.radius(a)+.55,x=(probe.x-o.x)/(o.rx+r),y=(probe.y-o.y)/(o.ry+r),z=(probe.z-o.z)/(o.rz+r),d=Math.hypot(x,y,z);if(d<1.6&&d>.0001){const k=(1.6-d)/d*2.5;sx+=x*k-z*.28*m.side;sy+=y*k;sz+=z*k+x*.28*m.side;}}
  sx+=Math.max(0,-9.7-probe.x)*2-Math.max(0,probe.x-9.7)*2;sz+=Math.max(0,-5.2-probe.z)*2-Math.max(0,probe.z-5.2)*2;
  if(a.si!==2)sy+=Math.max(0,1.2-probe.y)*2-Math.max(0,probe.y-9.1)*2;
  wanted=unit({x:wanted.x+sx,y:clamp(wanted.y+sy,-.42,.42),z:wanted.z+sz});const previous=unit(a.forward),heading=turn(previous,wanted,dt*(a.intent==='pellet'?2.4:1.8));
  const yaw=(previous.x*heading.z-previous.z*heading.x)/Math.max(dt,.001);m.turn+=(clamp(yaw,-1.5,1.5)-m.turn)*(1-Math.exp(-dt*5));
  const targetSpeed=speed*(a.intent==='graze'?.95:a.intent==='court'?.8:a.intent==='pellet'?1.5:m.pace)*(.91+.09*Math.sin(m.phase*2));
  const desired={x:heading.x*targetSpeed,y:heading.y*targetSpeed,z:heading.z*targetSpeed};
  if(this.current){desired.x+=Math.sin(this.time*.07+a.p.z*.4)*.05;desired.z+=Math.cos(this.time*.05+a.p.x*.3)*.05;}
  const acc={x:(desired.x-a.v.x)*3,y:(desired.y-a.v.y)*3,z:(desired.z-a.v.z)*3},n=norm(acc),cap=3.5;if(n>cap){acc.x*=cap/n;acc.y*=cap/n;acc.z*=cap/n;}
  const change={x:acc.x-m.ax,y:acc.y-m.ay,z:acc.z-m.az},j=norm(change),k=j>10*dt?10*dt/j:1;m.ax+=change.x*k;m.ay+=change.y*k;m.az+=change.z*k;
  a.v.x+=m.ax*dt;a.v.y+=m.ay*dt;a.v.z+=m.az*dt;const v=norm(a.v),maximum=speed*2.1;if(v>maximum){a.v.x*=maximum/v;a.v.y*=maximum/v;a.v.z*=maximum/v;}
  a.p.x+=a.v.x*dt;a.p.y+=a.v.y*dt;a.p.z+=a.v.z*dt;this.contain(a);if(norm(a.v)>.08)a.forward=unit(a.v);
  if(distance(before,a.p)<dt*.03)m.until=this.time;
 }
 contacts(this);
};
E.restore=function(raw){
 if(typeof raw==='string'&&raw.length>1000000)throw Error('Save too large');const d=typeof raw==='string'?JSON.parse(raw):JSON.parse(JSON.stringify(raw));
 if(d?.limit!==12||d.counters?.eaten!==0||!Array.isArray(d.agents)||!Array.isArray(d.eggs)||d.agents.length+d.eggs.length>12)throw Error('Incompatible Peace 4 save');
 for(const a of d.agents){const m=a.peaceMotion;if(!m)continue;if(!['phase','until','pace','ax','ay','az','turn','side'].every(k=>Number.isFinite(m[k])&&Math.abs(m[k])<1e12)||!['cruise','inspect','glide','surge'].includes(m.mode)||m.pace<=0||m.pace>2||![-1,1].includes(m.side)||!m.goal||!['x','y','z'].every(k=>Number.isFinite(m.goal[k])&&Math.abs(m.goal[k])<=30))throw Error('Invalid Peace motion');}
 d.limit=32;const w=restore.call(E,d);w.limit=12;for(const a of w.agents)if(['hunt','flee'].includes(a.intent)){a.intent='drift';a.target=null;}w.assert();return w;
};
root.NacrePeace={version:'4.0',initialFish:10,capacity:12,predation:false};
})(typeof window==='undefined'?globalThis:window);
