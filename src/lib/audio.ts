/**
 * Web Audio synthesizer — no asset pipeline, all sounds generated from
 * oscillators. AudioContext lazy-initializes on first user gesture
 * (click / pointerdown) so we comply with the browser autoplay policy.
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

  /** One-shot tone with an envelope. */
  private play(
    freq: number,
    durMs: number,
    volume: number,
    type: Voice = "sine",
    endFreq?: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq != null) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFreq),
        now + durMs / 1000,
      );
    }
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + durMs / 1000 + 0.02);
  }

  capture(): void {
    // Bright bell chime — sine with upward sweep
    this.play(880, 220, 0.16, "sine", 1320);
  }
  lockOn(): void {
    // Short electronic zap
    this.play(440, 130, 0.18, "square", 1100);
  }
  hit(): void {
    // Low thud — sawtooth dropping
    this.play(180, 280, 0.32, "sawtooth", 60);
  }
  telegraph(): void {
    // Two-tone warning warble
    this.play(220, 160, 0.12, "triangle", 320);
    setTimeout(() => this.play(180, 200, 0.14, "triangle", 240), 140);
  }
  transcend(): void {
    // Ascending major chord (C–E–G)
    this.play(523, 700, 0.18, "sine");
    setTimeout(() => this.play(659, 700, 0.18, "sine"), 110);
    setTimeout(() => this.play(784, 900, 0.22, "sine"), 220);
  }
  death(): void {
    // Descending minor sweep
    this.play(220, 900, 0.28, "sawtooth", 55);
  }
  trait(): void {
    // Subtle ascending pluck on trait acquisition
    this.play(660, 280, 0.14, "triangle", 990);
  }
}

export const audio = new AudioBus();
