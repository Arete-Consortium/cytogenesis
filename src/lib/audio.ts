/**
 * Web Audio synthesizer — no asset pipeline, all sounds generated from
 * oscillators + filtered noise. AudioContext lazy-initializes on first
 * user gesture (click / pointerdown) so we comply with the browser
 * autoplay policy.
 *
 * Each public effect is composed of multiple voices (detuned osc
 * pairs, noise bursts, filter sweeps) instead of a single bare
 * oscillator. This trades a little CPU for sounds that read as
 * impacts and events instead of generic blips.
 */

type Voice = "sine" | "square" | "triangle" | "sawtooth";

class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** Call from a user-gesture handler (pointerdown). Idempotent. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    if (typeof window === "undefined") return;
    const Ctor =
      (window.AudioContext as typeof AudioContext) ||
      ((window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext as typeof AudioContext | undefined);
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.32;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.32;
  }

  // ── Building blocks ────────────────────────────────────────────────

  /** Pitched tone with attack-decay envelope + optional pitch sweep. */
  private tone(opts: {
    freq: number;
    durMs: number;
    volume: number;
    type?: Voice;
    endFreq?: number;
    /** Detune in cents — non-zero produces beating with paired voices. */
    detune?: number;
    /** Attack time in seconds. Default 0.008. */
    attack?: number;
    /** Delay before tone starts, in seconds. */
    delay?: number;
  }): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.freq, now);
    if (opts.detune) osc.detune.setValueAtTime(opts.detune, now);
    if (opts.endFreq != null) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, opts.endFreq),
        now + opts.durMs / 1000,
      );
    }
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(opts.volume, now + (opts.attack ?? 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.durMs / 1000);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + opts.durMs / 1000 + 0.02);
  }

  /** Filtered noise burst — for impacts, debris, hisses. */
  private noise(opts: {
    durMs: number;
    volume: number;
    /** "bandpass" / "lowpass" / "highpass". Default bandpass. */
    filter?: BiquadFilterType;
    /** Filter starting freq. */
    freq: number;
    /** Filter ending freq for sweep. */
    endFreq?: number;
    /** Filter resonance. */
    Q?: number;
    /** Delay before noise starts. */
    delay?: number;
  }): void {
    if (!this.ctx || !this.master) return;
    const dur = opts.durMs / 1000;
    const startAt = this.ctx.currentTime + (opts.delay ?? 0);
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.max(1, Math.floor(sampleRate * dur)), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.filter ?? "bandpass";
    filter.frequency.setValueAtTime(opts.freq, startAt);
    if (opts.endFreq != null) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(20, opts.endFreq),
        startAt + dur,
      );
    }
    if (opts.Q != null) filter.Q.setValueAtTime(opts.Q, startAt);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(opts.volume, startAt + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(startAt);
    src.stop(startAt + dur + 0.02);
  }

  /** Detuned osc pair — fatter sound by beating two voices slightly apart. */
  private fatTone(opts: {
    freq: number;
    durMs: number;
    volume: number;
    type?: Voice;
    endFreq?: number;
    delay?: number;
  }): void {
    this.tone({ ...opts, detune: -8 });
    this.tone({ ...opts, detune: +8, volume: opts.volume * 0.85 });
  }

  // ── Public effects ─────────────────────────────────────────────────

  capture(): void {
    // Bright twinkle — fundamental + octave + a bit of high shimmer
    // noise so it reads as "snap into place" instead of a single blip.
    this.tone({ freq: 880, durMs: 180, volume: 0.13, type: "sine", endFreq: 1200 });
    this.tone({ freq: 1320, durMs: 140, volume: 0.07, type: "sine", endFreq: 1700, delay: 0.02 });
    this.noise({ durMs: 90, volume: 0.05, freq: 6000, endFreq: 9000, Q: 6, delay: 0.005 });
  }

  lockOn(): void {
    // Tight zap — square fundamental + filter-swept noise giving
    // it a "charging" character.
    this.tone({ freq: 420, durMs: 110, volume: 0.16, type: "square", endFreq: 980 });
    this.noise({ durMs: 80, volume: 0.08, freq: 800, endFreq: 4000, Q: 4 });
  }

  hit(): void {
    // Layered impact: low sine thump (kick), distorted sawtooth body
    // (smack), filtered noise burst (crack), short transient ring.
    this.tone({ freq: 140, durMs: 220, volume: 0.32, type: "sine", endFreq: 50 });
    this.tone({ freq: 210, durMs: 180, volume: 0.18, type: "sawtooth", endFreq: 80 });
    this.noise({ durMs: 80, volume: 0.22, freq: 2200, endFreq: 600, Q: 1.2, filter: "bandpass" });
    this.noise({ durMs: 180, volume: 0.06, freq: 400, Q: 0.7, filter: "lowpass", delay: 0.02 });
  }

  telegraph(): void {
    // Two-tone alarm — minor 2nd interval for unsettled feel
    this.tone({ freq: 220, durMs: 160, volume: 0.10, type: "triangle", endFreq: 300 });
    this.tone({ freq: 233, durMs: 200, volume: 0.10, type: "triangle", endFreq: 280, delay: 0.14 });
    // Subtle high tick on each pulse
    this.noise({ durMs: 30, volume: 0.04, freq: 4000, Q: 8 });
    this.noise({ durMs: 30, volume: 0.04, freq: 5000, Q: 8, delay: 0.14 });
  }

  transcend(): void {
    // Build a triad with detuned pairs, plus a sweeping shimmer.
    // Perfect-fifth root → maj third → octave gives a "rising" feel.
    this.fatTone({ freq: 392, durMs: 800, volume: 0.14, type: "sawtooth" });
    this.fatTone({ freq: 494, durMs: 800, volume: 0.12, type: "sawtooth", delay: 0.10 });
    this.fatTone({ freq: 587, durMs: 900, volume: 0.12, type: "sawtooth", delay: 0.20 });
    // High shimmer on top
    this.tone({ freq: 1175, durMs: 700, volume: 0.07, type: "sine", endFreq: 1568, delay: 0.18 });
    // Filter-swept airy noise — "cosmic" feel
    this.noise({ durMs: 600, volume: 0.05, freq: 1500, endFreq: 6000, Q: 2 });
  }

  death(): void {
    // Heavy descending impact — sub thump, growl, debris noise tail
    this.tone({ freq: 200, durMs: 700, volume: 0.30, type: "sawtooth", endFreq: 40 });
    this.tone({ freq: 100, durMs: 800, volume: 0.22, type: "sine", endFreq: 30 });
    // Distorted texture: square dropping over the fundamental
    this.tone({ freq: 320, durMs: 500, volume: 0.10, type: "square", endFreq: 70, delay: 0.05 });
    // Long rumble noise tail
    this.noise({ durMs: 900, volume: 0.10, freq: 600, endFreq: 80, Q: 0.8, filter: "lowpass" });
  }

  trait(): void {
    // Bright ascending pluck — fundamental + 5th + slight noise sparkle
    this.tone({ freq: 660, durMs: 240, volume: 0.13, type: "triangle", endFreq: 990 });
    this.tone({ freq: 990, durMs: 200, volume: 0.07, type: "sine", endFreq: 1480, delay: 0.04 });
    this.noise({ durMs: 80, volume: 0.04, freq: 5000, endFreq: 7000, Q: 5, delay: 0.04 });
  }
}

export const audio = new AudioBus();
