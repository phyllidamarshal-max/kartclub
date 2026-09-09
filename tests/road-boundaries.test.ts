import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  TRACKS,
  nearestTrack,
  trackWidth,
  shortcutWidthAt,
  trackWidthRange,
} from "../shared/track.ts";
import { buildRoadGeometry } from "../client/world.ts";
import { buildDrivingSurfaces } from "../client/level-surfaces.ts";
import { mapProfile } from '../shared/map-profiles.ts';

for (const track of TRACKS)
  test(`${track.id} renders the variable road and keeps branch junctions unobstructed`, () => {
    const scene = new THREE.Scene();
    buildRoadGeometry(scene, track, new THREE.MeshStandardMaterial());
    scene.updateMatrixWorld(true);
    assert.ok(scene.getObjectByName("main-road"));
    if (!mapProfile(track.id).isNew || trackWidthRange(track).min <= 12.5) assert.ok(
      scene.getObjectByName("narrow-road-warning"),
      "narrow advanced sections need advance warnings; gentle wide tapers remain uncluttered",
    );
    assert.ok(scene.getObjectByName("main-guardrail"));
    const mainRail = scene.getObjectByName(
      "main-guardrail",
    ) as THREE.InstancedMesh;
    const railMatrix = new THREE.Matrix4();
    let totalRailLength = 0;
    for (let i = 0; i < mainRail.count; i++) {
      mainRail.getMatrixAt(i, railMatrix);
      totalRailLength += new THREE.Vector3()
        .setFromMatrixColumn(railMatrix, 2)
        .length();
    }
    assert.ok(
      totalRailLength > track.length * 3.4,
      "junction cuts removed a large portion of the continuous guardrail",
    );
    const road = scene.getObjectByName("main-road") as THREE.Mesh;
    const positions = road.geometry.getAttribute("position");
    // First and third vertices of each strip triangle are the two exact road edges.
    for (let i = 0; i < track.points.length; i += 12) {
      const v = i * 6;
      const width = Math.hypot(
        positions.getX(v) - positions.getX(v + 2),
        positions.getZ(v) - positions.getZ(v + 2),
      );
      assert.ok(Math.abs(width - trackWidth(track.points[i].t, track)) < 0.001);
    }
    const ray = new THREE.Raycaster();
    // Real instance geometry is indexed into local cells so thousands of rays do
    // not scan every guardrail instance around the entire kilometre-long lap.
    const cells = new Map<string, THREE.Mesh[]>();
    const indexMesh = (mesh: THREE.Mesh) => {
      const box = new THREE.Box3().setFromObject(mesh);
      for (
        let x = Math.floor(box.min.x / 8);
        x <= Math.floor(box.max.x / 8);
        x++
      )
        for (
          let z = Math.floor(box.min.z / 8);
          z <= Math.floor(box.max.z / 8);
          z++
        ) {
          const key = `${x},${z}`,
            bucket = cells.get(key) ?? [];
          bucket.push(mesh);
          cells.set(key, bucket);
        }
    };
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.InstancedMesh) {
        for (let i = 0; i < object.count; i++) {
          const instance = new THREE.Mesh(object.geometry, object.material);
          object.getMatrixAt(i, instance.matrix);
          instance.matrix.premultiply(object.matrixWorld);
          instance.matrixAutoUpdate = false;
          instance.updateMatrixWorld(true);
          indexMesh(instance);
        }
      } else if (
        object.name.includes("road") ||
        object.name.includes("shoulder") ||
        object.name.includes("curb") ||
        object.name.includes("line")
      )
        return;
      else indexMesh(object);
    });
    for (const [route, branch] of [
      [track.points, "main"],
      [track.shortcut, "shortcut"],
    ] as const) {
      if (route.length < 2) continue;
      assert.ok(scene.getObjectByName(`${branch}-guardrail`));
      for (const p of route) {
        const width =
          branch === "main"
            ? trackWidth(p.t, track)
            : shortcutWidthAt(p.t, track);
        for (const side of [-1, -0.5, 0, 0.5, 1]) {
          const lateral = side * (width / 2 - 0.25);
          const x = p.x + Math.cos(p.heading) * lateral,
            z = p.z - Math.sin(p.heading) * lateral;
          ray.set(
            new THREE.Vector3(x, p.y + 0.16, z),
            new THREE.Vector3(0, 1, 0),
          );
          ray.far = 5.8;
          const nearby =
            cells.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`) ?? [];
          assert.equal(
            ray.intersectObjects(nearby, false).length,
            0,
            `${branch} blocked at t=${p.t.toFixed(4)}, lateral=${lateral.toFixed(2)}`,
          );
        }
      }
    }
    const bounds = trackWidthRange(track);
    assert.ok(bounds.max > bounds.min);
  });

test("driving-surface zones are clipped to a narrow road including their arrows", () => {
  const track = {
    ...TRACKS.find((t) => t.id === "city-nightshift")!,
    width: 5,
    widthProfile: [
      { t: 0, width: 5 },
      { t: 1, width: 5 },
    ],
  };
  const scene = new THREE.Scene();
  buildDrivingSurfaces(scene, track);
  scene.updateMatrixWorld(true);
  const maxRadius = 2.5;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(object.matrixWorld);
      const nearest = nearestTrack(p.x, p.z, track).distance;
      assert.ok(
        nearest < maxRadius + 0.02,
        "surface escaped the drivable width",
      );
    }
  });
});
