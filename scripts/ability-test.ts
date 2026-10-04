import assert from 'node:assert/strict';
import { addBoat, createGameState, stepGame } from '../shared/simulation';
import type { PlayerInput } from '../shared/protocol';

function fixture() {
  const state = createGameState({ roomCode: 'SKILL', mode: 'battle', aiCount: 0 });
  state.islands = [];
  state.chests = [{ id: 'far', x: 85, z: 85, kind: 'normal', expiresAt: 30 }];
  const boat = addBoat(state, { name: 'Captain', playerId: 'p', ai: false });
  Object.assign(boat, { x: 0, z: -60, angle: 0 });
  const step = (input: Partial<PlayerInput> = {}) => stepGame(state, .05, new Map([['p', { seq: 1, throttle: 0, turn: 0, ...input }]]), 'normal');
  return { state, boat, step };
}

const stopped = fixture(); stopped.step({ boost: true, stop: true });
assert.equal(stopped.boat.boostCooldown, 0, 'stationary boost must not waste cooldown');
assert.equal(stopped.boat.boostTime, 0);
const normal = fixture(), boosted = fixture();
normal.step({ throttle: 1 }); boosted.step({ throttle: 1, boost: true });
assert(boosted.state.events.some(e => e.type === 'boost'));
for (let i = 0; i < 19; i++) { normal.step({ throttle: 1 }); boosted.step({ throttle: 1 }); }
assert(boosted.boat.z + 60 > (normal.boat.z + 60) * 1.3, 'boost measurably increases sailing distance');
const remaining = boosted.boat.boostCooldown; boosted.step({ throttle: 1, boost: true });
assert(boosted.boat.boostCooldown < remaining, 'repeated input cannot restart boost during cooldown');

const repaired = fixture(); repaired.boat.hp = 40; repaired.step({ repair: true });
assert.equal(repaired.boat.hp, 70); assert.equal(repaired.boat.repairCooldown, 14);
assert(repaired.state.events.some(e => e.type === 'repair' && e.healing === 30));
repaired.step({ repair: true }); assert.equal(repaired.boat.hp, 70, 'repair respects cooldown');
const clamped = fixture(); clamped.boat.hp = 90; clamped.step({ repair: true });
assert.equal(clamped.boat.hp, 100); assert(clamped.state.events.some(e => e.type === 'repair' && e.healing === 10));
const healthy = fixture(); healthy.step({ repair: true }); assert.equal(healthy.boat.repairCooldown, 0);

const loaded = fixture(); loaded.step({ supply: true });
assert.equal(loaded.boat.supplyCooldown, 0, 'ready cannons must not waste quick reload');
loaded.step({ fireLeft: true, fireRight: true }); assert(loaded.boat.cooldownLeft > 0 && loaded.boat.cooldownRight > 0);
loaded.step({ supply: true }); assert.equal(loaded.boat.cooldownLeft, 0); assert.equal(loaded.boat.cooldownRight, 0);
assert.equal(loaded.boat.supplyCooldown, 18); assert(loaded.state.events.some(e => e.type === 'reload'));
loaded.step({ fireLeft: true }); const cooldown = loaded.boat.cooldownLeft;
loaded.step({ supply: true }); assert(loaded.boat.cooldownLeft > 0 && loaded.boat.cooldownLeft < cooldown);

const paused = fixture(); paused.boat.hp = 40; paused.state.running = false;
const before = JSON.stringify(paused.state); paused.step({ repair: true, boost: true, throttle: 1 });
assert.equal(JSON.stringify(paused.state), before);
console.log('ABILITY_RULES_PASS', { boostDistance: boosted.boat.z + 60, normalDistance: normal.boat.z + 60, repair: 30, reloadsBothSides: true, uselessActionsPreserveCooldown: true });
