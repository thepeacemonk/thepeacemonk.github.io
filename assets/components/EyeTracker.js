// Eye tracker adapted from Bencho. MIT; see Bencho.LICENSE.txt.
/* ══ Eye tracker ═══════════════════════════════════════════
   A ball with two eyes that watches your cursor.

   ── THE EYES ARE ON THE BALL, NOT IN FRONT OF IT ───────────
   The easy version slides two shapes toward the pointer, and it
   reads as stickers on a disc. Here each eye is a point on the
   sphere's surface: looking left turns the ball, so an eye
   travels along the curve, and the one heading for the rim
   moves less and narrows as it turns away from you while the
   other swings wide. That foreshortening is the whole trick —
   it is what makes a flat circle read as something round.

   One turn (yaw and pitch) is the state, sprung toward where
   the pointer is; both eyes are read off it, so they can never
   disagree. It relaxes back to facing you when the pointer
   leaves the window, and it blinks on its own now and then.

   Written straight to the DOM every frame, never through state:
   a pointer move is not a render. Native DOM adaptation for this
   site, with match expressions and a lifecycle scoped to Wupong. */

const R = 50; /* the ball's radius, in the 100-unit viewBox */
const GAP = .19; /* half the gap between the eyes, as a fraction of the radius */
/* how far a look to a corner tilts the pair, in degrees at the
   rim — a glance up and right leans them back, like the logo */
const TILT = 64;
const KEY_MS = 38;
const HOLD_MS = 3200;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MOODS = {
  neutral: { label: 'watching the game', w: 9, h: 15, r: 4.5 },
  happy: { label: 'happy about a point', w: 12, h: 12, r: 4.5 },
  sad: { label: 'disappointed about a lost point', w: 9, h: 13, r: 4.5 },
  victory: { label: 'celebrating a match victory', w: 16, h: 16, r: 4.5 },
  defeat: { label: 'defeated, but ready for a rematch', w: 13, h: 13, r: 4.5 },
};
const POKES = [
  'Hey, I see you.', 'Boop.', 'That tickles.', 'Hi there!', 'Stop poking me.', "I'm watching you.", 'Again? Okay.', 'You found Wu.',
  'Personal space: one tiny square.', 'Yes, these eyes are following you.', 'I am not the play button.',
  'My thoughts? Mostly bouncing.', 'A boop before battle. Traditional.', 'Careful. That is my thinking corner.',
  'You poke. I remember.', 'I accept payment in rematches.', 'Paddle practice is over there.',
  'This is my serious face. Probably.', 'I was trying to look mysterious.', 'Fine. One more boop.',
];

/* ── one spring, for everything that settles ───────────────
   Frames, not milliseconds. `dt` is expressed in sixtieths of
   a second. This is the supplied eye tracker's spring, scoped
   to this face. The loop parks itself when the turn and blink
   have settled; timers wake the next blink only while visible. */
export class EyeTracker {
  constructor(root, { frame, isVisible }) {
    this.root = root; this.frame = frame; this.isVisible = isVisible;
    this.avatar = root.querySelector('.wu-avatar');
    this.bubble = root.querySelector('.eyt-say'); this.line = root.querySelector('.wu-line');
    this.announcement = root.querySelector('.wu-announcement');
    this.still = matchMedia('(prefers-reduced-motion: reduce)');
    this.turn = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    this.mood = 'neutral'; this.active = false; this.raf = 0; this.previous = 0; this.blink = -Infinity;
    const clip = `wu-eyes-${Math.random().toString(36).slice(2)}`;
    /* ── the body, in three shapes ──────────────────────────────
       The eyes are worked out on a sphere whatever the body is.
       Wu uses the supplied soft Cube; no shape chooser is needed. */
    const body = 'M30 6 H70 A24 24 0 0 1 94 30 V70 A24 24 0 0 1 70 94 H30 A24 24 0 0 1 6 70 V30 A24 24 0 0 1 30 6 Z';
    this.avatar.innerHTML = `<svg class="eyt-ball" viewBox="0 0 100 100" aria-hidden="true"><defs><clipPath id="${clip}"><path d="${body}" /></clipPath></defs><path class="eyt-body" d="${body}" /><g clip-path="url(#${clip})"><g class="eyt-eye-position"><rect class="eyt-eye"/><path class="eyt-expression"/></g><g class="eyt-eye-position"><rect class="eyt-eye"/><path class="eyt-expression"/></g></g></svg>`;
    this.eyes = [...this.avatar.querySelectorAll('.eyt-eye-position')];
    this.setMood('neutral'); this.draw(performance.now());
    /* ── only while you are in its card ─────────────────────
       It watches the pointer while inside its board and faces
       front again when you leave. The reach is measured against
       that card, so the eyes arrive at the rim at its edge. */
    window.addEventListener('pointermove', e => {
      if (!this.active || !this.isVisible() || e.pointerType === 'touch' || this.mood !== 'neutral') return;
      const f = frame.getBoundingClientRect();
      if (e.clientX < f.left || e.clientX > f.right || e.clientY < f.top || e.clientY > f.bottom) { this.rest(); return; }
      const r = this.avatar.getBoundingClientRect();
      const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.max(60, Math.min(f.width, f.height) * .28);
      const far = Math.min(.85, Math.tanh(d / reach) * .6 * 1.5);
      this.turn.tx = dx / d * far; this.turn.ty = dy / d * far; this.wake();
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => this.rest());
    window.addEventListener('blur', () => this.rest());
    this.avatar.addEventListener('click', () => {
      const choices = POKES.filter(line => line !== this.lastPoke);
      this.lastPoke = choices[Math.floor(Math.random() * choices.length)]; this.speak(this.lastPoke);
    });
    this.still.addEventListener('change', () => { if (this.still.matches) { clearTimeout(this.typing); this.line.textContent = this.sentence || ''; } this.wake(); this.nextBlink(); });
  }
  setMood(mood) {
    this.mood = Object.hasOwn(MOODS, mood) ? mood : 'neutral';
    this.root.dataset.mood = this.mood;
    this.avatar.setAttribute('aria-label', `Wu, ${MOODS[this.mood].label}`);
    this.wake();
  }
  /* ── it talks back when you poke it ─────────────────────────
     Opens a little chat bubble, types one short line a letter
     at a time, holds it to be read, and folds it away. A newer
     point cancels the previous line, never queuing old taunts. */
  speak(text, permanent = false) {
    clearTimeout(this.typing); clearTimeout(this.hold);
    this.sentence = text; this.sentencePermanent = permanent;
    this.announcement.textContent = text; this.line.textContent = '';
    this.bubble.setAttribute('data-on', '');
    if (this.still.matches) { this.line.textContent = text; if (!permanent) this.hold = setTimeout(() => this.bubble.removeAttribute('data-on'), HOLD_MS); return; }
    let index = 0;
    const type = () => {
      if (!this.active) return;
      this.line.textContent = text.slice(0, ++index);
      if (index < text.length) this.typing = setTimeout(type, KEY_MS);
      else if (!permanent) this.hold = setTimeout(() => this.bubble.removeAttribute('data-on'), HOLD_MS);
    };
    type();
  }
  react(mood, line, permanent = false) {
    clearTimeout(this.reaction); this.permanentMood = permanent;
    this.turn.tx = this.turn.ty = 0;
    this.setMood(mood); this.speak(line, permanent);
    // Keep the expression through the whole line, not just its first letters.
    if (!permanent) this.reaction = setTimeout(() => this.setMood('neutral'), Math.max(4200, (this.still.matches ? 0 : line.length * KEY_MS) + HOLD_MS));
  }
  reset() {
    clearTimeout(this.reaction); clearTimeout(this.typing); clearTimeout(this.hold);
    this.permanentMood = false; this.sentence = ''; this.sentencePermanent = false; this.setMood('neutral');
    this.bubble.removeAttribute('data-on'); this.line.textContent = ''; this.announcement.textContent = '';
  }
  rest() { this.turn.tx = this.turn.ty = 0; this.wake(); }
  start() {
    if (this.active) return;
    this.active = true; this.previous = 0; this.wake(); this.nextBlink();
    if (this.bubble.hasAttribute('data-on') && this.sentence && !this.sentencePermanent) { clearTimeout(this.hold); this.hold = setTimeout(() => this.bubble.removeAttribute('data-on'), HOLD_MS); }
  }
  nextBlink() {
    clearTimeout(this.blinkTimer);
    if (!this.active || this.still.matches) return;
    this.blinkTimer = setTimeout(() => { this.blink = performance.now(); this.wake(); this.nextBlink(); }, 2600 + Math.random() * 3200);
  }
  stop() {
    this.active = false; cancelAnimationFrame(this.raf); this.raf = 0; this.previous = 0;
    clearTimeout(this.blinkTimer); clearTimeout(this.typing); clearTimeout(this.hold); clearTimeout(this.reaction);
    if (this.sentence) this.line.textContent = this.sentence;
    this.turn.tx = this.turn.ty = this.turn.x = this.turn.y = this.turn.vx = this.turn.vy = 0;
    if (!this.permanentMood) this.setMood('neutral');
    this.draw(performance.now());
  }
  wake() {
    if (this.raf || !this.active || !this.isVisible()) return;
    this.raf = requestAnimationFrame(now => this.tick(now));
  }
  tick(now) {
    this.raf = 0;
    if (!this.active || !this.isVisible()) { this.previous = 0; return; }
    const dt = this.previous ? Math.min(2.5, (now - this.previous) / 16.67) : 1; this.previous = now;
    const t = this.turn;
    if (this.still.matches) { t.x = t.tx; t.y = t.ty; t.vx = t.vy = 0; }
    else {
      /* one spring for both axes; Bounce loosens the damping */
      const k = .06, damping = .34 - .3 * .22;
      t.vx += ((t.tx - t.x) * k - t.vx * damping) * dt;
      t.vy += ((t.ty - t.y) * k - t.vy * damping) * dt;
      t.x += t.vx * dt; t.y += t.vy * dt;
    }
    this.draw(now);
    if (Math.abs(t.x - t.tx) + Math.abs(t.y - t.ty) + Math.abs(t.vx) + Math.abs(t.vy) > .0005 || now - this.blink < 160) this.wake();
    else this.previous = 0;
  }
  draw(now) {
    const t = this.turn, eye = MOODS[this.mood];
    /* a blink is 160ms down and up, as a squash on each eye */
    const since = now - this.blink;
    const lid = !this.still.matches && since >= 0 && since < 160 ? 1 - .9 * Math.sin(since / 160 * Math.PI) : 1;
    /* the turn that brings the front of the ball to the face's
       spot: yaw about the vertical, pitch about the horizontal */
    const as = v => Math.asin(clamp(v, -.92, .92));
    const yaw = as(t.x), pitch = -as(t.y), cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const tilt = TILT * t.x * t.y;
    [-GAP, GAP].forEach((x0, i) => {
      const group = this.eyes[i], z0 = Math.sqrt(1 - x0 * x0);
      /* the eye as a point on the unit sphere, either side of
         the front, turned with the ball */
      const x1 = x0 * cy + z0 * sy, z1 = -x0 * sy + z0 * cy, y2 = -z1 * sp, z2 = z1 * cp;
      /* depth: the eye nearer the rim is further from you, so it
         is smaller all over and narrower still across the turn */
      const near = clamp(z2, 0, 1), k = .45 + .55 * near, sx = k * (.7 + .3 * near);
      /* ── the size is written as a size, never as a scale ──
         Writing width and height directly keeps every corner the
         same radius, clamped to half a side, even during a blink. */
      const w = eye.w * sx, h = Math.max(.6, eye.h * k * lid), rect = group.querySelector('rect'), expression = group.querySelector('path');
      for (const [key, val] of Object.entries({ x: -w / 2, y: -h / 2, width: w, height: h, rx: Math.min(eye.r, w / 2, h / 2) })) rect.setAttribute(key, val.toFixed(2));
      rect.style.display = this.mood === 'happy' || this.mood === 'victory' || this.mood === 'defeat' ? 'none' : '';
      expression.style.display = rect.style.display === 'none' ? '' : 'none';
      if (this.mood === 'happy') expression.setAttribute('d', `M${-w / 2} ${h / 4} Q0 ${-h} ${w / 2} ${h / 4}`);
      if (this.mood === 'victory') expression.setAttribute('d', `M0 ${-h / 2} L${w / 5} ${-h / 5} L${w / 2} 0 L${w / 5} ${h / 5} L0 ${h / 2} L${-w / 5} ${h / 5} L${-w / 2} 0 L${-w / 5} ${-h / 5} Z`);
      if (this.mood === 'defeat') expression.setAttribute('d', `M${-w / 2} ${-h / 2} L${w / 2} ${h / 2} M${w / 2} ${-h / 2} L${-w / 2} ${h / 2}`);
      const sorrow = this.mood === 'sad' ? (i === 0 ? -18 : 18) : 0;
      group.setAttribute('transform', `translate(${(50 + x1 * R).toFixed(2)} ${(50 + y2 * R).toFixed(2)}) rotate(${(tilt + sorrow).toFixed(2)})`);
      group.style.opacity = z2 < .05 ? '0' : '1';
    });
  }
}
