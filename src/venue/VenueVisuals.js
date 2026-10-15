import { AudienceEvents } from "./AudienceEvents.js";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { venuePlan, footprintDistance } from "./VenueLayout.js";
import { activeTrack } from "../track.js";
import { driverCatalog } from "../data/drivers.js";
function peopleAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d"),
    shirts = [
      "#da354f",
      "#e5e7df",
      "#2c78a6",
      "#e0b457",
      "#549581",
      "#5c477e",
      "#ccd7d8",
      "#d07745",
    ],
    skin = ["#eac1a0", "#bc8b65", "#815840", "#d6a681"];
  for (let n = 0; n < 32; n++) {
    const x = (n % 8) * 64,
      y = Math.floor(n / 8) * 64;
    ctx.save();
    ctx.translate(x, y);
    const stand = n % 4 === 0,
      up = n % 3 === 0;
    ctx.fillStyle = "#172d42";
    ctx.fillRect(21, stand ? 41 : 43, 8, 17);
    ctx.fillRect(35, stand ? 41 : 43, 8, 17);
    ctx.fillStyle = shirts[n % 8];
    ctx.beginPath();
    ctx.moveTo(22, 23);
    ctx.lineTo(42, 23);
    ctx.lineTo(46, 45);
    ctx.lineTo(18, 45);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shirts[n % 8];
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(24, 27);
    ctx.lineTo(up ? 13 : 15, up ? 8 : 38);
    ctx.moveTo(40, 27);
    ctx.lineTo(up ? 51 : 49, up ? 9 : 38);
    ctx.stroke();
    ctx.fillStyle = skin[n % 4];
    ctx.beginPath();
    ctx.arc(32, 16, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = n % 5 === 0 ? "#e3ddc2" : "#30323b";
    ctx.fillRect(25, 8, 14, 4);
    if (n % 5 === 0) ctx.fillRect(24, 11, 20, 3);
    ctx.fillStyle = "#111926";
    ctx.fillRect(19, 59, 12, 3);
    ctx.fillRect(34, 59, 12, 3);
    if (!stand) {
      ctx.fillStyle = "#263c52";
      ctx.fillRect(15, 44, 15, 7);
      ctx.fillRect(35, 44, 15, 7);
    }
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}
function crowdGeometry(cross = true) {
  const a = new THREE.PlaneGeometry(0.7, 1.3);
  a.translate(0, 0.65, 0);
  if (!cross) return a;
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b]);
  a.dispose();
  b.dispose();
  return g;
}
function crowdMaterial(texture, uniforms) {
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    alphaTest: 0.38,
    side: THREE.DoubleSide,
    color: activeTrack.night ? "#b9c7d5" : "#ffffff",
    toneMapped: false,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      "uniform float uEventTime;uniform float uMotion;uniform float uCheer;uniform vec3 uCheerAt;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
 float crowdSeed=fract(sin(dot(instanceMatrix[3].xyz,vec3(12.9898,78.233,31.71)))*43758.5453);
 float tile=floor(crowdSeed*32.0);
 vMapUv=vMapUv*vec2(.125,.25)+vec2(mod(tile,8.0)*.125,floor(tile/8.0)*.25);`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
 vec3 centre=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
 float lod=1.0-smoothstep(150.,450.,length((viewMatrix*vec4(centre,1.)).xyz));
 float cheer=uCheer*(1.0-smoothstep(40.,70.,distance(centre.xz,uCheerAt.xz)));
 float wave=sin(uEventTime*(1.4+crowdSeed)+crowdSeed*25.0);
 transformed.x+=wave*.036*transformed.y*uMotion*lod;
 transformed.y+=max(0.,wave)*(.025+cheer*.1)*uMotion*lod;`,
    );
  };
  mat.customProgramCacheKey = () => "apex-crowd-v07";
  return mat;
}
export class VenueVisuals {
  constructor(world) {
    this.world = world;
    this.audience = new AudienceEvents();
    this.plan = venuePlan();
    this.root = new THREE.Group();
    this.root.name = "event-venues";
    this.clock = 0;
    this.nextLOD = 0;
    this.boardUpdates = 0;
    this.nextBoard = 0;
    this.uniforms = {
      uEventTime: { value: 0 },
      uMotion: { value: 1 },
      uCheer: { value: 0 },
      uCheerAt: { value: new THREE.Vector3(1e6, 0, 1e6) },
    };
    this.near = crowdGeometry(true);
    this.far = crowdGeometry(false);
    this.atlas = peopleAtlas();
    this.crowdMat = crowdMaterial(this.atlas, this.uniforms);
    this.structureMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.boardCanvas = document.createElement("canvas");
    this.boardCanvas.width = 512;
    this.boardCanvas.height = 256;
    this.boardTexture = new THREE.CanvasTexture(this.boardCanvas);
    this.boardTexture.colorSpace = THREE.SRGBColorSpace;
    this.boardMat = new THREE.MeshBasicMaterial({
      map: this.boardTexture,
      toneMapped: false,
    });
    this.flagTexture = world.sign("APEX", 256, 128, "#f8f5e8", "#c82749");
    this.flagTexture.colorSpace = THREE.SRGBColorSpace;
    this.flagMat = new THREE.MeshBasicMaterial({
      map: this.flagTexture,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.flagTime = { value: 0 };
    this.flagMat.onBeforeCompile = (shader) => {
      shader.uniforms.uFlagTime = this.flagTime;
      shader.vertexShader = "uniform float uFlagTime;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\ntransformed.z+=sin(position.x*2.8-uFlagTime*2.4+instanceMatrix[3].x*.1)*.23*(position.x/2.6);`,
      );
    };
    this.flagMat.customProgramCacheKey = () => "apex-flags-v07";
    const sectorCanvas = document.createElement("canvas");
    sectorCanvas.width = 768;
    sectorCanvas.height = 64;
    const sc = sectorCanvas.getContext("2d");
    sc.fillStyle = "#182934";
    sc.fillRect(0, 0, 768, 64);
    sc.font = "bold 26px sans-serif";
    sc.fillStyle = "#f2f4ec";
    for (let i = 0; i < 3; i++)
      sc.fillText("APEX / SETOR " + (i + 1), i * 256 + 15, 43);
    this.sectorTexture = new THREE.CanvasTexture(sectorCanvas);
    this.sectorTexture.colorSpace = THREE.SRGBColorSpace;
    this.sectorMat = new THREE.MeshBasicMaterial({
      map: this.sectorTexture,
      toneMapped: false,
    });
    this.sectorMat.onBeforeCompile = (shader) => {
      shader.vertexShader = "attribute float sector;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvMapUv.x=(vMapUv.x+sector)/3.;",
      );
    };
    this.sectorMat.customProgramCacheKey = () => "apex-sector-signs-v07";
    const sg = new THREE.PlaneGeometry(24, 0.8);
    sg.setAttribute(
      "sector",
      new THREE.InstancedBufferAttribute(
        new Float32Array(this.plan.map((v) => v.sector - 1)),
        1,
      ),
    );
    this.sectorSigns = new THREE.InstancedMesh(
      sg,
      this.sectorMat,
      this.plan.length,
    );
    this.parts = [];
    const flagGeo = new THREE.PlaneGeometry(2.6, 1.4, 6, 2);
    flagGeo.translate(1.3, 0, 0);
    this.flags = new THREE.InstancedMesh(
      flagGeo,
      this.flagMat,
      this.plan.length * 3,
    );
    const lampMat = new THREE.MeshBasicMaterial({
      color: "#ffe3a3",
      toneMapped: false,
    });
    this.lamps = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      lampMat,
      this.plan.length * 3,
    );
    this.lamps.visible = !!activeTrack.night;
    let flagIndex = 0,
      lampIndex = 0;
    const temp = new THREE.Object3D(),
      matrix = new THREE.Matrix4(),
      colour = new THREE.Color();
    for (const v of this.plan) {
      const group = new THREE.Group();
      group.position.set(v.x, 0, v.z);
      group.rotation.y = v.heading;
      group.updateMatrix();
      group.name = "venue-" + v.index;
      const pieces = [],
        unit = new THREE.BoxGeometry(1, 1, 1);
      const box = (x, y, z, w, h, d, col, tilt = 0) => {
        const geo = unit.clone();
        temp.position.set(x, y, z);
        temp.scale.set(w, h, d);
        temp.rotation.set(tilt, 0, 0);
        temp.updateMatrix();
        geo.applyMatrix4(temp.matrix);
        const rgb = new Float32Array(geo.attributes.position.count * 3);
        colour.set(col);
        for (let j = 0; j < rgb.length; j += 3) {
          rgb[j] = colour.r;
          rgb[j + 1] = colour.g;
          rgb[j + 2] = colour.b;
        }
        geo.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
        pieces.push(geo);
      };
      const roofY = 0.62 + (v.rows - 1) * 0.52 + 2.7;
      for (let row = 0; row < v.rows; row++) {
        const top = 0.62 + row * 0.52,
          z = -v.depth / 2 + 0.65 + row * 1.2;
        box(0, (top - 0.06) / 2, z, v.width, top + 0.06, 1.23, v.colors.base);
        box(
          0,
          top + 0.15,
          z + 0.23,
          v.width - 1,
          0.16,
          0.6,
          row % 3 === 0 ? v.colors.accent : "#526373",
        );
      }
      for (let x = -v.width / 2 + 2; x <= v.width / 2 - 1; x += 12) {
        box(
          x,
          roofY / 2 - 0.03,
          v.depth / 2 - 1,
          0.22,
          roofY + 0.06,
          0.22,
          "#344653",
        );
      }
      box(0, 0.3, v.depth / 2 - 1, v.width, 0.72, 2, v.colors.base);
      box(0, 1.05, -v.depth / 2 - 0.3, v.width, 0.1, 0.12, "#b6c2cb");
      if (v.roof) {
        if (v.theme === "coast" || v.theme === "desert") {
          for (const sign of [-1, 1])
            box(
              0,
              roofY,
              v.depth * 0.24 * sign,
              v.width + 2,
              0.16,
              v.depth * 0.54,
              v.colors.roof,
              sign * 0.07,
            );
        } else
          box(0, roofY, 0, v.width + 2, 0.18, v.depth + 2, v.colors.roof, 0.04);
      }
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * (v.width / 2 - 4),
          poleY = roofY + 2;
        box(
          x,
          poleY / 2 - 0.03,
          v.depth / 2 - 0.4,
          0.12,
          poleY + 0.06,
          0.12,
          "#647b8c",
        );
        temp.position.set(x, poleY - 0.5, v.depth / 2 - 0.4);
        temp.scale.set(1, 1, 1);
        temp.rotation.set(0, Math.PI, 0);
        temp.updateMatrix();
        matrix.multiplyMatrices(group.matrix, temp.matrix);
        this.flags.setMatrixAt(flagIndex++, matrix);
        temp.position.set(x, roofY - 0.22, -v.depth / 2 + 0.3);
        temp.scale.set(6, 0.12, 0.22);
        temp.rotation.set(0, 0, 0);
        temp.updateMatrix();
        matrix.multiplyMatrices(group.matrix, temp.matrix);
        this.lamps.setMatrixAt(lampIndex++, matrix);
      }
      if (v.screen) {
        box(v.width / 2 - 8, roofY + 1.5, 0, 0.3, 3, 0.3, "#35424e");
        box(v.width / 2 - 8, roofY + 3.4, -0.05, 10.4, 5.5, 0.35, "#1a2735");
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(10, 5),
          this.boardMat,
        );
        board.rotation.y = Math.PI;
        board.position.set(v.width / 2 - 8, roofY + 3.4, -0.24);
        group.add(board);
      }
      temp.position.set(0, 0.5, -v.depth / 2 - 0.4);
      temp.rotation.set(0, Math.PI, 0);
      temp.scale.set(1, 1, 1);
      temp.updateMatrix();
      matrix.multiplyMatrices(group.matrix, temp.matrix);
      this.sectorSigns.setMatrixAt(v.index, matrix);
      const geometry = mergeGeometries(pieces);
      pieces.forEach((g) => g.dispose());
      unit.dispose();
      const structure = new THREE.Mesh(geometry, this.structureMat);
      structure.castShadow = true;
      structure.receiveShadow = true;
      structure.name = "grandstand-structure";
      group.add(structure);
      const crowd = new THREE.InstancedMesh(
        this.near,
        this.crowdMat,
        v.spectators,
      );
      let index = 0;
      for (let row = 0; row < v.rows; row++)
        for (let col = 0; col < v.columns; col++) {
          if (col % 21 === 10) continue;
          const n = row * v.columns + col;
          temp.position.set(
            -(v.columns - 1) * 0.425 + col * 0.85,
            0.65 + row * 0.52,
            -v.depth / 2 + 0.65 + row * 1.2,
          );
          temp.rotation.set(0, Math.PI, 0);
          temp.scale.set(1, (n % 7 === 0 ? 1.06 : 0.92) + (n % 3) * 0.035, 1);
          temp.updateMatrix();
          crowd.setMatrixAt(index++, temp.matrix);
        }
      crowd.name = "instanced-spectators";
      crowd.computeBoundingSphere();
      crowd.boundingSphere.radius += 0.25;
      group.add(crowd);
      this.root.add(group);
      this.parts.push({ venue: v, group, crowd, geometry });
    }
    this.flags.computeBoundingSphere();
    this.flags.boundingSphere.radius += 0.3;
    this.lamps.computeBoundingSphere();
    this.sectorSigns.computeBoundingSphere();
    this.root.add(this.flags, this.lamps, this.sectorSigns);
    world.scene.add(this.root);
    this.drawBoard(null);
  }
  contains(x, z, margin = 0) {
    return this.plan.some((v) => footprintDistance(v, x, z) < margin);
  }
  nearest(x, z) {
    let near = this.plan[0],
      best = Infinity;
    for (const v of this.plan) {
      const d = (v.x - x) ** 2 + (v.z - z) ** 2;
      if (d < best) {
        best = d;
        near = v;
      }
    }
    return near;
  }
  drawBoard(race) {
    const c = this.boardCanvas.getContext("2d");
    c.fillStyle = "#101b29";
    c.fillRect(0, 0, 512, 256);
    c.fillStyle = "#ec3153";
    c.fillRect(0, 0, 512, 7);
    c.textAlign = "left";
    c.font = "bold 26px sans-serif";
    c.fillStyle = "#f4f5f0";
    c.fillText("APEX / LIVE", 18, 42);
    c.font = "14px sans-serif";
    c.fillStyle = "#adc1d6";
    c.fillText(activeTrack.name.toUpperCase().slice(0, 39), 18, 67);
    this.boardState = {
      track: activeTrack.id,
      rows: [],
      state: race?.state || "no-session",
    };
    if (!race) {
      c.font = "bold 30px sans-serif";
      c.fillText("BEM-VINDOS", 18, 131);
      c.font = "18px sans-serif";
      c.fillText("SEM SESSÃO EM ANDAMENTO", 18, 174);
      c.fillText("BUILD THE TEAM. MASTER THE RACE.", 18, 221);
    } else {
      const order = race.standings();
      for (let i = 0; i < Math.min(4, order.length); i++) {
        const p = order[i],
          name = driverCatalog[p.driverId]?.name || p.name;
        c.fillStyle = p.id === 0 ? "#f65b78" : "#eef2f6";
        c.font = "bold 22px sans-serif";
        c.fillText(
          `${i + 1}  #${p.number} ${name}`.slice(0, 24),
          18,
          106 + i * 31,
        );
        c.textAlign = "right";
        c.font = "18px sans-serif";
        const value = ["qualifying", "practice", "time-attack"].includes(
          race.sessionType,
        )
          ? p.bestLap?.toFixed(3) || "—"
          : p.finished
            ? `${(p.finishTime + p.penalty).toFixed(2)}s`
            : i === 0
              ? `V${p.lap + 1}/${race.laps}`
              : race.timing.gap(order[0], p, race.time) === null
                ? "—"
                : `+${race.timing.gap(order[0], p, race.time).toFixed(1)}s`;
        c.fillText(value, 490, 106 + i * 31);
        c.textAlign = "left";
        this.boardState.rows.push({ id: p.id, position: i + 1, name, value });
      }
      c.fillStyle = "#ffc66f";
      c.font = "15px sans-serif";
      c.fillText(
        `${race.state.toUpperCase()} · ${race.time.toFixed(1)} s · ${(race.control?.phase || race.flag).toUpperCase()}`,
        18,
        246,
      );
    }
    this.boardTexture.needsUpdate = true;
    this.boardUpdates++;
  }
  update(camera, dt, race, detail = 1) {
    if (!["paused", "red"].includes(race?.state)) this.clock += dt;
    this.uniforms.uEventTime.value = this.clock;
    this.flagTime.value = this.clock;
    this.uniforms.uMotion.value = detail;
    this.uniforms.uCheer.value =
      Math.max(0, (this.cheerUntil || 0) - this.clock) / 3;
    if (this.clock >= this.nextLOD) {
      this.nextLOD = this.clock + 0.3;
      for (const p of this.parts) {
        const distance = Math.hypot(
          camera.position.x - p.venue.x,
          camera.position.z - p.venue.z,
        );
        p.crowd.geometry =
          distance < (detail > 0.9 ? 240 : detail > 0.7 ? 160 : 90)
            ? this.near
            : this.far;
      }
    }
    if (race !== this.race) {
      this.race = race;
      this.eventId = 0;
      this.nextBoard = 0;
    }
    this.audience.update(race);
    for (const e of this.audience.events)
      if (e.serial > (this.lastAudienceSerial || 0)) {
        this.lastAudienceSerial = e.serial;
        const v = this.nearest(e.x, e.z);
        this.uniforms.uCheerAt.value.set(v.x, 0, v.z);
        this.cheerUntil = this.clock + 3;
        this.lastCelebration = { id: e.serial, type: e.kind, venue: v.id };
      }
    if (this.clock >= this.nextBoard) {
      this.nextBoard = this.clock + 1;
      this.drawBoard(race);
    }
  }
  collectResources(geometries, materials, textures) {
    geometries.add(this.near);
    geometries.add(this.far);
    textures.add(this.atlas);
    textures.add(this.boardTexture);
    textures.add(this.flagTexture);
    materials.add(this.crowdMat);
    materials.add(this.boardMat);
    materials.add(this.flagMat);
  }
}
