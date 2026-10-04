import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { BoatState, GameEvent, GameState, Quality, Vec2 } from '../../shared/protocol';
import { createWarship, updateWarshipCaptain, updateWarshipDamage } from './warship';
import { createHorizon, createOcean, createRockIsland } from './ocean';
import { RESPAWN_SECONDS, SUPPLY_BOX_LIFETIME } from '../../shared/simulation';

interface Props {
  state: GameState | null;
  boatId: string;
  quality: Quality;
  dragTarget?: Vec2 | null;
  onWorldPointer?: (event: { type: 'start' | 'move' | 'end'; pointerId: number; world?: Vec2; clientX: number; clientY: number; cancelled?: boolean }) => void;
}

interface BoatRender {
  group: THREE.Group;
  hp: THREE.Mesh;
  wake: THREE.Mesh[];
  lastFoam: number;
}

interface Particle {
  mesh: THREE.Object3D;
  life: number;
  max: number;
  vx: number;
  vz: number;
  vy: number;
  grow?: boolean;
}

interface SceneRuntime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  water: THREE.Mesh;
  boats: Map<string, BoatRender>;
  balls: Map<string, THREE.Mesh>;
  chests: Map<string, THREE.Object3D>;
  storms: Map<string, THREE.Mesh>;
  islands: Map<string, THREE.Object3D>;
  particles: Particle[];
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  plane: THREE.Plane;
  lastTick: number;
  targetMarker: THREE.Mesh;
}

export default function StormScene({ state, boatId, quality, dragTarget, onWorldPointer }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SceneRuntime | undefined>(undefined);
  const pointerHandlerRef = useRef(onWorldPointer);
  pointerHandlerRef.current = onWorldPointer;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#b4d6dc');
    scene.fog = new THREE.Fog('#a8cecc', 130, 280);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    camera.position.set(0, 55, 60);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = quality === 'high';
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight('#d8f5ff', '#35575c', 1.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff1d1', 2.3);
    sun.position.set(-45, 70, -30);
    sun.castShadow = true;
    scene.add(sun);

    const water = createOcean(quality);
    scene.add(water);
    scene.add(createHorizon());

    const targetMarker = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 2.4, 48),
      new THREE.MeshBasicMaterial({ color: '#f0b84b', transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
    );
    targetMarker.rotation.x = -Math.PI / 2;
    targetMarker.visible = false;
    targetMarker.userData.skipReflection=true;
    scene.add(targetMarker);

    const runtime = {
      renderer,
      scene,
      camera,
      water,
      boats: new Map<string, BoatRender>(),
      balls: new Map<string, THREE.Mesh>(),
      chests: new Map<string, THREE.Object3D>(),
      storms: new Map<string, THREE.Mesh>(),
      islands: new Map<string, THREE.Object3D>(),
      particles: [] as Particle[],
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      lastTick: -1,
      targetMarker,
    };
    runtimeRef.current = runtime;

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      // Keep full ship geometry while bounding fragment work on retina tablets.
      const pixelBudget=quality==='high'?3_000_000:quality==='low'?900_000:1_500_000;
      const budgetRatio=Math.sqrt(pixelBudget/Math.max(1,rect.width*rect.height));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio,quality==='high'?2:quality==='low'?1:1.35,budgetRatio));
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
    };
    const toWorld = (event: PointerEvent): Vec2 | undefined => {
      const rect = renderer.domElement.getBoundingClientRect();
      const width = rect.width || window.innerWidth || 1;
      const height = rect.height || window.innerHeight || 1;
      runtime.pointer.x = ((event.clientX - rect.left) / width) * 2 - 1;
      runtime.pointer.y = -((event.clientY - rect.top) / height) * 2 + 1;
      runtime.raycaster.setFromCamera(runtime.pointer, camera);
      const hit = new THREE.Vector3();
      runtime.raycaster.ray.intersectPlane(runtime.plane, hit);
      if (!Number.isFinite(hit.x)) return undefined;
      return { x: hit.x, z: hit.z };
    };
    const pointerStart = (event: PointerEvent) => {
      event.preventDefault();
      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic mobile QA events may not have an active browser pointer capture.
      }
      pointerHandlerRef.current?.({ type: 'start', pointerId: event.pointerId, world: toWorld(event), clientX: event.clientX, clientY: event.clientY });
    };
    const pointerMove = (event: PointerEvent) => {
      event.preventDefault();
      pointerHandlerRef.current?.({ type: 'move', pointerId: event.pointerId, world: toWorld(event), clientX: event.clientX, clientY: event.clientY });
    };
    const pointerEnd = (event: PointerEvent) => {
      event.preventDefault();
      pointerHandlerRef.current?.({ type: 'end', pointerId: event.pointerId, world: toWorld(event), clientX: event.clientX, clientY: event.clientY, cancelled: event.type === 'pointercancel' });
    };
    renderer.domElement.addEventListener('pointerdown', pointerStart, { passive: false });
    renderer.domElement.addEventListener('pointermove', pointerMove, { passive: false });
    renderer.domElement.addEventListener('pointerup', pointerEnd, { passive: false });
    renderer.domElement.addEventListener('pointercancel', pointerEnd, { passive: false });
    window.addEventListener('resize', resize);
    resize();

    let raf = 0;
    let previousSimulationTime=0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const simulationTime=runtime.water.userData.simulationTime??0;
      const dt=Math.min(.1,Math.max(0,simulationTime-previousSimulationTime));
      previousSimulationTime=simulationTime;
      (runtime.water.material as THREE.ShaderMaterial).uniforms.uTime.value = simulationTime;
      for (const particle of runtime.particles) {
        particle.life -= dt;
        particle.mesh.position.x += particle.vx * dt;
        particle.mesh.position.z += particle.vz * dt;
        particle.mesh.position.y += particle.vy * dt;
        if (particle.mesh.userData.waveRing) particle.mesh.scale.setScalar(1 + (1 - particle.life / particle.max) * 3);
        else if (particle.grow !== false) particle.mesh.scale.multiplyScalar(Math.pow(1.012,dt*60));
        if (particle.mesh.userData.debris) particle.mesh.position.y = .3 + Math.sin(simulationTime * 2 + particle.mesh.id) * .12;
        const mat = getMaterial(particle.mesh);
        if (mat) mat.opacity = Math.max(0, particle.life / particle.max);
      }
      runtime.particles = runtime.particles.filter((particle) => {
        if (particle.life > 0) return true;
        scene.remove(particle.mesh);
        disposeObject(particle.mesh);
        return false;
      });
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', pointerStart);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerEnd);
      renderer.domElement.removeEventListener('pointercancel', pointerEnd);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
          if(material instanceof THREE.ShaderMaterial)for(const uniform of Object.values(material.uniforms))if(uniform.value instanceof THREE.Texture)textures.add(uniform.value);
        }
      });
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      mount.removeChild(renderer.domElement);
      water.getRenderTarget().dispose();
      renderer.dispose();
    };
  }, [quality]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !state) return;
    if (state.tick < runtime.lastTick) {
      for (const particle of runtime.particles) {
        runtime.scene.remove(particle.mesh);
        disposeObject(particle.mesh);
      }
      runtime.particles = [];
    }
    runtime.water.userData.simulationTime=state.now;
    syncIslands(runtime, state);
    syncChests(runtime, state);
    syncStorms(runtime, state);
    syncBalls(runtime, state);
    syncBoats(runtime, state, boatId);
    if (runtime.lastTick !== state.tick) {
      spawnEventParticles(runtime, state.events);
      runtime.lastTick = state.tick;
    }
    const player = state.boats.find((boat) => boat.id === boatId);
    if (player) {
      runtime.camera.position.lerp(new THREE.Vector3(player.x, 55, player.z + 60), 0.045);
      runtime.camera.lookAt(player.x, 0, player.z);
    }
  }, [boatId, quality, state]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.targetMarker.visible = !!dragTarget;
    if (dragTarget) runtime.targetMarker.position.set(dragTarget.x, 0.08, dragTarget.z);
  }, [dragTarget]);

  return <div className="scene" ref={mountRef} data-testid="storm-scene" />;
}


function makeBoat(boat: BoatState): BoatRender {
  const group = createWarship(boat.color,boat.name);
  const hp = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: '#7df2b7' }));
  hp.position.set(0, 19, 0);
  hp.userData.skipReflection=true;
  group.add(hp);
  const canvas = document.createElement('canvas');
  canvas.width = 64;canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < 256; y += 2) {
    ctx.fillStyle = `rgba(245,255,249,${Math.pow(y/256,1.4)*.75})`;
    ctx.fillRect(18+Math.sin(y*.17)*6,y,25,2);
  }
  const wakeTexture = new THREE.CanvasTexture(canvas);
  const wake = [-1, 1].map((side) => {
    const geometry = new THREE.PlaneGeometry(.35, 11, 1, 12);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      position.setX(i, position.getX(i) + side * (1.3 + (5.5-position.getZ(i))*.07));
    }
    const material = new THREE.MeshBasicMaterial({ color: '#f4fff7', map: wakeTexture, transparent: true, opacity: .44, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.skipReflection=true;
    mesh.position.set(0, .35, -12.5);group.add(mesh);return mesh;
  });
  return { group, hp, wake, lastFoam: -Infinity };
}


function syncBoats(runtime: SceneRuntime, state: GameState, playerBoatId: string) {
  const ids = new Set(state.boats.map((boat) => boat.id));
  for (const [id, render] of runtime.boats) {
    if (!ids.has(id)) {
      runtime.scene.remove(render.group);
      disposeObject(render.group);
      runtime.boats.delete(id);
    }
  }
  for (const boat of state.boats) {
    let render = runtime.boats.get(boat.id);
    if (!render) {
      render = makeBoat(boat);
      runtime.boats.set(boat.id, render);
      runtime.scene.add(render.group);
    }
    updateWarshipCaptain(render.group,boat.name);
    const damage = updateWarshipDamage(render.group, boat.hp, boat.maxHp, boat.hullHits);
    const sinking = boat.hp <= 0 && boat.sunkUntil > state.now;
    const sinkProgress = sinking ? THREE.MathUtils.clamp(1 - (boat.sunkUntil - state.now) / RESPAWN_SECONDS, 0, 1) : 0;
    const sinkDepth = sinkProgress * sinkProgress * (3 - 2 * sinkProgress) * 25;
    const leanSide = -(boat.hullHits?.at(-1)?.side ?? 1);
    render.group.userData.sinkProgress = sinkProgress;
    render.group.position.set(boat.x, bob(state.now + boat.x) - damage * .65 - sinkDepth, boat.z);
    render.group.rotation.y = boat.angle;
    render.group.rotation.x = Math.sin(state.now * 1.4 + boat.x) * .012 + damage * .045 + sinkProgress * .25;
    render.group.rotation.z = Math.cos(state.now * 1.1 + boat.z) * .009 + damage * .17 + leanSide * sinkProgress * .85;
    render.group.visible = boat.hp > 0 || sinking && sinkProgress < .94;
    render.hp.visible = boat.hp > 0;
    if (sinking && sinkProgress < .65 && state.now - render.lastFoam > .35) {
      burst(runtime, boat.x, .4, boat.z, '#e7f9f4', 6, .55);
      render.lastFoam = state.now;
    }
    if (!sinking) render.lastFoam = -Infinity;
    render.group.scale.setScalar(boat.id === playerBoatId ? 1.08 : 1);
    render.hp.scale.x = Math.max(0.02, boat.hp / boat.maxHp);
    render.hp.position.x = -(1 - render.hp.scale.x) * 2.1;
    for (const [index, wake] of render.wake.entries()) {
      wake.visible = Math.hypot(boat.vx, boat.vz) > 0.9 && boat.hp > 0;
      const pulse = 1 + Math.sin(state.now * 4 + index) * .02;
      wake.scale.set(pulse * (boat.boostTime > 0 ? 1.7 : 1), pulse, pulse * (boat.boostTime > 0 ? 1.6 : 1));
      const mat = wake.material as THREE.MeshBasicMaterial;
      mat.opacity = (boat.boostTime > 0 ? .75 : .44) * Math.min(1,Math.hypot(boat.vx,boat.vz)/12);
    }
  }
}

function syncBalls(runtime: SceneRuntime, state: GameState) {
  const ids = new Set(state.cannonballs.map((ball) => ball.id));
  for (const [id, mesh] of runtime.balls) {
    if (!ids.has(id)) {
      runtime.scene.remove(mesh);
      disposeObject(mesh);
      runtime.balls.delete(id);
    }
  }
  for (const ball of state.cannonballs) {
    let mesh = runtime.balls.get(ball.id);
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(ball.explosive ? .55 : .34, 12, 8), new THREE.MeshBasicMaterial({ color: ball.explosive ? '#ff7b22' : '#1d1510' }));
      runtime.balls.set(ball.id, mesh);
      runtime.scene.add(mesh);
    }
    mesh.position.set(ball.x, 2.4 + Math.sin(ball.ttl * 12) * 0.6, ball.z);
  }
}

function syncChests(runtime: SceneRuntime, state: GameState) {
  const ids = new Set(state.chests.map((chest) => chest.id));
  for (const [id, chest] of runtime.chests) {
    if (!ids.has(id)) {
      runtime.scene.remove(chest);
      disposeObject(chest);
      runtime.chests.delete(id);
    }
  }
  for (const chest of state.chests) {
    let mesh = runtime.chests.get(chest.id);
    if (!mesh) {
      mesh = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 1.35), new THREE.MeshStandardMaterial({ color: '#7b4b25' }));
      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.22, 1.5), new THREE.MeshStandardMaterial({ color: '#f0b84b', metalness: 0.35 }));
      lid.position.y = 0.68;
      mesh.add(box, lid);
      if (chest.kind === 'large') {
        mesh.scale.setScalar(1.6);
        (lid.material as THREE.MeshStandardMaterial).color.set('#ef8141');
        const band = new THREE.Mesh(new THREE.BoxGeometry(.25, 1.5, 1.55), new THREE.MeshStandardMaterial({ color: '#ffe095', metalness: .5 }));
        band.position.y = .15;
        mesh.add(band);
      }
      const ring=new THREE.Mesh(new THREE.RingGeometry(1.5,1.7,40),new THREE.MeshBasicMaterial({color:'#f0b84b',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
      ring.rotation.x=-Math.PI/2;ring.position.y=-.65;ring.name='supply-expiry';ring.userData.skipReflection=true;mesh.add(ring);
      runtime.chests.set(chest.id, mesh);
      runtime.scene.add(mesh);
    }
    mesh.position.set(chest.x, 1.2 + Math.sin(state.now * 2 + chest.x) * 0.2, chest.z);
    mesh.rotation.y = state.now * .25;
    const remaining=Math.max(0,chest.expiresAt-state.now);
    const ring=mesh.getObjectByName('supply-expiry') as THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
    ring.geometry.setDrawRange(0,Math.ceil(remaining/SUPPLY_BOX_LIFETIME*40)*6);
    ring.material.color.set(remaining<6?'#ff8a59':chest.kind==='large'?'#ef8141':'#f0b84b');
    ring.material.opacity=remaining<6?.4+.4*Math.abs(Math.sin(state.now*5)):.8;
  }
}

function syncStorms(runtime: SceneRuntime, state: GameState) {
  const ids = new Set(state.storms.map((storm) => storm.id));
  for (const [id, storm] of runtime.storms) {
    if (!ids.has(id)) {
      runtime.scene.remove(storm);
      disposeObject(storm);
      runtime.storms.delete(id);
    }
  }
  for (const storm of state.storms) {
    let mesh = runtime.storms.get(storm.id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 12, 48, 1, true),
        new THREE.MeshBasicMaterial({ color: '#d8f5ff', transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
      );
      runtime.storms.set(storm.id, mesh);
      runtime.scene.add(mesh);
    }
    mesh.position.set(storm.x, 5, storm.z);
    mesh.scale.set(storm.radius, 1, storm.radius);
    mesh.rotation.y += 0.018;
  }
}

function syncIslands(runtime: SceneRuntime, state: GameState) {
  const uniforms = (runtime.water.material as THREE.ShaderMaterial).uniforms.uIslands.value as THREE.Vector3[];
  state.islands.forEach((island,index) => {
    if (index < uniforms.length) uniforms[index].set(island.x,island.z,island.radius);
    if (runtime.islands.has(island.id)) return;
    const group = createRockIsland(island);
    runtime.islands.set(island.id,group);
    runtime.scene.add(group);
  });
}

function spawnEventParticles(runtime: SceneRuntime, events: GameEvent[]) {
  for (const event of events) {
    if (event.type === 'fire') burst(runtime, event.x, 2.7, event.z, '#f0b84b', 8, 0.34);
    if (event.type === 'hit') {
      burst(runtime, event.x, 2.2, event.z, '#d8f5ff', 10, .42);
      burst(runtime, event.x, 2.4, event.z, '#b77f43', 8, .65);
    }
    if (event.type === 'sink') sinkEffects(runtime, event.x, event.z);
    if (event.type === 'explosion') burst(runtime, event.x, 2.6, event.z, '#ff852c', 24, .7);
    if (event.type === 'chest') burst(runtime, event.x, 2.1, event.z, '#f0b84b', 14, 0.55);
    if (event.type === 'respawn') burst(runtime, event.x, 2.1, event.z, '#7df2b7', 18, 0.6);
    if (event.type === 'repair') burst(runtime, event.x, 4, event.z, '#7df2b7', 16, .7);
    if (event.type === 'reload') burst(runtime, event.x, 3.2, event.z, '#f7ca67', 10, .45);
  }
}

function sinkEffects(runtime: SceneRuntime, x: number, z: number) {
  burst(runtime, x, .6, z, '#e7f9f4', 24, 1.2);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3, 3.5, 48),
    new THREE.MeshBasicMaterial({ color: '#e7f9f4', transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, .3, z);
  ring.userData.skipReflection = true;
  ring.userData.waveRing = true;
  runtime.scene.add(ring);
  runtime.particles.push({ mesh: ring, life: 2.8, max: 2.8, vx: 0, vz: 0, vy: 0 });
  for (let i = 0; i < 8; i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(.5 + Math.random() * .45, .15, 1 + Math.random()),
      new THREE.MeshStandardMaterial({ color: '#89613b', roughness: .85, transparent: true }),
    );
    plank.position.set(x + (Math.random() - .5) * 4, .35, z + (Math.random() - .5) * 6);
    plank.rotation.y = Math.random() * Math.PI;
    plank.userData.skipReflection = true;
    plank.userData.debris = true;
    runtime.scene.add(plank);
    runtime.particles.push({ mesh: plank, life: 4.5, max: 4.5, vx: (Math.random() - .5) * 2, vz: (Math.random() - .5) * 2, vy: 0, grow: false });
  }
}

function burst(runtime: SceneRuntime, x: number, y: number, z: number, color: string, count: number, life: number) {
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18 + Math.random() * 0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    );
    mesh.position.set(x, y, z);
    mesh.userData.skipReflection=true;
    runtime.scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 8;
    runtime.particles.push({ mesh, life, max: life, vx: Math.sin(a) * s, vz: Math.cos(a) * s, vy: 1 + Math.random() * 4 });
  }
}

function getMaterial(object: THREE.Object3D): THREE.Material | undefined {
  if (!('material' in object)) return undefined;
  const material = object.material as THREE.Material | THREE.Material[];
  return Array.isArray(material) ? material[0] : material;
}

function disposeObject(object:THREE.Object3D):void {
  const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  object.traverse(child=>{
    if(!(child instanceof THREE.Mesh||child instanceof THREE.Line))return;
    child.geometry.dispose();
    for(const material of Array.isArray(child.material)?child.material:[child.material])materials.add(material);
  });
  for(const material of materials){for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);material.dispose();}
  textures.forEach(texture=>texture.dispose());
}

function bob(t: number): number {
  return Math.sin(t * 2.2) * 0.22 + Math.cos(t * 1.7) * 0.16;
}
