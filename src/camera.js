import * as THREE from "three";
import { angleDelta, damp } from "./physics.js";
export const cameraNames = ["Chase", "Hood", "Bumper", "Cinematic"];
export class DrivingCamera {
  constructor(camera) {
    this.camera = camera;
    this.index = 0;
    this.yaw = 0;
    this.snap = true;
    this.target = new THREE.Vector3();
    this.eye = new THREE.Vector3();
  }
  cycle() {
    this.index = (this.index + 1) % 4;
    this.snap = true;
    return cameraNames[this.index];
  }
  update(p, dt, time, surface) {
    const index = this.index,
      hard = this.snap,
      near = index === 1 || index === 2;
    const yaw = near ? p.heading : p.travel;
    this.yaw = hard
      ? yaw
      : this.yaw +
        angleDelta(yaw, this.yaw) * (1 - Math.exp(-dt * (near ? 22 : 7)));
    const s = Math.sin(this.yaw),
      c = Math.cos(this.yaw);
    const distance = [7.6 + Math.abs(p.speed) * 0.018, -0.62, -2.18, 10.5][
      index
    ];
    const height = [3.3, 1.15, 0.55, 2.25][index];
    const side = index === 3 ? 5.8 * Math.sin(time * 0.16 + 1.1) : 0;
    const x = p.x + s * distance + c * side,
      z = p.z + c * distance - s * side;
    this.eye.set(x, Math.max(p.y + height, surface(x, z).height + 0.38), z);
    const look = near ? 20 : index === 3 ? 1.2 : 4.8;
    this.target.set(
      p.x - s * look,
      p.y + (near ? 0.99 + Math.sin(p.pitch) * look : 1),
      p.z - c * look,
    );
    this.camera.position.lerp(
      this.eye,
      hard || near ? 1 : 1 - Math.exp(-dt * 11),
    );
    this.camera.lookAt(this.target);
    this.camera.fov = damp(
      this.camera.fov,
      (near ? 72 : 55) + Math.abs(p.speed) * 0.095 + p.boostStage * 2.4,
      4,
      dt,
    );
    this.camera.updateProjectionMatrix();
    this.snap = false;
  }
}
