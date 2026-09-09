import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KART_FOOTPRINT, kartContact } from "../shared/kart-contact.ts";
import * as renderMotion from "../client/render-motion.ts";
import { createKartModel } from "../client/kart-model.ts";
import { separateCars, spawnCar } from "../shared/race.ts";
import { DEFAULT_TRACK, trackPoint } from "../shared/track.ts";

const track = {
  ...DEFAULT_TRACK,
  width: 32,
  widthProfile: undefined,
  obstacles: [],
};
const p = trackPoint(0, track);
const model = createKartModel("#aec83e");
const bounds = new THREE.Box3().setFromObject(model, true);
function pair(lateral: number, longitudinal: number, heading = p.heading) {
  const a = spawnCar(0, "a", track),
    b = spawnCar(1, "b", track);
  Object.assign(a, { x: p.x, z: p.z, heading: p.heading });
  Object.assign(b, {
    x: p.x + Math.cos(p.heading) * lateral + Math.sin(p.heading) * longitudinal,
    z: p.z - Math.sin(p.heading) * lateral + Math.cos(p.heading) * longitudinal,
    heading,
  });
  return [a, b];
}

test("rear contact keeps the complete authored nose out of the other kart's rear body", () => {
  const [a, b] = pair(0, 2);
  separateCars([a, b], track);
  const gap =
    (b.x - a.x) * Math.sin(p.heading) + (b.z - a.z) * Math.cos(p.heading);
  assert.ok(
    gap >= bounds.max.z - bounds.min.z,
    `body overlap: ${gap} m centre spacing for ${bounds.max.z - bounds.min.z} m body`,
  );
});

test("side contact keeps the steering wheel envelope outside the other kart", () => {
  const [a, b] = pair(2, 0);
  for (const side of ["left", "right"])
    model.getObjectByName(`wheel-front-${side}`)!.rotation.y = 0.38;
  const width = new THREE.Box3()
    .setFromObject(model, true)
    .getSize(new THREE.Vector3()).x;
  separateCars([a, b], track);
  const gap =
    (b.x - a.x) * Math.cos(p.heading) - (b.z - a.z) * Math.sin(p.heading);
  assert.ok(
    gap >= width,
    `tire/body overlap: ${gap} m spacing for ${width} m steering envelope`,
  );
});

test("head-on contact uses both front bumpers rather than the old circle diameter", () => {
  const [a, b] = pair(0, 2, p.heading + Math.PI);
  separateCars([a, b], track);
  const gap =
    (b.x - a.x) * Math.sin(p.heading) + (b.z - a.z) * Math.cos(p.heading);
  assert.ok(gap >= bounds.max.z * 2, `front body overlap: ${gap} m spacing`);
});

test("the contact footprint encloses every authored and delivered vertex through steering and rolling", async () => {
  const bytes = readFileSync(
    new URL("../public/models/kart/club-kart.glb", import.meta.url),
  );
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  const point = new THREE.Vector3();
  for (const root of [model, gltf.scene]) {
    const meshes: THREE.Mesh[] = [],
      wheels: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node instanceof THREE.Mesh) meshes.push(node);
      if (node.userData.wheelRadius) wheels.push(node);
    });
    let closest = Infinity,
      closestPart = "";
    for (let s = 0; s <= 16; s++) {
      for (const wheel of wheels) {
        if (wheel.userData.steerable)
          wheel.rotation.y = -0.38 + (s * 0.76) / 16;
        wheel.getObjectByName(wheel.userData.spinNode)!.rotation.x =
          (s * Math.PI) / 8;
      }
      root.updateMatrixWorld(true);
      for (const mesh of meshes) {
        const positions = mesh.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          point
            .fromBufferAttribute(positions, i)
            .applyMatrix4(mesh.matrixWorld);
          for (let edge = 0; edge < KART_FOOTPRINT.length; edge++) {
            const a = KART_FOOTPRINT[edge],
              b = KART_FOOTPRINT[(edge + 1) % KART_FOOTPRINT.length];
            const clearance =
              ((b[0] - a[0]) * (point.z - a[1]) -
                (b[1] - a[1]) * (point.x - a[0])) /
              Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (clearance < closest) {
              closest = clearance;
              closestPart = `${mesh.name} ${point.toArray()} edge ${edge}`;
            }
          }
        }
      }
    }
    assert.ok(
      closest >= 0.01,
      `${root.name}: a rendered vertex escapes the collision footprint by ${-closest} m (${closestPart})`,
    );
  }
});

test("oblique impacts separate at all headings without adding kinetic energy", () => {
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
    const [a, b] = pair(
      Math.cos(angle) * 2,
      Math.sin(angle) * 2,
      p.heading + angle,
    );
    a.vx = 32;
    a.vz = 12;
    b.vx = -16;
    b.vz = -8;
    const energy = a.vx * a.vx + a.vz * a.vz + b.vx * b.vx + b.vz * b.vz;
    separateCars([a, b], track);
    assert.equal(kartContact(a, b), null, `heading ${angle}`);
    assert.ok(
      a.vx * a.vx + a.vz * a.vz + b.vx * b.vx + b.vz * b.vz <= energy + 1e-7,
    );
    assert.ok([a.x, a.z, b.x, b.z].every(Number.isFinite));
  }
});

test("a six-kart squeeze by a boundary separates complete silhouettes", () => {
  const cars = Array.from({ length: 6 }, (_, i) => {
    const [a] = pair(0, 0);
    a.id = String(i);
    const lateral = 12 - (i % 3) * 1.2,
      longitudinal = Math.floor(i / 3) * 1.5;
    a.x =
      p.x + Math.cos(p.heading) * lateral + Math.sin(p.heading) * longitudinal;
    a.z =
      p.z - Math.sin(p.heading) * lateral + Math.cos(p.heading) * longitudinal;
    return a;
  });
  for (let frame = 0; frame < 120; frame++) {
    separateCars(cars, track);
    for (let i = 0; i < cars.length; i++)
      for (let j = i + 1; j < cars.length; j++)
        assert.equal(
          kartContact(cars[i], cars[j]),
          null,
          `frame ${frame}, ${i}/${j}`,
        );
  }
});

test("a six-kart pack in an eight-metre corridor cannot leave cars interpenetrating", () => {
  const narrow = { ...track, width: 8 };
  const cars = Array.from({ length: 6 }, (_, i) => {
    const [a] = pair(0, 0);
    a.id = String(i);
    const lateral = 2.94 - (i % 3) * 1.2,
      longitudinal = Math.floor(i / 3) * 1.5;
    a.x =
      p.x + Math.cos(p.heading) * lateral + Math.sin(p.heading) * longitudinal;
    a.z =
      p.z - Math.sin(p.heading) * lateral + Math.cos(p.heading) * longitudinal;
    return a;
  });
  separateCars(cars, narrow);
  for (let i = 0; i < cars.length; i++)
    for (let j = i + 1; j < cars.length; j++)
      assert.equal(
        kartContact(cars[i], cars[j]),
        null,
        `narrow pack ${i}/${j}`,
      );
});

test("render interpolation cannot reintroduce penetration or mutate live race state", () => {
  const [a, b] = pair(3.21, 0);
  const previous = [renderMotion.capturePose(a), renderMotion.capturePose(b)];
  a.heading += Math.PI;
  b.heading += Math.PI;
  assert.equal(kartContact(a, b), null);
  const interpolated = [a, b].map((c, i) =>
    renderMotion.interpolateCar(c, previous[i], 0.5),
  );
  assert.ok(
    kartContact(...(interpolated as [typeof a, typeof b])),
    "repro must overlap between legal endpoints",
  );
  const resolve = (
    renderMotion as unknown as {
      separateRenderCars?: (cars: typeof interpolated) => typeof interpolated;
    }
  ).separateRenderCars;
  assert.equal(
    typeof resolve,
    "function",
    "the render path must resolve interpolated contacts",
  );
  const before = structuredClone(interpolated);
  const visible = resolve!(interpolated);
  assert.equal(kartContact(visible[0], visible[1]), null);
  assert.deepEqual(
    interpolated,
    before,
    "presentation must never change physics, resources, timers or feedback",
  );
  const excluded = before.map((c) => ({ ...c, ghostTime: 1 }));
  assert.deepEqual(
    resolve!(excluded),
    excluded,
    "reset protection and ghost laps keep their intentional pass-through behavior",
  );
});
