import * as THREE from "three";
import { updateCoastAssets } from "./coast-assets.ts";

/** Run a synchronous scene capture without leaking its visibility/LOD changes. */
export function withStaticReflectionScene<T>(
  scene: THREE.Scene,
  position: THREE.Vector3,
  excluded: Iterable<THREE.Object3D>,
  capture: () => T,
): T {
  const states: Array<[THREE.Object3D, boolean, boolean]> = [];
  const background = scene.background;
  scene.traverse((object) =>
    states.push([object, object.visible, object.castShadow]),
  );
  try {
    const assets = scene.getObjectByName("coast-authored-assets");
    if (assets instanceof THREE.Group)
      updateCoastAssets(assets, position, false);
    for (const object of excluded) object.visible = false;
    scene.updateMatrixWorld(true);
    return capture();
  } finally {
    scene.background = background;
    for (const [object, visible, castShadow] of states) {
      object.visible = visible;
      object.castShadow = castShadow;
    }
  }
}

/** Own one captured texture shared by kart visors; never performs frame updates. */
export class CoastReflectionProbe {
  private readonly bindings = new Map<
    THREE.MeshStandardMaterial,
    {
      envMap: THREE.Texture | null;
      intensity: number;
    }
  >();
  private disposed = false;

  constructor(private readonly target: THREE.WebGLRenderTarget) {}

  applyToKart(root: THREE.Object3D, intensity = 2.4): void {
    if (this.disposed) throw new Error("Coast reflection probe is disposed");
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (
          !(material instanceof THREE.MeshStandardMaterial) ||
          material.name !== "kart-visor"
        )
          continue;
        if (!this.bindings.has(material))
          this.bindings.set(material, {
            envMap: material.envMap,
            intensity: material.envMapIntensity,
          });
        material.envMap = this.target.texture;
        material.envMapIntensity = intensity;
        material.needsUpdate = true;
      }
    });
  }

  /** Call before disposing an individual kart's materials/textures. */
  releaseKart(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const original = this.bindings.get(material);
        if (!original) continue;
        if (material.envMap === this.target.texture) {
          material.envMap = original.envMap;
          material.envMapIntensity = original.intensity;
          material.needsUpdate = true;
        }
        this.bindings.delete(material);
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const [material, original] of this.bindings) {
      // Do not clobber a newer reflection installed by another owner.
      if (material.envMap !== this.target.texture) continue;
      material.envMap = original.envMap;
      material.envMapIntensity = original.intensity;
      material.needsUpdate = true;
    }
    this.bindings.clear();
    this.target.dispose();
  }
}

/**
 * Capture once after static coast assets are ready, outside World.render().
 * Keep World's sky/ground environment: replacing it globally darkens the scene.
 * Explicitly exclude cars, item roots and event-VFX groups supplied by World.
 */
export function captureCoastReflection(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  options: {
    position: THREE.Vector3;
    excluded: Iterable<THREE.Object3D>;
    size?: 128 | 256;
  },
): CoastReflectionProbe {
  const saved = {
    target: renderer.getRenderTarget(),
    face: renderer.getActiveCubeFace(),
    level: renderer.getActiveMipmapLevel(),
    viewport: renderer.getViewport(new THREE.Vector4()),
    scissor: renderer.getScissor(new THREE.Vector4()),
    scissorTest: renderer.getScissorTest(),
    clearColor: renderer.getClearColor(new THREE.Color()),
    clearAlpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
    toneMapping: renderer.toneMapping,
    xrEnabled: renderer.xr.enabled,
  };
  const cube = new THREE.WebGLCubeRenderTarget(options.size ?? 128, {
    type: THREE.HalfFloatType,
    colorSpace: THREE.LinearSRGBColorSpace,
    generateMipmaps: false,
  });
  cube.texture.name = "coast-reflection-capture";
  // fromScene cannot accept an owned output. In Three r185, fromCubemap with
  // a supplied target also requires the generator's LOD state to exist first.
  // Initialize through its public API with GPU submission disabled: allocation
  // here is CPU-only, and the output is owned before any real render can fail.
  let initializing = true;
  const pmremRenderer = new Proxy(renderer, {
    get(target, key, receiver) {
      if (key === "render")
        return initializing ? () => {} : renderer.render.bind(renderer);
      if (key === "setRenderTarget")
        return initializing
          ? () => {}
          : renderer.setRenderTarget.bind(renderer);
      return Reflect.get(target, key, receiver);
    },
  });
  const pmrem = new THREE.PMREMGenerator(pmremRenderer);
  let output: THREE.WebGLRenderTarget | undefined;
  try {
    try {
      output = pmrem.fromCubemap(cube.texture);
      output.texture.name = "coast-reflection-filtered";
      initializing = false;
      const camera = new THREE.CubeCamera(0.15, 1800, cube);
      camera.position.copy(options.position);
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = true;
      withStaticReflectionScene(scene, options.position, options.excluded, () =>
        camera.update(renderer, scene),
      );
      pmrem.fromCubemap(cube.texture, output);
    } finally {
      try {
        pmrem.dispose();
      } finally {
        cube.dispose();
        renderer.setRenderTarget(saved.target, saved.face, saved.level);
        renderer.setViewport(saved.viewport);
        renderer.setScissor(saved.scissor);
        renderer.setScissorTest(saved.scissorTest);
        renderer.setClearColor(saved.clearColor, saved.clearAlpha);
        renderer.autoClear = saved.autoClear;
        renderer.toneMapping = saved.toneMapping;
        renderer.xr.enabled = saved.xrEnabled;
        // The capture refreshed the static shadow map with cars hidden.
        renderer.shadowMap.needsUpdate = true;
      }
    }
    return new CoastReflectionProbe(output);
  } catch (error) {
    output?.dispose();
    throw error;
  }
}
