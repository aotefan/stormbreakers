import * as THREE from 'three';
import type { Quality, StormCellState } from '../../shared/protocol';

const HEIGHT = 32;
const noise = `
  float hash(vec3 p) {
    p = fract(p * .1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float cloudNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)),f.x),
                   mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                   mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float cloud(vec3 p) {
    return cloudNoise(p)*.57 + cloudNoise(p*2.03+11.7)*.29 + cloudNoise(p*4.11+23.1)*.14;
  }
`;
const colorOutput = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

function radiusAt(t: number) {
  return .15 + .16 * t + .64 * Math.pow(t, 4.6);
}

/** A cloud funnel, orbiting cloud puffs, sea spray and a readable surface footprint. */
export function createTornado(quality: Quality, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'waterspout';
  // Transparent billboards are kept out of the planar reflection pass to bound overdraw.
  group.userData.skipReflection = true;
  const time = { value: 0 };
  group.userData.time = time;
  group.userData.seed = seed;
  const segments = quality === 'low' ? 48 : 72, rows = quality === 'low' ? 48 : 80;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let y = 0; y <= rows; y++) {
    const t = y / rows;
    for (let x = 0; x <= segments; x++) {
      const angle = x / segments * Math.PI * 2;
      const ridge = 1 + .05 * Math.sin(angle * 5 - t * 38) + .035 * Math.sin(angle * 9 + t * 21);
      const r = radiusAt(t) * ridge;
      positions.push(Math.cos(angle) * r + Math.sin(t * 4 + seed) * .04 * t,
        t * HEIGHT + .35, Math.sin(angle) * r + Math.cos(t * 3 + seed) * .04 * t);
      uvs.push(x / segments, t);
      if (x < segments && y < rows) {
        const a = y * (segments + 1) + x, b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const funnelGeometry = new THREE.BufferGeometry();
  funnelGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  funnelGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  funnelGeometry.setIndex(indices);
  const funnelMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uSeed: { value: seed } },
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float angle = uTime * .64 + uv.y * .3;
        mat2 spin = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        p.xz = spin * p.xz;
        p.xz *= 1.0 + .028 * sin(uv.y * 17.0 - uTime * 2.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime, uSeed;
      varying vec2 vUv;
      ${noise}
      void main() {
        float theta = vUv.x * 6.283185 + vUv.y * 13.0 - uTime * .82;
        vec3 samplePoint = vec3(cos(theta)*3.5, vUv.y*17.0-uTime*.9, sin(theta)*3.5+uSeed);
        float n = cloud(samplePoint);
        float curl = sin(theta * 3.0 - vUv.y * 48.0 + n * 6.0) * .5 + .5;
        float detail = cloud(samplePoint*2.3 + vec3(0,uTime*.4,0));
        float light = .22 + .20*cos(theta+1.2) + .42*n + .08*curl;
        vec3 shade = mix(vec3(.018,.027,.039), vec3(.30,.36,.39), clamp(light,0.0,1.0));
        shade *= .64 + .48*detail;
        float alpha = (.64 + n*.30) * smoothstep(0.0,.055,vUv.y) * (1.0-smoothstep(.90,1.0,vUv.y));
        gl_FragColor = vec4(shade,alpha);
        ${colorOutput}
      }
    `,
  });
  const funnel = new THREE.Mesh(funnelGeometry, funnelMaterial);
  funnel.name = 'spiral-cloud-funnel';
  funnel.renderOrder = 1;
  group.add(funnel);

  // One instanced draw for the soft, irregular silhouette instead of individual cloud meshes.
  const count = quality === 'low' ? 180 : quality === 'high' ? 420 : 300;
  const clouds = new THREE.InstancedBufferGeometry();
  const plane = new THREE.PlaneGeometry(1, 1);
  clouds.index = plane.index;
  clouds.setAttribute('position', plane.attributes.position);
  clouds.setAttribute('uv', plane.attributes.uv);
  const orbit: number[] = [], sizes: number[] = [];
  let randomState = (seed + 1) * 1039;
  const random = () => {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const cap = i < count * .34, mist = i >= count * .80;
    const t = cap ? .88 + random() * .15 : mist ? .012 + random() * .13 : .08 + random() * .83;
    const angle = cap || mist ? random() * Math.PI * 2 : t * 26 + (i % 3) * Math.PI * 2 / 3 + random() * .45;
    const r = cap ? .25 + Math.sqrt(random()) * .78 : mist ? .18 + random() * .72 : radiusAt(t) * (.86 + random() * .25);
    orbit.push(angle, t * HEIGHT, r, random() * 12);
    sizes.push(cap ? 6.0 + random() * 3.2 : mist ? 2.4 + random() * 3.1 : 2.2 + t * 3.0 + random() * 1.7,
      cap ? 4.6 + random() * 2.6 : mist ? 1.5 + random() * 2.1 : 2.5 + random() * 1.8,
      cap ? 2 : mist ? 1 : 0);
  }
  clouds.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(new Float32Array(orbit), 4));
  clouds.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 3));
  clouds.instanceCount = count;
  const cloudMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: time }, transparent: true, depthWrite: false,
    vertexShader: `
      attribute vec4 aOrbit;
      attribute vec3 aSize;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vCloud;
      void main() {
        vUv = uv;
        float angle = aOrbit.x + uTime*.7 - aOrbit.y*.15 + sin(uTime*.2+aOrbit.y*.09)*.18;
        vec3 p = vec3(cos(angle)*aOrbit.z, aOrbit.y + sin(angle*2.0+aOrbit.w)*.6, sin(angle)*aOrbit.z);
        vec4 center = modelViewMatrix * vec4(p,1.0);
        float scale = length(modelMatrix[0].xyz)/13.0;
        center.xy += position.xy * aSize.xy * scale;
        gl_Position = projectionMatrix * center;
        vCloud = vec3(aOrbit.w, .40+.26*cos(angle+1.2)+.10*aOrbit.y/32.0, aSize.z);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vCloud;
      ${noise}
      void main() {
        vec2 p = vUv*2.0-1.0;
        float n = cloud(vec3(p*2.3+vCloud.x, uTime*.24+vCloud.x));
        float rim = length(p) + (n-.5)*.30;
        float alpha = (1.0-smoothstep(.45,.98,rim)) * (.45+.45*n);
        float mist=step(.5,vCloud.z)*(1.0-step(1.5,vCloud.z));
        float cap=step(1.5,vCloud.z);
        alpha *= mix(.52,1.0,cap);
        if (alpha < .012) discard;
        float detail = cloud(vec3(p*5.0+vCloud.x,uTime*.3));
        float dome=sqrt(max(0.0,1.0-dot(p,p)));
        float light=vCloud.y*.65 + dome*.23 + (p.y-p.x)*.12 + (n-.5)*.65 + detail*.12;
        vec3 shade = mix(vec3(.035,.05,.067),vec3(.34,.41,.44),clamp(light,0.0,1.0));
        shade = mix(shade,vec3(.62,.76,.78),mist*.55);
        gl_FragColor = vec4(shade,alpha);
        ${colorOutput}
      }
    `,
  });
  const billboards = new THREE.Mesh(clouds, cloudMaterial);
  billboards.name = 'orbiting-clouds-and-mist';
  billboards.frustumCulled = false;
  // Their shader moves vertices far above the origin; automatic depth sorting would
  // incorrectly draw the entire cloud layer behind the funnel's bounding-box center.
  billboards.renderOrder = 2;
  group.add(billboards);

  const surfaceMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: time }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main() {vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      ${noise}
      void main() {
        vec2 p = vUv*2.0-1.0;
        float r=length(p), angle=atan(p.y,p.x);
        float n=cloud(vec3(p*7.0,uTime*.32));
        float curl=sin(angle*5.0-r*28.0+uTime*3.0+n*4.0)*.5+.5;
        float edge=(1.0-smoothstep(.82,1.0,r))*smoothstep(.06,.18,r);
        float foam=pow(curl,5.0)*(.18+.38*r)+pow(sin(r*44.0-uTime*3.0+n*3.0)*.5+.5,9.0)*.18;
        gl_FragColor=vec4(mix(vec3(.07,.19,.22),vec3(.72,.89,.88),foam*1.5),edge*(.14+foam*.42));
        ${colorOutput}
      }
    `,
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), surfaceMaterial);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = .38;
  surface.name = 'swirling-sea-footprint';
  group.add(surface);

  const sprayGeometry = new THREE.BufferGeometry();
  const spray: number[] = [], seeds: number[] = [];
  for (let i = 0; i < (quality === 'low' ? 50 : 110); i++) {
    spray.push(0, 0, 0);
    seeds.push(random(), random(), random());
  }
  sprayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spray, 3));
  sprayGeometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 3));
  const sprayMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) } },
    transparent: true, depthWrite: false,
    vertexShader: `
      attribute vec3 aSeed;
      uniform float uTime,uPixelRatio;
      varying float vAlpha;
      void main() {
        float life=fract(aSeed.x+uTime*.18);
        float angle=aSeed.y*6.283185+uTime*1.6+life*7.0;
        float r=.16+aSeed.z*.45*(1.0-life);
        vec3 p=vec3(cos(angle)*r, .6+life*life*18.0, sin(angle)*r);
        vec4 view=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp(65.0/-view.z,1.0,3.0)*uPixelRatio;
        vAlpha=sin(life*3.14159)*.6;
      }
    `,
    fragmentShader: `varying float vAlpha; void main() {
      float a=(1.0-smoothstep(.15,.5,length(gl_PointCoord-.5)))*vAlpha;
      gl_FragColor=vec4(.74,.9,.91,a);
      ${colorOutput}
    }`,
  });
  const droplets = new THREE.Points(sprayGeometry, sprayMaterial);
  droplets.name = 'rising-sea-spray';
  droplets.frustumCulled = false;
  group.add(droplets);
  group.userData.cloudCount = count;
  return group;
}

export function updateTornado(group: THREE.Group, storm: StormCellState, now: number): void {
  group.position.set(storm.x, 0, storm.z);
  group.scale.set(storm.radius, 1, storm.radius);
  group.userData.time.value = now + group.userData.seed * 7;
}
