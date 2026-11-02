/* Natural motion for NACRE VI. Abstract ecosystem, not hydrodynamic CFD. */
(function(root){'use strict';
const {Ecosystem:E,SPEC,clamp}=root.NacreEcology,P=E.prototype,legacyMove=P.move,legacyRestore=E.restore;
const cp=p=>({x:p.x,y:p.y,z:p.z}),len=p=>Math.hypot(p.x,p.y,p.z),d2=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2;
const unit=p=>{const n=len(p);return n>1e-8?{x:p.x/n,y:p.y/n,z:p.z/n}:{x:1,y:0,z:0};};
function memory(w,a){return a.naturalMotion??=( {ax:0,ay:0,az:0,turn:0,phase:w.rand(0,Math.PI*2),nextGoal:0,goal:cp(a.p)} );}
P.initialize=function(){
 const small=this.limit<=64;this.limit=small?13:20;
 (small?[2,2,2,2]:[4,2,2,2]).forEach((count,si)=>{const sp=SPEC[si];for(let i=0;i<count;i++){
  const mass=sp.adult*this.rand(.80,.98),a=this.add(si,{mass,reserve:mass*.48,age:this.rand(sp.mature,sp.life*.24),sex:i%2?'F':'M',p:{x:this.rand(-8.5,8.5),y:si===2?1.1:this.rand(3,8),z:this.rand(-2.5,4.5)}});this.contain(a);memory(this,a);
 }});this.baseMass=this.totalMass();this.log('Спокойный биотоп: '+this.agents.length+' рыб.');this.sample();return this;
};
E.restore=function(raw){
 if(typeof raw==='string'&&raw.length>1000000)throw Error('Save too large');
 const d=typeof raw==='string'?JSON.parse(raw):JSON.parse(JSON.stringify(raw)),cap=d?.limit;
 if(![13,20].includes(cap)||!Array.isArray(d.agents)||!Array.isArray(d.eggs)||d.agents.length+d.eggs.length>cap)throw Error('Incompatible low-density save');
 for(const a of d.agents){const m=a.naturalMotion;if(!m)continue;
  if(!['ax','ay','az','turn','phase','nextGoal'].every(k=>Number.isFinite(m[k])&&Math.abs(m[k])<=1e12)||!m.goal||!['x','y','z'].every(k=>Number.isFinite(m.goal[k])&&Math.abs(m.goal[k])<=30))throw Error('Invalid natural motion');
 }
 d.limit=32;const w=legacyRestore.call(E,d);w.limit=cap;w.assert();return w;
};
function heading(from,to,max){
 const f=unit(from),t=unit(to),dot=clamp(f.x*t.x+f.y*t.y+f.z*t.z,-1,1),angle=Math.acos(dot);if(angle<1e-7)return t;
 let s={x:t.x-f.x*dot,y:t.y-f.y*dot,z:t.z-f.z*dot},n=len(s);
 if(n<1e-7){s={x:-f.z,y:0,z:f.x};n=len(s);if(n<1e-7){s={x:1,y:0,z:0};n=1;}}
 const a=Math.min(angle,max),c=Math.cos(a),k=Math.sin(a)/n;return unit({x:f.x*c+s.x*k,y:f.y*c+s.y*k,z:f.z*c+s.z*k});
}
function contacts(w){
 w.contacts=0;for(let pass=0;pass<4;pass++){
  for(let i=0;i<w.agents.length;i++){const a=w.agents[i];if(!a.alive)continue;
   for(let j=i+1;j<w.agents.length;j++){const b=w.agents[j];if(!b.alive)continue;const broad=w.length(a)+w.length(b)+1;if(d2(a.p,b.p)>broad*broad)continue;
    const r=w.radius(a)+w.radius(b)+.035;
    for(const u of [-.30,0,.30])for(const v of [-.30,0,.30]){
     let x=b.p.x+b.forward.x*v*w.length(b)-a.p.x-a.forward.x*u*w.length(a),y=b.p.y+b.forward.y*v*w.length(b)-a.p.y-a.forward.y*u*w.length(a),z=b.p.z+b.forward.z*v*w.length(b)-a.p.z-a.forward.z*u*w.length(a);
     const actual=Math.hypot(x,y,z);if(actual>=r)continue;if(actual<1e-8){x=a.id%2?1:-1;y=.17;z=.31;}
     const n=Math.hypot(x,y,z);x/=n;y/=n;z/=n;const pen=(r-actual)*.55,wa=b.mass/(a.mass+b.mass),wb=1-wa;
     a.p.x-=x*pen*wa;a.p.y-=y*pen*wa;a.p.z-=z*pen*wa;b.p.x+=x*pen*wb;b.p.y+=y*pen*wb;b.p.z+=z*pen*wb;
     const rel=(b.v.x-a.v.x)*x+(b.v.y-a.v.y)*y+(b.v.z-a.v.z)*z;
     if(rel<0){a.v.x+=rel*x*wa;a.v.y+=rel*y*wa;a.v.z+=rel*z*wa;b.v.x-=rel*x*wb;b.v.y-=rel*y*wb;b.v.z-=rel*z*wb;}w.contacts++;
    }
   }
  }for(const a of w.agents)if(a.alive)w.contain(a);
 }
}
P.move=function(dt){
 if(this.agents.some(a=>a.jump)){legacyMove.call(this,dt);return;}
 const ids=new Map(this.agents.map(a=>[a.id,a])),old=this.agents.map(a=>({id:a.id,si:a.si,p:cp(a.p),v:cp(a.v),r:this.radius(a)}));
 for(const a of this.agents){if(!a.alive)continue;const sp=SPEC[a.si],m=memory(this,a),target=ids.get(a.target),active=a.intent==='hunt'||a.intent==='flee';m.phase+=dt*(active?1.8:.75);let goal=null;
  if(a.intent==='hunt'&&target?.alive){const lead=clamp(Math.sqrt(d2(a.p,target.p))/Math.max(.3,sp.speed*2),.08,.5);goal={x:target.p.x+target.v.x*lead,y:target.p.y+target.v.y*lead,z:target.p.z+target.v.z*lead};}
  else if(a.intent==='flee'&&target?.alive)goal={x:a.p.x+(a.p.x-target.p.x)*3,y:a.p.y+(a.p.y-target.p.y)*2,z:a.p.z+(a.p.z-target.p.z)*3};
  else if(a.intent==='court'&&target?.alive)goal=target.p;
  else if(a.intent==='pellet')goal=this.pellets.find(p=>p.id===a.target)?.p;
  else if(a.intent==='nursery')goal={x:a.p.x<0?-9.5:9.5,y:a.si===2?1:2.2,z:4.7};
  else if(a.intent==='graze')goal=this.patches[a.target]?.p;
  if(!goal){if(this.time>=m.nextGoal){const angle=Math.atan2(a.forward.z,a.forward.x)+this.rand(-.9,.9);m.goal={x:clamp(a.p.x+Math.cos(angle)*this.rand(3,6),-9,9),y:a.si===2?1.1:clamp(a.p.y+this.rand(-1.1,1.1),2,8.7),z:clamp(a.p.z+Math.sin(angle)*this.rand(3,6),-4.8,5)};m.nextGoal=this.time+this.rand(4,8);}goal=m.goal;}
  const offset={x:goal.x-a.p.x,y:(a.si===2?clamp(goal.y,1,1.5):goal.y)-a.p.y,z:goal.z-a.p.z},distance=len(offset);let desired=unit(offset);
  const gait=.76+.16*Math.sin(m.phase)+.08*Math.sin(m.phase*2+.6);let speed=sp.speed*a.genes.speed*clamp(Math.sqrt(this.scale(a)),.5,1.1)*(active?(a.intent==='hunt'?2.1:1.9):gait);
  if(a.intent==='digest')speed*=.58;if(['graze','nursery','court','pellet'].includes(a.intent))speed*=clamp(distance/1.4,.12,1);
  let sx=0,sy=0,sz=0;
  for(const b of old){if(b.id===a.id)continue;const x=a.p.x-b.p.x,y=a.p.y-b.p.y,z=a.p.z-b.p.z,d=Math.hypot(x,y,z),safe=this.radius(a)+b.r+.55;
   if(d<safe&&d>1e-5&&!(a.intent==='hunt'&&a.target===b.id)){const k=(safe-d)/(safe*d)*1.8;sx+=x*k;sy+=y*k;sz+=z*k;}
   if(a.si===0&&b.si===0&&!active&&d>safe&&d<3.8){sx+=(b.p.x-a.p.x)*.025+b.v.x*.045;sy+=(b.p.y-a.p.y)*.025+b.v.y*.045;sz+=(b.p.z-a.p.z)*.025+b.v.z*.045;}
  }
  const look=.7+speed*.7,probe={x:a.p.x+a.forward.x*look,y:a.p.y+a.forward.y*look,z:a.p.z+a.forward.z*look};
  for(const rock of this.rocks){const margin=this.radius(a)+.45,x=(probe.x-rock.x)/(rock.rx+margin),y=(probe.y-rock.y)/(rock.ry+margin),z=(probe.z-rock.z)/(rock.rz+margin),d=Math.hypot(x,y,z);if(d<1.6&&d>1e-5){const k=(1.6-d)*2/d;sx+=x*k;sy+=y*k;sz+=z*k;}}
  sx+=Math.max(0,-9.3-probe.x)*1.8-Math.max(0,probe.x-9.3)*1.8;sz+=Math.max(0,-5-probe.z)*1.8-Math.max(0,probe.z-5)*1.8;if(a.si!==2)sy+=Math.max(0,1.4-probe.y)-Math.max(0,probe.y-9.1);
  desired=unit({x:desired.x+sx,y:desired.y+sy,z:desired.z+sz});const previous=unit(a.forward),dir=heading(previous,desired,dt*(active?2.4:1.05));
  const turn=(previous.x*dir.z-previous.z*dir.x)/Math.max(dt,.001);m.turn+=(clamp(turn,-1,1)-m.turn)*(1-Math.exp(-dt*4));
  const want={x:dir.x*speed,y:dir.y*speed,z:dir.z*speed};if(this.current){want.x+=Math.sin(a.p.z*.4+this.time*.07)*.07;want.z+=Math.cos(a.p.x*.3-this.time*.05)*.07;}
  const request={x:(want.x-a.v.x)*2,y:(want.y-a.v.y)*2,z:(want.z-a.v.z)*2},an=len(request),acc=active?3.8:1.25;if(an>acc){request.x*=acc/an;request.y*=acc/an;request.z*=acc/an;}
  const delta={x:request.x-m.ax,y:request.y-m.ay,z:request.z-m.az},dn=len(delta),jerk=active?10:3.5,k=dn>jerk*dt?jerk*dt/dn:1;m.ax+=delta.x*k;m.ay+=delta.y*k;m.az+=delta.z*k;
  a.v.x+=m.ax*dt;a.v.y+=m.ay*dt;a.v.z+=m.az*dt;const velocity=len(a.v),maximum=sp.speed*(active?2.35:1.25);if(velocity>maximum){a.v.x*=maximum/velocity;a.v.y*=maximum/velocity;a.v.z*=maximum/velocity;}
  a.p.x+=a.v.x*dt;a.p.y+=a.v.y*dt;a.p.z+=a.v.z*dt;this.contain(a);if(len(a.v)>.025)a.forward=unit(a.v);
 }contacts(this);
};
})(typeof window==='undefined'?globalThis:window);
