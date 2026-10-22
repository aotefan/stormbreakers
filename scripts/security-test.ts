import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import { parseMessage } from '../server/validation';

const invalid = [null, [], {}, { type: 'unknown' },
  { type: 'join', nickname: 'A', mode: 'battle', difficulty: '__proto__' },
  { type: 'join', nickname: 'A', mode: ['battle'], difficulty: ['normal'] },
  { type: 'join', nickname: 'A'.repeat(25), mode: 'battle', difficulty: 'normal' },
  { type: 'join', nickname: 'A', mode: 'battle', difficulty: 'normal', roomCode: '../x' },
  ...[NaN, Infinity, -Infinity, '1', null].map(throttle => ({ type: 'input', input: { seq: 1, throttle, turn: 0 } })),
  { type: 'input', input: { seq: -1, throttle: 0, turn: 0 } },
  { type: 'input', input: { seq: 1, throttle: 0, turn: 0, fireLeft: 'true' } },
  { type: 'input', input: { seq: 1, throttle: 0, turn: 0, dragTarget: { x: Infinity, z: 0 } } },
];
invalid.forEach(message => assert.throws(() => parseMessage(message)));
assert.deepEqual(parseMessage({ type: 'input', input: { seq: 1, throttle: 1, turn: -1, hp: 99999 } }),
  { type: 'input', input: { seq: 1, throttle: 1, turn: -1 } });

const port = 8797;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(port), NODE_ENV: 'production' }, stdio: 'ignore',
});
const sockets: WebSocket[] = [];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => unknown | Promise<unknown>, label: string) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await delay(30); }
  throw new Error(`Timeout: ${label}`);
}
async function connect() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  sockets.push(ws);
  const messages: any[] = [];
  ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
  await once(ws, 'open');
  return { ws, messages, send: (data: unknown) => ws.send(JSON.stringify(data)) };
}
try {
  await until(async () => { try { return (await fetch(`${base}/healthz`)).ok; } catch { return false; } }, 'health');
  const a = await connect();
  a.ws.send('not json');
  a.send({ type: 'join', nickname: 'Bad', mode: 'battle', difficulty: 'invalid' });
  await until(() => a.messages.filter(m => m.type === 'error').length === 2, 'invalid frames rejected');
  a.send({ type: 'join', nickname: 'Captain', mode: 'battle', difficulty: 'normal', testDuration: 0.1 });
  await until(() => a.messages.some(m => m.type === 'state'), 'healthy session after bad input');
  const initial = a.messages.find(m => m.type === 'state').state;
  assert.equal(initial.duration, 180, 'production ignores test round overrides');
  assert.deepEqual(initial.boats.filter((b: any) => b.ai).map((b: any) => b.name), ['奥特凡', '黄仁勋', '马斯克', '达里奥', 'TIBO']);
  a.send({ type: 'debug', command: 'fastEnd' });
  a.send({ type: 'input', input: { seq: 1, throttle: null, turn: 0 } });
  a.send({ type: 'input', input: { seq: 2, throttle: 1, turn: 0 } });
  await until(() => a.messages.some(m => m.type === 'state' && m.state.boats.some((b: any) => !b.ai && b.lastInputSeq === 2)), 'valid input still works');
  const state = a.messages.filter(m => m.type === 'state').at(-1).state;
  assert(state.now < 20 && !state.ended, 'debug command is inert in production');
  for (const boat of state.boats) assert([boat.x, boat.z, boat.vx, boat.vz, boat.hp].every(Number.isFinite));
  const oversized = await connect();
  const closed = once(oversized.ws, 'close');
  oversized.ws.send('x'.repeat(4097));
  assert.equal((await closed)[0], 1009, 'oversized frame is closed');
  assert((await fetch(`${base}/healthz`)).ok, 'oversized frame cannot crash server');
  const flood = await connect();
  const limited = once(flood.ws, 'close');
  for (let i = 0; i < 310; i++) flood.send({ type: 'pause', paused: true });
  assert.equal((await limited)[0], 1008, 'message flood is limited');
  assert.equal((await fetch(`${base}/absent.js`)).status, 404);
  assert.equal((await fetch(`${base}/missing-page`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e%2fpackage.json`)).status, 400);
  assert.equal((await fetch(`${base}/%00`)).status, 400);
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/`, { method: 'HEAD' })).status, 200);
  console.log('SECURITY_TEST_PASS: invalid inputs, production gates, five AI names, oversized frames, message rate, finite state, HTTP boundaries');
} finally {
  sockets.forEach(ws => ws.terminate());
  child.kill();
}
