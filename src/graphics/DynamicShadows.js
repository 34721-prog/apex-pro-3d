import * as THREE from "three";

// One real directional map. Never decouple depth poses from the displayed poses.
// The scene uses world-space XZ and actual receiving meshes (road/pit/terrain).
export class DynamicShadows {
  constructor(light, renderer) {
    this.light = light;
    this.renderer = renderer;
    this.direction = new THREE.Vector3(-85, 150, 65).normalize();
    this.right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), this.direction)
      .normalize();
    this.up = new THREE.Vector3().crossVectors(this.direction, this.right);
    this.focus = new THREE.Vector3();
    this.centre = new THREE.Vector3();
    this.sphere = new THREE.Sphere(new THREE.Vector3(), 8);
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.updates = 0;
    this.reset();
    // Centimetre-scale receiver offset, not an XZ correction per track/model.
    light.shadow.normalBias = 0.02;
    light.shadow.bias = -0.00001;
    light.shadow.autoUpdate = true;
    renderer.shadowMap.autoUpdate = true;
  }
  reset() {
    this.spanX = this.spanY = 128;
    this.far = 500;
  }
  update(camera, look, cars, safetyCar) {
    if (!this.renderer.shadowMap.enabled) return;
    // Camera matrices must describe this frame, including its current lerp/zoom.
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    this.focus.set(look.x, 0, look.z);
    let minX = this.focus.dot(this.right) - 48,
      maxX = minX + 96;
    let minY = this.focus.dot(this.up) - 48,
      maxY = minY + 96;
    let minD = this.focus.dot(this.direction) - 100,
      maxD = minD + 200;
    this.visibleVehicles = 0;
    // All these vehicle roots are children of the world scene (identity transform).
    // Expand by the whole vehicle and its projected footprint, including an
    // offscreen caster whose shadow could still reach the image.
    for (let i = 0; i <= cars.length; i++) {
      const mesh = i === cars.length ? safetyCar : cars[i];
      if (!mesh?.visible) continue;
      this.sphere.center.copy(mesh.position);
      this.sphere.center.y += 1;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      const x = this.sphere.center.dot(this.right),
        y = this.sphere.center.dot(this.up),
        d = this.sphere.center.dot(this.direction);
      minX = Math.min(minX, x - 10);
      maxX = Math.max(maxX, x + 10);
      minY = Math.min(minY, y - 10);
      maxY = Math.max(maxY, y + 10);
      minD = Math.min(minD, d - 10);
      maxD = Math.max(maxD, d + 10);
      this.visibleVehicles++;
    }
    // Grow in fixed steps; do not pump map resolution as cars enter/leave view.
    // A new session/quality/mode resets the bound, not every frame/camera twitch.
    this.spanX = Math.max(this.spanX, Math.ceil((maxX - minX + 4) / 32) * 32);
    this.spanY = Math.max(this.spanY, Math.ceil((maxY - minY + 4) / 32) * 32);
    const shadow = this.light.shadow;
    const texelX = this.spanX / shadow.mapSize.x,
      texelY = this.spanY / shadow.mapSize.y;
    const x = Math.round((minX + maxX) / 2 / texelX) * texelX;
    const y = Math.round((minY + maxY) / 2 / texelY) * texelY;
    // Reconstruct the snapped light-space anchor on Y=0. The sun direction
    // stays invariant; camera movement cannot rotate or slide a real shadow.
    const depth = -(this.right.y * x + this.up.y * y) / this.direction.y;
    this.centre
      .copy(this.right)
      .multiplyScalar(x)
      .addScaledVector(this.up, y)
      .addScaledVector(this.direction, depth);
    const distance = Math.max(220, maxD - depth + 100);
    this.far = Math.max(
      this.far,
      Math.ceil((distance + depth - minD + 100) / 100) * 100,
    );
    this.light.target.position.copy(this.centre);
    this.light.position
      .copy(this.centre)
      .addScaledVector(this.direction, distance);
    const c = shadow.camera;
    if (
      c.right !== this.spanX / 2 ||
      c.top !== this.spanY / 2 ||
      c.far !== this.far
    ) {
      c.left = -this.spanX / 2;
      c.right = this.spanX / 2;
      c.bottom = -this.spanY / 2;
      c.top = this.spanY / 2;
      c.near = 1;
      c.far = this.far;
      c.updateProjectionMatrix();
    }
    // WebGLRenderer updates scene matrices and then renders the depth map and
    // colour from the same transforms. No stale-map intervals, even on pause,
    // removal, restart, pit animation, or a camera change with dt=0.
    this.renderer.shadowMap.autoUpdate = true;
    shadow.autoUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.updates++;
  }
  dispose() {
    this.light.shadow.dispose();
  }
}
