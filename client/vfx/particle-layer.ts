import * as THREE from "three";
import { ParticlePool } from "./driving-state.ts";
const scratchColor = new THREE.Color();
export function createParticleMesh(pool: ParticlePool, glow: boolean) {
  const geo = new THREE.BufferGeometry();
  for (const [name, size] of [
    ["position", 3],
    ["tint", 3],
    ["radius", 1],
    ["fade", 1],
  ] as const)
    geo.setAttribute(
      name,
      new THREE.BufferAttribute(
        new Float32Array(pool.capacity * size),
        size,
      ).setUsage(THREE.DynamicDrawUsage),
    );
  const material = new THREE.ShaderMaterial({
    uniforms: { pixelHeight: { value: 900 } },
    vertexShader: `attribute vec3 tint; attribute float radius; attribute float fade;
      varying vec3 vTint; varying float vFade; uniform float pixelHeight;
      void main(){ vec4 p=modelViewMatrix*vec4(position,1.); vTint=tint; vFade=fade;
        gl_Position=projectionMatrix*p;
        gl_PointSize=clamp(radius*pixelHeight*projectionMatrix[1][1]/max(1.,-p.z),1.,110.); }`,
    fragmentShader: `varying vec3 vTint; varying float vFade;
      void main(){float r=length(gl_PointCoord-.5)*2.; float a=(1.-smoothstep(.12,1.,r))*vFade;
        if(a<.008)discard; gl_FragColor=vec4(vTint,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Points(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = glow ? 3 : 2;
  mesh.visible = false;
  return mesh;
}

export function uploadParticles(
  pool: ParticlePool,
  mesh: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>,
  glow: boolean,
) {
  const position = mesh.geometry.getAttribute("position"),
    tint = mesh.geometry.getAttribute("tint"),
    radius = mesh.geometry.getAttribute("radius"),
    fade = mesh.geometry.getAttribute("fade");
  let n = 0;
  for (let i = 0; i < pool.limit; i++)
    if (pool.life[i] > 0) {
      const age = pool.age[i] / pool.life[i];
      position.setXYZ(n, pool.x[i], pool.y[i], pool.z[i]);
      scratchColor.setHex(pool.color[i]);
      tint.setXYZ(n, scratchColor.r, scratchColor.g, scratchColor.b);
      radius.setX(n, pool.size[i] * (glow ? 1 : 1 + age * 1.8));
      fade.setX(n, (1 - age) * (glow ? 0.9 : 0.24));
      n++;
    }
  position.needsUpdate =
    tint.needsUpdate =
    radius.needsUpdate =
    fade.needsUpdate =
      true;
  mesh.geometry.setDrawRange(0, n);
  mesh.visible = n > 0;
}

export class ParticleLayer {
  readonly pool: ParticlePool;
  readonly mesh: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private disposed = false;
  constructor(
    capacity: number,
    readonly glow = true,
  ) {
    this.pool = new ParticlePool(capacity);
    this.mesh = createParticleMesh(this.pool, glow);
  }
  upload(pixelHeight = 900) {
    this.mesh.material.uniforms.pixelHeight.value = pixelHeight;
    uploadParticles(this.pool, this.mesh, this.glow);
  }
  clear() {
    this.pool.clear();
    this.mesh.visible = false;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.clear();
  }
}
