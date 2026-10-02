import * as THREE from 'three';
import type { IslandState } from '../../shared/protocol';

export function createOcean(): THREE.Mesh {
  const geometry=new THREE.PlaneGeometry(600,600,100,100);
  geometry.rotateX(-Math.PI/2);
  const material=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uIslands:{value:Array.from({length:6},()=>new THREE.Vector3(0,0,0))}},
    vertexShader:`
      uniform float uTime;
      varying vec3 vWorld;
      void main() {
        vec3 p=position;
        p.y=sin(p.x*.13+uTime*.55)*.24+cos(p.z*.19-uTime*.6)*.18+sin((p.x+p.z)*.31+uTime)*.07;
        vWorld=(modelMatrix*vec4(p,1.)).xyz;
        gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
      }`,
    fragmentShader:`
      uniform float uTime;
      uniform vec3 uIslands[6];
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p) {
        vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(cell),hash(cell+vec2(1.,0.)),f.x),mix(hash(cell+vec2(0.,1.)),hash(cell+vec2(1.,1.)),f.x),f.y);
      }
      void main() {
        vec2 p=vWorld.xz;
        float ripple=sin(p.x*.92+p.y*1.13+uTime*1.1)*.15+sin(p.x*1.8-p.y*.8-uTime*1.3)*.09;
        vec3 n=normalize(vec3(-cos(p.x*.13+uTime*.55)*.13*.24-ripple,1.,sin(p.y*.19-uTime*.6)*.19*.18+ripple*.5));
        float shore=0.,foam=0.;
        for(int i=0;i<6;i++) {
          if(uIslands[i].z>.1) {
            vec2 delta=p-uIslands[i].xy;
            float angle=atan(delta.y,delta.x);
            float phase=uIslands[i].x*.11;
            float radius=uIslands[i].z*(.89+.05*sin(angle*3.+phase)+.04*cos(angle*5.-phase)+.025*sin(angle*9.+phase));
            float d=length(delta)-radius;
            shore=max(shore,1.-smoothstep(0.,5.,d));
            float crest=abs(d-.36-sin(angle*14.+uTime*1.2)*.17);
            foam=max(foam,(1.-smoothstep(.06,.21,crest))*(.20+.60*noise(p*1.4+uTime*.08)));
          }
        }
        float swell=.5+.5*sin(p.x*.047-p.y*.083+uTime*.12);
        vec3 water=mix(vec3(.006,.035,.068),vec3(.010,.11,.16),swell*.55+.20);
        water=mix(water,vec3(.018,.22,.21),shore*.84);
        vec3 viewDirection=normalize(cameraPosition-vWorld);
        vec3 sunlight=normalize(vec3(-.25,.82,-.55));
        float specular=pow(max(dot(reflect(-sunlight,n),viewDirection),0.),90.);
        float glitter=pow(max(0.,sin(p.x*.92+p.y*1.7+noise(p*.28)*5.+uTime*.8)*cos(p.y*2.1-p.x*.7+noise(p*.37)*4.-uTime*.7)),12.);
        float sparkle=glitter*(.08+.16*noise(p*.8));
        water+=vec3(.90,.84,.65)*specular*.55+vec3(.24,.43,.47)*sparkle;
        float fresnel=pow(1.-max(dot(viewDirection,n),0.),4.);
        water=mix(water,vec3(.26,.44,.51),fresnel*.45);
        water=mix(water,vec3(.63,.79,.72),foam);
        gl_FragColor=vec4(water,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.name='procedural reflective sea';return mesh;
}

function islandBand(radius:number,inner:number,outer:number,low:number,high:number,phase:number): THREE.BufferGeometry {
  const positions:number[]=[],indices:number[]=[];
  const segments=32;
  for(let ring=0;ring<2;ring++)for(let i=0;i<=segments;i++) {
    const angle=i/segments*Math.PI*2;
    const shape=.89+.05*Math.sin(angle*3+phase)+.04*Math.cos(angle*5-phase)+.025*Math.sin(angle*9+phase);
    const ratio=ring?inner:outer;
    const r=radius*ratio*shape;
    const level=ring?high:low;
    const y=level+(level>.4?(Math.sin(angle*3+phase)*.20+Math.cos(angle*5-phase)*.12)*radius*ratio:0);
    positions.push(Math.cos(angle)*r+(1-ratio)*.12*radius,y,Math.sin(angle)*r);
    if(ring===0&&i<segments){const a=i,b=i+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function createRockIsland(island:IslandState): THREE.Group {
  const group=new THREE.Group();const r=island.radius,phase=island.x*.11;
  const sand=new THREE.MeshStandardMaterial({color:'#c8bd96',roughness:.96,flatShading:true});
  const stone=new THREE.MeshStandardMaterial({color:'#596b6d',roughness:.88,flatShading:true});
  const lightStone=new THREE.MeshStandardMaterial({color:'#72817d',roughness:.92,flatShading:true});
  const grass=new THREE.MeshStandardMaterial({color:'#41644b',roughness:1,flatShading:true});
  const bands=[
    {inner:.83,outer:1,low:-.3,high:.32,mat:sand},
    {inner:.65,outer:.83,low:.32,high:r*.33,mat:stone},
    {inner:.43,outer:.65,low:r*.33,high:r*.52,mat:lightStone},
    {inner:.18,outer:.43,low:r*.52,high:r*.60,mat:grass},
    {inner:0,outer:.18,low:r*.60,high:r*.57,mat:grass},
  ];
  for(const band of bands) {
    const mesh=new THREE.Mesh(islandBand(r,band.inner,band.outer,band.low,band.high,phase),band.mat);
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  const foliage=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#355d42',roughness:1,flatShading:true}),18);
  const boulders=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),stone,10);
  const transform=new THREE.Object3D();
  for(let i=0;i<18;i++) {
    const angle=i*2.4+phase,d=r*(.17+.18*((i%5)/5));
    transform.position.set(Math.cos(angle)*d+.10*r,r*.55+Math.sin(angle*3+phase)*r*.04,Math.sin(angle)*d);
    transform.scale.set(.6+(i%3)*.25,.65+(i%4)*.3,.7+(i%3)*.24);transform.rotation.set(.1,angle,.1);transform.updateMatrix();foliage.setMatrixAt(i,transform.matrix);
  }
  for(let i=0;i<10;i++) {
    const angle=i/10*Math.PI*2,d=r*(.83+.09*Math.sin(angle*7+phase));
    transform.position.set(Math.cos(angle)*d,.38,Math.sin(angle)*d);
    transform.scale.set(.45+(i%3)*.25,.65+(i%4)*.25,.5+(i%2)*.35);transform.rotation.set(.15,angle,.3);transform.updateMatrix();boulders.setMatrixAt(i,transform.matrix);
  }
  foliage.castShadow=boulders.castShadow=true;group.add(foliage,boulders);
  if(island.id==='island-a') {
    const wood=new THREE.MeshStandardMaterial({color:'#7d6b48',roughness:.85});
    const pier=new THREE.Mesh(new THREE.BoxGeometry(1.1,.15,r*.42),wood);pier.position.set(.8,.66,r*.69);group.add(pier);
    for(const side of [-1,1])for(const z of [r*.51,r*.83]) {const post=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,1.5,6),wood);post.position.set(.8+side*.54,.15,z);group.add(post);}
  }
  group.position.set(island.x,0,island.z);group.name='layered rock island';return group;
}

export function createHorizon(): THREE.Group {
  const group=new THREE.Group();
  for(const [index,p] of [[-150,-150,17],[155,-170,23],[-165,155,20],[180,135,16]].entries()) {
    group.add(createRockIsland({id:`horizon-${index}`,x:p[0],z:p[1],radius:p[2]}));
  }
  const cloudMaterial=new THREE.MeshStandardMaterial({color:'#f0f5f0',transparent:true,opacity:.50,depthWrite:false,roughness:1});
  for(let i=0;i<5;i++) {
    const cloud=new THREE.Group();
    for(let j=0;j<4;j++) {const puff=new THREE.Mesh(new THREE.SphereGeometry(4,10,7),cloudMaterial);puff.position.set(j*4,Math.sin(j)*1.2,0);puff.scale.set(1.4,.55,.8);cloud.add(puff);}
    cloud.position.set(-180+i*90,22,-270);cloud.name='horizon cloud';group.add(cloud);
  }
  return group;
}
