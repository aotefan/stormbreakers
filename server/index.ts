import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, Difficulty, PlayerInput, ServerMessage } from '../shared/protocol';
import { addBoat, cloneStateForClient, createGameState, removeHumanToAi, stepGame } from '../shared/simulation';

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const TICK_MS = 50;
const ROOM_LIMIT = 6;

interface Client {
  id: string;
  ws: WebSocket;
  roomCode: string;
  boatId: string;
  input: PlayerInput;
}

interface Room {
  code: string;
  difficulty: Difficulty;
  state: ReturnType<typeof createGameState>;
  inputs: Map<string, PlayerInput>;
  clients: Map<string, Client>;
}

const rooms = new Map<string, Room>();
const clients = new Map<WebSocket, Client>();

const server = createServer(async (req, res) => {
  if (req.url === '/healthz') {
    send(res, 200, 'ok', 'text/plain');
    return;
  }
  await serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as ClientMessage;
      handleMessage(ws, message);
    } catch (error) {
      sendWs(ws, { type: 'error', message: error instanceof Error ? error.message : 'Bad message' });
    }
  });
  ws.on('close', () => {
    const client = clients.get(ws);
    if (!client) return;
    clients.delete(ws);
    const room = rooms.get(client.roomCode);
    if (!room) return;
    room.clients.delete(client.id);
    room.inputs.delete(client.id);
    removeHumanToAi(room.state, client.id);
  });
});

setInterval(() => {
  for (const client of clients.values()) {
    if (client.ws.readyState === client.ws.OPEN) client.ws.ping();
  }
}, 25000);

setInterval(() => {
  for (const room of rooms.values()) {
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
    return;
  }
  if (message.type === 'pause') {
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

  const playerId = `p-${Math.random().toString(36).slice(2, 10)}`;
  const input: PlayerInput = { seq: 0, throttle: 0, turn: 0 };
  const roomCode = message.type === 'join' && message.roomCode ? message.roomCode.trim().toUpperCase() : createCode();
  let room = rooms.get(roomCode);
  if (!room) {
    room = {
      code: roomCode,
      difficulty: message.difficulty,
      state: createGameState({
        roomCode,
        mode: message.mode,
        duration: message.testDuration ?? 180,
        aiCount: message.type === 'practice' ? 5 : 4,
      }),
      inputs: new Map(),
      clients: new Map(),
    };
    rooms.set(roomCode, room);
  }
  if (room.clients.size >= ROOM_LIMIT) {
    sendWs(ws, { type: 'error', message: 'Room is full' });
    return;
  }
  const boat = addBoat(room.state, {
    playerId,
    name: message.nickname?.trim() || 'Captain',
    ai: false,
    replaceAi: true,
  });
  const client: Client = { id: playerId, ws, roomCode: room.code, boatId: boat.id, input };
  clients.set(ws, client);
  room.clients.set(playerId, client);
  room.inputs.set(playerId, input);
  sendWs(ws, { type: 'joined', playerId, boatId: boat.id, roomCode: room.code, authoritative: true });
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
  b.z = -14;
  b.angle = -Math.PI / 2;
  b.hp = b.maxHp;
  b.cooldownRight = 0;
}

function createCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function sendWs(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!existsSync(DIST)) {
    send(res, 200, 'Stormbreakers dev server is running. Start Vite on port 5173 for the client.', 'text/plain');
    return;
  }
  const rawUrl = req.url?.split('?')[0] ?? '/';
  const safe = normalize(rawUrl).replace(/^(\.\.[/\\])+/, '');
  const requestPath = safe === '/' ? '/index.html' : safe;
  const filePath = join(DIST, requestPath);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not file');
    res.writeHead(200, { 'Content-Type': mime(filePath), 'Cache-Control': 'public, max-age=300' });
    createReadStream(filePath).pipe(res);
  } catch {
    const index = await readFile(join(DIST, 'index.html'));
    send(res, 200, index, 'text/html');
  }
}

function send(res: ServerResponse, status: number, body: string | Buffer, type: string): void {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function mime(path: string): string {
  switch (extname(path)) {
    case '.html':
      return 'text/html';
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
