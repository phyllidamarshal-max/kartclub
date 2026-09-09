import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { terrainHeight } from "./level-scenery.ts";
import { obstacleModelKit } from "./obstacle-models.ts";
import {
  type MovingObstaclePose,
  movingObstaclesAt,
} from "../shared/moving-obstacles.ts";
import {
  nearestTrack,
  trackPoint,
  trackWidth,
  type Track,
} from "../shared/track.ts";
import { roadsideClear } from "./scenery.ts";

/** Scene traversal owns every resource; update only changes existing transforms. */
export function buildMovingObstacles(scene: THREE.Scene, track: Track) {
  const root = new THREE.Group();
  root.name = "moving-obstacles";
  scene.add(root);
  const metal = new THREE.MeshStandardMaterial({
    color: "#344845",
    roughness: 0.72,
    metalness: 0.22,
  });
  const cream = new THREE.MeshStandardMaterial({
    color: "#f5e9c9",
    roughness: 0.8,
  });
  const marking = new THREE.MeshBasicMaterial({ color: "#7c9d98" });
  const kit = obstacleModelKit();
  const entries = new Map<
    string,
    {
      body: THREE.Group;
      wheels: THREE.Object3D[];
      animate?: (pose: MovingObstaclePose) => void;
      marker?: THREE.Mesh;
      arrow?: THREE.Mesh;
    }
  >();
  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(
    parent: THREE.Object3D,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    radius = 0.05,
  ) {
    return mesh(
      parent,
      new RoundedBoxGeometry(w, h, d, 2, radius),
      material,
      x,
      y,
      z,
    );
  }
  for (const spec of track.movingObstacles ?? []) {
    const body = new THREE.Group();
    body.name = `moving-obstacle:${spec.id}`;
    body.scale.setScalar(spec.radius);
    body.rotation.y = spec.heading;
    root.add(body);
    const living = spec.kind === "sheep" || spec.kind === "deer";
    const hanging = spec.kind === "pendulum";
    if (living || hanging) {
      const nearest = nearestTrack(spec.x, spec.z, track);
      const animate = living
        ? kit.animal(body, spec.kind === "deer")
        : kit.pendulum(body, root, spec, trackWidth(nearest.t, track), (x, z) =>
            terrainHeight(track, x, z),
          );
      entries.set(spec.id, { body, wheels: [], animate });
    } else {
      entries.set(spec.id, { body, wheels: [], animate: kit.mechanism(body, spec.kind) });
    }

    const rail = new THREE.Group();
    rail.name = `obstacle-guide:${spec.id}`;
    rail.position.set(spec.x, spec.y + 0.02, spec.z);
    rail.rotation.y = spec.heading;
    root.add(rail);
    // Flush paint lines indicate travel, with no raised object across a lane.
    for (const end of [-1, 1])
      mesh(
        rail,
        new THREE.BoxGeometry(
          2 * (Math.abs(spec.amplitude) + spec.radius),
          0.018,
          0.055,
        ),
        marking,
        0,
        0,
        end * spec.radius * 0.67,
      );

    const nearest = nearestTrack(spec.x, spec.z, track);
    if (living) {
      const half = trackWidth(nearest.t, track) / 2 - 0.8;
      for (let x = -half; x < half; x += 2.1) {
        const stripe = kit.part(
          rail,
          "box",
          "accent",
          x,
          0,
          0,
          0.8,
          0.012,
          spec.radius * 1.1,
        );
        stripe.castShadow = false;
      }
    }
    for (const distance of [96, 14]) {
      const approach = trackPoint(nearest.t - distance / track.length, track);
      for (const side of [-1, 1]) {
        const lateral = side * (trackWidth(approach.t, track) / 2 + 4);
        const x = approach.x + Math.cos(approach.heading) * lateral;
        const z = approach.z - Math.sin(approach.heading) * lateral;
        if (!roadsideClear(track, x, z, 1.35)) continue;
        const sign = new THREE.Group();
        sign.name = `obstacle-warning:${spec.id}`;
        sign.position.set(x, approach.y, z);
        sign.rotation.y = approach.heading + Math.PI;
        root.add(sign);
        box(sign, metal, 0, 1.75, 0, 0.18, 3.5, 0.18);
        box(sign, metal, 0, 3.2, 0, 3.5, 2.25, 0.2, 0.14);
        box(sign, cream, 0, 3.2, 0.13, 3.2, 1.95, 0.055, 0.09);
        const icon = new THREE.Group();
        icon.position.set(0, 2.7, 0.21);
        sign.add(icon);
        // Physical silhouettes remain readable without fonts/textures at race speed.
        if (living) {
          kit.part(icon, "sphere", "metal", -0.15, 0.35, 0, 0.65, 0.36, 0.055);
          kit.part(icon, "sphere", "metal", 0.53, 0.63, 0, 0.26, 0.26, 0.055);
          for (const x of [-0.56, -0.26, 0.2, 0.43])
            kit.part(icon, "box", "metal", x, -0.03, 0, 0.09, 0.42, 0.06);
          const ear = kit.part(
            icon,
            "sphere",
            "metal",
            0.54,
            0.93,
            0,
            0.07,
            spec.kind === "deer" ? 0.25 : 0.12,
            0.05,
          );
          ear.rotation.z = -0.4;
          if (spec.kind === "deer") {
            kit.part(icon, "box", "metal", 0.39, 1.06, 0, 0.05, 0.37, 0.06);
            const tine = kit.part(
              icon,
              "box",
              "metal",
              0.31,
              1.13,
              0,
              0.05,
              0.19,
              0.06,
            );
            tine.rotation.z = 0.7;
          } else
            for (const x of [-0.5, -0.15, 0.18])
              kit.part(icon, "sphere", "metal", x, 0.6, 0, 0.24, 0.22, 0.055);
        } else if (hanging) {
          kit.part(icon, "box", "metal", 0, 1.14, 0, 1.65, 0.12, 0.065);
          const rod = kit.part(
            icon,
            "box",
            "metal",
            0.19,
            0.72,
            0,
            0.09,
            0.85,
            0.06,
          );
          rod.rotation.z = 0.45;
          kit.part(icon, "sphere", "paint", 0.38, 0.25, 0.02, 0.42, 0.42, 0.07);
          for (const x of [-0.75, -0.5])
            kit.part(icon, "sphere", "metal", x, 0.22, 0, 0.055, 0.055, 0.055);
        } else {
          kit.part(icon, "box", "paint", 0, 0.4, 0, 1.2, 0.65, 0.06);
          for (const x of [-0.4, 0.4])
            kit.part(icon, "sphere", "metal", x, 0, 0, 0.15, 0.15, 0.06);
        }
        break;
      }
    }
  }
  function update(clock: number) {
    for (const pose of movingObstaclesAt(track, clock)) {
      const entry = entries.get(pose.id)!;
      entry.body.position.set(pose.x, pose.y, pose.z);
      entry.body.rotation.y = pose.facing;
      entry.animate?.(pose);
      for (const wheel of entry.wheels)
        wheel.rotation.x = pose.offset / (pose.radius * 0.2);
      if (entry.marker)
        entry.marker.position.x = pose.amplitude
          ? (-0.76 * pose.offset) / pose.amplitude
          : 0;
      if (entry.arrow) {
        const direction =
          pose.vx * Math.cos(pose.heading) - pose.vz * Math.sin(pose.heading);
        entry.arrow.rotation.z = direction >= 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
  }
  // World batches static scenery after this builder. Keep every moving mesh
  // attached to its animated transform; otherwise physics moves an invisible
  // body while its initial model remains baked into the roadside scenery.
  const preserveMotion = (object: THREE.Object3D) => object.traverse(child => {
    if (child instanceof THREE.Mesh) child.userData.dynamic = true;
  });
  for (const entry of entries.values()) {
    preserveMotion(entry.body);
    if (entry.marker) preserveMotion(entry.marker);
    if (entry.arrow) preserveMotion(entry.arrow);
  }
  root.traverse(object => {
    if (object.name === 'swing-pivot') preserveMotion(object);
  });
  update(0);
  return { update };
}
