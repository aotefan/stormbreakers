import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { BoatState, GameEvent, GameState, Quality, Vec2 } from '../../shared/protocol';

interface Props {
  state: GameState | null;
  boatId: string;
  quality: Quality;
  dragTarget?: Vec2 | null;
  onWorldPointer?: (event: { type: 'start' | 'move' | 'end'; pointerId: number; world?: Vec2; clientX: number; clientY: number }) => void;
}

interface BoatRender {
  group: THREE.Group;
  hp: THREE.Mesh;
  wake: THREE.Mesh[];
}

interface Particle {
  mesh: THREE.Object3D;
  life: number;
  max: number;
  vx: number;
  vz: number;
  vy: number;
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

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b3c50');
    scene.fog = new THREE.Fog('#0b3c50', 55, 150);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    camera.position.set(0, 72, 72);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.35));
    renderer.shadowMap.enabled = quality === 'high';
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight('#d8f5ff', '#1b4a42', 1.6);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffe2a4', 2.4);
    sun.position.set(45, 60, 18);
    sun.castShadow = true;
    scene.add(sun);

    const water = makeWater();
    scene.add(water);
    scene.add(makeSky());

    const targetMarker = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 2.4, 48),
      new THREE.MeshBasicMaterial({ color: '#f0b84b', transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
    );
    targetMarker.rotation.x = -Math.PI / 2;
    targetMarker.visible = false;
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
      onWorldPointer?.({ type: 'start', pointerId: event.pointerId, world: toWorld(event), clientX: event.clientX, clientY: event.clientY });
    };
    const pointerMove = (event: PointerEvent) => {
      event.preventDefault();
      onWorldPointer?.({ type: 'move', pointerId: event.pointerId, world: toWorld(event), clientX: event.clientX, clientY: event.clientY });
    };
    const pointerEnd = (event: PointerEvent) => {
      event.preventDefault();
      onWorldPointer?.({ type: 'end', pointerId: event.pointerId, world: toWorld(event), clientX: event.clientX, clientY: event.clientY });
    };
    renderer.domElement.addEventListener('pointerdown', pointerStart, { passive: false });
    renderer.domElement.addEventListener('pointermove', pointerMove, { passive: false });
    renderer.domElement.addEventListener('pointerup', pointerEnd, { passive: false });
    renderer.domElement.addEventListener('pointercancel', pointerEnd, { passive: false });
    window.addEventListener('resize', resize);
    resize();

    let raf = 0;
    const animate = (time: number) => {
      raf = requestAnimationFrame(animate);
      runtime.water.position.y = Math.sin(time * 0.0012) * 0.18;
      const positions = (runtime.water.geometry as THREE.PlaneGeometry).attributes.position;
      for (let i = 0; i < positions.count; i += 1) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        positions.setZ(i, Math.sin(x * 0.11 + time * 0.0017) * 0.45 + Math.cos(y * 0.13 + time * 0.0012) * 0.35);
      }
      positions.needsUpdate = true;
      for (const particle of runtime.particles) {
        particle.life -= 0.016;
        particle.mesh.position.x += particle.vx * 0.016;
        particle.mesh.position.z += particle.vz * 0.016;
        particle.mesh.position.y += particle.vy * 0.016;
        particle.mesh.scale.multiplyScalar(1.012);
        const mat = getMaterial(particle.mesh);
        if (mat) mat.opacity = Math.max(0, particle.life / particle.max);
      }
      runtime.particles = runtime.particles.filter((particle) => {
        if (particle.life > 0) return true;
        scene.remove(particle.mesh);
        return false;
      });
      renderer.render(scene, camera);
    };
    animate(0);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', pointerStart);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerEnd);
      renderer.domElement.removeEventListener('pointercancel', pointerEnd);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [onWorldPointer, quality]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !state) return;
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
      runtime.camera.position.lerp(new THREE.Vector3(player.x, 70, player.z + 70), 0.045);
      runtime.camera.lookAt(player.x, 0, player.z);
    }
  }, [boatId, state]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.targetMarker.visible = !!dragTarget;
    if (dragTarget) runtime.targetMarker.position.set(dragTarget.x, 0.08, dragTarget.z);
  }, [dragTarget]);

  return <div className="scene" ref={mountRef} data-testid="storm-scene" />;
}

function makeWater(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#063848';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i += 1) {
    ctx.strokeStyle = `rgba(132, 221, 223, ${0.08 + Math.random() * 0.12})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const y = Math.random() * 256;
    ctx.moveTo(Math.random() * 80, y);
    ctx.bezierCurveTo(80, y - 18, 150, y + 18, 260, y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  const geometry = new THREE.PlaneGeometry(240, 240, 90, 90);
  geometry.rotateX(-Math.PI / 2);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: '#0a5362', roughness: 0.38, metalness: 0.22, map: texture }),
  );
}

function makeSky(): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < 14; i += 1) {
    const cloud = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#f2eadc', roughness: 0.9, transparent: true, opacity: 0.86 });
    for (let j = 0; j < 5; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + Math.random() * 3, 14, 10), mat);
      puff.position.set(j * 4 - 8, Math.random() * 2, Math.random() * 2);
      puff.scale.z = 0.55;
      cloud.add(puff);
    }
    cloud.position.set(-85 + Math.random() * 170, 28 + Math.random() * 28, -85 + Math.random() * 170);
    group.add(cloud);
  }
  return group;
}

function makeBoat(boat: BoatState): BoatRender {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#7a4127', roughness: 0.72, metalness: 0.03 });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#b77445', roughness: 0.75 });
  const trimMat = new THREE.MeshStandardMaterial({ color: boat.color, roughness: 0.4 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.9, 1.35, 8.5), hullMat);
  hull.position.y = 1;
  hull.scale.x = 0.75;
  group.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(2.9, 3.2, 4), hullMat);
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 1, 5.2);
  group.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 7.1), deckMat);
  deck.position.y = 1.8;
  group.add(deck);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.22, 0.18), trimMat);
  rail.position.set(0, 2.12, -3.7);
  group.add(rail);

  const mastMat = new THREE.MeshStandardMaterial({ color: '#55311f', roughness: 0.8 });
  const sailTex = tinaSailTexture(boat.color);
  const sailMat = new THREE.MeshStandardMaterial({ map: sailTex, roughness: 0.65, side: THREE.DoubleSide, transparent: true });
  [-2.8, 0, 2.8].forEach((z, i) => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7.8, 10), mastMat);
    mast.position.set(0, 5.3, z);
    group.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(i === 1 ? 3.1 : 2.45, i === 1 ? 3.9 : 3.1), sailMat);
    sail.position.set(0.08, 5.35, z + 0.35);
    sail.rotation.y = Math.PI / 2;
    group.add(sail);
  });

  const hp = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: '#7df2b7' }));
  hp.position.set(0, 8.9, 0);
  group.add(hp);
  const wakeMat = new THREE.MeshBasicMaterial({ color: '#9be3e7', transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const wake = [0, 1, 2].map((i) => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(1 + i * 0.9, 1.2 + i * 0.9, 32), wakeMat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = -4 - i * 2.2;
    group.add(mesh);
    return mesh;
  });
  return { group, hp, wake };
}

function tinaSailTexture(accent: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#efe4cf';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#c7a97a';
  ctx.lineWidth = 6;
  for (let y = 18; y < 320; y += 34) {
    ctx.beginPath();
    ctx.moveTo(14, y);
    ctx.bezierCurveTo(74, y + 15, 145, y - 15, 242, y + 8);
    ctx.stroke();
  }
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(128, 44);
  ctx.lineTo(164, 136);
  ctx.lineTo(253, 142);
  ctx.lineTo(181, 195);
  ctx.lineTo(205, 284);
  ctx.lineTo(128, 232);
  ctx.lineTo(51, 284);
  ctx.lineTo(75, 195);
  ctx.lineTo(3, 142);
  ctx.lineTo(92, 136);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#16323a';
  ctx.font = 'bold 46px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('Tina', 128, 178);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function syncBoats(runtime: SceneRuntime, state: GameState, playerBoatId: string) {
  const ids = new Set(state.boats.map((boat) => boat.id));
  for (const [id, render] of runtime.boats) {
    if (!ids.has(id)) {
      runtime.scene.remove(render.group);
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
    render.group.position.set(boat.x, bob(state.now + boat.x), boat.z);
    render.group.rotation.y = boat.angle;
    render.group.visible = boat.hp > 0;
    render.group.scale.setScalar(boat.id === playerBoatId ? 1.08 : 1);
    render.hp.scale.x = Math.max(0.02, boat.hp / boat.maxHp);
    render.hp.position.x = -(1 - render.hp.scale.x) * 2.1;
    for (const [index, wake] of render.wake.entries()) {
      wake.visible = Math.hypot(boat.vx, boat.vz) > 0.9 && boat.hp > 0;
      wake.scale.setScalar(1 + index * 0.2 + Math.sin(state.now * 4 + index) * 0.08);
      const mat = wake.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.22 - index * 0.04;
    }
  }
}

function syncBalls(runtime: SceneRuntime, state: GameState) {
  const ids = new Set(state.cannonballs.map((ball) => ball.id));
  for (const [id, mesh] of runtime.balls) {
    if (!ids.has(id)) {
      runtime.scene.remove(mesh);
      runtime.balls.delete(id);
    }
  }
  for (const ball of state.cannonballs) {
    let mesh = runtime.balls.get(ball.id);
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), new THREE.MeshBasicMaterial({ color: '#1d1510' }));
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
      runtime.chests.set(chest.id, mesh);
      runtime.scene.add(mesh);
    }
    mesh.position.set(chest.x, 1.2 + Math.sin(state.now * 2 + chest.x) * 0.2, chest.z);
    mesh.rotation.y += 0.012;
  }
}

function syncStorms(runtime: SceneRuntime, state: GameState) {
  const ids = new Set(state.storms.map((storm) => storm.id));
  for (const [id, storm] of runtime.storms) {
    if (!ids.has(id)) {
      runtime.scene.remove(storm);
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
  for (const island of state.islands) {
    if (runtime.islands.has(island.id)) continue;
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(island.radius, island.radius * 1.25, 3, 28),
      new THREE.MeshStandardMaterial({ color: '#c7aa75', roughness: 0.9 }),
    );
    const grass = new THREE.Mesh(
      new THREE.ConeGeometry(island.radius * 0.9, island.radius * 0.75, 28),
      new THREE.MeshStandardMaterial({ color: '#4b8d5a', roughness: 0.82 }),
    );
    grass.position.y = 2.2;
    group.add(base, grass);
    group.position.set(island.x, 0, island.z);
    runtime.islands.set(island.id, group);
    runtime.scene.add(group);
  }
}

function spawnEventParticles(runtime: SceneRuntime, events: GameEvent[]) {
  for (const event of events) {
    if (event.type === 'fire') burst(runtime, event.x, 2.7, event.z, '#f0b84b', 8, 0.34);
    if (event.type === 'hit') burst(runtime, event.x, 2.2, event.z, '#d8f5ff', 16, 0.42);
    if (event.type === 'sink') burst(runtime, event.x, 2.2, event.z, '#e85d4f', 28, 0.9);
    if (event.type === 'chest') burst(runtime, event.x, 2.1, event.z, '#f0b84b', 14, 0.55);
    if (event.type === 'respawn') burst(runtime, event.x, 2.1, event.z, '#7df2b7', 18, 0.6);
  }
}

function burst(runtime: SceneRuntime, x: number, y: number, z: number, color: string, count: number, life: number) {
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18 + Math.random() * 0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    );
    mesh.position.set(x, y, z);
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

function bob(t: number): number {
  return Math.sin(t * 2.2) * 0.22 + Math.cos(t * 1.7) * 0.16;
}
