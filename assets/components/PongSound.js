// Synthesized, short arcade sounds. No audio runs outside the Pong dialog.
export class PongSound {
  constructor(button, isOpen) {
    this.button = button; this.isOpen = isOpen; this.nodes = new Set(); this.muted = false;
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
    try { this.ctx ??= new (window.AudioContext || window.webkitAudioContext)(); void this.ctx.resume().catch(() => {}); } catch {}
  }
  play(kind) {
    if (this.muted || !this.isOpen() || this.ctx?.state !== 'running') return;
    const notes = { hit: [[520, .045]], wall: [[310, .03]], point: [[660, .075], [880, .09]], miss: [[290, .08], [220, .1]], win: [[523, .09], [659, .09], [784, .09], [1047, .16]], lose: [[392, .1], [330, .1], [262, .18]] }[kind];
    let at = this.ctx.currentTime;
    for (const [hz, duration] of notes || []) {
      const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(hz, at);
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.055, at + .005); gain.gain.exponentialRampToValueAtTime(.001, at + duration);
      oscillator.connect(gain); gain.connect(this.ctx.destination); oscillator.start(at); oscillator.stop(at + duration + .01);
      this.nodes.add(oscillator); oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      at += duration + .015;
    }
  }
  sleep() {
    for (const node of this.nodes) { try { node.stop(); } catch {} }
    this.nodes.clear();
    if (this.ctx?.state === 'running') void this.ctx.suspend().catch(() => {});
  }
}
