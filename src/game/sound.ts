/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class SoundSystem {
  private ctx: AudioContext | null = null;
  public isMuted = false;

  private getContext(): AudioContext | null {
    if (this.isMuted) return null;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  playKick(powerPercent = 0.5): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'triangle';
      const freq = 120 + powerPercent * 160;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);

      gain.gain.setValueAtTime(0.3 * Math.min(1, powerPercent + 0.3), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch {}
  }

  /**
   * Successful pass sound: snappy leather touch and subtle air swish
   */
  playPass(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      // Soft leather snap
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.09);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);

      // Chime resonance for successful connection
      const bell = ctx.createOscillator();
      const bellGain = ctx.createGain();
      bell.type = 'triangle';
      bell.frequency.setValueAtTime(587.33, now); // D5
      bellGain.gain.setValueAtTime(0.08, now);
      bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      bell.connect(bellGain);
      bellGain.connect(ctx.destination);
      bell.start(now);
      bell.stop(now + 0.26);
    } catch {}
  }

  playCollision(velocity = 200): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'sine';
      const f = Math.min(650, 150 + velocity * 0.4);
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.08);

      const v = Math.min(0.4, velocity / 1800);
      gain.gain.setValueAtTime(v, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch {}
  }

  /**
   * Deep, punchy, "tok" goal sound as requested:
   * "Gol sesini değiştir. Daha tok bir ses olsun"
   * Heavy 808 sub-bass drop + resonant leather goalpost thud + warm low stadium roar.
   */
  playGoal(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      // 1. Deep "Tok" Sub-Bass Kick Drop (110Hz -> 30Hz)
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(115, now);
      subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.38);

      subGain.gain.setValueAtTime(0.85, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.46);

      // 2. Heavy Resonant Body Thud (Low-Pass Filtered Triangle)
      const thudOsc = ctx.createOscillator();
      const thudFilter = ctx.createBiquadFilter();
      const thudGain = ctx.createGain();

      thudOsc.type = 'triangle';
      thudOsc.frequency.setValueAtTime(75, now);
      thudOsc.frequency.exponentialRampToValueAtTime(40, now + 0.55);

      thudFilter.type = 'lowpass';
      thudFilter.frequency.setValueAtTime(160, now);
      thudFilter.Q.setValueAtTime(2.5, now);

      thudGain.gain.setValueAtTime(0.55, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      thudOsc.connect(thudFilter);
      thudFilter.connect(thudGain);
      thudGain.connect(ctx.destination);
      thudOsc.start(now);
      thudOsc.stop(now + 0.56);

      // 3. Low-Frequency Warm Stadium Roar
      const bufferSize = Math.floor(ctx.sampleRate * 2.2);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const roarFilter = ctx.createBiquadFilter();
      roarFilter.type = 'lowpass';
      roarFilter.frequency.setValueAtTime(450, now); // Warmer, deeper, non-screechy frequency
      roarFilter.Q.setValueAtTime(1.0, now);

      const roarGain = ctx.createGain();
      roarGain.gain.setValueAtTime(0.001, now);
      roarGain.gain.linearRampToValueAtTime(0.42, now + 0.22);
      roarGain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

      noise.connect(roarFilter);
      roarFilter.connect(roarGain);
      roarGain.connect(ctx.destination);
      noise.start(now);

      // 4. Subtle low horn harmony
      [130.81, 164.81, 196.0].forEach((freq) => {
        const horn = ctx.createOscillator();
        const hGain = ctx.createGain();
        horn.type = 'triangle';
        horn.frequency.setValueAtTime(freq, now + 0.05);

        hGain.gain.setValueAtTime(0.001, now + 0.05);
        hGain.gain.linearRampToValueAtTime(0.12, now + 0.15);
        hGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

        horn.connect(hGain);
        hGain.connect(ctx.destination);
        horn.start(now + 0.05);
        horn.stop(now + 1.45);
      });
    } catch {}
  }

  playWhistle(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [2400, 2450].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq + 100, now + 0.2);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.36);
      });
    } catch {}
  }

  playSelection(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch {}
  }
}

export const sound = new SoundSystem();
