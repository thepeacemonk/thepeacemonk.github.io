/* Adapted from React Bits TargetCursor (David Haz).
 * License: gradient-ascii.LICENSE.txt. Vanilla DOM adaptation for this static site.
 */
import { createTextSelection } from './text-selection.js?v=1';

const TARGETS = 'a[href], button, [role="button"], .cursor-target, .country-trigger, .project-item > span:first-child, .note-modal-card.is-single';
const SETTINGS = { size: 36, cornerSize: 10, thickness: 2.5, padding: 10, dotSize: 7.5, hoverDuration: .4 };
const OFFSETS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const state = value => ({ x: value, v: 0 });

function spring(value, goal, stiffness, damping, dt) {
  for (let i = 0; i < 2; i++) {
    const step = dt / 2;
    value.v += (stiffness * (goal - value.x) - damping * value.v) * step;
    value.x += value.v * step;
  }
  return Math.abs(value.x - goal) > .01 || Math.abs(value.v) > .01;
}

function artworkCorners(image, points) {
  if (!image || !points || !image.naturalWidth || !image.naturalHeight) return null;
  const box = image.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  // The illustration uses object-fit: contain. Include its letterboxing and float transform.
  const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const left = box.left + (box.width - width) / 2;
  const top = box.top + (box.height - height) / 2;
  return points.map(([x, y]) => [left + x * width, top + y * height]);
}

function cardQuad(element) {
  const box = element.getBoundingClientRect();
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (!box.width || !box.height || !width || !height) return null;
  // Reconstruct the actual rotated card, including the dialog's entrance scale.
  // The bounding box supplies translation/origin; the composed linear matrix supplies edges.
  let a = 1, b = 0, c = 0, d = 1;
  for (let node = element; node; node = node.parentElement) {
    const transform = getComputedStyle(node).transform;
    if (transform === 'none') continue;
    const m = new DOMMatrix(transform);
    [a, b, c, d] = [m.a * a + m.c * b, m.b * a + m.d * b,
      m.a * c + m.c * d, m.b * c + m.d * d];
  }
  const points = [[0, 0], [a * width, b * width], [a * width + c * height, b * width + d * height], [c * height, d * height]];
  const left = box.left - Math.min(...points.map(p => p[0]));
  const top = box.top - Math.min(...points.map(p => p[1]));
  const uLength = Math.hypot(a, b);
  const vLength = Math.hypot(c, d);
  if (!uLength || !vLength) return null;
  return { points: points.map(([x, y]) => [x + left, y + top]),
    u: [a / uLength, b / uLength], v: [c / vLength, d / vLength],
    angle: Math.atan2(b, a) * 180 / Math.PI };
}

function photoCorners(target) {
  if (!target?.matches('.note-modal-stack, .note-modal-card.is-single')) return null;
  const cards = target.matches('.note-modal-card') ? [target] : [...target.querySelectorAll('.note-modal-card')];
  const quads = cards.map(cardQuad).filter(Boolean);
  if (!quads.length) return null;
  return OFFSETS.map(([sx, sy], i) => {
    // Select the exposed outside corner independently for each side of the stack.
    const quad = quads.reduce((best, next) =>
      sx * next.points[i][0] + sy * next.points[i][1] > sx * best.points[i][0] + sy * best.points[i][1] ? next : best);
    return { x: quad.points[i][0] + SETTINGS.padding * (sx * quad.u[0] + sy * quad.v[0]),
      y: quad.points[i][1] + SETTINGS.padding * (sx * quad.u[1] + sy * quad.v[1]),
      angle: quad.angle + i * 90 };
  });
}

export function createTargetCursor() {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const host = document.createElement('div');
  host.className = 'target-cursor';
  host.setAttribute('aria-hidden', 'true');
  // Native dialogs sit above every z-index. Share their browser top layer.
  const topLayer = typeof host.showPopover === 'function';
  if (topLayer) host.setAttribute('popover', 'manual');
  host.style.setProperty('--cursor-corner', `${SETTINGS.cornerSize}px`);
  host.style.setProperty('--cursor-thickness', `${SETTINGS.thickness}px`);
  host.style.setProperty('--cursor-dot', `${SETTINGS.dotSize}px`);
  const corners = OFFSETS.map((_, i) => {
    const element = document.createElement('span');
    element.className = 'target-cursor__corner';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SETTINGS.cornerSize} ${SETTINGS.cornerSize}`);
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.append(path);
    element.append(svg);
    host.append(element);
    return { element, path, radius: null, x: state(0), y: state(0), angle: state(i * 90) };
  });
  const dot = document.createElement('span');
  dot.className = 'target-cursor__dot';
  host.append(dot);
  // Keep difference blending outside the body's isolated background layer.
  document.documentElement.append(host);

  const pointer = { x: 0, y: 0, inside: false, pressed: false, seen: false };
  const press = state(0);
  const events = new AbortController();
  let target = null;
  let targetRadius = 0;
  let targetImage = null;
  let targetImageCorners = null;
  let raf = 0;
  let last = 0;
  let destroyed = false;
  const selection = createTextSelection(() => refresh());

  function syncLayer() {
    if (destroyed) return;
    if (topLayer) {
      // Reinsert after a newly opened dialog, without taking focus or clicks.
      if (host.matches(':popover-open')) host.hidePopover();
      if (fine.matches) host.showPopover();
    } else {
      const dialogs = [...document.querySelectorAll('dialog[open]')];
      const parent = dialogs[dialogs.length - 1] || document.documentElement;
      if (host.parentElement !== parent) parent.append(host);
    }
    refresh();
  }
  const layerObserver = new MutationObserver(syncLayer);
  layerObserver.observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });
  syncLayer();

  function locate() {
    const found = document.elementFromPoint(pointer.x, pointer.y)?.closest(TARGETS);
    const nextTarget = found && !found.matches(':disabled, [aria-disabled="true"]') ? found : null;
    if (nextTarget !== target) {
      target = nextTarget;
      targetRadius = target ? parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0 : 0;
      targetImage = target?.querySelector('img[data-cursor-corners]') || null;
      const points = targetImage?.dataset.cursorCorners.trim().split(/\s+/).map(pair => pair.split(',').map(Number));
      targetImageCorners = points?.length === 4 && points.every(pair => pair.length === 2 && pair.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) ? points : null;
    }
    host.dataset.phase = selection.bounds() ? 'selection' : target ? 'target' : 'roaming';
  }

  function frame(now) {
    raf = 0;
    if (!pointer.inside || !fine.matches || destroyed) return;
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
    last = now;
    if (target && !target.isConnected) locate();
    const selected = selection.bounds();
    const rect = selected || target?.getBoundingClientRect();
    const artwork = selected ? null : artworkCorners(targetImage, targetImageCorners);
    const photos = selected ? null : photoCorners(target);
    const locked = rect && rect.width > 0 && rect.height > 0;
    const speed = 4.6 / (selected ? .15 : SETTINGS.hoverDuration);
    const stiffness = reduced.matches ? 2200 : locked ? speed * speed : 2200;
    const damping = locked && !reduced.matches ? 2 * (selected ? 1 : .62) * speed : 2 * Math.sqrt(stiffness);
    let moving = spring(press, pointer.pressed ? 1 : 0, 900, 40, dt);
    const squeeze = selected ? 1 : 1 - press.x * .14;
    const cx = locked ? rect.left + rect.width / 2 : pointer.x;
    const cy = locked ? rect.top + rect.height / 2 : pointer.y;
    const x = cx + (locked && !selected ? (pointer.x - cx) * .08 : 0);
    const y = cy + (locked && !selected ? (pointer.y - cy) * .08 : 0);
    const padding = selected ? 3 : SETTINGS.padding;
    const w = (locked ? rect.width / 2 + padding : SETTINGS.size / 2) * squeeze;
    const h = (locked ? rect.height / 2 + padding : SETTINGS.size / 2) * squeeze;
    const radius = selected ? 3 : locked && !artwork ? Math.min(targetRadius + SETTINGS.padding, SETTINGS.cornerSize) : 2;
    host.dataset.phase = selected ? 'selection' : target ? 'target' : 'roaming';
    // Older browsers render inside the dialog instead. Account for its entrance transform.
    const localBox = !topLayer && host.parentElement !== document.documentElement ? host.getBoundingClientRect() : null;
    const scaleX = localBox ? localBox.width / window.innerWidth || 1 : 1;
    const scaleY = localBox ? localBox.height / window.innerHeight || 1 : 1;
    const localX = value => (value - (localBox?.left || 0)) / scaleX;
    const localY = value => (value - (localBox?.top || 0)) / scaleY;

    corners.forEach((corner, i) => {
      // Each L follows a visible silhouette corner, rather than the transparent image box.
      // Keep the gap fixed while holding for credits; squeeze/parallax would push into the art.
      const goalX = photos ? photos[i].x : artwork ? artwork[i][0] + OFFSETS[i][0] * SETTINGS.padding : x + OFFSETS[i][0] * w;
      const goalY = photos ? photos[i].y : artwork ? artwork[i][1] + OFFSETS[i][1] * SETTINGS.padding : y + OFFSETS[i][1] * h;
      moving = spring(corner.x, goalX, stiffness, damping, dt) || moving;
      moving = spring(corner.y, goalY, stiffness, damping, dt) || moving;
      moving = spring(corner.angle, photos ? photos[i].angle : i * 90, 160, 26, dt) || moving;
      corner.element.style.transform = `translate3d(${localX(corner.x.x).toFixed(2)}px, ${localY(corner.y.x).toFixed(2)}px, 0) rotate(${corner.angle.x.toFixed(2)}deg)`;
      if (corner.radius !== radius) {
        const inset = SETTINGS.thickness / 2;
        const end = SETTINGS.cornerSize - inset;
        const bend = Math.min(radius, SETTINGS.cornerSize - SETTINGS.thickness);
        const tangent = inset + bend;
        corner.path.setAttribute('d', `M${inset} ${end}V${tangent}A${bend} ${bend} 0 0 1 ${tangent} ${inset}H${end}`);
        corner.radius = radius;
      }
    });
    dot.style.transform = `translate3d(${localX(pointer.x)}px, ${localY(pointer.y)}px, 0) translate(-50%, -50%) scale(${1 - press.x * .35})`;
    host.style.opacity = '1';
    document.documentElement.classList.add('has-target-cursor');
    const photosAnimating = photos && target.getAnimations({ subtree: true }).some(animation => animation.playState === 'running');
    if (moving || (artwork && !reduced.matches) || photosAnimating) wake();
    else last = 0;
  }

  function wake() {
    if (!raf && pointer.inside && !destroyed) {
      raf = requestAnimationFrame(now => {
        try { frame(now); }
        catch (error) { destroy(); console.error('Custom cursor stopped:', error); }
      });
    }
  }

  function leave() {
    pointer.inside = pointer.seen = pointer.pressed = false;
    target = null;
    targetImage = targetImageCorners = null;
    last = 0;
    cancelAnimationFrame(raf);
    raf = 0;
    host.style.opacity = '0';
    document.documentElement.classList.remove('has-target-cursor');
  }

  function onMove(event) {
    if (event.pointerType !== 'mouse' || !fine.matches) { leave(); return; }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.inside = true;
    if (!pointer.seen) {
      corners.forEach((corner, i) => {
        corner.x.x = pointer.x + OFFSETS[i][0] * SETTINGS.size / 2;
        corner.y.x = pointer.y + OFFSETS[i][1] * SETTINGS.size / 2;
        corner.angle.x = i * 90;
        corner.x.v = corner.y.v = corner.angle.v = 0;
      });
      pointer.seen = true;
    }
    locate();
    wake();
  }

  function refresh() { if (pointer.inside) { locate(); wake(); } }
  function destroy() {
    if (destroyed) return;
    leave();
    destroyed = true;
    selection.destroy();
    layerObserver.disconnect();
    events.abort();
    host.remove();
  }
  const listen = (element, name, callback, options = {}) =>
    element.addEventListener(name, callback, { ...options, signal: events.signal });
  listen(window, 'pointermove', onMove, { passive: true });
  listen(window, 'pointerdown', event => {
    if (event.pointerType !== 'mouse' || !pointer.inside) return;
    pointer.pressed = true;
    wake();
  }, { passive: true });
  listen(window, 'pointerup', () => { pointer.pressed = false; wake(); }, { passive: true });
  listen(window, 'pointercancel', leave);
  listen(document.documentElement, 'pointerleave', leave);
  listen(window, 'blur', leave);
  listen(document, 'visibilitychange', () => { if (document.hidden) leave(); });
  listen(window, 'scroll', refresh, { passive: true, capture: true });
  listen(window, 'resize', refresh, { passive: true });
  listen(window, 'peace:pagechange', refresh);
  listen(window, 'peace:cursor-return', event => {
    pointer.x = event.detail.x; pointer.y = event.detail.y;
    pointer.pressed = false; pointer.inside = true; pointer.seen = true;
    press.x = press.v = 0;
    target = null;
    corners.forEach((corner, i) => {
      corner.x.x = pointer.x + OFFSETS[i][0] * SETTINGS.size / 2;
      corner.y.x = pointer.y + OFFSETS[i][1] * SETTINGS.size / 2;
      corner.angle.x = i * 90;
      corner.x.v = corner.y.v = corner.angle.v = 0;
    });
    wake();
  });
  listen(document, 'keydown', event => { if (event.key === 'Tab') leave(); });
  listen(fine, 'change', () => { leave(); syncLayer(); });
  listen(reduced, 'change', refresh);
  listen(window, 'pagehide', leave);
  return destroy;
}

if (typeof document !== 'undefined') createTargetCursor();
