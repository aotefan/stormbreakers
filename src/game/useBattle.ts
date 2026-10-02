import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientMessage, Difficulty, GameState, Mode, PlayerInput, ServerMessage } from '../../shared/protocol';
import { addBoat, cloneStateForClient, createGameState, stepGame } from '../../shared/simulation';

export type SessionKind = 'practice' | 'online';

export interface SessionOptions {
  kind: SessionKind;
  nickname: string;
  mode: Mode;
  difficulty: Difficulty;
  roomCode?: string;
  create?: boolean;
}

export interface BattleSession {
  state: GameState | null;
  playerId: string;
  boatId: string;
  roomCode: string;
  connected: boolean;
  authoritative: boolean;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  updateInput: (patch: Partial<PlayerInput>) => void;
  latestInput: PlayerInput;
  error?: string;
}

export function useBattle(options: SessionOptions | null): BattleSession {
  const [state, setState] = useState<GameState | null>(null);
  const [ids, setIds] = useState({ playerId: '', boatId: '', roomCode: '' });
  const [connected, setConnected] = useState(false);
  const [paused, setPausedState] = useState(false);
  const [error, setError] = useState<string>();
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<PlayerInput>({ seq: 0, throttle: 0, turn: 0 });
  const stateRef = useRef<GameState | null>(null);
  const localIdsRef = useRef(ids);
  const pausedRef = useRef(false);
  const roomCodeRef = useRef('');

  useEffect(() => {
    localIdsRef.current = ids;
  }, [ids]);

  const updateInput = useCallback((patch: Partial<PlayerInput>) => {
    inputRef.current = {
      ...inputRef.current,
      ...patch,
      seq: inputRef.current.seq + 1,
    };
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', input: inputRef.current } satisfies ClientMessage));
    }
  }, []);

  const setPaused = useCallback((next: boolean) => {
    pausedRef.current = next;
    setPausedState(next);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'pause', paused: next } satisfies ClientMessage));
    } else if (stateRef.current) {
      stateRef.current.running = !next;
      setState(cloneStateForClient(stateRef.current));
    }
  }, []);

  useEffect(() => {
    if (!options) return;
    setError(undefined);
    inputRef.current = { seq: 0, throttle: 0, turn: 0 };

    if (options.kind === 'practice') {
      const playerId = `local-${Date.now()}`;
      const local = createGameState({ roomCode: 'SOLO', mode: options.mode, aiCount: 5, duration: 180 });
      const boat = addBoat(local, { playerId, name: options.nickname, ai: false, replaceAi: true });
      stateRef.current = local;
      setIds({ playerId, boatId: boat.id, roomCode: 'SOLO' });
      setConnected(true);
      setState(cloneStateForClient(local));
      let last = performance.now();
      let raf = 0;
      const loop = (now: number) => {
        const dt = Math.min(0.08, (now - last) / 1000);
        last = now;
        if (stateRef.current?.running && !pausedRef.current && !stateRef.current.ended) {
          stepGame(stateRef.current, dt, new Map([[playerId, inputRef.current]]), options.difficulty);
          setState(cloneStateForClient(stateRef.current));
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }

    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.port === '5173' ? `${window.location.hostname}:8787` : window.location.host;
    let closed = false;
    let reconnectTimer = 0;
    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(`${scheme}//${host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        const payload: ClientMessage = {
          type: 'join',
          nickname: options.nickname,
          mode: options.mode,
          difficulty: options.difficulty,
          roomCode: roomCodeRef.current || options.roomCode,
          create: options.create,
        };
        ws.send(JSON.stringify(payload));
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerMessage;
        if (message.type === 'joined') {
          roomCodeRef.current = message.roomCode;
          setIds({ playerId: message.playerId, boatId: message.boatId, roomCode: message.roomCode });
        } else if (message.type === 'state') {
          stateRef.current = message.state;
          setState(message.state);
        } else if (message.type === 'error') {
          setError(message.message);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) reconnectTimer = window.setTimeout(connect, 1400);
      };
      ws.onerror = () => setError('WebSocket connection failed');
    };
    connect();
    const timer = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', input: inputRef.current } satisfies ClientMessage));
    }, 50);
    return () => {
      closed = true;
      window.clearInterval(timer);
      window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [options]);

  return useMemo(
    () => ({
      state,
      playerId: ids.playerId,
      boatId: ids.boatId,
      roomCode: ids.roomCode,
      connected,
      authoritative: options?.kind === 'online',
      paused,
      setPaused,
      updateInput,
      latestInput: inputRef.current,
      error,
    }),
    [connected, error, ids, options?.kind, paused, setPaused, state, updateInput],
  );
}
