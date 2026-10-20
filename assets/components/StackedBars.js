// Adapted from Bencho's StackedBars. MIT; see Bencho.LICENSE.txt.
/* ══ Stacked bars ═════════════════════════════════════════
   A stack of match wins and losses for every day (or week).

   ── RUN ALONG IT ────────────────────────────────────────
   The column under the pointer gets a ring round its whole stack,
   the rest step back (their colour mixed toward the slab, never
   faded), and one tooltip glides beside it on a spring with the
   date, the total and what made it up.

   ── DAY / WEEK ──────────────────────────────────────────
   Swaps the dataset; every segment eases to its new height and
   offset a beat after its left neighbour. The same transition
   grows the bars out of the baseline the first time the card is
   seen. This adaptation uses real local matches, no demo data. */
export class StackedBars {
  constructor(root, { getMatches, getTotals }) {
    this.root = root; this.getMatches = getMatches; this.getTotals = getTotals; this.mode = 'Day'; this.at = null;
    root.classList.add('stb');
    root.innerHTML = `<div class="stb-head"><h3 id="pong-history-title">Match history</h3><button class="pong-icon pong-history-close" type="button" aria-label="Close match history"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div><div class="stb-summary"><div class="stb-figure"><span class="stb-num">0</span><span class="stb-unit">matches</span></div><div class="stb-seg-ctl" role="group" aria-label="History interval" data-mode="Day"><span class="stb-thumb" aria-hidden="true"></span><button class="stb-tab" type="button" data-mode="Day" aria-pressed="true">Day</button><button class="stb-tab" type="button" data-mode="Week" aria-pressed="false">Week</button></div></div><div class="stb-plot" tabindex="0" role="group" aria-label="Match history. Left and right arrows explore dates."><span class="stb-base"></span><div class="stb-columns"></div><span class="stb-ring" aria-hidden="true"></span><div class="stb-tip" role="status" aria-live="polite"></div><span class="stb-empty">No matches yet.</span></div><div class="stb-axis"><span></span><span></span></div><div class="stb-legend"><span><i></i><span class="stb-wins"></span></span><span><i></i><span class="stb-losses"></span></span></div><p class="stb-storage" hidden>History is available for this visit only.</p>`;
    this.plot = root.querySelector('.stb-plot'); this.tip = root.querySelector('.stb-tip'); this.ring = root.querySelector('.stb-ring');
    root.querySelectorAll('.stb-tab').forEach(button => button.addEventListener('click', () => { this.mode = button.dataset.mode; this.render(); }));
    const pick = e => { const b = this.plot.getBoundingClientRect(); this.select(Math.max(0, Math.min(this.data.length - 1, Math.floor((e.clientX - b.left) / b.width * this.data.length)))); };
    this.plot.addEventListener('pointermove', pick);
    this.plot.addEventListener('pointerdown', e => { this.plot.setPointerCapture(e.pointerId); pick(e); });
    this.plot.addEventListener('pointerleave', () => this.select(null));
    this.plot.addEventListener('pointercancel', () => this.select(null));
    this.plot.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)) return;
      if (e.key === 'Escape') { this.select(null); return; }
      e.preventDefault(); e.stopPropagation();
      this.select(e.key === 'Home' ? 0 : e.key === 'End' ? this.data.length - 1 : Math.max(0, Math.min(this.data.length - 1, (this.at ?? this.data.length - 1) + (e.key === 'ArrowLeft' ? -1 : 1))));
    });
    this.plot.addEventListener('blur', () => this.select(null));
  }
  render() {
    this.select(null);
    const count = this.mode === 'Day' ? 14 : 12;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    if (this.mode === 'Week') now.setDate(now.getDate() - (now.getDay() + 6) % 7);
    const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
    this.data = Array.from({ length: count }, (_, i) => {
      const start = new Date(now); start.setDate(start.getDate() - (count - 1 - i) * (this.mode === 'Day' ? 1 : 7));
      const end = new Date(start); end.setDate(end.getDate() + (this.mode === 'Day' ? 1 : 7));
      const matches = this.getMatches().filter(m => m.at >= +start && m.at < +end);
      return { start, end, matches, wins: matches.filter(m => m.you === 5).length, losses: matches.filter(m => m.bot === 5).length, label: dateFormat.format(start) };
    });
    const totals = this.getTotals();
    this.root.querySelector('.stb-num').textContent = totals.wins + totals.losses;
    this.root.querySelector('.stb-wins').textContent = `${totals.wins} ${totals.wins === 1 ? "win" : "wins"}`;
    this.root.querySelector('.stb-losses').textContent = `${totals.losses} ${totals.losses === 1 ? "loss" : "losses"}`;
    this.root.querySelector('.stb-seg-ctl').dataset.mode = this.mode;
    this.root.querySelectorAll('.stb-tab').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === this.mode));
    this.root.querySelector('.stb-empty').hidden = this.data.some(d => d.matches.length);
    const max = Math.max(1, ...this.data.map(d => d.matches.length));
    const columns = this.root.querySelector('.stb-columns'); columns.replaceChildren();
    /* geometry: the gap gives way before a bar gets thinner than 3px,
       so bars at the widest gap still draw */
    const width = this.plot.getBoundingClientRect().width;
    const gap = Math.max(1, Math.min(6, (width - 3 * count) / (count - 1)));
    this.bw = (width - gap * (count - 1)) / count; this.gap = gap;
    this.data.forEach((d, i) => {
      const column = document.createElement('div'); column.className = 'stb-col'; column.style.left = `${i * (this.bw + gap)}px`; column.style.width = `${this.bw}px`; column.style.setProperty('--i', i);
      const lossH = d.losses / max * 100, winH = d.wins / max * 100;
      for (const [kind, height, bottom] of [['loss', lossH, 0], ['win', winH, lossH + (lossH && winH ? 3 : 0)]]) {
        const bar = document.createElement('span'); bar.className = `stb-bar stb-${kind}`; bar.style.height = '0px'; bar.style.bottom = `${bottom}px`; column.append(bar);
        requestAnimationFrame(() => { bar.style.height = `${height}px`; });
      }
      columns.append(column);
    });
    const axis = this.root.querySelectorAll('.stb-axis span'); axis[0].textContent = this.data[0].label; axis[1].textContent = this.data.at(-1).label;
  }
  select(index) {
    const was = this.at; this.at = index; this.root.toggleAttribute('data-scrub', index !== null);
    this.root.querySelectorAll('.stb-col').forEach((c, i) => c.toggleAttribute('data-on', i === index));
    if (index === null || !this.data?.[index]) return;
    const d = this.data[index], left = index * (this.bw + this.gap);
    const max = Math.max(1, ...this.data.map(d => d.matches.length));
    const height = d.matches.length / max * 100 + (d.wins && d.losses ? 3 : 0);
    /* beside the column: right while it fits there, else left */
    const tipWidth = 144, width = this.plot.getBoundingClientRect().width;
    const tx = Math.max(0, Math.min(width - tipWidth, left + this.bw + 8 + tipWidth <= width ? left + this.bw + 8 : left - tipWidth - 8));
    this.tip.replaceChildren();
    const head = document.createElement('div'); head.className = 'stb-tip-head'; head.textContent = d.label; this.tip.append(head);
    for (const text of [`${d.wins} ${d.wins === 1 ? "win" : "wins"} · ${d.losses} ${d.losses === 1 ? "loss" : "losses"}`, ...d.matches.slice(-3).reverse().map(m => `${m.you} – ${m.bot} · ${['Easy', 'Medium', 'Truly difficult'][['easy', 'medium', 'hard'].indexOf(m.mode)]}`)]) { const row = document.createElement('div'); row.textContent = text; this.tip.append(row); }
    this.ring.style.width = `${this.bw + 6}px`;
    this.go({ x: left - 3, y: 126 - height - 3, h: Math.max(8, height + 6), tip: tx }, was === null);
  }
  go(goal, immediate) {
    cancelAnimationFrame(this.raf);
    if (!this.motion || immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) this.motion = Object.fromEntries(Object.entries(goal).map(([key, value]) => [key, { x: value, v: 0 }]));
    let previous = performance.now();
    const run = now => {
      const dt = Math.min(.025, (now - previous) / 1000); previous = now; let live = false;
      for (const key of Object.keys(goal)) { const s = this.motion[key]; s.v += (380 * (goal[key] - s.x) - 34 * s.v) * dt; s.x += s.v * dt; live ||= Math.abs(goal[key] - s.x) > .05 || Math.abs(s.v) > .05; }
      this.ring.style.transform = `translate(${this.motion.x.x}px, ${this.motion.y.x}px)`; this.ring.style.height = `${this.motion.h.x}px`;
      this.tip.style.transform = `translateX(${this.motion.tip.x}px)`;
      this.raf = live ? requestAnimationFrame(run) : 0;
    };
    run(performance.now());
  }
  stop() { cancelAnimationFrame(this.raf); this.select(null); }
}
