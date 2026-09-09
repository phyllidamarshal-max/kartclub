import type * as THREE from "three";
import type { Car } from "../shared/race.ts";
import { angleDiff } from "../shared/track.ts";

/** Visual rig only. Never integrates speed or writes back to simulation state. */
export class KartMotion {
  private wheels: Array<{ pivot: THREE.Object3D; spin: THREE.Object3D; radius: number; steerable: boolean }> = [];
  private previous?: { x: number; z: number; heading: number; resetting: boolean };
  private steering = 0;

  constructor(root: THREE.Group) {
    root.traverse((pivot) => {
      const radius = pivot.userData.wheelRadius;
      const spin = typeof pivot.userData.spinNode === "string"
        ? pivot.getObjectByName(pivot.userData.spinNode)
        : undefined;
      if (Number.isFinite(radius) && radius > 0 && spin)
        this.wheels.push({pivot, spin, radius, steerable: pivot.userData.steerable === true});
    });
  }

  update(car: Car, dt: number, localSteer?: number) {
    const previous = this.previous;
    const resetting = car.resetTime > 0;
    const dx = previous ? car.x - previous.x : 0;
    const dz = previous ? car.z - previous.z : 0;
    const continuous = previous && !resetting && !previous.resetting && Math.hypot(dx, dz) < 8;
    const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    // Project real movement onto the mid-frame axle direction: sliding sideways
    // or idling against a wall must not make the wheels spin at top speed.
    const heading = previous ? previous.heading + angleDiff(car.heading, previous.heading) * 0.5 : car.heading;
    const travel = continuous ? dx * Math.sin(heading) + dz * Math.cos(heading) : 0;
    const inferred = continuous && seconds > 0 && Math.abs(car.speed) > 1
      ? Math.atan((angleDiff(car.heading, previous.heading) / seconds) * 2.32 / car.speed)
      : 0;
    const target = resetting ? 0 : Number.isFinite(localSteer)
      ? Math.max(-1, Math.min(1, localSteer!)) * 0.38
      : Math.max(-0.38, Math.min(0.38, inferred));
    this.steering += (target - this.steering) * (1 - Math.exp(-18 * seconds));
    for (const wheel of this.wheels) {
      if (wheel.steerable) wheel.pivot.rotation.y = this.steering;
      wheel.spin.rotation.x = (wheel.spin.rotation.x + travel / wheel.radius) % (Math.PI * 2);
    }
    this.previous = {x:car.x, z:car.z, heading:car.heading, resetting};
  }
}
