// Synthesized, short arcade sounds. No audio runs outside the Pong dialog.
// The shared impact cooldown prevents contact clusters from stacking tones.
const IMPACT_GAP = .09;
const MAX_VOICES = 4;
const NOTE_GAIN = .035;
const MASTER_GAIN = .35;
const OUTPUT_CEILING = .04;
const NOTES = {
  hit: [[520, .045]], wall: [[310, .03]],
  point: [[660, .075], [880, .09]], miss: [[290, .08], [220, .1]],
  win: [[523, .09], [659, .09], [784, .09], [1047, .16]],
  lose: [[392, .1], [330, .1], [262, .18]],
};
export class PongSound {
  constructor(button, isOpen) {
    this.button = button; this.isOpen = isOpen; this.nodes = new Set(); this.muted = false;
    this.nextImpact = 0; this.melodyUntil = 0;
    try { this.muted = localStorage.getItem('peace.pong.muted') === 'true'; } catch {}
    this.sync();
    button.addEventListener('click', () => {
      this.muted = !this.muted; this.sync();
      try { localStorage.setItem('peace.pong.muted', this.muted); } catch {}
      if (this.muted) this.sleep(); else this.unlock();
    });
  }
  sync() { this.button.setAttribute('aria-pressed', this.muted); this.button.setAttribute('aria-label', this.muted ? 'Unmute game sounds' : 'Mute game sounds'); }
  unlock() {
    if (this.muted || !this.isOpen()) return;
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain(); this.master.gain.value = MASTER_GAIN;
        // A monotonic soft ceiling bounds the actual output. Unlike a
        // compressor it adds no automatic make-up gain or attack overshoot.
        this.limiter = this.ctx.createWaveShaper();
        this.limiter.curve = Float32Array.from({ length: 4097 }, (_, i) => {
          const input = i * 2 / 4096 - 1;
          return OUTPUT_CEILING * Math.tanh(input / OUTPUT_CEILING);
        });
        this.master.connect(this.limiter); this.limiter.connect(this.ctx.destination);
      }
      void this.ctx.resume().catch(() => {});
    } catch {}
  }
  stopVoices() {
    for (const node of this.nodes) {
      // Disconnect synchronously: a future scheduled note must never remain
      // audible while the audio thread is processing its stop command.
      try { node.disconnect(); node.stop(); } catch {}
    }
    this.nodes.clear();
  }
  play(kind) {
    if (this.muted || !this.isOpen() || this.ctx?.state !== 'running' || !this.master) return;
    const notes = NOTES[kind]; if (!notes) return;
    const now = this.ctx.currentTime, impact = kind === 'hit' || kind === 'wall';
    if (impact) {
      if (now < this.nextImpact || now < this.melodyUntil || this.nodes.size >= MAX_VOICES) return;
      this.nextImpact = now + IMPACT_GAP;
    } else {
      // A score replaces pending impacts/melodies rather than mixing over them.
      this.stopVoices();
      this.melodyUntil = now + notes.reduce((time, [, duration]) => time + duration + .015, 0);
      this.nextImpact = this.melodyUntil;
    }
    let at = now;
    for (const [hz, duration] of notes) {
      if (this.nodes.size >= MAX_VOICES) break;
      const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(hz, at);
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(NOTE_GAIN, at + .005); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
      oscillator.connect(gain); gain.connect(this.master); oscillator.start(at); oscillator.stop(at + duration + .01);
      this.nodes.add(oscillator); oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      at += duration + .015;
    }
  }
  sleep() {
    this.stopVoices(); this.nextImpact = 0; this.melodyUntil = 0;
    if (this.ctx?.state === 'running') void this.ctx.suspend().catch(() => {});
  }
}
