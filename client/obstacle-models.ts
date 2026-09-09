import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  pendulumLength,
  type MovingObstaclePose,
  type MovingObstacleSpec,
} from "../shared/moving-obstacles.ts";

/** A per-world resource palette. Runtime animation only changes transforms. */
export function obstacleModelKit() {
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  const box = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 32);
  const ring = new THREE.TorusGeometry(1, 0.07, 8, 32);
  const palette = {
    wool: "#f3e7ce",
    woolShade: "#ded0ac",
    face: "#6b5847",
    hoof: "#3c403b",
    deer: "#b97845",
    belly: "#efd9b2",
    black: "#253635",
    white: "#fff6df",
    paint: "#d7a347",
    metal: "#536d69",
    rubber: "#344745",
    accent: "#ebdfbb",
    wood: "#a77b49",
    ore: "#727d82",
    glass: "#91b4ad",
  };
  const materials = Object.fromEntries(
    Object.entries(palette).map(([key, color]) => [
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: key === "metal" ? 0.34 : key === "paint" ? 0.48 : key === "black" ? 0.23 : 0.85,
        metalness: key === "metal" ? 0.68 : key === "paint" ? 0.12 : 0,
      }),
    ]),
  );
  function part(
    parent: THREE.Object3D,
    shape: "sphere" | "box" | "cylinder" | "ring",
    color: keyof typeof palette,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    name = "",
  ) {
    const m = new THREE.Mesh(
      { sphere, box, cylinder, ring }[shape],
      materials[color],
    );
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.name = name;
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function animal(body: THREE.Group, deer: boolean) {
    const coat = deer ? "deer" : "wool";
    part(body, "sphere", coat, 0, 0.92, 0, 0.46, 0.43, 0.66, "torso");
    part(
      body,
      "sphere",
      deer ? "belly" : "woolShade",
      0,
      0.77,
      0,
      0.36,
      0.26,
      0.52,
    );
    if (!deer)
      for (let i = 0; i < 18; i++) {
        const a = (i * Math.PI * 2) / 18;
        part(
          body,
          "sphere",
          i % 3 === 0 ? "woolShade" : "wool",
          Math.cos(a) * 0.35,
          1.04 + (i % 2) * 0.055,
          Math.sin(a) * 0.49,
          0.13,
          0.22,
          0.16,
          "wool-tuft",
        );
      }
    else
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++)
          part(
            body,
            "sphere",
            "belly",
            side * 0.43,
            1.02 + (i % 2) * 0.1,
            -0.32 + i * 0.18,
            0.025,
            0.045,
            0.065,
          );
    const head = new THREE.Group();
    head.name = "head-look";
    head.position.set(0, 1.1, 0.46);
    body.add(head);
    part(
      head,
      "sphere",
      coat,
      0,
      deer ? 0.25 : 0.09,
      0.05,
      deer ? 0.2 : 0.28,
      deer ? 0.43 : 0.25,
      0.22,
      "neck",
    );
    part(
      head,
      "sphere",
      deer ? "deer" : "face",
      0,
      deer ? 0.57 : 0.2,
      0.16,
      0.22,
      0.24,
      0.29,
      "head",
    );
    part(
      head,
      "sphere",
      deer ? "belly" : "face",
      0,
      deer ? 0.47 : 0.11,
      0.33,
      0.18,
      0.13,
      0.13,
      "muzzle",
    );
    part(
      head,
      "sphere",
      "black",
      0,
      deer ? 0.5 : 0.14,
      0.431,
      0.09,
      0.065,
      0.04,
      "nose",
    );
    for (const side of [-1, 1]) {
      part(head, "sphere", deer ? "belly" : "woolShade", side * 0.185, deer ? 0.64 : 0.27, 0.286, 0.065, 0.078, 0.035, "eye-socket");
      const ear = part(
        head,
        "sphere",
        coat,
        side * 0.27,
        deer ? 0.8 : 0.33,
        0.08,
        deer ? 0.12 : 0.19,
        deer ? 0.25 : 0.08,
        0.09,
        "ear",
      );
      ear.rotation.z = -side * (deer ? 0.65 : 0.2);
      const inner = part(
        head,
        "sphere",
        deer ? "belly" : "face",
        side * 0.28,
        deer ? 0.81 : 0.345,
        0.13,
        deer ? 0.065 : 0.13,
        deer ? 0.17 : 0.035,
        0.025,
      );
      inner.rotation.z = ear.rotation.z;
      part(
        head,
        "sphere",
        "black",
        side * 0.185,
        deer ? 0.62 : 0.25,
        0.3,
        0.046,
        0.06,
        0.04,
        "eye",
      );
      part(
        head,
        "sphere",
        "white",
        side * 0.188,
        deer ? 0.64 : 0.27,
        0.333,
        0.016,
        0.019,
        0.012,
      );
      if (deer) {
        const antler = part(
          head,
          "cylinder",
          "face",
          side * 0.12,
          1.01,
          0.09,
          0.033,
          0.36,
          0.033,
          "antler",
        );
        antler.rotation.z = -side * 0.2;
        const tine = part(
          head,
          "cylinder",
          "face",
          side * 0.2,
          1.09,
          0.09,
          0.025,
          0.19,
          0.025,
        );
        tine.rotation.z = -side * 0.7;
      }
    }
    const tail = part(
      body,
      "sphere",
      deer ? "belly" : "wool",
      0,
      1.05,
      -0.66,
      0.13,
      0.18,
      0.18,
      "tail",
    );
    const legs: { hip: THREE.Group; knee: THREE.Group; phase: number }[] = [];
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const hip = new THREE.Group();
        hip.name = `hip:${side}:${end}`;
        hip.position.set(side * 0.28, 0.7, end * 0.39);
        body.add(hip);
        part(hip, "sphere", coat, 0, -0.16, 0, deer ? 0.09 : 0.12, 0.23, 0.11);
        const knee = new THREE.Group();
        knee.name = `knee:${side}:${end}`;
        knee.position.y = -0.34;
        hip.add(knee);
        part(
          knee,
          "cylinder",
          deer ? "deer" : "face",
          0,
          -0.14,
          0,
          0.062,
          0.28,
          0.062,
        );
        part(
          knee,
          "sphere",
          "hoof",
          0,
          -0.29,
          0.028,
          0.085,
          0.07,
          0.12,
          "hoof",
        );
        part(knee, "box", "black", 0, -0.30, 0.134, 0.012, 0.055, 0.01, "cloven-hoof-seam");
        legs.push({ hip, knee, phase: side * end > 0 ? 0 : Math.PI });
      }
    return (pose: MovingObstaclePose) => {
      const gait = pose.stride * 3.5;
      const walking = Math.min(1, Math.hypot(pose.vx, pose.vz) / 1.5);
      for (const leg of legs) {
        const s = Math.sin(gait + leg.phase);
        leg.hip.rotation.x = s * 0.36 * walking;
        leg.knee.rotation.x = Math.max(0, -s) * 0.48 * walking;
      }
      head.rotation.y =
        Math.sin(pose.facing - pose.heading) * 0.16 * (1 - walking);
      tail.rotation.x = Math.sin(gait) * 0.12 * walking;
    };
  }
  function pendulum(
    body: THREE.Group,
    root: THREE.Group,
    spec: MovingObstacleSpec,
    roadWidth: number,
    groundAt: (x: number, z: number) => number = () => spec.y,
  ) {
    // Wide padded impact drum keeps the full collision radius visible down at
    // chassis height even at the apex of the authored low sweep.
    part(
      body,
      "cylinder",
      "rubber",
      0,
      0.295,
      0,
      0.99,
      0.51,
      0.99,
      "impact-skirt",
    );
    part(
      body,
      "cylinder",
      "metal",
      0,
      0.56,
      0,
      0.95,
      0.06,
      0.95,
      "skirt-collar",
    );
    part(body, "sphere", "rubber", 0, 1, 0, 0.99, 0.88, 0.99, "rubber-weight");
    part(body, "sphere", "paint", 0, 1.22, 0, 0.9, 0.64, 0.9, "painted-crown");
    const band = part(
      body,
      "ring",
      "accent",
      0,
      0.99,
      0,
      0.96,
      0.96,
      0.96,
      "bumper-band",
    );
    band.rotation.x = Math.PI / 2;
    band.scale.setScalar(0.92);
    part(body, "cylinder", "metal", 0, 1.84, 0, 0.22, 0.26, 0.22, "rod-socket");
    for (const y of [0.17, 0.36]) {
      const seam = part(body, "ring", "metal", 0, y, 0, 0.92, 0.92, 0.92, "skirt-reinforcement");
      seam.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      part(
        body,
        "sphere",
        "metal",
        Math.cos(a) * 0.75,
        1.54,
        Math.sin(a) * 0.75,
        0.055,
        0.055,
        0.055,
        "crown-rivet",
      );
    }
    const length = pendulumLength(spec),
      pivotY = spec.y + spec.radius + length;
    const rig = new THREE.Group();
    rig.name = `obstacle-rig:${spec.id}`;
    rig.position.set(spec.x, 0, spec.z);
    rig.rotation.y = spec.heading;
    root.add(rig);
    const span = Math.max(
      roadWidth / 2 + 4,
      Math.abs(spec.amplitude) + spec.radius + 2.5,
    );
    for (const side of [-1, 1]) {
      const ground = Math.min(
        ...[
          [0, 0],
          [-0.9, -1.1],
          [-0.9, 1.1],
          [0.9, -1.1],
          [0.9, 1.1],
        ].map(([dx, dz]) => {
          const x = side * span + dx;
          return groundAt(
            spec.x + Math.cos(spec.heading) * x + Math.sin(spec.heading) * dz,
            spec.z - Math.sin(spec.heading) * x + Math.cos(spec.heading) * dz,
          );
        }),
      );
      const base = ground - 0.15;
      part(
        rig,
        "box",
        "accent",
        side * span,
        base + 0.25,
        0,
        1.8,
        0.5,
        2.2,
        "support-foot",
      );
      part(
        rig,
        "box",
        "metal",
        side * span,
        (pivotY + base) / 2,
        0,
        0.8,
        pivotY - base,
        0.8,
        "support-post",
      );
      part(rig, "box", "paint", side * span, ground + 2, 0, 0.85, 2.2, 0.85);
      for (const dx of [-0.6, 0.6]) for (const dz of [-0.75, 0.75])
        part(rig, "cylinder", "metal", side * span + dx, base + 0.54, dz, 0.1, 0.11, 0.1, "foundation-anchor");
      for (const dz of [-0.43, 0.43]) for (const y of [ground + 1.1, ground + 2.9])
        part(rig, "sphere", "accent", side * span, y, dz, 0.09, 0.09, 0.04, "post-fastener");
      const brace = part(
        rig,
        "box",
        "metal",
        side * (span - 1),
        pivotY - 1,
        0,
        0.35,
        2.7,
        0.4,
      );
      brace.rotation.z = (side * -Math.PI) / 4;
    }
    part(
      rig,
      "box",
      "metal",
      0,
      pivotY + 0.3,
      0,
      span * 2 + 1,
      0.8,
      0.9,
      "crossbeam",
    );
    part(rig, "box", "paint", 0, pivotY + 0.3, 0.48, span * 2, 0.22, 0.05);
    const pivot = new THREE.Group();
    pivot.position.y = pivotY;
    pivot.name = "swing-pivot";
    rig.add(pivot);
    const axle = part(
      rig,
      "cylinder",
      "accent",
      0,
      pivotY,
      0,
      0.45,
      1.2,
      0.45,
      "pivot-axle",
    );
    axle.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const bearing = part(rig, "ring", "metal", 0, pivotY, side * 0.65, 0.5, 0.5, 0.5, "gimbal-bearing");
      bearing.rotation.z = Math.PI / 4;
      for (const x of [-0.38, 0.38]) part(rig, "sphere", "accent", x, pivotY + 0.33, side * 0.66, 0.07, 0.07, 0.06, "bearing-bolt");
    }
    part(
      pivot,
      "cylinder",
      "metal",
      0,
      -length / 2,
      0,
      0.13,
      length,
      0.13,
      "pendulum-rod",
    );
    return (pose: MovingObstaclePose) => {
      pivot.rotation.z = pose.swingAngle;
    };
  }
  const decks = new Map<string, THREE.BufferGeometry>();
  /** Extruded exact capsule: a broad low contact face, never a floating hull. */
  function deck(body: THREE.Object3D, half: number, radius: number, y: number, height: number, color: keyof typeof palette, name: string) {
    const key = `${half}:${radius}`;
    let geometry = decks.get(key);
    if (!geometry) {
      const shape = new THREE.Shape();
      shape.absarc(0, half, radius, 0, Math.PI, false);
      shape.absarc(0, -half, radius, Math.PI, Math.PI * 2, false);
      shape.closePath();
      geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 20 });
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, 0.5, 0);
      decks.set(key, geometry);
    }
    const mesh = new THREE.Mesh(geometry, materials[color]);
    mesh.scale.y = height;
    mesh.position.y = y;
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    body.add(mesh);
    return mesh;
  }
  function mechanism(body: THREE.Group, kind: string) {
    const spinner = kind === "spinner", mine = kind === "minecart", hauler = kind === "hauler", sweeper = kind === "sweeper";
    const half = spinner ? 0.8 : mine ? 0.45 : hauler ? 0.3 : 0;
    const flank = spinner ? 0.2 : mine ? 0.55 : hauler ? 0.7 : 1;
    const freight = mine || hauler;
    deck(body, half, flank * (spinner ? 0.95 : 0.995), spinner ? 0.20 : freight ? 0.215 : 0.26, spinner ? 0.42 : freight ? 0.19 : 0.3, "rubber", "impact-deck");
    deck(body, half * 0.98, flank * 0.95, 0.43, 0.065, "metal", "deck-rim");
    if (spinner) {
      // Padding follows the collision capsule all the way to both round ends.
      deck(body, 0.78, 0.185, 0.53, 0.17, "paint", "padded-arm");
      // Recessed pads and metal rails articulate the long face at kart eye height.
      // Their outermost point stays below the .20r capsule flank.
      for (const side of [-1, 1]) {
        for (const y of [0.025, 0.385])
          part(body, "box", "metal", side * 0.191, y, 0, 0.012, 0.04, 1.57, "arm-frame-rail");
        for (const z of [-0.65, -0.32, 0.32, 0.65]) {
          part(body, "box", "metal", side * 0.192, 0.205, z, 0.008, 0.27, 0.285, "pad-backing");
          part(body, "box", "rubber", side * 0.196, 0.205, z, 0.005, 0.22, 0.25, "replaceable-impact-pad");
          // Cream arrow wings are geometry, readable without fonts or textures.
          for (const sign of [-1, 1]) {
            const chevron = part(body, "box", "accent", side * 0.198, 0.205 + sign * 0.036, z, 0.002, 0.025, 0.12, "direction-chevron");
            chevron.rotation.x = sign * 0.6;
          }
          for (const y of [0.055, 0.36])
            part(body, "sphere", "accent", side * 0.197, y, z, 0.002, 0.013, 0.013, "frame-fastener");
        }
        part(body, "box", "paint", side * 0.186, 0.21, 0, 0.02, 0.33, 0.18, "central-load-bracket");
        for (const y of [0.09, 0.32])
          part(body, "sphere", "metal", side * 0.198, y, 0, 0.002, 0.023, 0.023, "bracket-bolt");
        part(body, "box", "accent", 0, 0.205, side * 0.93, 0.23, 0.235, 0.025, "reflective-end-panel");
        part(body, "box", "paint", 0, 0.205, side * 0.945, 0.06, 0.235, 0.015, "end-panel-stripe");
      }
      for (const z of [-0.78, -0.46, 0.46, 0.78]) {
        part(body, "box", "accent", 0, 0.622, z, 0.31, 0.015, 0.075, "arm-stripe");
        for (const side of [-1, 1]) part(body, "sphere", "metal", side * 0.13, 0.635, z, 0.022, 0.014, 0.022, "arm-rivet");
      }
      part(body, "cylinder", "metal", 0, 0.69, 0, 0.17, 0.29, 0.17, "bearing-housing");
      for (const y of [0.59, 0.79]) {
        const bearing = part(body, "ring", "accent", 0, y, 0, 0.17, 0.17, 0.17, "bearing-race");
        bearing.rotation.x = Math.PI / 2;
      }
      part(body, "cylinder", "accent", 0, 0.85, 0, 0.125, 0.04, 0.125, "bearing-cap");
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        part(body, "cylinder", "metal", Math.cos(a) * 0.095, 0.877, Math.sin(a) * 0.095, 0.014, 0.018, 0.014, "bearing-cap-bolt");
      }
      part(body, "box", "metal", 0, 0.88, 0, 0.1, 0.035, 0.1, "axle-lock");
      return (_pose: MovingObstaclePose) => {};
    }
    const width = mine ? 0.74 : hauler ? 1.05 : sweeper ? 1.3 : 1.2;
    const length = mine ? 1.36 : hauler ? 1.28 : 1.1;
    const wheels: THREE.Group[] = [];
    const wheelY = freight ? 0.225 : 0.19;
    const wheelRadius = freight ? 0.22 : 0.18;
    const wheelZ = mine ? 0.32 : hauler ? 0.22 : 0.45;
    const wheelX = mine ? 0.48 : hauler ? 0.62 : width / 2 + 0.025;
    for (const end of [-1, 1]) {
      const axle = part(body, "cylinder", "metal", 0, wheelY, end * wheelZ, 0.055, wheelX * 2, 0.055, "wheel-axle");
      axle.rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) {
        const wheel = new THREE.Group();
        wheel.name = "rolling-wheel";
        wheel.position.set(side * wheelX, wheelY, end * wheelZ);
        body.add(wheel);
        wheels.push(wheel);
        const tire = part(wheel, "cylinder", mine ? "metal" : "rubber", 0, 0, 0, wheelRadius, freight ? 0.085 : 0.12, wheelRadius, "wheel-tire");
        tire.rotation.z = Math.PI / 2;
        const hub = part(wheel, "cylinder", "accent", side * (freight ? 0.049 : 0.067), 0, 0, freight ? 0.15 : 0.10, 0.012, freight ? 0.15 : 0.10, "wheel-hub");
        hub.rotation.z = Math.PI / 2;
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2;
          part(wheel, "sphere", "metal", side * (freight ? 0.059 : 0.083), Math.cos(a) * 0.064, Math.sin(a) * 0.064, freight ? 0.006 : 0.012, 0.02, 0.02, "wheel-bolt");
        }
      }
    }
    if (mine || hauler) {
      part(body, "box", "wood", 0, 0.55, 0, width, 0.17, length, "cargo-bed");
      for (const side of [-1, 1]) {
        part(body, "box", mine ? "paint" : "metal", side * (width / 2 - 0.045), 0.78, 0, 0.08, 0.48, length, "cargo-side");
        for (const z of [-0.48, 0, 0.48]) {
          part(body, "box", "metal", side * (width / 2 + 0.005), 0.8, z, 0.025, 0.48, 0.06, "panel-strap");
          for (const y of [0.61, 0.96]) part(body, "sphere", "accent", side * (width / 2 + 0.02), y, z, 0.02, 0.025, 0.025, "panel-rivet");
        }
        part(body, "box", mine ? "paint" : "wood", 0, 0.78, side * (length / 2 - 0.045), width - 0.05, 0.48, 0.08, "cargo-end");
      }
      if (mine) {
        for (let i = 0; i < 7; i++) {
          const ore = part(body, "box", i % 2 ? "ore" : "metal", (i % 2 ? -1 : 1) * 0.15, 0.97 + (i % 3) * 0.07, -0.42 + i * 0.13, 0.29, 0.29, 0.3, "ore-chunk");
          ore.rotation.set(i * 0.31, i * 0.77, i * 0.27);
        }
      } else {
        for (const z of [-0.29, 0.29]) {
          part(body, "box", "wood", 0, 1.04, z, 0.82, 0.65, 0.51, "freight-crate");
          for (const x of [-0.25, 0.25]) part(body, "box", "rubber", x, 1.37, z, 0.055, 0.018, 0.5, "cargo-belt");
          for (const end of [-1, 1]) {
            for (const x of [-0.25, 0.25]) {
              part(body, "box", "rubber", x, 1.04, z + end * 0.258, 0.055, 0.64, 0.012, "cargo-belt-wrap");
              part(body, "box", "metal", x, 1.13, z + end * 0.267, 0.079, 0.073, 0.012, "belt-buckle");
            }
            for (const y of [0.88, 1.04, 1.2])
              part(body, "box", "face", 0, y, z + end * 0.257, 0.78, 0.008, 0.008, "crate-plank-seam");
          }
          for (const side of [-1, 1]) part(body, "box", "accent", side * 0.416, 1.04, z, 0.018, 0.06, 0.49, "crate-batten");
        }
      }
    } else {
      part(body, "box", "paint", 0, 0.81, 0, width, 0.66, 0.98, "machine-cowling");
      part(body, "box", "accent", 0, 1.17, 0, width + 0.04, 0.08, 1.0, "cowling-lid");
      part(body, "box", "glass", 0, 0.97, 0.50, width * 0.65, 0.24, 0.025, "control-window");
      for (const side of [-1, 1]) {
        for (const z of [-0.32, 0, 0.32]) part(body, "box", "metal", side * (width / 2 + 0.01), 0.77, z, 0.02, 0.18, 0.08, "cooling-louver");
        for (const z of [-0.42, 0.42]) part(body, "sphere", "metal", side * width * 0.4, 1.22, z, 0.025, 0.015, 0.025, "lid-fastener");
        part(body, "box", "accent", side * 0.37, 0.68, 0.51, 0.16, 0.09, 0.03, "reflector");
      }
    }
    const brushes: THREE.Mesh[] = [];
    if (sweeper) for (const side of [-1, 1]) {
      const brush = part(body, "cylinder", "rubber", side * 0.43, 0.14, 0.53, 0.24, 0.11, 0.24, "sweeper-brush");
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5;
        part(brush, "box", "face", Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8, 0.13, 1, 0.13, "brush-bristle");
      }
      brushes.push(brush);
    }
    return (pose: MovingObstaclePose) => {
      for (const wheel of wheels) wheel.rotation.x = pose.offset / (pose.radius * wheelRadius);
      for (const brush of brushes) brush.rotation.y = pose.offset * 3;
    };
  }
  return { animal, pendulum, mechanism, deck, part };
}
