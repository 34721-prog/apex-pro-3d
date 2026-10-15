import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { activeTrack } from '../track.js';
import { environmentPlan, environmentView } from './EnvironmentPlan.js';

// All construction happens once per track. Spatial batches retain frustum culling.
function terrainShade(x, z) {
  return .92+.055*Math.sin(x*.013+Math.cos(z*.008)*2)+.035*Math.cos(-z*.019+x*.003);
}
function coloured(geometry, colour) {
  const g=geometry.index?geometry.toNonIndexed():geometry.clone();
  g.deleteAttribute('uv');
  const c=new THREE.Color(colour), values=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<values.length;i+=3){values[i]=c.r;values[i+1]=c.g;values[i+2]=c.b;}
  g.setAttribute('color',new THREE.BufferAttribute(values,3));
  return g;
}
export function groundGeometry() {
  const g=new THREE.PlaneGeometry(4200,4200,48,48),a=g.attributes.position;
  const colors=new Float32Array(a.count*3);
  for(let i=0;i<a.count;i++) {
    const x=a.getX(i),z=a.getY(i);
    const shade=terrainShade(x,-z);
    colors[i*3]=shade;colors[i*3+1]=shade;colors[i*3+2]=shade;
  }
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
export class EnvironmentVisuals {
  constructor(world) {
    this.cityBuildings=world.cityBuildings;
    this.plan=environmentPlan(world.venues.plan,world.cityBuildings);
    this.root=new THREE.Group();this.root.name='environment-spatial-batches';world.scene.add(this.root);
    this.material=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});
    this.view={};this.lods=[];this.ground=world.ground;
    this.buildLandscape();this.buildFacilities();this.buildVegetation();
    this.stats={identity:this.plan.profile.identity,vegetation:this.plan.vegetation.length,facilities:this.plan.facilities.length,spatialBatches:this.root.children.length,lodCells:this.lods.length};
  }
  addBatch(g,x=0,z=0) {
    const mesh=new THREE.Mesh(g,this.material);mesh.position.set(x,-.06,z);
    mesh.receiveShadow=true;this.root.add(mesh);return mesh;
  }
  buildLandscape() {
    const {profile:p,centre:c,radius}=this.plan,n=96,rows=9,positions=[],colours=[],indices=[],uv=[];
    const base=new THREE.Color(activeTrack.grass),summit=new THREE.Color(activeTrack.theme==='snow'?'#e1e8e5':p.ridge).multiplyScalar(1.18);
    for(let j=0;j<=rows;j++)for(let i=0;i<=n;i++) {
      const a=i/n*Math.PI*2,r=radius+j*155;
      const shape=.65+.2*Math.sin(a*5+.7)+.13*Math.sin(a*11+1.4)+.07*Math.cos(a*19);
      // Flat first strip shares the ground normal: no circular lighting seam.
      const h=Math.sin(Math.max(0,j-1)/(rows-1)*Math.PI)**2*p.relief*shape;
      positions.push(Math.cos(a)*r,h,Math.sin(a)*r);
      uv.push((c.x+Math.cos(a)*r)/4200+.5,.5-(c.z+Math.sin(a)*r)/4200);
      const col=base.clone().lerp(summit,Math.max(0,h/p.relief)).multiplyScalar(terrainShade(c.x+Math.cos(a)*r,c.z+Math.sin(a)*r));
      colours.push(col.r,col.g,col.b);
      if(j<rows&&i<n){const k=j*(n+1)+i;indices.push(k,k+1,k+n+1,k+1,k+n+2,k+n+1);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
    const mesh=this.addBatch(g,c.x,c.z);mesh.name='continuous-distant-landscape';
    mesh.material=new THREE.MeshLambertMaterial({vertexColors:true,map:this.ground.material.map});
  }
  buildFacilities() {
    const groups=new Map(),matrix=new THREE.Matrix4(),obj=new THREE.Object3D();
    const box=new THREE.BoxGeometry(1,1,1),pyramid=new THREE.ConeGeometry(1,1,4);pyramid.rotateY(Math.PI/4);
    const add=(f,x,y,z,w,h,d,colour,roof=false)=>{
      const key=`${Math.floor(f.x/320)},${Math.floor(f.z/320)}`;
      if(!groups.has(key))groups.set(key,[]);
      const g=coloured(roof?pyramid:box,colour);
      obj.position.set(f.x+Math.cos(f.heading)*x+Math.sin(f.heading)*z,y,f.z-Math.sin(f.heading)*x+Math.cos(f.heading)*z);
      obj.rotation.set(0,f.heading,0);obj.scale.set(w,h,d);obj.updateMatrix();matrix.copy(obj.matrix);g.applyMatrix4(matrix);groups.get(key).push(g);
    };
    const p=this.plan.profile;
    for(const f of this.plan.facilities) {
      const district=!!f.district, width=district?45:33,depth=district?37:25;
      // Pad top -0.035 m, between terrain (-.06) and building bases (0).
      add(f,0,.0125,0,width,.025,depth,'#96988a');
      const count=district?3:2;
      for(let i=0;i<count;i++) {
        const x=(i-(count-1)/2)*(district?13:15),z=district?-5:-4;
        const h=activeTrack.id==='neon'?12+(f.index%4)*5:4.5+(f.index%3)*1.5;
        add(f,x,h/2,z,10,h,9,p.wall);
        const pitched=['oldtown','veloce','alpine','nordic','aurora','emerald','discovery'].includes(activeTrack.id);
        if(pitched)add(f,x,h+1.5,z,8.5,3,7.8,p.roof,true);
        else add(f,x,h+.25,z,11,.5,10,p.roof);
        // Real depth for fascias, recessed-looking doors and window strips.
        add(f,x,1.35,z+4.56,2.2,2.7,.14,'#34474b');
        for(const side of [-1,1])add(f,x+side*3.2,h*.6,z+4.56,2.2,1.15,.14,'#526c78');
        if(activeTrack.id==='neon')for(let y=5;y<h-1;y+=3.5)add(f,x,y,z+4.57,8,.45,.12,'#94bbc2');
      }
      // Ordered parking and footpath; not driveable/race vehicles.
      for(let i=0;i<(district?8:5);i++) {
        const x=(i-((district?8:5)-1)/2)*4.6,z=depth/2-4;
        add(f,x,.57,z,2,1.1,4.1,['#b9bcb0','#62788a','#9c655b','#d0c7ad'][i%4]);
        add(f,x,1.3,z-.25,1.7,.55,2.2,'#52636c');
        add(f,x+1.7,.03, z, .10,.01,5,'#d9d4bf');
      }
      add(f,0,.015,1,width,.03,1.5,'#c5c2af');
    }
    // Existing urban buildings gain roof detail and facades, not duplicate volumes.
    for(const b of this.cityBuildings) {
      const f={...b,heading:0};
      add(f,0,b.height+.3,0,24,.6,25,p.roof);
      for(let y=3;y<b.height-1;y+=3)
        for(const side of [-1,1])add(f,0,y,side*12.07,19,.65,.12,'#708e9a');
      if(activeTrack.id==='oldtown') add(f,0,b.height+3,0,18,6,19,p.roof,true);
    }
    for(const geos of groups.values()) {
      const g=mergeGeometries(geos,false);geos.forEach(g=>g.dispose());
      const mesh=this.addBatch(g);mesh.name='district-and-concourse';mesh.castShadow=true;
    }
    box.dispose();pyramid.dispose();
  }
  treeGeometry(far=false) {
    const p=this.plan.profile,h=p.height,parts=[];
    if(p.form==='rock') {
      const raw=new THREE.IcosahedronGeometry(1,0);raw.scale(h*.8,h*.5,h*.65);raw.translate(0,h*.38,0);
      // Rock bases penetrate the ground slightly; never float above it.
      parts.push(coloured(raw,p.foliage));raw.dispose();
    } else {
      const raw=new THREE.CylinderGeometry(.35,.65,h*.43,far?4:5);raw.translate(0,h*.215,0);parts.push(coloured(raw,'#71634e'));raw.dispose();
      const crown=p.form==='broad'?new THREE.IcosahedronGeometry(1,0):new THREE.ConeGeometry(1,1,far?4:7);
      if(p.form==='broad'){crown.scale(h*.31,h*.39,h*.31);crown.translate(0,h*.66,0);}
      else {crown.scale(h*.27,h*.85,h*.27);crown.translate(0,h*.575,0);}
      parts.push(coloured(crown,p.foliage));crown.dispose();
      if(!far&&p.form==='broad'){
        const branch=new THREE.IcosahedronGeometry(h*.23,0);branch.translate(h*.18,h*.54,0);parts.push(coloured(branch,p.foliage));branch.dispose();
      }
    }
    const g=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());return g;
  }
  buildVegetation() {
    const near=this.treeGeometry(),far=this.treeGeometry(true),groups=new Map();
    for(const p of this.plan.vegetation) {
      const key=`${Math.floor(p.x/320)},${Math.floor(p.z/320)}`;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);
    }
    const o=new THREE.Object3D(),color=new THREE.Color();
    for(const points of groups.values()) {
      const a=new THREE.InstancedMesh(near,this.material,points.length),b=new THREE.InstancedMesh(far,this.material,points.length);
      points.forEach((p,i)=>{o.position.set(p.x,-.06,p.z);o.rotation.y=p.heading;o.scale.setScalar(p.scale);o.updateMatrix();a.setMatrixAt(i,o.matrix);a.setColorAt(i,color.setRGB(p.tone,p.tone,p.tone));});
      b.instanceMatrix=a.instanceMatrix;b.instanceColor=a.instanceColor;
      a.computeBoundingSphere();b.computeBoundingSphere();a.castShadow=b.castShadow=true;a.receiveShadow=b.receiveShadow=true;
      a.name='vegetation-near';b.name='vegetation-far';this.root.add(a,b);b.visible=false;
      this.lods.push({near:a,far:b,centre:a.boundingSphere.center,radius:a.boundingSphere.radius});
    }
    if(!groups.size){near.dispose();far.dispose();}
  }
  update(camera,look,world) {
    const view=environmentView(camera.position.y,camera.position.distanceTo(look),this.plan.radius,this.view);
    // The circuit-selection preview intentionally retains its wide 6000 m frustum.
    // Dynamic clipping is for live race cameras; shrinking the preview breaks its far-end circuit view.
    if(world.mode!=='track-preview'&&(camera.near!==view.near||camera.far!==view.far)){camera.near=view.near;camera.far=view.far;camera.updateProjectionMatrix();}
    world.scene.fog.near=view.fogNear;world.scene.fog.far=Math.max(view.fogFar,this.plan.radius+2100);
    for(const cell of this.lods) {
      const distance=camera.position.distanceTo(cell.centre)-cell.radius;
      const limit=cell.near.visible?360:310;
      const near=distance<limit;cell.near.visible=near;cell.far.visible=!near;
    }
  }
}
