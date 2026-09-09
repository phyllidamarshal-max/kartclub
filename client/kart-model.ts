import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

type MaterialSet = {
  paint: THREE.MeshPhysicalMaterial;
  dark: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  silver: THREE.MeshStandardMaterial;
  suit: THREE.MeshStandardMaterial;
  upholstery: THREE.MeshStandardMaterial;
  visor: THREE.MeshPhysicalMaterial;
};

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
) {
  // Every cloth piece carries the same attribute so the material still batches once.
  if (
    (material as THREE.MeshStandardMaterial).vertexColors &&
    !geometry.hasAttribute("color")
  ) {
    geometry.setAttribute(
      "color",
      new THREE.Uint8BufferAttribute(
        new Uint8Array(geometry.getAttribute("position").count * 3).fill(255),
        3,
        true,
      ),
    );
  }
  // Lathed pole duplicates can have zero computed normals; keep exported PBR normals valid.
  const normals = geometry.getAttribute("normal");
  const positions = geometry.getAttribute("position");
  if (normals)
    for (let i = 0; i < normals.count; i++) {
      const normal = new THREE.Vector3().fromBufferAttribute(normals, i);
      if (normal.lengthSq() < 1e-12)
        normal.set(0, Math.sign(positions.getY(i)) || 1, 0);
      else normal.normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
    }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function roundedBox(
  parent: THREE.Object3D,
  material: THREE.Material,
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  radius: number,
) {
  const mesh = addMesh(
    parent,
    new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius),
    material,
    name,
  );
  mesh.position.set(...position);
  return mesh;
}

function capsuleBetween(
  parent: THREE.Object3D,
  material: THREE.Material,
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  radialSegments = 8,
) {
  const direction = end.clone().sub(start);
  const mesh = addMesh(
    parent,
    new THREE.CapsuleGeometry(
      radius,
      Math.max(0.001, direction.length() - radius * 2),
      4,
      radialSegments,
    ),
    material,
    name,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return mesh;
}

function cylinderBetween(
  parent: THREE.Object3D,
  material: THREE.Material,
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
) {
  const direction = end.clone().sub(start);
  const mesh = addMesh(
    parent,
    new THREE.CylinderGeometry(radius, radius, direction.length(), 10),
    material,
    name,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return mesh;
}

/** A broad cowl with a rounded crown that falls smoothly into the low bumper. */
function noseGeometry() {
  const sections = [
    { z: 0.35, halfWidth: 0.5, bottom: 0.61, top: 1.3 },
    { z: 0.58, halfWidth: 0.55, bottom: 0.59, top: 1.32 },
    { z: 0.9, halfWidth: 0.535, bottom: 0.56, top: 1.22 },
    { z: 1.22, halfWidth: 0.48, bottom: 0.54, top: 1.02 },
    { z: 1.48, halfWidth: 0.415, bottom: 0.52, top: 0.77 },
    { z: 1.61, halfWidth: 0.385, bottom: 0.52, top: 0.67 },
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  const sides = 17;
  for (const { z, halfWidth: w, bottom, top } of sections) {
    const rx = w * 0.26;
    const ry = Math.min(0.12, (top - bottom) * 0.32);
    const corners = [
      [w - rx, top - ry],
      [w - rx, bottom + ry],
      [-w + rx, bottom + ry],
      [-w + rx, top - ry],
    ];
    for (let corner = 0; corner < 4; corner++) {
      for (let segment = 0; segment <= 3; segment++) {
        const a =
          Math.PI / 2 - (corner * Math.PI) / 2 - ((segment / 3) * Math.PI) / 2;
        positions.push(
          corners[corner][0] + rx * Math.cos(a),
          corners[corner][1] + ry * Math.sin(a),
          z,
        );
      }
    }
    positions.push(0, top + 0.008, z);
  }
  for (let section = 0; section < sections.length - 1; section++) {
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      const a = section * sides,
        b = a + sides;
      indices.push(a + side, b + side, b + next, a + side, b + next, a + next);
    }
  }
  for (const [offset, reverse] of [
    [0, true],
    [(sections.length - 1) * sides, false],
  ] as const) {
    const start = positions.length / 3;
    positions.push(...positions.slice(offset * 3, (offset + sides) * 3));
    for (let side = 1; side < sides - 1; side++) {
      if (reverse) indices.push(start, start + side, start + side + 1);
      else indices.push(start, start + side + 1, start + side);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // The reference cowl has a broad planar centre, with rounding confined to its
  // shoulders. Large side quads must not pull the roof normals into a cylinder.
  const normals = geometry.getAttribute("normal");
  for (let section = 0; section < sections.length; section++) {
    const before = sections[Math.max(0, section - 1)];
    const after = sections[Math.min(sections.length - 1, section + 1)];
    const normal = new THREE.Vector3(
      0,
      after.z - before.z,
      before.top - after.top,
    ).normalize();
    for (const side of [0, 15, 16])
      normals.setXYZ(section * sides + side, normal.x, normal.y, normal.z);
  }
  return geometry;
}

/** Beveled horizontal bodywork: the front corners sweep back around the tires. */
function bumperGeometry(width: number, height: number, depth: number) {
  const w = width / 2;
  const d = depth / 2;
  const outline = new THREE.Shape();
  outline.moveTo(-w + 0.23, d);
  outline.quadraticCurveTo(0, d + 0.14, w - 0.23, d);
  outline.quadraticCurveTo(w - 0.06, d - 0.04, w, d - 0.17);
  outline.lineTo(w, -d + 0.07);
  outline.quadraticCurveTo(w - 0.035, -d, w - 0.16, -d);
  outline.lineTo(w - 0.36, -d + 0.13);
  outline.lineTo(-w + 0.36, -d + 0.13);
  outline.lineTo(-w + 0.16, -d);
  outline.quadraticCurveTo(-w + 0.035, -d, -w, -d + 0.07);
  outline.lineTo(-w, d - 0.17);
  outline.quadraticCurveTo(-w + 0.06, d - 0.04, -w + 0.23, d);
  outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: height - 0.11,
    bevelEnabled: true,
    bevelSize: 0.055,
    bevelThickness: 0.055,
    bevelSegments: 3,
    curveSegments: 3,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height / 2 - 0.055, 0);
  return geometry;
}

/** A narrow stripe that follows the crown instead of hovering as a rectangular block. */
function crownStripeGeometry() {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = -0.38 + (i / 12) * 0.9;
    for (const [x, radius] of [
      [-0.072, 0.648],
      [0.072, 0.648],
      [0.072, 0.679],
      [-0.072, 0.679],
    ]) {
      const r = Math.sqrt(radius ** 2 - x ** 2);
      vertices.push(x, Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.94);
    }
    if (i < 12) {
      const k = i * 4;
      for (let side = 0; side < 4; side++) {
        const n = (side + 1) % 4;
        indices.push(
          k + side,
          k + n,
          k + 4 + n,
          k + side,
          k + 4 + n,
          k + 4 + side,
        );
      }
    }
  }
  indices.push(0, 2, 1, 0, 3, 2, 48, 49, 50, 48, 50, 51);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Shared full-face helmet surface; the chin is subtly narrower and projects forward. */
function helmetPoint(yaw: number, latitude: number, radius: number) {
  const chin = Math.max(0, -Math.sin(latitude));
  return new THREE.Vector3(
    radius * Math.cos(latitude) * Math.sin(yaw) * (1 - chin * 0.055),
    radius * Math.sin(latitude) * 0.98,
    radius * Math.cos(latitude) * Math.cos(yaw) * 0.94 + chin * 0.04,
  );
}

function helmetGeometry() {
  const geometry = new THREE.SphereGeometry(0.64, 48, 28);
  const p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const point = helmetPoint(
      Math.atan2(p.getX(i), p.getZ(i)),
      Math.asin(THREE.MathUtils.clamp(p.getY(i) / 0.64, -1, 1)),
      0.64,
    );
    p.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Rounded visor edges are part of the curved surface, with a thin surrounding gasket. */
function visorGeometry(trim: boolean) {
  const positions: number[] = [],
    indices: number[] = [];
  const columns = 40,
    rows = 10;
  const spread = THREE.MathUtils.degToRad(trim ? 82 : 79);
  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    for (let column = 0; column <= columns; column++) {
      const u = (column / columns) * 2 - 1;
      const yaw = u * (spread - 0.045 * Math.pow(Math.abs(v * 2 - 1), 6));
      const corner = Math.pow(Math.abs(u), 6);
      const top = (trim ? 0.165 : 0.13) - corner * 0.07;
      const bottom = (trim ? -0.55 : -0.51) + corner * 0.12;
      const point = helmetPoint(
        yaw,
        top + (bottom - top) * v,
        trim ? 0.652 : 0.663,
      );
      positions.push(point.x, point.y, point.z);
      if (row < rows && column < columns) {
        const k = row * (columns + 1) + column;
        indices.push(
          k,
          k + columns + 1,
          k + 1,
          k + 1,
          k + columns + 1,
          k + columns + 2,
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function seatShellGeometry() {
  const blank = new RoundedBoxGeometry(1.06, 0.72, 0.58, 3, 0.16);
  blank.deleteAttribute("normal");
  blank.deleteAttribute("uv");
  const geometry = mergeVertices(blank, 1e-5);
  blank.dispose();
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i),
      x = positions.getX(i);
    const height = THREE.MathUtils.clamp((y + 0.36) / 0.72, 0, 1);
    // Rounded shoulders taper gently; lateral wings curl forward around the driver.
    positions.setXYZ(
      i,
      x * (1 - height * 0.13),
      y,
      positions.getZ(i) + 0.23 * Math.pow(Math.abs(x) / 0.53, 2),
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

function addWheel(
  root: THREE.Group,
  materials: MaterialSet,
  x: number,
  z: number,
  axle: "front" | "rear",
  side: "left" | "right",
) {
  const mount = new THREE.Group();
  mount.name = `wheel-${axle}-${side}`;
  mount.position.set(x, 0.62, z);
  mount.userData = {
    wheelRadius: 0.52,
    steerable: axle === "front",
    axle,
    side,
    spinNode: `wheel-spin-${axle}-${side}`,
  };
  root.add(mount);
  const wheel = new THREE.Group();
  wheel.name = mount.userData.spinNode;
  mount.add(wheel);

  const tire = addMesh(
    wheel,
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.22, -0.2),
        new THREE.Vector2(0.33, -0.205),
        new THREE.Vector2(0.39, -0.201),
        new THREE.Vector2(0.46, -0.185),
        new THREE.Vector2(0.5, -0.157),
        new THREE.Vector2(0.517, -0.119),
        new THREE.Vector2(0.52, -0.072),
        new THREE.Vector2(0.52, 0),
        new THREE.Vector2(0.52, 0.072),
        new THREE.Vector2(0.517, 0.119),
        new THREE.Vector2(0.5, 0.157),
        new THREE.Vector2(0.46, 0.185),
        new THREE.Vector2(0.39, 0.201),
        new THREE.Vector2(0.33, 0.205),
        new THREE.Vector2(0.22, 0.2),
      ],
      32,
    ),
    materials.rubber,
    "tire",
  );
  tire.rotation.z = Math.PI / 2;
  tire.scale.y = 1.17;

  const hub = addMesh(
    wheel,
    new THREE.CylinderGeometry(0.245, 0.245, 0.35, 16),
    materials.dark,
    "hub",
  );
  hub.rotation.z = Math.PI / 2;

  const outward = side === "left" ? -1 : 1;
  const rim = addMesh(
    wheel,
    new THREE.TorusGeometry(0.245, 0.026, 8, 24),
    materials.silver,
    "rim",
  );
  rim.position.x = outward * 0.224;
  rim.rotation.y = Math.PI / 2;

  const cap = addMesh(
    wheel,
    new THREE.CylinderGeometry(0.095, 0.095, 0.37, 12),
    materials.dark,
    "hub-cap",
  );
  cap.rotation.z = Math.PI / 2;
  for (const face of [-1, 1]) {
    const bead = addMesh(
      wheel,
      new THREE.TorusGeometry(0.345, 0.009, 5, 32),
      materials.rubber,
      `sidewall-bead-${face}`,
    );
    bead.rotation.y = Math.PI / 2;
    bead.position.x = face * 0.237;
  }
  const brake = addMesh(
    wheel,
    new THREE.CylinderGeometry(0.19, 0.19, 0.025, 24),
    materials.silver,
    "brake-disc",
  );
  brake.rotation.z = Math.PI / 2;
  brake.position.x = outward * 0.211;
  for (let spoke = 0; spoke < 5; spoke++) {
    const a = (spoke * Math.PI * 2) / 5;
    cylinderBetween(
      wheel,
      materials.silver,
      `rim-spoke-${spoke}`,
      new THREE.Vector3(
        outward * 0.225,
        Math.cos(a) * 0.07,
        Math.sin(a) * 0.07,
      ),
      new THREE.Vector3(
        outward * 0.227,
        Math.cos(a + 0.12) * 0.224,
        Math.sin(a + 0.12) * 0.224,
      ),
      0.025,
    );
  }
  const axleNut = addMesh(
    wheel,
    new THREE.CylinderGeometry(0.065, 0.065, 0.032, 6),
    materials.silver,
    "axle-nut",
  );
  axleNut.rotation.z = Math.PI / 2;
  axleNut.position.x = outward * 0.244;
}

function addSuspension(root: THREE.Group, materials: MaterialSet) {
  const darkBar = (
    name: string,
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius = 0.045,
  ) => cylinderBetween(root, materials.dark, name, a, b, radius);
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    darkBar(
      `front-suspension-${prefix}-upper`,
      new THREE.Vector3(side * 0.42, 0.73, 1.17),
      new THREE.Vector3(side * 1.05, 0.69, 1.2),
    );
    darkBar(
      `front-suspension-${prefix}-lower`,
      new THREE.Vector3(side * 0.46, 0.51, 1.34),
      new THREE.Vector3(side * 1.05, 0.55, 1.2),
    );
    cylinderBetween(
      root,
      materials.silver,
      `front-shock-${prefix}`,
      new THREE.Vector3(side * 0.57, 0.82, 1.02),
      new THREE.Vector3(side * 0.91, 0.52, 1.19),
      0.06,
    );
    const shockStart = new THREE.Vector3(side * 0.57, 0.82, 1.02);
    const shockEnd = new THREE.Vector3(side * 0.91, 0.52, 1.19);
    const shockAxis = shockEnd.clone().sub(shockStart);
    const springPoints: THREE.Vector3[] = [];
    const basis = new THREE.Vector3(0, 0, 1).cross(shockAxis).normalize();
    const basis2 = shockAxis.clone().normalize().cross(basis);
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      springPoints.push(
        shockStart
          .clone()
          .addScaledVector(shockAxis, t)
          .addScaledVector(basis, Math.cos(t * Math.PI * 12) * 0.076)
          .addScaledVector(basis2, Math.sin(t * Math.PI * 12) * 0.076),
      );
    }
    addMesh(
      root,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(springPoints),
        64,
        0.012,
        5,
        false,
      ),
      materials.silver,
      `front-spring-${prefix}`,
    );
    darkBar(
      `rear-axle-${prefix}`,
      new THREE.Vector3(side * 0.55, 0.61, -1.12),
      new THREE.Vector3(side * 1.05, 0.61, -1.12),
      0.055,
    );
  }
  darkBar(
    "front-crossbar",
    new THREE.Vector3(-0.91, 0.58, 1.25),
    new THREE.Vector3(0.91, 0.58, 1.25),
    0.055,
  );
}

/** Neutral fabric occlusion in compressed cloth; independent of sun direction. */
function clothRecessColors(
  geometry: THREE.BufferGeometry,
  shade: (p: THREE.Vector3, i: number) => number,
) {
  const positions = geometry.getAttribute("position");
  const colors = new Uint8Array(positions.count * 3);
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    const value = Math.round(
      255 *
        THREE.MathUtils.clamp(
          shade(point.fromBufferAttribute(positions, i), i),
          0.65,
          1,
        ),
    );
    colors.set([value, value, value], i * 3);
  }
  geometry.setAttribute(
    "color",
    new THREE.Uint8BufferAttribute(colors, 3, true),
  );
  return geometry;
}

/** Elliptical fitted chest, broad at the shoulders and compressed into the seat. */
function torsoGeometry() {
  const geometry = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, -0.35),
      new THREE.Vector2(0.25, -0.35),
      new THREE.Vector2(0.32, -0.29),
      new THREE.Vector2(0.345, -0.16),
      new THREE.Vector2(0.37, 0.02),
      new THREE.Vector2(0.415, 0.17),
      new THREE.Vector2(0.4, 0.245),
      new THREE.Vector2(0.34, 0.3),
      new THREE.Vector2(0.225, 0.34),
      new THREE.Vector2(0, 0.34),
    ],
    24,
  );
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    // Squared oval cross-section makes a seated chest instead of a round cylinder.
    const fullness = 1 + 0.075 * Math.pow(Math.sin(Math.atan2(x, z) * 2), 2);
    const waistFold =
      0.012 * Math.exp(-Math.pow((y + 0.18 + x * 0.08) / 0.045, 2));
    positions.setXYZ(
      i,
      x * fullness,
      y,
      z * 0.78 * fullness - Math.sign(z) * waistFold,
    );
  }
  geometry.computeVertexNormals();
  return clothRecessColors(geometry, (p) => {
    const seatContact =
      (Math.max(0, -p.z) / 0.34) * Math.exp(-Math.pow((p.y + 0.19) / 0.18, 2));
    const underarm =
      Math.pow(Math.min(1, Math.abs(p.x) / 0.42), 4) *
      Math.exp(-Math.pow((p.y - 0.07) / 0.16, 2));
    return 1 - seatContact * 0.2 - underarm * 0.12;
  });
}

function addDriver(root: THREE.Group, materials: MaterialSet) {
  const driver = new THREE.Group();
  driver.name = "driver";
  root.add(driver);

  const hips = roundedBox(
    driver,
    materials.suit,
    "driver-hips",
    [0.72, 0.31, 0.59],
    [0, 1.025, -0.2],
    0.16,
  );
  hips.rotation.x = -0.08;

  const torso = addMesh(
    driver,
    torsoGeometry(),
    materials.suit,
    "driver-torso",
  );
  torso.position.set(0, 1.42, -0.21);
  torso.rotation.x = -0.13;

  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    addMesh(
      driver,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.25, 1.05, -0.12),
          new THREE.Vector3(side * 0.49, 1.02, 0.34),
          new THREE.Vector3(side * 0.57, 0.88, 0.7),
        ]),
        14,
        0.145,
        10,
        false,
      ),
      materials.suit,
      `driver-leg-${prefix}`,
    );
    const shoulder = new THREE.Vector3(side * 0.315, 1.6, -0.15);
    const elbow = new THREE.Vector3(side * 0.61, 1.29, 0.15);
    const hand = new THREE.Vector3(side * 0.366, 1.465, 0.522);
    const sleevePath = new THREE.CatmullRomCurve3([
      shoulder,
      new THREE.Vector3(side * 0.51, 1.47, -0.035),
      elbow,
      new THREE.Vector3(side * 0.54, 1.34, 0.36),
      hand,
    ]);
    const sleeveGeometry = new THREE.TubeGeometry(sleevePath, 24, 1, 12, false);
    const sleeveVertices = sleeveGeometry.getAttribute("position");
    // Broad shoulder cap, relaxed elbow, tapered wrist. Two shallow folds occur
    // only on the inside of the bent elbow, not as rings around a hose.
    const recess: number[] = [];
    for (let ring = 0; ring <= 24; ring++) {
      const t = ring / 24;
      const centre = sleevePath.getPointAt(t);
      const radius =
        t < 0.28
          ? THREE.MathUtils.lerp(0.205, 0.185, t / 0.28)
          : THREE.MathUtils.lerp(
              0.185,
              0.108,
              Math.pow((t - 0.28) / 0.72, 1.4),
            );
      for (let vertex = 0; vertex <= 12; vertex++) {
        const i = ring * 13 + vertex;
        const radial = new THREE.Vector3()
          .fromBufferAttribute(sleeveVertices, i)
          .sub(centre);
        const inside = THREE.MathUtils.smoothstep(radial.y, -0.15, 0.8);
        const creaseA = Math.exp(
          -Math.pow((t - 0.43 - radial.x * side * 0.055) / 0.04, 2),
        );
        const creaseB = Math.exp(
          -Math.pow((t - 0.59 + radial.z * 0.035) / 0.035, 2),
        );
        const cuff = Math.exp(-Math.pow((t - 0.91) / 0.025, 2));
        const compression =
          inside * (creaseA * 0.018 + creaseB * 0.013) + cuff * 0.006;
        const point = radial.multiplyScalar(radius - compression).add(centre);
        sleeveVertices.setXYZ(i, point.x, point.y, point.z);
        recess[i] =
          1 - inside * (creaseA * 0.16 + creaseB * 0.12) - cuff * 0.09;
      }
    }
    // Close the cloth under the overlapping chest/glove. This also prevents a
    // black triangular opening behind the helmet when viewed from the rear.
    const closedPositions = Array.from(sleeveVertices.array);
    const closedIndices = Array.from(sleeveGeometry.index!.array);
    for (const ring of [0, 24]) {
      const centre = sleevePath.getPointAt(ring / 24);
      const cap = closedPositions.length / 3;
      closedPositions.push(centre.x, centre.y, centre.z);
      recess[cap] = 1;
      for (let side = 0; side < 12; side++) {
        const a = ring * 13 + side;
        if (ring === 0) closedIndices.push(cap, a, a + 1);
        else closedIndices.push(cap, a + 1, a);
      }
    }
    sleeveGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(closedPositions, 3),
    );
    sleeveGeometry.deleteAttribute("normal");
    sleeveGeometry.deleteAttribute("uv");
    sleeveGeometry.setIndex(closedIndices);
    sleeveGeometry.computeVertexNormals();
    clothRecessColors(sleeveGeometry, (_p, i) => recess[i]);
    const sleeve = addMesh(
      driver,
      sleeveGeometry,
      materials.suit,
      `driver-sleeve-${prefix}`,
    );
    sleeve.userData.role = "continuous-bent-sleeve";
    const gloveGeometry = new THREE.SphereGeometry(0.155, 16, 10);
    const glovePoints = gloveGeometry.getAttribute("position");
    for (let i = 0; i < glovePoints.count; i++) {
      const x = glovePoints.getX(i),
        y = glovePoints.getY(i),
        z = glovePoints.getZ(i);
      // Soft knuckle pad with three restrained valleys across the curled fingers.
      const front = THREE.MathUtils.smoothstep(z, 0, 0.12);
      const grooves = [-0.062, -0.005, 0.05].reduce(
        (sum, fold) => sum + Math.exp(-Math.pow((y - fold) / 0.009, 2)),
        0,
      );
      glovePoints.setXYZ(
        i,
        x * 0.91,
        y * 0.94,
        z * 1.1 - front * grooves * 0.008,
      );
    }
    gloveGeometry.computeVertexNormals();
    clothRecessColors(
      gloveGeometry,
      (p) => 1 - (0.14 * Math.max(0, -p.z)) / 0.17,
    );
    const glove = addMesh(
      driver,
      gloveGeometry,
      materials.suit,
      `driver-glove-${prefix}`,
    );
    glove.position.copy(hand);
    glove.rotation.x = -0.64;
    const thumb = capsuleBetween(
      driver,
      materials.suit,
      `driver-glove-thumb-${prefix}`,
      hand.clone().add(new THREE.Vector3(-side * 0.075, 0.05, 0.09)),
      hand.clone().add(new THREE.Vector3(-side * 0.13, -0.045, 0.105)),
      0.067,
      8,
    );
    clothRecessColors(
      thumb.geometry,
      (p) => 0.94 + 0.06 * Math.max(0, p.z / 0.067),
    );
  }

  const neck = addMesh(
    driver,
    new THREE.CylinderGeometry(0.25, 0.28, 0.18, 12),
    materials.dark,
    "helmet-neck-ring",
  );
  neck.position.set(0, 1.78, -0.1);

  const helmetPaint = materials.paint.clone();
  helmetPaint.name = "kart-helmet-paint";
  helmetPaint.flatShading = false;
  helmetPaint.roughness = 0.3;
  helmetPaint.clearcoat = 0.32;
  helmetPaint.clearcoatRoughness = 0.32;
  const helmet = addMesh(driver, helmetGeometry(), helmetPaint, "helmet");
  helmet.position.set(0, 2.35, -0.1);

  const visorTrim = addMesh(
    driver,
    visorGeometry(true),
    materials.dark,
    "visor-trim",
  );
  visorTrim.position.copy(helmet.position);
  visorTrim.scale.copy(helmet.scale);

  const visor = addMesh(driver, visorGeometry(false), materials.visor, "visor");
  visor.position.copy(helmet.position);
  visor.scale.copy(helmet.scale);
  visor.receiveShadow = false;

  const helmetStripe = addMesh(
    driver,
    crownStripeGeometry(),
    materials.suit,
    "helmet-top-stripe",
  );
  helmetStripe.position.copy(helmet.position);
  for (const side of [-1, 1]) {
    const hinge = addMesh(
      driver,
      new THREE.CylinderGeometry(0.078, 0.078, 0.025, 12),
      materials.dark,
      `visor-hinge-${side}`,
    );
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(side * 0.629, 2.23, -0.12);
    const screw = addMesh(
      driver,
      new THREE.CylinderGeometry(0.024, 0.024, 0.028, 8),
      materials.silver,
      `visor-screw-${side}`,
    );
    screw.rotation.z = Math.PI / 2;
    screw.position
      .copy(hinge.position)
      .add(new THREE.Vector3(side * 0.015, 0, 0));
    const boot = roundedBox(
      driver,
      materials.dark,
      `driver-boot-${side}`,
      [0.25, 0.23, 0.4],
      [side * 0.57, 0.84, 0.78],
      0.09,
    );
    boot.rotation.x = -0.13;
  }
  // Retain the round helmet identity while reducing its mass above the cockpit.
  const head = new THREE.Group();
  head.name = "driver-helmet";
  head.position.set(0, 2.2, -0.1);
  head.scale.setScalar(0.95);
  const oldHeadCentre = new THREE.Vector3(0, 2.35, -0.1);
  for (const child of [...driver.children]) {
    if (
      child.name === "helmet" ||
      child.name.startsWith("visor") ||
      child.name === "helmet-top-stripe"
    ) {
      child.position.sub(oldHeadCentre);
      head.add(child);
    }
  }
  driver.add(head);
}

/**
 * Builds the low-poly kart model with local +Z as forward and tire bottoms at y=0.1.
 * The returned tree owns ordinary Three.js geometries and materials and can be
 * released by traversing meshes and disposing their geometry and material.
 */
export function createKartModel(color: string): THREE.Group {
  const root = new THREE.Group();
  root.name = "kart-model";
  root.userData = {
    assetVersion: "club-kart-reference-v3",
    units: "metres",
    up: "+Y",
    forward: "+Z",
  };

  const materials: MaterialSet = {
    paint: new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.36,
      metalness: 0.02,
      clearcoat: 0.36,
      clearcoatRoughness: 0.3,
      flatShading: false,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: "#18272e",
      roughness: 0.46,
      metalness: 0,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: "#1b2020",
      roughness: 0.84,
    }),
    silver: new THREE.MeshStandardMaterial({
      color: "#7d898a",
      roughness: 0.42,
      metalness: 0.82,
    }),
    suit: new THREE.MeshStandardMaterial({
      color: "#e9dfc7",
      roughness: 0.86,
      vertexColors: true,
    }),
    upholstery: new THREE.MeshStandardMaterial({
      color: "#253333",
      roughness: 0.66,
    }),
    visor: new THREE.MeshPhysicalMaterial({
      color: "#101b22",
      roughness: 0.23,
      metalness: 0,
      ior: 1.5,
      clearcoat: 0.6,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.2,
      flatShading: false,
    }),
  };
  for (const [key, material] of Object.entries(materials))
    material.name = `kart-${key}`;
  materials.paint.userData.kartTint = true;

  roundedBox(
    root,
    materials.dark,
    "chassis",
    [1.59, 0.19, 2.72],
    [0, 0.4, -0.04],
    0.075,
  );
  roundedBox(
    root,
    materials.paint,
    "left-side-pod",
    [0.37, 0.32, 1.6],
    [-0.79, 0.65, -0.08],
    0.09,
  );
  roundedBox(
    root,
    materials.paint,
    "right-side-pod",
    [0.37, 0.32, 1.6],
    [0.79, 0.65, -0.08],
    0.09,
  );
  const frontRubber = addMesh(
    root,
    bumperGeometry(2.18, 0.16, 0.56),
    materials.rubber,
    "front-bumper-rubber",
  );
  frontRubber.position.set(0, 0.37, 1.67);
  const frontBumper = addMesh(
    root,
    bumperGeometry(2.12, 0.25, 0.54),
    materials.paint,
    "front-bumper",
  );
  frontBumper.position.set(0, 0.565, 1.66);
  roundedBox(
    root,
    materials.dark,
    "rear-bumper-rubber",
    [1.8, 0.15, 0.3],
    [0, 0.42, -1.6],
    0.08,
  );
  roundedBox(
    root,
    materials.paint,
    "rear-bumper",
    [1.9, 0.23, 0.31],
    [0, 0.69, -1.52],
    0.065,
  );

  addSuspension(root, materials);
  addMesh(root, noseGeometry(), materials.paint, "nose-fairing");

  for (const [x, side] of [
    [-1.18, "left"],
    [1.18, "right"],
  ] as const) {
    addWheel(root, materials, x, 1.2, "front", side);
    addWheel(root, materials, x, -1.12, "rear", side);
  }

  for (const side of [-1, 1]) {
    roundedBox(
      root,
      materials.dark,
      `side-pod-insert-${side}`,
      [0.18, 0.1, 0.72],
      [side * 0.79, 0.805, -0.11],
      0.045,
    );
    roundedBox(
      root,
      materials.paint,
      `rear-body-shoulder-${side}`,
      [0.32, 0.26, 0.86],
      [side * 0.78, 0.72, -1.03],
      0.08,
    );
  }

  roundedBox(
    root,
    materials.paint,
    "rear-cockpit-deck",
    [1.48, 0.11, 0.41],
    [0, 0.71, -1.28],
    0.045,
  );
  const seatBack = roundedBox(
    root,
    materials.upholstery,
    "seat-back",
    [0.79, 0.63, 0.24],
    [0, 1.18, -0.53],
    0.1,
  );
  seatBack.rotation.x = 0.18;
  const seatShell = addMesh(
    root,
    seatShellGeometry(),
    materials.dark,
    "seat-rear-shell",
  );
  seatShell.position.set(0, 1.13, -0.67);
  seatShell.rotation.x = 0.22;
  roundedBox(
    root,
    materials.upholstery,
    "seat-base",
    [0.92, 0.3, 0.78],
    [0, 0.81, -0.31],
    0.13,
  );

  const steering = new THREE.Group();
  steering.name = "steering-wheel";
  steering.position.set(0, 1.36, 0.6);
  steering.rotation.x = -0.64;
  root.add(steering);
  addMesh(
    steering,
    new THREE.TorusGeometry(0.39, 0.052, 8, 24),
    materials.dark,
    "steering-rim",
  );
  cylinderBetween(
    steering,
    materials.dark,
    "steering-spoke-left",
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.38, 0.04, 0),
    0.025,
  );
  cylinderBetween(
    steering,
    materials.dark,
    "steering-spoke-right",
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.38, 0.04, 0),
    0.025,
  );
  cylinderBetween(
    root,
    materials.silver,
    "steering-column",
    new THREE.Vector3(0, 0.83, 0.22),
    new THREE.Vector3(0, 1.36, 0.57),
    0.045,
  );

  const engine = new THREE.Group();
  engine.name = "rear-engine";
  root.add(engine);
  roundedBox(
    engine,
    materials.dark,
    "engine-block",
    [0.42, 0.2, 0.48],
    [0.44, 0.69, -1.13],
    0.06,
  );
  for (const side of [-1, 1]) {
    cylinderBetween(
      root,
      materials.dark,
      `rear-bumper-support-${side}`,
      new THREE.Vector3(side * 0.69, 0.38, -1.64),
      new THREE.Vector3(side * 0.69, 0.69, -1.48),
      0.055,
    );
  }
  const exhaust = addMesh(
    engine,
    new THREE.CylinderGeometry(0.08, 0.1, 0.58, 12),
    materials.silver,
    "exhaust",
  );
  exhaust.position.set(-0.48, 0.5, -1.35);
  exhaust.rotation.x = Math.PI / 2;
  const outlet = addMesh(
    engine,
    new THREE.CircleGeometry(0.063, 12),
    materials.dark,
    "exhaust-outlet",
  );
  outlet.rotation.y = Math.PI;
  outlet.position.set(-0.48, 0.5, -1.641);
  addMesh(
    engine,
    new THREE.CylinderGeometry(0.07, 0.07, 0.48, 10),
    materials.dark,
    "rear-axle",
  ).rotation.z = Math.PI / 2;
  engine.getObjectByName("rear-axle")!.position.set(0, 0.58, -1.14);

  addDriver(root, materials);
  return root;
}
