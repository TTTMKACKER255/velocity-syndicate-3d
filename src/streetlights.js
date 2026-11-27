import * as THREE from "three";

export function recordStreetlight(lamps, prop, y, dx, dz, sampleGround) {
  const x = prop.x + dx * 1.83,
    z = prop.z + dz * 1.83;
  const cx = x + dx * 3.5,
    cz = z + dz * 3.5;
  // Keep the pool on its own road surface, including the terrain gradient.
  const floor = sampleGround(cx, cz) + 0.32;
  const gx = (sampleGround(cx + 1, cz) - sampleGround(cx - 1, cz)) * 0.5;
  const gz = (sampleGround(cx, cz + 1) - sampleGround(cx, cz - 1)) * 0.5;
  const lamp = { x, y: y + 8, z, cx, cz, floor, gx, gz, dx, dz, prop };
  lamps.push(lamp);
  return lamp;
}

function radialTexture(halo) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx.createRadialGradient) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [u, alpha] of halo
    ? [
        [0, 0.99],
        [0.1, 0.8],
        [0.24, 0.24],
        [0.56, 0.055],
        [1, 0],
      ]
    : [
        [0, 0.78],
        [0.25, 0.67],
        [0.55, 0.36],
        [0.82, 0.1],
        [1, 0],
      ]) {
    g.addColorStop(u, "rgba(255,255,255," + alpha + ")");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class StreetLights {
  constructor(scene, lamps) {
    this.lamps = lamps;
    const count = lamps.length;
    const material = (map) =>
      new THREE.MeshBasicMaterial({
        color: 0xffce8b,
        map,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
    this.pool = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      material(radialTexture(false)),
      count,
    );
    this.halo = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      material(radialTexture(true)),
      count,
    );
    this.pool.name = "Streetlamp pavement light";
    this.halo.name = "Streetlamp lens bloom";
    for (const mesh of [this.pool, this.halo]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }
    // Only nearby fixtures use point lights to illuminate passing cars and facades.
    this.lights = Array.from({ length: 4 }, () => {
      const light = new THREE.PointLight(0xffc883, 0, 20, 2);
      scene.add(light);
      return light;
    });
    this.matrix = new THREE.Matrix4();
    this.up = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.pose = new THREE.Object3D();
  }
  update(power, player, camera) {
    this.pool.visible = this.halo.visible = power > 0.005;
    let n = 0;
    const near = [];
    if (this.pool.visible)
      for (const l of this.lamps) {
        const d = (l.x - player.x) ** 2 + (l.z - player.z) ** 2;
        if (!l.prop.alive || d > 320 ** 2) continue;
        if (d < 45 ** 2) near.push({ l, d });
        this.up.set(l.dx, l.gx * l.dx + l.gz * l.dz, l.dz).normalize();
        this.side.set(-l.dz, -l.gx * l.dz + l.gz * l.dx, l.dx).normalize();
        this.normal.crossVectors(this.side, this.up).normalize();
        this.side.multiplyScalar(10.6);
        this.up.multiplyScalar(13.8);
        this.matrix
          .makeBasis(this.side, this.up, this.normal)
          .setPosition(l.cx, l.floor, l.cz);
        this.pool.setMatrixAt(n, this.matrix);
        this.pose.position.set(l.x, l.y, l.z);
        this.pose.quaternion.copy(camera.quaternion);
        this.pose.scale.setScalar(Math.min(3.2, 1.65 + Math.sqrt(d) * 0.008));
        this.pose.updateMatrix();
        this.halo.setMatrixAt(n, this.pose.matrix);
        n++;
      }
    this.pool.count = this.halo.count = n;
    if (n) {
      this.pool.instanceMatrix.needsUpdate =
        this.halo.instanceMatrix.needsUpdate = true;
    }
    this.pool.material.opacity = power * 0.36;
    this.halo.material.opacity = power * 0.88;
    near.sort((a, b) => a.d - b.d);
    this.lights.forEach((light, i) => {
      const l = near[i]?.l;
      light.intensity = l ? power * 100 : 0;
      if (l) light.position.set(l.x, l.y - 0.19, l.z);
    });
  }
  dispose() {
    for (const mesh of [this.pool, this.halo]) {
      mesh.material.map?.dispose();
      mesh.material.dispose();
      mesh.geometry.dispose();
      mesh.dispose();
      mesh.removeFromParent();
    }
    this.lights.forEach((l) => l.removeFromParent());
  }
}

export function drawLampPools(ctx, lamps, power, visible, project) {
  if (power < 0.005) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const l of lamps) {
    if (!l.prop.alive || !visible(l.cx, l.cz, 9, 195)) continue;
    const c = project(l.cx, l.floor, l.cz);
    if (!c) continue;
    const vx = -l.dz * 5.3,
      vz = l.dx * 5.3,
      ux = l.dx * 6.9,
      uz = l.dz * 6.9;
    const a = project(l.cx + vx, l.floor + l.gx * vx + l.gz * vz, l.cz + vz),
      b = project(l.cx + ux, l.floor + l.gx * ux + l.gz * uz, l.cz + uz);
    if (!a || !b) continue;
    const ax = a[0] - c[0],
      ay = a[1] - c[1],
      bx = b[0] - c[0],
      by = b[1] - c[1];
    if (Math.abs(ax * by - bx * ay) < 0.25) continue;
    ctx.save();
    ctx.transform(ax, ay, bx, by, c[0], c[1]);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(255,198,109," + power * 0.48 + ")");
    g.addColorStop(0.48, "rgba(255,186,103," + power * 0.26 + ")");
    g.addColorStop(1, "rgba(245,174,92,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  ctx.restore();
}
export function drawLampHead(ctx, l, power, project, pixelScale) {
  if (!l.prop.alive || power < 0.005) return;
  const p = project(l.x, l.y, l.z);
  if (!p) return;
  const r = Math.min(23, Math.max(1.6, pixelScale * 1.03));
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const g = ctx.createRadialGradient(...p, 0, ...p, r);
  g.addColorStop(0, "rgba(255,244,205," + power + ")");
  g.addColorStop(0.22, "rgba(255,206,140," + power * 0.8 + ")");
  g.addColorStop(1, "rgba(255,170,85,0)");
  ctx.fillStyle = g;
  ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
  ctx.restore();
}
