import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

type MaterialSet = {
  paint: THREE.MeshPhysicalMaterial;
  dark: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  silver: THREE.MeshStandardMaterial;
  suit: THREE.MeshStandardMaterial;
  visor: THREE.MeshPhysicalMaterial;
};

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
) {
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
    new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius),
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

/** A faceted multi-section shell whose high rear edge falls toward the bumper. */
function noseGeometry() {
  const sections = [
    { z: 0.34, halfWidth: 0.54, bottom: 0.57, top: 1.43 },
    { z: 0.76, halfWidth: 0.55, bottom: 0.53, top: 1.31 },
    { z: 1.18, halfWidth: 0.49, bottom: 0.51, top: 1.09 },
    { z: 1.58, halfWidth: 0.39, bottom: 0.52, top: 0.76 },
  ];
  const positions: number[] = [];
  const indices: number[] = [];

  // Eight points form a beveled, flat-topped cross-section at each Z station.
  for (const { z, halfWidth: w, bottom, top } of sections) {
    const bevel = Math.min(0.17, (top - bottom) * 0.25);
    positions.push(
      -w * 0.73,
      top,
      z,
      w * 0.73,
      top,
      z,
      w,
      top - bevel,
      z,
      w,
      bottom + bevel,
      z,
      w * 0.72,
      bottom,
      z,
      -w * 0.72,
      bottom,
      z,
      -w,
      bottom + bevel,
      z,
      -w,
      top - bevel,
      z,
    );
  }
  for (let section = 0; section < sections.length - 1; section++) {
    const a = section * 8;
    const b = (section + 1) * 8;
    for (let side = 0; side < 8; side++) {
      const next = (side + 1) % 8;
      indices.push(a + side, b + side, b + next, a + side, b + next, a + next);
    }
  }
  for (const [offset, reverse] of [
    [0, true],
    [(sections.length - 1) * 8, false],
  ] as const) {
    for (let side = 1; side < 7; side++) {
      if (reverse) indices.push(offset, offset + side, offset + side + 1);
      else indices.push(offset, offset + side + 1, offset + side);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry.toNonIndexed();
}

/** Beveled horizontal bodywork: the front corners sweep back around the tires. */
function bumperGeometry(width: number, height: number, depth: number) {
  const w = width / 2;
  const d = depth / 2;
  const outline = new THREE.Shape();
  outline.moveTo(-w + 0.23, d);
  outline.quadraticCurveTo(0, d + 0.14, w - 0.23, d);
  outline.lineTo(w, d - 0.17);
  outline.lineTo(w, -d + 0.04);
  outline.lineTo(w - 0.16, -d);
  outline.lineTo(w - 0.36, -d + 0.13);
  outline.lineTo(-w + 0.36, -d + 0.13);
  outline.lineTo(-w + 0.16, -d);
  outline.lineTo(-w, -d + 0.04);
  outline.lineTo(-w, d - 0.17);
  outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: height - 0.11,
    bevelEnabled: true,
    bevelSize: 0.055,
    bevelThickness: 0.055,
    bevelSegments: 3,
    curveSegments: 10,
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
    const a = -0.3 + (i / 12) * 0.94;
    for (const x of [-0.075, 0.075]) {
      const r = Math.sqrt(0.648 ** 2 - x ** 2);
      vertices.push(x, Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.97);
    }
    if (i < 12) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
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
  const wheel = new THREE.Group();
  wheel.name = `wheel-${axle}-${side}`;
  wheel.position.set(x, 0.62, z);
  root.add(wheel);

  const tire = addMesh(
    wheel,
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.22, -0.2),
        new THREE.Vector2(0.33, -0.205),
        new THREE.Vector2(0.39, -0.201),
        new THREE.Vector2(0.438, -0.185),
        new THREE.Vector2(0.475, -0.157),
        new THREE.Vector2(0.5, -0.119),
        new THREE.Vector2(0.515, -0.072),
        new THREE.Vector2(0.52, 0),
        new THREE.Vector2(0.515, 0.072),
        new THREE.Vector2(0.5, 0.119),
        new THREE.Vector2(0.475, 0.157),
        new THREE.Vector2(0.438, 0.185),
        new THREE.Vector2(0.39, 0.201),
        new THREE.Vector2(0.33, 0.205),
        new THREE.Vector2(0.22, 0.2),
      ],
      40,
    ),
    materials.rubber,
    "tire",
  );
  tire.rotation.z = Math.PI / 2;

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
  rim.position.x = outward * 0.19;
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
    bead.position.x = face * 0.203;
  }
  const brake = addMesh(
    wheel,
    new THREE.CylinderGeometry(0.19, 0.19, 0.025, 24),
    materials.silver,
    "brake-disc",
  );
  brake.rotation.z = Math.PI / 2;
  brake.position.x = outward * 0.176;
  for (let spoke = 0; spoke < 5; spoke++) {
    const a = (spoke * Math.PI * 2) / 5;
    cylinderBetween(
      wheel,
      materials.silver,
      `rim-spoke-${spoke}`,
      new THREE.Vector3(
        outward * 0.215,
        Math.cos(a) * 0.07,
        Math.sin(a) * 0.07,
      ),
      new THREE.Vector3(
        outward * 0.203,
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
  axleNut.position.x = outward * 0.223;
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

function addDriver(root: THREE.Group, materials: MaterialSet) {
  const driver = new THREE.Group();
  driver.name = "driver";
  root.add(driver);

  const hips = roundedBox(
    driver,
    materials.suit,
    "driver-hips",
    [0.74, 0.38, 0.55],
    [0, 1.09, -0.22],
    0.16,
  );
  hips.rotation.x = -0.08;

  const torso = addMesh(
    driver,
    new THREE.CapsuleGeometry(0.38, 0.28, 8, 20),
    materials.suit,
    "driver-torso",
  );
  torso.position.set(0, 1.44, -0.25);
  torso.rotation.x = -0.1;
  torso.scale.set(1.08, 1, 0.9);

  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    capsuleBetween(
      driver,
      materials.suit,
      `driver-leg-${prefix}`,
      new THREE.Vector3(side * 0.25, 1.08, -0.09),
      new THREE.Vector3(side * 0.34, 0.84, 0.72),
      0.16,
    );
    const shoulder = new THREE.Vector3(side * 0.34, 1.66, -0.05);
    const elbow = new THREE.Vector3(side * 0.52, 1.35, 0.24);
    const hand = new THREE.Vector3(side * 0.38, 1.48, 0.6);
    capsuleBetween(
      driver,
      materials.suit,
      `driver-upper-arm-${prefix}`,
      shoulder,
      elbow,
      0.18,
      16,
    );
    capsuleBetween(
      driver,
      materials.suit,
      `driver-forearm-${prefix}`,
      elbow,
      hand,
      0.17,
      16,
    );
    const glove = addMesh(
      driver,
      new THREE.SphereGeometry(0.18, 20, 12),
      materials.suit,
      `driver-glove-${prefix}`,
    );
    glove.position.copy(hand);
    glove.scale.set(1.05, 0.9, 1.1);
    const shoulderPad = addMesh(
      driver,
      new THREE.SphereGeometry(0.205, 20, 12),
      materials.suit,
      `driver-shoulder-${prefix}`,
    );
    shoulderPad.position.copy(shoulder);
    shoulderPad.scale.set(1, 1.03, 0.96);
  }

  const neck = addMesh(
    driver,
    new THREE.CylinderGeometry(0.25, 0.28, 0.18, 12),
    materials.dark,
    "helmet-neck-ring",
  );
  neck.position.set(0, 1.88, -0.16);

  const helmetPaint = materials.paint.clone();
  helmetPaint.flatShading = false;
  helmetPaint.roughness = 0.34;
  helmetPaint.clearcoatRoughness = 0.25;
  const helmet = addMesh(
    driver,
    new THREE.SphereGeometry(0.64, 48, 32),
    helmetPaint,
    "helmet",
  );
  helmet.position.set(0, 2.35, -0.1);
  helmet.scale.set(1, 0.98, 0.97);

  const visorTrim = addMesh(
    driver,
    new THREE.SphereGeometry(
      0.647,
      32,
      10,
      Math.PI * 0.08,
      Math.PI * 0.84,
      Math.PI * 0.425,
      Math.PI * 0.25,
    ),
    materials.dark,
    "visor-trim",
  );
  visorTrim.position.copy(helmet.position);
  visorTrim.scale.copy(helmet.scale);

  const visor = addMesh(
    driver,
    new THREE.SphereGeometry(
      0.653,
      32,
      10,
      Math.PI * 0.105,
      Math.PI * 0.79,
      Math.PI * 0.445,
      Math.PI * 0.215,
    ),
    materials.visor,
    "visor",
  );
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
    hinge.position.set(side * 0.61, 2.31, 0.02);
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
      [0.29, 0.23, 0.43],
      [side * 0.34, 0.78, 0.74],
      0.09,
    );
    boot.rotation.x = -0.13;
    const cuff = capsuleBetween(
      driver,
      materials.suit,
      `driver-cuff-${side}`,
      new THREE.Vector3(side * 0.42, 1.435, 0.53),
      new THREE.Vector3(side * 0.38, 1.48, 0.6),
      0.176,
      16,
    );
    cuff.scale.multiplyScalar(1.015);
  }
}

/**
 * Builds the low-poly kart model with local +Z as forward and tire bottoms at y=0.1.
 * The returned tree owns ordinary Three.js geometries and materials and can be
 * released by traversing meshes and disposing their geometry and material.
 */
export function createKartModel(color: string): THREE.Group {
  const root = new THREE.Group();
  root.name = "kart-model";

  const materials: MaterialSet = {
    paint: new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.32,
      metalness: 0.08,
      clearcoat: 0.85,
      clearcoatRoughness: 0.18,
      flatShading: true,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: "#182022",
      roughness: 0.48,
      metalness: 0.18,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: "#111719",
      roughness: 0.92,
    }),
    silver: new THREE.MeshStandardMaterial({
      color: "#a7afa6",
      roughness: 0.4,
      metalness: 0.65,
    }),
    suit: new THREE.MeshStandardMaterial({ color: "#e7dec5", roughness: 0.83 }),
    visor: new THREE.MeshPhysicalMaterial({
      color: "#080f13",
      roughness: 0.17,
      metalness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.8,
      flatShading: false,
    }),
  };

  roundedBox(
    root,
    materials.dark,
    "chassis",
    [1.76, 0.28, 2.82],
    [0, 0.43, -0.04],
    0.12,
  );
  roundedBox(
    root,
    materials.paint,
    "left-side-pod",
    [0.34, 0.42, 1.72],
    [-0.77, 0.65, 0.05],
    0.15,
  );
  roundedBox(
    root,
    materials.paint,
    "right-side-pod",
    [0.34, 0.42, 1.72],
    [0.77, 0.65, 0.05],
    0.15,
  );
  const frontRubber = addMesh(
    root,
    bumperGeometry(2.3, 0.2, 0.7),
    materials.rubber,
    "front-bumper-rubber",
  );
  frontRubber.position.set(0, 0.4, 1.61);
  const frontBumper = addMesh(
    root,
    bumperGeometry(2.25, 0.35, 0.68),
    materials.paint,
    "front-bumper",
  );
  frontBumper.position.set(0, 0.635, 1.6);
  roundedBox(
    root,
    materials.dark,
    "rear-bumper-rubber",
    [1.96, 0.18, 0.37],
    [0, 0.42, -1.6],
    0.08,
  );
  roundedBox(
    root,
    materials.paint,
    "rear-bumper",
    [1.9, 0.33, 0.4],
    [0, 0.65, -1.53],
    0.13,
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
      [side * 0.79, 0.877, -0.11],
      0.045,
    );
    roundedBox(
      root,
      materials.paint,
      `rear-body-shoulder-${side}`,
      [0.33, 0.3, 0.9],
      [side * 0.73, 0.85, -1.08],
      0.12,
    );
  }

  roundedBox(
    root,
    materials.paint,
    "rear-cockpit-deck",
    [1.64, 0.2, 0.65],
    [0, 0.8, -1.19],
    0.09,
  );
  const seatBack = roundedBox(
    root,
    materials.dark,
    "seat-back",
    [1.02, 0.86, 0.36],
    [0, 1.22, -0.67],
    0.15,
  );
  seatBack.rotation.x = 0.18;
  const seatShell = roundedBox(
    root,
    materials.dark,
    "seat-rear-shell",
    [1.03, 0.7, 0.3],
    [0, 1.18, -0.91],
    0.09,
  );
  seatShell.rotation.x = 0.44;
  roundedBox(
    root,
    materials.dark,
    "seat-base",
    [0.92, 0.3, 0.78],
    [0, 0.81, -0.31],
    0.13,
  );

  const steering = new THREE.Group();
  steering.name = "steering-wheel";
  steering.position.set(0, 1.43, 0.63);
  steering.rotation.x = -0.48;
  root.add(steering);
  addMesh(
    steering,
    new THREE.TorusGeometry(0.43, 0.055, 8, 20),
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
    [0.64, 0.27, 0.55],
    [0.34, 0.57, -1.25],
    0.08,
  );
  for (let index = 0; index < 5; index++)
    roundedBox(
      engine,
      materials.dark,
      `engine-fin-${index + 1}`,
      [0.67, 0.02, 0.58],
      [0.34, 0.47 + index * 0.045, -1.25],
      0.008,
    );
  const exhaust = addMesh(
    engine,
    new THREE.CylinderGeometry(0.08, 0.1, 0.58, 12),
    materials.dark,
    "exhaust",
  );
  exhaust.position.set(-0.48, 0.5, -1.35);
  exhaust.rotation.x = Math.PI / 2;
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
