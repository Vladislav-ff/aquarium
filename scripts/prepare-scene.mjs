// One controller and one visual upgrade; no accumulated behavior wrappers.
export function prepare({html,core,app,motion,visual}){
 const read=id=>{const r=new RegExp('<script\\b[^>]*\\bid="'+id+'"[^>]*>([\\s\\S]*?)</script\\s*>'),m=html.match(r);if(!m)throw Error('Missing '+id);return m[1];};
 const set=(id,value)=>{const r=new RegExp('(<script\\b[^>]*\\bid="'+id+'"[^>]*>)[\\s\\S]*?(</script\\s*>)');if(!r.test(html))throw Error('Missing '+id);html=html.replace(r,(_,a,b)=>a+'\n'+value+'\n'+b);};
 core??=read('ecology-core');app??=read('ecology-app');
 set('ecology-core',core+'\n'+motion);
 app=app.replaceAll('nacre-ecosystem-v6','nacre-ecosystem-v6-peace-4');
 app=app.replace("$('ecoBirths').textContent=s.births+' / '+s.eaten;","$('ecoBirths').textContent=String(s.births);");
 app=app.replace('Всеядный охотник. Размер пасти ограничивает доступную добычу.','Крупный мирный обитатель. Питается планктоном и кормом.').replace('Узкотелый хищник. Молодь питается планктоном.','Узкотелый мирный обитатель. Питается планктоном и кормом.');
 set('ecology-app',app);
 let scene=read('scene-source');const anchor='syncScene();applyQuality();visualStep(0,[]);controls.update();renderer.compile(scene,camera);';
 if(scene.split(anchor).length!==2)throw Error('Scene startup anchor changed');
 scene=scene.replace('new THREE.Vector3(25,18,32)','new THREE.Vector3(18,12,24)').replace('homePos.multiplyScalar(1.55)','homePos.multiplyScalar(1.15)');
 scene=scene.replace('low?1:mobile?1.35:1.6','low?1:mobile?1.5:2');
 // The inherited fish shader already declares belly in main().
 visual=visual.replace('float belly=pow','float peaceBelly=pow').replace('belly*.13','peaceBelly*.13');
 set('scene-source',scene.replace(anchor,visual+'\n'+anchor));
 html=html.replace('NACRE VI — Автономная экосистема','NACRE — Peace 4').replace('РОЖДЕНИЯ / ОХОТА','РОЖДЕНИЯ');
 html=html.replace('Это автономная пищевая сеть: рыбы охотятся, растут и размножаются.','Мирный биотоп: рыбы плавают, питаются, растут и размножаются.');
 html=html.replace('Мальки защищены только в зоне укрытия; выйдя из неё, они становятся доступны хищникам. Размер добычи ограничен длиной и толщиной тела.','Мальки растут в укрытиях. Рыбы не поедают друг друга.');
 return html;
}
