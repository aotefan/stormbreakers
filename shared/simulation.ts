import type {
  BoatState,
  CannonballState,
  ChestState,
  Difficulty,
  GameEvent,
  GameState,
  IslandState,
  Mode,
  PlayerInput,
  StormCellState,
  Vec2,
} from './protocol';
import { getAiInput } from './ai';
import { clearWeaponPower, WEAPONS, weaponLevel } from './weapons';
import { ABILITIES, canBoost } from './abilities';

const FIELD = 96;
const BOAT_RADIUS = 3.2;
const CANNON_RANGE_SECONDS = 1.45;
const CANNON_SPEED = 58;
export const SUPPLY_DURATION = 15;
export const SUPPLY_BOX_LIFETIME = 30;
export const RESPAWN_SECONDS = 5;
const COLORS = ['#d64d3f', '#f0b84b', '#54b7c9', '#9de06f', '#b986ff', '#f27fb2'];
// The first seat is taken by the human captain; the other five are AI names.
const NAMES = ['Captain', '奥特凡', '黄仁勋', '马斯克', '达里奥', 'TIBO'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function len(x: number, z: number): number {
  return Math.hypot(x, z);
}

function normAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function randPos(seed = Math.random() * Math.PI * 2, radius = FIELD * 0.34): Vec2 {
  const r = radius * (0.45 + Math.random() * 0.55);
  return { x: Math.cos(seed) * r, z: Math.sin(seed) * r };
}

function safeSpawn(state:GameState,excludeId?:string):Vec2 {
  // Deterministic spread first; alternate rings cover crowded respawn situations.
  for(let attempt=0;attempt<96;attempt++) {
    const a=state.boats.length*Math.PI/3+attempt*2.399963+state.now*.13;
    const r=44+(attempt%4)*9,p={x:Math.cos(a)*r,z:Math.sin(a)*r};
    if(state.islands.every(i=>dist(p,i)>i.radius+7)&&state.boats.every(b=>b.id===excludeId||b.hp<=0||dist(p,b)>22))return p;
  }
  return {x:-80,z:-80};
}

export interface CreateOptions {
  roomCode: string;
  mode: Mode;
  duration?: number;
  aiCount?: number;
}

export function createGameState(options: CreateOptions): GameState {
  const islands: IslandState[] = [
    { id: 'island-a', x: -28, z: -18, radius: 8 },
    { id: 'island-b', x: 31, z: 21, radius: 10 },
    { id: 'island-c', x: 4, z: -37, radius: 6 },
  ];
  const storms: StormCellState[] =
    options.mode === 'storm'
      ? [
          { id: 'storm-a', x: -16, z: 14, radius: 13, phase: 0 },
          { id: 'storm-b', x: 30, z: -9, radius: 11, phase: 2.1 },
          { id: 'storm-c', x: 4, z: 31, radius: 9, phase: 4.4 },
        ]
      : [];
  const state: GameState = {
    roomCode: options.roomCode,
    mode: options.mode,
    tick: 0,
    now: 0,
    duration: options.duration ?? 180,
    timeLeft: options.duration ?? 180,
    running: true,
    ended: false,
    boats: [],
    cannonballs: [],
    chests: [],
    storms,
    islands,
    events: [],
  };
  const aiCount = options.aiCount ?? 3;
  for (let i = 0; i < aiCount; i += 1) addBoat(state, { ai: true, name: NAMES[i % NAMES.length] });
  seedChests(state);
  return state;
}

export function addBoat(
  state: GameState,
  options: { playerId?: string; name: string; ai: boolean; replaceAi?: boolean },
): BoatState {
  let boat: BoatState | undefined;
  if (options.replaceAi) boat = state.boats.find((candidate) => candidate.ai);
  if (boat) {
    if(boat.hp<=0){const spawn=safeSpawn(state,boat.id);boat.x=spawn.x;boat.z=spawn.z;}
    boat.playerId = options.playerId;
    boat.name = options.name;
    boat.ai = options.ai;
    boat.hp = boat.maxHp;
    boat.hullHits = [];
    boat.sunkUntil = 0;
    boat.lastInputSeq = 0;
    clearWeaponPower(boat);
    stopBoatMotion(boat);
    return boat;
  }

  const p = safeSpawn(state);
  const angle = Math.atan2(-p.x,-p.z);
  boat = {
    id: `boat-${Math.random().toString(36).slice(2, 9)}`,
    playerId: options.playerId,
    name: options.name || 'Captain',
    ai: options.ai,
    x: p.x,
    z: p.z,
    vx: 0,
    vz: 0,
    angle,
    hp: 100,
    maxHp: 100,
    hullHits: [],
    score: 0,
    sunkUntil: 0,
    cooldownLeft: 0,
    cooldownRight: 0,
    boostCooldown: 0,
    repairCooldown: 0,
    supplyCooldown: 0,
    boostTime: 0,
    salvoCount: 1,
    weaponLevel: 0,
    powerUntil: 0,
    color: COLORS[state.boats.length % COLORS.length],
    lastInputSeq: 0,
  };
  state.boats.push(boat);
  return boat;
}

export function removeHumanToAi(state: GameState, playerId: string): void {
  const boat = state.boats.find((candidate) => candidate.playerId === playerId);
  if (!boat) return;
  boat.playerId = undefined;
  boat.ai = true;
  clearWeaponPower(boat);
  boat.name = `${boat.name.replace(/\s*\(AI\)$/u, '')} (AI)`;
}

export function seedChests(state: GameState): void {
  const wanted = state.mode === 'treasure' ? 9 : state.mode === 'battle' ? 2 : 4;
  while (state.chests.length < wanted) {
    const p = randPos();
    if (state.islands.every((island) => dist(p, island) > island.radius + 6)) {
      const largeCount=state.chests.filter(c=>c.kind==='large').length;
      const kind=largeCount < (state.mode==='treasure'?2:1) ? 'large' : 'normal';
      state.chests.push({ id: `chest-${Math.random().toString(36).slice(2, 9)}`, x: p.x, z: p.z, expiresAt:state.now+SUPPLY_BOX_LIFETIME, kind });
    }
  }
}

export function stepGame(state: GameState, dt: number, humanInputs: Map<string, PlayerInput>, difficulty: Difficulty): void {
  if (!state.running || state.ended) return;
  state.events = [];
  state.now += dt;
  state.tick += 1;
  state.timeLeft = Math.max(0, state.duration - state.now);

  animateStorms(state, dt);
  for (const boat of state.boats) {
    const input = boat.ai ? getAiInput(state, boat, difficulty) : humanInputs.get(boat.playerId ?? '') ?? idleInput(boat.lastInputSeq);
    updateBoat(state, boat, input, dt);
  }
  resolveBoatCollisions(state);
  updateCannonballs(state, dt);
  collectChests(state);
  seedChests(state);

  if (state.mode === 'storm') {
    for (const boat of state.boats) {
      if (boat.hp > 0) boat.score += dt * 2;
    }
  }

  if (state.timeLeft <= 0) {
    state.ended = true;
    state.running = false;
    const winner = [...state.boats].sort((a, b) => b.score - a.score)[0];
    state.winnerId = winner?.id;
    state.winnerName = winner?.name;
  }
}

function idleInput(seq: number): PlayerInput {
  return { seq, throttle: 0, turn: 0 };
}

function updateBoat(state: GameState, boat: BoatState, input: PlayerInput, dt: number): void {
  if(boat.ai||state.now>=boat.powerUntil)clearWeaponPower(boat);
  boat.cooldownLeft = Math.max(0, boat.cooldownLeft - dt);
  boat.cooldownRight = Math.max(0, boat.cooldownRight - dt);
  boat.boostCooldown = Math.max(0, boat.boostCooldown - dt);
  boat.repairCooldown = Math.max(0, boat.repairCooldown - dt);
  boat.supplyCooldown = Math.max(0, boat.supplyCooldown - dt);
  boat.boostTime = Math.max(0, boat.boostTime - dt);
  boat.lastInputSeq = Math.max(boat.lastInputSeq, input.seq);

  if (boat.hp <= 0) {
    boat.vx = 0;
    boat.vz = 0;
    if (state.now >= boat.sunkUntil) {
      const p = safeSpawn(state,boat.id);
      boat.x = p.x;
      boat.z = p.z;
      boat.angle = Math.atan2(-p.x,-p.z);
      boat.hp = boat.maxHp;
      boat.hullHits = [];
      boat.sunkUntil = 0;
      state.events.push({ type: 'respawn', boatId: boat.id, x: boat.x, z: boat.z });
    }
    return;
  }

  if (input.boost && boat.boostCooldown <= 0 && canBoost(boat, input)) {
    boat.boostTime = ABILITIES.boost.duration;
    boat.boostCooldown = ABILITIES.boost.cooldown;
    state.events.push({ type: 'boost', boatId: boat.id, x: boat.x, z: boat.z });
  }
  if (input.repair && boat.repairCooldown <= 0 && boat.hp < boat.maxHp) {
    const healing = Math.min(ABILITIES.repair.healing, boat.maxHp - boat.hp);
    boat.hp += healing;
    if (boat.hp >= boat.maxHp) boat.hullHits = [];
    boat.repairCooldown = ABILITIES.repair.cooldown;
    state.events.push({ type: 'repair', boatId: boat.id, x: boat.x, z: boat.z, healing });
  }
  if (input.supply && boat.supplyCooldown <= 0 && (boat.cooldownLeft > 0 || boat.cooldownRight > 0)) {
    boat.cooldownLeft = 0;
    boat.cooldownRight = 0;
    boat.supplyCooldown = ABILITIES.supply.cooldown;
    state.events.push({ type: 'reload', boatId: boat.id, x: boat.x, z: boat.z });
  }

  if (input.fireLeft) fireCannon(state, boat, 'left');
  if (input.fireRight) fireCannon(state, boat, 'right');

  moveBoat(state, boat, input, dt);

  if (state.mode === 'storm') {
    for (const storm of state.storms) {
      const dx = boat.x - storm.x;
      const dz = boat.z - storm.z;
      const d = Math.hypot(dx, dz);
      if (d < storm.radius) {
        if (!input.stop) {
          const force = (1 - d / storm.radius) * 16;
          boat.vx += (dx / (d || 1)) * force * dt;
          boat.vz += (dz / (d || 1)) * force * dt;
        }
        boat.hp -= dt * 10;
        if (boat.hp <= 0) sinkBoat(state, undefined, boat);
      }
    }
  }
}

export function stopBoatMotion(boat: BoatState): void {
  boat.vx = 0;
  boat.vz = 0;
}

export function predictBoatMovement(state: GameState, boat: BoatState, input: PlayerInput, dt: number): BoatState {
  const predicted = { ...boat };
  moveBoat(state, predicted, input, Math.max(0, Math.min(0.05, dt)));
  const boats = state.boats.map((other) => other.id === boat.id ? predicted : { ...other });
  resolveBoatCollisions({ ...state, boats });
  return predicted;
}

function moveBoat(state: GameState, boat: BoatState, input: PlayerInput, dt: number): void {
  if (input.stop || boat.hp <= 0) {
    stopBoatMotion(boat);
    return;
  }
  let throttle = clamp(input.throttle, -0.65, 1);
  let turn = clamp(input.turn, -1, 1);
  if (input.dragTarget) {
    const dx = input.dragTarget.x - boat.x;
    const dz = input.dragTarget.z - boat.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.3) {
      turn = clamp(normAngle(Math.atan2(dx, dz) - boat.angle) * 1.8, -1, 1);
      throttle = clamp(d / 18, 0, 1);
    } else {
      throttle = 0;
    }
  }

  boat.angle = normAngle(boat.angle + turn * dt * 2.35);
  const speedLimit = boat.boostTime > 0 ? 33 : 22;
  const ax = Math.sin(boat.angle) * throttle * (boat.boostTime > 0 ? 34 : 22);
  const az = Math.cos(boat.angle) * throttle * (boat.boostTime > 0 ? 34 : 22);
  boat.vx += ax * dt;
  boat.vz += az * dt;

  const currentSpeed = len(boat.vx, boat.vz);
  if (currentSpeed > speedLimit) {
    boat.vx = (boat.vx / currentSpeed) * speedLimit;
    boat.vz = (boat.vz / currentSpeed) * speedLimit;
  }
  const drag = input.dragTarget || Math.abs(throttle) > 0 ? 0.985 : 0.9;
  const damping=Math.pow(drag,dt*60);
  boat.vx *= damping;
  boat.vz *= damping;
  boat.x += boat.vx * dt;
  boat.z += boat.vz * dt;

  const boundary = FIELD - 5;
  if (Math.abs(boat.x) > boundary) {
    boat.x = clamp(boat.x, -boundary, boundary);
    boat.vx *= -0.35;
  }
  if (Math.abs(boat.z) > boundary) {
    boat.z = clamp(boat.z, -boundary, boundary);
    boat.vz *= -0.35;
  }

  for (const island of state.islands) {
    const dx = boat.x - island.x;
    const dz = boat.z - island.z;
    const d = Math.hypot(dx, dz);
    const min = island.radius + BOAT_RADIUS;
    if (d < min) {
      const nx = d>0.0001?dx/d:1;
      const nz = d>0.0001?dz/d:0;
      boat.x = island.x + nx * min;
      boat.z = island.z + nz * min;
      boat.vx *= -0.18;
      boat.vz *= -0.18;
    }
  }

}

function fireCannon(state: GameState, boat: BoatState, side: 'left' | 'right'): void {
  const key = side === 'left' ? 'cooldownLeft' : 'cooldownRight';
  if (boat[key] > 0 || boat.hp <= 0) return;
  const weapon=WEAPONS[weaponLevel(boat,state.now)];
  boat[key] = weapon.reload;
  // Forward is local +Z: port is +X and starboard is -X.
  const sign = side === 'left' ? 1 : -1;
  const sideAngle = boat.angle + sign * Math.PI * 0.5;
  const muzzleX = boat.x + Math.sin(sideAngle) * 4.5 + Math.sin(boat.angle) * 0.6;
  const muzzleZ = boat.z + Math.cos(sideAngle) * 4.5 + Math.cos(boat.angle) * 0.6;
  const count=weapon.count;
  for(let i=0;i<count;i++) {
  const shotAngle=sideAngle+(i-(count-1)/2)*.09;
  state.cannonballs.push({
    id: `ball-${Math.random().toString(36).slice(2, 9)}`,
    ownerId: boat.id,
    x: muzzleX,
    z: muzzleZ,
    vx: Math.sin(shotAngle) * CANNON_SPEED + boat.vx * 0.25,
    vz: Math.cos(shotAngle) * CANNON_SPEED + boat.vz * 0.25,
    ttl: CANNON_RANGE_SECONDS,
    side,
    damage:weapon.damage,
    explosive:weapon.explosive,
  });
  }
  state.events.push({ type: 'fire', boatId: boat.id, side, x: muzzleX, z: muzzleZ, angle: sideAngle });
}

function updateCannonballs(state: GameState, dt: number): void {
  const next: CannonballState[] = [];
  for (const ball of state.cannonballs) {
    ball.ttl -= dt;
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    if (ball.ttl <= 0 || Math.abs(ball.x) > FIELD || Math.abs(ball.z) > FIELD) continue;
    const target = state.boats.find((boat) => boat.id !== ball.ownerId && boat.hp > 0 && dist({ x: ball.x, z: ball.z }, boat) < BOAT_RADIUS + 1.2);
    if (target) {
      target.hp -= ball.damage;
      recordHullHit(target, ball, ball.damage);
      state.events.push({ type: 'hit', boatId: ball.ownerId, targetId: target.id, x: ball.x, z: ball.z });
      if (target.hp <= 0) sinkBoat(state, ball.ownerId, target);
      if(ball.explosive) {
        state.events.push({type:'explosion',boatId:ball.ownerId,x:ball.x,z:ball.z});
        for(const nearby of state.boats) {
          if(nearby.id===ball.ownerId||nearby.id===target.id||nearby.hp<=0||dist(nearby,ball)>7)continue;
          nearby.hp-=20;
          recordHullHit(nearby, ball, 20);
          state.events.push({type:'hit',boatId:ball.ownerId,targetId:nearby.id,x:nearby.x,z:nearby.z});
          if(nearby.hp<=0)sinkBoat(state,ball.ownerId,nearby);
        }
      }
      continue;
    }
    next.push(ball);
  }
  state.cannonballs = next;
}

function recordHullHit(boat: BoatState, point: Vec2, damage: number): void {
  const dx = point.x - boat.x, dz = point.z - boat.z;
  const localX = dx * Math.cos(boat.angle) - dz * Math.sin(boat.angle);
  const localZ = dx * Math.sin(boat.angle) + dz * Math.cos(boat.angle);
  boat.hullHits.push({ side: localX < 0 ? -1 : 1, z: clamp(localZ, -5.8, 5.8), damage });
  if (boat.hullHits.length > 8) boat.hullHits.shift();
}

function sinkBoat(state: GameState, attackerId: string | undefined, target: BoatState): void {
  target.hp = 0;
  target.sunkUntil = state.now + RESPAWN_SECONDS;
  target.vx = 0;
  target.vz = 0;
  clearWeaponPower(target);
  const attacker = state.boats.find((boat) => boat.id === attackerId);
  if (attacker) attacker.score += 100;
  state.events.push({ type: 'sink', boatId: attackerId ?? target.id, targetId: target.id, x: target.x, z: target.z });
}

function collectChests(state: GameState): void {
  const remaining: ChestState[] = [];
  for (const chest of state.chests) {
    if(state.now>=chest.expiresAt)continue;
    const boat = state.boats.find((candidate) => !candidate.ai && candidate.hp > 0 && dist(chest, candidate) < BOAT_RADIUS + 2);
    if (boat) {
      boat.score += state.mode === 'treasure' ? 45 : 35;
      boat.hp = Math.min(boat.maxHp, boat.hp + 10);
      if (boat.hp >= boat.maxHp) boat.hullHits = [];
      boat.weaponLevel=chest.kind==='large'?3:Math.min(3,weaponLevel(boat,state.now)+1);
      const weapon=WEAPONS[boat.weaponLevel];
      boat.salvoCount=weapon.count;
      boat.powerUntil=state.now+SUPPLY_DURATION;
      boat.cooldownLeft=Math.min(boat.cooldownLeft,weapon.reload);
      boat.cooldownRight=Math.min(boat.cooldownRight,weapon.reload);
      state.events.push({ type: 'chest', boatId: boat.id, x: chest.x, z: chest.z });
    } else {
      remaining.push(chest);
    }
  }
  state.chests = remaining;
}

function resolveBoatCollisions(state: GameState): void {
  for (let i = 0; i < state.boats.length; i += 1) {
    for (let j = i + 1; j < state.boats.length; j += 1) {
      const a = state.boats[i];
      const b = state.boats[j];
      if (a.hp <= 0 || b.hp <= 0) continue;
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      const d = Math.hypot(dx, dz);
      const min = BOAT_RADIUS * 2;
      if (d < min) {
        const nx = d>0.0001?dx/d:1;
        const nz = d>0.0001?dz/d:0;
        const push = (min - d) * 0.5;
        a.x += nx * push;
        a.z += nz * push;
        b.x -= nx * push;
        b.z -= nz * push;
        a.vx *= 0.65;
        a.vz *= 0.65;
        b.vx *= 0.65;
        b.vz *= 0.65;
      }
    }
  }
}

function animateStorms(state: GameState, dt: number): void {
  for (const storm of state.storms) {
    storm.phase += dt;
    storm.x += Math.sin(storm.phase * 0.41) * dt * 2.2;
    storm.z += Math.cos(storm.phase * 0.37) * dt * 1.8;
    storm.radius = clamp(storm.radius + Math.sin(storm.phase * 0.7) * dt * 1.6, 8, 18);
  }
}

export function cloneStateForClient(state: GameState): GameState {
  return {
    ...state,
    boats: state.boats.map((boat) => ({ ...boat })),
    cannonballs: state.cannonballs.map((ball) => ({ ...ball })),
    chests: state.chests.map((chest) => ({ ...chest })),
    storms: state.storms.map((storm) => ({ ...storm })),
    islands: state.islands.map((island) => ({ ...island })),
    events: state.events.map((event) => ({ ...event }) as GameEvent),
  };
}
