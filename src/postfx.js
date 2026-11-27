import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {SSRPass} from 'three/addons/postprocessing/SSRPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

// High quality reflects the local scene into the road, then integrates sun
// scattering through the depth buffer. Other quality levels use the material shader.
export class DriveEffects {
 constructor(renderer,scene,camera){
  this.renderer=renderer;this.camera=camera;this.composer=new EffectComposer(renderer);this.sun=new THREE.Vector3();
  const road=scene.getObjectByName('Wet asphalt');
  this.ssr=new SSRPass({renderer,scene,camera,width:320,height:180,selects:road?[road]:null});
  this.ssr.resolutionScale=.45;this.ssr.opacity=.27;this.ssr.maxDistance=55;this.ssr.thickness=.65;
  this.composer.addPass(this.ssr);
  this.air=new ShaderPass({uniforms:{tDiffuse:{value:null},depthTex:{value:null},sunUv:{value:new THREE.Vector2()},light:{value:0},speed:{value:0},clipRange:{value:new THREE.Vector2(camera.near,camera.far)}},
   vertexShader:'varying vec2 uv0; void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`uniform sampler2D tDiffuse,depthTex;uniform vec2 sunUv,clipRange;uniform float light,speed;varying vec2 uv0;
   void main(){vec2 motion=(uv0-vec2(.5,.52))*speed*.028;vec3 col=vec3(0.);for(int i=0;i<5;i++){col+=texture2D(tDiffuse,uv0-motion*float(i)*.25).rgb*.2;}
   float raw=texture2D(depthTex,uv0).r;float depth=clipRange.x*clipRange.y/(clipRange.y-raw*(clipRange.y-clipRange.x));float air=1.-exp(-min(1500.,depth)*.0008);
   vec2 toward=sunUv-uv0;float trans=0.;for(int i=1;i<=10;i++){float z=texture2D(depthTex,clamp(uv0+toward*.065*float(i),0.,1.)).r;trans+=smoothstep(.99967,1.,z)*.1;}
   col+=vec3(1.,.72,.43)*trans*air*exp(-5.*length(toward))*.20*light;gl_FragColor=vec4(col,1.);}`});
  this.air.uniforms.depthTex.value=this.ssr.beautyRenderTarget.depthTexture;this.composer.addPass(this.air);this.output=new OutputPass();this.composer.addPass(this.output);
 }
 resize(w,h){this.composer.setPixelRatio(this.renderer.getPixelRatio());this.composer.setSize(w,h);}
 render(driver,night){
  this.sun.set(-.44,.49,-.74).multiplyScalar(1200).add(this.camera.position).project(this.camera);
  this.air.uniforms.sunUv.value.set(this.sun.x*.5+.5,this.sun.y*.5+.5);
  this.air.uniforms.light.value=this.sun.z<1&&this.sun.z>0?1-night:0;
  this.air.uniforms.speed.value=Math.min(1,Math.max(0,(Math.abs(driver.speed)-40)/70)+driver.boostStage*.14);
  this.composer.render();
 }
 dispose(){this.ssr.dispose();this.air.dispose();this.output.dispose();this.composer.dispose();}
}
