import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRACKS, nearestTrack, trackPoint, trackWidth, angleDiff } from '../shared/track.ts';
import { roadsideClear } from '../client/scenery.ts';
import { movingObstaclesAt } from '../shared/moving-obstacles.ts';
import { movingObstacleClearance } from '../shared/moving-obstacles.ts';
import { EMPTY_INPUT, spawnCar, stepCar, separateCars } from '../shared/race.ts';
import { buildLevelLandscape } from '../client/level-scenery.ts';
import { buildRoadGeometry } from '../client/world.ts';
import { World } from '../client/world.ts';
import { buildMovingObstacles } from '../client/moving-obstacles.ts';
import * as THREE from 'three';

test('first batch matches map difficulty and theme without populating every race with traffic', () => {
  for (const [id, kind, count] of [
    ['forest-orchard', 'sheep', 1], ['forest-ridge', 'deer', 2],
    ['factory-shift', 'pendulum', 3], ['mine-transit', 'pendulum', 2],
  ] as const) {
    const specs = TRACKS.find(t => t.id === id)!.movingObstacles!;
    assert.equal(specs.filter(s => s.kind === kind).length, count, id);
  }
  assert.equal(TRACKS.filter(t => !t.movingObstacles?.length).length, 12);
});

test('new mechanisms are assigned to matching courses with different timing decisions', () => {
  for (const [id, kind, count] of [
    ['city-switchback', 'spinner', 2], ['space-interchange', 'spinner', 1],
    ['mine-transit', 'minecart', 1], ['harbor-dual', 'hauler', 1],
  ] as const) {
    const specs = TRACKS.find(t => t.id === id)!.movingObstacles!;
    assert.equal(specs.filter(s => s.kind === kind).length, count, id);
    assert.equal(new Set(specs.map(s => s.id)).size, specs.length, 'stable unique IDs');
  }
});

test('crossings have advance sight distance, usable passing space and separation from route joins', () => {
  for (const track of TRACKS) for (const spec of track.movingObstacles ?? []) {
    const p = nearestTrack(spec.x, spec.z, track);
    assert.ok(p.t * track.length >= 150, spec.id);
    for (const distance of (spec.kind === 'shuttle' ? [-32, 32] : [-96, -64, -32, 32])) {
      const ahead = trackPoint(p.t + distance / track.length, track);
      assert.ok(Math.abs(angleDiff(ahead.heading, p.heading)) < .12, `${spec.id}: sight ${distance}`);
    }
    for (let i = 0; i < 80; i++) {
      const pose = movingObstaclesAt({ movingObstacles: [spec] }, spec.period * i / 80)[0];
      const half = trackWidth(p.t, track) / 2;
      assert.ok(half + Math.abs(pose.offset) - spec.radius > 5.3, `${spec.id}: passing gap`);
    }
    for (const q of track.shortcut) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) > 35, spec.id);
  }
});

test('animals rest clear of the racing line and their entire transit corridor excludes scenery', () => {
  for (const track of TRACKS) for (const spec of track.movingObstacles ?? []) {
    if (spec.kind !== 'sheep' && spec.kind !== 'deer') continue;
    const p = nearestTrack(spec.x, spec.z, track);
    assert.ok(spec.amplitude - spec.radius > trackWidth(p.t, track) / 2 + 1, spec.id);
    for (let i = -10; i <= 10; i++) {
      const side = spec.amplitude * i / 10;
      assert.equal(roadsideClear(track, spec.x + Math.cos(spec.heading) * side,
        spec.z - Math.sin(spec.heading) * side, .5), false, `${spec.id}: verge ${side}`);
    }
  }
});

test('crossing animals cannot trap parked karts between their body and the road edge', () => {
  for (const track of TRACKS) for (const spec of track.movingObstacles ?? []) {
    if (spec.kind !== 'sheep' && spec.kind !== 'deer') continue;
    const p = nearestTrack(spec.x, spec.z, track);
    for (const side of [-1, 1]) {
      const car = spawnCar(0, 'parked', track);
      const lateral = side * (trackWidth(p.t, track) / 2 - 1.8);
      const x = spec.x + Math.cos(p.heading) * lateral;
      const z = spec.z - Math.sin(p.heading) * lateral;
      Object.assign(car, { x, z, lastX: x, lastZ: z, heading: p.heading,
        lastT: p.t, progress: p.t, spawnProgress: p.t, ghostTime: 0 });
      for (let tick = 0; tick < spec.period * 60; tick++) {
        const clock = tick / 60;
        const beforeX = car.x, beforeZ = car.z;
        stepCar(car, EMPTY_INPUT, 1 / 60, track, clock);
        separateCars([car], track, clock + 1 / 60);
        const pose = movingObstaclesAt({ movingObstacles: [spec] }, clock + 1 / 60)[0];
        assert.ok(movingObstacleClearance(car, pose).distance >= -.002,
          `${spec.id}/${side} pinched at ${clock}: ${movingObstacleClearance(car, pose).distance}`);
        assert.equal(car.resetTime, 0, spec.id);
        assert.ok(Math.hypot(car.x - beforeX, car.z - beforeZ) < 3.5,
          `${spec.id}: contact must recover locally without launching the kart`);
      }
    }
  }
});

test('real World static batching preserves animated bodies and hanging rods', () => {
  for (const id of ['factory-shift', 'forest-orchard', 'forest-ridge', 'harbor-dual']) {
    const track = TRACKS.find(t => t.id === id)!;
    const scene = new THREE.Scene(), moving = buildMovingObstacles(scene, track);
    const world = Object.assign(Object.create(World.prototype), { scene, propellers: [] });
    const meshes: THREE.Mesh[] = [];
    for (const spec of track.movingObstacles!) scene.getObjectByName(`moving-obstacle:${spec.id}`)!.traverse(o => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    (world as unknown as { batchStatic(): void }).batchStatic();
    assert.ok(meshes.length > 0);
    for (const mesh of meshes) assert.ok(mesh.parent, `${id}: animation mesh was baked into the static scene`);
    const first = meshes[0];
    moving.update(0); scene.updateMatrixWorld(true);
    const before = new THREE.Vector3().setFromMatrixPosition(first.matrixWorld);
    moving.update(track.movingObstacles![0].period * .325); scene.updateMatrixWorld(true);
    assert.ok(before.distanceTo(new THREE.Vector3().setFromMatrixPosition(first.matrixWorld)) > 1, id);
    if (id === 'factory-shift') {
      assert.ok(scene.getObjectByName('pendulum-rod'), 'animated pendulum rod survives batching');
    }
  }
});

test('wildlife crossings have real ground under both waiting and walking positions, with clear fence gaps', () => {
  for (const track of TRACKS.filter(t => t.movingObstacles?.some(s => s.kind === 'sheep' || s.kind === 'deer'))) {
    const scene = new THREE.Scene();
    buildLevelLandscape(scene, track, new THREE.MeshStandardMaterial());
    buildRoadGeometry(scene, track, new THREE.MeshStandardMaterial());
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const spec of track.movingObstacles!) {
      for (let i = 0; i <= 32; i++) {
        const pose = movingObstaclesAt({ movingObstacles: [spec] }, spec.period * i / 32)[0];
        ray.set(new THREE.Vector3(pose.x, spec.y + .5, pose.z), new THREE.Vector3(0, -1, 0));
        const ground = ray.intersectObjects(scene.children, true)[0];
        assert.ok(ground, spec.id);
        assert.ok(Math.abs(ground.point.y - spec.y) < .13, `${spec.id} floats at offset ${pose.offset}: ${ground.point.y - spec.y}`);
      }
      const rail = scene.getObjectByName('main-guardrail') as THREE.InstancedMesh;
      const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
      for (let i = 0; i < rail.count; i++) {
        rail.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix);
        const dx = point.x - spec.x, dz = point.z - spec.z;
        assert.ok(Math.abs(dx * Math.sin(spec.heading) + dz * Math.cos(spec.heading)) > spec.radius + 1.5 ||
          Math.abs(dx * Math.cos(spec.heading) - dz * Math.sin(spec.heading)) > spec.amplitude + spec.radius,
          `${spec.id}: fence across animal path`);
      }
    }
  }
});
