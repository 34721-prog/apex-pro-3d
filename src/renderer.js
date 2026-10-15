import { EnvironmentVisuals, groundGeometry } from "./graphics/EnvironmentVisuals.js";
import { rigVehicle, applyVehiclePose, interpolationAddsOverlap, ROAD_HEIGHT, KERB_RISE, KERB_WIDTH } from "./graphics/VehiclePresentation.js";
import { readVisualPose, visualCut } from "./graphics/VehicleMotion.js";
import { DynamicShadows } from "./graphics/DynamicShadows.js";
import { VenueVisuals } from "./venue/VenueVisuals.js";
import { makeSafetyCar } from "./graphics/SafetyCarModel.js";
import { atmosphere } from "./graphics/TrackAtmosphere.js";
import { applyQuality, observePerformance } from "./graphics/Quality.js";
import { Effects } from "./graphics/Effects.js";
import { buildPit } from "./graphics/PitVisuals.js";
import {
  pitOuter,
  pitFacilities,
  pitSceneryClear,
  bayFor,
  pitLayout,
  SERVICE_LANE,
} from "./strategy/PitLayout.js";
import { driverCatalog } from "./data/drivers.js";
import { pitPoint, pitOffset, pitZone } from "./strategy/PitStop.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  at,
  samples,
  length,
  TRACK_WIDTH,
  barrierOffset,
  closest,
  activeTrack,
  bounds,
} from "./track.js";
import { batchScenery } from "./optimize.js";
import { makeCar, liveries } from "./models.js";
export class World {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(activeTrack.sky);
    this.scene.fog = new THREE.Fog(activeTrack.sky, 400, 1600);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    container.appendChild(this.renderer.domElement);
    this.fill = new THREE.DirectionalLight("#dce8ff", 1.2);
    this.fill.position.set(80, 90, -100);
    this.scene.add(this.fill);
    this.camera = new THREE.PerspectiveCamera(49, 1, 0.2, 1600);
    this.sun = new THREE.DirectionalLight("#fff0d1", 3.1);
    this.sun.position.set(-130, 210, 100);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -75;
    this.sun.shadow.camera.right = 75;
    this.sun.shadow.camera.top = 75;
    this.sun.shadow.camera.bottom = -75;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.normalBias = 0.08;
    this.scene.add(
      this.sun,
      this.sun.target,
      new THREE.HemisphereLight("#dcecff", "#5b6046", 2),
    );
    this.assetErrors = [];
    const manager = new THREE.LoadingManager();
    this.resourcesReady = new Promise((resolve) => {
      manager.onLoad = resolve;
    });
    manager.onError = (url) => {
      if (!this.assetErrors.includes(url)) {
        this.assetErrors.push(url);
        console.error("Recurso indisponível:", url);
      }
    };
    this.loader = new GLTFLoader(manager);
    this.texLoader = new THREE.TextureLoader(manager);
    this.carMeshes = [];
    this.carById = new Map();
    this.visualDrivers = [];
    this.mode = "showcase";
    this.cameraMode = "chase";
    this.previewRotation = 0;
    this.look = new THREE.Vector3();
    this.targetLook = new THREE.Vector3();
    this.cameraReady = false;
    this.previewCar = 0;
    this.elapsed = 0;
    this.buildTrack();
    this.venues = new VenueVisuals(this);
    this.buildScenery();
    this.environment = new EnvironmentVisuals(this);
    this.safetyMesh = makeSafetyCar();
    this.safetyMesh.visible = false;
    this.scene.add(this.safetyMesh);
    atmosphere(this);
    batchScenery(this.scene, [
      this.gantry,
      this.pitRoot,
      this.safetyMesh,
      this.venues.root,
      this.environment.root,
    ]);
    this.effects = new Effects(this.scene);
    this.scene.traverse((o) => {
      if (!o.isLight && o !== this.sun.target) {
        o.updateMatrix();
        o.matrixAutoUpdate = false;
      }
    });
    this.carCache = new Array(12);
    this.camPoint = new THREE.Vector3();
    this.carDirection = new THREE.Vector3();
    this.dynamicShadows = new DynamicShadows(this.sun, this.renderer);
    this.paint = "signature";
    this.ready = this.loadAssets().then(async () => {
      await this.resourcesReady;
      if (this.disposed) return;
      // Prepare colour programs without an extra render/physics step.
      await this.renderer.compileAsync(this.scene, this.camera);
      if (!this.disposed) this.assetsReady = true;
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }
  texture(name, repeatX = 1, repeatY = 1) {
    const t = this.texLoader.load("/assets/tracks/textures/" + name + ".png");
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.magFilter = ["asphalt", "asphalt-worn", "grass", "terrain-neutral"].includes(name) ? THREE.LinearFilter : THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  getCar(index) {
    return this.carCache[index] || (this.carCache[index] = makeCar(index));
  }
  async loadAssets() {
    try {
      const data = await this.loader.loadAsync(
        "/assets/cars/models/apex-07.glb",
      );
      if (this.disposed) {
        data.scene.traverse((o) => {
          o.geometry?.dispose();
          if (o.material) {
            for (const v of Object.values(o.material))
              if (v?.isTexture) v.dispose();
            o.material.dispose();
          }
        });
        return;
      }
      this.assetCar = data.scene;
      this.assetCar.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      if (this.carCache[0])
        this.carCache[0].traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
      this.carCache[0] = this.assetCar;
      if (this.mode === "showcase") this.setPreview(this.previewCar);
    } catch (e) {
      this.loadError = e;
      console.error("Falha no GLB: usando modelo procedural equivalente", e);
    }
  }
  dispose() {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    const roots = [this.scene, ...this.carCache.filter(Boolean)];
    for (const root of roots)
      root.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material)
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            materials.add(m);
            for (const value of Object.values(m))
              if (value?.isTexture) textures.add(value);
          }
      });
    this.venues?.collectResources(geometries, materials, textures);
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    this.dynamicShadows?.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  ribbon(inner, outer, material, colorKerb = false) {
    const verts = [],
      uv = [],
      colors = [],
      idx = [];
    for (let i = 0; i <= samples.length; i++) {
      const p = samples[i % samples.length],
        next = samples[(i + 1) % samples.length],
        dir = next.clone().sub(p).normalize(),
        r = new THREE.Vector3(dir.z, 0, -dir.x);
      for (const offset of [inner, outer]) {
        verts.push(p.x + r.x * offset, ROAD_HEIGHT, p.z + r.z * offset);
        uv.push(offset / (outer - inner), (i * length) / samples.length / 5);
        if (colorKerb) {
          const c = new THREE.Color(
            Math.floor((i * length) / samples.length / 4) % 2
              ? "#e7e6d8"
              : "#d52d43",
          );
          colors.push(c.r, c.g, c.b);
        }
      }
      if (i < samples.length) {
        let n = i * 2;
        idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      }
    }
    let geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    if (colorKerb)
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }
  buildTrack() {
    const ground = new THREE.Mesh(
      groundGeometry(),
      new THREE.MeshLambertMaterial({
        map: this.texture(
          ["desert", "snow"].includes(activeTrack.theme)
            ? "terrain-neutral"
            : "grass",
          270,
          270,
        ),
        color: activeTrack.grass,
        vertexColors: true,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    this.ground = ground;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.roadMaterial = new THREE.MeshLambertMaterial({
      map: this.texture("asphalt-worn", 3, 1),
      side: THREE.DoubleSide,
    });
    // Only the exposed shoulders: do not tessellate a second surface underneath
    // the full asphalt ribbon (visible interference in distant/aerial cameras).
    const shoulderMaterial = new THREE.MeshLambertMaterial({
      color: "#898d81", side: THREE.DoubleSide,
    });
    for (const [inner, outer] of [
      [-TRACK_WIDTH / 2 - 3.5, -TRACK_WIDTH / 2],
      [TRACK_WIDTH / 2, TRACK_WIDTH / 2 + 3.5],
    ]) this.ribbon(inner, outer, shoulderMaterial).position.y = -0.025;
    this.ribbon(-TRACK_WIDTH / 2, TRACK_WIDTH / 2, this.roadMaterial);
    const kerbMat = new THREE.MeshLambertMaterial({
      side: THREE.DoubleSide,
      map: this.texture("kerb-red-white"),
    });
    this.ribbon(
      -TRACK_WIDTH / 2 - KERB_WIDTH,
      -TRACK_WIDTH / 2,
      kerbMat,
      true,
    ).position.y = KERB_RISE;
    this.ribbon(
      TRACK_WIDTH / 2,
      TRACK_WIDTH / 2 + KERB_WIDTH,
      kerbMat,
      true,
    ).position.y = KERB_RISE;
    let line = new THREE.MeshLambertMaterial({
      color: "#e5e6d7",
      side: THREE.DoubleSide,
    });
    this.ribbon(
      -TRACK_WIDTH / 2 + 0.1,
      -TRACK_WIDTH / 2 + 0.32,
      line,
    ).position.y = 0.02;
    this.ribbon(
      TRACK_WIDTH / 2 - 0.32,
      TRACK_WIDTH / 2 - 0.1,
      line,
    ).position.y = 0.02;
    const railMat = new THREE.MeshLambertMaterial({
      color: "#c2c7c3",
    });
    const count = Math.floor(length / 4);
    let rails = new THREE.InstancedMesh(
        new THREE.BoxGeometry(4.1, 0.42, 0.28),
        railMat,
        count * 2,
      ),
      posts = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.16, 1.4, 0.18),
        railMat,
        count * 2,
      );
    let dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = at((i / count) * length);
      for (let side = 0; side < 2; side++) {
        const sign = side ? 1 : -1;
        dummy.position
          .copy(a.p)
          .addScaledVector(
            a.right,
            sign *
              (side && pitZone((i / count) * length)
                ? pitOuter((i / count) * length)
                : barrierOffset()),
          );
        dummy.position.y = 0.92;
        dummy.rotation.y = a.heading + Math.PI / 2;
        dummy.updateMatrix();
        rails.setMatrixAt(i * 2 + side, dummy.matrix);
        dummy.position.y = 0.68;
        dummy.updateMatrix();
        posts.setMatrixAt(i * 2 + side, dummy.matrix);
      }
    }
    this.scene.add(rails, posts);
    this.buildPit();
    const start = at(0),
      checkerGroup = new THREE.Group();
    checkerGroup.position.copy(start.p);
    checkerGroup.position.y = 0.16;
    checkerGroup.rotation.y = start.heading;
    const white = new THREE.MeshLambertMaterial({ color: "#eeede2" }),
      black = new THREE.MeshLambertMaterial({ color: "#242a2c" });
    for (let x = 0; x < 18; x++)
      for (let z = 0; z < 2; z++) {
        let tile = new THREE.Mesh(
          new THREE.BoxGeometry(1, 0.015, 1),
          (x + z) % 2 ? black : white,
        );
        tile.position.set(x - 8.5, 0, z - 0.5);
        checkerGroup.add(tile);
      }
    this.scene.add(checkerGroup);
    for (let n = 0; n < 6; n++) {
      const a = at(length - 14 - Math.floor(n / 2) * 10);
      const pos = a.p.clone().addScaledVector(a.right, n % 2 ? 3 : -3);
      let mark = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.12), white);
      mark.rotation.x = -Math.PI / 2;
      mark.rotation.z = -a.heading;
      mark.position.copy(pos);
      mark.position.y = 0.16;
      this.scene.add(mark);
    }
    this.gantry = new THREE.Group();
    this.gantry.position.copy(start.p);
    this.gantry.rotation.y = start.heading;
    const gm = new THREE.MeshLambertMaterial({
      color: "#282e36",
    });
    for (const x of [-TRACK_WIDTH / 2 - 3, TRACK_WIDTH / 2 + 3])
      this.addBox(this.gantry, x, 4, 0, 0.48, 8, 0.5, gm);
    this.addBox(this.gantry, 0, 7.8, 0, TRACK_WIDTH + 7, 1.9, 0.7, gm);
    const sign = this.sign("APEX DYNASTY", 1024, 100, "#e6eaee", "#11161c");
    let panel = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 1.45),
      new THREE.MeshBasicMaterial({ map: sign, side: THREE.DoubleSide }),
    );
    panel.position.set(0, 7.8, -0.37);
    panel.rotation.y = Math.PI;
    this.gantry.add(panel);
    this.lights = [];
    for (let i = 0; i < 5; i++) {
      let m = new THREE.Mesh(
        new THREE.SphereGeometry(0.29, 8, 6),
        new THREE.MeshBasicMaterial({ color: "#32121b" }),
      );
      m.position.set((i - 2) * 1.2, 6.3, -0.44);
      this.gantry.add(m);
      this.lights.push(m);
    }
    this.scene.add(this.gantry);
  }
  buildPit() {
    buildPit(this);
  }

  addBox(group, x, y, z, w, h, d, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  sign(text, w = 512, h = 128, color = "#eee", bg = "#151a20") {
    let canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    let c = canvas.getContext("2d");
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = color;
    c.font = `900 ${h * 0.56}px Arial`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, w / 2, h / 2, w * 0.91);
    return new THREE.CanvasTexture(canvas);
  }
  placeFacility(obj, id) {
    const t = pitFacilities().find((b) => b.id === id);
    obj.name = "pit-" + id;
    obj.userData.pitFootprint = t;
    obj.position.set(t.x, 0, t.z);
    obj.rotation.y = t.heading - Math.PI / 2;
  }
  buildScenery() {
    const m = (c, metalness = 0) =>
      new THREE.MeshLambertMaterial({
        color: c,
        flatShading: true,
      });
    const concrete = m("#c1bfae"),
      dark = m("#292f36"),
      roof = m("#bcc5c8", 0.35),
      glass = m("#3d535c", 0.45),
      red = m("#bb3042"),
      seats = m("#667988");
    const d = new THREE.Object3D();
    const paddock = new THREE.Group();
    this.placeFacility(paddock, "paddock");
    this.addBox(paddock, 0, 3, 0, 130, 6, 15, concrete);
    this.addBox(paddock, 0, 6.4, 0, 134, 0.5, 18, roof);
    for (let i = 0; i < 12; i++) {
      this.addBox(paddock, -59 + i * 10.5, 2.2, 7.6, 8, 3.6, 0.12, dark);
      this.addBox(
        paddock,
        -59 + i * 10.5,
        5.1,
        7.62,
        8,
        0.75,
        0.14,
        i % 2 ? red : glass,
      );
    }
    this.scene.add(paddock);
    const tower = new THREE.Group();
    this.placeFacility(tower, "tower");
    this.addBox(tower, 0, 9, 0, 9, 18, 9, concrete);
    this.addBox(tower, 0, 16, 0, 12, 5, 12, glass);
    this.addBox(tower, 0, 19, 0, 15, 0.5, 15, roof);
    this.scene.add(tower);
    const adGeometry = new THREE.PlaneGeometry(14, 3);
    const adMaterials = ["APEX DYNASTY", "APEX / RACING", "APEX MOTORSPORT", "RACE YOUR LEGACY"].map((text, i) =>
      new THREE.MeshBasicMaterial({ map: this.sign(text, 512, 100,
        i % 2 ? "#171c21" : "#e4e6e7", i % 2 ? "#d7ddd7" : "#b2223b"), side: THREE.DoubleSide }));
    for (let i = 0; i < 19; i++) {
      const t = at((i / 19) * length + 60),
        p = t.p.clone().addScaledVector(t.right, 23);
      if (this.venues.contains(p.x, p.z, 8)) continue;
      const b = new THREE.Group();
      b.position.copy(p);
      b.rotation.y = t.heading - Math.PI / 2;
      for (const x of [-5, 5]) this.addBox(b, x, 1.2, 0, 0.22, 2.4, 0.22, dark);
      const sign = new THREE.Mesh(adGeometry, adMaterials[i % 4]);
      sign.position.y = 2.7;
      b.add(sign);
      this.scene.add(b);
    }
    // Clustered vegetation and continuous ridges are built by EnvironmentVisuals.
    this.cityBuildings = [];
    if (activeTrack.theme === "city") {
      for (let i = 0; i < 28; i++) {
        const t = at((i / 28) * length),
          h = activeTrack.id === "oldtown" ? 9 + (i % 6) * 2 : 18 + (i % 6) * 9;
        if (
          this.venues.contains(
            t.p.x + t.right.x * 70,
            t.p.z + t.right.z * 70,
            24,
          )
        )
          continue;
        if (
          closest(t.p.x + t.right.x * 70, t.p.z + t.right.z * 70).distance <
          TRACK_WIDTH / 2 + 32
        )
          continue;
        // Keep the existing building, but place it outside the shared pit footprint.
        let offset = 70,
          x = t.p.x + t.right.x * offset,
          z = t.p.z + t.right.z * offset;
        while (
          !pitSceneryClear(x, z, 21) ||
          this.venues.contains(x, z, 24) ||
          closest(x, z).distance < TRACK_WIDTH / 2 + 32
        ) {
          if (offset >= 1470)
            throw new Error(
              "Sem posição segura para prédio urbano: " + activeTrack.id,
            );
          offset += 40;
          x = t.p.x + t.right.x * offset;
          z = t.p.z + t.right.z * offset;
        }
        this.cityBuildings.push({
          x,
          z,
          heading: 0,
          halfWidth: 11.5,
          halfLength: 12,
          height: h,
        });
        this.addBox(
          this.scene,
          x,
          h / 2,
          z,
          23,
          h,
          24,
          i % 2 ? glass : concrete,
        );
      }
    }
    if (activeTrack.theme === "coast") {
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(1100, 1800),
        m("#548f9d"),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(bounds().maxX + 610, 0, 0);
      this.scene.add(water);
    }
    // Distance markers before the complex.
    for (let i = 0; i < 3; i++) {
      const a = at(length * 0.19 + i * 45);
      const p = a.p.clone().addScaledVector(a.right, -13.8);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({
          map: this.sign(String((3 - i) * 50), 128, 128, "#20242a", "#ecece0"),
          side: THREE.DoubleSide,
        }),
      );
      mesh.position.copy(p);
      mesh.position.y = 1.6;
      mesh.rotation.y = a.heading + Math.PI;
      this.scene.add(mesh);
    }
  }
  setWeather(weather) {
    this.weather = weather;
    this.scene.background.set(weather === "rain" ? "#788b9b" : activeTrack.sky);
    this.scene.fog.color.copy(this.scene.background);
    this.sun.intensity = activeTrack.night
      ? 0.8
      : weather === "rain"
        ? 1.2
        : activeTrack.sunset
          ? 2.2
          : 3.1;
    this.roadMaterial.color.set(weather === "rain" ? "#788491" : "#ffffff");
  }
  applyPaint(model, paint) {
    model?.traverse((o) => {
      if (o.isMesh && o.material.name === "body")
        o.material.color.set(
          this.customization?.primary ||
            (paint === "carbon"
              ? "#242b35"
              : paint === "heritage"
                ? "#eee9dc"
                : liveries[this.previewCar].color),
        );
      if (o.isMesh && o.material.name === "accent")
        o.material.color.set(
          this.customization?.secondary ||
            (paint === "signature"
              ? liveries[this.previewCar].accent
              : "#ec2449"),
        );
    });
  }
  setPaint(paint) {
    this.paint = paint;
    this.applyPaint(this.showCar, paint);
  }
  setPreview(index) {
    this.previewCar = index;
    if (this.showCar) {
      this.scene.remove(this.showCar);
      this.showCar.traverse((o) => {
        if (o.isMesh) {
          o.material.dispose();
          if (this.showCar.userData.ownedGeometry) o.geometry.dispose();
        }
      });
    }
    this.showCar = this.customization
      ? makeCar(index, this.customization)
      : this.getCar(index).clone(true);
    this.showCar.traverse((o) => {
      if (o.isMesh) o.material = o.material.clone();
    });
    this.showCar.userData.ownedGeometry = !!this.customization;
    this.setPaint(this.paint);
    const a = at(12);
    this.showCar.position.copy(a.p);
    this.showCar.position.y = 0.14;
    this.showCar.rotation.y = a.heading + this.previewRotation;
    this.showCar.visible = this.mode === "showcase";
    this.scene.add(this.showCar);
  }
  setMode(mode, drivers = []) {
    // Overview needs depth precision at kilometre distances, not cockpit near clipping.
    this.camera.near = mode === "track-preview" ? 20 : 0.2;
    this.camera.far =
      mode === "track-preview"
        ? 6000
        : 800 + 800 * (this.graphics?.detail ?? 1);
    this.scene.fog.far = this.camera.far;
    this.camera.updateProjectionMatrix();
    this.mode = mode;
    this.dynamicShadows.reset();
    if (mode !== "race") this.raceContext = null;
    this.cameraReady = false;
    for (const m of this.carMeshes) {
      this.scene.remove(m);
      m.traverse((o) => {
        if (o.isMesh && (m.userData.ownedMaterials || o.userData.ownedHelmet))
          o.material.dispose();
        if (o.isMesh && m.userData.ownedGeometry) o.geometry.dispose();
      });
    }
    this.carMeshes = [];
    this.carById.clear();
    if (this.showCar) this.showCar.visible = mode === "showcase";
    if (mode === "race") {
      drivers.forEach((d, i) => {
        let mesh =
          d.modelIndex !== undefined
            ? makeCar(d.modelIndex, {
                primary: pitLayout()[d.teamId].color,
                secondary: "#ecedef",
                detail: "#1a2430",
                number: d.number,
              })
            : i === 0 && this.customization
              ? makeCar(this.previewCar, this.customization)
              : this.getCar(i === 0 ? this.previewCar : i).clone(true);
        if (d.modelIndex !== undefined) {
          mesh.userData.ownedGeometry = true;
          mesh.userData.ownedMaterials = true;
        }
        mesh.traverse((o) => {
          if (o.isMesh && o.material.name === "helmet") {
            o.material = o.material.clone();
            o.userData.ownedHelmet = true;
            o.material.color.set(driverCatalog[d.driverId || 0].color);
          }
        });
        if (i === 0) {
          mesh.traverse((o) => {
            if (o.isMesh) o.material = o.material.clone();
          });
          if (d.modelIndex === undefined) this.applyPaint(mesh, this.paint);
          mesh.userData.ownedMaterials = true;
          mesh.userData.ownedGeometry =
            d.modelIndex !== undefined || !!this.customization;
        }
        mesh._frontWing = mesh.getObjectByName("front-wing");
        rigVehicle(mesh);
        mesh._driverView = Object.create(d);
        mesh.userData.driverId = d.id;
        this.carById.set(d.id, mesh);
        this.carMeshes.push(mesh);
        this.scene.add(mesh);
      });
    }
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h || (w === this.viewWidth && h === this.viewHeight)) return;
    this.viewWidth = w;
    this.viewHeight = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  quality(value) {
    applyQuality(this, value);
  }
  applyResolution() {
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, 1.5) *
        this.graphics.resolution *
        this.adaptiveScale,
    );
    this.resize();
  }
  observeFrame(dt, active) {
    observePerformance(this, dt, active);
  }
  render(dt, drivers = [], state = "menu", countdown = 0, alpha = 1) {
    if (!this.assetsReady || this.disposed) return;
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.25)) : 0;
    this.elapsed += dt;
    // A corrected/contact/teleported tick is shown atomically for the whole grid.
    // Never interpolate one participant through another's corrected current pose.
    if (["paused", "red", "results"].includes(state) || drivers.some(visualCut)) alpha = 1;
    this.visualDrivers.length = 0;
    const cam = this.camera;
    const cp = this.camPoint;
    for (const m of this.carMeshes) m.visible = false;
    drivers.forEach((d) => {
      const m = this.carById.get(d.id);
      if (!m) return;
      m.visible = true;
      const pose = readVisualPose(d, m._pose, alpha);
      applyVehiclePose(m, d, pose);
      const view = m._driverView;
      if (Object.getPrototypeOf(view) !== d) Object.setPrototypeOf(view, d);
      view.x = pose.x; view.z = pose.z; view.heading = pose.heading;
      view.s = pose.s; view.speed = pose.speed;
      this.visualDrivers.push(view);
      if (m._frontWing) {
        m._frontWing.rotation.z = (d.wingDamage || 0) * 0.12;
        m._frontWing.scale.x = 1 - (d.wingDamage || 0) * 0.18;
      }
    });
    if (alpha < 1 && interpolationAddsOverlap(this.visualDrivers)) {
      for (const view of this.visualDrivers) {
        const d = Object.getPrototypeOf(view), m = this.carById.get(d.id);
        const pose = readVisualPose(d, m._pose, 1);
        applyVehiclePose(m, d, pose);
        view.x = pose.x; view.z = pose.z; view.heading = pose.heading;
        view.s = pose.s; view.speed = pose.speed;
      }
    }
    drivers = this.visualDrivers;
    if (
      this.mode === "venue-preview" ||
      (this.mode === "race" && this.cameraMode === "grandstands")
    ) {
      const player =
        drivers.find((c) => c.id === (this.focusId || 0)) || drivers[0];
      const v =
          this.venues.plan[this.venueFocus ?? -1] ||
          this.venues.nearest(player?.x ?? 0, player?.z ?? 0),
        sn = Math.sin(v.heading),
        cs = Math.cos(v.heading),
        distance = Math.max(
          v.depth / 2 + v.width * 0.65,
          (v.width + 12) / (2 * Math.tan((48 * Math.PI) / 360) * cam.aspect),
        ),
        shift = -v.width * 0.22;
      cp.set(
        v.x - sn * distance + cs * shift,
        11,
        v.z - cs * distance - sn * shift,
      );
      this.targetLook.set(v.x, 3 + v.rows * 0.28, v.z);
      cam.fov = 48;
    } else if (
      this.mode === "track-preview" ||
      (this.mode === "race" && this.cameraMode === "overview")
    ) {
      const b = bounds(),
        cx = (b.minX + b.maxX) / 2,
        cz = (b.minZ + b.maxZ) / 2,
        size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
      cp.set(cx + size * 0.15, size * 0.95, cz + size * 0.56);
      this.targetLook.set(cx, 0, cz);
      cam.fov = 53;
    } else if (this.mode === "showcase") {
      if (!this.showCar) this.setPreview(0);
      const a = at(12),
        orbit = Math.sin(this.elapsed * 0.12) * 0.18;
      cp.copy(a.p)
        .addScaledVector(a.right, 6.6 + orbit)
        .addScaledVector(a.dir, 8.4);
      cp.y = 4.5;
      this.targetLook.copy(a.p).addScaledVector(a.dir, -0.15);
      this.targetLook.y = 0.74;
      cam.fov = 38;
    } else if (drivers.length) {
      const p = drivers.find((c) => c.id === (this.focusId || 0)) || drivers[0],
        dir = this.carDirection.set(
          Math.sin(p.heading),
          0,
          Math.cos(p.heading),
        );
      if (this.cameraMode === "safety-car" && this.raceContext?.control) {
        const sc = this.raceContext.control.sc.car,
          sn = Math.sin(sc.heading),
          cs = Math.cos(sc.heading);
        cp.set(sc.x - sn * 12, 6, sc.z - cs * 12);
        this.targetLook.set(sc.x + sn * 8, 1, sc.z + cs * 8);
        cam.fov = 50;
      } else if (this.cameraMode.startsWith("pit-")) {
        const bay = bayFor(p),
          close = this.cameraMode === "pit-garage",
          wheels = this.cameraMode === "pit-wheels",
          lane = this.cameraMode === "pit-lane";
        const t = at(close || wheels ? bay.s : lane ? p.s + 22 : p.s);
        if (close || wheels) {
          cp.copy(t.p)
            .addScaledVector(t.right, SERVICE_LANE - (wheels ? 4.5 : 8))
            .addScaledVector(t.dir, wheels ? 3 : 7);
          cp.y = wheels ? 1.1 : 3.8;
          this.targetLook.set(bay.x, 0.8, bay.z);
          cam.fov = wheels ? 40 : 57;
        } else {
          cp.copy(t.p)
            .addScaledVector(t.right, lane ? 16 : pitOffset(p.s) + 9)
            .addScaledVector(t.dir, lane ? 0 : -14);
          cp.y = lane ? 9 : 5;
          this.targetLook.set(p.x, 0.8, p.z);
          cam.fov = 55;
        }
      } else if (this.cameraMode === "cockpit") {
        const eye = (this.carById.get(p.id)?.position.y ?? 0.14) + 1.32;
        cp.set(p.x, eye, p.z).addScaledVector(dir, 0.35);
        this.targetLook.set(p.x, eye - 0.01, p.z).addScaledVector(dir, 45);
        cam.fov = 73;
      } else if (this.cameraMode === "battle") {
        let opponent = null,
          near = 90;
        for (const o of drivers) {
          if (o === p || o.finished) continue;
          const d = Math.hypot(o.x - p.x, o.z - p.z);
          if (d < near) {
            near = d;
            opponent = o;
          }
        }
        const x = opponent ? (p.x + opponent.x) / 2 : p.x,
          z = opponent ? (p.z + opponent.z) / 2 : p.z;
        cp.set(x, 12 + near * 0.12, z).addScaledVector(dir, -20 - near * 0.18);
        this.targetLook.set(x, 1, z);
        cam.fov = 58;
      } else if (this.cameraMode === "broadcast") {
        const a = at(p.s + 38);
        cp.copy(a.p).addScaledVector(a.right, -23);
        cp.y = 13;
        this.targetLook.set(p.x, 0.8, p.z);
        cam.fov = 50;
      } else {
        const far = this.cameraMode === "far";
        cp.set(p.x, far ? 10 : 5.0 + p.speed * 0.012, p.z).addScaledVector(
          dir,
          far ? -22 : -10.8 - p.speed * 0.035,
        );
        this.targetLook
          .set(p.x, 1.05, p.z)
          .addScaledVector(dir, 12 + p.speed * 0.065);
        cam.fov = 55 + p.speed * 0.13;
      }
    }
    if (
      !this.cameraReady ||
      (this.mode === "race" && this.cameraMode === "cockpit")
    ) {
      cam.position.copy(cp);
      this.look.copy(this.targetLook);
      this.cameraReady = true;
    } else {
      cam.position.lerp(cp, 1 - Math.exp(-dt * 5.8));
      this.look.lerp(this.targetLook, 1 - Math.exp(-dt * 8));
    }
    cam.lookAt(this.look);
    if (this.lastFov !== cam.fov) {
      cam.updateProjectionMatrix();
      this.lastFov = cam.fov;
    }
    this.lights.forEach((l, i) =>
      l.material.color.set(
        state === "countdown" && 5 - countdown >= i ? "#f0193d" : "#32121b",
      ),
    );
    this.effects.update(
      drivers[0],
      this.elapsed,
      this.weather,
      this.rainIntensity,
    );
    const sc = this.raceContext?.control.sc;
    this.safetyMesh.visible = this.mode === "race" && !!sc;
    if (this.safetyMesh.visible) {
      this.safetyMesh.position.set(sc.car.x, 0.1, sc.car.z);
      this.safetyMesh.rotation.y = sc.car.heading;
      this.safetyMesh.userData.beacon.visible =
        sc.state !== "parked" &&
        Math.floor((this.raceContext.time || 0) * 4) % 2 === 0;
      this.safetyMesh.updateMatrix();
    }
    this.crew?.update(drivers, cam, this.elapsed, this.graphics?.detail ?? 1);
    this.venues.update(cam, dt, this.raceContext, this.graphics?.detail ?? 0.8);
    this.environment.update(cam, this.look, this);
    this.dynamicShadows.update(
      cam,
      this.look,
      this.mode === "race" ? this.carMeshes : [this.showCar],
      this.safetyMesh,
    );
    this.renderer.render(this.scene, cam);
  }
}
