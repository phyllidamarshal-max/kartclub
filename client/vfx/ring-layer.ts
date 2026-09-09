import * as THREE from "three";

/** One draw for ground rings. Call begin/add/end once per visual frame. */
export class RingLayer {
  readonly mesh: THREE.InstancedMesh<THREE.RingGeometry, THREE.ShaderMaterial>;
  private scratch = new THREE.Object3D();
  private color = new THREE.Color();
  private disposed = false;
  private limit: number;
  constructor(readonly capacity: number) {
    this.limit = capacity;
    const geometry = new THREE.RingGeometry(0.92, 1, 48);
    geometry.setAttribute(
      "vfxAlpha",
      new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
    );
    geometry.setAttribute(
      "vfxDash",
      new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
    );
    this.mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: `attribute float vfxAlpha; attribute float vfxDash; varying float a; varying float dash; varying vec2 uvp; varying vec3 tint;
        void main(){a=vfxAlpha;dash=vfxDash;uvp=uv;tint=instanceColor;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
        fragmentShader: `varying float a;varying float dash;varying vec2 uvp;varying vec3 tint;
        void main(){float angle=atan(uvp.y-.5,uvp.x-.5);float mask=mix(1.,step(.35,fract(angle*2.55)),dash);gl_FragColor=vec4(tint,a*mask);
        #include <colorspace_fragment>
        }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        toneMapped: false,
      }),
      capacity,
    );
    this.mesh.setColorAt(0, this.color.setHex(0xffffff));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  begin(limit = this.capacity) {
    this.limit = Math.min(limit, this.capacity);
    this.mesh.count = 0;
  }
  add(
    x: number,
    y: number,
    z: number,
    radius: number,
    color: number,
    alpha = 0.6,
    dashed = false,
  ) {
    const i = this.mesh.count;
    if (i >= this.limit || radius <= 0) return;
    this.scratch.position.set(x, y, z);
    this.scratch.rotation.set(-Math.PI / 2, 0, 0);
    this.scratch.scale.setScalar(radius);
    this.scratch.updateMatrix();
    this.mesh.setMatrixAt(i, this.scratch.matrix);
    this.mesh.setColorAt(i, this.color.setHex(color));
    this.mesh.geometry.getAttribute("vfxAlpha").setX(i, alpha);
    this.mesh.geometry.getAttribute("vfxDash").setX(i, dashed ? 1 : 0);
    this.mesh.count++;
  }
  end() {
    this.mesh.visible = this.mesh.count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.mesh.geometry.getAttribute("vfxAlpha").needsUpdate = true;
    this.mesh.geometry.getAttribute("vfxDash").needsUpdate = true;
  }
  clear() {
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
