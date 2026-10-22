import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoatState, ClientMessage, Difficulty, GameState, Mode, PlayerInput, ServerMessage } from '../../shared/protocol';
import { addBoat, cloneStateForClient, createGameState, predictBoatMovement, stepGame, stopBoatMotion } from '../../shared/simulation';

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
  restart: () => void;
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
  const predictionRef = useRef<BoatState | null>(null);
  const pendingStopRef = useRef<{ seq: number; x: number; z: number } | null>(null);

  const publishPrediction = useCallback(() => {
    const authority = stateRef.current;
    if (!authority) return;
    const rendered = cloneStateForClient(authority);
    const predicted = predictionRef.current;
    const player = rendered.boats.find((boat) => boat.id === predicted?.id);
    if (player && predicted) {
      Object.assign(player, { x: predicted.x, z: predicted.z, vx: predicted.vx, vz: predicted.vz, angle: predicted.angle });
    }
    setState(rendered);
  }, []);

  useEffect(() => {
    localIdsRef.current = ids;
  }, [ids]);

  const updateInput = useCallback((patch: Partial<PlayerInput>) => {
    const wasStopped = inputRef.current.stop;
    inputRef.current = {
      ...inputRef.current,
      ...patch,
      seq: inputRef.current.seq + 1,
    };
    if (inputRef.current.stop) {
      const boat = predictionRef.current ?? stateRef.current?.boats.find((candidate) => candidate.id === localIdsRef.current.boatId);
      if (boat) {
        stopBoatMotion(boat);
        if (predictionRef.current && !wasStopped) {
          pendingStopRef.current = { seq: inputRef.current.seq, x: boat.x, z: boat.z };
        }
        publishPrediction();
      }
    } else {
      pendingStopRef.current = null;
    }
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', input: inputRef.current } satisfies ClientMessage));
    }
  }, [publishPrediction]);

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

  const restart = useCallback(() => {
    if (stateRef.current?.ended && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'restart' } satisfies ClientMessage));
    }
  }, []);

  useEffect(() => {
    if (!options) return;
    setError(undefined);
    inputRef.current = { seq: 0, throttle: 0, turn: 0 };
    predictionRef.current = null;
    pendingStopRef.current = null;
    roomCodeRef.current = '';

    if (options.kind === 'practice') {
      const playerId = `local-${Date.now()}`;
      const local = createGameState({ roomCode: 'SOLO', mode: options.mode, aiCount: 6, duration: 180 });
      const boat = addBoat(local, { playerId, name: options.nickname, ai: false, replaceAi: true });
      stateRef.current = local;
      localIdsRef.current = { playerId, boatId: boat.id, roomCode: 'SOLO' };
      setIds(localIdsRef.current);
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
          inputRef.current = { seq: 0, throttle: 0, turn: 0 };
          predictionRef.current = null;
          pendingStopRef.current = null;
          pausedRef.current = false;
          setPausedState(false);
          roomCodeRef.current = message.roomCode;
          localIdsRef.current = { playerId: message.playerId, boatId: message.boatId, roomCode: message.roomCode };
          setIds(localIdsRef.current);
        } else if (message.type === 'state') {
          stateRef.current = message.state;
          const own = message.state.boats.find((boat) => boat.id === localIdsRef.current.boatId);
          if (own) {
            predictionRef.current = { ...own };
            if (inputRef.current.stop) {
              const pending = pendingStopRef.current;
              // Pre-release snapshots must not restart local motion while stop is in flight.
              if (pending && own.lastInputSeq < pending.seq && own.hp > 0) {
                predictionRef.current.x = pending.x;
                predictionRef.current.z = pending.z;
              } else {
                pendingStopRef.current = null;
              }
              stopBoatMotion(predictionRef.current);
            }
          }
          publishPrediction();
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
    let frame = 0;
    let last = performance.now();
    const predict = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (wsRef.current?.readyState === WebSocket.OPEN && stateRef.current?.running && !stateRef.current.ended && predictionRef.current) {
        predictionRef.current = predictBoatMovement(stateRef.current, predictionRef.current, inputRef.current, dt);
        publishPrediction();
      }
      frame = requestAnimationFrame(predict);
    };
    frame = requestAnimationFrame(predict);
    const timer = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', input: inputRef.current } satisfies ClientMessage));
    }, 50);
    return () => {
      closed = true;
      window.clearInterval(timer);
      cancelAnimationFrame(frame);
      window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [options, publishPrediction]);

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
      restart,
      latestInput: inputRef.current,
      error,
    }),
    [connected, error, ids, options?.kind, paused, setPaused, state, updateInput, restart],
  );
}
