import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import type { GameState, ServerMessage } from '../shared/protocol';
import { addBoat, createGameState, stepGame } from '../shared/simulation';

const port = 8791;
const url = `ws://127.0.0.1:${port}/ws`;

interface TestClient {
  ws: WebSocket;
  joined: Extract<ServerMessage, { type: 'joined' }>;
  states: GameState[];
  latest: () => GameState;
  send: (message: unknown) => void;
  close: () => void;
}

let child: ChildProcess | undefined;

async function main() {
  runRuleChecks();
  child = spawn('npm', ['run', 'server'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (data) => process.stdout.write(`[server] ${data}`));
  child.stderr?.on('data', (data) => process.stderr.write(`[server] ${data}`));
  await waitForHealth();

  const a = await connect({ nickname: 'Alpha', mode: 'battle', difficulty: 'normal', create: true, testDuration: 8 });
  const roomCode = a.joined.roomCode;
  const b = await connect({ nickname: 'Beta', mode: 'battle', difficulty: 'normal', roomCode });
  await waitFor(() => {
    const state = a.latest();
    return state.roomCode === roomCode && state.boats.filter((boat) => !boat.ai).length >= 2 && b.latest().boats.length === state.boats.length;
  }, 'two independent clients share the same authoritative room');

  a.send({ type: 'debug', command: 'placeDuel' });
  await waitFor(() => a.latest().boats.some((boat) => boat.name === 'Beta' && boat.z < -10), 'debug duel placement applied');
  const betaBefore = a.latest().boats.find((boat) => boat.name === 'Beta')!.hp;
  a.send({ type: 'input', input: { seq: 1, throttle: 0, turn: 0, fireRight: true } });
  await waitFor(() => {
    const beta = a.latest().boats.find((boat) => boat.name === 'Beta');
    return !!beta && beta.hp < betaBefore;
  }, 'starboard cannon hit reduced remote HP');

  for (let i = 0; i < 4; i += 1) {
    await delay(3150);
    a.send({ type: 'input', input: { seq: 2 + i, throttle: 0, turn: 0, fireRight: true } });
  }
  await waitFor(() => {
    const alpha = a.latest().boats.find((boat) => boat.name === 'Alpha');
    const beta = a.latest().boats.find((boat) => boat.name === 'Beta');
    return !!alpha && !!beta && beta.hp <= 0 && alpha.score >= 100;
  }, 'sinking grants +100 score and marks target sunk');

  b.close();
  await waitFor(() => a.latest().boats.some((boat) => boat.name.includes('Beta') && boat.ai), 'leaving human is taken over by AI');
  await waitFor(() => a.latest().ended, 'short controlled round reaches end state');

  console.log('STATE_TEST_PASS', {
    roomCode,
    finalScores: a.latest().boats.map((boat) => ({ name: boat.name, ai: boat.ai, score: Math.round(boat.score), hp: Math.round(boat.hp) })),
    winner: a.latest().winnerName,
  });
  a.close();
}

function runRuleChecks() {
  const battle = createGameState({ roomCode: 'RULES', mode: 'battle', aiCount: 0 });
  const storm = createGameState({ roomCode: 'RULES', mode: 'storm', aiCount: 0 });
  const treasure = createGameState({ roomCode: 'RULES', mode: 'treasure', aiCount: 0 });
  assert(battle.duration === 180, 'default round duration is 180 seconds');
  assert(battle.chests.length === 2, 'free battle has fewer chests');
  assert(storm.storms.length > 0 && storm.chests.length === 4, 'storm mode has storm cells and survival chest profile');
  assert(treasure.chests.length === 9, 'treasure mode has more chests');

  const reload = createGameState({ roomCode: 'RELOAD', mode: 'battle', aiCount: 0, duration: 180 });
  const captain = addBoat(reload, { playerId: 'captain', name: 'Captain', ai: false });
  const left = addBoat(reload, { playerId: 'left', name: 'Left', ai: false });
  const right = addBoat(reload, { playerId: 'right', name: 'Right', ai: false });
  captain.x = 0;
  captain.z = 0;
  captain.angle = 0;
  left.x = -14;
  left.z = 0;
  right.x = 14;
  right.z = 0;
  stepGame(reload, 0.05, new Map([['captain', { seq: 1, throttle: 0, turn: 0, fireLeft: true, fireRight: true }]]), 'normal');
  advance(reload, 0.35, 'captain');
  assert(left.hp < 100 && right.hp < 100, 'both port and starboard cannons can hit independently');
  const leftAfterFirst = left.hp;
  const rightAfterFirst = right.hp;
  stepGame(reload, 0.05, new Map([['captain', { seq: 2, throttle: 0, turn: 0, fireLeft: true, fireRight: true }]]), 'normal');
  advance(reload, 0.35, 'captain');
  assert(left.hp === leftAfterFirst && right.hp === rightAfterFirst, 'broadside reload blocks refire before 3 seconds');
  advance(reload, 2.4, 'captain');
  stepGame(reload, 0.05, new Map([['captain', { seq: 3, throttle: 0, turn: 0, fireLeft: true, fireRight: true }]]), 'normal');
  advance(reload, 0.35, 'captain');
  assert(left.hp < leftAfterFirst && right.hp < rightAfterFirst, 'both broadsides reload after 3 seconds');

  const respawn = createGameState({ roomCode: 'RESPAWN', mode: 'battle', aiCount: 0, duration: 180 });
  const alpha = addBoat(respawn, { playerId: 'alpha', name: 'Alpha', ai: false });
  const beta = addBoat(respawn, { playerId: 'beta', name: 'Beta', ai: false });
  alpha.x = -5;
  alpha.z = 0;
  alpha.angle = Math.PI / 2;
  beta.x = -5;
  beta.z = -14;
  beta.hp = 1;
  stepGame(respawn, 0.05, new Map([['alpha', { seq: 1, throttle: 0, turn: 0, fireRight: true }]]), 'normal');
  advance(respawn, 0.4, 'alpha');
  assert(beta.hp <= 0 && alpha.score >= 100, 'sinking grants score and starts respawn');
  const scoreAfterSink = alpha.score;
  advance(respawn, 5.2, 'alpha');
  assert(beta.hp === beta.maxHp && alpha.score === scoreAfterSink, 'boat respawns after 5 seconds and score is retained');

  console.log('RULE_TEST_PASS', {
    duration: battle.duration,
    chestCounts: { battle: battle.chests.length, storm: storm.chests.length, treasure: treasure.chests.length },
    stormCells: storm.storms.length,
  });
}

function advance(state: GameState, seconds: number, playerId: string) {
  for (let t = 0; t < seconds; t += 0.05) {
    stepGame(state, 0.05, new Map([[playerId, { seq: Math.round(t * 20) + 10, throttle: 0, turn: 0 }]]), 'normal');
  }
}

async function connect(join: Record<string, unknown>): Promise<TestClient> {
  const ws = new WebSocket(url);
  await once(ws, 'open');
  const states: GameState[] = [];
  let joined: Extract<ServerMessage, { type: 'joined' }> | undefined;
  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString()) as ServerMessage;
    if (message.type === 'joined') joined = message;
    if (message.type === 'state') states.push(message.state);
    if (message.type === 'error') throw new Error(message.message);
  });
  ws.send(JSON.stringify({ type: 'join', ...join }));
  await waitFor(() => !!joined && states.length > 0, 'client receives joined and state');
  return {
    ws,
    joined: joined!,
    states,
    latest: () => states.at(-1)!,
    send: (message) => ws.send(JSON.stringify(message)),
    close: () => ws.close(),
  };
}

async function waitForHealth() {
  await waitFor(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      return res.ok;
    } catch {
      return false;
    }
  }, 'server health check');
}

async function waitFor(predicate: () => boolean | Promise<boolean>, label: string, timeout = 14000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await delay(80);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main()
  .catch((error) => {
    console.error('STATE_TEST_FAIL', error);
    process.exitCode = 1;
  })
  .finally(() => {
    child?.kill();
  });
