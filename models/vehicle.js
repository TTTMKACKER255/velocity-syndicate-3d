import * as THREE from 'three';

// Model coordinates are metres, with the nose facing -Z. Panel surfaces and wheel
// openings are sampled from continuous profiles so changes of wheelbase or roof
// style keep the glass, trim and bodywork aligned.
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const styles = {
  coupe:  { length: 1, width: 1, roof: 1, cabin: 0, tail: 1.24, round: 1 },
  wagon:  { length: 1.08, width: .98, roof: 1.37, cabin: -.05, tail: 1.86, round: .27 },
  sport:  { length: 1.03, width: .99, roof: 1.12, cabin: .06, tail: 1.53, round: .45 },
  gt:     { length: 1.07, width: 1.01, roof: .94, cabin: .19, tail: 1.49, round: .70 },
  muscle: { length: 1.1, width: 1.045, roof: 1.08, cabin: .22, tail: 1.48, round: .2 },
  tuner:  { length: .99, width: .98, roof: 1.14, cabin: .11, tail: 1.37, round: .32 },
  hyper:  { length: 1.04, width: 1.11, roof: .77, cabin: -.22, tail: 1.46, round: .34 },
};

function smoothProfile(points, x) {
  let i = 0;
  while (i < points.length - 2 && x > points[i + 1][0]) i++;
  const p = points[i], q = points[i + 1];
  const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 2)];
  const dx = q[0] - p[0], t = clamp((x - p[0]) / dx, 0, 1), t2 = t * t;
  const left = (q[1] - a[1]) * dx / (q[0] - a[0]);
  const right = (b[1] - p[1]) * dx / (b[0] - p[0]);
  return (2*t2*t - 3*t2 + 1)*p[1] + (t2*t - 2*t2 + t)*left
       + (3*t2 - 2*t2*t)*q[1] + (t2*t - t2)*right;
}

function surface(uSteps, vSteps, position, reverse = false) {
  const points = [], triangles = [];
  for (let i = 0; i <= uSteps; i++) {
    for (let j = 0; j <= vSteps; j++) {
      points.push(...position(i/uSteps, j/vSteps));
      if (i === uSteps || j === vSteps) continue;
      const a = i*(vSteps+1) + j, b = a+vSteps+1;
      triangles.push(...(reverse ? [a,a+1,b,b,a+1,b+1] : [a,b,a+1,b,b+1,a+1]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

// Collapse components that share a material into a single draw call. Batches
// for moving wheels remain separate from bodywork and fixed brake components.
class Batches {
  constructor() { this.buckets = new Map(); }
  add(material, geometry, pos = [0,0,0], angles = [0,0,0], scale = [1,1,1]) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles)),
      new THREE.Vector3(...scale)
    );
    geometry.applyMatrix4(matrix);
    const bucket = this.buckets.get(material) || { positions: [], normals: [], indices: [] };
    const offset = bucket.positions.length / 3;
    const vertices = geometry.getAttribute('position');
    for (const v of vertices.array) bucket.positions.push(v);
    for (const n of geometry.getAttribute('normal').array) bucket.normals.push(n);
    if (geometry.index) {
      for (const index of geometry.index.array) bucket.indices.push(index + offset);
    } else {
      for (let i = 0; i < vertices.count; i++) bucket.indices.push(i + offset);
    }
    this.buckets.set(material, bucket);
    geometry.dispose();
  }
  box(material, x,y,z, w,h,l, rotation=[0,0,0]) {
    this.add(material, new THREE.BoxGeometry(w,h,l), [x,y,z], rotation);
  }
  oval(material, x,y,z, w,h,l, rotation=[0,0,0], segments=28) {
    this.add(material, new THREE.SphereGeometry(1, segments, Math.ceil(segments/2)),
      [x,y,z], rotation, [w,h,l]);
  }
  line(material, points, radius, segments=20, sides=6) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    this.add(material, new THREE.TubeGeometry(path, segments, radius, sides, false));
  }
  attach(target) {
    for (const [material,b] of this.buckets) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.positions,3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals,3));
      geometry.setIndex(b.indices);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = material.name;
      mesh.castShadow = !material.transparent && !material.userData.noShadow;
      mesh.receiveShadow = !material.transparent;
      target.add(mesh);
    }
    this.buckets.clear();
  }
}

function buildMaterials(options) {
  const result = {};
  const standard = (key, color, metalness, roughness, props = {}) => {
    result[key] = new THREE.MeshStandardMaterial({ name:key, color, metalness, roughness, ...props });
  };
  result.paint = new THREE.MeshPhysicalMaterial({
    name:'Coachwork', color: options.paint ?? '#b7bdc2',
    metalness: options.finish === 'matte' ? .30 : .65,
    roughness: options.finish === 'matte' ? .71 : .245,
    clearcoat: options.finish === 'matte' ? .07 : .87, clearcoatRoughness: .13,
    iridescence: options.finish === 'iridescent' ? .93 : 0,
    side: THREE.DoubleSide
  });
  standard('carbon','#171b1e', .29,.43,{side:THREE.DoubleSide});
  standard('rubber','#1c1e21',.02,.85);
  standard('tread','#27292a',.04,.77);
  standard('grille','#090e12',.25,.49,{side:THREE.DoubleSide});
  standard('seams','#282c30',.4,.43);
  standard('accent','#f35b1c',.43,.29);
  standard('metal','#a5aaae',.86,.23);
  standard('rim',options.rims === 'silver' || options.rims === 'mesh' ? '#c4c8c8' :
    options.rims === 'bronze' ? '#957a55' : '#66717b',.82,.26);
  standard('rotor','#71777d',.76,.38);
  standard('seat','#33363a',.08,.63);
  standard('glass','#425363',.40,.135,{
    transparent:true, opacity:options.tint === 'dark' || options.tint === true ? .93 : .70,
    depthWrite:false, side:THREE.DoubleSide
  });
  standard('red','#c91b1e',.21,.26,{emissive:'#ff1519',emissiveIntensity:1.35});
  standard('light','#e7f4fa',.15,.17,{emissive:'#d8f2ff',emissiveIntensity:1.45});
  standard('flame','#c4eaff',.02,.40,{emissive:'#5baeff',emissiveIntensity:3});
  const neonColor = typeof options.underglow === 'string' && /^#([a-f\d]{3}|[a-f\d]{6})$/i.test(options.underglow)
    ? options.underglow : '#ff692d';
  standard('neon',neonColor,.12,.30,{emissive:neonColor,emissiveIntensity:2.6});
  return result;
}

const axle = 1.335, radius = .342;
const widths = [[-2.18,.66],[-2.1,.84],[-1.8,.92],[-1.35,.975],[-.80,.906],
  [0,.88],[.65,.93],[1.3,1.01],[1.78,.984],[2.04,.923],[2.18,.831]];
const tops = [[-2.18,.48],[-2.07,.59],[-1.75,.64],[-1.05,.742],[-.57,.772],
  [0,.785],[.7,.798],[1.38,.832],[1.84,.786],[2.18,.724]];
const lower = [[-2.18,.235],[-1.89,.192],[-.6,.178],[.4,.176],[1.85,.215],[2.18,.32]];

function bodywork(batch, m, style, options) {
  const wide = options.widebody === true || options.widebody === 'wide';
  const flare = z => Math.exp(-((Math.abs(z)-axle)**2)/.125);
  const width = z => smoothProfile(widths,z) + (wide ? .063*flare(z) : 0);
  const crown = z => smoothProfile(tops,z);
  const top = (z,u) => {
    const t = Math.abs(u), arch = flare(z);
    const raised = (.054 + .163*arch)*Math.exp(-((t-.833)**2)/.049);
    return crown(z) + raised - .073*t**5 + .018*Math.cos(t*Math.PI);
  };
  const sill = z => {
    const d = Math.abs(Math.abs(z)-axle);
    if (d<.382) return radius + Math.sqrt(.382**2-d*d);
    return smoothProfile(lower,z) + .14*Math.exp(-(d-.382)*23);
  };
  const side = (s,z,t) => {
    const y = top(z,1)*(1-t) + sill(z)*t;
    return [s*(width(z) + Math.sin(t*Math.PI)*.029 - .043*t*t),y,z];
  };
  batch.add(m.paint,surface(138,48,(u,v) => {
    const z = -2.18+u*4.36, x=2*v-1;
    return [width(z)*x,top(z,x),z];
  }));
  for (const s of [-1,1]) {
    batch.add(m.paint,surface(184,12,(u,v) => side(s,-2.18+u*4.36,v),s<0));
    // Return inside each arch, leaving space for the tire instead of burying it
    // in an uninterrupted side panel.
    for (const center of [-axle,axle]) {
      batch.add(m.grille,surface(52,6,(u,v)=>{
        const theta = u*Math.PI, z=center+.381*Math.cos(theta);
        return [s*(width(z)-.047-.25*v),radius+.381*Math.sin(theta),z];
      },s>0));
      const lip = [];
      for(let i=0;i<=36;i++){
        const a=i*Math.PI/36, z=center+.384*Math.cos(a);
        lip.push([s*(width(z)-.039),radius+.384*Math.sin(a),z]);
      }
      batch.line(m.paint,lip,wide ? .021 : .012,44);
    }
    batch.line(m.carbon,[[s*.904,.183,-.95],[s*.931,.157,-.55],[s*.94,.16,.45],[s*.99,.216,.94]],.041,32);
    batch.line(m.accent,[[s*.929,.178,-.87],[s*.951,.165,-.55],[s*.958,.17,.42],[s*.982,.199,.85]],.009);
    const seam = [[-.73,.17],[-.68,.44],[-.63,.81],[-.45,.88],[.39,.87],[.54,.65],[.66,.17]];
    batch.line(m.seams,seam.map(([z,t])=>{const p=side(s,z,t);p[0]+=s*.003;return p;}),.006,34,5);
    batch.oval(m.carbon,s*(width(.38)+.014),.722,.38,.017,.021,.083);
    batch.oval(m.paint,s*(width(.37)+.027),.729,.37,.012,.011,.061);
    // Hood shutline follows the upper sheet-metal curvature.
    const hood = [];
    for (let i=0;i<=25;i++){
      const z=-1.99+i*1.08/25, u=.58+.085*i/25;
      hood.push([s*width(z)*u,top(z,u)+.003,z]);
    }
    batch.line(m.seams,hood,.005,26,5);
  }
  for(const end of [-1,1]){
    const z=end*2.18;
    batch.add(m.paint,surface(48,12,(u,v)=>{
      const x=u*2-1;
      return [x*(width(z)+.029*Math.sin(v*Math.PI)-.043*v*v),
        top(z,x)*(1-v)+sill(z)*v,
        z+end*(.055*(1-x*x)*Math.sin(v*Math.PI))];
    },end>0));
  }
  batch.box(m.carbon,0,.187,0,1.53,.078,3.72);
  return { width,top };
}

function cabin(batch,m,style,shape) {
  const start=-.99+style.cabin, end=style.tail, wagon=end>1.7;
  const roofStart=-.31+style.cabin, roofEnd=wagon?1.16:.36+style.cabin;
  const railProfile = [[start,.014],[start+.12,.085],[roofStart,.407],
    [(roofStart+roofEnd)/2,.47],[roofEnd,.443],[end-.19,.109],[end,.017]];
  const widthProfile = [[start,.75],[roofStart,.585],[(roofStart+roofEnd)/2,.59],[roofEnd,.57],[end,.733]];
  const ridge = z=>smoothProfile(railProfile,z)*style.roof;
  const roofWidth=z=>smoothProfile(widthProfile,z);
  const belt = z=>shape.top(z,.822/shape.width(z))-.002;
  const roofY=(z,x)=>{
    const blend=THREE.MathUtils.smoothstep(Math.min(z-start,end-z),0,.34);
    const deck=shape.top(z,x*roofWidth(z)/shape.width(z));
    return THREE.MathUtils.lerp(deck,.817,blend)+ridge(z)+(.025+.009*style.roof)*(1-x*x)*blend;
  };
  const panel=(from,to,mat,steps)=>batch.add(mat,surface(steps,32,(u,v)=>{
    const z=from+(to-from)*u,x=2*v-1;
    return [roofWidth(z)*x,roofY(z,x),z];
  }));
  panel(start,roofStart,m.glass,24);
  panel(roofStart,roofEnd,m.paint,28);
  panel(roofEnd,end,m.glass,32);
  for(const s of [-1,1]){
    const edge=(z,t=1) => [
      s*THREE.MathUtils.lerp(.822,roofWidth(z),t),
      THREE.MathUtils.lerp(belt(z)-.006,roofY(z,1),t),z
    ];
    batch.add(m.glass,surface(66,12,(u,v)=>edge(start+(end-start)*u,v),s>0));
    for (const [from,to,mat,thick] of [[start,roofStart,m.paint,.028],[roofStart,roofEnd,m.paint,.03],[roofEnd,end,m.paint,.034]]){
      const pts=[];
      for(let j=0;j<=16;j++) pts.push(edge(from+(to-from)*j/16));
      batch.line(mat,pts,thick,26);
    }
    batch.line(m.carbon,[edge(start,0),edge(roofStart,0),edge(roofEnd,0),edge(end,0)],.015,35);
    const post=roofStart+(roofEnd-roofStart)*.72;
    batch.line(m.carbon,[edge(post+.12,0),edge(post+.05,.55),edge(post,1)],.024,12);
    const mz=start+.24;
    batch.line(m.carbon,[[s*.813,belt(mz),mz],[s*.925,.89,mz-.06],[s*.98,.92,mz-.06]],.028,12);
    batch.oval(m.paint,s*1.008,.936,mz-.043,.128,.064,.104,[0,s*.17,s*.02]);
    batch.oval(m.metal,s*1.015,.939,mz+.028,.104,.043,.025);
    if(wagon) batch.line(m.carbon,[[s*.57,roofY(roofStart,1)+.04,roofStart],
      [s*.60,roofY(.40,1)+.034,.40],[s*.56,roofY(roofEnd,1)+.042,roofEnd]],.019);
  }
  for(const z of [start,roofStart,roofEnd,end]){
    const pts=[];
    for(let i=0;i<=14;i++){const t=2*i/14-1;pts.push([roofWidth(z)*t,roofY(z,t)+.002,z]);}
    batch.line(m.seams,pts,.012,20);
  }
  // Wipers, visible instruments and a pair of three-piece bucket seats.
  batch.line(m.carbon,[[-.57,roofY(start+.05,-.76)+.009,start+.05],[-.29,roofY(start+.12,-.4)+.01,start+.12],
    [.08,roofY(start+.08,.1)+.012,start+.08]],.01,12);
  const dashZ=start+.11, seatZ=.10+style.cabin;
  batch.oval(m.carbon,0,belt(dashZ)-.054,dashZ,.755,.109,.224);
  batch.box(m.seat,0,.77,dashZ+.152,.25,.088,.033);
  batch.box(m.glass,0,.78,dashZ+.173,.205,.057,.006);
  for(const x of [-.36,.36]){
    batch.oval(m.seat,x,.65,seatZ,.211,.102,.286);
    batch.oval(m.seat,x,.831,seatZ+.16,.197,.231,.079,[-.15,0,0]);
    batch.oval(m.carbon,x,.996,seatZ+.19,.126,.101,.065);
    for(const s of [-1,1]) batch.oval(m.carbon,x+s*.166,.804,seatZ+.10,.047,.17,.105);
  }
  batch.add(m.carbon,new THREE.TorusGeometry(.12,.015,10,40),[-.35,.86,dashZ+.183],[-.22,0,0]);
  batch.box(m.seat,-.35,.85,dashZ+.18,.201,.031,.025);
  batch.oval(m.accent,-.35,.85,dashZ+.20,.03,.016,.009);
}

function wheel(batch,fixed,m,side,options) {
  // The tire shoulder rounds into a recessed wheel face. Every circular part
  // shares the axle axis, allowing the brake caliper to stay upright.
  const rotation=(profile,mat,segments=72)=>{
    batch.add(mat,surface(profile.length-1,segments,(u,v)=>{
      const [x,r]=profile[Math.round(u*(profile.length-1))], a=TAU*v;
      return [side*x,r*Math.cos(a),r*Math.sin(a)];
    },side>0));
  };
  rotation([[-.137,.226],[-.14,.27],[-.135,.305],[-.121,.33],[-.105,.34],
    [-.076,radius],[.076,radius],[.106,.339],[.126,.328],[.139,.298],[.143,.26],[.136,.23]],m.rubber,88);
  rotation([[.135,.237],[.143,.249],[.139,.256],[.131,.258],[.119,.249],[.088,.243]],m.rim);
  rotation([[-.105,.238],[-.105,.245],[.124,.245],[.13,.238]],m.carbon);
  for(const r of [.270,.308]){
    rotation([[.142-(r-.27)*.29,r-.0018],[.143-(r-.27)*.29,r],[.142-(r-.27)*.29,r+.0018]],m.tread);
  }
  rotation([[-.08,.34],[-.08,.343],[-.072,.343],[-.072,.34]],m.tread);
  rotation([[.07,.34],[.07,.343],[.078,.343],[.078,.34]],m.tread);
  // Spin the rotor surface and drilled holes with the wheel.
  batch.add(m.rotor,new THREE.CylinderGeometry(.201,.201,.020,60),[side*.077,0,0],[0,0,Math.PI/2]);
  const polygon=(a,r,w,bend=0)=>[r*Math.cos(a+bend)-w*Math.sin(a+bend),r*Math.sin(a+bend)+w*Math.cos(a+bend)];
  const spoke=(a,sign)=>{
    const pts=[polygon(a,.047,-.016),polygon(a,.137,-.014,sign*.045),
      polygon(a,.237,-.011,sign*.163),polygon(a,.238,.014,sign*.185),
      polygon(a,.138,.014,sign*.097),polygon(a,.047,.015)];
    const positions=[], indices=[];
    for(const d of [0,1]) for(let j=0;j<pts.length;j++){
      const [y,z]=pts[j]; const out=.129-.024*Math.sin((Math.hypot(y,z)-.04)/.20*Math.PI);
      positions.push(side*(out-.023*d),y,z);
    }
    const n=pts.length;
    for(let j=1;j<n-1;j++) indices.push(0,j,j+1,n,n+j+1,n+j);
    for(let j=0;j<n;j++){const q=(j+1)%n;indices.push(j,j+n,q,q,j+n,q+n);}
    if(side<0) for(let j=0;j<indices.length;j+=3) [indices[j+1],indices[j+2]]=[indices[j+2],indices[j+1]];
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setIndex(indices);g.computeVertexNormals();batch.add(m.rim,g);
  };
  const count=options.rims==='mesh'?9:5;
  for(let i=0;i<count;i++){
    const angle=TAU*i/count+.14;
    spoke(angle,-1);spoke(angle,1);
  }
  for(let ring=0;ring<2;ring++) for(let i=0;i<18;i++){
    const a=i*TAU/18+ring*.095,r=.14+.034*ring;
    batch.add(m.grille,new THREE.CircleGeometry(.005,6),[side*.088,r*Math.cos(a),r*Math.sin(a)],[0,side*Math.PI/2,0]);
  }
  batch.add(m.rim,new THREE.CylinderGeometry(.059,.063,.031,36),[side*.119,0,0],[0,0,Math.PI/2]);
  batch.add(m.accent,new THREE.CylinderGeometry(.024,.024,.006,24),[side*.139,0,0],[0,0,Math.PI/2]);
  for(let i=0;i<5;i++){
    const a=TAU*i/5;
    batch.add(m.metal,new THREE.CylinderGeometry(.008,.008,.007,6),
      [side*.137,.042*Math.cos(a),.042*Math.sin(a)],[0,0,Math.PI/2]);
  }
  fixed.oval(m.accent,side*.091,.035,-.16,.035,.103,.046,[-.17,0,0],18);
}

function aero(batch,m,shape,style,options) {
  const hasWing=options.spoiler !== false && options.spoiler !== 'none' && style.tail<1.7;
  const reinforced=options.bumper === 'race' || options.bumper === true;
  const nose=-2.18, tail=2.18;
  batch.oval(m.carbon,0,.226,nose+.01,.86,.027,reinforced ? .179 : .122);
  batch.oval(m.grille,0,.337,nose-.037,.41,.078,.025);
  for(const s of [-1,1]){
    batch.oval(m.grille,s*.641,.344,nose-.017,.171,.085,.027,[0,s*.12,s*.09]);
    for(let j=0;j<3;j++) batch.box(m.seams,s*.64,.303+j*.036,nose-.045,.271,.010,.016,[0,s*.119,s*.07]);
    // An oval projector housing follows the raised front shoulder.
    const x=s*.737, z=-1.87, y=shape.top(z,x/shape.width(z))+.014;
    const round=style.round, pitch=-.695;
    batch.oval(m.carbon,x,y,z,.135+.033*(1-round),.035,.122+.064*round,[pitch,0,s*.13]);
    batch.oval(m.glass,x,y+.012,z-.012,.119+.024*(1-round),.031,.109+.050*round,[pitch,0,s*.13]);
    const ring=[];
    for(let i=0;i<=40;i++){
      const a=TAU*i/40,rx=(.104+.018*(1-round))*Math.cos(a),rz=(.104+.040*round)*Math.sin(a);
      ring.push([x+rx,y+.017+.64*rz,z+.755*rz-.013]);
    }
    batch.line(m.light,ring,.0085,45,7);
    batch.oval(m.light,x,y+.025,z-.024,.052,.011,.045,[pitch,0,s*.13]);
    const stripZ=1.12;
    if(style.tail<1.65) for(let j=0;j<8;j++) {
      const zz=stripZ+j*.055, u=.44;
      batch.box(m.carbon,s*.35,shape.top(zz,u)+.015,zz,.369,.01,.014,[0,s*.11,0]);
    }
    // Rear bumper air channels and a section of the undertray diffuser.
    batch.add(m.grille,surface(16,4,(u,v)=>{
      const x=.42+.37*u, y=.345+.067*v+.024*u-.037*u**3;
      return [s*x,y,tail+.027*(1-u)+.009];
    },s>0));
    for(let j=0;j<3;j++) batch.line(m.seams,[[s*.45,.352+j*.019,tail+.037],
      [s*.62,.359+j*.019,tail+.024],[s*.77,.348+j*.016,tail+.012]],.0035,10);
    batch.oval(m.carbon,s*.73,.327,tail-.012,.179,.025,.063);
    batch.line(m.red,[[s*.826,.695,tail-.011],[s*.913,.71,2.048],[s*.947,.719,1.906]],.018,18);
    for(let j=0;j<3;j++) batch.box(m.carbon,s*(.24+.119*j),.252,tail-.021,.012,.104,.176,[-.14,0,0]);
    batch.add(m.metal,new THREE.CylinderGeometry(.063,.063,.177,36,1,true),
      [s*.185,.324,tail-.014],[Math.PI/2,0,0]);
    batch.add(m.grille,new THREE.CircleGeometry(.056,32),[s*.185,.324,tail+.070]);
    batch.add(m.metal,new THREE.TorusGeometry(.059,.006,8,36),[s*.185,.324,tail+.075]);
  }
  const back=[[-.855,.693,2.177],[-.70,.704,2.211],[0,.711,2.229],[.70,.704,2.211],[.855,.693,2.177]];
  batch.line(m.grille,back,.038,54,10);
  batch.line(m.red,back.map(([x,y,z])=>[x,y+.006,z+.032]),.013,54,8);
  batch.add(m.carbon,surface(48,8,(u,v)=>{
    const t=2*u-1;
    return [.826*t,.242+.101*v+.06*t*t,tail+.019+.02*v-.096*t*t];
  },true));
  batch.line(m.carbon,[[-.85,.30,2.115],[-.64,.256,2.18],[0,.237,2.21],
    [.64,.256,2.18],[.85,.30,2.115]],.024,36);
  batch.oval(m.carbon,0,.312,tail+.023,.32,.083,.044);
  batch.box(m.grille,0,.481,tail+.059,.329,.099,.014);
  // Geometric maker's mark, above the recessed plate.
  batch.line(m.metal,[[-.044,.618,2.239],[0,.591,2.244],[.044,.618,2.239]],.006,6);
  if(hasWing){
    for(const s of [-1,1]){
      batch.line(m.carbon,[[s*.49,.843,1.72],[s*.49,.983,1.71],[s*.49,1.065,1.905]],.024,12);
      batch.line(m.carbon,[[s*.49,.848,1.83],[s*.49,1.04,1.907]],.013,8);
      batch.box(m.carbon,s*.926,1.083,1.879,.021,.099,.265,[.08,0,0]);
      batch.box(m.accent,s*.936,1.112,1.884,.008,.013,.225,[.08,0,0]);
    }
    batch.add(m.carbon,surface(44,28,(u,v)=>{
      const x=(u*2-1)*.929, a=v*TAU;
      return [x,1.062+.012*Math.cos(a)+.019*Math.sin(a)+.022*x*x,
        1.88+.138*Math.cos(a)+.023*x*x];
    }));
  }
  if(options.underglow && options.underglow!=='off'){
    for(const s of [-1,1]) batch.line(m.neon,[[s*.869,.148,-.91],[s*.89,.15,0],[s*.93,.166,.9]],.012,12);
  }
}

export function createVehicle(options = {}) {
  const style=styles[options.body] || styles.coupe;
  const materials=buildMaterials(options);
  const group=new THREE.Group(), chassis=new THREE.Group();
  group.name='Aurelia performance vehicle'; chassis.name='Paintwork and cockpit';
  group.scale.set(style.width,1,style.length);
  const body=new Batches();
  const shape=bodywork(body,materials,style,options);
  cabin(body,materials,style,shape);
  aero(body,materials,shape,style,options);
  body.attach(chassis);group.add(chassis);

  const wheels=[], geometrySet=new Set();
  for(const s of [-1,1]){
    const moving=new Batches(), fixed=new Batches();
    wheel(moving,fixed,materials,s,options);
    const spinningTemplate=new THREE.Group(), brakeTemplate=new THREE.Group();
    moving.attach(spinningTemplate);fixed.attach(brakeTemplate);
    for(const front of [true,false]){
      const mount=new THREE.Group(), spin=spinningTemplate.clone();
      mount.name=front?'Front upright':'Rear upright';
      mount.position.set(s*(front ? .841 : .876) + s*(options.widebody ? .018 : 0),radius,front?-axle:axle);
      mount.add(brakeTemplate.clone(),spin); group.add(mount);
      wheels.push({ mount,spin,front });
    }
  }
  const plumes=[];
  for(const s of [-1,1]){
    const plume=new THREE.Mesh(new THREE.ConeGeometry(.046,.43,15),materials.flame);
    plume.position.set(s*.185,.324,2.44);plume.rotation.x=Math.PI/2;
    plume.visible=false;group.add(plume);plumes.push(plume);
  }
  let triangles=0;
  group.traverse(obj=>{
    if(!obj.isMesh)return;
    geometrySet.add(obj.geometry);
    triangles+=(obj.geometry.index?.count ?? obj.geometry.attributes.position.count)/3;
  });
  group.userData.triangles=triangles;
  group.userData.forward='-Z';
  let rotation=0, steering=0, clock=0;
  return {
    group,
    update(state={},dt=0){
      const speed=Number.isFinite(state.speed)?state.speed:0;
      rotation=(rotation-speed*dt/radius)%TAU;
      steering=THREE.MathUtils.damp(steering,clamp(state.steer||0,-1,1)*.48,12,dt);
      for(const w of wheels){
        w.spin.rotation.x=rotation;
        if(w.front) w.mount.rotation.y=steering;
      }
      materials.red.emissiveIntensity=state.brake>.01 || state.braking ? 3.1 : 1.35;
      materials.light.emissiveIntensity=state.headlights === false ? .10 : 1.45;
      clock+=dt;
      for(const plume of plumes) {
        plume.visible=Boolean(state.boosting || state.boost);
        plume.scale.y=.74+.23*Math.sin(clock*91);
      }
    },
    dispose(){
      for(const geometry of geometrySet)geometry.dispose();
      for(const material of Object.values(materials))material.dispose();
      group.removeFromParent();
    }
  };
}
