import * as THREE from "three";
import { trackPoint, trackWidth, type Track } from "../shared/track.ts";

/** Decorative shore profile shared by the meadow edge, cliff rocks and surf. */
export function coastalShoreMargin(t: number,track?:Track) {
  if(track?.id==='reference-coast-v1')return 8+43*Math.exp(-Math.pow((t-.677)/.057,2))+8*Math.exp(-Math.pow((t-.539)/.012,2));
  return 8 + 4 * Math.exp(-Math.pow((t - 0.23) / 0.07, 2));
}

/** One soft, texture-free contact layer for coast props. */
export function addCoastalContactShadows(scene: THREE.Scene) {
  scene.updateMatrixWorld(true);
  const positions: number[] = [],
    colors: number[] = [],
    ink = new THREE.Color("#273a31"),
    y = -0.174;
  const vertex = (point: THREE.Vector3, alpha: number) => {
    positions.push(point.x, y, point.z);
    colors.push(ink.r, ink.g, ink.b, Math.min(0.25, alpha));
  };
  const ellipse = (
    object: THREE.Object3D,
    rx: number,
    rz: number,
    alpha: number,
  ) => {
    const center = object.localToWorld(new THREE.Vector3(0, 0, 0));
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      ring.push(
        object.localToWorld(
          new THREE.Vector3(Math.cos(angle) * rx, 0, Math.sin(angle) * rz),
        ),
      );
    }
    for (let i = 0; i < ring.length; i++) {
      vertex(center, alpha);
      vertex(ring[i], 0);
      vertex(ring[(i + 1) % ring.length], 0);
    }
  };
  const baseBand = (object: THREE.Object3D) => {
    const corners = (x: number, z: number) =>
      object.localToWorld(new THREE.Vector3(x, 0, z));
    const inner = [
        corners(-3.02, -2.82),
        corners(3.02, -2.82),
        corners(3.02, 2.82),
        corners(-3.02, 2.82),
      ],
      outer = [
        corners(-3.5, -3.28),
        corners(3.5, -3.28),
        corners(3.5, 3.28),
        corners(-3.5, 3.28),
      ];
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      vertex(inner[side], 0.2);
      vertex(outer[side], 0);
      vertex(inner[next], 0.2);
      vertex(inner[next], 0.2);
      vertex(outer[side], 0);
      vertex(outer[next], 0);
    }
  };
  for (const object of scene.children) {
    if (
      object.name === "landscape-branching-tree" ||
      object.name === "coast-blossom-tree"
    )
      ellipse(object, 1.05, 0.72, 0.18);
    else if (object.name === "coast-slate-cottage") baseBand(object);
    else if (object.name === "coast-white-lighthouse")
      ellipse(object, 3.5, 3.1, 0.22);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  const shadows = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    }),
  );
  shadows.name = "coast-contact-shadows";
  shadows.castShadow = shadows.receiveShadow = false;
  shadows.userData.dynamic = true;
  scene.add(shadows);
}

/** Modelled meadow: stems, folded leaves and cupped petals, one shared draw. */
export function addCoastalMeadow(
  scene: THREE.Scene,
  track: Track,
  random: () => number,
  clear: (x: number, z: number, radius: number) => boolean,
) {
  const positions: number[] = [],
    colors: number[] = [];
  const green = new THREE.Color("#5b7735"),
    lightGreen = new THREE.Color("#84984b"),
    white = new THREE.Color("#fff3cd"),
    yellow = new THREE.Color("#efc245"),
    center = new THREE.Color("#c58d2b");
  type V = [number, number, number];
  const triangle = (a: V, b: V, c: V, color: THREE.Color) => {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  };
  for (let patch = 0; patch < 1900; patch++) {
    const t = patch % 3 === 0 ? 0.17 + random() * 0.15 : random(),
      p = trackPoint(t, track),
      side = patch % 2 ? 1 : -1;
    if (side < 0 && t > 0.115 && t < 0.425) continue;
    // Clustered beds and quiet stretches feel planted by weather, not a grid.
    const abundance = 0.5 + 0.5 * Math.sin(t * 79 + Math.sin(t * 21) * 3);
    if (random() > 0.35 + abundance * 0.62) continue;
    const offset =
      side *
      (trackWidth(t, track) / 2 + 1.6 + random() * (2.1 + abundance * 2.4));
    const px = p.x + Math.cos(p.heading) * offset;
    const pz = p.z - Math.sin(p.heading) * offset;
    if (!clear(px, pz, 1.25)) continue;
    for (let f = 0; f < 2 + Math.floor(abundance * 4); f++) {
      const angle = random() * Math.PI * 2,
        spread = random() * 0.65;
      const x = px + Math.sin(angle) * spread,
        z = pz + Math.cos(angle) * spread;
      const y = -0.15,
        height = 0.3 + random() * 0.45,
        top = y + height;
      const leanX = (random() - 0.5) * 0.12,
        leanZ = (random() - 0.5) * 0.12;
      const tip: V = [x + leanX, top, z + leanZ];
      triangle([x - 0.018, y, z], [x + 0.018, y, z], tip, green);
      triangle([x, y, z - 0.018], [x, y, z + 0.018], tip, green);
      for (const side of [-1, 1]) {
        const a = angle + side * 1.2,
          dx = Math.cos(a) * 0.17,
          dz = Math.sin(a) * 0.17;
        const base: V = [x, y + height * 0.34, z];
        const end: V = [x + dx, y + height * 0.67, z + dz];
        const fold: V = [x + dx * 0.43, y + height * 0.48, z + dz * 0.43];
        triangle(
          base,
          [fold[0] - dz * 0.23, fold[1] - 0.015, fold[2] + dx * 0.23],
          end,
          green,
        );
        triangle(
          base,
          end,
          [fold[0] + dz * 0.23, fold[1] + 0.015, fold[2] - dx * 0.23],
          lightGreen,
        );
      }
      const radius = 0.13 + random() * 0.09,
        petal = patch % 4 ? white : yellow;
      for (let j = 0; j < 5; j++) {
        const a = angle + (j * Math.PI * 2) / 5;
        const left: V = [
          tip[0] + Math.cos(a - 0.3) * radius,
          top + 0.025,
          tip[2] + Math.sin(a - 0.3) * radius,
        ];
        const right: V = [
          tip[0] + Math.cos(a + 0.3) * radius,
          top + 0.025,
          tip[2] + Math.sin(a + 0.3) * radius,
        ];
        const end: V = [
          tip[0] + Math.cos(a) * radius * 1.25,
          top + 0.018,
          tip[2] + Math.sin(a) * radius * 1.25,
        ];
        triangle(tip, left, end, petal);
        triangle(tip, end, right, petal);
        const a2 = a + (Math.PI * 2) / 5;
        triangle(
          [tip[0], top + 0.038, tip[2]],
          [
            tip[0] + Math.cos(a) * 0.043,
            top + 0.027,
            tip[2] + Math.sin(a) * 0.043,
          ],
          [
            tip[0] + Math.cos(a2) * 0.043,
            top + 0.027,
            tip[2] + Math.sin(a2) * 0.043,
          ],
          center,
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const flowers = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
    }),
  );
  flowers.name = "coast-wildflower-meadow";
  flowers.receiveShadow = true;
  scene.add(flowers);

  const coastalStone = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
  });
  const addQuad = (
    output: number[],
    tint: number[],
    a: V,
    b: V,
    c: V,
    d: V,
    color: THREE.Color,
  ) => {
    output.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) tint.push(color.r, color.g, color.b);
  };
  const meshFrom = (name: string, output: number[], tint: number[]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(output, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(tint, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, coastalStone);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  };

  // Warm irregular paving visually connects the houses into a village lane.
  const cobbles: number[] = [],
    cobbleColors: number[] = [],
    cobblePalette = ["#c8b18d", "#dbc6a1", "#ad9879"].map(
      (color) => new THREE.Color(color),
    );
  for (let i = 0; i < 74; i++) {
    const t = 0.175 + (i / 73) * 0.145,
      p = trackPoint(t, track),
      offset = -(trackWidth(t, track) / 2 + 5.4 + (i % 3) * 0.62),
      x = p.x + Math.cos(p.heading) * offset,
      z = p.z - Math.sin(p.heading) * offset;
    if (!clear(x, z, 0.52)) continue;
    const alongX = Math.sin(p.heading) * 0.52,
      alongZ = Math.cos(p.heading) * 0.52,
      sideX = Math.cos(p.heading) * 0.44,
      sideZ = -Math.sin(p.heading) * 0.44,
      y = -0.155 + (i % 2) * 0.008;
    addQuad(
      cobbles,
      cobbleColors,
      [x - alongX - sideX, y, z - alongZ - sideZ],
      [x + alongX - sideX, y, z + alongZ - sideZ],
      [x + alongX + sideX, y, z + alongZ + sideZ],
      [x - alongX + sideX, y, z - alongZ + sideZ],
      cobblePalette[i % cobblePalette.length],
    );
  }
  meshFrom("coast-village-cobbles", cobbles, cobbleColors);

  // A low, broken stone wall gives the verge the layered silhouette in the reference.
  const wall: number[] = [],
    wallColors: number[] = [],
    wallPalette = ["#94856b", "#b2a084", "#7e7865"].map(
      (color) => new THREE.Color(color),
    );
  for (let i = 0; i < 46; i++) {
    if (i % 11 === 7 || i % 13 === 4) continue;
    const t = 0.155 + (i / 45) * 0.205,
      p = trackPoint(t, track),
      offset = -(trackWidth(t, track) / 2 + 4.7),
      x = p.x + Math.cos(p.heading) * offset,
      z = p.z - Math.sin(p.heading) * offset;
    if (!clear(x, z, 0.56)) continue;
    const ax = Math.sin(p.heading) * 0.58,
      az = Math.cos(p.heading) * 0.58,
      sx = Math.cos(p.heading) * 0.27,
      sz = -Math.sin(p.heading) * 0.27,
      y = -0.14,
      h = 0.48 + (i % 3) * 0.11;
    const lower: V[] = [
      [x - ax - sx, y, z - az - sz],
      [x + ax - sx, y, z + az - sz],
      [x + ax + sx, y, z + az + sz],
      [x - ax + sx, y, z - az + sz],
    ];
    const upper = lower.map(([px, , pz]) => [px, y + h, pz] as V);
    const color = wallPalette[i % wallPalette.length];
    addQuad(wall, wallColors, upper[0], upper[1], upper[2], upper[3], color);
    for (let face = 0; face < 4; face++)
      addQuad(
        wall,
        wallColors,
        lower[face],
        lower[(face + 1) % 4],
        upper[(face + 1) % 4],
        upper[face],
        color,
      );
  }
  meshFrom("coast-verge-stone-wall", wall, wallColors);

  // Broken translucent ribbons sit at the cliff foot and read as moving surf
  // against the animated water without creating one mesh per crest.
  const foamPositions: number[] = [],
    foamUVs: number[] = [],
    foamColors: number[] = [],
    foamColor = new THREE.Color("#d8f4df");
  for (let i = 0; i < 96; i++) {
    if (i % 9 === 5) continue;
    const t0 = i / 96,
      t1 = (i + 0.74) / 96,
      p0 = trackPoint(t0, track),
      p1 = trackPoint(t1, track),
      d0 = trackWidth(t0, track) / 2 + coastalShoreMargin(t0) + 3,
      d1 = trackWidth(t1, track) / 2 + coastalShoreMargin(t1) + 3,
      inner0: V = [
        p0.x + Math.cos(p0.heading) * d0,
        -7.02,
        p0.z - Math.sin(p0.heading) * d0,
      ],
      inner1: V = [
        p1.x + Math.cos(p1.heading) * d1,
        -7.02,
        p1.z - Math.sin(p1.heading) * d1,
      ],
      outer1: V = [
        p1.x + Math.cos(p1.heading) * (d1 + 2.4),
        -7.01,
        p1.z - Math.sin(p1.heading) * (d1 + 2.4),
      ],
      outer0: V = [
        p0.x + Math.cos(p0.heading) * (d0 + 1.3),
        -7.01,
        p0.z - Math.sin(p0.heading) * (d0 + 1.3),
      ];
    addQuad(
      foamPositions,
      foamColors,
      inner0,
      inner1,
      outer1,
      outer0,
      foamColor,
    );
    foamUVs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const foamGeometry = new THREE.BufferGeometry();
  foamGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(foamPositions, 3),
  );
  foamGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(foamUVs, 2));
  const foamMaterial = new THREE.ShaderMaterial({
    uniforms: { clock: { value: 0 }, tint: { value: foamColor } },
    vertexShader: `varying vec2 foamUV; varying vec2 foamWorld;
      void main(){foamUV=uv;vec4 world=modelMatrix*vec4(position,1.);foamWorld=world.xz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float clock; uniform vec3 tint; varying vec2 foamUV; varying vec2 foamWorld;
      float foamHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float foamNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(foamHash(i),foamHash(i+vec2(1,0)),f.x),mix(foamHash(i+vec2(0,1)),foamHash(i+1.),f.x),f.y);}
      void main(){
        float broad=foamNoise(foamWorld*.57+vec2(clock*.04,-clock*.07));
        float grain=foamNoise(foamWorld*3.2-vec2(clock*.09,0.));
        float edge=smoothstep(0.,.16,foamUV.x)*(1.-smoothstep(.78,1.,foamUV.x));
        edge*=smoothstep(0.,.12,foamUV.y)*(1.-smoothstep(.42+.25*broad,1.,foamUV.y));
        float crest=1.-smoothstep(.045,.23,abs(foamUV.y-(.25+.12*sin(clock*.6+broad*5.))));
        float alpha=edge*mix(.12,.58,crest)*smoothstep(.27,.67,broad*.55+grain*.45);
        gl_FragColor=vec4(tint,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const foam = new THREE.Mesh(foamGeometry, foamMaterial);
  foam.name = "coast-shore-foam";
  foam.userData.dynamic = true;
  foam.onBeforeRender = () => {
    foamMaterial.uniforms.clock.value = performance.now() / 1000;
  };
  foam.renderOrder = 1;
  scene.add(foam);
}
