/* Behavior model: fictional timings, bounded bursts, deterministic random source. */
(function(root){'use strict';
const {Ecosystem:E,SPEC,clamp}=root.NacreEcology,P=E.prototype,move=P.move,choose=P.choose,restore=E.restore;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),cp=p=>({...p});
const modes=['cruise','pass','inspect','glide','hold','recover','escape'];
const bound=(p,si)=>({x:clamp(p.x,-9.4,9.4),y:si===2?1.1:clamp(p.y,1.4,8.9),z:clamp(p.z,-5.1,5.1)});
function state(w,a){return a.behavior??={mode:'cruise',pace:1,until:0,t:0,span:1,fearUntil:0,burstUntil:0,attacker:0,side:a.id%2?1:-1,path:[],escapeGoal:cp(a.p)};}
function threat(w,a){let found=null,score=Infinity;for(const b of w.agents){
 if(b===a||!b.alive||!w.canEat(b,a)||w.condition(b)>.62)continue;
 const dx=a.p.x-b.p.x,dy=a.p.y-b.p.y,dz=a.p.z-b.p.z,d=Math.hypot(dx,dy,dz),closing=(b.v.x*dx+b.v.y*dy+b.v.z*dz)/Math.max(.001,d);
 if(d<7.5&&(closing>.08||d<3)&&!w.blocked(a.p,b.p)){const s=d/(.4+Math.max(0,closing));if(s<score){score=s;found=b;}}
}return found;}
function curve(p,t){const u=1-t;return{x:u*u*u*p[0].x+3*u*u*t*p[1].x+3*u*t*t*p[2].x+t*t*t*p[3].x,y:u*u*u*p[0].y+3*u*u*t*p[1].y+3*u*t*t*p[2].y+t*t*t*p[3].y,z:u*u*u*p[0].z+3*u*u*t*p[1].z+3*u*t*t*p[2].z+t*t*t*p[3].z};}
function route(w,a,s){
 const roll=w.random(),previous=s.mode;
 s.mode=previous==='pass'?'glide':roll<.12?'hold':roll<.29?'inspect':roll<.49?'pass':'cruise';
 const speed={hold:.12,inspect:.43,pass:1.65,glide:.42,cruise:1.02};s.pace=speed[s.mode];
 s.until=w.time+w.rand(s.mode==='pass'?2:3,s.mode==='hold'?4:8);s.t=0;
 const yaw=Math.atan2(a.forward.z,a.forward.x)+w.rand(-.9,.9),reach=s.mode==='inspect'?2.2:s.mode==='hold'?.5:w.rand(4,7);
 const end=bound({x:a.p.x+Math.cos(yaw)*reach,y:a.p.y+w.rand(-1.2,1.2),z:a.p.z+Math.sin(yaw)*reach},a.si);
 const p1=bound({x:a.p.x+a.forward.x*2,y:a.p.y+a.forward.y,z:a.p.z+a.forward.z*2},a.si);
 const p2=bound({x:end.x-Math.cos(yaw)*1.5,y:end.y+w.rand(-.7,.7),z:end.z-Math.sin(yaw)*1.5},a.si);
 s.path=[cp(a.p),p1,p2,end];s.span=Math.max(1,dist(s.path[0],p1)+dist(p1,p2)+dist(p2,end));
}
function emergency(w,a,s,pred){
 if(s.mode!=='escape'||s.attacker!==pred.id){s.side=w.random()<.5?-1:1;s.burstUntil=w.time+.42;}
 s.mode='escape';s.attacker=pred.id;s.fearUntil=w.time+1.3;
 const dx=a.p.x-pred.p.x,dz=a.p.z-pred.p.z,n=Math.max(.01,Math.hypot(dx,dz));
 const age=Math.max(0,.42-(s.burstUntil-w.time)),jink=Math.sin(age*4.2)*s.side;
 const away=bound({x:a.p.x+dx/n*4-dz/n*jink*1.3,y:a.p.y+(a.si===2?0:s.side*.9),z:a.p.z+dz/n*4+dx/n*jink*1.3},a.si);
 const shelters=[{x:-9.2,y:a.si===2?1:1.7,z:4.7},{x:9.2,y:a.si===2?1:1.7,z:4.7}];
 shelters.sort((x,y)=>(dist(a.p,x)-dist(pred.p,x)*.55)-(dist(a.p,y)-dist(pred.p,y)*.55));
 s.escapeGoal=w.time>s.burstUntil&&!w.blocked(a.p,shelters[0])&&dist(pred.p,shelters[0])>dist(a.p,shelters[0])?shelters[0]:away;
 a.intent='flee';a.target=pred.id;a.threat=pred.id;
}
P.choose=function(a){const s=state(this,a),pred=threat(this,a);if(pred){emergency(this,a,s,pred);return;}
 if(s.fearUntil>this.time&&this.agents.some(b=>b.id===s.attacker&&b.alive)){a.intent='flee';a.target=s.attacker;return;}
 choose.call(this,a);
 if(this.condition(a)>.72&&['graze','drift','digest'].includes(a.intent)){a.intent='drift';a.target=null;}
};
P.move=function(dt){
 for(const a of this.agents){if(!a.alive)continue;const s=state(this,a),pred=threat(this,a);
  if(pred)emergency(this,a,s,pred);
  else if(s.fearUntil>this.time){const b=this.agents.find(b=>b.id===s.attacker&&b.alive);if(b){a.intent='flee';a.target=b.id;}else s.fearUntil=0;}
  else if(s.mode==='escape'){s.mode='recover';s.until=this.time+this.rand(2,4);s.pace=.35;s.path=[];a.intent='drift';a.target=null;}
  if(a.intent==='flee'){if(this.time<s.burstUntil)a.stamina=clamp(a.stamina-dt*.12,0,1);continue;}
  if(['hunt','court','pellet','nursery'].includes(a.intent)||this.condition(a)<.60)continue;
  if(s.mode==='recover'&&this.time<s.until){s.pace=.35;if(a.naturalMotion){a.naturalMotion.goal=bound({x:a.p.x+a.forward.x,y:a.p.y,z:a.p.z+a.forward.z},a.si);a.naturalMotion.nextGoal=this.time+1;}continue;}
  if(this.time>=s.until||s.path.length!==4||s.t>=.97)route(this,a,s);
  const current=curve(s.path,s.t);if(dist(a.p,current)<2.2)s.t=Math.min(1,s.t+dt*Math.max(.1,Math.hypot(a.v.x,a.v.y,a.v.z))/s.span);
  const ahead=curve(s.path,Math.min(1,s.t+Math.min(.28,1.1/s.span)));
  if(!this.blocked(a.p,ahead)&&a.naturalMotion){a.naturalMotion.goal=ahead;a.naturalMotion.nextGoal=this.time+2;}
  else s.until=this.time;
  if(this.condition(a)>.72){a.intent='drift';a.target=null;}
 }
 move.call(this,dt);
};
E.restore=function(raw){
 if(typeof raw==='string'&&raw.length>1000000)throw Error('Save too large');const d=typeof raw==='string'?JSON.parse(raw):JSON.parse(JSON.stringify(raw));
 for(const a of d.agents||[]){const s=a.behavior;if(!s)continue;
  const finite=n=>Number.isFinite(n)&&Math.abs(n)<1e12,vec=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=30);
  if(!modes.includes(s.mode)||!['pace','until','t','span','fearUntil','burstUntil','attacker','side'].every(k=>finite(s[k]))||s.pace<0||s.pace>2||s.t<0||s.t>1||s.span<1||!Array.isArray(s.path)||![0,4].includes(s.path.length)||!s.path.every(vec)||!vec(s.escapeGoal)||![-1,1].includes(s.side)||!Number.isSafeInteger(s.attacker)||s.attacker<0)throw Error('Invalid behavior state');
 }return restore.call(E,d);
};
root.NacreBehavior={version:'3.0',initialFish:10,capacity:12,modes};
})(typeof window==='undefined'?globalThis:window);
