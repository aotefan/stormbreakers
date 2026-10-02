import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function woodTexture(deck: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = deck ? '#b89060' : '#29383c';
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 32) {
    ctx.fillStyle = deck ? `rgba(71,42,22,${.06 + (y % 96) / 900})` : `rgba(4,10,13,${.08 + (y % 96) / 700})`;
    ctx.fillRect(0,y,512,30);
    ctx.fillStyle = 'rgba(8,15,16,.38)';
    ctx.fillRect(0,y,512,1);
    for (let x = (y % 64) * 4; x < 512; x += 190) ctx.fillRect(x,y,1,30);
    ctx.strokeStyle = deck ? 'rgba(240,208,153,.16)' : 'rgba(163,136,98,.10)';
    for (let n = 0; n < 5; n++) {
      ctx.beginPath();ctx.moveTo(0,y+5+n*4);ctx.bezierCurveTo(180,y+n*4,300,y+10+n*4,512,y+5+n*4);ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  if (deck) texture.repeat.set(.35,.35);
  return texture;
}

function sailTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f6f0dc';ctx.fillRect(0,0,512,512);
  ctx.strokeStyle = 'rgba(151,123,78,.20)';ctx.lineWidth = 1;
  for (let x = 20; x < 512; x += 58) {ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+5,512);ctx.stroke();}
  ctx.strokeStyle = 'rgba(116,95,59,.16)';ctx.strokeRect(9,9,494,494);
  ctx.translate(256,278);
  ctx.strokeStyle = '#b79a56';ctx.lineWidth = 2;
  ctx.beginPath();ctx.arc(0,0,25,0,Math.PI*2);ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a=i*Math.PI/4,r=i%2?15:22;
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.sin(a)*r,Math.cos(a)*r);ctx.stroke();
  }
  ctx.fillStyle = '#65512e';ctx.font='italic 25px Georgia, serif';ctx.textAlign='center';ctx.fillText('Tina',0,54);
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function beam(z: number): number {
  if (z < -5) return THREE.MathUtils.lerp(1.65,2.3,(z+7)/2);
  if (z < 2.5) return 2.3 + .12*Math.sin((z+5)/7.5*Math.PI);
  return 2.32*Math.pow(Math.max(0,(7.4-z)/4.9),.58) + .04;
}
function sideWidth(z: number, y: number): number {
  const top = 3.1 + .22*Math.pow(Math.abs(z)/7.4,2);
  const t = THREE.MathUtils.clamp((top-y)/(top+.85),0,1);
  return beam(z)*Math.sqrt(1-Math.pow(t,2/.8));
}
function hullGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  const lengthSegments=40,sections=18;
  for (let i=0;i<=lengthSegments;i++) {
    const z=-7+14.4*i/lengthSegments;
    const top=3.1+.22*Math.pow(Math.abs(z)/7.4,2);
    for(let j=0;j<=sections;j++) {
      const angle=j/sections*Math.PI;
      positions.push(beam(z)*Math.cos(angle),top-(top+.85)*Math.pow(Math.sin(angle),.8),z);
      uv.push(i/lengthSegments,j/sections);
      if(i<lengthSegments&&j<sections) {
        const a=i*(sections+1)+j,b=a+sections+1;
        indices.push(a,b,a+1,b,b+1,a+1);
      }
    }
  }
  for(const end of [0,lengthSegments]) {
    const z=-7+14.4*end/lengthSegments,center=positions.length/3;
    positions.push(0,1.4,z);uv.push(end/lengthSegments,.5);
    for(let j=0;j<sections;j++) {
      const a=end*(sections+1)+j;
      indices.push(center,...(end===0?[a,a+1]:[a+1,a]));
    }
    const first=end*(sections+1),last=first+sections;
    indices.push(center,...(end===0?[last,first]:[first,last]));
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}
function billowingSail(width:number,height:number,z:number,top:number): THREE.BufferGeometry {
  const geometry=new THREE.PlaneGeometry(width,height,12,10);
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++) {
    const u=geometry.attributes.uv.getX(i),v=geometry.attributes.uv.getY(i);
    positions.setXYZ(i,(u-.5)*width,top-(1-v)*height+.20*Math.sin(u*Math.PI)*(1-v),z+.18+.72*Math.sin(u*Math.PI)*Math.sin(v*Math.PI));
  }
  geometry.computeVertexNormals();return geometry;
}

export function createWarship(accent: string): THREE.Group {
  const group=new THREE.Group();group.name='Sovereign three-deck warship';
  const materials={
    hull:new THREE.MeshStandardMaterial({color:'#9aa8ae',map:woodTexture(false),roughness:.64,side:THREE.DoubleSide}),
    deck:new THREE.MeshStandardMaterial({color:'#c6b392',map:woodTexture(true),roughness:.83}),
    timber:new THREE.MeshStandardMaterial({color:'#5e4026',roughness:.75}),
    gold:new THREE.MeshStandardMaterial({color:'#d9aa50',metalness:.55,roughness:.32}),
    metal:new THREE.MeshStandardMaterial({color:'#252c30',metalness:.65,roughness:.34}),
    port:new THREE.MeshStandardMaterial({color:'#0a151c',roughness:.88}),
    glass:new THREE.MeshStandardMaterial({color:'#365968',metalness:.28,roughness:.15}),
    canvas:new THREE.MeshStandardMaterial({color:'#ffffff',map:sailTexture(),side:THREE.DoubleSide,roughness:.93}),
    accent:new THREE.MeshStandardMaterial({color:accent,side:THREE.DoubleSide,roughness:.65}),
  };
  type MaterialName=keyof typeof materials;
  const batches=new Map<MaterialName,THREE.BufferGeometry[]>();
  const ropes:number[]=[];
  const add=(geometry:THREE.BufferGeometry,material:MaterialName,position?:THREE.Vector3,quaternion?:THREE.Quaternion)=> {
    if(quaternion)geometry.applyQuaternion(quaternion);
    if(position)geometry.translate(position.x,position.y,position.z);
    const batch=batches.get(material)??[];batch.push(geometry.index?geometry.toNonIndexed():geometry);batches.set(material,batch);
  };
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,material:MaterialName)=>add(new THREE.BoxGeometry(w,h,d),material,new THREE.Vector3(x,y,z));
  const spar=(a:THREE.Vector3,b:THREE.Vector3,r:number,material:MaterialName='timber')=> {
    const direction=b.clone().sub(a);
    add(new THREE.CylinderGeometry(r*.7,r,direction.length(),7),material,a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
  };
  const rope=(a:THREE.Vector3,b:THREE.Vector3)=>ropes.push(...a.toArray(),...b.toArray());
  add(hullGeometry(),'hull');
  const deckShape=new THREE.Shape();
  deckShape.moveTo(-beam(-7),7);
  for(let z=-7;z<=7.4;z+=.36)deckShape.lineTo(-beam(z),-z);
  deckShape.lineTo(0,-7.4);
  for(let z=7.4;z>=-7;z-=.36)deckShape.lineTo(beam(z),-z);
  deckShape.closePath();
  const deck=new THREE.ShapeGeometry(deckShape);deck.rotateX(-Math.PI/2);deck.translate(0,3.13,0);add(deck,'deck');
  box(0,3.9,-5.75,3.5,1.5,2.6,'hull');box(0,4.68,-5.75,3.62,.16,2.75,'deck');
  box(0,3.53,5.2,2.45,.65,2,'hull');box(0,3.9,5.2,2.5,.12,2.05,'deck');

  for(const side of [-1,1]) {
    for(const y of [.66,1.43,2.21,3.05]) {
      const points=Array.from({length:41},(_,i)=>{const z=-6.95+i*14.15/40;return new THREE.Vector3(side*(sideWidth(z,y)+.025),y+.08*Math.pow(z/7,2),z);});
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),40,.035,5,false),'gold');
    }
    for(const y of [1.03,1.81,2.59])for(let i=0;i<11;i++) {
      const z=-5.65+i*1.03,x=side*(sideWidth(z,y)+.05);
      box(x,y,z,.07,.43,.50,'port');
      for(const edge of [-1,1]) {
        box(x+side*.015,y+edge*.23,z,.08,.035,.54,'gold');
        box(x+side*.015,y,z+edge*.26,.08,.49,.035,'gold');
      }
      spar(new THREE.Vector3(x,y-.025,z),new THREE.Vector3(x+side*.65,y+.018,z),.10,'metal');
      add(new THREE.TorusGeometry(.105,.023,5,9),'metal',new THREE.Vector3(x+side*.64,y+.018,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));
      box(x+side*.03,y+.34,z,.06,.19,.47,'timber');
    }
    for(let z=-6.5;z<=6.5;z+=.6) {
      const x=side*beam(z),y=3.26+(z<-4.4?1.5:z>4.25?.7:0);
      spar(new THREE.Vector3(x,y,z),new THREE.Vector3(x,y+.40,z),.025,'gold');
      if(z<6.1)spar(new THREE.Vector3(x,y+.4,z),new THREE.Vector3(side*beam(z+.6),y+.4,z+.6),.035,'timber');
    }
    for(const z of [-3.4,-1.9,1.5,3]) {
      box(side*1.6,3.3,z,.48,.26,.6,'timber');
      spar(new THREE.Vector3(side*1.45,3.65,z),new THREE.Vector3(side*2.65,3.66,z),.13,'metal');
      for(const dz of [-.22,.22])add(new THREE.CylinderGeometry(.16,.16,.09,8),'timber',new THREE.Vector3(side*1.55,3.28,z+dz),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2));
    }
  }
  for(const y of [3.32,4.05,4.66]) {
    box(0,y,-7.12,3.75,.08,.13,'gold');
    for(let x=-1.45;x<=1.46;x+=.58) {
      box(x,y+.24,-7.08,.43,.38,.08,'glass');
      for(const dx of [-.24,0,.24])box(x+dx,y+.24,-7.16,.025,.43,.05,'gold');
      for(const dy of [-.21,.21])box(x,y+.24+dy,-7.16,.5,.028,.05,'gold');
    }
    for(const side of [-1,1]) {
      box(side*1.82,y+.25,-5.7,.08,.42,1.8,'glass');
      for(let z=-6.55;z<=-4.8;z+=.32)box(side*1.89,y+.25,z,.05,.43,.025,'gold');
      box(side*1.88,y+.04,-5.7,.05,.035,1.85,'gold');
      box(side*1.88,y+.46,-5.7,.05,.035,1.85,'gold');
    }
  }
  add(new THREE.TorusGeometry(.29,.05,7,18),'gold',new THREE.Vector3(0,4.88,-7.2));
  add(new THREE.SphereGeometry(.22,10,8),'gold',new THREE.Vector3(0,3.25,7.8));
  const figurehead=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.6,7.1),new THREE.Vector3(0,1.3,7.9),new THREE.Vector3(0,2.7,8.0),new THREE.Vector3(0,3.3,7.8)]);
  add(new THREE.TubeGeometry(figurehead,14,.10,7,false),'gold');
  for(const side of [-1,1])add(new THREE.TorusGeometry(.34,.037,5,14,Math.PI*1.6),'gold',new THREE.Vector3(side*.35,2.7,7.35));
  spar(new THREE.Vector3(0,3.75,5.6),new THREE.Vector3(0,6.4,11.9),.105);
  spar(new THREE.Vector3(0,2.5,7.6),new THREE.Vector3(0,4.5,10.2),.045,'gold');
  for(const side of [-1,1])rope(new THREE.Vector3(side*1.25,3.7,5.6),new THREE.Vector3(0,6.4,11.9));

  const masts=[{z:-4.5,height:13.5,width:4.5},{z:0,height:17.8,width:6.8},{z:4.2,height:16.2,width:6.1}];
  for(const [index,mast] of masts.entries()) {
    spar(new THREE.Vector3(0,3.2,mast.z),new THREE.Vector3(0,mast.height,mast.z),.145);
    const levels=index===0?[{y:12.8,w:2.7,h:1.9},{y:10.5,w:3.7,h:2.5},{y:7.5,w:4.5,h:3.0}]:[{y:mast.height-1,w:mast.width*.48,h:2.1},{y:mast.height-3.65,w:mast.width*.75,h:2.8},{y:mast.height-7.1,w:mast.width,h:3.8}];
    for(const sail of levels) {
      spar(new THREE.Vector3(-sail.w*.54,sail.y,mast.z),new THREE.Vector3(sail.w*.54,sail.y,mast.z),.075);
      add(billowingSail(sail.w,sail.h,mast.z,sail.y),'canvas');
      for(const side of [-1,1])rope(new THREE.Vector3(side*sail.w*.5,sail.y-sail.h,mast.z+.2),new THREE.Vector3(side*1.8,3.5,mast.z+1.2));
    }
    const lookoutY=mast.height-6.4;
    add(new THREE.CylinderGeometry(.65,.42,.23,12),'timber',new THREE.Vector3(0,lookoutY,mast.z));
    add(new THREE.TorusGeometry(.62,.028,5,18),'gold',new THREE.Vector3(0,lookoutY+.38,mast.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2));
    for(const side of [-1,1])for(const offset of [-.8,.8])rope(new THREE.Vector3(side*2.1,3.3,mast.z+offset),new THREE.Vector3(0,lookoutY+.2,mast.z));
    for(let y=3.9;y<lookoutY;y+=.46)for(const side of [-1,1]) {
      const taper=1-(y-3.3)/(lookoutY-3.3);
      rope(new THREE.Vector3(side*2.1*taper,y,mast.z-.8*taper),new THREE.Vector3(side*2.1*taper,y,mast.z+.8*taper));
    }
    const flag=new THREE.PlaneGeometry(1.15,.45,4,1);const p=flag.attributes.position;
    for(let i=0;i<p.count;i++){p.setXYZ(i,p.getX(i)+.63,p.getY(i)+mast.height-.18,mast.z+Math.sin(p.getX(i)*6)*.14);}
    flag.computeVertexNormals();add(flag,'accent');
  }
  rope(new THREE.Vector3(0,16,4.2),new THREE.Vector3(0,6.4,11.9));
  rope(new THREE.Vector3(0,17.5,0),new THREE.Vector3(0,15.7,4.2));
  rope(new THREE.Vector3(0,13.2,-4.5),new THREE.Vector3(0,17.5,0));
  const jib=new THREE.BufferGeometry();jib.setAttribute('position',new THREE.Float32BufferAttribute([0,14.8,4.6,.08,6.7,11.3,.10,6.6,5.9],3));
  jib.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,0,0,0],2));jib.computeVertexNormals();add(jib,'canvas');
  const smallJib=new THREE.BufferGeometry();smallJib.setAttribute('position',new THREE.Float32BufferAttribute([0,11.2,5.2,.04,6.5,11.8,.04,6.4,8.0],3));
  smallJib.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,0,0,0],2));smallJib.computeVertexNormals();add(smallJib,'canvas');
  box(0,3.3,2.1,1.1,.22,1.25,'timber');box(0,3.44,2.1,.85,.08,1.02,'metal');
  for(const [name,geometries] of batches) {
    const merged=mergeGeometries(geometries,false)!;
    const mesh=new THREE.Mesh(merged,materials[name]);mesh.name=`warship-${name}`;mesh.castShadow=name!=='glass';mesh.receiveShadow=true;group.add(mesh);
    for(const geometry of geometries)geometry.dispose();
  }
  const rigging=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(ropes,3)),new THREE.LineBasicMaterial({color:'#3f382b',transparent:true,opacity:.65}));
  rigging.name='standing and running rigging';group.add(rigging);
  return group;
}
