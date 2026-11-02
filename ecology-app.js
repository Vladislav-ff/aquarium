/* Single scheduler and persistence owner for both renderers. */
(function(){'use strict';
const {Ecosystem,SPEC,clamp}=NacreEcology,$=id=>document.getElementById(id),KEY='nacre-ecosystem-v6',BACKUP=KEY+'-backup',STEP=1/30;
let model,restoreError='',storageOK=true;
try{const s=localStorage.getItem(KEY);if(s){if(s.length>1000000)throw Error('Слишком большое сохранение');model=Ecosystem.restore(s);}}
catch(e){restoreError='Основное сохранение повреждено.';try{const b=localStorage.getItem(BACKUP);if(b&&b.length<1000000){model=Ecosystem.restore(b);restoreError+=' Восстановлена резервная копия.';}}catch(_){} }
model??=new Ecosystem({limit:matchMedia('(max-width:700px)').matches?64:96});
const app={model,paused:false,speed:1,adapter:null,flat:false,selected:null,feedMode:false,raf:0,acc:0,dropped:0,storageOK,simMs:0,fps:60,saveCount:0};window.NacreApp=app;
let last=0,uiDebt=0,saveDebt=0,notificationTimer=0,disposed=false,width=0,height=0,dpr=1,sceneEvents=[];
const canvas=$('flatWorld'),ctx=canvas.getContext('2d');
function notify(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(notificationTimer);notificationTimer=setTimeout(()=>$('toast').classList.remove('show'),4200);}
function stamp(t){return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');}
function hideLoader(){window.aquariumReady=true;clearTimeout(window.loadTimer);$('loader').style.display='none';}
function setFlat(reason=''){
 app.flat=true;document.body.classList.add('flat-mode');$('ecoRender').value='flat';hideLoader();
 if(reason)notify(reason);resize();app.adapter?.setVisible?.(false);
}
app.setFlat=setFlat;window.aquariumFail=message=>{console.warn(message);setFlat('3D недоступно. Экосистема продолжает работать в 2D.');};
app.attach=adapter=>{app.adapter=adapter;if($('ecoRender').value!=='flat'){app.flat=false;document.body.classList.remove('flat-mode');adapter.setVisible?.(true);}else adapter.setVisible?.(false);hideLoader();updateUI();};
function resize(){width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
window.addEventListener('resize',resize);resize();
function save(manual=false){
 try{app.model.assert();const text=JSON.stringify(app.model.snapshot()),previous=localStorage.getItem(KEY);
  if(previous&&previous.length<1000000){try{Ecosystem.restore(previous);localStorage.setItem(BACKUP,previous);}catch(_){}}
  localStorage.setItem(KEY,text);app.storageOK=true;app.saveCount++;if(manual)notify('Экосистема сохранена.');
 }catch(e){app.storageOK=false;if(manual)notify('Не удалось сохранить: '+e.message);}return app.storageOK;
}
app.save=save;
function setModel(next){
 next.assert();app.model=next;app.acc=0;app.selected=null;sceneEvents=[];app.adapter?.reset?.();$('card').classList.remove('open');$('ecoCycle').checked=next.autoCycle;updateUI();save();
}
function makeText(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
function select(id){const a=app.model.agents.find(a=>a.id===id);if(!a)return;app.selected=id;$('intro').style.display='none';$('card').classList.add('open');$('species').textContent=SPEC[a.si].name;$('latin').textContent='Воображаемый вид · особь № '+a.id;$('description').textContent=['Стайный потребитель планктона. Взрослые могут поедать очень мелкую добычу.','Всеядный охотник. Размер пасти ограничивает доступную добычу.','Донный потребитель планктона и переработчик органики.','Узкотелый хищник. Молодь питается планктоном.'][a.si];$('specimen').textContent=String(a.si+1).padStart(2,'0');updateLife(a);}
app.select=select;
function updateLife(a){
 const node=$('ecoLife');if(!a){node.hidden=true;return;}node.hidden=false;node.replaceChildren();
 const states={drift:'Свободное плавание',digest:'Переваривание',flee:'Уход от хищника',hunt:'Охота',court:'Поиск партнёра',graze:'Питание',nursery:'Укрытие молоди',pellet:'Ручной корм',jump:'К поверхности'};
 node.append(makeText('div','№ '+a.id+' · '+(a.sex==='F'?'самка':'самец')+' · поколение '+a.generation));
 node.append(makeText('div','Возраст '+stamp(a.age)+' · '+(app.model.mature(a)?'зрелая особь':'молодь')+' · '+states[a.intent]));
 for(const [label,value] of [['Энергия',app.model.condition(a)],['Здоровье',a.health],['Выносливость',a.stamina]]){node.append(makeText('div',label+' '+Math.round(value*100)+'%'));const bar=makeText('div','','eco-bar'),fill=document.createElement('i');fill.style.width=clamp(value*100,0,100)+'%';bar.append(fill);node.append(bar);}
 $('sizeTag').textContent=([7,21,12,32][a.si]*app.model.scale(a)).toFixed(1)+' см';$('moodTag').textContent=states[a.intent];
}
function updateUI(){
 const m=app.model,s=m.summary();$('count').textContent=m.agents.length+' рыб · '+s.eggs+' икр.';
 const hunting=m.agents.filter(a=>a.intent==='hunt').length;$('activity').textContent=app.paused?'Пауза':hunting?'Охота · '+hunting:m.agents.some(a=>a.intent==='court')?'Поиск партнёра':'Жизнь биотопа';
 $('ecoTime').textContent='Время '+stamp(m.time)+' · поколение '+s.generation+' · '+(app.paused?'пауза':'×'+app.speed);
 $('ecoPopulation').textContent=m.agents.length+' / '+s.eggs;$('ecoOxygen').textContent=Math.round(s.oxygen*100)+'%';$('ecoFood').textContent=s.plankton.toFixed(1);$('ecoBirths').textContent=s.births+' / '+s.eaten;
 $('ecoCycle').checked=m.autoCycle;$('night').setAttribute('aria-pressed',String(m.light()<.48));$('night').classList.toggle('active',m.light()<.48);
 const list=$('ecoSpecies');list.replaceChildren();SPEC.forEach((sp,i)=>list.append(makeText('span',sp.name),makeText('span',s.counts[i]+' · '+m.eggs.filter(e=>e.si===i).length+' икр.')));
 const status=$('ecoStatus');status.classList.toggle('warn',!app.storageOK||s.oxygen<.3||!m.agents.length);status.textContent=(!app.storageOK?'Локальное хранилище недоступно. ':!m.agents.length?'Рыбы вымерли. Автоподселения нет. ':'Баланс вещества '+(Math.abs(s.massError)<1e-6?'сходится':'нарушен')+'. ')+(app.flat?'2D · офлайн':'3D')+(app.dropped>.5?' · ограничено производительностью':'');
 const log=$('ecoLog');log.replaceChildren();for(const e of m.events.slice(0,8)){const li=document.createElement('li');li.append(makeText('time',stamp(e.t)),document.createTextNode(e.text));log.append(li);}
 const a=m.agents.find(a=>a.id===app.selected);if(app.selected&&!a){app.selected=null;$('card').classList.remove('open');}updateLife(a);
 if($('diagnostics').open)$('stats').textContent=app.fps.toFixed(0)+' FPS · '+app.simMs.toFixed(2)+' мс / шаг\nВремя '+stamp(m.time)+' · капсульные контакты '+m.contacts+'\nБаланс: '+s.massError.toExponential(2)+'\nВместимость: '+(m.agents.length+m.eggs.length)+'/'+m.limit+'\nПропущено симуляционного времени: '+app.dropped.toFixed(2)+' с';
 drawChart();
}
function drawChart(){const c=$('ecoChart'),g=c.getContext('2d'),h=app.model.history;g.clearRect(0,0,c.width,c.height);g.strokeStyle='#9de4d31a';g.lineWidth=1;for(let i=1;i<4;i++){g.beginPath();g.moveTo(0,i*50);g.lineTo(c.width,i*50);g.stroke();}const max=Math.max(8,...h.flatMap(p=>p.counts));SPEC.forEach((sp,si)=>{g.strokeStyle=sp.color;g.lineWidth=3;g.beginPath();h.forEach((p,i)=>{const x=i/Math.max(1,h.length-1)*c.width,y=c.height-10-p.counts[si]/max*(c.height-28);if(i)g.lineTo(x,y);else g.moveTo(x,y);});g.stroke();});g.fillStyle='#91adb5';g.font='18px system-ui';g.fillText(String(max),4,18);g.fillText(h.length?stamp(h[0].time)+' → '+stamp(app.model.time):'',c.width-175,c.height-5);}
function projection(){const sx=width/27,sy=(height-120)/13,scale=Math.min(sx,sy),cx=width/2,base=height/2+5.2*scale;return {scale,cx,base};}
function project(p){const {scale,cx,base}=projection();return {x:cx+p.x*scale,y:base-p.y*scale+p.z*scale*.12,s:scale};}
function flatDraw(){
 const m=app.model,t=m.time,night=1-m.light();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
 const bg=ctx.createLinearGradient(0,0,0,height);bg.addColorStop(0,night>.5?'#071725':'#0a3647');bg.addColorStop(1,'#020c17');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
 const p0=project({x:-12,y:0,z:0}),p1=project({x:12,y:10.88,z:0});ctx.strokeStyle='#9de4d32a';ctx.lineWidth=1;ctx.strokeRect(p0.x,p1.y,p1.x-p0.x,p0.y-p1.y);
 ctx.fillStyle='#9f9c7518';ctx.fillRect(p0.x,p0.y-5,p1.x-p0.x,9);
 for(const rock of m.rocks){const p=project(rock);ctx.fillStyle='#57716b44';ctx.beginPath();ctx.ellipse(p.x,p.y,rock.rx*p.s,rock.ry*p.s,0,0,Math.PI*2);ctx.fill();}
 for(const side of [-1,1]){const x=project({x:side*9.5,y:0,z:4.7});ctx.strokeStyle='#76c2a14d';ctx.lineWidth=2;for(let j=0;j<7;j++){ctx.beginPath();ctx.moveTo(x.x+j*5,x.y);ctx.quadraticCurveTo(x.x+j*5+Math.sin(t*.9+j)*8,x.y-40,x.x+j*5+Math.sin(t*.6+j)*12,x.y-75-j*3);ctx.stroke();}}
 for(const patch of m.patches){const p=project(patch.p);ctx.fillStyle='#91d89c';ctx.globalAlpha=.10+.20*patch.food/11;for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(p.x+Math.sin(i*2+t*.12)*p.s,p.y+Math.cos(i*3+t*.15)*p.s*.5,1.2+i*.2,0,Math.PI*2);ctx.fill();}}ctx.globalAlpha=1;
 for(const egg of m.eggs){const p=project(egg.p);ctx.fillStyle='#efdca5';ctx.beginPath();ctx.arc(p.x,p.y,Math.max(2,p.s*.06),0,Math.PI*2);ctx.fill();}
 for(const food of m.pellets){const p=project(food.p);ctx.fillStyle='#f1b36a';ctx.fillRect(p.x-1.5,p.y-1.5,3,3);}
 for(const a of [...m.agents].sort((a,b)=>a.p.z-b.p.z)){
  const p=project(a.p),sp=SPEC[a.si],len=m.length(a)*p.s,hh=Math.max(2.2,sp.H*m.scale(a)*p.s),angle=Math.atan2(-a.forward.y,a.forward.x),wag=Math.sin(t*8+a.id)*.22;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.fillStyle=sp.color;ctx.globalAlpha=.58+.42*(a.p.z+7)/14;
  ctx.beginPath();ctx.moveTo(-len*.35,0);ctx.lineTo(-len*.72,-hh*(1.0+wag));ctx.lineTo(-len*.72,hh*(1.0-wag));ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.ellipse(0,0,len*.5,hh,0,0,Math.PI*2);ctx.fill();
  if(a.si===1){ctx.beginPath();ctx.moveTo(-len*.25,-hh*.6);ctx.lineTo(-len*.08,-hh*2.0);ctx.lineTo(len*.22,-hh*.7);ctx.fill();}
  ctx.fillStyle='#062029';ctx.beginPath();ctx.arc(len*.29,-hh*.18,Math.max(1,hh*.18),0,Math.PI*2);ctx.fill();ctx.restore();
  if(a.id===app.selected){ctx.strokeStyle='#ccffe8';ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(p.x,p.y,len*.83+6,hh*1.6+6,0,0,Math.PI*2);ctx.stroke();}
  if(a.intent==='hunt'){ctx.strokeStyle='#edbd7955';const b=m.agents.find(b=>b.id===a.target);if(b){const q=project(b.p);ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.setLineDash([]);}}
 }
 ctx.globalAlpha=1;ctx.strokeStyle='#b0f0da66';ctx.beginPath();const surface=project({x:0,y:10.88,z:0});for(let i=0;i<=80;i++){const x=p0.x+(p1.x-p0.x)*i/80,y=surface.y+Math.sin(i*.3-t*1.3)*1.5;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();
 if(app.feedMode){ctx.fillStyle='#a0f3d4';ctx.font='12px system-ui';ctx.fillText('Нажмите в воде, чтобы добавить корм',Math.max(16,width/2-125),height-115);}
}
canvas.addEventListener('pointerup',e=>{
 const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
 if(app.feedMode){const p=projection();app.model.addFood({x:(x-p.cx)/p.scale,y:clamp((p.base-y)/p.scale,.5,10.5),z:2});app.feedMode=false;$('feed').classList.remove('active');$('feedHint').style.display='none';return;}
 let chosen=null,best=Infinity;for(const a of app.model.agents){const p=project(a.p),d=Math.hypot(p.x-x,p.y-y);if(d<Math.max(14,app.model.length(a)*p.s*.6)&&d<best){chosen=a;best=d;}}if(chosen)select(chosen.id);
});
function on(id,event,fn){$(id).addEventListener(event,fn);}
on('ecoOpen','click',()=>{const open=$('ecoPanel').classList.toggle('open');$('ecoOpen').setAttribute('aria-expanded',String(open));$('settings').classList.remove('open');$('settingsBtn').setAttribute('aria-expanded','false');updateUI();});
on('ecoClose','click',()=>{$('ecoPanel').classList.remove('open');$('ecoOpen').setAttribute('aria-expanded','false');});
on('ecoPause','click',()=>{app.paused=!app.paused;app.acc=0;$('ecoPause').textContent=app.paused?'▶ Продолжить':'Ⅱ Пауза';$('ecoPause').setAttribute('aria-pressed',String(app.paused));updateUI();});
on('ecoSpeed','change',e=>{app.speed=[1,2,4].includes(+e.target.value)?+e.target.value:1;});
on('ecoCycle','change',e=>{app.model.autoCycle=e.target.checked;});
on('ecoRender','change',e=>{if(e.target.value==='flat')setFlat();else if(app.adapter){app.flat=false;document.body.classList.remove('flat-mode');app.adapter.setVisible?.(true);}else{setFlat();notify('3D ещё не загружено. Работает офлайн-режим.');}});
on('ecoSave','click',()=>{save(true);updateUI();});
on('ecoExport','click',()=>{app.model.assert();const blob=new Blob([JSON.stringify(app.model.snapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nacre-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
on('ecoImport','click',()=>$('ecoImportFile').click());
on('ecoImportFile','change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>1000000)throw Error('Файл больше 1 МБ');const next=Ecosystem.restore(await file.text());if(confirm('Заменить текущий биотоп состоянием из файла?')){setModel(next);notify('Сохранение импортировано.');}}catch(err){notify('Импорт отклонён: '+err.message);}finally{e.target.value='';}});
on('ecoReset','click',()=>{if(confirm('Начать новый биотоп? Текущее состояние будет заменено.')){setModel(new Ecosystem({limit:matchMedia('(max-width:700px)').matches?64:96,seed:Date.now()>>>0}));notify('Новый биотоп создан.');}});
on('settingsBtn','click',()=>{const open=$('settings').classList.toggle('open');$('settingsBtn').setAttribute('aria-expanded',String(open));$('ecoPanel').classList.remove('open');$('ecoOpen').setAttribute('aria-expanded','false');});
on('feed','click',()=>{app.feedMode=!app.feedMode;$('feed').classList.toggle('active',app.feedMode);$('feedHint').style.display=app.feedMode?'block':'none';});
on('night','click',()=>{const m=app.model;m.autoCycle=false;m.manualLight=m.light()<.5?1:.12;$('ecoCycle').checked=false;});
on('current','click',()=>{app.model.current=!app.model.current;$('current').classList.toggle('active',app.model.current);});
on('jump','click',()=>{if(!app.model.requestJump(app.selected))notify('Сейчас нет готовой к прыжку рыбы.');});
on('closeCard','click',()=>{app.selected=null;$('card').classList.remove('open');app.adapter?.closeSelection?.();});
on('dismissIntro','click',()=>{$('intro').style.display='none';try{localStorage.setItem('nacre-intro-v6','1');}catch(_){}});
try{if(localStorage.getItem('nacre-intro-v6'))$('intro').style.display='none';}catch(_){}
on('quiet','click',()=>{document.body.classList.toggle('quiet');$('settings').classList.remove('open');$('settingsBtn').setAttribute('aria-expanded','false');$('quiet').setAttribute('aria-pressed',String(document.body.classList.contains('quiet')));});
for(const [panel,main] of [['bioPanel','bio'],['currentPanel','current'],['autoPanel','auto'],['soundPanel','sound']])on(panel,'click',()=>$(main).click());
window.addEventListener('keydown',e=>{if(e.repeat||['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)||document.activeElement.isContentEditable)return;const key=e.key.toLowerCase();if(key==='f')$('feed').click();else if(key==='n')$('night').click();else if(key==='j')$('jump').click();else if(key===' '){e.preventDefault();$('ecoPause').click();}else if(key==='h')app.adapter?.home?.();else if(key==='escape'){app.feedMode=false;$('feed').classList.remove('active');$('feedHint').style.display='none';$('ecoPanel').classList.remove('open');$('ecoOpen').setAttribute('aria-expanded','false');$('settings').classList.remove('open');$('settingsBtn').setAttribute('aria-expanded','false');$('closeCard').click();document.body.classList.remove('quiet');}});
document.addEventListener('visibilitychange',()=>{last=0;app.acc=0;if(document.hidden)save();app.adapter?.visibility?.(document.hidden);});
window.addEventListener('pagehide',e=>{save();if(!e.persisted){disposed=true;cancelAnimationFrame(app.raf);clearTimeout(notificationTimer);app.adapter?.dispose?.();}});
window.addEventListener('pageshow',e=>{if(e.persisted){last=0;app.acc=0;}});
function tick(now){
 if(disposed)return;app.raf=requestAnimationFrame(tick);if(document.hidden){last=0;return;}
 const raw=last?(now-last)/1000:0;last=now;const real=Math.min(raw,.12);app.fps+=(1/Math.max(raw,.001)-app.fps)*.025;
 if(!app.paused){app.acc+=real*app.speed;const max=STEP*12;if(app.acc>max){app.dropped+=app.acc-max;app.acc=max;}
  let steps=0;while(app.acc+1e-10>=STEP&&steps<12){const start=performance.now();try{const events=app.model.step(STEP);app.adapter?.advance?.(STEP,events);sceneEvents.push(...events);}catch(err){app.paused=true;app.acc=0;console.error(err);notify('Симуляция остановлена: '+err.message);break;}app.simMs+=(performance.now()-start-app.simMs)*.05;app.acc-=STEP;steps++;}
 }
 if(app.flat)flatDraw();else app.adapter?.render?.(real);
 uiDebt+=real;if(uiDebt>.5){uiDebt=0;updateUI();}saveDebt+=real;if(saveDebt>15){saveDebt=0;save();}sceneEvents.length=0;
}
SPEC.forEach(sp=>{const el=makeText('span','● '+sp.name.split(' ')[0]);el.style.color=sp.color;$('ecoLegend').append(el);});
$('ecoCycle').checked=app.model.autoCycle;updateUI();
window.NACRE={version:'6.0',audit:()=>({...app.model.summary(),activeFish:app.model.agents.length,capacity:app.model.limit,renderer:app.flat?'2d':'3d',paused:app.paused,speed:app.speed,contacts:app.model.contacts,matterBalanced:Math.abs(app.model.summary().massError)<1e-6,droppedTime:app.dropped}),snapshot:()=>app.model.snapshot(),validate:()=>app.model.assert()};
const flatRequested=new URLSearchParams(location.search).get('renderer')==='2d';if(flatRequested)setFlat();else setTimeout(()=>{if(!app.adapter&&!app.flat)setFlat('CDN не отвечает: включена офлайн-визуализация.');},6500);
app.raf=requestAnimationFrame(tick);if(restoreError)notify(restoreError);
})();
