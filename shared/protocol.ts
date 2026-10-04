export type Mode = 'battle' | 'storm' | 'treasure';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Quality = 'low' | 'medium' | 'high';

export interface Vec2 {
  x: number;
  z: number;
}

export interface PlayerInput {
  seq: number;
  throttle: number;
  turn: number;
  dragTarget?: Vec2 | null;
  stop?: boolean;
  boost?: boolean;
  repair?: boolean;
  supply?: boolean;
  fireLeft?: boolean;
  fireRight?: boolean;
}

export interface BoatState {
  id: string;
  playerId?: string;
  name: string;
  ai: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  angle: number;
  hp: number;
  maxHp: number;
  hullHits: { side: number; z: number; damage: number }[];
  score: number;
  sunkUntil: number;
  cooldownLeft: number;
  cooldownRight: number;
  boostCooldown: number;
  repairCooldown: number;
  supplyCooldown: number;
  boostTime: number;
  salvoCount: number;
  weaponLevel: number;
  powerUntil: number;
  color: string;
  lastInputSeq: number;
}

export interface CannonballState {
  id: string;
  ownerId: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  ttl: number;
  side: 'left' | 'right';
  damage: number;
  explosive: boolean;
}

export interface ChestState {
  id: string;
  x: number;
  z: number;
  expiresAt: number;
  kind: 'normal' | 'large';
}

export interface StormCellState {
  id: string;
  x: number;
  z: number;
  radius: number;
  phase: number;
}

export interface IslandState {
  id: string;
  x: number;
  z: number;
  radius: number;
}

export interface GameState {
  roomCode: string;
  mode: Mode;
  tick: number;
  now: number;
  duration: number;
  timeLeft: number;
  running: boolean;
  ended: boolean;
  winnerId?: string;
  winnerName?: string;
  boats: BoatState[];
  cannonballs: CannonballState[];
  chests: ChestState[];
  storms: StormCellState[];
  islands: IslandState[];
  events: GameEvent[];
}

export type GameEvent =
  | { type: 'fire'; boatId: string; side: 'left' | 'right'; x: number; z: number; angle: number }
  | { type: 'hit'; boatId: string; targetId: string; x: number; z: number }
  | { type: 'sink'; boatId: string; targetId: string; x: number; z: number }
  | { type: 'chest'; boatId: string; x: number; z: number }
  | { type: 'respawn'; boatId: string; x: number; z: number }
  | { type: 'repair'; boatId: string; x: number; z: number; healing?: number }
  | { type: 'boost' | 'reload'; boatId: string; x: number; z: number }
  | { type: 'explosion'; boatId: string; x: number; z: number };

export type ClientMessage =
  | { type: 'join'; nickname: string; mode: Mode; difficulty: Difficulty; roomCode?: string; create?: boolean; testDuration?: number }
  | { type: 'practice'; nickname: string; mode: Mode; difficulty: Difficulty; testDuration?: number }
  | { type: 'input'; input: PlayerInput }
  | { type: 'pause'; paused: boolean }
  | { type: 'debug'; command: 'placeDuel' | 'fastEnd' };

export type ServerMessage =
  | { type: 'joined'; playerId: string; boatId: string; roomCode: string; authoritative: true }
  | { type: 'state'; playerId?: string; state: GameState }
  | { type: 'error'; message: string };

export const MODE_LABELS: Record<Mode, { zh: string; en: string }> = {
  battle: { zh: '自由海战', en: 'Free Battle' },
  storm: { zh: '风暴生存', en: 'Storm Survival' },
  treasure: { zh: '宝藏争夺', en: 'Treasure Raid' },
};
