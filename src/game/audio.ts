import type { GameEvent } from '../../shared/protocol';

export class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private known = new Set<string>();

  constructor(private volume: number, private muted: boolean) {}

  updateSettings(volume: number, muted: boolean) {
    this.volume = volume;
    this.muted = muted;
  }

  handle(events: GameEvent[], tick: number) {
    if (this.muted || this.volume <= 0) return;
    for (const event of events) {
      const key = `${tick}-${event.type}-${'boatId' in event ? event.boatId : ''}-${'targetId' in event ? event.targetId : ''}`;
      if (this.known.has(key)) continue;
      this.known.add(key);
      if (event.type === 'fire') this.boom(95, 0.18);
      if (event.type === 'hit') this.noise(0.18, 900, 0.12);
      if (event.type === 'sink') this.noise(0.45, 150, 0.38);
      if (event.type === 'chest') this.chime();
      if (event.type === 'repair') this.chime(480);
    }
  }

  waves(active: boolean) {
    if (!active || this.muted) return;
    const ctx = this.context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 75;
    gain.gain.value = 0.015 * this.volume;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private boom(freq: number, seconds: number) {
    const ctx = this.context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + seconds);
    gain.gain.setValueAtTime(0.18 * this.volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  private noise(seconds: number, cutoff: number, gainValue: number) {
    const ctx = this.context();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.value = gainValue * this.volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }

  private chime(base = 660) {
    const ctx = this.context();
    [base, base * 1.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08 * this.volume, ctx.currentTime + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32 + i * 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.06);
      osc.stop(ctx.currentTime + 0.34 + i * 0.06);
    });
  }
}
