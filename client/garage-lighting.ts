import * as THREE from "three";

/** Inspection fill lights only; disabled outside the one-kart garage preview. */
export class GarageLighting {
  readonly group = new THREE.Group();
  private contact: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private lastGroundPose = "";
  constructor(
    private readonly groundHeight?: (x: number, z: number) => number,
  ) {
    this.group.name = "garage-inspection-lighting";
    this.group.userData.dynamic = true;
    this.group.visible = false;
    const ambient = new THREE.HemisphereLight("#fff2dd", "#657079", 1.0);
    const key = new THREE.DirectionalLight("#fff2df", 3.0);
    key.position.set(4, 7, 6);
    const fill = new THREE.DirectionalLight("#e1edff", 1.4);
    fill.position.set(-5, 4, -3);
    for (const light of [key, fill]) {
      light.castShadow = false;
      light.target.position.set(0, 1, 0);
      this.group.add(light, light.target);
    }
    this.group.add(ambient);
    // A small soft contact patch keeps tires grounded even in low shadow quality.
    // One small surface grid, no texture, render target or extra shadow pass.
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(3.9, 4.9, 6, 8).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        vertexShader:
          "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
        fragmentShader:
          "varying vec2 vUv; void main(){vec2 p=(vUv-0.5)*2.0;float d=length(p);float a=(1.0-smoothstep(0.35,1.0,d))*0.36;gl_FragColor=vec4(0.02,0.035,0.025,a);}",
      }),
    );
    contact.name = "garage-contact-shadow";
    this.contact = contact;
    contact.position.y = 0.08;
    this.group.add(contact);
  }
  update(active: boolean, kart?: THREE.Object3D) {
    this.group.visible = active && !!kart;
    if (!this.group.visible || !kart) return;
    this.group.position.copy(kart.position);
    this.group.rotation.y = kart.rotation.y;
    const pose = `${kart.position.x}/${kart.position.y}/${kart.position.z}/${kart.rotation.y}`;
    if (this.groundHeight && pose !== this.lastGroundPose) {
      const positions = this.contact.geometry.getAttribute("position");
      const sin = Math.sin(kart.rotation.y),
        cos = Math.cos(kart.rotation.y);
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          z = positions.getZ(i);
        positions.setY(
          i,
          this.groundHeight(
            kart.position.x + x * cos + z * sin,
            kart.position.z - x * sin + z * cos,
          ) - kart.position.y,
        );
      }
      positions.needsUpdate = true;
      this.contact.geometry.computeBoundingSphere();
      this.lastGroundPose = pose;
    }
  }
}
