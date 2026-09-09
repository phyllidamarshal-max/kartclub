import * as THREE from 'three';
import { nearestTrack, trackWidth, type Track } from '../shared/track.ts';

type Zone = { x: number; z: number; c: number; s: number; across: number; along: number; animal: boolean };
const cache = new WeakMap<Track, Zone[]>();
function zones(track: Track): Zone[] {
  let result = cache.get(track);
  if (result) return result;
  result = [];
  for (const spec of track.movingObstacles ?? []) {
    const animal = spec.kind === 'sheep' || spec.kind === 'deer';
    const c = Math.cos(spec.heading), s = Math.sin(spec.heading);
    if (animal) result.push({ x: spec.x, z: spec.z, c, s,
      across: Math.abs(spec.amplitude) + spec.radius + 1,
      along: spec.radius + 2, animal: true });
    if (spec.kind === 'pendulum') {
      const p = nearestTrack(spec.x, spec.z, track);
      const span = Math.max(trackWidth(p.t, track) / 2 + 4,
        Math.abs(spec.amplitude) + spec.radius + 2.5);
      for (const side of [-1, 1]) result.push({
        x: spec.x + c * side * span, z: spec.z - s * side * span,
        c, s, across: 1.6, along: 1.8, animal: false,
      });
    }
  }
  cache.set(track, result);
  return result;
}

function overlaps(zone: Zone, x: number, z: number, radius: number) {
  const dx = x - zone.x, dz = z - zone.z;
  return Math.abs(dx * zone.c - dz * zone.s) < zone.across + radius &&
    Math.abs(dx * zone.s + dz * zone.c) < zone.along + radius;
}

/** Static props may not occupy animal transit/rest space or the portal feet. */
export function obstacleSceneryClear(track: Track, x: number, z: number, radius: number) {
  // Include the graded landing's outer blend. Small plants sample the original
  // terrain, so planting on the added landing would leave their feet buried.
  return !zones(track).some(zone => overlaps(zone, x, z, radius + (zone.animal ? 3 : 0)));
}

/** Only the tall fence opens; the continuous road curb still marks the driving limit. */
export function animalFenceOpening(track: Track, x: number, z: number, radius = 0) {
  return zones(track).some(zone => zone.animal && overlaps(zone, x, z, radius));
}

/** Small graded grass landings join the existing terrain to the animal's path. */
export function buildAnimalVerges(scene: THREE.Scene, track: Track,
  material: THREE.Material, terrainHeight: (x: number, z: number) => number) {
  for (const spec of track.movingObstacles ?? []) {
    if (spec.kind !== 'sheep' && spec.kind !== 'deer') continue;
    const c = Math.cos(spec.heading), s = Math.sin(spec.heading);
    const core = spec.radius + 1, along = core + 4;
    const across = Math.abs(spec.amplitude) + spec.radius + 4;
    const vertices: number[] = [];
    const vertex = (lateral: number, forward: number) => {
      const x = spec.x + c * lateral + s * forward;
      const z = spec.z - s * lateral + c * forward;
      const road = nearestTrack(x, z, track);
      // Follow the real varying edge; the grass never lays over the road/curb.
      const edge = trackWidth(road.t, track) / 2 + .87;
      const side = lateral < 0 ? -1 : 1;
      const adjusted = Math.max(Math.abs(lateral), edge) * side;
      const ax = spec.x + c * adjusted + s * forward;
      const az = spec.z - s * adjusted + c * forward;
      const fade = Math.max(0, Math.min(1, (along - Math.abs(forward)) / 4,
        (across - Math.abs(adjusted)) / 3));
      const blend = fade * fade * (3 - 2 * fade);
      const floor = terrainHeight(ax, az);
      return [ax, floor + (spec.y - .015 - floor) * blend, az];
    };
    const half = trackWidth(nearestTrack(spec.x, spec.z, track).t, track) / 2 + .87;
    for (const side of [-1, 1]) {
      for (let a = half; a < across; a += .8) for (let f = -along; f < along; f += .8) {
        const b = Math.min(across, a + .8), g = Math.min(along, f + .8);
        const p = vertex(side * a, f), q = vertex(side * b, f);
        const r = vertex(side * a, g), t = vertex(side * b, g);
        vertices.push(...p, ...r, ...q, ...q, ...r, ...t);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(vertices.flatMap((v, i) =>
      i % 3 === 0 ? [v / 7, vertices[i + 2] / 7] : []), 2));
    geometry.computeVertexNormals();
    // Opposite shoulders have mirrored winding; render both sides with one shared material.
    const ground = material.clone(); ground.side = THREE.DoubleSide;
    const patch = new THREE.Mesh(geometry, ground);
    patch.name = `animal-verge:${spec.id}`;
    patch.receiveShadow = true;
    scene.add(patch);
  }
}
