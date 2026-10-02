import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Difficulty, Mode, PlayerInput, Quality, Vec2 } from '../../shared/protocol';
import { MODE_LABELS } from '../../shared/protocol';
import { ProceduralAudio } from '../game/audio';
import { type SessionOptions, useBattle } from '../game/useBattle';
import StormScene from '../three/StormScene';

type Lang = 'zh' | 'en';
type Labels = Record<keyof (typeof text)['zh'], string>;

const text = {
  zh: {
    title: '破风者',
    subtitle: 'Stormbreakers',
    nickname: '船长昵称',
    start: '扬帆出航',
    practice: '人机练习',
    match: '自动匹配',
    create: '创建房间',
    join: '房间码加入',
    room: '房间码',
    mode: '模式',
    difficulty: '难度',
    quality: '画质',
    volume: '音量',
    mute: '静音',
    guide: '指南',
    guideBody: 'WASD 航行，Q/E 左右舷开炮，Space 冲刺，R 修复。移动端按住自己的船拖动，松开停止；另一根手指点左右半屏开炮。每局 180 秒，击沉 +100，宝箱 +35/45，最高分胜。',
    battleBody: '自由海战：宝箱少，重点是走位和左右舷炮交火。',
    stormBody: '风暴生存：移动风暴会推船并造成伤害，活着会持续得分。',
    treasureBody: '宝藏争夺：宝箱更多且价值更高，抢宝和拦截同样重要。',
    onlineNote: '联机菜单打开时服务器仍继续运行，只有单机暂停会冻结模拟和计时。',
    pause: '暂停',
    resume: '继续',
    quit: '返回首页',
    hp: '血量',
    score: '积分',
    time: '倒计时',
    cooldown: '冷却',
    winner: '胜者',
    connecting: '连接中',
    authoritative: '服务器权威同步',
    soloFrozen: '单机已冻结',
    onlineRunning: '联机仍在运行',
    boost: '冲刺',
    repair: '修复',
    supply: '补给',
  },
  en: {
    title: 'Stormbreakers',
    subtitle: '破风者',
    nickname: 'Captain name',
    start: 'Set Sail',
    practice: 'AI Practice',
    match: 'Quick Match',
    create: 'Create Room',
    join: 'Join Code',
    room: 'Room code',
    mode: 'Mode',
    difficulty: 'Difficulty',
    quality: 'Quality',
    volume: 'Volume',
    mute: 'Mute',
    guide: 'Guide',
    guideBody: 'WASD to sail, Q/E for port/starboard cannons, Space to boost, R to repair. On touch, hold your ship and drag; release to stop. Use another finger on either half of the screen to fire. Rounds last 180 seconds. Sink +100, chest +35/45, top score wins.',
    battleBody: 'Free Battle: fewer chests, more broadside duels and positioning.',
    stormBody: 'Storm Survival: moving storm cells shove ships, deal damage, and survival scores over time.',
    treasureBody: 'Treasure Raid: more chests with higher value, rewarding raids and interception.',
    onlineNote: 'Online matches keep running while menus are open. Only solo pause freezes simulation and timer.',
    pause: 'Pause',
    resume: 'Resume',
    quit: 'Home',
    hp: 'HP',
    score: 'Score',
    time: 'Timer',
    cooldown: 'Cooldown',
    winner: 'Winner',
    connecting: 'Connecting',
    authoritative: 'Server authoritative',
    soloFrozen: 'Solo frozen',
    onlineRunning: 'Online still running',
    boost: 'Boost',
    repair: 'Repair',
    supply: 'Supply',
  },
} as const;

export default function App() {
  const [lang, setLang] = useState<Lang>('zh');
  const [nickname, setNickname] = useState('Tina');
  const [mode, setMode] = useState<Mode>('battle');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [quality, setQuality] = useState<Quality>('medium');
  const [volume, setVolume] = useState(0.45);
  const [muted, setMuted] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [session, setSession] = useState<SessionOptions | null>(null);
  const t = text[lang];

  if (session) {
    return (
      <BattleScreen
        session={session}
        onExit={() => setSession(null)}
        lang={lang}
        labels={t}
        quality={quality}
        volume={volume}
        muted={muted}
      />
    );
  }

  return (
    <main className="menu-shell">
      <section className="hero-panel">
        <div className="brand-row">
          <div>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
          <button className="icon-button" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} aria-label="language">
            {lang === 'zh' ? 'EN' : '中'}
          </button>
        </div>

        <div className="menu-grid">
          <label>
            {t.nickname}
            <input data-testid="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} />
          </label>
          <label>
            {t.mode}
            <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
              {(['battle', 'storm', 'treasure'] as const).map((candidate) => (
                <option key={candidate} value={candidate}>
                  {MODE_LABELS[candidate][lang]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.difficulty}
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label>
            {t.quality}
            <select value={quality} onChange={(event) => setQuality(event.target.value as Quality)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            {t.volume}
            <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} />
            {t.mute}
          </label>
        </div>

        <div className="action-row">
          <button data-testid="practice" onClick={() => setSession({ kind: 'practice', nickname, mode, difficulty })}>{t.practice}</button>
          <button data-testid="match" onClick={() => setSession({ kind: 'online', nickname, mode, difficulty })}>{t.match}</button>
          <button data-testid="create-room" onClick={() => setSession({ kind: 'online', nickname, mode, difficulty, create: true })}>{t.create}</button>
        </div>
        <div className="join-row">
          <input data-testid="room-code" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder={t.room} maxLength={5} />
          <button data-testid="join-room" onClick={() => setSession({ kind: 'online', nickname, mode, difficulty, roomCode })}>{t.join}</button>
        </div>
      </section>

      <section className="guide-panel">
        <h2>{t.guide}</h2>
        <p>{t.guideBody}</p>
        <p>{t.battleBody}</p>
        <p>{t.stormBody}</p>
        <p>{t.treasureBody}</p>
        <p className="note">{t.onlineNote}</p>
      </section>
    </main>
  );
}

interface BattleProps {
  session: SessionOptions;
  onExit: () => void;
  lang: Lang;
  labels: Labels;
  quality: Quality;
  volume: number;
  muted: boolean;
}

function BattleScreen({ session, onExit, labels, quality, volume, muted }: BattleProps) {
  const battle = useBattle(session);
  const [dragTarget, setDragTarget] = useState<Vec2 | null>(null);
  const dragPointer = useRef<number | null>(null);
  const audio = useRef(new ProceduralAudio(volume, muted));
  const lastInput = useRef<PlayerInput>({ seq: 0, throttle: 0, turn: 0 });
  const player = battle.state?.boats.find((boat) => boat.id === battle.boatId);
  const sorted = useMemo(() => [...(battle.state?.boats ?? [])].sort((a, b) => b.score - a.score), [battle.state]);

  useEffect(() => {
    audio.current.updateSettings(volume, muted);
  }, [muted, volume]);

  useEffect(() => {
    if (!battle.state) return;
    audio.current.handle(battle.state.events, battle.state.tick);
    if (battle.state.tick % 20 === 0) audio.current.waves(!muted);
  }, [battle.state, muted]);

  const pushInput = useCallback(
    (patch: Partial<PlayerInput>) => {
      lastInput.current = { ...lastInput.current, ...patch };
      battle.updateInput(lastInput.current);
    },
    [battle],
  );

  const pulse = useCallback(
    (key: 'fireLeft' | 'fireRight' | 'boost' | 'repair' | 'supply') => {
      pushInput({ [key]: true });
      window.setTimeout(() => pushInput({ [key]: false }), 80);
    },
    [pushInput],
  );

  useEffect(() => {
    const keys = new Set<string>();
    const sync = () => {
      const throttle = (keys.has('w') ? 1 : 0) + (keys.has('s') ? -0.55 : 0);
      const turn = (keys.has('a') ? 1 : 0) + (keys.has('d') ? -1 : 0);
      pushInput({ throttle, turn, dragTarget: null });
    };
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e', ' ', 'r'].includes(key)) event.preventDefault();
      if (key === 'q') pulse('fireLeft');
      else if (key === 'e') pulse('fireRight');
      else if (key === ' ') pulse('boost');
      else if (key === 'r') pulse('repair');
      else {
        keys.add(key);
        sync();
      }
    };
    const up = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
      sync();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [pulse, pushInput]);

  const onWorldPointer = useCallback(
    (event: { type: 'start' | 'move' | 'end'; pointerId: number; world?: Vec2; clientX: number; clientY: number }) => {
      if (!player || !event.world) return;
      if (event.type === 'start') {
        const nearOwnShip = Math.hypot(event.world.x - player.x, event.world.z - player.z) < 9;
        if (dragPointer.current === null && nearOwnShip) {
          dragPointer.current = event.pointerId;
          setDragTarget(event.world);
          pushInput({ dragTarget: event.world, throttle: 1, turn: 0 });
        } else if (dragPointer.current !== null) {
          pulse(event.clientX < window.innerWidth / 2 ? 'fireLeft' : 'fireRight');
        }
      } else if (event.type === 'move' && dragPointer.current === event.pointerId) {
        setDragTarget(event.world);
        pushInput({ dragTarget: event.world });
      } else if (event.type === 'end' && dragPointer.current === event.pointerId) {
        dragPointer.current = null;
        setDragTarget(null);
        pushInput({ dragTarget: null, throttle: 0, turn: 0 });
      }
    },
    [player, pulse, pushInput],
  );

  return (
    <main className="battle-shell">
      <StormScene state={battle.state} boatId={battle.boatId} quality={quality} dragTarget={dragTarget} onWorldPointer={onWorldPointer} />
      <section className="hud top-left">
        <strong>{MODE_LABELS[session.mode].zh} / {MODE_LABELS[session.mode].en}</strong>
        <span>
          {battle.connected ? labels.authoritative : labels.connecting} · {battle.roomCode || '...'}
        </span>
        {battle.error ? <span className="danger">{battle.error}</span> : null}
      </section>
      <section className="hud top-center">
        <span>{labels.time}</span>
        <strong>{formatTime(battle.state?.timeLeft ?? 180)}</strong>
      </section>
      <section className="hud top-right">
        <button data-testid="pause" onClick={() => battle.setPaused(!battle.paused)}>{battle.paused ? labels.resume : labels.pause}</button>
        <button className="ghost" onClick={onExit}>{labels.quit}</button>
        <span>{session.kind === 'practice' && battle.paused ? labels.soloFrozen : session.kind === 'online' ? labels.onlineRunning : ''}</span>
      </section>

      <section className="scoreboard" data-testid="scoreboard">
        {sorted.map((boat) => (
          <div key={boat.id} className={boat.id === battle.boatId ? 'me' : ''}>
            <span>{boat.name}{boat.ai ? ' AI' : ''}</span>
            <b>{Math.round(boat.score)}</b>
          </div>
        ))}
      </section>

      <section className="bottom-hud">
        <div className="meter">
          <span>{labels.hp}</span>
          <div><i style={{ width: `${Math.max(0, player?.hp ?? 0)}%` }} /></div>
        </div>
        <div className="skills">
          <button onPointerDown={() => pulse('fireLeft')}>Q</button>
          <button onPointerDown={() => pulse('boost')}>{labels.boost}</button>
          <button onPointerDown={() => pulse('repair')}>{labels.repair}</button>
          <button onPointerDown={() => pulse('supply')}>{labels.supply}</button>
          <button onPointerDown={() => pulse('fireRight')}>E</button>
        </div>
        <div className="cooldowns">
          <span>L {cool(player?.cooldownLeft)}</span>
          <span>{labels.boost} {cool(player?.boostCooldown)}</span>
          <span>{labels.repair} {cool(player?.repairCooldown)}</span>
          <span>R {cool(player?.cooldownRight)}</span>
        </div>
      </section>

      <MiniMap state={battle.state} boatId={battle.boatId} />
      {battle.state?.ended ? (
        <section className="end-modal">
          <h2>{labels.winner}: {battle.state.winnerName}</h2>
          <button onClick={onExit}>{labels.quit}</button>
        </section>
      ) : null}
    </main>
  );
}

function MiniMap({ state, boatId }: { state: ReturnType<typeof useBattle>['state']; boatId: string }) {
  return (
    <section className="minimap" data-testid="minimap">
      {(state?.islands ?? []).map((island) => (
        <i key={island.id} className="island" style={{ left: `${50 + island.x / 2}%`, top: `${50 + island.z / 2}%`, width: island.radius, height: island.radius }} />
      ))}
      {(state?.boats ?? []).map((boat) => (
        <b key={boat.id} className={boat.id === boatId ? 'me' : boat.ai ? 'ai' : ''} style={{ left: `${50 + boat.x / 2}%`, top: `${50 + boat.z / 2}%` }} />
      ))}
    </section>
  );
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function cool(value = 0): string {
  return value <= 0 ? 'OK' : `${value.toFixed(1)}s`;
}
