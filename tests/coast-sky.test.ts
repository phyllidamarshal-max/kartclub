import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCoastSky } from '../client/coast-sky.ts';

test('coast sky uses the same fixed light direction for view and reflection scenes', () => {
  const scene = new THREE.Scene(), environment = new THREE.Scene();
  const sky = createCoastSky(scene), reflection = createCoastSky(environment);
  const material = sky.material as THREE.ShaderMaterial;
  const other = reflection.material as THREE.ShaderMaterial;
  assert.ok(material.uniforms.sunDirection.value.distanceTo(new THREE.Vector3(52,54,-33).normalize()) < 1e-10);
  assert.deepEqual(material.uniforms.sunDirection.value, other.uniforms.sunDirection.value);
  assert.equal(material.fragmentShader, other.fragmentShader);
  assert.equal(scene.children.length, 1);
  assert.equal(scene.children[0], sky);
  assert.equal(environment.children.length, 1);
});

test('static skydome follows the camera without depth occlusion or time updates', () => {
  const sky = createCoastSky(new THREE.Scene());
  const material = sky.material as THREE.ShaderMaterial;
  assert.equal(material.side, THREE.BackSide);
  assert.equal(material.depthWrite, false);
  assert.equal(sky.frustumCulled, false);
  assert.equal(sky.userData.dynamic, true);
  assert.ok(!('clock' in material.uniforms) && !('time' in material.uniforms));
  assert.ok(sky.geometry.boundingSphere === null || sky.geometry.boundingSphere.radius >= 2000);
  assert.equal(sky.children.length, 0);
  assert.equal(sky.castShadow, false);
  assert.equal(sky.receiveShadow, false);
});
