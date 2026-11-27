import * as THREE from "three";

const clamp = THREE.MathUtils.clamp;
const state = new WeakMap();
const playerPanels = new Set(["Coachwork", "carbon", "seams", "glass", "red", "light", "grille", "accent"]);
const sizes = { coupe:[1,1], wagon:[.98,1.08], sport:[.99,1.03], gt:[1.01,1.07], muscle:[1.045,1.10], tuner:[.98,.99], hyper:[1.11,1.04] };

function panels(root) {
  if (state.has(root)) return state.get(root);
  const parts = [];
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.userData.deformable === false) return;
    if (!mesh.userData.deformable &&
        (mesh.parent?.name !== "Paintwork and cockpit" || !playerPanels.has(mesh.material.name))) return;
    parts.push({mesh, original:mesh.geometry, owned:null});
  });
  state.set(root, parts);
  return parts;
}

function normalize(root, hit) {
  if (!hit || !Number.isFinite(hit.x + hit.z + hit.severity) || hit.severity < .015) return null;
  const scale = sizes[root.userData.body] || sizes.coupe;
  const width = root.userData.halfWidth || .965 * (root.scale.x !== 1 ? root.scale.x : scale[0]);
  const length = root.userData.halfLength || 2.18 * (root.scale.z !== 1 ? root.scale.z : scale[1]);
  const sx = clamp(hit.x / width, -1, 1), sz = clamp(hit.z / length, -1, 1);
  if (sx === 0 && sz === 0) return null;
  // A contact report may fall inside the overlapping physics hulls. Move it
  // back toward the struck fascia or door and clamp tangential coordinates.
  const side = Math.abs(sx) > Math.abs(sz);
  let x = side ? Math.sign(sx) * width : sx * width;
  let z = side ? sz * length : Math.sign(sz) * length;
  // Rounded bumpers turn in at the corners.
  if (!side) x *= .86;
  let nx = side ? Math.sign(sx) : 0, nz = side ? 0 : Math.sign(sz);
  if (Math.abs(sx) > .75 && Math.abs(sz) > .72) {
    nx = Math.sign(sx) * (side ? .88 : .48);
    nz = Math.sign(sz) * (side ? .48 : .88);
  }
  return {x,y:clamp(Number.isFinite(hit.y)?hit.y:.59,.32,1.03),z,nx,nz,severity:clamp(hit.severity,0,1)};
}

function rebuild(root, dents) {
  const sx = root.scale.x || 1, sy = root.scale.y || 1, sz = root.scale.z || 1;
  for (const part of panels(root)) {
    if (!dents.length) {
      if (part.owned) {
        part.mesh.geometry = part.original;
        part.owned.dispose();
        part.owned = null;
      }
      continue;
    }
    const src = part.original.attributes.position;
    const isTraffic = !!part.mesh.userData.deformable;
    let edited = false;
    // Work from the undamaged reference on each impact. A bounded sum keeps
    // severe repeat strikes from pushing a bumper through the opposite panel.
    for (let i=0;i<src.count;i++) {
      const x=src.getX(i)*sx, y=src.getY(i)*sy, z=src.getZ(i)*sz;
      let ox=0,oy=0,oz=0;
      for(const dent of dents) {
        const dx=x-dent.x, dy=y-dent.y, dz=z-dent.z;
        const normal=dx*dent.nx+dz*dent.nz, tangent=dx*dent.nz-dz*dent.nx;
        const width=.40+dent.severity*.46, height=.34+dent.severity*.29;
        const d2=(normal/.49)**2+(tangent/width)**2+(dy/height)**2;
        if(d2>=1)continue;
        const weight=(1-d2)**2;
        const pinch=(.075+.31*dent.severity)*weight*(1+.13*Math.cos(tangent*14+dy*9));
        ox-=dent.nx*pinch; oz-=dent.nz*pinch;
        oy+=weight*(.015+.038*dent.severity)*Math.sin(tangent*12-dy*8);
      }
      if(!part.owned && (ox || oy || oz)) {
        // Clone only meshes touched by the contact region. Unrelated cars and
        // untouched trim continue to share the original cached geometries.
        part.owned = part.original.clone();
        part.mesh.geometry = part.owned;
      }
      if(!part.owned)continue;
      const moved=Math.hypot(ox,oz), cap=moved>.49?.49/moved:1;
      part.owned.attributes.position.setXYZ(i,(x+ox*cap)/sx,(y+oy)/sy,(z+oz*cap)/sz);
      edited=true;
    }
    if(edited){
      part.owned.attributes.position.needsUpdate=true;
      part.owned.computeVertexNormals();
      part.owned.computeBoundingSphere();
      if(isTraffic)part.owned.computeBoundingBox();
    }
  }
}

// Replay immutable, normalized contact records on a freshly constructed mesh.
// This also works on the player's depth-buffered Canvas sprite source.
export function deformPanel(root, dents=[]) {
  if (!root) return;
  const valid = dents.filter(d => Number.isFinite(d.x+d.y+d.z+d.nx+d.nz+d.severity));
  rebuild(root, valid);
  root.userData.dents = valid;
  root.userData.dentRevision = (root.userData.dentRevision || 0) + 1;
}

export function applyPanelDent(root, hit) {
  const dent = normalize(root, hit);
  if(!dent)return null;
  const records = [...(root.userData.dents || [])];
  const nearby = records.findIndex(d => Math.hypot(d.x-dent.x,d.y-dent.y,d.z-dent.z)<.38);
  if(nearby>=0) {
    const old=records[nearby];
    dent.severity=clamp(Math.max(old.severity,dent.severity)+Math.min(old.severity,dent.severity)*.26,0,1);
    records[nearby]=dent;
  } else if(records.length<12) records.push(dent);
  else {
    // Keep major accumulated damage. A substantial hit can replace the least
    // damaged spot after all twelve independent panel regions are occupied.
    let least=0;
    for(let i=1;i<records.length;i++)if(records[i].severity<records[least].severity)least=i;
    if(records[least].severity>dent.severity)return null;
    records[least]=dent;
  }
  deformPanel(root,records);
  return dent;
}

export function clearPanelDents(root) {
  if(!root)return;
  if(state.has(root))rebuild(root, []);
  state.delete(root);
  root.userData.dents=[];
  root.userData.dentRevision=(root.userData.dentRevision||0)+1;
}
