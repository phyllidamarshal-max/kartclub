import * as THREE from "three";
import {ArchitectureJoints} from './architecture-joints.ts';
import {
  nearestTrack,
  trackPoint,
  trackWidth,
  shortcutWidthAt,
  continuousTrack,
  roadBoundaryOpen,
  type Point,
  type Track,
} from "../shared/track.ts";
import { getLevel, type Biome } from "../shared/levels.ts";
import { worldUV, roadsideClear } from "./scenery.ts";
import { buildAnimalVerges } from './obstacle-clearance.ts';
import {
  boxBevel,
  createChamferedBoxGeometry,
  createStratifiedRockGeometry,
} from "./scene-prop-geometry.ts";

const mat = (color: string, glow = false) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    flatShading: true,
    ...(glow ? { emissive: color, emissiveIntensity: 0.8 } : {}),
  });
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
// One conservative footprint is used for every freestanding group, including foliage.
// nearestTrack includes the forest shortcut, so inner scenery cannot cover that route.
function isClear(track: Track, x: number, z: number, radius: number) {
  return roadsideClear(track, x, z, radius + 1);
}
function foundationFloor(track: Track, p: Point, x: number, z: number) {
  let floor = p.y - 0.32;
  for (const branch of ["main", "shortcut"] as const) {
    const road = continuousTrack(x, z, p.t, track, branch);
    if (road.distance < road.roadWidth / 2 + 1.5)
      floor = Math.min(floor, road.y - 0.4);
  }
  return floor;
}
export function terrainHeight(track: Track, x: number, z: number) {
  const biome = getLevel(track.id).biome;
  if (biome === "harbor" || biome === "city" || biome === "factory")
    return -0.55;
  const p = nearestTrack(x, z, track);
  // The full road margin is flattened before slopes begin. This leaves room for
  // interpolated terrain triangles under banked edges and the shortcut junctions.
  const verge = Math.max(0, p.distance - p.roadWidth / 2 - 4);
  let ravine = 0;
  if (biome === "forest" && track.shortcut.length > 1) {
    const a = track.shortcut[0],
      b = track.shortcut.at(-1)!;
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const f = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)),
    );
    const distance = Math.hypot(x - a.x - dx * f, z - a.z - dz * f);
    ravine = Math.sin(f * Math.PI) * 9 * Math.max(0, 1 - distance / 25);
  }
  return (
    p.y -
    1.4 -
    ravine -
    Math.min(
      verge * (biome === "mine" ? 0.48 : 0.16),
      biome === "mine" ? 26 : 15,
    )
  );
}
function ribbon(
  parent: THREE.Object3D,
  points: readonly Point[],
  width: number | ((p: Point) => number),
  depth: number,
  material: THREE.Material,
  closed: boolean,
  name: string,
  track: Track,
) {
  const positions: number[] = [];
  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const edge = (p: Point, side: number, down: number) => {
      const w = typeof width === "number" ? width : width(p);
      const x = p.x + (Math.cos(p.heading) * w * side) / 2,
        z = p.z - (Math.sin(p.heading) * w * side) / 2;
      return [x, foundationFloor(track, p, x, z) - down, z];
    };
    const al = edge(a, -1, 0),
      ar = edge(a, 1, 0),
      bl = edge(b, -1, 0),
      br = edge(b, 1, 0);
    positions.push(...al, ...bl, ...ar, ...ar, ...bl, ...br);
    for (const side of [-1, 1]) {
      const at = edge(a, side, 0),
        bt = edge(b, side, 0);
      const ab = edge(a, side, depth),
        bb = edge(b, side, depth);
      if (side > 0) positions.push(...at, ...bt, ...ab, ...ab, ...bt, ...bb);
      else positions.push(...at, ...ab, ...bt, ...ab, ...bb, ...bt);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  worldUV(geometry, 6);
  const object = mesh(parent, geometry, material);
  object.name = name;
  return object;
}

export function buildLevelLandscape(
  scene: THREE.Scene,
  track: Track,
  ground: THREE.Material,
): void {
  const biome = getLevel(track.id).biome;
  if (biome === "space") {
    ribbon(
      scene,
      track.points,
      (p) => trackWidth(p.t, track) + 5,
      3.8,
      ground,
      true,
      "space-road-foundation",
      track,
    );
    if (track.shortcut.length > 1)
      ribbon(
        scene,
        track.shortcut,
        (p) => shortcutWidthAt(p.t, track) + 5,
        3.8,
        ground,
        false,
        "space-shortcut-foundation",
        track,
      );
    return;
  }
  if (biome === "harbor") {
    ribbon(
      scene,
      track.points,
      (p) => trackWidth(p.t, track) + 64,
      6.4,
      ground,
      true,
      "harbor-concrete-quays",
      track,
    );
    if (track.shortcut.length > 1)
      ribbon(
        scene,
        track.shortcut,
        (p) => shortcutWidthAt(p.t, track) + 6,
        6.4,
        ground,
        false,
        "harbor-shortcut-quay",
        track,
      );
    return;
  }
  const size = track.radius * 2 + 280;
  const geometry = new THREE.PlaneGeometry(size, size, 92, 92);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    position.setY(i, terrainHeight(track, position.getX(i), position.getZ(i)));
  }
  geometry.computeVertexNormals();
  worldUV(geometry, 7);
  mesh(scene, geometry, ground).name = "level-terrain";
  buildAnimalVerges(scene, track, ground, (x, z) => terrainHeight(track, x, z));
}

export function decorateLevel(
  scene: THREE.Scene,
  track: Track,
  random: () => number,
): void {
  // Reuse primitives within this scene only; batching/disposal owns these
  // resources and another level never receives previously disposed geometry.
  const primitives = new Map<string, THREE.BufferGeometry>();
  const primitive = (key: string, create: () => THREE.BufferGeometry) => {
    if (!primitives.has(key)) primitives.set(key, create());
    return primitives.get(key)!;
  };
  const box = (
    parent: THREE.Object3D,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => {
    const bevel = boxBevel(w, h, d);
    const object = mesh(
      parent,
      bevel
        ? primitive(`chamfer/${bevel.join("/")}`, () =>
            createChamferedBoxGeometry(bevel),
          )
        : primitive("box", () => new THREE.BoxGeometry(1, 1, 1)),
      material,
      x,
      y,
      z,
    );
    object.scale.set(w, h, d);
    return object;
  };
  const cylinder = (
    parent: THREE.Object3D,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    top = radius,
    sides = 10,
  ) => {
    const ratio = top / radius;
    const geometry = primitive(
      `cylinder/${ratio}/${sides}`,
      () => new THREE.CylinderGeometry(ratio, 1, 1, sides),
    );
    const object = mesh(parent, geometry, material, x, y, z);
    object.scale.set(radius, height, radius);
    return object;
  };
  const beam = (
    parent: THREE.Object3D,
    material: THREE.Material,
    a: number[],
    b: number[],
    width: number,
  ) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start);
    const object = cylinder(
      parent,
      material,
      0,
      0,
      0,
      width,
      delta.length(),
      width,
      6,
    );
    object.position.copy(start.add(end).multiplyScalar(0.5));
    object.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return object;
  };
  const ring = (
    parent: THREE.Object3D,
    material: THREE.Material,
    radius: number,
    tube: number,
    x = 0,
    y = 0,
    z = 0,
  ) =>
    mesh(
      parent,
      primitive(
        `ring/${radius}/${tube}`,
        () => new THREE.TorusGeometry(radius, tube, 5, 24),
      ),
      material,
      x,
      y,
      z,
    );
  const level = getLevel(track.id),
    biome = level.biome;
  const dark = mat(biome === "space" ? "#20283f" : "#344148");
  const pale = mat(biome === "ice" ? "#f4fdff" : "#e1d8bc");
  const accent = mat(level.accent),
    metal = mat("#758893");
  const warm = mat("#a66d44"),
    wood = mat("#62432f"),
    bark = mat("#885a3b");
  const foliage = ["#1b4939", "#306440", "#54804a"].map((c) => mat(c));
  const rocks = (
    biome === "desert"
      ? ["#c58545", "#e2ac62", "#ab6240"]
      : biome === "ice"
        ? ["#77b9d8", "#98d9e9", "#5f90b8"]
        : ["#574c55", "#837171", "#6b5b63"]
  ).map((c) => mat(c));
  const cyan = mat("#70e3ee", true),
    pink = mat("#e06caf", true),
    gold = mat("#ffd67f", true);
  const colors = ["#b84f3f", "#d39839", "#407f85", "#52657f"].map((c) =>
    mat(c),
  );
  // The same shared materials shade the new chamfers and curved tank walls.
  // Moderate metalness keeps their unlit sides readable without an environment map.
  metal.roughness = 0.46;
  metal.metalness = 0.36;
  metal.flatShading = false;
  dark.roughness = 0.68;
  dark.metalness = 0.1;
  dark.flatShading = false;
  wood.roughness = 0.96;
  bark.roughness = 1;
  warm.roughness = 0.9;
  pale.roughness = biome === "ice" ? 0.58 : 0.86;
  for (const stone of rocks) {
    stone.roughness = biome === "ice" ? 0.3 : 0.98;
    stone.metalness = biome === "ice" ? 0.13 : 0;
  }
  if (["harbor", "factory", "space"].includes(biome))
    for (const paint of [accent, ...colors]) {
      paint.roughness = 0.6;
      paint.metalness = 0.12;
      paint.flatShading = false;
    }
  // The emissive colors are accents; broad glazed facades retain shading.
  cyan.emissiveIntensity = 0.48;
  pink.emissiveIntensity = 0.48;
  gold.emissiveIntensity = 0.38;

  function groupAt(
    name: string,
    x: number,
    z: number,
    footprint: number,
    heading = 0,
    y?: number,
  ) {
    if (!isClear(track, x, z, footprint)) return undefined;
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y ?? terrainHeight(track, x, z), z);
    g.rotation.y = heading;
    g.userData.footprintRadius = footprint;
    scene.add(g);
    return g;
  }
  function roadside(name: string, t: number, offset: number, radius: number) {
    const p = trackPoint(t, track);
    // Keep each asset's verge margin as the drivable ribbon widens and narrows.
    offset += (Math.sign(offset) * (trackWidth(t, track) - track.width)) / 2;
    return groupAt(
      name,
      p.x + Math.cos(p.heading) * offset,
      p.z - Math.sin(p.heading) * offset,
      radius,
      p.heading,
    );
  }
  function landmark(name: string, radius: number, extra = 10) {
    const side = level.preview.side > 0 ? -1 : 1;
    for (let attempt = 0; attempt < 24; attempt++) {
      const t = level.preview.t + 0.025 + Math.floor(attempt / 6) * 0.015;
      const distance = track.width / 2 + radius + extra + (attempt % 6) * 14;
      const g = roadside(name, t, side * distance, radius);
      if (g) return g;
    }
    const p = trackPoint(level.preview.t, track);
    // The far exterior fallback is also checked instead of dropping a prop at origin.
    const a = Math.atan2(p.z, p.x);
    return groupAt(
      name,
      Math.cos(a) * (track.radius + radius + 60),
      Math.sin(a) * (track.radius + radius + 60),
      radius,
      p.heading,
    )!;
  }
  function pine(g: THREE.Group, h: number, snow = false, giant = false) {
    cylinder(
      g,
      giant ? bark : wood,
      0,
      h * 0.44,
      0,
      h * (giant ? 0.07 : 0.035),
      h * 0.88,
      h * 0.022,
      7,
    );
    const crownGeometry = primitive("pine-crown", () => {
      const geo = new THREE.ConeGeometry(1, 1, 8, 2);
      const p = geo.getAttribute("position");
      for (let v = 0; v < p.count; v++) {
        const a = Math.atan2(p.getZ(v), p.getX(v));
        if (p.getY(v) < 0.4)
          p.setY(v, p.getY(v) + 0.035 * Math.sin(a * 3 + 0.7));
      }
      geo.computeVertexNormals();
      return geo;
    });
    for (let j = 0; j < 4; j++) {
      const radius = h * (0.25 - j * 0.043),
        y = h * (0.46 + j * 0.155);
      const angle = j * 2.4,
        shift = h * 0.011;
      const crown = mesh(
        g,
        crownGeometry,
        foliage[j % 3],
        Math.cos(angle) * shift,
        y,
        Math.sin(angle) * shift,
      );
      crown.scale.set(radius, h * (0.43 - j * 0.025), radius * 0.95);
      crown.rotation.y = angle;
      if (snow) {
        const cap = mesh(
          g,
          crownGeometry,
          pale,
          Math.cos(angle) * shift,
          y + h * 0.046,
          Math.sin(angle) * shift,
        );
        cap.scale.set(radius * 0.89, h * (0.34 - j * 0.025), radius * 0.85);
        cap.rotation.y = angle;
      }
      if (j < 3)
        for (let twig = 0; twig < 3; twig++) {
          const a = angle + (twig * Math.PI * 2) / 3;
          beam(
            g,
            wood,
            [0, y - h * 0.17, 0],
            [
              Math.cos(a) * radius * 0.77,
              y - h * 0.14,
              Math.sin(a) * radius * 0.77,
            ],
            h * 0.009,
          );
        }
    }
    if (giant)
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        beam(
          g,
          bark,
          [0, h * 0.17, 0],
          [Math.cos(a) * h * 0.1, 0, Math.sin(a) * h * 0.1],
          h * 0.025,
        );
      }
  }
  function crystal(g: THREE.Group, h: number, material: THREE.Material) {
    for (let i = 0; i < 4; i++) {
      const a = i * 2.4,
        length = h * (i === 0 ? 1 : 0.45 + random() * 0.35);
      const object = mesh(
        g,
        primitive(
          "crystal-spire",
          () => new THREE.CylinderGeometry(0, 0.22, 1, 5),
        ),
        material,
        Math.sin(a) * h * 0.18,
        length * 0.48,
        Math.cos(a) * h * 0.18,
      );
      object.scale.setScalar(length);
      object.rotation.z = Math.sin(a) * 0.25;
      cylinder(
        g,
        rocks[i % 3],
        Math.sin(a) * h * 0.18,
        length * 0.16,
        Math.cos(a) * h * 0.18,
        length * 0.2,
        length * 0.3,
        length * 0.22,
        5,
      );
    }
  }
  function container(
    g: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    color: THREE.Material,
  ) {
    box(g, color, x, y + 1.55, z, 5.2, 3.1, 10);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++)
        box(
          g,
          color,
          x + side * 2.64,
          y + 1.5,
          z - 4.3 + i * 1.22,
          0.12,
          2.8,
          0.13,
        );
      box(g, pale, x + side * 1.3, y + 1.6, z + 5.03, 0.11, 2.55, 0.09);
      for (const height of [0.12, 2.99]) {
        box(g, metal, x + side * 2.63, y + height, z, 0.16, 0.18, 10.14);
        box(g, metal, x, y + height, z + side * 5.02, 5.34, 0.18, 0.14);
      }
      box(g, dark, x + side * 2.45, y + 1.55, z + 5.055, 0.15, 2.88, 0.09);
      for (const height of [0.25, 2.8])
        box(g, metal, x + side * 2.46, y + height, z + 5.11, 0.29, 0.24, 0.16);
      box(g, metal, x + side * 1.3, y + 1.15, z + 5.14, 0.56, 0.12, 0.12);
    }
    box(g, dark, x, y + 1.55, z + 5.065, 0.065, 2.8, 0.07);
    box(g, pale, x, y + 2.6, z + 5.08, 1.7, 0.3, 0.04);
    box(g, gold, x + 1.94, y + 0.57, z + 5.09, 0.4, 0.38, 0.05);
  }
  function crane(g: THREE.Group, h = 30) {
    for (const x of [-8, 8])
      for (const z of [-9, 9]) {
        box(g, accent, x, h / 2, z, 1.1, h, 1.1);
        box(g, dark, x, 0.7, z, 2.8, 1.4, 4);
        beam(g, accent, [x, 1.8, z], [-x, h - 1, z], 0.34);
      }
    for (const z of [-9, 9]) box(g, accent, -5, h, z, 37, 1.8, 1.5);
    for (const x of [-8, 8]) box(g, accent, x, h, 0, 1.4, 1.8, 21);
    for (const z of [-9, 9]) {
      box(g, dark, -5, h + 1.28, z, 37, 0.18, 0.25);
      for (let i = 0; i < 8; i++) {
        const x = -22 + i * 4.4;
        beam(g, pale, [x, h - 0.7, z], [x + 3.7, h + 0.7, z], 0.1);
      }
    }
    box(g, pale, -6, h - 2.1, 0, 5.5, 3.6, 4);
    box(g, dark, -6, h - 1.9, 2.03, 4.5, 2.2, 0.12);
    for (const z of [-2, 2]) beam(g, dark, [-15, h - 1, z], [-15, 12, z], 0.08);
    box(g, accent, -15, 11.8, 0, 6, 0.55, 5);
    for (let i = 0; i < 7; i++)
      box(g, dark, -22 + i * 5, h + 0.25, 9.78, 2, 0.8, 0.12);
  }
  function tower(g: THREE.Group, h: number, index: number) {
    const material = colors[index % colors.length],
      neon = index % 2 ? cyan : pink;
    box(g, dark, 0, 0.35, 0, 13, 0.7, 14);
    box(g, material, 0, h / 2, 0, 9, h, 11);
    for (const side of [-1, 1]) {
      box(g, metal, side * 4.48, h / 2, 5.53, 0.18, h, 0.16);
      box(g, dark, side * 4.54, h / 2, -4.7, 0.14, h, 0.35);
    }
    box(g, dark, 0, h + 0.65, 0, 9.8, 1.3, 11.8);
    for (let y = 4; y < h - 2; y += 4.2) {
      const lit = (Math.floor(y / 4.2) + index) % 4 !== 0;
      box(g, lit ? neon : dark, 0, y, 5.55, 7.7, 1.25, 0.08);
      box(g, lit ? gold : dark, -4.55, y, 0, 0.08, 1.1, 8.8);
      box(g, dark, 0, y - 0.88, 5.62, 8.35, 0.2, 0.21);
      for (const z of [-2.8, 0, 2.8])
        box(g, material, -4.62, y, z, 0.12, 1.2, 0.21);
      box(g, index % 3 ? dark : neon, 4.55, y, -0.8, 0.08, 1.25, 6.8);
    }
    for (const x of [-2.6, 0, 2.6]) box(g, dark, x, h / 2, 5.63, 0.3, h, 0.12);
    box(g, neon, 4.58, h * 0.65, 4.2, 0.25, h * 0.6, 0.3);
    box(g, dark, 0, h + 2, 0, 4, 2.5, 5);
    box(g, metal, 2.2, h + 1.75, 2.6, 1.6, 1.1, 1.9);
    for (let slat = 0; slat < 4; slat++)
      box(g, dark, 2.2, h + 1.4 + slat * 0.22, 3.58, 1.25, 0.08, 0.07);
    box(g, dark, 0, 1.65, 5.65, 3.4, 3.3, 0.2);
    for (const side of [-1, 1])
      box(g, metal, side * 0.8, 1.5, 5.8, 1.35, 2.6, 0.08);
    box(g, dark, 0, 3.45, 6.15, 5.4, 0.35, 1.75);
    box(g, neon, 0, 3.27, 6.96, 4.8, 0.1, 0.1);
    if (index % 3 === 0) {
      box(g, neon, 0, h * 0.7, 6.1, 6.8, 3.3, 0.45);
      for (let i = 0; i < 3; i++)
        box(g, pale, -1.9 + i * 1.9, h * 0.7, 6.37, 0.75, 1.6, 0.05);
    }
  }
  function tank(g: THREE.Group, x: number, z: number, h: number, r: number) {
    cylinder(g, metal, x, h / 2, z, r, h, r, 14);
    const cap = mesh(g, new THREE.SphereGeometry(r, 14, 7), pale, x, h, z);
    cap.scale.y = 0.28;
    for (const y of [1.2, h * 0.62])
      ring(g, dark, r + 0.07, 0.12, x, y, z).rotation.x = Math.PI / 2;
    for (let y = 1; y < h; y += 0.8)
      box(g, accent, x + r + 0.25, y, z, 0.8, 0.1, 0.18);
    for (const dz of [-0.6, 0.6])
      box(g, dark, x + r + 0.25, h / 2, z + dz, 0.12, h + 1, 0.12);
    cylinder(g, accent, x, h + 1.2, z, 0.45, 2.4, 0.45, 8);
    ring(g, metal, r + 0.1, 0.2, x, h - 0.12, z).rotation.x = Math.PI / 2;
    cylinder(g, dark, x, 0.2, z, r + 0.28, 0.4, r + 0.28, 14);
    // Riveted service hatch, side outlet and a small handwheel are silhouettes,
    // not painted-on detail, and remain within each tank group's footprint.
    const hatch = cylinder(
      g,
      dark,
      x,
      h * 0.33,
      z + r + 0.05,
      0.72,
      0.15,
      0.72,
      10,
    );
    hatch.rotation.x = Math.PI / 2;
    const cover = cylinder(
      g,
      metal,
      x,
      h * 0.33,
      z + r + 0.16,
      0.58,
      0.16,
      0.58,
      10,
    );
    cover.rotation.x = Math.PI / 2;
    for (let bolt = 0; bolt < 6; bolt++) {
      const a = (bolt * Math.PI) / 3;
      box(
        g,
        pale,
        x + Math.cos(a) * 0.61,
        h * 0.33 + Math.sin(a) * 0.61,
        z + r + 0.27,
        0.1,
        0.1,
        0.09,
      );
    }
    beam(
      g,
      metal,
      [x - r * 0.55, 1.6, z + r * 0.7],
      [x - r * 0.55, 1.6, z + r + 0.9],
      0.2,
    );
    ring(g, accent, 0.38, 0.075, x - r * 0.55, 1.6, z + r + 0.94);
    box(g, accent, x - r * 0.55, 1.6, z + r + 0.94, 0.72, 0.075, 0.075);
  }

  // Route-spanning structures follow individual road tangents rather than a straight
  // bounding box through a bend. Every support is checked against all driveable branches.
  function passage(name: string, start: number, length: number, style: Biome) {
    const root = new THREE.Group();
    root.name = name;
    scene.add(root);
    const steps = Math.ceil(length / 4);
    const joints = style === 'factory' ? new ArchitectureJoints({steel:metal,dark,stone:pale}) : undefined;
    let previousFrame: {point:Point;span:number} | undefined;
    for (let i = 0; i <= steps; i++) {
      const p = trackPoint(start + (i * 4) / track.length, track);
      const span = trackWidth(p.t, track) / 2 + (style === "ice" ? 4.5 : 2.7);
      const g = new THREE.Group();
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.heading;
      root.add(g);
      if(joints){
        const grounds:[number,number]=[0,0],supports:[boolean,boolean]=[false,false];
        for(const [index,side] of [[0,-1],[1,1]] as const){
          const x=p.x+Math.cos(p.heading)*side*span,z=p.z-Math.sin(p.heading)*side*span;
          grounds[index]=terrainHeight(track,x,z)-p.y;
          supports[index]=isClear(track,x,z,1.12);
        }
        const frame=joints.portal({span,grounds,supports});g.add(frame);
        if(frame.children.length&&previousFrame){
          // These ties are anchored to both actual frame centers. Transform
          // from world coordinates into the route-root space, so curved racks
          // have seated connections instead of disconnected repeated portals.
          for(const side of [-1,1]){
            const a=previousFrame.point;
            joints.link(root,new THREE.Vector3(a.x+Math.cos(a.heading)*side*previousFrame.span,a.y+9.65,a.z-Math.sin(a.heading)*side*previousFrame.span),new THREE.Vector3(p.x+Math.cos(p.heading)*side*span,p.y+9.65,p.z-Math.sin(p.heading)*side*span));
          }
        }
        previousFrame=frame.children.length?{point:p,span}:undefined;
        continue;
      }
      const material =
        style === "forest" || style === "mine"
          ? wood
          : style === "ice" || style === "desert"
            ? rocks[1]
            : metal;
      for (const side of [-1, 1]) {
        const x = p.x + Math.cos(p.heading) * side * span;
        const z = p.z - Math.sin(p.heading) * side * span;
        if (isClear(track, x, z, 1)) {
          box(g, material, side * span, 4.5, 0, 1.1, 9, 1.2);
          if (style === "mine")
            box(g, accent, side * span, 3.8, -0.68, 1.2, 0.8, 0.12);
          if (style === "space")
            box(g, cyan, side * (span - 0.62), 5, 0, 0.16, 5.5, 0.9);
        }
        if (style === "ice" && isClear(track, x, z, 2.7))
          box(g, rocks[i % 3], side * span, 4.8, 0, 1.7, 9.6, 4.8);
      }
      box(g, material, 0, 9.1, 0, span * 2 + 1.7, 1.2, 1.2);
      if (style === "forest" || style === "mine") {
        for (const side of [-1, 1]) {
          const slope = box(
            g,
            style === "forest" ? warm : rocks[0],
            side * span * 0.52,
            10.6,
            0,
            span + 1.1,
            0.5,
            4.8,
          );
          slope.rotation.z = -side * 0.2;
          beam(
            g,
            pale,
            [side * (span - 2.2), 8.6, 0],
            [side * span, 6.7, 0],
            0.16,
          );
        }
      } else if (style === "ice") {
        for (const side of [-1, 1]) {
          const roof = box(
            g,
            rocks[(i + (side > 0 ? 1 : 0)) % 3],
            side * span * 0.48,
            10.5,
            0,
            span + 1.7,
            1.6,
            4.9,
          );
          roof.rotation.z = -side * 0.18;
        }
        const icicle = mesh(
          g,
          new THREE.ConeGeometry(0.65, 1.4, 5),
          cyan,
          ((i % 3) - 1) * 3,
          8.2,
          0,
        );
        icicle.rotation.z = Math.PI;
      } else if (style === "space") {
        box(g, cyan, 0, 8.42, 0, span * 2, 0.13, 1.22);
      }
      if (i % 3 === 0)
        box(g, style === "ice" ? cyan : gold, 0, 8.35, -0.7, 2, 0.2, 0.3);
    }
    return root;
  }

  if (biome === "harbor") {
    crane(landmark("harbor-cargo-crane", 27));
    const ship = landmark("harbor-cargo-ship", 37, 72);
    ship.position.y = -6.8;
    // A six-sided extruded hull gives the cargo vessel a pointed bow and raised stern.
    const hull = new THREE.Shape();
    hull.moveTo(-9, -28);
    hull.lineTo(9, -28);
    hull.lineTo(10, 18);
    hull.lineTo(5, 31);
    hull.lineTo(-5, 31);
    hull.lineTo(-10, 18);
    hull.closePath();
    const hullGeometry = new THREE.ExtrudeGeometry(hull, {
      depth: 7,
      bevelEnabled: true,
      bevelSize: 1,
      bevelThickness: 1,
      bevelSegments: 1,
      steps: 1,
    });
    hullGeometry.rotateX(Math.PI / 2);
    hullGeometry.translate(0, 7, 0);
    mesh(ship, hullGeometry, colors[0]);
    box(ship, dark, 0, 7.1, 0, 18, 0.35, 48);
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 2; k++)
        container(ship, (k - 0.5) * 6, 7.3, j * 11 - 5, colors[(j + k) % 4]);
    box(ship, pale, 0, 11.5, -21, 15, 9, 10);
    box(ship, dark, 0, 15.3, -15.9, 13, 2.1, 0.15);
    cylinder(ship, accent, 4, 18, -22, 1, 7);
    for (let i = 0; i < 66; i++) {
      const offset =
        (i % 2 ? -1 : 1) *
        (track.width / 2 + 11 + Math.floor((i % 6) / 2) * 13);
      const g = roadside("harbor-container-yard", i / 66, offset, 7);
      if (!g) continue;
      container(g, 0, 0, 0, colors[i % 4]);
      if (i % 3 === 0) container(g, 0, 3.1, 0, colors[(i + 1) % 4]);
      box(g, dark, 0, -3.4, 0, 7, 6.6, 12);
    }
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? -1 : 1;
      const g = roadside(
        "harbor-preview-container-stack",
        level.preview.t - 0.008 + Math.floor(i / 2) * 0.009,
        side * (track.width / 2 + 11),
        7,
      );
      if (!g) continue;
      box(g, dark, 0, -3.4, 0, 7, 6.6, 12);
      container(g, 0, 0, 0, colors[(i + 1) % 4]);
      if (i % 3 !== 0) container(g, 0, 3.1, 0, colors[(i + 2) % 4]);
    }
    for (let i = 0; i < 36; i++) {
      const g = roadside("harbor-dock-pier", i / 36, track.width / 2 + 28, 3);
      if (!g) continue;
      box(g, warm, 0, -0.2, 0, 5, 0.6, 6);
      for (const x of [-2, 2]) cylinder(g, dark, x, -3.4, 0, 0.5, 7);
      cylinder(g, dark, 0, 0.65, 0, 0.6, 1.5, 0.4);
      ring(g, dark, 0.7, 0.18, 2.7, -0.4, 0).rotation.y = Math.PI / 2;
    }
  } else if (biome === "desert") {
    const pyramid = landmark("desert-pyramid", 39, 25);
    const body = mesh(
      pyramid,
      new THREE.ConeGeometry(37, 44, 4),
      rocks[1],
      0,
      22,
      0,
    );
    body.rotation.y = Math.PI / 4;
    for (let i = 0; i < 5; i++)
      box(
        pyramid,
        rocks[0],
        0,
        0.3 + i * 1.1,
        25 - i * 0.6,
        11 - i * 1.4,
        1.1,
        4,
      );
    box(pyramid, dark, 0, 3.5, 24.7, 4, 7, 0.2);
    const small = landmark("desert-stepped-temple", 19, 80);
    for (let i = 0; i < 6; i++)
      box(
        small,
        rocks[i % 2],
        0,
        i * 3 + 1.5,
        0,
        25 - i * 3.5,
        3,
        25 - i * 3.5,
      );
    for (let tier = 0; tier < 6; tier++) {
      const width = 25 - tier * 3.5;
      for (const side of [-1, 1]) {
        box(
          small,
          rocks[2],
          0,
          tier * 3 + 0.17,
          side * (width / 2 + 0.035),
          width,
          0.22,
          0.09,
        );
        for (let joint = 0; joint < 5 - tier / 2; joint++)
          box(
            small,
            rocks[0],
            -width * 0.4 + (joint * width) / 5,
            tier * 3 + 1.4,
            side * (width / 2 + 0.05),
            0.11,
            2.4,
            0.09,
          );
      }
    }
    passage("desert-sandstone-arch", level.preview.t + 0.025, 5, "desert");
    // Curved natural arches are roadside landmarks as well as a gateway over the race.
    for (let i = 0; i < 12; i++) {
      const g = roadside(
        "desert-stone-arch",
        0.05 + i / 12,
        (i % 2 ? -1 : 1) * 38,
        14,
      );
      if (!g) continue;
      const arch = mesh(
        g,
        new THREE.TorusGeometry(10, 2.7, 5, 12, Math.PI),
        rocks[i % 3],
        0,
        5,
        0,
      );
      for (const x of [-10, 10])
        cylinder(g, rocks[0], x, 2.5, 0, 3.2, 5, 2.7, 5);
      arch.rotation.z = 0;
    }
    for (let i = 0; i < 110; i++) {
      const g = roadside(
        "desert-cactus",
        i / 110,
        (i % 2 ? -1 : 1) * (track.width / 2 + 7 + random() * 26),
        2.8,
      );
      if (!g) continue;
      const h = 3.8 + random() * 4;
      cylinder(g, foliage[1], 0, h / 2, 0, 0.55, h, 0.43, 7);
      for (let rib = 0; rib < 5; rib++) {
        const a = (rib * Math.PI * 2) / 5;
        beam(
          g,
          foliage[2],
          [Math.cos(a) * 0.52, 0.3, Math.sin(a) * 0.52],
          [Math.cos(a) * 0.41, h - 0.3, Math.sin(a) * 0.41],
          0.035,
        );
      }
      if (i % 4 === 0) {
        const bloom = mesh(
          g,
          primitive("cactus-bloom", () => new THREE.IcosahedronGeometry(1, 0)),
          colors[0],
          0.15,
          h + 0.08,
          0,
        );
        bloom.scale.set(0.28, 0.17, 0.28);
      }
      for (const side of [-1, 1]) {
        beam(g, foliage[1], [0, h * 0.52, 0], [side * 1.65, h * 0.52, 0], 0.36);
        cylinder(
          g,
          foliage[1],
          side * 1.65,
          h * 0.68,
          0,
          0.36,
          h * 0.33,
          0.28,
          6,
        );
      }
      mesh(
        g,
        new THREE.DodecahedronGeometry(0.9, 0),
        rocks[0],
        1,
        0.2,
        1.5,
      ).scale.y = 0.45;
    }
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI * 2) / 24,
        r = track.radius + 48 + random() * 60;
      const g = groupAt("desert-dune", Math.cos(a) * r, Math.sin(a) * r, 38);
      if (!g) continue;
      mesh(
        g,
        new THREE.SphereGeometry(34, 10, 5),
        rocks[i % 2],
        0,
        0,
        0,
      ).scale.set(1.2, 0.24 + random() * 0.3, 1);
    }
  } else if (biome === "city") {
    const cityTower = landmark("city-neon-tower", 14, 10);
    tower(cityTower, 80, 1);
    box(cityTower, cyan, 0, 88, 0, 0.35, 16, 0.35);
    ring(cityTower, pink, 8, 0.35, 0, 75, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 96; i++) {
      const g = roadside(
        "city-neon-block",
        i / 96,
        (i % 2 ? -1 : 1) * (track.width / 2 + 15 + random() * 27),
        10,
      );
      if (g) tower(g, 16 + random() * 42, i);
    }
    for (let i = 0; i < 28; i++) {
      const a = (i * Math.PI * 2) / 28,
        r = track.radius + 50 + random() * 60;
      const g = groupAt(
        "city-skyline",
        Math.cos(a) * r,
        Math.sin(a) * r,
        11,
        a,
      );
      if (g) tower(g, 38 + random() * 75, i);
    }
    for (let i = 0; i < 90; i++) {
      const g = roadside(
        "city-sidewalk",
        i / 90,
        (i % 2 ? -1 : 1) * (track.width / 2 + 4.2),
        2.3,
      );
      if (!g) continue;
      box(g, pale, 0, -0.15, 0, 3.3, 0.4, 3.5);
      cylinder(g, dark, 0, 4.2, 0, 0.12, 8.4);
      box(g, cyan, 0, 8.4, 0, 2.6, 0.16, 0.7);
    }
    for (const t of [level.preview.t + 0.015, 0.38, 0.65]) {
      const arch = passage("city-overhead-road-sign", t, 1, "city");
      const p = trackPoint(t, track);
      const sign = new THREE.Group();
      sign.position.set(p.x, p.y, p.z);
      sign.rotation.y = p.heading;
      arch.add(sign);
      for (const side of [-1, 1]) {
        box(sign, dark, side * 3.5, 10.5, -0.85, 6.2, 3.3, 0.5);
        box(sign, cyan, side * 3.5, 12, -1.13, 5.8, 0.12, 0.06);
        box(sign, pale, side * 3.5, 10.5, -1.15, 3.9, 0.5, 0.06);
        box(sign, pale, side * 3.5 + 1.8, 10.5, -1.16, 0.3, 1.7, 0.06);
      }
    }
  } else if (biome === "factory") {
    const refinery = landmark("factory-refinery", 24, 20);
    tank(refinery, -8, 0, 19, 5);
    tank(refinery, 7, -4, 25, 5);
    for (const x of [-12, 0, 12]) {
      cylinder(refinery, colors[0], x, 24, 12, 1.8, 48, 1.3, 10);
      for (const y of [28, 37, 45])
        cylinder(refinery, pale, x, y, 12, 1.8, 2.1, 1.8, 10);
      ring(refinery, dark, 1.9, 0.24, x, 48, 12).rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 53; i++) {
      const g = roadside(
        "factory-machinery",
        i / 53,
        (i % 2 ? -1 : 1) * (track.width / 2 + 15 + random() * 24),
        9,
      );
      if (!g) continue;
      box(g, dark, 0, 0.3, 0, 12, 0.6, 13);
      if (i % 3) tank(g, 0, 0, 9 + random() * 14, 3 + random());
      else {
        box(g, metal, 0, 4.5, 0, 9, 9, 11);
        const roof = mesh(
          g,
          new THREE.CylinderGeometry(0, 6.4, 2.6, 4),
          dark,
          0,
          10,
          0,
        );
        roof.rotation.y = Math.PI / 4;
        cylinder(g, colors[0], 3, 15, 3, 0.9, 16, 0.7, 9);
        for (const x of [-2.4, 0, 2.4])
          box(g, gold, x, 6.5, 5.54, 1.4, 1.8, 0.1);
        box(g, dark, 0, 2.3, 5.58, 3.8, 4.6, 0.13);
        for (let slat = 0; slat < 8; slat++)
          box(g, metal, 0, 0.5 + slat * 0.49, 5.69, 3.6, 0.1, 0.1);
        for (const side of [-1, 1]) {
          box(g, accent, side * 4.52, 4.2, 0, 0.16, 8.4, 0.35);
          box(g, metal, side * 4.62, 2, -2.6, 0.28, 3.6, 2.5);
          for (let slat = 0; slat < 5; slat++)
            box(g, dark, side * 4.8, 0.7 + slat * 0.5, -2.6, 0.09, 0.13, 2.2);
        }
      }
    }
    for (const t of [level.preview.t + 0.01, 0.37, 0.64, 0.84]) {
      passage("factory-overhead-pipe-rack", t, 5, "factory");
    }
    crane(landmark("factory-service-crane", 27, 55), 24);
  } else if (biome === "space") {
    const preview = trackPoint(level.preview.t, track);
    let skyPlanet: THREE.Group | undefined;
    for (let i = 0; i < 10 && !skyPlanet; i++) {
      const forward = 350 + i * 30,
        side = level.preview.side > 0 ? -130 : 130;
      skyPlanet = groupAt(
        "space-ring-planet",
        preview.x +
          Math.sin(preview.heading) * forward +
          Math.cos(preview.heading) * side,
        preview.z +
          Math.cos(preview.heading) * forward -
          Math.sin(preview.heading) * side,
        140,
        0,
        110,
      );
    }
    const planet = skyPlanet ?? landmark("space-ring-planet", 140, 190);
    planet.position.y = 110;
    const planetSurface = new THREE.MeshStandardMaterial({
      color: "#7770bd",
      roughness: 1,
      emissive: "#55518b",
      emissiveIntensity: 0.28,
    });
    mesh(planet, new THREE.SphereGeometry(57, 28, 16), planetSurface, 0, 0, 0);
    const rings = new THREE.Group();
    rings.rotation.set(0.95, 0.2, -0.35);
    planet.add(rings);
    const ringMaterial = pale.clone();
    ringMaterial.side = THREE.DoubleSide;
    const belt = mesh(rings, new THREE.RingGeometry(76, 109, 64), ringMaterial);
    belt.rotation.x = -Math.PI / 2;
    ring(rings, cyan, 78, 0.6).rotation.x = Math.PI / 2;
    ring(rings, accent, 108, 1.2).rotation.x = Math.PI / 2;
    const positions: number[] = [];
    for (let i = 0; i < 420; i++) {
      const a = random() * Math.PI * 2,
        e = 0.1 + random() * 1.45,
        r = 850 + random() * 650;
      const x = Math.cos(a) * Math.cos(e) * r,
        y = Math.sin(e) * r,
        z = Math.sin(a) * Math.cos(e) * r;
      const s = 0.45 + random() * 1.3;
      positions.push(x - s, y - s, z, x + s, y - s, z, x, y + s, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    const stars = mesh(
      scene,
      geometry,
      new THREE.MeshBasicMaterial({
        color: "#dcecff",
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    stars.name = "space-starfield";
    stars.castShadow = stars.receiveShadow = false;
    for (let i = 0; i < 30; i++) {
      const p = trackPoint(i / 30, track);
      const g = roadside(
        "space-station-module",
        i / 30,
        (i % 2 ? -1 : 1) * (track.width / 2 + 17),
        9,
      );
      if (!g) continue;
      g.position.y = p.y - 5;
      cylinder(g, dark, 0, 0, 0, 9, 2.2, 8, 8);
      cylinder(g, metal, 0, 3, 0, 3.7, 5, 3.7, 8);
      for (let seam = 0; seam < 8; seam++) {
        const a = (seam * Math.PI) / 4;
        box(
          g,
          dark,
          Math.sin(a) * 3.71,
          2.8,
          Math.cos(a) * 3.71,
          0.16,
          4.3,
          0.16,
        );
      }
      ring(g, cyan, 3.75, 0.14, 0, 4.5, 0).rotation.x = Math.PI / 2;
      const dome = mesh(
        g,
        new THREE.SphereGeometry(3.6, 12, 6),
        cyan,
        0,
        5.5,
        0,
      );
      dome.scale.y = 0.45;
      for (const side of [-1, 1]) {
        box(g, dark, side * 5.7, 5, 0, 3.5, 0.22, 8);
        for (let j = 0; j < 4; j++)
          box(g, colors[3], side * 5.7, 5.16, -3 + j * 2, 3.3, 0.1, 1.8);
        for (let cell = 0; cell < 3; cell++)
          box(
            g,
            metal,
            side * 5.7 - 1.1 + cell * 1.1,
            5.23,
            0,
            0.055,
            0.035,
            7.7,
          );
        beam(g, metal, [side * 2.8, 3.5, 0], [side * 5.7, 4.85, 0], 0.12);
      }
      cylinder(g, metal, 0, 7, 0, 0.08, 2.4, 0.08, 6);
      ring(g, pale, 0.65, 0.1, 0, 7.8, 0).rotation.x = 0.3;
    }
    for (const t of [level.preview.t + 0.012, 0.3, 0.51, 0.76])
      passage("space-station-arch", t, 9, "space");
    for (let i = 0; i < 70; i++)
      for (const side of [-1, 1]) {
        const p = trackPoint(i / 70, track),
          g = new THREE.Group();
        if (roadBoundaryOpen(p, side as -1 | 1, track, "main", 0.8)) continue;
        g.position.set(p.x, p.y, p.z);
        g.rotation.y = p.heading;
        scene.add(g);
        box(
          g,
          cyan,
          side * (trackWidth(p.t, track) / 2 + 0.8),
          -0.03,
          0,
          0.22,
          0.2,
          3.7,
        );
        box(
          g,
          dark,
          side * (trackWidth(p.t, track) / 2 + 1.3),
          -1.7,
          0,
          1.4,
          2,
          2.8,
        );
      }
  } else if (biome === "forest") {
    passage("forest-covered-passage", level.preview.t + 0.009, 39, "forest");
    const giant = landmark("forest-ancient-redwood", 13, 1);
    pine(giant, 44, false, true);
    for (let i = 0; i < 240; i++) {
      const h = 12 + random() * 23;
      const g = roadside(
        "forest-giant-tree",
        i / 240,
        (i % 2 ? -1 : 1) * (track.width / 2 + 12 + random() * 45),
        h * 0.29,
      );
      if (g) pine(g, h, false, i % 3 === 0);
    }
    for (let i = 0; i < 70; i++) {
      const g = roadside(
        "forest-fern-boulder",
        i / 70,
        (i % 2 ? -1 : 1) * (track.width / 2 + 5 + random() * 7),
        2.8,
      );
      if (!g) continue;
      mesh(
        g,
        primitive(`forest-boulder/${i % 3}`, () =>
          createStratifiedRockGeometry(i % 3),
        ),
        i % 2 ? foliage[1] : rocks[1],
        0,
        0.65,
        0,
      ).scale.set(2.2, 2.2, 2.2);
      const fernGeometry = primitive("folded-fern-frond", () => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            [
              0, 0, 0, -0.18, 0.3, 0.35, 0, 0.42, 0.82, 0, 0, 0, 0, 0.42, 0.82,
              0.18, 0.24, 0.35,
            ],
            3,
          ),
        );
        geo.computeVertexNormals();
        return geo;
      });
      for (let frond = 0; frond < 7; frond++) {
        const leaf = mesh(
          g,
          fernGeometry,
          foliage[frond % 3],
          -1.1,
          0.15,
          -0.8,
        );
        leaf.rotation.y = (frond * Math.PI * 2) / 7;
        leaf.scale.setScalar(0.85 + (frond % 3) * 0.13);
      }
      for (let j = 0; j < 3; j++) {
        const mushroom = new THREE.Group();
        mushroom.position.set(j - 1, 0, 1.5);
        g.add(mushroom);
        cylinder(mushroom, pale, 0, 0.35, 0, 0.11, 0.7);
        mesh(
          mushroom,
          new THREE.SphereGeometry(0.45, 7, 4),
          colors[0],
          0,
          0.75,
          0,
        ).scale.y = 0.45;
      }
    }
    const camp = landmark("forest-timber-camp", 14, 37);
    for (let j = 0; j < 4; j++) {
      const log = cylinder(camp, bark, -5 + j * 2.1, 1.1, 0, 1.05, 13, 1.05, 8);
      log.rotation.x = Math.PI / 2;
      cylinder(
        camp,
        warm,
        -5 + j * 2.1,
        1.1,
        6.53,
        0.87,
        0.08,
        0.87,
        8,
      ).rotation.x = Math.PI / 2;
    }
    if (track.shortcut.length > 1) {
      const bridge = new THREE.Group();
      bridge.name = "forest-shortcut-bridge";
      scene.add(bridge);
      ribbon(
        bridge,
        track.shortcut,
        (p) => shortcutWidthAt(p.t, track) + 3.5,
        0.6,
        warm,
        false,
        "forest-shortcut-timber-deck",
        track,
      );
      for (let i = 0; i < track.shortcut.length; i += 3) {
        const p = track.shortcut[i],
          g = new THREE.Group();
        g.position.set(p.x, p.y, p.z);
        g.rotation.y = p.heading;
        bridge.add(g);
        g.position.y = foundationFloor(track, p, p.x, p.z) + 0.15;
        box(g, wood, 0, -0.65, 0, shortcutWidthAt(p.t, track) + 4.2, 0.45, 0.3);
        for (const side of [-1, 1]) {
          const half = shortcutWidthAt(p.t, track) / 2 + 2;
          const x = p.x + Math.cos(p.heading) * half * side,
            z = p.z - Math.sin(p.heading) * half * side;
          if (!isClear(track, x, z, 0.25)) continue;
          box(g, wood, side * half, -4.5, 0, 0.38, 9, 0.38).name =
            "forest-bridge-support";
        }
      }
    }
  } else if (biome === "ice") {
    passage("ice-crystal-tunnel", level.preview.t + 0.008, 46, "ice");
    const glacier = landmark("ice-crystal-spire", 16, 9);
    crystal(glacier, 30, rocks[1]);
    for (let i = 0; i < 88; i++) {
      const h = 4 + random() * 11;
      const g = roadside(
        "ice-crystal-deposit",
        i / 88,
        (i % 2 ? -1 : 1) * (track.width / 2 + 9 + random() * 26),
        h * 0.46,
      );
      if (g) crystal(g, h, i % 3 ? rocks[1] : cyan);
    }
    for (let i = 0; i < 85; i++) {
      const h = 8 + random() * 10;
      const g = roadside(
        "ice-snow-pine",
        0.02 + i / 85,
        (i % 2 ? -1 : 1) * (track.width / 2 + 11 + random() * 38),
        h * 0.3,
      );
      if (g) pine(g, h, true);
    }
    for (let i = 0; i < 65; i++) {
      const g = roadside(
        "ice-glacier-wall",
        i / 65,
        (i % 2 ? -1 : 1) * (track.width / 2 + 12),
        7,
      );
      if (!g) continue;
      const h = 4 + random() * 7;
      mesh(
        g,
        primitive(`ice-outcrop/${i % 3}`, () =>
          createStratifiedRockGeometry(i % 3),
        ),
        rocks[i % 3],
        0,
        h * 0.4,
        0,
      ).scale.set(3.6, h * 1.9, 6);
      const snowcap = mesh(
        g,
        primitive("snow-drift", () => new THREE.DodecahedronGeometry(1, 0)),
        pale,
        0,
        h * 1.12,
        0,
      );
      snowcap.scale.set(2.9, h * 0.15, 3.5);
    }
    for (let i = 0; i < 22; i++) {
      const a = (i * Math.PI * 2) / 22,
        r = track.radius + 50 + random() * 75;
      const g = groupAt("ice-snowy-peak", Math.cos(a) * r, Math.sin(a) * r, 35);
      if (!g) continue;
      const h = 42 + random() * 65;
      mesh(g, new THREE.ConeGeometry(34, h, 5), rocks[2], 0, h / 2, 0);
      mesh(g, new THREE.ConeGeometry(17.1, h * 0.51, 5), pale, 0, h * 0.75, 0);
    }
  } else if (biome === "mine") {
    passage("mine-portal", level.preview.t + 0.009, 34, "mine");
    const quarry = landmark("mine-crystal-quarry", 17, 8);
    crystal(quarry, 28, pink);
    for (let i = 0; i < 105; i++) {
      const h = 10 + random() * 22,
        radius = 5 + random() * 5;
      const g = roadside(
        "mine-canyon-wall",
        i / 105,
        (i % 2 ? -1 : 1) * (track.width / 2 + radius + 5 + random() * 12),
        radius + 1,
      );
      if (!g) continue;
      mesh(
        g,
        primitive(`mine-outcrop/${i % 3}`, () =>
          createStratifiedRockGeometry(i % 3),
        ),
        rocks[i % 3],
        0,
        h / 2,
        0,
      ).scale.set(radius, h, radius);
      for (const y of [h * 0.25, h * 0.65])
        cylinder(
          g,
          rocks[(i + 1) % 3],
          0,
          y,
          0,
          radius * 0.91,
          0.6,
          radius * 0.9,
          5,
        );
      if (i % 4 === 0) crystal(g, 7, i % 8 ? cyan : pink);
    }
    for (let i = 0; i < 28; i++) {
      const g = roadside(
        "mine-ore-cart",
        0.02 + i / 28,
        (i % 2 ? -1 : 1) * (track.width / 2 + 7),
        3.5,
      );
      if (!g) continue;
      box(g, dark, 0, 1.35, 0, 3.1, 1.5, 3.8);
      for (const side of [-1, 1]) {
        box(g, metal, side * 1.56, 2.12, 0, 0.15, 0.15, 3.95);
        for (let board = 0; board < 3; board++)
          box(g, wood, side * 1.57, 0.85 + board * 0.4, 0, 0.08, 0.31, 3.5);
        for (const z of [-1.5, 1.5])
          box(g, metal, side * 1.63, 1.36, z, 0.1, 1.42, 0.19);
        box(g, metal, 0, 2.12, side * 1.92, 3.25, 0.15, 0.15);
      }
      for (const x of [-1.6, 1.6])
        for (const z of [-1.2, 1.2]) {
          const wheel = cylinder(g, dark, x, 0.45, z, 0.46, 0.22, 0.46, 8);
          wheel.rotation.z = Math.PI / 2;
        }
      crystal(g, 2.8, i % 2 ? gold : pink);
      for (const x of [-1.1, 1.1]) box(g, metal, x, 0.12, 0, 0.16, 0.14, 6);
    }
    for (const t of [0.36, 0.6, 0.81])
      passage("mine-timber-gantry", t, 5, "mine");
    for (let i = 0; i < 20; i++) {
      const g = roadside(
        "mine-lava-fissure",
        i / 20,
        (i % 2 ? -1 : 1) * 39,
        11,
      );
      if (!g) continue;
      // Local fissures stay below the nearest route even on the lowest mountain section.
      const p = nearestTrack(g.position.x, g.position.z, track);
      g.position.y = Math.min(g.position.y + 0.3, p.y - 4);
      const lava = mesh(g, new THREE.CircleGeometry(9, 9), gold, 0, 0, 0);
      lava.rotation.x = -Math.PI / 2;
      lava.scale.set(1, 0.35, 1);
      for (let j = 0; j < 5; j++) {
        const a = (j * Math.PI * 2) / 5;
        mesh(
          g,
          new THREE.DodecahedronGeometry(1.5, 0),
          rocks[0],
          Math.cos(a) * 7,
          0.3,
          Math.sin(a) * 3,
        ).scale.y = 0.6;
      }
    }
  }

  // Supplement the expanded routes without shifting any original landmark,
  // random sequence, or named environmental emitter. Budgets are total target
  // attempts, with a hard cap per theme; all additions retain roadsideClear.
  const coverage: Partial<Record<Biome, [number, number, number]>> = {
    harbor: [66, 25, 132],
    desert: [110, 27, 176],
    city: [96, 23, 144],
    factory: [53, 44, 104],
    space: [30, 75, 64],
    forest: [70, 29, 104],
    ice: [65, 26, 112],
    mine: [105, 27, 176],
  };
  const budget = coverage[biome];
  if (!budget) return;
  const extraCount = Math.max(
    0,
    Math.min(budget[2], Math.ceil(track.length / budget[1])) - budget[0],
  );
  for (let i = 0; i < extraCount; i++) {
    // Integer variation is independent of the caller's random stream.
    const variation = ((Math.imul(i + 1, 1597334677) >>> 0) % 1000) / 1000;
    const side = i % 2 ? -1 : 1;
    const t = (i + 0.43) / extraCount;
    const radius =
      biome === "city"
        ? 10
        : biome === "harbor"
          ? 7
          : biome === "factory"
            ? 7
            : biome === "space"
              ? 8
              : 5;
    const offset =
      track.width / 2 + radius + 5 + variation * (biome === "city" ? 18 : 9);
    const g = roadside(`${biome}-route-dressing`, t, side * offset, radius);
    if (!g) continue;
    if (biome === "harbor") {
      box(g, dark, 0, -3.4, 0, 7, 6.6, 12);
      container(g, 0, 0, 0, colors[(i + 2) % 4]);
      if (i % 4 === 0) container(g, 0, 3.1, 0, colors[i % 4]);
    } else if (biome === "city") {
      tower(g, 10 + variation * 10, i);
    } else if (biome === "factory") {
      box(g, dark, 0, 0.3, 0, 8.8, 0.6, 9.5);
      box(g, colors[3], 0, 3.1, 0, 7, 5.6, 8);
      box(g, pale, 0, 6.2, 0, 7.6, 0.6, 8.6);
      for (const x of [-1.9, 1.9]) {
        cylinder(g, metal, x, 7.2, -1.6, 1.05, 1.6, 0.9, 12);
        ring(g, dark, 1, 0.13, x, 8.05, -1.6).rotation.x = Math.PI / 2;
      }
      box(g, metal, 0, 2.8, 4.04, 5.7, 3.8, 0.12);
      for (let slat = 0; slat < 6; slat++)
        box(g, dark, 0, 1.3 + slat * 0.55, 4.12, 5.4, 0.2, 0.1);
      box(g, accent, 0, 5.1, 4.08, 6.2, 0.32, 0.1);
    } else if (biome === "space") {
      g.position.y = trackPoint(t, track).y - 4;
      cylinder(g, dark, 0, 0, 0, 6.8, 1.6, 6.4, 12);
      box(g, metal, 0, 2.4, 0, 5.8, 4, 6.5);
      box(g, pale, 0, 4.65, 0, 6.1, 0.7, 6.8);
      for (const direction of [-1, 1]) {
        box(g, dark, direction * 2.93, 2.8, 0, 0.1, 1.8, 4.8);
        box(g, cyan, direction * 2.995, 2.9, 0, 0.08, 0.45, 4.2);
        box(g, dark, direction * 4.7, 3.9, 0, 3.2, 0.2, 7.6);
        for (let panel = 0; panel < 3; panel++)
          box(
            g,
            colors[3],
            direction * 4.7,
            4.05,
            -2.5 + panel * 2.5,
            3,
            0.08,
            2.25,
          );
      }
    } else {
      const height =
        biome === "mine"
          ? 7 + variation * 10
          : biome === "ice"
            ? 3 + variation * 4
            : biome === "desert"
              ? 3.2 + variation * 5.5
              : 1.7 + variation;
      const rockMaterial = biome === "forest" ? rocks[1] : rocks[i % 3];
      const outcrop = mesh(
        g,
        primitive(`route-outcrop/${i % 3}`, () =>
          createStratifiedRockGeometry(i % 3),
        ),
        rockMaterial,
        0,
        height / 2,
        0,
      );
      outcrop.scale.set(3.4 + variation, height, 3.4 + variation);
      if (biome === "mine" || biome === "desert") {
        for (const fraction of [0.27, 0.65])
          cylinder(
            g,
            rocks[(i + 1) % 3],
            0,
            height * fraction,
            0,
            3.45,
            0.38,
            3.25,
            8,
          );
      } else if (biome === "ice") {
        const cap = mesh(
          g,
          primitive("snow-drift", () => new THREE.DodecahedronGeometry(1, 0)),
          pale,
          0,
          height * 0.94,
          0,
        );
        cap.scale.set(2.8, 0.65, 2.8);
      } else if (biome === "forest") {
        const moss = mesh(
          g,
          primitive("route-moss", () => new THREE.IcosahedronGeometry(1, 0)),
          foliage[1],
          0,
          height * 0.95,
          0,
        );
        moss.scale.set(2.9, 0.35, 2.5);
        for (let frond = 0; frond < 5; frond++) {
          const a = frond * Math.PI * 0.4;
          const leaf = mesh(
            g,
            primitive("route-fern", () => {
              const geometry = new THREE.BufferGeometry();
              geometry.setAttribute(
                "position",
                new THREE.Float32BufferAttribute(
                  [
                    0, 0, 0, -0.3, 0.55, 0.45, 0, 0.8, 1.55, 0, 0, 0, 0, 0.8,
                    1.55, 0.3, 0.5, 0.45,
                  ],
                  3,
                ),
              );
              geometry.computeVertexNormals();
              return geometry;
            }),
            foliage[frond % 3],
            -2.2,
            0,
            -1.5,
          );
          leaf.rotation.y = a;
        }
      }
    }
    // World batches these in their own spatial cells and shortens their range
    // on low quality; original landmarks retain their current visibility rules.
    g.traverse((object) => {
      object.userData.decorative = true;
    });
  }
}
