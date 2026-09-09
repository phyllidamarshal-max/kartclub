import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import {
  TRACKS,
  trackWidth,
  shortcutWidthAt,
  type Track,
} from "../shared/track.ts";
import { ambientDirection } from "../client/ambient-direction.ts";
import { coastalShoreMargin } from "../client/coast-details.ts";
import { AmbientFauna, type FaunaPath } from "../client/ambient-fauna.ts";

const actorTracks = TRACKS.filter((t) => ambientDirection(t.id)?.actor);
const near = new THREE.Vector3();
function clearance(track: Track, x: number, z: number, shore = false) {
  let result = Infinity;
  for (const [points, closed, shortcut] of [
    [track.points, true, false],
    [track.shortcut, false, true],
  ] as const)
    for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const f = Math.max(
        0,
        Math.min(
          1,
          ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1),
        ),
      );
      const t = (a.t + ((b.t < a.t ? b.t + 1 : b.t) - a.t) * f) % 1;
      result = Math.min(
        result,
        Math.hypot(x - a.x - f * dx, z - a.z - f * dz) -
          (shortcut ? shortcutWidthAt(t, track) : trackWidth(t, track)) / 2 -
          (shore && !shortcut ? coastalShoreMargin(t, track) : 0),
      );
    }
  return result;
}
function pose(group: THREE.Group) {
  const values: number[] = [];
  group.traverse((o) =>
    values.push(
      ...o.position.toArray(),
      ...o.quaternion.toArray(),
      ...o.scale.toArray(),
    ),
  );
  return values;
}
test("exactly the seven authored fauna maps are supported; unknown reference is deliberately empty", () => {
  assert.equal(actorTracks.length, 7);
  for (const id of ["city", "reference-coast-v1"]) {
    const fauna = new AmbientFauna(new THREE.Scene(), { ...TRACKS[0], id });
    assert.equal(fauna.root.children.length, 0);
    fauna.dispose();
  }
});
for (const track of actorTracks) {
  test(`${track.id}: entire path envelope clears every main and shortcut corridor`, () => {
    const fauna = new AmbientFauna(new THREE.Scene(), track);
    const paths = fauna.root.userData.paths as FaunaPath[];
    assert.ok(paths.length > 0, "authored map must find a safe placement");
    for (const path of paths) {
      for (const point of path.samples) {
        assert.ok(
          clearance(track, point.x, point.z, path.species === "whale") >=
            path.radius + 2,
          `path intersects road/shore envelope: ${point.x},${point.z}`,
        );
      }
    }
    fauna.dispose();
  });
  test(`${track.id}: absolute poses repeat, phase boundaries remain finite and low quality respects count`, () => {
    const fauna = new AmbientFauna(new THREE.Scene(), track);
    const profile = ambientDirection(track.id)!;
    const path = fauna.root.userData.paths[0] as FaunaPath;
    near.set(path.x, 0, path.z);
    fauna.update(2.5, near, false);
    const first = pose(fauna.root);
    fauna.update(2.5 + profile.cycle, near, false);
    assert.ok(
      pose(fauna.root).every(
        (value, index) => Math.abs(value - first[index]) < 1e-8,
      ),
      "complete animation must loop",
    );
    fauna.update(11, near, false);
    fauna.update(2.5, near, false);
    assert.deepEqual(pose(fauna.root), first);
    for (const t of [
      -1,
      0,
      0.00001,
      profile.active - 0.00001,
      profile.active,
      profile.cycle - 0.00001,
      profile.cycle,
      profile.cycle + 0.00001,
      1e6,
    ]) {
      fauna.update(t, near, false);
      assert.ok(pose(fauna.root).every(Number.isFinite));
    }
    fauna.update(2.5, near, true);
    assert.ok(
      fauna.root.children.filter((o) => o.visible).length <=
        (profile.actor === "camel" ? 2 : 1),
    );
    fauna.update(1, near, false, true);
    const reduced = pose(fauna.root);
    fauna.update(25, near, false, true);
    assert.deepEqual(
      pose(fauna.root),
      reduced,
      "reduced motion must be static",
    );
    fauna.dispose();
  });
}
test("camel feet use supplied rendered terrain; stance contacts have no floating or penetration", () => {
  const track = TRACKS.find((t) => t.id === "desert-canyon")!;
  const ground = (x: number, z: number) => 10 + x * 0.025 + z * 0.015;
  const fauna = new AmbientFauna(new THREE.Scene(), track, {
    groundHeight: ground,
  });
  const path = fauna.root.userData.paths[0] as FaunaPath;
  near.set(path.x, 10, path.z);
  const p = new THREE.Vector3();
  for (const t of [0, 0.4, 0.8, 1.2, 25.999, 26, 37.999, 38]) {
    fauna.update(t, near, false);
    fauna.root.updateMatrixWorld(true);
    let stance = 0;
    fauna.root.traverse((o) => {
      if (o.name !== "camel-foot-contact") return;
      o.getWorldPosition(p);
      const lift = p.y - ground(p.x, p.z);
      assert.ok(lift >= -1e-5 && lift <= 0.18, `invalid foot contact ${lift}`);
      if (lift < 1e-5) stance++;
    });
    assert.ok(stance >= 6, "at least two stance feet per camel");
  }
  fauna.dispose();
});
test("finite culling freezes poses, resumes deterministically, and disposal releases each shared resource once", () => {
  const fauna = new AmbientFauna(new THREE.Scene(), TRACKS[0]);
  const path = fauna.root.userData.paths[0] as FaunaPath;
  near.set(path.x, 0, path.z);
  fauna.update(2.5, near, false);
  const first = pose(fauna.root);
  fauna.update(12, new THREE.Vector3(1e5, 0, 1e5), false);
  assert.ok(fauna.root.children.every((o) => !o.visible));
  assert.deepEqual(pose(fauna.root), first);
  fauna.update(2.5, near, false);
  assert.deepEqual(pose(fauna.root), first);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  fauna.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      resources.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        resources.add(m);
    }
  });
  const counts = new Map<object, number>();
  for (const r of resources)
    r.addEventListener("dispose", () =>
      counts.set(r, (counts.get(r) ?? 0) + 1),
    );
  fauna.dispose();
  fauna.dispose();
  fauna.update(10, near, false);
  assert.equal(fauna.root.parent, null);
  assert.equal(fauna.root.children.length, 0);
  assert.equal(counts.size, resources.size);
  assert.ok([...counts.values()].every((n) => n === 1));
});
test("bounded resource budgets and no global clocks, listeners or per-frame resource constructors", () => {
  for (const track of actorTracks) {
    const fauna = new AmbientFauna(new THREE.Scene(), track);
    const materials = new Set<THREE.Material>();
    for (const actor of fauna.root.children) {
      let triangles = 0;
      actor.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          triangles +=
            (o.geometry.index?.count ?? o.geometry.attributes.position.count) /
            3;
          assert.ok(
            o.geometry.groups.length <= 3,
            "a body must not split into hundreds of draw calls",
          );
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            materials.add(m);
        }
      });
      assert.ok(triangles <= 6000);
      if (ambientDirection(track.id)!.actor !== "bird")
        assert.ok(triangles >= 3000, `underspecified model ${triangles}`);
    }
    assert.ok(materials.size <= 5);
    fauna.dispose();
  }
  const source = readFileSync(
    new URL("../client/ambient-fauna.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /requestAnimationFrame|setInterval|setTimeout|addEventListener|Math\.random|Date\.now|performance\.now/,
  );
  const update = source.slice(
    source.indexOf("  update("),
    source.indexOf("  dispose("),
  );
  assert.doesNotMatch(update, /new THREE\.(?:.*Geometry|.*Material)/);
});

test("a fully occupied verge yields an empty layout instead of an unsafe fallback", () => {
  const scene = new THREE.Scene();
  const landmark = new THREE.Group();
  landmark.userData.footprintRadius = 1e6;
  scene.add(landmark);
  const fauna = new AmbientFauna(
    scene,
    TRACKS.find((t) => t.id === "desert-canyon")!,
  );
  assert.equal(fauna.root.children.length, 0);
  assert.deepEqual(fauna.root.userData.paths, []);
  fauna.dispose();
});

test("animated mesh vertices stay inside the independently declared safety radius", () => {
  const p = new THREE.Vector3();
  for (const id of ["coast", "desert-canyon", "mountain"]) {
    const track = TRACKS.find((t) => t.id === id)!;
    const fauna = new AmbientFauna(new THREE.Scene(), track);
    const path = fauna.root.userData.paths[0] as FaunaPath;
    near.set(path.x, 0, path.z);
    for (let step = 0; step <= 16; step++) {
      fauna.update((step / 16) * ambientDirection(id)!.cycle, near, false);
      fauna.root.updateMatrixWorld(true);
      for (const actor of fauna.root.children)
        actor.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const position = o.geometry.attributes.position;
          for (let i = 0; i < position.count; i++) {
            p.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
            assert.ok(
              Math.hypot(p.x - actor.position.x, p.z - actor.position.z) <=
                path.radius + 1e-5,
              `${id} exceeds conservative body radius`,
            );
          }
        });
    }
    fauna.dispose();
  }
});

test("independent scene libraries never share ownership of disposable resources", () => {
  const a = new AmbientFauna(new THREE.Scene(), TRACKS[0]),
    b = new AmbientFauna(new THREE.Scene(), TRACKS[0]);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  a.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      resources.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        resources.add(m);
    }
  });
  b.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      assert.ok(!resources.has(o.geometry));
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        assert.ok(!resources.has(m));
    }
  });
  a.dispose();
  const path = b.root.userData.paths[0] as FaunaPath;
  b.update(2.5, new THREE.Vector3(path.x, 0, path.z), false);
  assert.equal(b.root.children[0].visible, true);
  b.dispose();
});

test("camel and bird paths exclude small authored prop footprints, including cacti", () => {
  for (const id of ["desert-canyon", "mountain"]) {
    const track = TRACKS.find((t) => t.id === id)!;
    const empty = new AmbientFauna(new THREE.Scene(), track);
    const original = empty.root.userData.paths[0] as FaunaPath;
    const occupied = original.samples[0];
    empty.dispose();
    const scene = new THREE.Scene(),
      cactus = new THREE.Group();
    cactus.name = "desert-cactus";
    cactus.position.set(occupied.x, 0, occupied.z);
    cactus.userData.footprintRadius = 2.8;
    scene.add(cactus);
    const fauna = new AmbientFauna(scene, track);
    assert.ok(
      fauna.root.userData.paths.length > 0,
      "must find a safe alternative on an authored map",
    );
    for (const path of fauna.root.userData.paths as FaunaPath[])
      for (const p of path.samples)
        assert.ok(
          Math.hypot(p.x - occupied.x, p.z - occupied.z) >=
            2.8 + path.radius + 2,
          "small authored prop intersects path",
        );
    fauna.dispose();
  }
});

test("every camel upper leg starts inside supporting torso geometry across gait poses", () => {
  const track = TRACKS.find((t) => t.id === "desert-canyon")!;
  const fauna = new AmbientFauna(new THREE.Scene(), track, {
    groundHeight: () => 0,
  });
  const path = fauna.root.userData.paths[0] as FaunaPath;
  const ray = new THREE.Raycaster(),
    hip = new THREE.Vector3(),
    down = new THREE.Vector3(0, -1, 0),
    up = new THREE.Vector3(0, 1, 0);
  near.set(path.x, 0, path.z);
  for (const t of [0, 1, 7, 13, 20, 26, 37.999]) {
    fauna.update(t, near, false);
    fauna.root.updateMatrixWorld(true);
    for (const actor of fauna.root.children) {
      const torso = actor.children.filter((o) =>
        o.name.startsWith("camel-body-static-material"),
      );
      for (const limb of actor.children.filter(
        (o) => o.name === "camel-upper-leg",
      )) {
        hip.set(0, -0.5, 0).applyMatrix4(limb.matrixWorld);
        ray.set(new THREE.Vector3(hip.x, hip.y + 5, hip.z), down);
        const top = ray.intersectObjects(torso, false)[0]?.point.y;
        ray.set(new THREE.Vector3(hip.x, hip.y - 5, hip.z), up);
        const bottom = ray.intersectObjects(torso, false)[0]?.point.y;
        assert.ok(
          top !== undefined && bottom !== undefined,
          "hip must project into torso silhouette",
        );
        assert.ok(
          hip.y > bottom! + 0.04 && hip.y < top! - 0.04,
          `upper leg floats outside torso: hip=${hip.y}, body=${bottom}..${top}`,
        );
      }
    }
  }
  fauna.dispose();
});

test("bird wing transforms remain continuous through takeoff, landing and cycle wrap", () => {
  for (const id of ["mountain", "forest-orchard", "forest-ridge"]) {
    const track = TRACKS.find((t) => t.id === id)!,
      profile = ambientDirection(id)!;
    const fauna = new AmbientFauna(new THREE.Scene(), track);
    const p = fauna.root.userData.paths[0] as FaunaPath;
    near.set(p.x, 0, p.z);
    for (const boundary of [0, profile.active, profile.cycle]) {
      fauna.update(boundary - 1e-6, near, false);
      const before = pose(fauna.root);
      fauna.update(boundary + 1e-6, near, false);
      const after = pose(fauna.root);
      assert.ok(
        before.every((value, index) => Math.abs(value - after[index]) < 1e-4),
        `${id} snaps at ${boundary}`,
      );
    }
    fauna.dispose();
  }
});
