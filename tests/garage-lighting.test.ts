import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GarageLighting } from "../client/garage-lighting.ts";
test("inspection lights follow the garage model and switch off entirely for driving", () => {
  const lighting = new GarageLighting();
  const kart = new THREE.Group();
  kart.position.set(32, 4, -71);
  kart.rotation.y = 0.78;
  assert.equal(lighting.group.visible, false);
  lighting.update(true, kart);
  assert.equal(lighting.group.visible, true);
  assert.deepEqual(lighting.group.position.toArray(), kart.position.toArray());
  assert.equal(lighting.group.rotation.y, kart.rotation.y);
  const nodes = lighting.group.children.slice();
  const contact = lighting.group.getObjectByName("garage-contact-shadow");
  assert.ok(contact instanceof THREE.Mesh);
  assert.equal((contact.material as THREE.Material).depthWrite, false);
  assert.equal(contact.castShadow, false);
  for (let i = 0; i < 120; i++) lighting.update(true, kart);
  assert.deepEqual(lighting.group.children, nodes);
  for (const node of nodes)
    if (node instanceof THREE.DirectionalLight)
      assert.equal(node.castShadow, false);
  lighting.update(false, kart);
  assert.equal(lighting.group.visible, false);
  lighting.update(true);
  assert.equal(lighting.group.visible, false);
});
