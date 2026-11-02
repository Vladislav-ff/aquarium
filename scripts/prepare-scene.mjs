// Shared transform: root-page bootstrap and Actions build use exactly the same code.
export function prepare({html,core,app,motion,visual,behavior}){
 const once=(s,from,to)=>{if(s.split(from).length!==2)throw Error('Source anchor changed: '+from.slice(0,70));return s.replace(from,to);};
 const script=(text,id,content)=>{const re=new RegExp('(<script\\b[^>]*\\bid="'+id+'"[^>]*>)[\\s\\S]*?(</script\\s*>)');if(!re.test(text))throw Error('Missing '+id);return text.replace(re,(_,a,b)=>a+'\n'+content+'\n'+b);};
 const read=id=>{const re=new RegExp('<script\\b[^>]*\\bid="'+id+'"[^>]*>([\\s\\S]*?)</script\\s*>');const m=html.match(re);if(!m)throw Error('Missing '+id);return m[1];};
 core??=read('ecology-core');app??=read('ecology-app');
 motion=once(motion,'const small=this.limit<=64;this.limit=small?13:20;','this.limit=12;');
 motion=once(motion,'(small?[2,2,2,2]:[4,2,2,2])','([4,2,2,2])');
 motion=once(motion,'[13,20].includes(cap)','[12].includes(cap)');
 motion=once(motion,"else if(a.intent==='flee'&&target?.alive)goal=", "else if(a.intent==='flee'&&target?.alive)goal=a.behavior?.escapeGoal??");
 motion=once(motion,'const gait=.76+', 'const gait=(a.behavior?.pace??1)*(.76+');
 motion=once(motion,'Math.sin(m.phase*2+.6);let speed=', 'Math.sin(m.phase*2+.6));let speed=');
 motion=once(motion,"(active?(a.intent==='hunt'?2.1:1.9):gait)","(active?(a.intent==='hunt'?2.1:(this.time<(a.behavior?.burstUntil??0)?3.8:2.6)*(.65+.35*a.stamina)):gait)");
 motion=once(motion,'dt*(active?2.4:1.05)',"dt*(a.intent==='flee'?8:active?2.8:1.25)");
 motion=once(motion,'acc=active?3.8:1.25',"acc=a.intent==='flee'?12:active?4.5:1.6");
 motion=once(motion,'jerk=active?10:3.5',"jerk=a.intent==='flee'?80:active?14:4.5");
 motion=once(motion,'maximum=sp.speed*(active?2.35:1.25)',"maximum=sp.speed*(a.intent==='flee'?4.5:active?2.35:2)");
 core=core.replace('if(a===b||!b.alive||a.jump','if(a===b||!a.alive||!b.alive||a.jump');
 html=script(html,'ecology-core',core+'\n'+motion+'\n'+behavior);
 app=app.replaceAll('nacre-ecosystem-v6','nacre-ecosystem-v6-behavior-3');
 html=script(html,'ecology-app',app);
 const scene=once(read('scene-source'),'syncScene();applyQuality();visualStep(0,[]);controls.update();renderer.compile(scene,camera);',visual+'\nsyncScene();applyQuality();visualStep(0,[]);controls.update();renderer.compile(scene,camera);');
 return script(html,'scene-source',scene).replace('NACRE VI — Автономная экосистема','NACRE — Natural Behavior 3');
}
