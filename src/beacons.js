import * as THREE from "three";
import { locations, markerPoint } from "./locations.js";
import { groundHeight, roadLengths, routePoint } from "./world.js";
import { beaconBadge } from "../ui/marker-art.js";

function beamTexture() {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 128;
  const ctx = c.getContext("2d"),
    pixels = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4,
        edge = Math.abs(((x + 0.5) / c.width) * 2 - 1);
      pixels.data.set(
        [
          255,
          255,
          255,
          Math.round(140 * (1 - edge) ** 2 * (0.22 + (0.78 * y) / c.height)),
        ],
        i,
      );
    }
  ctx.putImageData(pixels, 0, 0);
  return new THREE.CanvasTexture(c);
}
function createVisual(scene, position, item, badge, shaftTexture) {
  const group = new THREE.Group(),
    texture = new THREE.CanvasTexture(badge);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const plaque = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  plaque.renderOrder = 40;
  const shaft = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: shaftTexture,
      color: item.color || "#ff9851",
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  shaft.position.y = 6.4;
  shaft.scale.set(2.5, 12.8, 1);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 2.83, 56),
    new THREE.MeshBasicMaterial({
      color: item.color || "#ff9851",
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  group.position.set(position.x, position.height, position.z);
  group.add(shaft, ring, plaque);
  scene.add(group);
  return { group, plaque, ring, texture };
}
export class RoadBeacons {
  constructor(scene, events) {
    this.scene = scene;
    this.shaft = scene ? beamTexture() : null;
    this.entries = [...locations, ...events].map((item) =>
      this.create(item, markerPoint(item, routePoint, roadLengths)),
    );
    this.pin = this.create(
      { id: "pin", name: "GPS", icon: "pin", color: "#ff9c61" },
      { x: 0, z: 0, height: 0 },
    );
  }
  create(item, position) {
    item = { ...item, color: item.color || "#ff9851" };
    const badge = beaconBadge(item);
    return {
      item,
      position,
      badge,
      visual: this.scene
        ? createVisual(this.scene, position, item, badge, this.shaft)
        : null,
      shown: false,
    };
  }
  update(p, mission, wp, t) {
    const destination = this.entries.find((e) => e.item.id === wp?.id);
    this.pin.shown = false;
    if (wp && !mission && !destination) {
      this.pin.position = {
        ...wp,
        height: wp.height ?? groundHeight(wp.x, wp.z) + 0.25,
      };
      this.pin.shown = true;
    }
    for (const e of [...this.entries, this.pin]) {
      const pos = e.position,
        d = Math.hypot(pos.x - p.x, pos.z - p.z);
      e.selected = e === destination || e === this.pin;
      e.distance = d;
      e.shown =
        (e === this.pin ? e.shown : !mission) &&
        (e.selected || d < (e.item.landmark ? 290 : 185)) &&
        d > 4;
      e.bob = 0.28 * Math.sin(2 * t);
      e.pulse = 1 + 0.14 * (0.5 + 0.5 * Math.sin(t * 2));
      if (!e.visual) continue;
      const { group, plaque, ring } = e.visual;
      group.visible = e.shown;
      if (!e.shown) continue;
      group.position.set(pos.x, pos.height, pos.z);
      const size = THREE.MathUtils.clamp(d * 0.068, 4.2, e.selected ? 40 : 21);
      plaque.position.y = 12.5 + e.bob + size * 0.19;
      plaque.scale.set(size, (size * e.badge.height) / e.badge.width, 1);
      ring.scale.setScalar(e.pulse);
    }
  }
  drawSoftware(ctx, projected, depth, view, p) {
    const entries = [...this.entries, this.pin]
      .filter((e) => e.shown)
      .sort((a, b) => b.distance - a.distance);
    for (const e of entries) {
      const { x, z, height } = e.position,
        dist = depth(x, height, z);
      if (dist < 2) continue;
      const root = projected(x, height + 0.1, z),
        tip = projected(x, height + 12.5 + e.bob, z);
      if (
        !root ||
        !tip ||
        tip[0] < -90 ||
        tip[0] > view.w + 90 ||
        tip[1] > view.h + 60
      )
        continue;
      const pix = view.f / dist,
        wide = Math.min(55, Math.max(1.5, pix * 1.15));
      ctx.save();
      const beam = ctx.createLinearGradient(
        root[0] - wide,
        0,
        root[0] + wide,
        0,
      );
      beam.addColorStop(0, e.item.color + "00");
      beam.addColorStop(0.47, e.item.color + "4c");
      beam.addColorStop(0.5, e.item.color + "c5");
      beam.addColorStop(0.53, e.item.color + "4c");
      beam.addColorStop(1, e.item.color + "00");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(tip[0] - wide * 0.48, tip[1]);
      ctx.lineTo(tip[0] + wide * 0.48, tip[1]);
      ctx.lineTo(root[0] + wide, root[1]);
      ctx.lineTo(root[0] - wide, root[1]);
      ctx.closePath();
      ctx.fill();
      if (dist < 130) {
        ctx.beginPath();
        for (let i = 0; i <= 32; i++) {
          const a = (i * Math.PI) / 16,
            pt = projected(
              x + 2.7 * e.pulse * Math.cos(a),
              height + 0.12,
              z + 2.7 * e.pulse * Math.sin(a),
            );
          if (pt) i ? ctx.lineTo(...pt) : ctx.moveTo(...pt);
        }
        ctx.strokeStyle = e.item.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      const size = Math.min(
        view.w * 0.21,
        Math.max(e.selected ? 75 : 47, Math.min(119, pix * 5.1)),
      );
      const h = (size * e.badge.height) / e.badge.width;
      ctx.drawImage(e.badge, tip[0] - size / 2, tip[1] - h, size, h);
      ctx.restore();
    }
  }
  dispose() {
    this.shaft?.dispose();
    for (const e of [...this.entries, this.pin]) {
      const v = e.visual;
      if (!v) continue;
      v.texture.dispose();
      v.group.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
        o.material?.dispose();
      });
      v.group.removeFromParent();
    }
  }
}
