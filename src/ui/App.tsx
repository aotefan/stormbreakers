import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react';
import type { Difficulty, Mode, PlayerInput, Quality, Vec2 } from '../../shared/protocol';
import { MODE_LABELS } from '../../shared/protocol';
import { ProceduralAudio } from '../game/audio';
import { type SessionOptions, useBattle } from '../game/useBattle';
import StormScene from '../three/StormScene';
import { WEAPONS, weaponLevel } from '../../shared/weapons';
import { ABILITIES, canBoost } from '../../shared/abilities';

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
    guideBody: 'WASD 航行，面向船头：Q 左舷开炮，E 右舷开炮；Space 冲刺，R 修复，F 快速装填。移动端按住自己的船拖动，松开停止；另一根手指点左右半屏开炮。每局 180 秒，击沉 +100，宝箱 +35/45，最高分胜。',
    supplyGuide: '补给仅限玩家拾取。普通箱逐级升级：2 枚炮弹伤害 +20%；3 枚伤害 +50%，每 0.65 秒连发；满级 5 枚爆破弹伤害 +100%，每 0.35 秒连发。大箱直接满级。强化持续 15 秒，再拾取刷新；箱子存在 30 秒。按住 Q/E、开炮按钮或拖船时按住另一根手指持续开火，松开停火。',
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
    supply: '快速装填',
    leftCannon: '左舷开炮',
    rightCannon: '右舷开炮',
    weapon: '齐射',
    enhanced: '伤害',
    explosive: '爆破',
    holdFire: '按住连发',
    firing: '连发中',
    reloading: '装填中',
    boostEffect: '航速 +50%',
    boostActive: '冲刺中',
    sailFirst: '先航行再冲刺',
    repairEffect: '恢复 30 血量',
    fullHealth: '满血，无需修复',
    reloadEffect: '两侧火炮立即就绪',
    loaded: '火炮已就绪',
    reloadDone: '两侧火炮已装填',
    repaired: '血量恢复',
    sunk: '等待重生',
    spaceKey: '空格',
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
    guideBody: 'WASD to sail. Facing the bow, Q fires port (left), E fires starboard (right). Space boosts, R repairs, F instantly reloads both cannons. On touch, hold your ship and drag; release to stop. Use another finger on either half of the screen to fire. Rounds last 180 seconds. Sink +100, chest +35/45, top score wins.',
    supplyGuide: 'Only players collect supplies. Normal crates upgrade: 2 balls at +20% damage; 3 at +50%, every 0.65s; then 5 explosive balls at +100%, every 0.35s. Large crates grant max power. Power lasts 15s; pickups refresh it. Crates last 30s. Hold Q/E, a cannon button, or a second finger while dragging your ship to keep firing; release to stop.',
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
    supply: 'Quick reload',
    leftCannon: 'Port cannon',
    rightCannon: 'Stbd cannon',
    weapon: 'Salvo',
    enhanced: 'Damage',
    explosive: 'Explosive',
    holdFire: 'Hold to fire',
    firing: 'Firing',
    reloading: 'Reloading',
    boostEffect: '+50% speed',
    boostActive: 'Boosting',
    sailFirst: 'Sail to boost',
    repairEffect: 'Restore 30 HP',
    fullHealth: 'Full HP',
    reloadEffect: 'Ready both cannons',
    loaded: 'Cannons ready',
    reloadDone: 'Both cannons reloaded',
    repaired: 'HP restored',
    sunk: 'Respawning',
    spaceKey: 'Space',
  },
} as const;

export default function App() {
  const [lang, setLang] = useState<Lang>('zh');
  const [nickname, setNickname] = useState('孙警醒');
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
        <p>{t.supplyGuide}</p>
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
  const fireSources = useRef(new Map<string, { side: 'fireLeft' | 'fireRight'; started: number; timer?: number }>());
  const keys = useRef(new Set<string>());
  const skillTimers = useRef(new Set<number>());
  const [feedback, setFeedback] = useState('');
  const feedbackTimer = useRef<number | undefined>(undefined);
  const feedbackTick = useRef(-1);
  const player = battle.state?.boats.find((boat) => boat.id === battle.boatId);
  const weapon = WEAPONS[weaponLevel(player, battle.state?.now ?? 0)];
  const locked = battle.paused || !!battle.state?.ended || !player || player.hp <= 0;
  const sailing = !!player && canBoost(player, lastInput.current);
  const controls = useRef({ player, locked });
  controls.current = { player, locked };
  const sorted = useMemo(() => [...(battle.state?.boats ?? [])].sort((a, b) => b.score - a.score), [battle.state]);

  useEffect(() => {
    audio.current.updateSettings(volume, muted);
  }, [muted, volume]);

  const notify = useCallback((message: string) => {
    window.clearTimeout(feedbackTimer.current);
    setFeedback(message);
    feedbackTimer.current = window.setTimeout(() => setFeedback(''), 2200);
  }, []);

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);

  useEffect(() => {
    if (!battle.state) return;
    audio.current.handle(battle.state.events, battle.state.tick);
    if (battle.state.tick % 20 === 0) audio.current.waves(!muted);
    if (feedbackTick.current !== battle.state.tick) {
      feedbackTick.current = battle.state.tick;
      for (const event of battle.state.events) {
        if (event.boatId !== battle.boatId) continue;
        if (event.type === 'boost') notify(`${labels.boostActive} · ${labels.boostEffect}`);
        if (event.type === 'repair') notify(`${labels.repaired} +${Number((event.healing ?? ABILITIES.repair.healing).toFixed(1))}`);
        if (event.type === 'reload') notify(labels.reloadDone);
      }
    }
  }, [battle.state, battle.boatId, labels, muted, notify]);

  const pushInput = useCallback(
    (patch: Partial<PlayerInput>) => {
      lastInput.current = { ...lastInput.current, ...patch };
      battle.updateInput(lastInput.current);
    },
    [battle.updateInput],
  );

  const pulse = useCallback(
    (key: 'boost' | 'repair' | 'supply') => {
      const { player, locked } = controls.current;
      if (locked || !player) return;
      const cooldown = key === 'boost' ? player.boostCooldown : key === 'repair' ? player.repairCooldown : player.supplyCooldown;
      if (cooldown > 0) { notify(`${labels.cooldown} ${cool(cooldown)}`); return; }
      if (key === 'boost' && !canBoost(player, lastInput.current)) { notify(labels.sailFirst); return; }
      if (key === 'repair' && player.hp >= player.maxHp) { notify(labels.fullHealth); return; }
      if (key === 'supply' && player.cooldownLeft <= 0 && player.cooldownRight <= 0) { notify(labels.loaded); return; }
      pushInput({ [key]: true });
      const timer = window.setTimeout(() => {
        skillTimers.current.delete(timer);
        pushInput({ [key]: false });
      }, 80);
      skillTimers.current.add(timer);
    },
    [pushInput, labels, notify],
  );

  const syncFire = useCallback(() => {
    const sources = [...fireSources.current.values()];
    pushInput({ fireLeft: sources.some(s => s.side === 'fireLeft'), fireRight: sources.some(s => s.side === 'fireRight') });
  }, [pushInput]);

  const startFire = useCallback((source: string, side: 'fireLeft' | 'fireRight') => {
    if (battle.paused || battle.state?.ended) return;
    window.clearTimeout(fireSources.current.get(source)?.timer);
    fireSources.current.set(source, { side, started: performance.now() });
    syncFire();
  }, [battle.paused, battle.state?.ended, syncFire]);

  const stopFire = useCallback((source: string, cancelled = false) => {
    const held = fireSources.current.get(source);
    if (!held) return;
    if (held.timer !== undefined) {
      if (!cancelled) return;
      window.clearTimeout(held.timer);
    }
    const release = () => { fireSources.current.delete(source); syncFire(); };
    // Preserve quick taps long enough for a simulation/network tick; held fire releases immediately.
    const remaining = cancelled ? 0 : 80 - (performance.now() - held.started);
    if (remaining > 0) held.timer = window.setTimeout(release, remaining);
    else release();
  }, [syncFire]);

  const releaseControls = useCallback(() => {
    fireSources.current.forEach(s => window.clearTimeout(s.timer));
    fireSources.current.clear();
    skillTimers.current.forEach(timer => window.clearTimeout(timer));
    skillTimers.current.clear();
    keys.current.clear();
    dragPointer.current = null;
    setDragTarget(null);
    pushInput({ fireLeft: false, fireRight: false, boost: false, repair: false, supply: false, throttle: 0, turn: 0, dragTarget: null, stop: true });
  }, [pushInput]);

  useEffect(() => {
    const hidden = () => { if (document.hidden) releaseControls(); };
    window.addEventListener('blur', releaseControls);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', releaseControls);
      document.removeEventListener('visibilitychange', hidden);
      fireSources.current.forEach(s => window.clearTimeout(s.timer));
      skillTimers.current.forEach(timer => window.clearTimeout(timer));
    };
  }, [releaseControls]);

  useEffect(() => {
    if (battle.paused || battle.state?.ended) releaseControls();
  }, [battle.paused, battle.state?.ended, releaseControls]);

  useEffect(() => {
    const sync = () => {
      const throttle = (keys.current.has('w') ? 1 : 0) + (keys.current.has('s') ? -0.55 : 0);
      const turn = (keys.current.has('a') ? 1 : 0) + (keys.current.has('d') ? -1 : 0);
      pushInput({ throttle, turn, dragTarget: null, stop: false });
    };
    const down = (event: KeyboardEvent) => {
      if (event.repeat || battle.paused || battle.state?.ended) return;
      const key = event.key.toLowerCase();
      if (key === ' ' && event.target instanceof HTMLElement && event.target.closest('button')) return;
      if (['w', 'a', 's', 'd', 'q', 'e', ' ', 'r', 'f'].includes(key)) event.preventDefault();
      if (key === 'q') startFire('key:q', 'fireLeft');
      else if (key === 'e') startFire('key:e', 'fireRight');
      else if (key === ' ') pulse('boost');
      else if (key === 'r') pulse('repair');
      else if (key === 'f') pulse('supply');
      else if (['w', 'a', 's', 'd'].includes(key)) {
        keys.current.add(key);
        sync();
      }
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'q' || key === 'e') stopFire(`key:${key}`);
      else if (['w', 'a', 's', 'd'].includes(key)) { keys.current.delete(key); sync(); }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [pulse, pushInput, startFire, stopFire, battle.paused, battle.state?.ended]);

  const onWorldPointer = useCallback(
    (event: { type: 'start' | 'move' | 'end'; pointerId: number; world?: Vec2; clientX: number; clientY: number; cancelled?: boolean }) => {
      if (event.type === 'end') {
        stopFire(`pointer:${event.pointerId}`, event.cancelled);
        if (dragPointer.current === event.pointerId) {
          dragPointer.current = null;
          setDragTarget(null);
          pushInput({ dragTarget: null, throttle: 0, turn: 0, stop: true });
        }
        return;
      }
      if (!player || !event.world || battle.paused || battle.state?.ended) return;
      if (event.type === 'start') {
        const nearOwnShip = Math.hypot(event.world.x - player.x, event.world.z - player.z) < 18;
        if (dragPointer.current === null && nearOwnShip) {
          dragPointer.current = event.pointerId;
          setDragTarget(event.world);
          pushInput({ dragTarget: event.world, throttle: 1, turn: 0, stop: false });
        } else if (dragPointer.current !== null) {
          startFire(`pointer:${event.pointerId}`, event.clientX < window.innerWidth / 2 ? 'fireLeft' : 'fireRight');
        }
      } else if (event.type === 'move' && dragPointer.current === event.pointerId) {
        setDragTarget(event.world);
        pushInput({ dragTarget: event.world });
      }
    },
    [player, startFire, stopFire, pushInput, battle.paused, battle.state?.ended],
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
        {session.kind === 'practice' ? (
          <button data-testid="pause" onClick={() => battle.setPaused(!battle.paused)}>{battle.paused ? labels.resume : labels.pause}</button>
        ) : null}
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
        {feedback ? <div className="ability-feedback" role="status" data-testid="ability-feedback">{feedback}</div> : null}
        <div className="meter">
          <span>{labels.hp}</span>
          <div><i style={{ width: `${Math.max(0, (player?.hp ?? 0) / (player?.maxHp || 100)) * 100}%` }} /></div>
          <b data-testid="hp-value">{Math.ceil(Math.max(0, player?.hp ?? 0))}/{player?.maxHp ?? 100}</b>
        </div>
        <div className="skills">
          <SkillButton
            data-testid="fire-left"
            label={labels.leftCannon} icon="‹" shortcut="Q"
            detail={locked ? battle.paused ? labels.pause : labels.sunk : player?.cooldownLeft ? `${labels.reloading} ${cool(player.cooldownLeft)}` : lastInput.current.fireLeft ? labels.firing : labels.holdFire}
            disabled={locked} active={!!lastInput.current.fireLeft && !locked}
            charging={(player?.cooldownLeft ?? 0) > 0} progress={1 - (player?.cooldownLeft ?? 0) / weapon.reload}
            title={`${labels.leftCannon} · ${labels.holdFire}`}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); startFire(`button:${e.pointerId}`, 'fireLeft'); }}
            onPointerUp={e => stopFire(`button:${e.pointerId}`)}
            onPointerCancel={e => stopFire(`button:${e.pointerId}`, true)}
            onLostPointerCapture={e => stopFire(`button:${e.pointerId}`)}
          />
          <SkillButton
            data-testid="boost" label={labels.boost} icon="»" shortcut={labels.spaceKey}
            detail={player?.boostTime ? `${labels.boostActive} ${cool(player.boostTime)}` : player?.boostCooldown ? `${labels.cooldown} ${cool(player.boostCooldown)}` : !sailing ? labels.sailFirst : labels.boostEffect}
            title={`${labels.boostEffect} · ${ABILITIES.boost.duration}s · ${labels.cooldown} ${ABILITIES.boost.cooldown}s`}
            disabled={locked || !sailing || (player?.boostCooldown ?? 0) > 0}
            active={(player?.boostTime ?? 0) > 0}
            charging={(player?.boostCooldown ?? 0) > 0} progress={1 - (player?.boostCooldown ?? 0) / ABILITIES.boost.cooldown}
            onPointerDown={() => pulse('boost')}
            onClick={event => { if (event.detail === 0) pulse('boost'); }}
          />
          <SkillButton
            data-testid="repair" label={labels.repair} icon="+" shortcut="R"
            detail={player?.repairCooldown ? `${labels.cooldown} ${cool(player.repairCooldown)}` : player && player.hp >= player.maxHp ? labels.fullHealth : labels.repairEffect}
            title={`${labels.repairEffect} · ${labels.cooldown} ${ABILITIES.repair.cooldown}s`}
            disabled={locked || (player?.repairCooldown ?? 0) > 0 || !!player && player.hp >= player.maxHp}
            charging={(player?.repairCooldown ?? 0) > 0} progress={1 - (player?.repairCooldown ?? 0) / ABILITIES.repair.cooldown}
            onPointerDown={() => pulse('repair')}
            onClick={event => { if (event.detail === 0) pulse('repair'); }}
          />
          <SkillButton
            data-testid="reload" label={labels.supply} icon="↻" shortcut="F"
            detail={player?.supplyCooldown ? `${labels.cooldown} ${cool(player.supplyCooldown)}` : player && player.cooldownLeft <= 0 && player.cooldownRight <= 0 ? labels.loaded : labels.reloadEffect}
            title={`${labels.reloadEffect} · ${labels.cooldown} ${ABILITIES.supply.cooldown}s`}
            disabled={locked || (player?.supplyCooldown ?? 0) > 0 || !!player && player.cooldownLeft <= 0 && player.cooldownRight <= 0}
            charging={(player?.supplyCooldown ?? 0) > 0} progress={1 - (player?.supplyCooldown ?? 0) / ABILITIES.supply.cooldown}
            onPointerDown={() => pulse('supply')}
            onClick={event => { if (event.detail === 0) pulse('supply'); }}
          />
          <SkillButton
            data-testid="fire-right"
            label={labels.rightCannon} icon="›" shortcut="E"
            detail={locked ? battle.paused ? labels.pause : labels.sunk : player?.cooldownRight ? `${labels.reloading} ${cool(player.cooldownRight)}` : lastInput.current.fireRight ? labels.firing : labels.holdFire}
            disabled={locked} active={!!lastInput.current.fireRight && !locked}
            charging={(player?.cooldownRight ?? 0) > 0} progress={1 - (player?.cooldownRight ?? 0) / weapon.reload}
            title={`${labels.rightCannon} · ${labels.holdFire}`}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); startFire(`button:${e.pointerId}`, 'fireRight'); }}
            onPointerUp={e => stopFire(`button:${e.pointerId}`)}
            onPointerCancel={e => stopFire(`button:${e.pointerId}`, true)}
            onLostPointerCapture={e => stopFire(`button:${e.pointerId}`)}
          />
        </div>
        <div className="cooldowns">
          <span className="sr-only" data-testid="left-cooldown">L {cool(player?.cooldownLeft)}</span>
          <span className="sr-only" data-testid="right-cooldown">R {cool(player?.cooldownRight)}</span>
          <span data-testid="weapon-status" className={player&&player.powerUntil>(battle.state?.now??0)?'weapon-powered':''}>
            {labels.weapon} ×{weapon.count}
            {player&&player.powerUntil>(battle.state?.now??0)?` · ${labels.enhanced} +${weapon.bonus}%${weapon.explosive ? ` · ${labels.explosive}` : ''} · ${Math.ceil(player.powerUntil-(battle.state?.now??0))}s`:''}
          </span>
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

interface SkillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  detail: string;
  shortcut: string;
  icon: string;
  progress: number;
  active?: boolean;
  charging?: boolean;
}

function SkillButton({ label, detail, shortcut, icon, progress, active, charging, ...button }: SkillButtonProps) {
  return (
    <button {...button} className={`skill-button${active ? ' is-active' : ''}${charging ? ' is-cooling' : ''}`} aria-label={`${label} · ${detail}`}>
      <span className="skill-heading"><i aria-hidden="true">{icon}</i><strong>{label}</strong><kbd aria-hidden="true">{shortcut}</kbd></span>
      <span className="skill-detail">{detail}</span>
      <span className="skill-progress" aria-hidden="true" style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
    </button>
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
  return value <= 0 ? 'OK' : `${Math.max(.1, value).toFixed(1)}s`;
}
