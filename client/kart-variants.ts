import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createKartModel } from "./kart-model.ts";
import { getKart, type KartId } from "../shared/karts.ts";

type XYZ = [number, number, number];
type Section = [z: number, halfWidth: number, bottom: number, top: number];

/** Closed longitudinal shell; section widths and heights are editable design stations. */
function shell(sections: Section[], round = true) {
  const vertices: number[] = [],
    indices: number[] = [];
  const sides = round ? 24 : 8;
  for (const [z, w, b, t] of sections)
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const power = round ? 0.55 : 1;
      let x: number, y: number;
      if (round) {
        x = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), power) * w;
        y =
          (b + t) / 2 +
          (Math.sign(Math.sin(a)) *
            Math.pow(Math.abs(Math.sin(a)), power) *
            (t - b)) /
            2;
      } else {
        const ring = [
          [-1, 0.2],
          [-0.8, 0],
          [0.8, 0],
          [1, 0.2],
          [1, 0.8],
          [0.65, 1],
          [-0.65, 1],
          [-1, 0.8],
        ];
        x = ring[j][0] * w;
        y = b + ring[j][1] * (t - b);
      }
      vertices.push(x, y, z);
    }
  for (let s = 0; s < sections.length - 1; s++)
    for (let j = 0; j < sides; j++) {
      const a = s * sides + j,
        b = s * sides + ((j + 1) % sides),
        c = b + sides,
        d = a + sides;
      // Both section rings run counterclockwise when viewed along -Z.
      indices.push(a, b, d, b, c, d);
    }
  for (const end of [0, sections.length - 1]) {
    const [z, , b, t] = sections[end];
    const centre = vertices.length / 3;
    vertices.push(0, (b + t) / 2, z);
    for (let j = 0; j < sides; j++) {
      const a = end * sides + j,
        b = end * sides + ((j + 1) % sides);
      if (end === 0) indices.push(centre, b, a);
      else indices.push(centre, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function add(
  parent: THREE.Object3D,
  g: THREE.BufferGeometry,
  m: THREE.Material,
  name: string,
  p: XYZ = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(g, m);
  mesh.name = name;
  mesh.position.set(...p);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function box(
  parent: THREE.Object3D,
  m: THREE.Material,
  name: string,
  size: XYZ,
  p: XYZ,
  r = 0.035,
) {
  return add(
    parent,
    new RoundedBoxGeometry(...size, 2, Math.min(r, ...size.map((v) => v / 2))),
    m,
    name,
    p,
  );
}
function bar(
  parent: THREE.Object3D,
  m: THREE.Material,
  name: string,
  a: XYZ,
  b: XYZ,
  r = 0.035,
) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b),
    axis = end.clone().sub(start);
  const mesh = add(
    parent,
    new THREE.CylinderGeometry(r, r, axis.length(), 10),
    m,
    name,
  );
  mesh.position.copy(start.add(end).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    axis.normalize(),
  );
  return mesh;
}

function fenderCrown(z: number, front: boolean, angular = false) {
  if (angular && front) {
    const stations = [
      [0.46, 1.16],
      [0.82, 1.42],
      [1.28, 1.46],
      [1.7, 1.19],
      [2.01, 0.87],
    ];
    for (let i = 0; i < stations.length - 1; i++)
      if (z <= stations[i + 1][0]) {
        const [a, h] = stations[i],
          [b, k] = stations[i + 1];
        return h + ((k - h) * (z - a)) / (b - a);
      }
    return 0.87;
  }
  return front
    ? 0.7 + 0.74 * Math.exp(-Math.pow((z - 1.08) / 0.84, 4))
    : 0.7 + 0.68 * Math.exp(-Math.pow((z + 1.12) / 0.75, 4));
}

/** Solid coachwork sections surround a carved tire envelope and join the centre shell. */
function arch(side: number, zCentre: number, front: boolean, angular = false) {
  const pos: number[] = [],
    ix: number[] = [];
  const steps = angular ? 16 : 36,
    ringSize = 10;
  const start = front ? 0.46 : -1.725,
    end = front ? 2.01 : -0.43;
  for (let i = 0; i <= steps; i++) {
    const z = start + ((end - start) * i) / steps,
      d = z - zCentre;
    const under = 0.62 + Math.sqrt(Math.max(0, 0.65 * 0.65 - d * d));
    const crown = fenderCrown(z, front, angular);
    const edge = Math.min(
      1.51,
      1.6 - (Math.max(0, z - 1.58) * 0.47) / 0.54 - 0.055,
      1.6 - (Math.max(0, -z - 1.45) * 0.32) / 0.34 - 0.055,
    );
    const inner = front ? 0.53 : 0.55;
    const ring = [
      [inner, 0.51],
      [0.67, 0.51],
      [0.78, under + 0.01],
      [edge - 0.045, under + 0.01],
      [edge, under + 0.065],
      [edge, crown - 0.055],
      [edge - 0.08, crown],
      [0.97, crown + 0.025],
      [0.69, crown - 0.06],
      [inner, crown - 0.18],
    ];
    for (const [x, y] of ring) pos.push(side * x, y, z);
  }
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < ringSize; j++) {
      const a = i * ringSize + j,
        b = i * ringSize + ((j + 1) % ringSize),
        c = b + ringSize,
        d = a + ringSize;
      ix.push(a, b, d, b, c, d);
    }
  // Concave cross-sections require polygon triangulation rather than centre fans.
  for (const endIndex of [0, steps]) {
    const offset = endIndex * ringSize;
    const outline = Array.from(
      { length: ringSize },
      (_, j) =>
        new THREE.Vector2(pos[(offset + j) * 3], pos[(offset + j) * 3 + 1]),
    );
    for (const triangle of THREE.ShapeUtils.triangulateShape(outline, [])) {
      const [a, b, c] = triangle.map((v) => v + offset);
      if (endIndex === 0) ix.push(c, b, a);
      else ix.push(a, b, c);
    }
  }
  if (side < 0)
    for (let i = 0; i < steps * ringSize * 6; i += 3)
      [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

/** Six complete editable bodies, sharing only the unchanged driver and mechanical rig. */
export function createKartVariant(
  id: KartId,
  driverColor: string,
): THREE.Group {
  const root = createKartModel(driverColor);
  root.userData.kartId = id;
  if (id === "club") return root;
  const retained = new Set([
    "driver",
    "steering-wheel",
    "steering-column",
    "rear-engine",
    "seat-back",
    "seat-base",
    "seat-rear-shell",
  ]);
  const removedG = new Set<THREE.BufferGeometry>(),
    removedM = new Set<THREE.Material>();
  for (const child of [...root.children]) {
    if (
      retained.has(child.name) ||
      child.name.startsWith("wheel-") ||
      child.name.includes("suspension") ||
      child.name.includes("shock") ||
      child.name.includes("spring") ||
      child.name.startsWith("rear-axle") ||
      child.name === "front-crossbar"
    )
      continue;
    child.traverse((n) => {
      if (n instanceof THREE.Mesh) {
        removedG.add(n.geometry);
        for (const m of Array.isArray(n.material) ? n.material : [n.material])
          removedM.add(m);
      }
    });
    child.removeFromParent();
  }
  root.traverse((n) => {
    if (n instanceof THREE.Mesh) {
      removedG.delete(n.geometry);
      for (const m of Array.isArray(n.material) ? n.material : [n.material])
        removedM.delete(m);
    }
  });
  removedG.forEach((g) => g.dispose());
  removedM.forEach((m) => m.dispose());
  const materials = new Map<string, THREE.Material>();
  root.traverse((n) => {
    if (n instanceof THREE.Mesh && !Array.isArray(n.material))
      materials.set(n.material.name, n.material);
  });
  const dark = materials.get("kart-dark")!,
    silver = materials.get("kart-silver")!;
  const spec = getKart(id);
  const paint = new THREE.MeshPhysicalMaterial({
    color: spec.color,
    metalness: id === "vesper" ? 0.52 : 0.3,
    roughness: 0.29,
    clearcoat: 0.8,
    clearcoatRoughness: 0.19,
    flatShading: id === "vesper",
  });
  paint.name = `variant-${id}-paint`;
  const accent = new THREE.MeshStandardMaterial({
    color: spec.accent,
    metalness: 0.8,
    roughness: 0.28,
  });
  accent.name = `variant-${id}-accent`;
  const lamp = new THREE.MeshStandardMaterial({
    color: "#fff4d7",
    emissive: "#ffe2a4",
    emissiveIntensity: 0.25,
    metalness: 0.2,
    roughness: 0.2,
  });
  lamp.name = "variant-lamps";
  const tail = new THREE.MeshStandardMaterial({
    color: "#a92c26",
    emissive: "#bc271c",
    emissiveIntensity: 0.4,
    roughness: 0.25,
  });
  tail.name = "variant-tail-lamps";
  const body = new THREE.Group();
  body.name = "variant-body";
  root.add(body);
  const B = (m: THREE.Material, n: string, s: XYZ, p: XYZ, r = 0.035) =>
    box(body, m, n, s, p, r);
  const S = (
    m: THREE.Material,
    n: string,
    sections: Section[],
    round = true,
    x = 0,
  ) => add(body, shell(sections, round), m, n, [x, 0, 0]);
  const A = (side: number, z: number, front: boolean, angular = false) =>
    add(
      body,
      arch(side, z, front, angular),
      paint,
      `${front ? "front" : "rear"}-arch-${side}`,
    );
  const rail = (m: THREE.Material, n: string, a: XYZ, b: XYZ, r = 0.035) =>
    bar(body, m, n, a, b, r);
  const frontLamp = (x: number, y: number, z: number, round = false) => {
    if (round) {
      const rim = add(
        body,
        new THREE.TorusGeometry(0.145, 0.024, 8, 24),
        accent,
        `round-lamp-rim-${x}`,
        [x, y, z],
      );
      const glass = add(
        body,
        new THREE.SphereGeometry(1, 20, 12),
        lamp,
        `round-lamp-${x}`,
        [x, y, z],
      );
      glass.scale.set(0.126, 0.126, 0.045);
      return rim;
    }
    const mesh = B(
      lamp,
      `blade-lamp-${x}`,
      [0.32, 0.045, 0.09],
      [x, y, z],
      0.02,
    );
    mesh.rotation.z = -Math.sign(x) * 0.15;
    return mesh;
  };
  const wing = (height: number, width: number, z: number, split = false) => {
    for (const side of [-1, 1]) {
      B(
        dark,
        `wing-stanchion-${side}`,
        [0.055, height - 0.84, 0.1],
        [side * 0.56, (height + 0.84) / 2, z],
      );
      B(
        split ? paint : dark,
        `wing-endplate-${side}`,
        [0.07, 0.29, 0.44],
        [side * (width / 2 - 0.03), height + 0.08, z],
        0.025,
      );
      if (split)
        B(
          paint,
          `split-wing-${side}`,
          [0.65, 0.07, 0.39],
          [side * 0.64, height, z],
        );
    }
    if (!split)
      B(dark, "rear-aero-wing", [width, 0.075, 0.37], [0, height, z], 0.025);
  };
  B(dark, "central-floor", [1.34, 0.13, 2.76], [0, 0.39, -0.02]);
  // Rear deck is deliberately narrow below the tire crowns.
  S(
    paint,
    "engine-cowling",
    [
      [-1.6, 0.65, 0.54, 0.8],
      [-1.35, 0.72, 0.53, 0.99],
      [-0.85, 0.62, 0.56, 0.98],
    ],
    id !== "vesper" && id !== "rallye",
  );
  for (const side of [-1, 1]) {
    B(
      tail,
      `tail-light-${side}`,
      [0.27, 0.075, 0.045],
      [side * 0.46, 0.81, -1.615],
      0.025,
    );
    const pipe = add(
      body,
      new THREE.CylinderGeometry(0.12, 0.12, 0.21, 20),
      silver,
      `exhaust-tip-${side}`,
      [side * 0.19, 0.55, -1.6],
    );
    pipe.rotation.x = Math.PI / 2;
    const hole = add(
      body,
      new THREE.CircleGeometry(0.089, 20),
      dark,
      `exhaust-bore-${side}`,
      [side * 0.19, 0.55, -1.708],
    );
    hole.rotation.y = Math.PI;
  }
  if (id === "apex") {
    S(paint, "touring-crown", [
      [0.32, 0.48, 0.58, 1.18],
      [0.65, 0.55, 0.53, 1.17],
      [1.1, 0.54, 0.48, 1.02],
      [1.55, 0.5, 0.45, 0.78],
      [1.88, 0.66, 0.43, 0.6],
    ]);
    S(accent, "champagne-crown-inlay", [
      [0.48, 0.032, 1.184, 1.194],
      [0.65, 0.032, 1.174, 1.184],
      [1.1, 0.032, 1.024, 1.034],
      [1.55, 0.032, 0.784, 0.794],
      [1.85, 0.032, 0.625, 0.635],
    ]);
    B(dark, "touring-low-lip", [2.13, 0.08, 0.16], [0, 0.34, 1.94]);
    B(accent, "touring-lip-edge", [2.08, 0.025, 0.04], [0, 0.388, 2.005]);
    B(dark, "oval-front-intake", [0.69, 0.12, 0.05], [0, 0.48, 1.911], 0.055);
    for (const side of [-1, 1]) {
      A(side, 1.2, true);
      A(side, -1.12, false);
      S(
        paint,
        `touring-door-${side}`,
        [
          [-0.48, 0.22, 0.45, 0.9],
          [0, 0.24, 0.43, 0.88],
          [0.48, 0.18, 0.46, 0.82],
        ],
        true,
        side * 0.87,
      );
      B(
        accent,
        `touring-sill-${side}`,
        [0.26, 0.07, 0.93],
        [side * 0.92, 0.44, 0],
      );
      frontLamp(side * 1.03, 1.16, 1.57);
    }
    B(paint, "touring-tail-spoiler", [1.44, 0.1, 0.23], [0, 1.04, -1.4], 0.05);
  } else if (id === "vesper") {
    S(
      paint,
      "angular-spine",
      [
        [0.31, 0.47, 0.56, 1.18],
        [0.78, 0.54, 0.48, 1.11],
        [1.48, 0.38, 0.39, 0.73],
        [1.96, 0.12, 0.37, 0.43],
      ],
      false,
    );
    for (const side of [-1, 1]) {
      A(side, 1.2, true, true);
      A(side, -1.12, false, true);
      S(
        paint,
        `wedge-door-${side}`,
        [
          [-0.49, 0.22, 0.44, 1.05],
          [-0.1, 0.29, 0.4, 0.91],
          [0.47, 0.15, 0.44, 0.8],
        ],
        false,
        side * 0.86,
      );
      S(
        dark,
        `blade-intake-${side}`,
        [
          [-0.42, 0.04, 0.56, 0.92],
          [0.14, 0.05, 0.53, 0.8],
          [0.36, 0.025, 0.54, 0.66],
        ],
        false,
        side * 1.12,
      );
      S(
        dark,
        `splitter-${side}`,
        [
          [1.83, 0.35, 0.3, 0.34],
          [2.025, 0.3, 0.3, 0.34],
        ],
        false,
        side * 0.64,
      );
      rail(
        accent,
        `wedge-crease-${side}`,
        [side * 0.14, 0.49, 1.88],
        [side * 0.42, 1.12, 0.65],
        0.013,
      );
      frontLamp(side * 1.04, 1.17, 1.57);
    }
    wing(1.65, 2.02, -1.38);
  } else if (id === "corsa") {
    S(
      paint,
      "formula-nose",
      [
        [0.3, 0.4, 0.57, 1.2],
        [0.7, 0.33, 0.48, 1.14],
        [1.22, 0.24, 0.39, 0.9],
        [1.85, 0.16, 0.34, 0.48],
      ],
      false,
    );
    S(
      accent,
      "formula-stripe",
      [
        [0.36, 0.037, 1.204, 1.214],
        [0.7, 0.037, 1.144, 1.154],
        [1.22, 0.037, 0.904, 0.914],
        [1.83, 0.037, 0.5, 0.51],
      ],
      false,
    );
    for (const side of [-1, 1]) {
      S(
        paint,
        `formula-sidepod-${side}`,
        [
          [-0.47, 0.24, 0.43, 0.96],
          [-0.1, 0.27, 0.42, 0.87],
          [0.43, 0.15, 0.44, 0.7],
        ],
        false,
        side * 0.87,
      );
      B(
        dark,
        `radiator-mouth-${side}`,
        [0.28, 0.18, 0.025],
        [side * 0.86, 0.62, 0.445],
      );
      B(
        dark,
        `front-wing-${side}`,
        [0.83, 0.075, 0.26],
        [side * 0.65, 0.36, 1.93],
      );
      B(
        paint,
        `front-wing-endplate-${side}`,
        [0.06, 0.25, 0.29],
        [side * 1.065, 0.455, 1.94],
      );
      B(
        accent,
        `front-wing-trailing-element-${side}`,
        [0.77, 0.035, 0.07],
        [side * 0.65, 0.445, 1.85],
      );
    }
    wing(1.59, 2.04, -1.4);
  } else if (id === "aurelia") {
    S(paint, "heritage-bonnet", [
      [0.32, 0.49, 0.55, 1.18],
      [0.72, 0.54, 0.48, 1.14],
      [1.2, 0.53, 0.42, 1.03],
      [1.63, 0.47, 0.37, 0.88],
      [1.88, 0.43, 0.37, 0.72],
    ]);
    // An oval grille with separate metallic surround and recessed grille bars.
    const ring = add(
      body,
      new THREE.TorusGeometry(0.3, 0.026, 8, 40),
      accent,
      "oval-grille-surround",
      [0, 0.57, 1.924],
    );
    ring.scale.set(1.23, 0.68, 1);
    const grille = add(
      body,
      new THREE.CircleGeometry(0.3, 40),
      dark,
      "oval-grille",
      [0, 0.57, 1.919],
    );
    grille.scale.set(1.23, 0.68, 1);
    for (let x = -3; x <= 3; x++)
      B(
        accent,
        `grille-slat-${x}`,
        [0.013, 0.28 * Math.sqrt(1 - (x / 4) ** 2), 0.012],
        [x * 0.077, 0.57, 1.931],
        0.004,
      );
    rail(accent, "bonnet-centre-trim", [0, 0.8, 1.78], [0, 1.185, 0.48], 0.017);
    for (const side of [-1, 1]) {
      A(side, 1.2, true);
      A(side, -1.12, false);
      S(
        paint,
        `heritage-cockpit-side-${side}`,
        [
          [-0.49, 0.2, 0.48, 1.04],
          [0, 0.22, 0.45, 0.83],
          [0.47, 0.18, 0.49, 0.91],
        ],
        true,
        side * 0.86,
      );
      frontLamp(side * 0.57, 0.95, 1.64, true);
      rail(
        silver,
        `heritage-side-exhaust-${side}`,
        [side * 1.13, 0.45, -0.43],
        [side * 1.13, 0.45, 0.39],
        0.072,
      );
      rail(
        accent,
        `heritage-sill-trim-${side}`,
        [side * 1.075, 0.59, -0.43],
        [side * 1.075, 0.59, 0.4],
        0.015,
      );
    }
  } else if (id === "tempest") {
    S(
      accent,
      "titanium-central-blade",
      [
        [0.32, 0.34, 0.55, 1.15],
        [0.77, 0.32, 0.47, 1.08],
        [1.32, 0.21, 0.38, 0.76],
        [1.97, 0.075, 0.34, 0.4],
      ],
      false,
    );
    for (const side of [-1, 1]) {
      A(side, 1.2, true);
      A(side, -1.12, false);
      // Tall independent pods leave an open air channel beside the centre blade.
      S(
        paint,
        `twin-nose-pod-${side}`,
        [
          [0.65, 0.13, 1.23, 1.31],
          [1.05, 0.19, 1.33, 1.42],
          [1.39, 0.19, 1.26, 1.34],
          [1.7, 0.12, 1.13, 1.19],
          [1.94, 0.055, 0.43, 0.5],
        ],
        true,
        side * 0.88,
      );
      S(
        accent,
        `titanium-sidepod-${side}`,
        [
          [-0.48, 0.2, 0.46, 1.0],
          [-0.1, 0.23, 0.43, 0.91],
          [0.43, 0.15, 0.48, 0.78],
        ],
        false,
        side * 0.87,
      );
      S(
        dark,
        `channel-splitter-${side}`,
        [
          [1.82, 0.33, 0.29, 0.34],
          [2.04, 0.26, 0.29, 0.34],
        ],
        false,
        side * 0.62,
      );
      frontLamp(side * 0.88, 1.265, 1.47);
    }
    wing(1.57, 1.96, -1.32, true);
  } else {
    S(
      paint,
      "rally-squared-bonnet",
      [
        [0.34, 0.48, 0.55, 1.18],
        [0.82, 0.53, 0.48, 1.1],
        [1.42, 0.47, 0.42, 0.82],
        [1.86, 0.47, 0.4, 0.65],
      ],
      false,
    );
    S(
      dark,
      "rally-hood-vent",
      [
        [0.58, 0.19, 1.15, 1.17],
        [0.85, 0.19, 1.102, 1.122],
        [1.15, 0.17, 0.965, 0.985],
      ],
      false,
    );
    B(silver, "rally-front-skid", [0.91, 0.23, 0.12], [0, 0.43, 1.97]);
    for (const side of [-1, 1]) {
      A(side, -1.12, false, true);
      // Short high front guards retain the exposed rally tire silhouette.
      const guard = B(
        dark,
        `rally-front-guard-${side}`,
        [0.67, 0.07, 0.6],
        [side * 1.13, 1.23, 1.2],
        0.045,
      );
      guard.rotation.z = side * 0.025;
      S(
        paint,
        `rally-door-${side}`,
        [
          [-0.45, 0.21, 0.47, 0.91],
          [0.44, 0.21, 0.47, 0.87],
        ],
        false,
        side * 0.86,
      );
      rail(
        silver,
        `rally-side-rail-${side}`,
        [side * 1.17, 0.41, -0.44],
        [side * 1.17, 0.41, 0.43],
        0.045,
      );
      rail(
        silver,
        `rally-door-protection-${side}`,
        [side * 1.115, 0.48, -0.43],
        [side * 1.115, 0.95, -0.39],
        0.032,
      );
      frontLamp(side * 0.36, 0.87, 1.61, true);
      rail(
        dark,
        `rally-front-bumper-${side}`,
        [side * 0.48, 0.46, 1.99],
        [side * 1.05, 0.46, 1.99],
        0.065,
      );
      B(
        dark,
        `rally-bumper-block-${side}`,
        [0.25, 0.23, 0.17],
        [side * 0.92, 0.43, 1.94],
      );
    }
    wing(1.47, 1.9, -1.35);
    for (const z of [-1.48, -1.28])
      rail(
        silver,
        `rally-luggage-rail-${z}`,
        [-0.86, 1.55, z],
        [0.86, 1.55, z],
        0.025,
      );
    // Thin raised tread blocks stay within the original radius and roll with the tire.
    for (const wheel of root.children.filter((n) => n.userData.wheelRadius)) {
      const spin = wheel.getObjectByName(wheel.userData.spinNode)!;
      const rubber = materials.get("kart-rubber")!;
      // Recess the tread bed, so the blocks show without inflating tire radius.
      // Lathe geometry uses Y as its axle before the preserved tire transform.
      const tire = spin.getObjectByName("tire") as THREE.Mesh;
      const positions = tire.geometry.getAttribute("position");
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const x = positions.getX(vertex),
          z = positions.getZ(vertex);
        const radius = Math.hypot(x, z);
        if (radius > 0.49) {
          const recessed = Math.max(0.49, radius - 0.014) / radius;
          positions.setXYZ(
            vertex,
            x * recessed,
            positions.getY(vertex),
            z * recessed,
          );
        }
      }
      tire.geometry.computeVertexNormals();
      for (let i = 0; i < 24; i++)
        for (const side of [-1, 1]) {
          const angle = (i * Math.PI) / 12 + (side > 0 ? 0.055 : 0);
          const block = add(
            spin,
            new THREE.BoxGeometry(0.18, 0.018, 0.068),
            rubber,
            `rally-tread-${i}-${side}`,
            [side * 0.096, Math.cos(angle) * 0.51, Math.sin(angle) * 0.51],
          );
          block.rotation.x = angle;
        }
    }
  }
  // Cohesive front fascia ties the sculpted fender volumes to the central bonnet.
  if (
    id === "apex" ||
    id === "vesper" ||
    id === "aurelia" ||
    id === "tempest"
  ) {
    if (id !== "tempest") {
      S(
        paint,
        "integrated-front-fascia",
        [
          [1.835, 0.99, 0.39, 0.69],
          [1.96, 1.025, 0.37, 0.64],
          [2.055, 0.94, 0.36, 0.51],
        ],
        id !== "vesper",
      );
      B(
        dark,
        "fascia-centre-inlet",
        [id === "aurelia" ? 0.5 : 0.68, 0.14, 0.035],
        [0, 0.47, 2.071],
        0.05,
      );
      for (const side of [-1, 1]) {
        B(
          dark,
          `fascia-brake-inlet-${side}`,
          [0.27, 0.105, 0.036],
          [side * 0.74, 0.465, 2.067],
          0.028,
        );
        for (let slat = 0; slat < 3; slat++)
          B(
            accent,
            `brake-inlet-louvre-${side}-${slat}`,
            [0.2, 0.012, 0.018],
            [side * 0.74, 0.431 + slat * 0.03, 2.09],
            0.003,
          );
      }
    }
    // Remove the old under-arch lamps, including their unique primitive resources.
    for (const part of [...body.children])
      if (
        part.name.startsWith("blade-lamp") ||
        part.name.startsWith("round-lamp")
      ) {
        if (part instanceof THREE.Mesh) part.geometry.dispose();
        part.removeFromParent();
      }
    const crown = (z: number) => fenderCrown(z, true, id === "vesper") + 0.025;
    for (const side of [-1, 1]) {
      const zCentre = id === "aurelia" ? 1.65 : 1.64,
        xCentre = side * 0.98;
      const curvedLens = (
        m: THREE.Material,
        name: string,
        width: number,
        length: number,
        lift: number,
        zOffset = 0,
      ) => {
        const g = new THREE.SphereGeometry(1, 24, 12),
          p = g.getAttribute("position");
        const lensZ = zCentre + zOffset;
        const yCentre = crown(lensZ) + lift;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i) * width,
            z = p.getZ(i) * length,
            y = p.getY(i);
          p.setXYZ(i, x, crown(lensZ + z) + lift + y * 0.023 - yCentre, z);
        }
        g.computeVertexNormals();
        const normals = g.getAttribute("normal");
        for (let i = 0; i < normals.count; i++)
          if (
            Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) < 0.1
          )
            normals.setXYZ(
              i,
              0,
              Math.sign(
                p.getY(i) + yCentre - crown(lensZ + p.getZ(i)) - lift,
              ) || 1,
              0,
            );
        return add(body, g, m, name, [xCentre, yCentre, lensZ]);
      };
      const width = id === "vesper" ? 0.22 : id === "aurelia" ? 0.15 : 0.145;
      const length = id === "vesper" ? 0.06 : id === "aurelia" ? 0.15 : 0.205;
      curvedLens(
        accent,
        `headlight-surround-${side}`,
        width + 0.025,
        length + 0.021,
        0.025,
      );
      curvedLens(
        dark,
        `headlight-bezel-${side}`,
        width + 0.014,
        length + 0.012,
        0.036,
      );
      curvedLens(
        materials.get("kart-visor")!,
        `headlight-lens-${side}`,
        width,
        length,
        0.052,
      );
      if (id === "vesper") {
        curvedLens(lamp, `headlight-led-${side}`, 0.17, 0.012, 0.078);
      } else {
        for (const offset of id === "aurelia" ? [0] : [-0.075, 0.075]) {
          curvedLens(
            silver,
            `headlight-projector-bezel-${side}-${offset}`,
            0.062,
            0.057,
            0.081,
            offset,
          );
          curvedLens(
            lamp,
            `headlight-projector-${side}-${offset}`,
            0.041,
            0.036,
            0.105,
            offset,
          );
        }
      }
    }
  }
  if (id === "aurelia") {
    const radiator = add(
      body,
      new THREE.SphereGeometry(1, 32, 16),
      paint,
      "heritage-radiator-shell",
      [0, 0.62, 1.965],
    );
    radiator.scale.set(0.475, 0.3, 0.1);
    for (const child of body.children)
      if (
        child.name.startsWith("oval-grille") ||
        child.name.startsWith("grille-slat")
      )
        child.position.z += 0.15;
    const oldTrim = body.getObjectByName("bonnet-centre-trim");
    if (oldTrim instanceof THREE.Mesh) {
      oldTrim.geometry.dispose();
      oldTrim.removeFromParent();
    }
    S(accent, "heritage-bonnet-inlay", [
      [0.35, 0.024, 1.181, 1.193],
      [0.72, 0.024, 1.141, 1.153],
      [1.2, 0.024, 1.031, 1.043],
      [1.63, 0.024, 0.881, 0.893],
      [1.87, 0.024, 0.721, 0.733],
    ]);
  }

  // Continuous sills and inset gills join the front shoulders to the rear deck.
  for (const side of [-1, 1]) {
    S(
      id === "corsa" ? dark : paint,
      `sculpted-lower-sill-${side}`,
      [
        [-0.49, 0.22, 0.37, 0.49],
        [0, 0.26, 0.35, 0.48],
        [0.49, 0.2, 0.37, 0.48],
      ],
      id !== "vesper",
      side * 0.86,
    );
    if (id !== "corsa" && id !== "rallye") {
      const insert = B(
        dark,
        `side-intake-recess-${side}`,
        [0.035, 0.2, 0.48],
        [side * 1.108, 0.7, -0.07],
        0.015,
      );
      insert.rotation.z = side * 0.12;
      for (let j = 0; j < 4; j++)
        B(
          accent,
          `side-intake-gill-${side}-${j}`,
          [0.04, 0.16, 0.018],
          [side * 1.13, 0.705, -0.24 + j * 0.11],
          0.005,
        );
    }
    B(
      dark,
      `diffuser-fin-${side}`,
      [0.035, 0.15, 0.42],
      [side * 0.57, 0.35, -1.48],
      0.006,
    );
    B(
      dark,
      `diffuser-inner-fin-${side}`,
      [0.025, 0.13, 0.42],
      [side * 0.25, 0.34, -1.48],
      0.005,
    );
  }
  B(dark, "rear-diffuser-tray", [1.45, 0.065, 0.42], [0, 0.3, -1.48], 0.02);
  S(
    paint,
    "sculpted-rear-deck",
    [
      [-1.59, 0.58, 0.75, 0.97],
      [-1.34, 0.66, 0.77, 1.14],
      [-0.91, 0.59, 0.79, 1.16],
    ],
    id !== "vesper" && id !== "rallye",
  );
  for (const side of [-1, 1])
    for (let i = 0; i < 5; i++)
      B(
        dark,
        `engine-deck-vent-${side}-${i}`,
        [0.19, 0.025, 0.035],
        [side * 0.39, 1.151, -1.05 - i * 0.054],
        0.009,
      );
  const roll = add(
    body,
    new THREE.TorusGeometry(0.4, 0.045, 10, 40, Math.PI),
    dark,
    "cockpit-roll-hoop",
    [0, 1.26, -0.84],
  );
  roll.scale.y = 0.88;
  for (const side of [-1, 1])
    rail(
      dark,
      `roll-hoop-mount-${side}`,
      [side * 0.4, 1.26, -0.84],
      [side * 0.4, 0.93, -1.05],
      0.045,
    );
  // Larger machined wheel faces use actual spokes, rim barrels and fasteners.
  // Wheel pivots, rubber outer envelope and axle coordinates remain unchanged.
  for (const wheel of root.children.filter((n) => n.userData.wheelRadius)) {
    const spin = wheel.getObjectByName(wheel.userData.spinNode)!;
    const outward = wheel.userData.side === "left" ? -1 : 1;
    const metal = id === "apex" || id === "aurelia" ? accent : silver;
    for (const old of [...spin.children])
      if (
        old.name === "rim" ||
        old.name.startsWith("rim-spoke") ||
        old.name === "brake-disc"
      ) {
        if (old instanceof THREE.Mesh) old.geometry.dispose();
        old.removeFromParent();
      }
    const lip = add(
      spin,
      new THREE.TorusGeometry(0.345, 0.023, 10, 48),
      metal,
      "machined-rim-lip",
      [outward * 0.234, 0, 0],
    );
    lip.rotation.y = Math.PI / 2;
    const inner = add(
      spin,
      new THREE.TorusGeometry(0.313, 0.012, 8, 40),
      dark,
      "rim-inner-shadow",
      [outward * 0.235, 0, 0],
    );
    inner.rotation.y = Math.PI / 2;
    const disc = add(
      spin,
      new THREE.CylinderGeometry(0.285, 0.285, 0.016, 40),
      dark,
      "ventilated-brake-disc",
      [outward * 0.19, 0, 0],
    );
    disc.rotation.z = Math.PI / 2;
    const spokeCount =
      id === "aurelia"
        ? 16
        : id === "apex"
          ? 12
          : id === "vesper"
            ? 7
            : id === "corsa"
              ? 6
              : id === "tempest"
                ? 5
                : 8;
    for (let i = 0; i < spokeCount; i++) {
      const a = (i * Math.PI * 2) / spokeCount;
      const spoke = add(
        spin,
        new THREE.BoxGeometry(0.036, 0.254, id === "aurelia" ? 0.017 : 0.035),
        metal,
        `machined-spoke-${i}`,
        [outward * 0.244, Math.cos(a) * 0.2, Math.sin(a) * 0.2],
      );
      spoke.rotation.x = a;
      if (id === "tempest" || id === "vesper") {
        const pair = add(
          spin,
          new THREE.BoxGeometry(0.029, 0.236, 0.019),
          metal,
          `split-spoke-${i}`,
          [outward * 0.243, Math.cos(a + 0.11) * 0.2, Math.sin(a + 0.11) * 0.2],
        );
        pair.rotation.x = a + 0.11;
      }
    }
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      const bolt = add(
        spin,
        new THREE.CylinderGeometry(0.017, 0.017, 0.022, 6),
        metal,
        `wheel-bolt-${i}`,
        [outward * 0.263, Math.cos(a) * 0.066, Math.sin(a) * 0.066],
      );
      bolt.rotation.z = Math.PI / 2;
    }
  }

  // Touring and heritage wheels carry the same warm metal as their body trim.
  if (id === "apex" || id === "aurelia") {
    for (const wheel of root.children.filter(
      (node) => node.userData.wheelRadius,
    ))
      wheel.traverse((node) => {
        if (node instanceof THREE.Mesh && node.material === silver)
          node.material = accent;
      });
  }
  if (id === "corsa") lamp.dispose(); // Formula body has no road headlights.
  root.userData.assetVersion = `premium-${id}-v2`;
  return root;
}
