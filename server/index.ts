import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, Difficulty, PlayerInput, ServerMessage } from '../shared/protocol';
import { addBoat, cloneStateForClient, createGameState, removeHumanToAi, stepGame, stopBoatMotion } from '../shared/simulation';
import { parseMessage } from './validation';

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const TICK_MS = 50;
const ROOM_LIMIT = 6;
const MAX_ROOMS = 100;
const EMPTY_ROOM_TTL = 60_000;

interface Client {
  id: string;
  nickname: string;
  ws: WebSocket;
  roomCode: string;
  boatId: string;
  input: PlayerInput;
}

interface Room {
  code: string;
  aiCount: number;
  difficulty: Difficulty;
  state: ReturnType<typeof createGameState>;
  inputs: Map<string, PlayerInput>;
  clients: Map<string, Client>;
  emptySince?: number;
}

const rooms = new Map<string, Room>();
const clients = new Map<WebSocket, Client>();

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.url === '/healthz') {
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('X-Runtime-Version', process.version);
    if (process.env.RENDER_GIT_COMMIT) res.setHeader('X-Revision', process.env.RENDER_GIT_COMMIT);
    send(res, 200, 'ok', 'text/plain');
    return;
  }
  await serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  if (wss.clients.size > 600) { ws.close(1013, 'Server is full'); return; }
  let alive = true;
  let windowStart = Date.now();
  let received = 0;
  let joins = 0;
  const heartbeat = setInterval(() => {
    if (!alive) { ws.terminate(); return; }
    alive = false;
    ws.ping();
  }, 25_000);
  ws.on('pong', () => { alive = true; });
  ws.on('error', () => ws.terminate());
  ws.on('message', (raw, binary) => {
    if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); received = 0; joins = 0; }
    if (++received > 300) { ws.close(1008, 'Too many messages'); return; }
    try {
      if (binary) throw new Error('Text messages required');
      const message = parseMessage(JSON.parse(raw.toString()));
      if ((message.type === 'join' || message.type === 'practice') && ++joins > 5) {
        ws.close(1008, 'Too many joins'); return;
      }
      handleMessage(ws, message);
    } catch {
      sendWs(ws, { type: 'error', message: 'Invalid message' });
    }
  });
  ws.on('close', () => {
    clearInterval(heartbeat);
    const client = clients.get(ws);
    if (!client) return;
    clients.delete(ws);
    const room = rooms.get(client.roomCode);
    if (!room) return;
    room.clients.delete(client.id);
    room.inputs.delete(client.id);
    removeHumanToAi(room.state, client.id);
    if (room.clients.size === 0) room.emptySince = Date.now();
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.clients.size === 0 && room.emptySince !== undefined && Date.now() - room.emptySince >= EMPTY_ROOM_TTL) {
      rooms.delete(room.code);
      continue;
    }
    stepGame(room.state, TICK_MS / 1000, room.inputs, room.difficulty);
    const payload: ServerMessage = { type: 'state', state: cloneStateForClient(room.state) };
    for (const client of room.clients.values()) {
      sendWs(client.ws, { ...payload, playerId: client.id });
    }
  }
}, TICK_MS);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Stormbreakers server listening on http://0.0.0.0:${PORT}`);
});

function handleMessage(ws: WebSocket, message: ClientMessage): void {
  const existing = clients.get(ws);
  if (message.type === 'input') {
    if (!existing) return;
    const room = rooms.get(existing.roomCode);
    if (!room) return;
    room.inputs.set(existing.id, message.input);
    existing.input = message.input;
    if (message.input.stop === true) {
      const boat = room.state.boats.find((candidate) => candidate.id === existing.boatId);
      if (boat) stopBoatMotion(boat);
    }
    return;
  }
  if (message.type === 'pause') {
    return;
  }
  if (message.type === 'restart') {
    const room = existing && rooms.get(existing.roomCode);
    if (room?.state.ended) restartRoom(room);
    return;
  }
  if (message.type === 'debug') {
    if (process.env.NODE_ENV !== 'test' || !existing) return;
    const room = rooms.get(existing.roomCode);
    if (!room) return;
    if (message.command === 'fastEnd') room.state.now = Math.max(0, room.state.duration - 2);
    if (message.command === 'placeDuel') placeDuel(room);
    return;
  }

  const playerId = `p-${randomUUID()}`;
  const input: PlayerInput = { seq: 0, throttle: 0, turn: 0 };
  const roomCode = message.type === 'join' && message.roomCode ? message.roomCode.trim().toUpperCase() : createCode();
  let room = rooms.get(roomCode);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) { sendWs(ws, { type: 'error', message: 'Server is full. Please try again later.' }); return; }
    room = {
      code: roomCode,
      aiCount: 6,
      difficulty: message.difficulty,
      state: createGameState({
        roomCode,
        mode: message.mode,
        duration: process.env.NODE_ENV === 'test' && Number.isFinite(message.testDuration)
          ? Math.max(0.1, Math.min(180, message.testDuration!)) : 180,
        aiCount: 6,
      }),
      inputs: new Map(),
      clients: new Map(),
    };
    rooms.set(roomCode, room);
  }
  if (room.clients.size - (existing?.roomCode === roomCode ? 1 : 0) >= ROOM_LIMIT) {
    sendWs(ws, { type: 'error', message: 'Room is full' });
    return;
  }
  // Repeated joins on one socket replace its seat instead of leaving a ghost player.
  if (existing) {
    const previous = rooms.get(existing.roomCode);
    previous?.clients.delete(existing.id);
    previous?.inputs.delete(existing.id);
    if (previous) removeHumanToAi(previous.state, existing.id);
    if (previous?.clients.size === 0) previous.emptySince = Date.now();
    clients.delete(ws);
  }
  if (room.state.ended) restartRoom(room);
  const nickname = message.nickname?.trim() || 'Captain';
  const boat = addBoat(room.state, {
    playerId,
    name: nickname,
    ai: false,
    replaceAi: true,
  });
  const client: Client = { id: playerId, nickname, ws, roomCode: room.code, boatId: boat.id, input };
  clients.set(ws, client);
  room.clients.set(playerId, client);
  room.emptySince = undefined;
  room.inputs.set(playerId, input);
  sendWs(ws, { type: 'joined', playerId, boatId: boat.id, roomCode: room.code, authoritative: true });
}

function restartRoom(room: Room): void {
  room.state = createGameState({
    roomCode: room.code,
    mode: room.state.mode,
    duration: room.state.duration,
    aiCount: room.aiCount,
  });
  room.inputs.clear();
  for (const client of room.clients.values()) {
    const boat = addBoat(room.state, { playerId: client.id, name: client.nickname, ai: false, replaceAi: true });
    client.boatId = boat.id;
    client.input = { seq: 0, throttle: 0, turn: 0 };
    room.inputs.set(client.id, client.input);
    sendWs(client.ws, { type: 'joined', playerId: client.id, boatId: boat.id, roomCode: room.code, authoritative: true });
  }
  const state = cloneStateForClient(room.state);
  for (const client of room.clients.values()) sendWs(client.ws, { type: 'state', playerId: client.id, state });
}

function placeDuel(room: Room): void {
  const [a, b] = room.state.boats;
  if (!a || !b) return;
  a.x = -5;
  a.z = 0;
  a.angle = Math.PI / 2;
  a.hp = a.maxHp;
  a.cooldownRight = 0;
  b.x = -5;
  b.z = 14;
  b.angle = -Math.PI / 2;
  b.hp = b.maxHp;
  b.cooldownRight = 0;
}

function createCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let code = '';
    for (let i = 0; i < 5; i += 1) code += alphabet[randomInt(alphabet.length)];
    if (!rooms.has(code)) return code;
  }
}

function sendWs(ws: WebSocket, message: ServerMessage): void {
  if (ws.bufferedAmount > 1024 * 1024) { ws.close(1013, 'Client is too slow'); return; }
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8');
    return;
  }
  if (!existsSync(DIST)) {
    send(res, 200, 'Stormbreakers dev server is running. Start Vite on port 5173 for the client.', 'text/plain');
    return;
  }
  let rawUrl: string;
  try { rawUrl = decodeURIComponent(req.url?.split('?')[0] ?? '/'); }
  catch { send(res, 400, 'Bad request', 'text/plain; charset=utf-8'); return; }
  if (rawUrl === '/en' || rawUrl === '/index.html' || rawUrl === '/en/index.html') {
    res.writeHead(308, { Location: rawUrl === '/index.html' ? '/' : '/en/' }); res.end(); return;
  }
  const requestPath = rawUrl === '/' ? '/index.html' : rawUrl === '/en/' ? '/en/index.html' : rawUrl;
  const filePath = resolve(DIST, `.${requestPath}`);
  if (!rawUrl.startsWith('/') || rawUrl.includes('\\') || rawUrl.includes('\0') || !filePath.startsWith(`${DIST}${sep}`)) {
    send(res, 400, 'Bad request', 'text/plain; charset=utf-8'); return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not file');
    res.writeHead(200, { 'Content-Type': mime(filePath), 'Cache-Control': filePath.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
  } catch {
    res.setHeader('X-Robots-Tag', 'noindex');
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
}

function send(res: ServerResponse, status: number, body: string | Buffer, type: string): void {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function mime(path: string): string {
  switch (extname(path)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.xml':
      return 'application/xml; charset=utf-8';
    case '.js':
      return 'text/javascript';
    case '.css':
      return 'text/css';
    case '.json':
      return 'application/json';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}
