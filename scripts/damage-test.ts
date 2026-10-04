import assert from 'node:assert/strict';
import { addBoat, cloneStateForClient, createGameState, RESPAWN_SECONDS, stepGame } from '../shared/simulation';

const state = createGameState({ roomCode: 'DAMAGE', mode: 'battle', aiCount: 0 });
state.islands = [];
state.chests = [{ id: 'far', x: 85, z: 85, kind: 'normal', expiresAt: 30 }];
const shooter = addBoat(state, { name: 'Shooter', playerId: 'a', ai: false });
const target = addBoat(state, { name: 'Target', playerId: 'b', ai: false });
Object.assign(shooter, { x: -40, z: -60 }); Object.assign(target, { x: 0, z: -60, angle: 0 });
function step(dt = .01, repair = false) {
  stepGame(state, dt, new Map([['b', { seq: 1, throttle: 0, turn: 0, stop: true, repair }]]), 'normal');
}
function hit(x: number, z: number, damage = 34) {
  state.cannonballs.push({ id: `hit-${state.tick}`, ownerId: shooter.id, x, z, vx: 0, vz: 0, ttl: 1, side: 'left', damage, explosive: false });
  step();
}
hit(2, -60); assert.equal(target.hp, 66); assert.equal(target.hullHits[0].side, 1);
hit(-2, -60); assert.equal(target.hp, 32); assert.equal(target.hullHits[1].side, -1);
assert.deepEqual(cloneStateForClient(state).boats.find(b => b.id === target.id)!.hullHits, target.hullHits);
step(.01, true); assert.equal(target.hp, 62); assert.equal(target.hullHits.length, 2, 'partial repair preserves hit locations');
target.repairCooldown = 0; step(.01, true); target.repairCooldown = 0; step(.01, true);
assert.equal(target.hp, 100); assert.equal(target.hullHits.length, 0, 'full repair clears wounds');
target.angle = Math.PI / 2; hit(0, -62, 1); assert.equal(target.hullHits[0].side, 1, 'hit side follows the ship heading');
for (let i = 0; i < 10; i++) hit(0, -62, 1);
assert.equal(target.hullHits.length, 8, 'wound history is bounded');
target.hp = 30; const score = shooter.score; hit(0, -62);
assert.equal(target.hp, 0); assert.equal(shooter.score, score + 100);
assert(state.events.some(e => e.type === 'sink' && e.targetId === target.id));
const until = target.sunkUntil, pose = [target.x, target.z];
assert.equal(until, state.now + RESPAWN_SECONDS);
step(1); assert.equal(target.hp, 0); assert.deepEqual([target.x, target.z], pose);
state.running = false; const paused = JSON.stringify(state); step(20); assert.equal(JSON.stringify(state), paused);
state.running = true; step(RESPAWN_SECONDS - 1 + .01);
assert.equal(target.hp, 100); assert.equal(target.hullHits.length, 0); assert.equal(target.sunkUntil, 0);
assert(state.events.some(e => e.type === 'respawn' && e.boatId === target.id));
console.log('DAMAGE_RULES_PASS', { localizedHits: true, repairsClearWounds: true, historyCap: 8, sinkSeconds: RESPAWN_SECONDS, pauseFreezesSinking: true, intactRespawn: true });
