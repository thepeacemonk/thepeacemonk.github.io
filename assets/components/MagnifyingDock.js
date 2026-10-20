// Adapted from Bencho's MagnifyingDock. MIT; see Bencho.LICENSE.txt.
/* ══ dock, distance based magnification ═══════════════════
   Scale falls off with distance from the cursor rather than
   applying only to the hovered item, which is what stops it
   reading as a row of buttons that happen to grow. */

const ICONS = {
  home: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  files: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  saved: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>',
  you: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
};

const DEFAULT_ITEMS = [
  { key: 'home', label: 'Home', icon: ICONS.home },
  { key: 'search', label: 'Search', icon: ICONS.search },
  { key: 'files', label: 'Files', icon: ICONS.files },
  { key: 'saved', label: 'Saved', icon: ICONS.saved },
  { key: 'you', label: 'You', icon: ICONS.you },
];

export class MagnifyingDock {
  /**
   * @param {HTMLElement} root container element
   * @param {Object} options
   * @param {Array<{key:string, label:string, icon:string}>} [options.items]
   * @param {number} [options.magnify=1.32] what the glyph under the cursor grows to
   * @param {number} [options.spread=2] how many neighbours either side feel it
   * @param {number} [options.lift=8] how far the nearest glyph rises out of the bar
   * @param {boolean} [options.labels=true] the name that appears over whatever is under the cursor
   * @param {(key:string) => void} [options.onChange]
   */
  constructor(root, {
    items = DEFAULT_ITEMS,
    magnify = 1.32,
    spread = 2,
    lift = 8,
    labels = true,
    onChange,
  } = {}) {
    this.root = root;
    this.items = items;
    this.magnify = magnify;
    this.spread = spread;
    this.lift = lift;
    this.labels = labels;
    this.onChange = onChange;
    this.active = items[0]?.key || '';
    this.hover = null;
    this.down = false;
    this.chose = false;

    this.nav = document.createElement('nav');
    this.nav.className = 'gdock';
    this.nav.setAttribute('aria-label', 'Dock');

    this.buttons = items.map(({ key, label, icon }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gdock-item';
      btn.setAttribute('aria-label', label);
      if (this.active === key) btn.setAttribute('aria-current', 'page');
      btn.dataset.active = String(this.active === key);

      const glyph = document.createElement('span');
      glyph.className = 'gdock-glyph';
      glyph.innerHTML = icon;

      const dot = document.createElement('span');
      dot.className = 'gdock-dot';
      dot.dataset.on = String(this.active === key);

      btn.append(glyph, dot);

      btn.addEventListener('pointerdown', e => e.stopPropagation());
      btn.addEventListener('click', () => {
        if (this.chose) return;
        this.select(key);
      });

      this.nav.append(btn);
      return { key, label, btn, glyph, dot };
    });

    if (labels) {
      this.tip = document.createElement('span');
      this.tip.className = 'gdock-tip';
      this.tip.setAttribute('aria-hidden', 'true');
      this.tipWord = document.createElement('span');
      this.tip.append(this.tipWord);
      this.nav.append(this.tip);
    }

    this.root.append(this.nav);

    // Pointer event logic from Bencho MagnifyingDock
    this.nav.addEventListener('pointerdown', e => {
      this.down = true;
      this.chose = false;
      this.to(this.at(e.clientX));
    }, { capture: true });

    this.nav.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' && !this.down) return;
      this.to(this.at(e.clientX));
    }, { capture: true });

    this.nav.addEventListener('pointerup', e => {
      if (this.down && e.pointerType !== 'mouse') {
        const i = this.at(e.clientX);
        if (i !== null && this.items[i]) {
          this.chose = true;
          this.select(this.items[i].key);
        }
      }
      this.down = false;
      if (e.pointerType !== 'mouse') this.to(null);
    }, { capture: true });

    this.nav.addEventListener('pointercancel', () => {
      this.down = false;
      this.to(null);
    });

    this.nav.addEventListener('pointerleave', () => {
      if (!this.down) this.to(null);
    });
  }

  at(clientX) {
    if (!this.buttons.length) return null;
    let best = 0;
    let gap = Infinity;
    this.buttons.forEach(({ btn }, i) => {
      const b = btn.getBoundingClientRect();
      const d = Math.abs(clientX - (b.left + b.width / 2));
      if (d < gap) { gap = d; best = i; }
    });
    return best;
  }

  to(i) {
    this.hover = i;
    this.renderMagnification();
    if (this.labels) this.renderTip();
  }

  select(key) {
    this.active = key;
    this.buttons.forEach(item => {
      const isActive = item.key === key;
      item.btn.dataset.active = String(isActive);
      item.dot.dataset.on = String(isActive);
      if (isActive) item.btn.setAttribute('aria-current', 'page');
      else item.btn.removeAttribute('aria-current');
    });
    this.onChange?.(key);
  }

  renderMagnification() {
    this.buttons.forEach(({ glyph }, i) => {
      const d = this.hover === null ? 99 : Math.abs(i - this.hover);
      const f = d > this.spread ? 0 : (1 + Math.cos((Math.PI * d) / (this.spread + 1))) / 2;
      const scale = 1 + (this.magnify - 1) * f;
      glyph.style.transform = `translateY(${-this.lift * f}px) scale(${scale})`;
    });
  }

  renderTip() {
    if (!this.tip || !this.tipWord) return;
    if (this.hover === null) {
      this.tip.dataset.on = 'false';
      return;
    }
    const item = this.buttons[this.hover];
    if (!item) return;

    this.tipWord.textContent = item.label;
    const w = Math.ceil(this.tipWord.scrollWidth) + 24;
    const x = item.btn.offsetLeft + item.btn.offsetWidth / 2 - w / 2;
    this.tip.style.width = `${w}px`;
    this.tip.style.transform = `translateX(${x}px)`;
    this.tip.dataset.on = 'true';
  }
}
