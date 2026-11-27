// All horizontal distances are metres. Heading zero points north (-Z).
import * as THREE from 'three';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
function smooth(a, b, value) {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function curve(anchors, closed, smoothCorners = true) {
  const pts = [];
  const count = anchors.length;
  const get = n => anchors[closed ? (n + count) % count : clamp(n, 0, count - 1)];
  for (let i = 0; i < count - (closed ? 0 : 1); i++) {
    const a = get(i - 1), b = get(i), c = get(i + 1), d = get(i + 2);
    const steps = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 10));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      pts.push([0, 1].map(j => smoothCorners
        ? 0.5 * ((2 * b[j]) + (-a[j] + c[j]) * t + (2*a[j]-5*b[j]+4*c[j]-d[j])*t*t + (-a[j]+3*b[j]-3*c[j]+d[j])*t*t*t)
        : b[j] + (c[j] - b[j]) * t));
    }
  }
  return [...pts, [...(closed ? anchors[0] : anchors[count - 1])]];
}

const coast = [[260,330],[260,180],[260,0],[253,-190],[220,-380],[116,-560],[-90,-630],[-262,-550],[-340,-320],[-315,-110],[-290,160],[-255,380],[-90,530],[110,520],[220,445]];
const canyon = [[-315,-110],[-430,-180],[-535,-355],[-655,-510],[-760,-540],[-730,-390],[-860,-300],[-965,-430],[-1060,-230],[-943,-90],[-835,-50],[-960,85],[-1040,180],[-930,350],[-770,463],[-641,530],[-505,492],[-390,360],[-290,160],[-396,84]];
const harbour = [[116,-560],[193,-699],[240,-793],[252,-932],[165,-1045],[-70,-1050],[-220,-916],[-238,-765],[-90,-630]];
const roadData = [
  ['Coastal Highway', 23, coast, true],
  ['Canyon Pass', 13, canyon, true],
  ['Harbour Loop', 18, harbour, true],
  ['Market Street', 16, [[-325,-380],[-150,-380],[15,-380],[150,-380],[220,-380]], false],
  ['Financial Avenue', 19, [[-325,-190],[-150,-190],[15,-190],[150,-190],[253,-190]], false],
  ['Festival Avenue', 19, [[-303,0],[-150,0],[15,0],[150,0],[260,0]], false],
  ['Boardwalk Boulevard', 16, [[-290,160],[-150,180],[15,180],[150,180],[260,180]], false],
  ['Foundry Street', 13, [[-150,-598],[-150,-380],[-150,-190],[-150,0],[-150,180],[-150,469]], false],
  ['Grand Avenue', 18, [[15,-620],[15,-380],[15,-190],[15,0],[15,180],[15,535]], false],
  ['Promenade', 14, [[150,-506],[150,-380],[150,-190],[150,0],[150,180],[150,495]], false],
  ['Freight Way', 12, [[-229,-819],[-110,-860],[80,-860],[249,-860]], false],
  ['Lookout Drive', 12, [[-862,-310],[-808,-154],[-696,-110],[-603,-185],[-503,-294]], false],
  ['Skyline Expressway', 16, [[-255,380],[-210,362],[-145,310],[-75,222],[-60,125],[-60,-50],[-46,-250],[-14,-429],[55,-516],[116,-560]], false],
];
export const roads = roadData.map(([name,width,anchors,closed],i) => ({name,width,points:curve(anchors,closed,i < 3 || i >= 11)}));
const stations = roads.map(({points}) => {
  let sum = 0;
  return points.map(([x,z],i) => i ? sum += Math.hypot(x-points[i-1][0],z-points[i-1][1]) : 0);
});
export const roadLengths = stations.map(list => list.at(-1));
const expressway=12;
function deckHeight(distance){
  return 9.6*smooth(3,140,Math.min(distance,roadLengths[expressway]-distance));
}
export function routePoint(index, distance) {
  const pts = roads[index].points, sta = stations[index];
  const length = roadLengths[index];
  // Open routes bounce at their ends; closed circuits wrap seamlessly.
  let d = ((distance % length) + length) % length;
  const closed = roadData[index][3];
  let back = false;
  if (!closed) {
    const cycle = ((distance % (2*length)) + 2*length) % (2*length);
    back = cycle >= length; d = back ? 2*length-cycle : cycle;
  }
  let lo = 0, hi = pts.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (sta[mid] <= d) lo = mid; else hi = mid; }
  const [x,z] = pts[lo], dx = pts[lo+1][0]-x, dz = pts[lo+1][1]-z;
  const t = clamp((d-sta[lo])/(sta[lo+1]-sta[lo] || 1),0,1);
  return {x:x+dx*t,z:z+dz*t,heading:Math.atan2(-dx,-dz)+(back ? Math.PI : 0)};
}
export const spawn = routePoint(0, 5);

function coastX(z) {
  return 303 + 8*Math.sin(z*0.005) + 85*smooth(-350,-820,z) + 28*smooth(370,750,z);
}
function shoreDepth(x,z) {
  const excessNorth = Math.max(0,-z-930), excessSouth = Math.max(0,z-650);
  return Math.min(coastX(z)-x-0.0014*(excessNorth*excessNorth+excessSouth*excessSouth),
    x+1240+38*Math.sin(z*0.006), z+1190+54*Math.sin(x*0.0033), 1010-z+40*Math.sin(x*0.004));
}
export function groundHeight(x,z) {
  const inland = shoreDepth(x,z), hill = smooth(270,1070,-x);
  const base = 5.4 + 0.55*Math.sin(x*.0054)*Math.cos(z*.0067);
  const ridges = 105 + 47*Math.sin(z*.0032+x*.001) + 22*Math.sin(z*.0101-x*.0016) + 8*Math.cos(x*.015+z*.0049);
  return -6.5 + (6.5+base+hill*ridges)*smooth(-18,35,inland);
}

const cellSize = 54;
const key = (x,z) => Math.floor(x/cellSize) + ',' + Math.floor(z/cellSize);
const segments = new Map();
function indexBounds(map, minX,maxX,minZ,maxZ,item) {
  for (let x=Math.floor(minX/cellSize); x<=Math.floor(maxX/cellSize); x++)
    for (let z=Math.floor(minZ/cellSize); z<=Math.floor(maxZ/cellSize); z++) {
      const k=x+','+z;
      if (!map.has(k)) map.set(k,[]);
      map.get(k).push(item);
    }
}
roads.forEach(({points,width},road) => {
  const pad=width/2+9;
  for(let i=1;i<points.length;i++) {
    const [x,z]=points[i-1],[bx,bz]=points[i],dx=bx-x,dz=bz-z;
    indexBounds(segments,Math.min(x,bx)-pad,Math.max(x,bx)+pad,Math.min(z,bz)-pad,Math.max(z,bz)+pad,
      {x,z,dx,dz,length2:dx*dx+dz*dz,width,road,station:stations[road][i-1]});
  }
});
const empty = [];
function roadAt(x,z,extra=0,exclude=-1,groundOnly=false) {
  const nearby=segments.get(key(x,z)) || empty;
  for(const s of nearby) {
    if(s.road===exclude || (groundOnly && s.road===expressway && deckHeight(s.station)>1)) continue;
    const u=clamp(((x-s.x)*s.dx+(z-s.z)*s.dz)/s.length2,0,1);
    const dist2=(x-s.x-u*s.dx)**2+(z-s.z-u*s.dz)**2;
    if(dist2 < (s.width/2+extra)**2) return true;
  }
  return false;
}

function stripBuilder() {
  const positions=[], colors=[], indices=[];
  return {
    quad(a,b,c,d,color) {
      const i=positions.length/3;
      positions.push(...a,...b,...c,...d);
      const colorsByPoint = Array.isArray(color) ? color : [color,color,color,color];
      for(const col of colorsByPoint) colors.push(col.r,col.g,col.b);
      indices.push(i,i+2,i+1,i,i+3,i+2);
    },
    finish() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    }
  };
}
function geometricMaterial(extra={}) {
  return new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:0.88,...extra});
}

function makeTerrain(root) {
  const build=stripBuilder(), color=new THREE.Color();
  function point(x,z) { return [x,groundHeight(x,z),z]; }
  function tint(x,z) {
    const d=shoreDepth(x,z), y=groundHeight(x,z);
    const rough=Math.sin(x*.025+z*.032)*0.024+Math.cos(z*.009-x*.016)*0.025;
    const hillside=smooth(20,113,y), urban=x>-342 && z>-652 && z<545 && x<280;
    color.set(urban ? '#777f68' : '#718854');
    color.lerp(new THREE.Color('#b4a57d'),hillside*.89);
    if(!urban&&y>32) color.lerp(new THREE.Color('#94816c'), Math.max(0,Math.sin(z*.034+x*.015))*.23);
    color.lerp(new THREE.Color('#dfc99a'),1-smooth(10,41,d));
    color.offsetHSL(0,0,rough);
    return color.clone();
  }
  // Shared grid rows keep the coast's gentle grade and mountain silhouettes continuous.
  const meshGeo=new THREE.BufferGeometry(), coords=[],rgb=[],ix=[];
  const size=16, nx=115,nz=151;
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const x=-1320+i*size,z=-1290+j*size, p=point(x,z), col=tint(x,z);
    coords.push(...p);rgb.push(col.r,col.g,col.b);
    if(i<nx-1&&j<nz-1){const a=j*nx+i; ix.push(a,a+nx,a+1,a+1,a+nx,a+nx+1);}
  }
  meshGeo.setIndex(ix);meshGeo.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  meshGeo.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));meshGeo.computeVertexNormals();
  root.add(new THREE.Mesh(meshGeo,geometricMaterial()));
  const distant = [new THREE.Color('#827e78'),new THREE.Color('#9ca3a0'),new THREE.Color('#778884')];
  for(let k=0;k<2;k++){
    const zbase = -1700-k*620;
    for(let i=0;i<67;i++) {
      const x=-2950+i*100;
      const mountain=X=>122+Math.sin(X*.0029+k)*105+Math.cos(X*.009+k*3)*36+Math.sin(X*.018)*19;
      const h=mountain(x), n=mountain(x+100);
      build.quad([x,-7,zbase+200],[x+100,-7,zbase+200],[x+100,n,zbase-170],[x,h,zbase-170],distant[(i+k)%3]);
      build.quad([x,h,zbase-170],[x+100,n,zbase-170],[x+100,-10,zbase-410],[x,-10,zbase-410],distant[1]);
    }
  }
  root.add(new THREE.Mesh(build.finish(),geometricMaterial()));
}

function makeOcean(root) {
  const geo=new THREE.PlaneGeometry(14000,14000);
  geo.rotateX(-Math.PI/2);
  const mat=new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {uTime:{value:0},uNight:{value:0}}]),
    fog:true,
    vertexShader:`
      #include <fog_pars_vertex>
      varying vec3 p;
      void main(){
        p=(modelMatrix*vec4(position,1.)).xyz;
        vec4 mvPosition=viewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`
      #include <fog_pars_fragment>
      uniform float uTime,uNight; varying vec3 p;
      float wave(vec2 q){
        return sin(dot(q,vec2(.44,.12))+uTime*1.42)*.38+
        sin(dot(q,vec2(-.19,.52))-uTime*.88)*.29+sin(q.y*1.6+sin(q.x*.26+uTime))*.15;
      }
      void main() {
        vec3 eye=normalize(cameraPosition-p);
        float dist=length(cameraPosition-p);
        float detail=1.-smoothstep(120.,1300.,dist);
        float h=wave(p.xz);
        vec3 n=normalize(vec3((h-wave(p.xz+vec2(.5,0.)))*detail,2.,(h-wave(p.xz+vec2(0.,.5)))*detail));
        float fres=pow(1.-max(dot(n,eye),0.),3.);
        vec3 col=mix(vec3(.035,.37,.39),vec3(.28,.54,.66),fres);
        col+=vec3(.022,.045,.04)*h*detail;
        float sun=pow(max(dot(reflect(-normalize(vec3(.7,.42,.3)),n),eye),0.),78.);
        col+=vec3(1.,.8,.48)*sun*.85;
        col=mix(col,col*vec3(.12,.18,.28),uNight);
        gl_FragColor=vec4(col,1.);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const water=new THREE.Mesh(geo,mat); water.position.y=-.42; root.add(water);
  return (t,n)=>{mat.uniforms.uTime.value=t;mat.uniforms.uNight.value=n;};
}

function routeStrip(builder,p,q,left,right,height,color) {
  function at(s,d){
    const x=s.x+Math.cos(s.heading)*d,z=s.z-Math.sin(s.heading)*d;
    return [x,groundHeight(x,z)+(s.elevation||0)+height,z];
  }
  builder.quad(at(p,left),at(p,right),at(q,right),at(q,left),color);
}
function makeRoads(root){
  const asphalt=stripBuilder(),stone=stripBuilder(),lines=stripBuilder();
  const black=new THREE.Color('#45484a'),sidewalk=new THREE.Color('#b9b6aa'),shoulder=new THREE.Color('#ad9a78');
  const white=new THREE.Color('#dbdad2'),yellow=new THREE.Color('#eeb84e');
  roads.forEach((rd,i)=>{
    const length=roadLengths[i], half=rd.width/2, step=5.2, h=.19+i*.006;
    const endpoint = d => {
      const p=routePoint(i,Math.min(d,length-0.001));
      p.elevation=i===expressway ? deckHeight(d) : 0;
      return p;
    };
    for(let d=0;d<length;d+=step) {
      const p=endpoint(d),q=endpoint(d+step), mid=endpoint(d+step*.5);
      routeStrip(asphalt,p,q,-half,half,h,black);
      if(mid.elevation<1 && roadAt(mid.x,mid.z,1,i,true))continue;
      const walk=i===expressway ? .65 : i===1||i===11 ? 1.3 : 2.6;
      for(const s of [-1,1]) {
        routeStrip(stone,p,q,s*half,s*(half+walk),h+.06,i===1||i===11 ? shoulder:sidewalk);
        routeStrip(lines,p,q,s*(half-.68),s*(half-.51),h+.024,white);
        if(rd.width>=18 && Math.floor(d/step)%3===0) routeStrip(lines,p,q,s*(half*.5-.07),s*(half*.5+.07),h+.03,white);
      }
      routeStrip(lines,p,q,-.21,-.075,h+.03,yellow);
      routeStrip(lines,p,q,.075,.21,h+.03,yellow);
    }
  });
  const roadMat=geometricMaterial({roughness:.56,metalness:.16});
  roadMat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 roadWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nroadWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader='varying vec3 roadWorld;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float rd=length(cameraPosition-roadWorld);
      float grit=fract(sin(dot(floor(roadWorld.xz*14.),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb*=1.+(grit-.5)*.13*(1.-smoothstep(13.,78.,rd));
      float glint=pow(1.-max(normalize(cameraPosition-roadWorld).y,0.),9.);
      float patch=smoothstep(.15,.85,sin(roadWorld.x*.08+sin(roadWorld.z*.07))*.4+.5);
      diffuseColor.rgb+=vec3(.028,.039,.044)*patch*glint;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.13,patch*.85);');
  };
  const roadMesh=new THREE.Mesh(asphalt.finish(),roadMat);roadMesh.name='Wet asphalt';roadMesh.receiveShadow=true;root.add(roadMesh);
  root.add(new THREE.Mesh(stone.finish(),geometricMaterial()));
  root.add(new THREE.Mesh(lines.finish(),geometricMaterial()));
}

function glassMaterial(night) {
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.31,metalness:.23});
  mat.onBeforeCompile=s=>{
    s.uniforms.bayNight=night;
    s.vertexShader='varying vec3 facadePos; varying vec3 facadeNormal; varying vec3 facadeWorld;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 scaleM=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      facadePos=(position+vec3(.5))*scaleM;
      facadeNormal=normal; facadeWorld=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;`);
    s.fragmentShader='varying vec3 facadePos; varying vec3 facadeNormal; varying vec3 facadeWorld; uniform float bayNight;\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 pane=vec2(abs(facadeNormal.x)>.5 ? facadePos.z : facadePos.x,facadePos.y)/vec2(2.45,3.6);
      vec2 grid=abs(fract(pane+.5)-.5);
      vec2 aa=clamp(fwidth(pane),vec2(.009),vec2(.45));
      float glass=smoothstep(.038-aa.x,.038+aa.x,grid.x)*smoothstep(.067-aa.y,.067+aa.y,grid.y);
      float unit=fract(sin(dot(floor(pane),vec2(19.31,12.73)))*741.3);
      float reflected=.5+.5*sin(facadeWorld.x*.012+facadeWorld.z*.017+facadeWorld.y*.027);
      vec3 glazing=diffuseColor.rgb*(.8+unit*.18)+vec3(.05,.09,.12)*reflected;
      float lamp=smoothstep(.76,.83,unit)*bayNight;
      diffuseColor.rgb=mix(diffuseColor.rgb*.47+.028,mix(glazing,vec3(.92,.70,.38),lamp),glass*(1.-abs(facadeNormal.y)));
    `);
    s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
       totalEmissiveRadiance+=vec3(.38,.24,.09)*glass*lamp*(1.-abs(facadeNormal.y));`);
  };
  return mat;
}

const rotation=new THREE.Euler(),quaternion=new THREE.Quaternion(),vPos=new THREE.Vector3(),vScale=new THREE.Vector3();
function transform(x,y,z,sx=1,sy=1,sz=1,ry=0,rx=0,rz=0) {
  rotation.set(rx,ry,rz,'YXZ');
  return new THREE.Matrix4().compose(vPos.set(x,y,z), quaternion.setFromEuler(rotation),vScale.set(sx,sy,sz));
}
function beamMatrix(a,b,r) {
  const up=new THREE.Vector3(0,1,0),end=new THREE.Vector3(...b),start=new THREE.Vector3(...a),dir=end.clone().sub(start);
  return new THREE.Matrix4().compose(start.add(end).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(up,dir.clone().normalize()),new THREE.Vector3(r,dir.length(),r));
}
function makeBatches(root) {
  const batches=[], standard = new THREE.MeshStandardMaterial({roughness:.78});
  function create(geometry,material=standard,cast=false) {
    const items=[];
    const b={mesh:null,items,add(matrix,color=0xffffff) {
      items.push({matrix,color});return items.length-1;
    }};
    batches.push({b,geometry,material,cast});return b;
  }
  function finish() {
    for(const {b,geometry,material,cast} of batches){
      if(!b.items.length){geometry.dispose();continue;}
      const m=new THREE.InstancedMesh(geometry,material,b.items.length);
      const color=new THREE.Color();
      b.items.forEach((o,i)=>{m.setMatrixAt(i,o.matrix);m.setColorAt(i,color.set(o.color));});
      m.castShadow=cast;m.receiveShadow=true;m.computeBoundingSphere();root.add(m);b.mesh=m;b.items.length=0;
    }
  }
  return {create,finish,standard};
}

function palmGeometry() {
  const pos=[],col=[],idx=[],tan=new THREE.Color('#83785b'),bark=new THREE.Color('#9d8a68');
  function vert(x,y,z,c){pos.push(x,y,z);col.push(c.r,c.g,c.b);return pos.length/3-1;}
  const sides=8,rings=11,H=10.8;
  for(let j=0;j<=rings;j++) {
    const t=j/rings,r=.21+.16*(1-t)**3+.027*(j%2);
    for(let k=0;k<sides;k++){const a=k*2*Math.PI/sides;vert(.65*t*t+Math.cos(a)*r,H*t,Math.sin(a)*r,j%2===0?tan:bark);}
    if(j)for(let k=0;k<sides;k++){const i=(j-1)*sides+k,n=(j-1)*sides+(k+1)%sides;idx.push(i,i+sides,n,n,i+sides,n+sides);}
  }
  const rng=randomSource(241), greens=['#476b38','#52703d','#607e46','#456137'].map(c=>new THREE.Color(c));
  for(let f=0;f<12;f++){
    const angle=f*2.39996,L=3.6+rng()*1.6,rise=1.3+rng()*1.2,droop=f%3===0?4.7:3.1;
    const dir=[Math.cos(angle),Math.sin(angle)],side=[-dir[1],dir[0]],leaf=greens[f%4];
    function p(t,w,dy=0){return [.65+dir[0]*L*t+side[0]*w,H+rise*Math.sin(t*Math.PI*.92)-droop*t*t+dy,dir[1]*L*t+side[1]*w];}
    for(let j=0;j<11;j++){
      const t=j/11,end=(j+1)/11;
      const a=vert(...p(t,-.033),leaf),b=vert(...p(t,.033),leaf),c=vert(...p(end,.025),leaf),d=vert(...p(end,-.025),leaf);
      idx.push(a,c,b,a,d,c);
      for(const s of [-1,1]){
        const w=(.15+.65*Math.sin(t*Math.PI))*(1-.32*t);
        const k=vert(...p(t,0),leaf),l=vert(...p(end,.09*s),leaf),outer=vert(...p(Math.min(1,t+.145),w*s,-.24-.26*t),leaf);
        idx.push(k,l,outer);
      }
    }
  }
  const g=new THREE.BufferGeometry();g.setIndex(idx);g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();return g;
}

function createSign(root,text,sub,x,y,z,heading,width=8,height=2.7,bg='#153d43') {
  const cv=document.createElement('canvas');
  cv.width=768;cv.height=Math.round(768*height/width);
  const c=cv.getContext('2d');c.fillStyle=bg;c.fillRect(0,0,cv.width,cv.height);
  c.strokeStyle='#cbdedc';c.lineWidth=5;c.strokeRect(9,9,cv.width-18,cv.height-18);
  c.fillStyle='#f1f2eb';c.font='bold '+Math.round(cv.height*.33)+'px sans-serif';c.fillText(text,31,cv.height*.54,cv.width-62);
  c.font='600 '+Math.round(cv.height*.18)+'px sans-serif';c.fillStyle='#c7d8ce';c.fillText(sub,32,cv.height*.83,cv.width-62);
  const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map:tex,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:.14,roughness:.8,side:THREE.DoubleSide}));
  mesh.position.set(x,y,z);mesh.rotation.y=heading;root.add(mesh);
}
function createScenery(root,night) {
  const rng=randomSource(671041), batches=makeBatches(root);
  const box=new THREE.BoxGeometry(),blocks=batches.create(box), facade=batches.create(box.clone(),glassMaterial(night),true);
  const posts=batches.create(new THREE.CylinderGeometry(.5,.5,1,7));
  const boulder=batches.create(new THREE.IcosahedronGeometry(1,0),batches.standard,true);
  const shrubs=batches.create(new THREE.IcosahedronGeometry(1,1),batches.standard);
  const palms=batches.create(palmGeometry(),geometricMaterial(),true);
  const fence=batches.create(box.clone());
  const collisions=new Map(),ramps=[];
  function solid(x,z,rx,rz=rx,y=groundHeight(x,z),h=20,smash=null) {
    const record={x,z,rx,rz,y,h,smash};
    indexBounds(collisions,x-rx-2,x+rx+2,z-rz-2,z+rz+2,record);
  }
  function palm(x,z,h=1,rotation=rng()*6.28) {
    const y=groundHeight(x,z);
    if(y<1) return;
    palms.add(transform(x,y,z,h,h,h,rotation));
    solid(x,z,.25*h,.25*h,y,10*h);
  }
  const stone=['#b5b5a9','#a99b8b','#cec8b4','#b7aa95'];
  const glass=['#638394','#567582','#79939c','#646e77','#947f74','#75888c','#718fa4'];
  // Grid lots reserve a verge around every carriageway, including diagonal junctions.
  for(let x=-263;x<247;x+=41)for(let z=-555;z<492;z+=49){
    const cx=x+(rng()-.5)*10,cz=z+(rng()-.5)*12;
    const w=16+rng()*13,d=20+rng()*15;
    if(shoreDepth(cx,cz)<37 || roadAt(cx,cz,16))continue;
    if([[-1,-1],[-1,1],[1,-1],[1,1]].some(([a,b])=>roadAt(cx+a*w/2,cz+b*d/2,2)))continue;
    const base=groundHeight(cx,cz);
    const central=Math.exp(-((cx+48)**2/(180**2)+(cz+205)**2/(245**2)));
    const h=6+Math.pow(rng(),1.5)*16+central*(23+rng()*83);
    const tone=stone[Math.floor(rng()*stone.length)],glaze=glass[Math.floor(rng()*glass.length)];
    const podium=Math.min(5.2,h*.21);
    blocks.add(transform(cx,base+podium*.5,cz,w+1.8,podium,d+1.8),tone);
    facade.add(transform(cx,base+(h+podium)*.5,cz,w,h-podium,d),glaze);
    blocks.add(transform(cx,base+h+.42,cz,w+.6,.84,d+.6),tone);
    if(h>39){
      const crown=h*(.09+rng()*.21);
      facade.add(transform(cx,base+h+.7+crown/2,cz,w*.77,crown,d*.84),glaze);
      blocks.add(transform(cx,base+h+crown+1,cz,w*.8,1,d*.86),tone);
      if(h>66&&rng()>.52)posts.add(transform(cx,base+h+crown+5,cz,.24,9,.24),'#889096');
      if(rng()>.62)for(const s of [-1,1])blocks.add(transform(cx+w*.5*s,base+h*.51,cz,1.1,h*.96,d*.18),tone);
    }else if(h>13){
      for(let y=7.5;y<h;y+=5.3) blocks.add(transform(cx,base+y,cz,w+1.3,.45,d+1.3),tone);
    }else{
      blocks.add(transform(cx+2,base+h+1.1,cz-1,w*.23,1.3,d*.21),'#777d80');
    }
    solid(cx,cz,w*.5+.9,d*.5+.9,base,h);
  }

  const lampHeadMaterial=new THREE.MeshStandardMaterial({color:'#f1eadc',emissive:'#ffe6be',emissiveIntensity:.4,roughness:.55});
  const lampHead=batches.create(box.clone(),lampHeadMaterial);
  function lamp(x,z,heading) {
    const y=groundHeight(x,z),dx=-Math.sin(heading),dz=-Math.cos(heading),h=7.7;
    const parts=[
      [posts,posts.add(transform(x,y+h/2,z,.17,h,.17),'#666b69')],
      [posts,posts.add(beamMatrix([x,y+h-.6,z],[x+dx*1.75,y+h+.35,z+dz*1.75],.11),'#767a76')],
      [lampHead,lampHead.add(transform(x+dx*1.83,y+h+.3,z+dz*1.83,.48,.17,.87,heading),'#f6efd2')]
    ];
    const obj={alive:true,parts,x,z};solid(x,z,.28,.28,y,h,obj);
  }
  function barrier(x,z,a,y=groundHeight(x,z)) {
    const parts=[
      [blocks,blocks.add(transform(x,y+.46,z,2.6,.86,.48,a),'#e28b3e')],
      [blocks,blocks.add(transform(x,y+.55,z,1.2,.35,.50,a),'#eee6d1')]
    ];
    const obj={alive:true,parts,x,z};solid(x,z,1.12,.65,y,1.1,obj);
  }
  roads.forEach((rd,i)=>{
    const length=roadLengths[i];
    if(i===expressway)return;
    for(let d=17;d<length-8;d+=(i<3?48:70)){
      const p=routePoint(i,d), offset=rd.width/2+1.25,s=(Math.round(d/48)%2?1:-1);
      const x=p.x+s*Math.cos(p.heading)*offset,z=p.z-s*Math.sin(p.heading)*offset;
      if(roadAt(x,z,4,i) || groundHeight(x,z)<1) continue;
      if(i!==1 && i!==11)lamp(x,z,p.heading+s*Math.PI/2);
      if(i===0||i===5||i===6||i===9){
        for(const side of [-1,1]){
          const k=rd.width/2+4.9,px=p.x+Math.cos(p.heading)*k*side,pz=p.z-Math.sin(p.heading)*k*side;
          if(!roadAt(px,pz,1.6,i)&&groundHeight(px,pz)>1)palm(px,pz,.77+rng()*.34);
        }
      }
      if((i===0||i===1)&&d%192<50)barrier(p.x+Math.cos(p.heading)*(rd.width/2+.35),p.z-Math.sin(p.heading)*(rd.width/2+.35),p.heading+Math.PI/2);
    }
  });

  // Girders and columns follow the same elevation profile as the upper carriageway.
  // Omit supports at ground-level carriageways to leave the underpasses clear.
  const deck=stripBuilder(),concrete=new THREE.Color('#aba99c');
  const de=roadLengths[expressway],half=roads[expressway].width/2;
  for(let station=3;station<de-3;station+=5){
    const end=Math.min(de-3,station+5),p=routePoint(expressway,station),q=routePoint(expressway,end);
    function side(s,d,offset,dy){
      const x=s.x+Math.cos(s.heading)*offset,z=s.z-Math.sin(s.heading)*offset;
      return [x,groundHeight(x,z)+deckHeight(d)+dy,z];
    }
    if(deckHeight(station)<.45)continue;
    const l=half+.65;
    for(const sign of [-1,1]) {
      const a=side(p,station,sign*l,1.36),b=side(q,end,sign*l,1.36);
      const c=side(q,end,sign*l,-.75),d=side(p,station,sign*l,-.75);
      deck.quad(a,b,c,d,concrete);
      const e=side(p,station,sign*(l-.33),1.36),f=side(q,end,sign*(l-.33),1.36);
      deck.quad(e,f,b,a,concrete);deck.quad(e,f,side(q,end,sign*(l-.33),.25),side(p,station,sign*(l-.33),.25),concrete);
      const mx=(a[0]+b[0])*.5,mz=(a[2]+b[2])*.5,rad=.38;
      solid(mx,mz,Math.abs(b[0]-a[0])*.5+rad,Math.abs(b[2]-a[2])*.5+rad,Math.min(a[1],b[1])-1.2,1.25);
    }
    deck.quad(side(p,station,-l,-.75),side(q,end,-l,-.75),side(q,end,l,-.75),side(p,station,l,-.75),concrete);
    if((station-3)%40===0 && !roadAt(p.x,p.z,2.1,expressway)){
      const base=groundHeight(p.x,p.z),h=deckHeight(station);
      blocks.add(transform(p.x,base+h*.47,p.z,2.5,h*.94,1.8,p.heading),'#a6a89e');
      blocks.add(transform(p.x,base+h-.95,p.z,half*1.65,.95,2.25,p.heading),'#b6b6a8');
      solid(p.x,p.z,1.4,1.1,base,h-.9);
    }
  }
  root.add(new THREE.Mesh(deck.finish(),geometricMaterial()));

  // Powder-coated steel rail, beachcomber palms, and short piers line the ocean side.
  for(let z=-464;z<452;z+=15){
    const x=coastX(z)-17,y=groundHeight(x,z),z2=z+15,x2=coastX(z2)-17,y2=groundHeight(x2,z2);
    if(roadAt(x,z,1.2))continue;
    posts.add(transform(x,y+.68,z,.14,1.36,.14),'#e2e3d8');
    for(const h of [.62,1.17])posts.add(beamMatrix([x,y+h,z],[x2,y2+h,z2],.10),'#c7d2cf');
    if(z%45===1 && !roadAt(x-5,z,1))palm(x-5,z,.63+rng()*.27);
  }
  for(let j=0;j<3;j++){
    const z=198-j*233,x=coastX(z)+18,y=2.1;
    blocks.add(transform(x,y,z,72,.43,4.4),'#977e61');
    for(let i=0;i<8;i++)for(const s of [-1,1]) posts.add(transform(x-32+i*9,-1,z+s*1.7,.46,6.2,.46),'#5d605b');
    for(let i=0;i<6;i++)blocks.add(transform(x-30+i*12,y+.72,z-2.1,.17,1.25,.17),'#c2bda6');
    blocks.add(transform(x,y+1.37,z-2.1,65,.16,.16),'#b6ad93');
  }

  // The container terminal has stacked, ribbed freight boxes, gantries and mooring bollards.
  const containerColors=['#a9533b','#416c77','#8b9575','#cea45a','#b7bcb2','#4d6881'];
  function container(x,y,z,heading,tone){
    const w=2.55,h=2.6,l=11.2;
    blocks.add(transform(x,y+h*.5,z,w,h,l,heading),tone);
    const shade=new THREE.Color(tone).multiplyScalar(.73);
    for(let k=-5;k<=5;k+=1.04)for(const s of [-1,1]){
      const localX=s*1.29;
      blocks.add(transform(x+Math.cos(heading)*localX+Math.sin(heading)*k,y+h*.5,z-Math.sin(heading)*localX+Math.cos(heading)*k,.08,2.4,.095,heading),shade);
    }
  }
  for(let j=0;j<8;j++)for(let k=0;k<11;k++){
    const x=-133+j*37, z=-1005+k*28;
    if(roadAt(x,z,10) || rng()>.77)continue;
    const y=groundHeight(x,z),a=(j%3===0 ? Math.PI/2:0),stack=rng()>.55?2:1;
    for(let n=0;n<stack;n++)container(x,y+n*2.6,z,a,containerColors[Math.floor(rng()*6)]);
    solid(x,z,a?5.7:1.45,a?1.45:5.7,y,2.6*stack);
  }
  for(let j=0;j<4;j++){
    const x=coastX(-710-j*72)-31,z=-710-j*72,y=groundHeight(x,z),tone='#c27b43';
    for(const s of [-1,1])for(const t of [-1,1]){
      posts.add(transform(x+s*6,y+15,z+t*5,.93,30,.93),tone);
      posts.add(beamMatrix([x+s*6,y+4,z+t*5],[x-s*6,y+16,z+t*5],.49),tone);
    }
    blocks.add(transform(x+10,y+31,z,42,1.4,3),tone);
    for(let k=0;k<9;k++)posts.add(beamMatrix([x-11+k*4.8,y+31.2,z],[x-8.6+k*4.8,y+34,z],.31),tone);
    blocks.add(transform(x+10,y+34.1,z,43,.55,1.6),tone);
    posts.add(transform(x+23,y+23,z,.11,16,.11),'#3d464b');
    blocks.add(transform(x+23,y+15,z,3,.6,1.4),'#4c5658');
    blocks.add(transform(x-7,y+29.4,z,4,3,5),'#d3cbb9');
  }
  // Sailboats give the camera a scale reference on the bay.
  const sailG=stripBuilder();
  for(let j=0;j<25;j++){
    const x=385+rng()*460,z=-990+rng()*2000,h=6+rng()*8;
    const hull='#d9dcd4',heading=(rng()-.5)*.5;
    boulder.add(transform(x,.12,z,1.1,.82,3.3,heading),hull);
    posts.add(transform(x,h*.5,z,.09,h,.09),'#a5a9a0');
    const wm=new THREE.Color(j%3===0?'#d9a980':'#efe9d7');
    sailG.quad([x+.07,1.5,z],[x+.08,1.6,z+h*.36],[x+.07,h-.6,z+.1],[x+.07,h,z],wm);
  }
  root.add(new THREE.Mesh(sailG.finish(),geometricMaterial()));

  const trees=['#475c39','#536a3c','#586e43','#607449'];
  for(let k=0;k<1320;k++){
    const x=-1185+rng()*1340,z=-1100+rng()*2050, y=groundHeight(x,z);
    if((x>-355&&z<535&&z>-1080)||y<3||roadAt(x,z,4.8))continue;
    const size=1.5+rng()*3.4,tone=trees[Math.floor(rng()*trees.length)];
    if(rng()>.77) {
      const h=size*1.4;
      posts.add(transform(x,y+h*.48,z,.22,h,.22),'#7a705a');
      shrubs.add(transform(x,y+h,z,size*.90,size*.82,size*.88,rng()*6),tone);
      shrubs.add(transform(x+size*.53,y+h-.55,z+.22,size*.68,size*.61,size*.64),tone);
    }else if(rng()>.36)boulder.add(transform(x,y+.23,z,size*1.06,size*.46,size*.84,rng()*6,0,rng()*.19),'#a39276');
    else shrubs.add(transform(x,y+.45,z,size*.78,size*.42,size*.71),tone);
  }
  for(let i=0;i<roadLengths[1];i+=13){
    const p=routePoint(1,i),q=routePoint(1,i+13);
    if(groundHeight(p.x,p.z)<37||roadAt(p.x,p.z,3,1))continue;
    function edge(s){const offset=roads[1].width/2+1.3;return [s.x+Math.cos(s.heading)*offset,s.z-Math.sin(s.heading)*offset];}
    const [x,z]=edge(p),[ex,ez]=edge(q),y=groundHeight(x,z),ey=groundHeight(ex,ez);
    fence.add(transform(x,y+.54,z,.15,1.08,.14),'#898b81');
    posts.add(beamMatrix([x,y+.83,z],[ex,ey+.83,ez],.28),'#b9b8a9');
  }

  // A compact festival paddock on the first straight anchors the player's starting vista.
  const tentG=stripBuilder(), bannerG=stripBuilder();
  const flagTones=['#e46c38','#347b7d','#e7d8b5'];
  function tent(x,z,r,color){
    const y=groundHeight(x,z),top=[x,y+4.7,z], shade=new THREE.Color(color);
    for(let k=0;k<4;k++){
      const a=.25*Math.PI+k*Math.PI/2,b=a+Math.PI/2;
      const p=[x+Math.cos(a)*r,y+2.8,z+Math.sin(a)*r],q=[x+Math.cos(b)*r,y+2.8,z+Math.sin(b)*r];
      // A repeated apex is intentional for a triangular face in the shared quad batch.
      tentG.quad(p,q,top,top,shade);
      posts.add(transform(p[0],y+1.4,p[2],.085,2.8,.085),'#d3d6c6');
    }
  }
  for(let i=0;i<6;i++){
    const z=300-i*15,x=231+(i%2)*5;
    if(roadAt(x,z,4))continue;
    tent(x,z,4.3,flagTones[i%3]);
    blocks.add(transform(x,groundHeight(x,z)+.56,z,2.6,1.12,1.1),'#51514c');
  }
  for(let d=30;d<138;d+=14){
    const p=routePoint(0,d);
    for(const s of [-1,1]){
      const offset=roads[0].width/2+1.4,x=p.x+s*Math.cos(p.heading)*offset,z=p.z-s*Math.sin(p.heading)*offset,y=groundHeight(x,z);
      posts.add(transform(x,y+2.85,z,.085,5.7,.085),'#484e4e');
      const tip= [x+.14,y+5.5,z+.25],edge=[x+.36,y+5.17,z+1.04], low=[x+.3,y+2.4,z+.9];
      bannerG.quad([x+.04,y+1.94,z],low,edge,tip,new THREE.Color(flagTones[(Math.round(d/14)+(s===1?1:0))%3]));
    }
  }
  root.add(new THREE.Mesh(tentG.finish(),geometricMaterial()));
  root.add(new THREE.Mesh(bannerG.finish(),geometricMaterial()));

  function gantry(index,station,text,sub,color){
    const p=routePoint(index,station),w=roads[index].width+3,cos=Math.cos(p.heading),sin=Math.sin(p.heading);
    const left=[p.x-cos*w/2,p.z+sin*w/2],right=[p.x+cos*w/2,p.z-sin*w/2];
    const y=groundHeight(p.x,p.z),h=8.1;
    for(const [x,z] of [left,right]){
      blocks.add(transform(x,y+h/2,z,.42,h,.48,p.heading),'#555e60');
      for(const s of [-1,1])blocks.add(transform(x+s*cos*.32,y+.38,z-s*sin*.32,.30,.72,.85,p.heading),'#b6b2a2');
    }
    for(const dh of [0,1.1])posts.add(beamMatrix([left[0],y+h+dh,left[1]],[right[0],y+h+dh,right[1]],.21),'#727b78');
    for(let i=0;i<12;i++){
      const l=-w/2+w*i/12,r=l+w/12;
      posts.add(beamMatrix([p.x+cos*l,y+h,p.z-sin*l],[p.x+cos*r,y+h+1.1,p.z-sin*r],.13),'#89918c');
    }
    createSign(root,text,sub,p.x+sin*.22,y+h+.36,p.z+cos*.22,p.heading,
      Math.min(14.5,w*.78),2.4,color);
  }
  gantry(0,77,'AURELIA BAY','COASTAL HIGHWAY     /     NORTHBOUND','#255557');
  gantry(0,687,'HARBOUR DISTRICT','CONTAINER TERMINAL     /     KEEP RIGHT','#31585a');
  gantry(1,453,'CANYON PASS','SCENIC ROUTE     /     WINDING ROAD','#755a43');
  gantry(2,212,'PORT AURELIA','FREIGHT TERMINAL     /     EAST DOCKS','#435861');
  // Angled metal launch decks have matching analytic collision planes.
  const rampG=stripBuilder(),paintG=stripBuilder();
  function ramp(index,station,offset,width,length,lift) {
    const p=routePoint(index,station),a=p.heading;
    const x=p.x+Math.cos(a)*offset,z=p.z-Math.sin(a)*offset;
    const fx=-Math.sin(a),fz=-Math.cos(a),rx=Math.cos(a),rz=-Math.sin(a);
    const rec={x,z,fx,fz,rx,rz,width,length,lift};
    ramps.push(rec);
    function at(u,v,dy=0) {
      const px=x+fx*u+rx*v,pz=z+fz*u+rz*v;
      return [px,groundHeight(px,pz)+.25+lift*(u/length+.5)+dy,pz];
    }
    rampG.quad(at(-length/2,-width/2),at(-length/2,width/2),at(length/2,width/2),at(length/2,-width/2),new THREE.Color('#646965'));
    for(const s of [-1,1]) {
      const l=at(-length/2,s*width*.5),r=at(length/2,s*width*.5);
      rampG.quad(l,r,[r[0],r[1]-lift,r[2]],l,new THREE.Color('#8e5b3a'));
      paintG.quad(at(-length*.5,s*width*.49,.025),at(-length*.5,s*width*.45,.025),at(length*.5,s*width*.45,.025),at(length*.5,s*width*.49,.025),new THREE.Color('#eeb447'));
    }
    for(let j=0;j<3;j++)for(const s of [-1,1]){
      const u=-length*.29+j*length*.25;
      paintG.quad(at(u,s*width*.34,.04),at(u+1.4,0,.04),at(u+1.9,0,.04),at(u+.5,s*width*.34,.04),new THREE.Color('#d8b04d'));
    }
  }
  ramp(2,148,3.2,4.7,15,3.6);ramp(2,415,-3.8,5.0,18,4.8);
  ramp(0,772,6.7,5.6,21,4.2);ramp(1,1360,4.4,4.4,17,3.7);
  root.add(new THREE.Mesh(rampG.finish(),geometricMaterial({roughness:.57,metalness:.20})));
  root.add(new THREE.Mesh(paintG.finish(),geometricMaterial()));

  // Glass festival boards can be driven through. Hide all parts in the same collision step.
  const glassBoardMat=new THREE.MeshStandardMaterial({transparent:true,opacity:.72,roughness:.24,metalness:.16});
  const boards=batches.create(box.clone(),glassBoardMat);
  for(const [i,station] of [[0,404],[0,1078],[1,328],[1,1880],[2,231],[2,548],[5,142]]) {
    const p=routePoint(i,station),off=roads[i].width*.5+2.6,x=p.x+Math.cos(p.heading)*off,z=p.z-Math.sin(p.heading)*off,y=groundHeight(x,z);
    const parts=[[boards,boards.add(transform(x,y+1.45,z,3.6,2.4,.12,p.heading),'#66bcbf')]];
    for(const s of [-1,1]){
      const px=x+Math.cos(p.heading)*1.67*s,pz=z-Math.sin(p.heading)*1.67*s;
      parts.push([blocks,blocks.add(transform(px,y+.8,pz,.12,1.6,.14,p.heading),'#717774')]);
    }
    const prop={alive:true,parts,x,z};solid(x,z,1.65,1.65,y,2.8,prop);
  }
  batches.finish();
  const hidden=transform(0,-200,0,.001,.001,.001);
  function collide(p){
    let smashed=0;
    const py=p.y??groundHeight(p.x,p.z);
    let solidHit=shoreDepth(p.x,p.z)<-3 && py<2;
    for(const item of collisions.get(key(p.x,p.z))||empty) {
      if(py>item.y+item.h+.35||py<item.y-2)continue;
      if(Math.abs(p.x-item.x)>item.rx+.78 || Math.abs(p.z-item.z)>item.rz+.78)continue;
      if(item.smash){
        if(!item.smash.alive)continue;
        item.smash.alive=false;
        for(const [batch,id] of item.smash.parts){
          batch.mesh.setMatrixAt(id,hidden);batch.mesh.instanceMatrix.needsUpdate=true;
        }
        smashed++;
      }else solidHit=true;
    }
    return {solid:solidHit,smashed};
  }
  function surface(x,z,vehicleY){
    const terrain=groundHeight(x,z), onRoad=roadAt(x,z,0,-1,true), base=terrain+(onRoad ? .25 : .015);
    // A reference height preserves the active level at flyovers and permits landing on the deck.
    let closest=Infinity, flyoverHeight;
    for(const s of segments.get(key(x,z))||empty){
      if(s.road!==expressway)continue;
      const u=clamp(((x-s.x)*s.dx+(z-s.z)*s.dz)/s.length2,0,1);
      const dsq=(x-s.x-u*s.dx)**2+(z-s.z-u*s.dz)**2;
      if(dsq>=(s.width*.5+.2)**2 || dsq>=closest)continue;
      closest=dsq;flyoverHeight=terrain+.265+deckHeight(s.station+u*Math.sqrt(s.length2));
    }
    if(flyoverHeight!==undefined && (vehicleY??terrain)>=flyoverHeight-1.7)
      return {height:flyoverHeight,road:true,ramp:false};
    for(const r of ramps){
      const dx=x-r.x,dz=z-r.z,u=dx*r.fx+dz*r.fz,v=dx*r.rx+dz*r.rz;
      if(Math.abs(u)<=r.length/2&&Math.abs(v)<=r.width/2)
        return {height:base+r.lift*(u/r.length+.5),road:true,ramp:true};
    }
    return {height:base,road:onRoad,ramp:false};
  }
  return {collide,surface,update(n){lampHeadMaterial.emissiveIntensity=.3+n*2.7;}};
}

export function createWorld(scene) {
  const root=new THREE.Group();root.name='Aurelia Bay';scene.add(root);
  const night={value:0};
  makeTerrain(root);makeRoads(root);
  const ocean=makeOcean(root),scenery=createScenery(root,night);
  return {
    group:root,collide:scenery.collide,surface:scenery.surface,
    update(time,nightBlend=0) {
      night.value=clamp(Number(nightBlend)||0,0,1);
      ocean(time,night.value);scenery.update(night.value);
    },
    dispose() {
      const geometries=new Set(),materials=new Set(),maps=new Set();
      root.traverse(o=>{
        if(o.geometry)geometries.add(o.geometry);
        for(const m of Array.isArray(o.material)?o.material:(o.material?[o.material]:[])){materials.add(m);if(m.map)maps.add(m.map);}
        if(o.isInstancedMesh)o.dispose();
      });
      for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of maps)t.dispose();
      scene.remove(root);
    }
  };
}
