import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { DynamicShadows } from "../src/graphics/DynamicShadows.js";
function fixture() {
  const light = new THREE.DirectionalLight(),
    renderer = { shadowMap: { enabled: true } };
  light.shadow.mapSize.set(512, 512);
  const rig = new DynamicShadows(light, renderer),
    camera = new THREE.PerspectiveCamera(65, 1.7, 0.2, 2000);
  camera.position.set(0, 20, 40);
  camera.lookAt(0, 0, 0);
  return { light, renderer, rig, camera };
}
test("shadows: current light projection, texel snapping, constant world sun direction", () => {
  const { light, rig, camera, renderer } = fixture(),
    look = new THREE.Vector3(12.123, 0, 31.123),
    car = new THREE.Group();
  car.position.copy(look);
  for (let i = 0; i < 100; i++) {
    look.x += 0.017;
    rig.update(camera, look, [car], null);
    assert.equal(renderer.shadowMap.autoUpdate, true);
    assert.equal(renderer.shadowMap.needsUpdate, true);
    const anchor = light.target.position;
    assert.ok(Math.abs(anchor.y) < 1e-10);
    for (const [axis, span] of [
      [rig.right, rig.spanX],
      [rig.up, rig.spanY],
    ]) {
      const v = anchor.dot(axis) / (span / 512);
      assert.ok(Math.abs(v - Math.round(v)) < 1e-8);
    }
    const dir = light.position.clone().sub(anchor).normalize();
    assert.ok(dir.distanceTo(rig.direction) < 1e-10);
    assert.ok(
      Math.abs(
        light.shadow.camera.projectionMatrix.elements[0] - 2 / rig.spanX,
      ) < 1e-10,
    );
  }
  assert.equal(rig.updates, 100);
});
test("shadows: visible remote vehicle expands coverage, no shrinking/texel pumping mid-session", () => {
  const { light, rig, camera } = fixture();
  camera.position.set(0, 250, 450);
  camera.lookAt(0, 0, -150);
  const c = new THREE.Group();
  c.position.set(230, 0, -200);
  rig.update(camera, new THREE.Vector3(), [c], null);
  assert.equal(rig.visibleVehicles, 1);
  const span = rig.spanX;
  assert.ok(Math.max(span, rig.spanY) > 128);
  for (const [axis, extent] of [
    [rig.right, rig.spanX],
    [rig.up, rig.spanY],
  ])
    assert.ok(
      Math.abs(c.position.clone().sub(light.target.position).dot(axis)) <
        extent / 2 - 4,
    );
  c.visible = false;
  rig.update(camera, new THREE.Vector3(), [c], null);
  assert.equal(rig.spanX, span);
  rig.reset();
  assert.equal(rig.spanX, 128);
});
test("shadows: explicit user off is preserved; quality does not throttle enabled shadows", () => {
  const { rig, renderer, camera } = fixture();
  renderer.shadowMap.enabled = false;
  rig.update(camera, new THREE.Vector3(), [], null);
  assert.equal(rig.updates, 0);
  renderer.shadowMap.enabled = true;
  rig.update(camera, new THREE.Vector3(), [], null);
  assert.equal(rig.updates, 1);
});
test("shadows: explicit ownership disposes existing map once and no render allocations", () => {
  const { rig, light, camera } = fixture();
  let n = 0;
  light.shadow.map = {
    dispose() {
      n++;
    },
  };
  const sphere = rig.sphere,
    centre = rig.centre,
    projection = rig.viewProjection;
  for (let i = 0; i < 20; i++)
    rig.update(camera, new THREE.Vector3(), [], null);
  assert.equal(rig.sphere, sphere);
  assert.equal(rig.centre, centre);
  assert.equal(rig.viewProjection, projection);
  rig.dispose();
  assert.equal(n, 1);
});
