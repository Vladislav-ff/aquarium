/* Extend, rather than replace, existing skin, depth and anatomy shaders. */
for(let si=0;si<fishAssets.length;si++){
 const a=fishAssets[si],mat=a.bodyMat,compile=mat.onBeforeCompile;
 mat.metalness=si===0?.24:.10;mat.roughness=.43;mat.customProgramCacheKey=()=>`nacre-natural-skin-${si}`;
 mat.onBeforeCompile=function(sh,renderer){compile.call(this,sh,renderer);const marker='#include <color_fragment>';if(!sh.fragmentShader.includes(marker))throw Error('Natural skin shader anchor missing');
  sh.fragmentShader=sh.fragmentShader.replace(marker,`${marker}
  vec2 scales=fishUV*vec2(68.,30.);scales.x+=mod(floor(scales.y),2.)*.5;
  float edge=length((fract(scales)-.5)*vec2(.85,1.15));float aa=max(fwidth(edge),.012);
  float rim=smoothstep(.34-aa,.34+aa,edge);float underside=pow(max(0.,-cos(fishUV.y*6.2831853)),2.);
  diffuseColor.rgb*=mix(.96,1.025,1.-rim);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.71,.73,.63),underside*.11);
  `);
 };mat.needsUpdate=true;a.finMat.metalness=.06;a.finMat.roughness=.56;
}
for(const m of [socketMat,pupilMat]){m.transparent=false;m.depthTest=true;m.depthWrite=true;}
const naturalOldAnatomy=updateAnatomy;
updateAnatomy=function(dt){naturalOldAnatomy(dt);for(const f of fish){if(!f.active||!f.eco)continue;
 const a=f.eco,velocity=Math.hypot(a.v.x,a.v.y,a.v.z),active=a.intent==='hunt'||a.intent==='flee',ratio=clamp(velocity/Math.max(.1,window.NacreEcology.SPEC[f.si].speed),0,2.2);
 f.naturalPhase??=f.swimPhase;const hz=.35+velocity/Math.max(.25,f.s.L*.85);f.naturalPhase+=dt*Math.PI*2*Math.min(hz,2.5);f.swimPhase=f.naturalPhase;
 const coast=!active&&a.naturalMotion&&Math.sin(a.naturalMotion.phase)<-.15,target=clamp(.10+ratio*(coast?.19:.43),.10,.9);
 f.naturalAmplitude??=f.swimAmplitude;f.naturalAmplitude+=(target-f.naturalAmplitude)*(1-Math.exp(-dt*3));f.swimAmplitude=f.naturalAmplitude;f.turnBend=clamp((a.naturalMotion?.turn||0)*1.5,-.75,.75);
 const u=.02/.93;f.tail.position.z=motionOffset(f.s,u,f.swimPhase,f.swimAmplitude,f.turnBend);f.tail.rotation.y=-Math.atan(motionSlope(f.s,u,f.swimPhase,f.swimAmplitude,f.turnBend));
 for(const fin of f.pectorals){const hold=1-clamp(ratio,0,1);fin.pivot.rotation.x=fin.side*(Math.PI/2-.15+Math.sin(f.swimPhase*.55)*(.05+hold*.16));}
 f.root.quaternion.copy(f.q);f.root.rotateX(clamp(-(a.naturalMotion?.turn||0)*.12,-.12,.12));writeMotion(f.bodyMesh.geometry,f);writeMotion(f.staticFinGeo,f);
}};
