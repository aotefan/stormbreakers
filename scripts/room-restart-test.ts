import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import type { GameState, ServerMessage } from '../shared/protocol';

const port = 8796;
const sockets = new Set<WebSocket>();
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(port), NODE_ENV: 'test' }, stdio: 'ignore',
});
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean | Promise<boolean>, label: string) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(20);
  }
  throw new Error(`Timeout: ${label}`);
}
async function connect(nickname: string, roomCode?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  sockets.add(ws);
  const messages: ServerMessage[] = [];
  ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'join', nickname, roomCode, mode: roomCode ? 'battle' : 'storm', difficulty: roomCode ? 'hard' : 'normal', testDuration: roomCode ? 99 : 1.2 }));
  const states = () => messages.filter((m): m is Extract<ServerMessage, { type: 'state' }> => m.type === 'state').map(m => m.state);
  const joined = () => messages.filter((m): m is Extract<ServerMessage, { type: 'joined' }> => m.type === 'joined').at(-1)!;
  await until(() => !!joined() && states().length > 0, `${nickname} joins`);
  return { ws, states, joined, latest: () => states().at(-1)!, send: (message: unknown) => ws.send(JSON.stringify(message)) };
}
function fresh(state: GameState) {
  assert.equal(state.ended, false);
  assert.equal(state.running, true);
  assert.equal(state.winnerId, undefined);
  assert.equal(state.winnerName, undefined);
  assert.equal(state.now, 0);
  assert.equal(state.timeLeft, 1.2);
  assert.equal(state.mode, 'storm');
  assert.equal(state.cannonballs.length, 0);
  for (const b of state.boats) {
    assert.equal(b.score, 0); assert.equal(b.hp, b.maxHp);
    assert.equal(b.sunkUntil, 0); assert.equal(b.hullHits.length, 0);
    assert.equal(b.boostCooldown + b.repairCooldown + b.supplyCooldown + b.cooldownLeft + b.cooldownRight, 0);
    assert.equal(b.weaponLevel, 0); assert.equal(b.powerUntil, 0);
  }
}
try {
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch { return false; } }, 'server');
  const a = await connect('Alpha'), code = a.joined().roomCode;
  const b = await connect('Beta', code);
  await until(() => a.latest().now > .25, 'first round advances');
  const tick = a.latest().tick, initialBoat = b.joined().boatId;
  a.send({ type: 'restart' });
  await delay(120);
  assert(a.latest().tick > tick, 'restart during active play is ignored');
  assert.equal(b.joined().boatId, initialBoat);
  a.send({ type: 'input', input: { seq: 1, throttle: 1, turn: 0, fireLeft: true, boost: true } });
  await until(() => a.latest().ended && b.latest().ended, 'first round ends');
  assert(a.latest().winnerName);
  assert(a.latest().boats.some(boat => boat.score > 0));
  const markerA = a.states().length, markerB = b.states().length;
  a.send({ type: 'restart' }); b.send({ type: 'restart' });
  await until(() => b.joined().boatId !== initialBoat && a.latest().running, 'both clients restart together');
  fresh(a.states().slice(markerA).find(state => state.tick === 0)!);
  fresh(b.states().slice(markerB).find(state => state.tick === 0)!);
  assert.equal(b.latest().roomCode, code);
  assert.deepEqual(b.latest().boats.filter(boat => !boat.ai).map(boat => boat.name).sort(), ['Alpha', 'Beta']);
  await delay(120);
  const own = a.latest().boats.find(boat => boat.playerId === a.joined().playerId)!;
  assert.equal(own.boostCooldown, 0, 'old boost input was cleared');
  assert.equal(own.cooldownLeft, 0, 'old fire input was cleared');
  a.send({ type: 'input', input: { seq: 2, throttle: 0, turn: 0, fireRight: true } });
  await until(() => a.latest().boats.find(boat => boat.id === a.joined().boatId)!.cooldownRight > 0, 'new boat accepts input');
  await until(() => a.latest().ended && b.latest().ended, 'second round ends');
  a.ws.close(); await once(a.ws, 'close');
  const previousBoat = b.joined().boatId, marker = b.states().length;
  const rejoined = await connect('Alpha', code);
  await until(() => b.joined().boatId !== previousBoat && !b.latest().ended, 're-entry restarts player who stayed');
  fresh(b.states().slice(marker).find(state => state.tick === 0)!);
  assert.equal(rejoined.latest().roomCode, code);
  assert.equal(rejoined.latest().mode, 'storm', 'original room mode survives re-entry');
  assert.equal(rejoined.latest().duration, 1.2, 'original round duration survives re-entry');
  await until(() => b.latest().ended && rejoined.latest().ended, 'third round ends');
  b.ws.close(); rejoined.ws.close();
  await Promise.all([once(b.ws, 'close'), once(rejoined.ws, 'close')]);
  const alone = await connect('Return', code);
  assert(!alone.latest().ended && alone.latest().now < .3, 'finished empty room starts again');
  assert.equal(alone.latest().boats.filter(boat => !boat.ai).length, 1);
  const activeTick = alone.latest().tick;
  const late = await connect('Late', code);
  assert(late.latest().tick >= activeTick && late.latest().now > 0, 'joining active room does not reset it');
  assert.equal(late.latest().duration, 1.2);
  console.log('ROOM_RESTART_TEST_PASS: shared rematch, no active reset, cleared state/input, re-entry with retained players, empty-room re-entry, late join');
} finally {
  sockets.forEach(ws => ws.terminate());
  server.kill();
}
