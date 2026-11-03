/* Peace 4 detail and animation. Applied before initial fish creation. */
const peaceDetailAssets=[];
for(let si=0;si<fishAssets.length;si++){
 const asset=fishAssets[si],s=species[si],old=asset.bodyMat;
 asset.body.dispose();asset.lowBody.dispose();asset.body=bodyGeometry(s,64,40);asset.lowBody=bodyGeometry(s,36,24);
 const mat=new THREE.MeshPhysicalMaterial({color:old.color.clone(),roughness:.48,metalness:.045,emissive:old.emissive.clone(),emissiveIntensity:.015,clearcoat:.28,clearcoatRoughness:.30,ior:1.37,envMapIntensity:.65,side:THREE.FrontSide,transparent:false,depthWrite:true});
 const compile=old.onBeforeCompile;mat.customProgramCacheKey=()=>`peace4-skin-${si}`;
 mat.onBeforeCompile=function(sh,r){compile.call(this,sh,r);const marker='#include <color_fragment>';if(!sh.fragmentShader.includes(marker))throw Error('Peace skin anchor missing');
  sh.fragmentShader=sh.fragmentShader.replace(marker,`${marker}
  vec2 cell=fishUV*vec2(82.,38.);cell.x+=mod(floor(cell.y),2.)*.5;
  vec2 q=fract(cell)-.5;float edge=length(q*vec2(.85,1.1));float aa=max(fwidth(edge),.009);
  float rim=smoothstep(.33-aa,.33+aa,edge);float belly=pow(max(0.,-cos(fishUV.y*6.2831853)),2.);
  diffuseColor.rgb*=.94+.075*(1.-rim);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.73,.75,.67),belly*.13);
  `);
 };asset.bodyMat=mat;old.dispose();asset.finMat.metalness=.035;asset.finMat.roughness=.50;
 const gills=[],material=new THREE.MeshStandardMaterial({color:s.stripe,roughness:.64,metalness:.02});
 for(const side of [-1,1]){const points=[];for(let j=0;j<=12;j++){const y=s.H*(-.55+j/12*1.1),x=s.L*(.19+.035*Math.sin(j/12*Math.PI)),pr=bodyAtX(x,s),z=side*(s.W*pr*Math.sqrt(Math.max(.05,1-(y/(s.H*pr))**2))+.002*s.L);points.push(new THREE.Vector3(x,y,z));}
  gills.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,Math.max(.0015,s.L*.0018),6,false));
 }peaceDetailAssets.push({gills,material});
}
for(const mat of [socketMat,pupilMat]){mat.transparent=false;mat.depthTest=true;mat.depthWrite=true;}
updateLOD=function(){for(const f of fish){const d=Math.max(1,f.p.distanceTo(camera.position)),pixels=f.s.L*f.scale*innerHeight/(2*Math.tan(camera.fov*Math.PI/360)*d),low=state.low&&pixels<20&&state.selected!==f;
 f.bodyMesh.geometry=low?f.lowGeo:f.highGeo;for(const o of f.detailMeshes)o.visible=true;f.jaw.visible=true;f.root.visible=true;
}};
const peaceOldAnatomy=updateAnatomy;
updateAnatomy=function(dt){peaceOldAnatomy(dt);for(const f of fish){if(!f.active||!f.eco)continue;
 const a=f.eco,m=a.peaceMotion,s=f.s,speed=Math.hypot(a.v.x,a.v.y,a.v.z),ratio=clamp(speed/Math.max(.2,s.speed,s.L*.48),0,2);
 if(!f.peaceDetail){const asset=peaceDetailAssets[f.si];f.peaceDetail=new THREE.Group();for(const g of asset.gills){const o=new THREE.Mesh(g,asset.material);o.userData.hit=f;f.peaceDetail.add(o);}f.root.add(f.peaceDetail);}
 f.peacePhase??=f.swimPhase;f.peacePhase+=dt*TAU*clamp(.45+speed/Math.max(.35,s.L*.95),.5,3);f.swimPhase=f.peacePhase;
 const coasting=m?.mode==='glide',amp=clamp(.13+ratio*(coasting?.17:.42),.12,.88);f.peaceAmplitude??=amp;f.peaceAmplitude+=(amp-f.peaceAmplitude)*(1-Math.exp(-dt*5));f.swimAmplitude=f.peaceAmplitude;f.turnBend=clamp((m?.turn||0)*.8,-.8,.8);
 const u=.02/.93;f.tail.position.z=motionOffset(s,u,f.swimPhase,f.swimAmplitude,f.turnBend);f.tail.rotation.y=-Math.atan(motionSlope(s,u,f.swimPhase,f.swimAmplitude,f.turnBend));
 for(const p of f.pectorals){p.pivot.position.z=p.side*s.W*.89+motionOffset(s,(.13+.5)/.93,f.swimPhase,f.swimAmplitude,f.turnBend);p.pivot.rotation.x=p.side*(Math.PI/2-.14+Math.sin(f.swimPhase*.53+p.side*.25)*(.06+.12*(1-clamp(ratio,0,1))));p.pivot.rotation.y=p.side*Math.sin(f.swimPhase*.35)*.045;}
 f.root.quaternion.copy(f.q);f.root.rotateX(clamp(-(m?.turn||0)*.09,-.13,.13));writeMotion(f.bodyMesh.geometry,f);writeMotion(f.staticFinGeo,f);
}};
window.NacreReview={version:'Peace 4',focus(id){const f=fish.find(f=>f.id===id);if(!f)throw Error('Fish not found');const direction=camera.position.clone().sub(controls.target).normalize();camera.position.copy(f.p).addScaledVector(direction,Math.max(1.2,f.s.L*f.scale*2.6));controls.target.copy(f.p);controls.minDistance=.9;cameraTween=null;state.following=false;controls.update();updateLOD();return true;},details(){return fish.map(f=>({id:f.id,vertices:f.highGeo.attributes.position.count,eyesVisible:f.detailMeshes.every(o=>o.visible),geometry:f.bodyMesh.geometry===f.highGeo?'high':'medium'}));}};
window.addEventListener('pagehide',()=>{for(const a of peaceDetailAssets){a.gills.forEach(g=>g.dispose());a.material.dispose();}},{once:true});
