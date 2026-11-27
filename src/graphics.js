import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createVehicle } from '../models/vehicle.js';
import { DrivingCamera } from './camera.js';
import { createWorld, routePoint, groundHeight, roadLengths } from './world.js';
import { createSoftwareView } from './software-view.js';
import { DriveEffects } from './postfx.js';

const skyVertex='varying vec3 ray; void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
const skyFragment=`varying vec3 ray;uniform float night;uniform float clock;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.545);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
void main(){vec3 d=normalize(ray);float h=max(0.,d.y);vec3 day=mix(vec3(.83,.84,.76),vec3(.12,.44,.73),pow(h,.44));
vec2 uv=d.xz/max(.08,d.y)*2.6+clock*.006;float clouds=noise(uv)*.54+noise(uv*2.1)*.29+noise(uv*4.7)*.17;day=mix(day,vec3(.97,.94,.84),smoothstep(.56,.73,clouds)*.53*smoothstep(.02,.17,h));
float sun=max(0.,dot(d,normalize(vec3(-.44,.49,-.74))));day+=vec3(1.,.75,.41)*(pow(sun,35.)*.29+smoothstep(.9990,.9998,sun));
vec3 dusk=mix(vec3(.16,.17,.23),vec3(.012,.024,.061),pow(h,.55));float star=step(.998,hash(floor(d.xz/max(.1,h)*380.)))*smoothstep(.1,.5,h);gl_FragColor=vec4(mix(day,dusk+star*.65,night),1.);}`;
function trafficCar(color){
 const g=new THREE.Group();const mat=(c,m=0)=>new THREE.MeshStandardMaterial({color:c,metalness:m,roughness:.42});
 const body=mat(color,.35),glass=mat(0x23303a,.55),tire=mat(0x161a1c),rim=mat(0xa9acad,.65);
 function box(w,h,d,x,y,z,m){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);g.add(mesh);return mesh;}
 box(1.85,.60,4.15,0,.52,0,body);box(1.55,.54,2.1,0,1.05,.14,glass);box(1.46,.10,1.64,0,1.34,.16,body);
 for(const x of [-.91,.91])for(const z of [-1.27,1.27]){
  const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.17,12),tire);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.34,z);g.add(wheel);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.21,.21,.18,10),rim);hub.rotation.z=Math.PI/2;hub.position.copy(wheel.position);g.add(hub);
 }
 const red=new THREE.MeshBasicMaterial({color:0xff4329}),white=new THREE.MeshBasicMaterial({color:0xffeac5});
 for(const x of [-.68,.68]){box(.37,.12,.05,x,.68,2.09,red);box(.4,.13,.05,x,.68,-2.09,white);}
 return g;
}
function place(obj,point,offset=0){obj.position.set(point.x+Math.cos(point.heading)*offset,groundHeight(point.x,point.z)+.08,point.z-Math.sin(point.heading)*offset);obj.rotation.y=point.heading;}
function gate(){
 const g=new THREE.Group(),m=new THREE.MeshBasicMaterial({color:0xff873d,transparent:true,opacity:.7,depthWrite:false});
 for(const x of [-8,8]){const pole=new THREE.Mesh(new THREE.BoxGeometry(.18,7,.22),m);pole.position.set(x,3.5,0);g.add(pole);}
 const lintel=new THREE.Mesh(new THREE.BoxGeometry(16,.19,.22),m);lintel.position.y=7;g.add(lintel);
 const diamond=new THREE.Mesh(new THREE.OctahedronGeometry(.85),new THREE.MeshBasicMaterial({color:0xffa14c,wireframe:true}));diamond.position.y=8.7;g.add(diamond);
 return g;
}
function exhaust(scene){
 const count=100,positions=new Float32Array(count*3),colors=new Float32Array(count*3),particles=Array.from({length:count},()=>({ttl:0,x:0,y:-100,z:0,vx:0,vz:0,vy:0,kind:0}));
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
 const mat=new THREE.PointsMaterial({size:.26,vertexColors:true,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending});const points=new THREE.Points(geo,mat);points.frustumCulled=false;scene.add(points);let idx=0,carry=0;
 return(p,dt)=>{carry+=dt*(p.boosting?88:p.drift?40:0);while(carry>=1){carry--;const a=particles[idx++%count],s=Math.sin(p.heading),c=Math.cos(p.heading),side=(Math.random()-.5)*(p.drift?1.8:.4);Object.assign(a,{x:p.x+s*2+c*side,y:p.y+.35,z:p.z+c*2-s*side,vx:s*3+Math.random()-.5,vz:c*3+Math.random()-.5,vy:Math.random()*1.1,ttl:.2+Math.random()*.4,kind:p.boostStage});}
 for(let i=0;i<count;i++){const a=particles[i];a.ttl-=dt;a.x+=a.vx*dt;a.y+=a.vy*dt;a.z+=a.vz*dt;positions.set([a.x,a.ttl>0?a.y:-500,a.z],i*3);colors.set(a.kind===0?[.22,.22,.22]:a.kind===3?[.72,.32,1]:[1,.48,.10],i*3);}
 geo.attributes.position.needsUpdate=true;geo.attributes.color.needsUpdate=true;};
}
export class RaceGraphics {
 constructor(container,look,profile,activities) {
  this.container=container;this.scene=new THREE.Scene();this.profile=profile;this.time=0;this.itemMeshes=new Map();
  const s=this.scene;this.world=createWorld(s);this.activities=activities;
  this.canvas=document.createElement('canvas');container.append(this.canvas);
  try{const options={antialias:profile.settings.quality!=='Low',powerPreference:'high-performance'};const context=this.canvas.getContext('webgl2',options);if(!context)throw new Error('WebGL2 unavailable');this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,context,...options});}catch{
   this.canvas.remove();this.canvas=document.createElement('canvas');container.append(this.canvas);this.software=createSoftwareView(this.canvas,look,this.world.group);
  }
  this.camera=new THREE.PerspectiveCamera(60,1,.13,4600);this.controller=new DrivingCamera(this.camera);
  if(this.renderer){
   const r=this.renderer;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1.05;
   const env=new RoomEnvironment(), pm=new THREE.PMREMGenerator(r);this.envTarget=pm.fromScene(env,.04);s.environment=this.envTarget.texture;s.environmentIntensity=.67;env.dispose();pm.dispose();
   s.fog=new THREE.FogExp2(0xcad2cc,.0011);
   this.sky=new THREE.Mesh(new THREE.SphereGeometry(3300,34,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader:skyVertex,fragmentShader:skyFragment,uniforms:{night:{value:0},clock:{value:0}}}));s.add(this.sky);
   this.hemi=new THREE.HemisphereLight(0xe3f1ff,0xb49f86,1.9);s.add(this.hemi);
   this.sun=new THREE.DirectionalLight(0xffe5bb,2.7);s.add(this.sun,this.sun.target);
   this.car=createVehicle(look);s.add(this.car.group);this.fx=exhaust(s);
   const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;const c=shadowCanvas.getContext('2d'),grad=c.createRadialGradient(32,32,5,32,32,32);grad.addColorStop(0,'rgba(0,0,0,.85)');grad.addColorStop(1,'transparent');c.fillStyle=grad;c.fillRect(0,0,64,64);
   this.shadowTexture=new THREE.CanvasTexture(shadowCanvas);this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(3.4,5.8),new THREE.MeshBasicMaterial({map:this.shadowTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3}));this.shadow.rotation.x=-Math.PI/2;s.add(this.shadow);
  }
  this.traffic=Array.from({length:18},(_,i)=>{const mesh=trafficCar([0x655a48,0x758995,0xb6b8a7,0x842e26,0x225961][i%5]);s.add(mesh);
   const road=i<9?0:i<12?1:i<15?2:i-12;return{mesh,road,dist:roadLengths[road]*((i*.181+.13)%1),speed:9+i%6*2};});
  this.rival=trafficCar(0xb83228);this.interceptor=trafficCar(0x222b37);
  const lightbar=new THREE.Mesh(new THREE.BoxGeometry(.95,.13,.28),new THREE.MeshBasicMaterial({color:0x338aff}));lightbar.position.y=1.48;this.interceptor.add(lightbar);this.lightbar=lightbar;
  s.add(this.rival,this.interceptor);this.rival.visible=this.interceptor.visible=false;
  this.gate=gate();s.add(this.gate);this.gate.visible=false;
  this.parts=Array.from({length:7},(_,i)=>{const point=routePoint(i%3,215+i*197);const mesh=new THREE.Mesh(new THREE.TorusKnotGeometry(.48,.14,48,8),new THREE.MeshStandardMaterial({color:0xfcb34c,emissive:0x9d4c13,metalness:.65}));place(mesh,point,i%2?7:-7);mesh.position.y+=1.3;s.add(mesh);mesh.visible=!profile.parts.includes(i);return {id:i,mesh};});
  this.beacons=activities.map(e=>{const b=new THREE.Mesh(new THREE.OctahedronGeometry(1.45),new THREE.MeshBasicMaterial({color:e.color||0xff932f,wireframe:true}));const point=routePoint(e.road,e.start??e.startRatio*roadLengths[e.road]);place(b,point);b.position.y+=5;s.add(b);return b;});
  this.fallbackTraffic=[...this.traffic,{mesh:this.rival},{mesh:this.interceptor}];
  this.size=new ResizeObserver(()=>this.resize());this.size.observe(container);this.resize();
 }
 resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();if(this.renderer){this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.profile.settings.quality==='High'?1.75:this.profile.settings.quality==='Low'?.85:1.2));this.renderer.setSize(w,h,false);if(this.profile.settings.quality==='High'){this.effects??=new DriveEffects(this.renderer,this.scene,this.camera);this.effects.resize(w,h);}else if(this.effects){this.effects.dispose();this.effects=null;}}else{const q=Math.min(1,(this.profile.settings.quality==='High'?1200:920)/w);this.canvas.width=Math.round(w*q);this.canvas.height=Math.round(h*q);}}
 resetEncounter(p){this.interceptor.position.set(p.x+Math.sin(p.heading)*50,p.y,p.z+Math.cos(p.heading)*50);this.controller.snap=true;}
 advance(dt,p,mission,start,waypoint,onCollect){
  this.time+=dt;const t=this.time;
  let hit=false;for(const a of this.traffic){a.dist+=dt*a.speed;const pos=routePoint(a.road,a.dist);place(a.mesh,pos,3.1);if(Math.hypot(a.mesh.position.x-p.x,a.mesh.position.z-p.z)<2.45 && Math.abs(a.mesh.position.y-p.y)<2)hit=true;}
  this.rival.visible=mission?.event.id==='canyon';if(this.rival.visible)place(this.rival,routePoint(1,start+mission.rival),-2.5);
  this.interceptor.visible=mission?.event.id==='city';let pursuit=Infinity;
  if(this.interceptor.visible){const v=this.interceptor.position,dx=p.x-v.x,dz=p.z-v.z; pursuit=Math.hypot(dx,dz);if(mission.status==='running'&&pursuit>2){const amount=Math.min(pursuit-2,(18+Math.min(17,mission.elapsed*.3))*dt);v.x+=dx/pursuit*amount;v.z+=dz/pursuit*amount;}v.y=groundHeight(v.x,v.z)+.1;this.interceptor.rotation.y=Math.atan2(-dx,-dz);this.lightbar.material.color.setHex(Math.floor(t*5)%2?0xfb3c34:0x388bff);}
  this.gate.visible=Boolean(waypoint);if(waypoint){place(this.gate,waypoint);this.gate.children[3].rotation.y=t;}
  this.beacons.forEach(b=>{b.visible=!mission;b.rotation.y=t*.65;});
  for(const part of this.parts){const m=part.mesh;if(!m.visible)continue;m.rotation.set(t*.4,t,.3);if(Math.hypot(p.x-m.position.x,p.z-m.position.z)<3.8){m.visible=false;onCollect(part.id);}}
  return {hit,pursuit};
 }
 render(dt,p,night,waypoint,mission){
  const t=this.time;this.world.update(t,night,p);
  if(!this.renderer){this.software.render(p,this.controller.index,t,night,waypoint,this.fallbackTraffic,mission,[...this.parts,...this.beacons]);return;}
  const s=this.scene;this.sky.position.set(p.x,p.y,p.z);this.sky.material.uniforms.night.value=night;this.sky.material.uniforms.clock.value=t;
  this.hemi.intensity=1.9-night*1.43;this.sun.intensity=2.7-night*2.5;this.sun.position.set(p.x-100,p.y+130,p.z-145);this.sun.target.position.set(p.x,p.y,p.z);
  s.fog.color.setRGB(.58-night*.52,.65-night*.58,.65-night*.53);s.environmentIntensity=.67-night*.38;
  this.car.group.position.set(p.x,p.y+.06,p.z);this.car.group.rotation.order='YXZ';this.car.group.rotation.set(p.pitch,p.heading,p.roll,'YXZ');this.car.group.visible=![1,2].includes(this.controller.index);
  this.car.update(p,dt);this.shadow.rotation.z=p.heading;this.shadow.position.set(p.x,this.world.surface(p.x,p.z).height+.075,p.z);this.shadow.visible=this.car.group.visible;
  this.fx(p,dt);this.controller.update(p,dt,t,this.world.surface);
  if(mission?.status==='intro'){const a=p.heading+.5+mission.intro*.6;this.camera.position.set(p.x+Math.sin(a)*6,p.y+1.8+mission.intro*.25,p.z+Math.cos(a)*6);this.camera.lookAt(p.x,p.y+.75,p.z);this.car.group.visible=true;this.controller.snap=true;}
  if(this.effects)this.effects.render(p,night);else this.renderer.render(s,this.camera);
 }
 dispose(){this.size.disconnect();this.software?.dispose();this.effects?.dispose();this.car?.dispose();this.world.dispose?.();const mats=new Set(),geos=new Set();this.scene.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());this.shadowTexture?.dispose();this.envTarget?.dispose();this.renderer?.dispose();this.renderer?.forceContextLoss();this.canvas.remove();}
}
