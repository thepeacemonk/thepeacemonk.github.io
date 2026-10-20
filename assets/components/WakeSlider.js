// Adapted from Bencho's WakeSlider. MIT; see Bencho.LICENSE.txt.
/* ══ Wake slider ══════════════════════════════════════════
   A range with no thumb: a row of thin bars, solid up to the
   value and faint after it, with the reading beside them. Drag
   anywhere along it. Drag slowly and the bars simply fill; drag
   fast and every bar the value sweeps past springs up, taller the
   faster you went, and settles back — a wake left behind the hand.

   ── EACH BAR HOLDS A LITTLE ENERGY ──────────────────────
   When the value crosses a bar, that bar takes energy from the
   speed of the drag. Every frame all of it decays at the same
   rate, so the bars crossed longest ago have fallen furthest: the
   tallest ones are always at the hand and the run tails off
   behind it. That falloff IS the wake; nothing draws it.

   ── WRITTEN, NOT RENDERED ───────────────────────────────
   The heights change every frame, so they go straight onto each
   bar's transform. The loop runs only while some bar still has
   energy. This adaptation uses the site's native DOM modules. */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const H = 20; // a bar at rest, px
export class WakeSlider {
  constructor(root, { onChange, bars = 28, wake = 60 } = {}) {
    this.root = root; this.onChange = onChange; this.wake = wake;
    this.labels = ['Easy', 'Medium', 'Truly difficult'];
    this.at = 0; this.value = 0; this.energy = new Float32Array(bars); this.raf = 0; this.disabled = false;
    this.track = document.createElement('div'); this.track.className = 'wks-track cursor-target';
    this.track.tabIndex = 0; this.track.setAttribute('role', 'slider');
    for (const [key, value] of Object.entries({ 'aria-label': 'Difficulty', 'aria-valuemin': '0', 'aria-valuemax': '2' })) this.track.setAttribute(key, value);
    this.els = Array.from({ length: bars }, () => { const el = document.createElement('span'); el.className = 'wks-bar'; el.style.height = `${H}px`; el.setAttribute('aria-hidden', 'true'); this.track.append(el); return el; });
    this.reading = document.createElement('span'); this.reading.className = 'wks-value';
    root.classList.add('wks'); root.append(this.track, this.reading); this.paint();
    const fraction = x => { const r = this.track.getBoundingClientRect(); return (x - r.left) / r.width; };
    this.track.addEventListener('pointerdown', e => {
      if (this.disabled) return;
      this.track.setPointerCapture(e.pointerId); this.down = true; this.lastX = e.clientX; this.lastT = performance.now(); this.speed = 0;
      this.to(fraction(e.clientX), 0); this.track.focus({ preventScroll: true });
    });
    this.track.addEventListener('pointermove', e => {
      if (!this.down) return;
      const now = performance.now(), dt = Math.max(.008, (now - this.lastT) / 1000);
      /* speed in px per second, smoothed so one jittery frame
         cannot fake a fling */
      const v = Math.abs(e.clientX - this.lastX) / dt;
      this.speed = this.speed * .5 + v * .5; this.lastX = e.clientX; this.lastT = now;
      this.to(fraction(e.clientX), this.speed);
    });
    const release = () => { this.down = false; this.to(this.value / 2, 0); };
    this.track.addEventListener('pointerup', release); this.track.addEventListener('pointercancel', release);
    this.track.addEventListener('lostpointercapture', () => { if (this.down) release(); });
    this.track.addEventListener('keydown', e => {
      if (this.disabled) return;
      let next = this.value;
      if (['ArrowRight', 'ArrowUp'].includes(e.key)) next++;
      else if (['ArrowLeft', 'ArrowDown'].includes(e.key)) next--;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = 2;
      else return;
      e.preventDefault(); e.stopPropagation();
      /* a key press is a small, quick step: a little wake */
      this.to(clamp(next, 0, 2) / 2, 600);
    });
  }
  paint() {
    this.track.setAttribute('aria-valuenow', this.value); this.track.setAttribute('aria-valuetext', this.labels[this.value]);
    this.reading.textContent = this.labels[this.value];
    this.els.forEach((el, i) => el.toggleAttribute('data-on', i <= Math.round(this.at * (this.els.length - 1))));
  }
  to(f, speed) {
    f = clamp(f, 0, 1);
    const a = Math.round(this.at * (this.els.length - 1)), b = Math.round(f * (this.els.length - 1));
    /* how hard: the drag's speed in bars per second, through a
       curve that saturates, scaled by the knob */
    const push = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : (1 - Math.exp(-speed / 900)) * this.wake / 60;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) this.energy[i] = Math.max(this.energy[i], push);
    this.at = f; const next = Math.round(f * 2), changed = next !== this.value; this.value = next; this.paint();
    if (changed) this.onChange?.(next);
    this.loop();
  }
  loop() {
    if (this.raf) return;
    let prev = performance.now();
    const run = now => {
      const dt = Math.min(.05, (now - prev) / 1000); prev = now; let live = false;
      const fall = Math.exp(-dt * 6.5);
      this.energy.forEach((energy, i) => {
        this.energy[i] = energy * fall < .002 ? 0 : energy * fall; live ||= this.energy[i] > 0;
        /* up to 2.6 times as tall at the very top of the knob */
        this.els[i].style.transform = `scaleY(${(1 + this.energy[i] * 1.6).toFixed(3)})`;
      });
      this.raf = live || this.down ? requestAnimationFrame(run) : 0;
    };
    this.raf = requestAnimationFrame(run);
  }
  setDisabled(disabled) { this.disabled = disabled; this.track.setAttribute('aria-disabled', disabled); this.root.toggleAttribute('data-disabled', disabled); }
  stop() { this.down = false; cancelAnimationFrame(this.raf); this.raf = 0; this.energy.fill(0); this.els.forEach(el => el.style.transform = ''); }
}
