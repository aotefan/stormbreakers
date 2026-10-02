import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import type { GameState, ServerMessage } from '../shared/protocol';

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

main()
  .catch((error) => {
    console.error('STATE_TEST_FAIL', error);
    process.exitCode = 1;
  })
  .finally(() => {
    child?.kill();
  });
