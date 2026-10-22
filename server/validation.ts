import type { ClientMessage, PlayerInput } from '../shared/protocol';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function number(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function invalid(): never { throw new Error('Invalid message'); }

// TypeScript types do not validate untrusted WebSocket JSON at runtime.
export function parseMessage(value: unknown): ClientMessage {
  if (!object(value)) return invalid();
  switch (value.type) {
    case 'input': {
      const input = value.input;
      if (!object(input) || !Number.isSafeInteger(input.seq) || !number(input.seq, 0, Number.MAX_SAFE_INTEGER)
        || !number(input.throttle, -1, 1) || !number(input.turn, -1, 1)) return invalid();
      const clean: PlayerInput = { seq: input.seq, throttle: input.throttle, turn: input.turn };
      for (const key of ['stop', 'boost', 'repair', 'supply', 'fireLeft', 'fireRight'] as const) {
        if (input[key] !== undefined) {
          if (typeof input[key] !== 'boolean') return invalid();
          clean[key] = input[key];
        }
      }
      if (input.dragTarget === null) clean.dragTarget = null;
      else if (input.dragTarget !== undefined) {
        if (!object(input.dragTarget) || !number(input.dragTarget.x, -10000, 10000)
          || !number(input.dragTarget.z, -10000, 10000)) return invalid();
        clean.dragTarget = { x: input.dragTarget.x, z: input.dragTarget.z };
      }
      return { type: 'input', input: clean };
    }
    case 'join':
    case 'practice': {
      if (typeof value.mode !== 'string' || !['battle', 'storm', 'treasure'].includes(value.mode)
        || typeof value.difficulty !== 'string' || !['easy', 'normal', 'hard'].includes(value.difficulty)
        || typeof value.nickname !== 'string' || value.nickname.length > 24) return invalid();
      const nickname = value.nickname.replace(/[\u0000-\u001f\u007f]/g, '').trim() || 'Captain';
      if (value.create !== undefined && typeof value.create !== 'boolean') return invalid();
      if (value.roomCode !== undefined && (typeof value.roomCode !== 'string'
        || (value.roomCode !== '' && !/^[A-Z0-9]{5}$/i.test(value.roomCode)))) return invalid();
      if (value.testDuration !== undefined && !number(value.testDuration, 0.1, 180)) return invalid();
      return {
        type: value.type, nickname,
        mode: value.mode as 'battle' | 'storm' | 'treasure',
        difficulty: value.difficulty as 'easy' | 'normal' | 'hard',
        ...(value.type === 'join' ? { roomCode: (value.roomCode as string | undefined)?.toUpperCase(), create: value.create as boolean | undefined } : {}),
        ...(value.testDuration === undefined ? {} : { testDuration: value.testDuration as number }),
      };
    }
    case 'pause':
      if (typeof value.paused !== 'boolean') return invalid();
      return { type: 'pause', paused: value.paused };
    case 'restart': return { type: 'restart' };
    case 'debug':
      if (value.command !== 'placeDuel' && value.command !== 'fastEnd') return invalid();
      return { type: 'debug', command: value.command };
    default: return invalid();
  }
}
