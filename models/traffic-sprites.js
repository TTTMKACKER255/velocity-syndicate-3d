// The software path uses the same LOD geometry, vertex colours, lamps and
// deformed panels as WebGL. A small shared atlas amortises the z-buffer pass.
const atlas=new Map();
const surfaces=new WeakMap();
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function srgb(v){return 255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055);}

function appearance(mesh) {
  const geometry=mesh.geometry;
  let record=surfaces.get(geometry);
  if(record)return record;
  const color=geometry.attributes.color;
  let rgb;
  if(color) {
    rgb=new Uint8ClampedArray(color.count*3);
    for(let i=0;i<rgb.length;i++)rgb[i]=srgb(color.array[i]);
  }
  record={xyz:geometry.attributes.position.array,norm:geometry.attributes.normal.array,
    index:geometry.index.array,rgb};
  surfaces.set(geometry,record);
  return record;
}

function bake(root,level,azimuth,elevation,night) {
  const W=level===0?234:level===1?142:74, H=Math.round(W*.61), scale=W/5.60;
  const image=document.createElement("canvas");
  image.width=W;image.height=H;
  const ctx=image.getContext("2d");
  const bitmap=ctx.createImageData(W,H),pixels=bitmap.data;
  const depths=new Float32Array(W*H).fill(-Infinity);
  const c=Math.cos(azimuth),s=Math.sin(azimuth),ce=Math.cos(elevation),se=Math.sin(elevation);
  const nightLight=1-night*.44;
  const renderMesh=(mesh,offset=[0,0,0])=>{
    const {xyz,norm,index,rgb}=appearance(mesh);
    const px=new Float32Array(xyz.length), tones=new Uint8ClampedArray(xyz.length);
    const base=mesh.material.color.getHex(), cr=(base>>16)&255,cg=(base>>8)&255,cb=base&255;
    const windows=mesh.name==="glass", lamps=mesh.name==="lights"||mesh.material.isMeshBasicMaterial;
    for(let i=0;i<xyz.length;i+=3){
      const x=xyz[i]+offset[0],y=xyz[i+1]+offset[1]-.68,z=xyz[i+2]+offset[2],cross=s*x+c*z;
      px[i]=W*.5+(c*x-s*z)*scale;
      px[i+1]=H*.5-(y*ce-cross*se)*scale;
      px[i+2]=ce*cross+y*se;
      const nx=norm[i],ny=norm[i+1],nz=norm[i+2];
      const direct=Math.max(0,-.44*nx+.74*ny-.49*nz), ndv=Math.max(0,nx*s*ce+ny*se+nz*c*ce);
      const ry=2*ndv*ny-se, sky=clamp(.46+(ry-.05)*5,0,1);
      const spec=Math.max(0,-.30*nx+.76*ny+.57*nz)**24;
      const shiny=mesh.name==="Coachwork"||windows;
      const lit=lamps?1.20:windows?.48+sky*.61:.49+.52*direct+.16*Math.max(ny,0)+(shiny?.19*sky:0);
      const glow=(lamps?12:shiny?7+(1-ndv)**2*17+spec*48:spec*11);
      const sun=lamps?1:nightLight;
      tones[i]=((rgb?rgb[i]:cr)*lit+glow)*sun;
      tones[i+1]=((rgb?rgb[i+1]:cg)*lit+glow)*sun;
      tones[i+2]=((rgb?rgb[i+2]:cb)*lit+glow+(windows?7:1))*sun;
    }
    for(let k=0;k<index.length;k+=3){
      const a=index[k]*3,b=index[k+1]*3,c=index[k+2]*3;
      const ax=px[a],ay=px[a+1],bx=px[b],by=px[b+1],cx=px[c],cy=px[c+1];
      const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      if(Math.abs(area)<.015)continue;
      const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(W-1,Math.floor(Math.max(ax,bx,cx)-.5));
      const y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(H-1,Math.floor(Math.max(ay,by,cy)-.5));
      const inv=1/area,ux=(cy-ay)*inv,uy=(ax-cx)*inv,vx=(ay-by)*inv,vy=(bx-ax)*inv;
      for(let y=y0;y<=y1;y++){
        let u=(x0+.5-ax)*ux+(y+.5-ay)*uy,v=(x0+.5-ax)*vx+(y+.5-ay)*vy;
        for(let x=x0;x<=x1;x++,u+=ux,v+=vx){
          const w=1-u-v;
          if(u<0||v<0||w<0)continue;
          const pixel=y*W+x,z=w*px[a+2]+u*px[b+2]+v*px[c+2];
          if(z<=depths[pixel])continue;
          depths[pixel]=z;
          const out=pixel*4;
          for(let channel=0;channel<3;channel++)pixels[out+channel]=w*tones[a+channel]+u*tones[b+channel]+v*tones[c+channel];
          pixels[out+3]=255;
        }
      }
    }
  };
  for(const mesh of root.levels[level].object.children)renderMesh(mesh);
  for(const auxiliary of root.children){
    if(auxiliary.isMesh&&auxiliary.visible&&auxiliary.material?.color)
      renderMesh(auxiliary,auxiliary.position.toArray());
  }
  ctx.putImageData(bitmap,0,0);
  return {image,scale};
}

export function drawTrafficSprite(ctx,root,eye,projected,focalLength,depth,night=0) {
  if(!root?.userData.trafficModel)return false;
  if(!root.visible||depth<.5)return true;
  const p=root.position,center=projected(p.x,p.y+.68,p.z);
  if(!center)return true;
  const dx=eye.x-p.x,dz=eye.z-p.z,a=root.rotation.y;
  const side=dx*Math.cos(a)-dz*Math.sin(a),rear=dx*Math.sin(a)+dz*Math.cos(a);
  const az=Math.atan2(side,rear),el=Math.atan2(eye.y-p.y-.68,Math.hypot(dx,dz));
  const level=depth<24?0:depth<65?1:2, views=level===0?48:level===1?32:16;
  const i=((Math.round(az*views/TAU)%views)+views)%views;
  const j=clamp(Math.round(el/.11),-6,13),ambient=Math.round(night*3);
  const dents=root.userData.dents;
  const revision=dents?.length?root.id+"."+root.userData.dentRevision:"factory";
  const bar=root.children.find(o=>o.isMesh&&o.visible);
  const key=[root.userData.body,root.userData.color,level,i,j,ambient,revision,bar?.material.color.getHex()].join("/");
  let shot=atlas.get(key);
  if(!shot){
    shot=bake(root,level,i*TAU/views,j*.11,ambient/3);
    if(atlas.size>=124)atlas.delete(atlas.keys().next().value);
    atlas.set(key,shot);
  }
  const px=focalLength/depth;
  const ground=projected(p.x,p.y+.035,p.z);
  if(ground){
    ctx.fillStyle="rgba(18,22,23,.32)";ctx.beginPath();
    ctx.ellipse(ground[0],ground[1],(1.03+1.03*Math.abs(Math.sin(az)))*px,
      (.15+.63*Math.abs(Math.sin(el)))*px,0,0,TAU);ctx.fill();
  }
  const w=shot.image.width/shot.scale*px,h=shot.image.height/shot.scale*px;
  ctx.drawImage(shot.image,center[0]-w*.5,center[1]-h*.5,w,h);
  return true;
}
