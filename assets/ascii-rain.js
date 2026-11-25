import { mountSloshSlider } from './components/SloshSlider.js?v=2';

export function mountAsciiRain(canvas, initialSettings) {
  // Rain simulation adapted from Study Haven's weather-physics.js and weather-core.js.
  const MAX_DROPS = 32;
  const TRAIL_LIFE = 0.24;
  const CELL_WIDTH = 7;
  const CELL_HEIGHT = 12;
  const SHELTER_RADIUS = 42;
  const GLYPHS = '.:+*0123456789/|';
  let settings = { density: 100, speed: 100, trailLength: 68, ...initialSettings };
  const ctx = canvas.getContext('2d');
  const backdrop = document.createElement('canvas');
  const sky = backdrop.getContext('2d');
  if (!ctx || !sky) return;

  const stage = canvas.parentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let drops = [], fragments = [], shelter = null;
  let width = 0, height = 0, clock = 0, lastFrame = 0, frame = 0;
  let inView = false;

  function resetDrop(drop, initial = false) {
    const cols = Math.ceil(width / CELL_WIDTH);
    // Interleave the slots across the grid so they don't all spawn at one side.
    const choices = Math.floor((cols - 1 - drop.slot) / drops.length) + 1;
    const col = drop.slot + Math.floor(Math.random() * choices) * drops.length;
    drop.x = (width - cols * CELL_WIDTH) / 2 + (col + 0.5) * CELL_WIDTH;
    drop.y = initial ? Math.random() * (height - 20) : -CELL_HEIGHT;
    drop.speed = 150 + Math.random() * 110;
    drop.trail = 1;
    drop.wait = 0;
    drop.falling = true;
  }

  function splash(x, y, normalX, normalY) {
    for (let i = 0; i < 6; i++) {
      const spread = (i / 5 * 2 - 1) * (38 + Math.random() * 55);
      const lift = 65 + Math.random() * 65;
      fragments.push({
        x: x + normalX * 2, y: y + normalY * 2,
        vx: -normalY * spread + normalX * lift, vy: normalX * spread + normalY * lift,
        age: 0, life: 0.35 + Math.random() * 0.35,
      });
    }
    if (fragments.length > 128) fragments.splice(0, fragments.length - 128);
  }

  function step(dt) {
    for (const drop of drops) {
      if (!drop.falling) {
        drop.wait -= dt;
        drop.trail = Math.max(0, drop.trail - dt / TRAIL_LIFE);
        if (drop.trail === 0 && drop.wait <= 0) resetDrop(drop);
        continue;
      }
      const nextY = drop.y + drop.speed * dt;
      let hitY = height - 8, normalX = 0, normalY = -1;
      if (shelter) {
        const dx = (drop.x - shelter.x) / SHELTER_RADIUS;
        if (Math.abs(dx) < 1) {
          // The upper arc gives both the crossing height and the splash normal.
          const dy = -Math.sqrt(1 - dx * dx);
          const arcY = shelter.y + dy * SHELTER_RADIUS;
          if (arcY >= drop.y && arcY < hitY) {
            hitY = arcY;
            normalX = dx;
            normalY = dy;
          }
        }
      }
      if (drop.y <= hitY && nextY >= hitY) {
        // Keep the head at the impact while the existing tail fades and shrinks.
        drop.y = hitY;
        drop.falling = false;
        drop.wait = 0.15 + Math.random() * 0.8;
        splash(drop.x, hitY, normalX, normalY);
      } else {
        drop.y = nextY;
      }
    }
    fragments = fragments.filter(particle => {
      particle.age += dt;
      particle.vy += 300 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      return particle.age < particle.life && particle.y < height;
    });
  }

  function paint() {
    ctx.globalAlpha = 1;
    ctx.drawImage(backdrop, 0, 0, width, height);
    ctx.font = '11px "Paper Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tick = Math.floor(clock * 7);
    for (const drop of drops) {
      if (drop.trail <= 0) continue;
      const head = Math.floor(drop.y / CELL_HEIGHT);
      for (let row = head; row >= 0 && head - row < 14; row--) {
        const y = (row + 0.5) * CELL_HEIGHT;
        if (!drop.falling && y > drop.y) continue;
        const distance = Math.max(0, drop.y - y);
        const alpha = Math.exp(-distance / (settings.trailLength * drop.trail)) * drop.trail;
        if (alpha < 0.08) break;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = distance < CELL_HEIGHT ? '#dcfff0' : '#86cfbc';
        const char = (row * 17 + drop.slot * 13 + tick * 7) % GLYPHS.length;
        ctx.fillText(GLYPHS[char], drop.x, y);
      }
    }
    ctx.fillStyle = '#baf5df';
    for (const { x, y, age, life } of fragments) {
      ctx.globalAlpha = (1 - age / life) ** 2;
      ctx.fillText('·', x, y);
    }
    if (shelter) {
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = '#a6e6d6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(shelter.x, shelter.y, SHELTER_RADIUS, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function resetDrops() {
    const defaultCount = Math.max(8, Math.ceil(width / 32));
    const count = Math.min(MAX_DROPS, Math.ceil(width / CELL_WIDTH), Math.max(1, Math.round(defaultCount * settings.density / 100)));
    drops = Array.from({ length: count }, (_, slot) => ({ slot }));
    drops.forEach(drop => resetDrop(drop, true));
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (!rect.width || !rect.height) return;
    const pixelWidth = Math.round(rect.width * ratio);
    const pixelHeight = Math.round(rect.height * ratio);
    if (width === rect.width && height === rect.height && canvas.width === pixelWidth && canvas.height === pixelHeight) return;
    ({ width, height } = rect);
    canvas.width = backdrop.width = pixelWidth;
    canvas.height = backdrop.height = pixelHeight;
    // Keep drawing and collisions in CSS pixels even on a high-DPI canvas.
    ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    sky.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    const gradient = sky.createLinearGradient(0, 0, width * 0.35, height);
    gradient.addColorStop(0, '#111b24');
    gradient.addColorStop(1, '#1d3938');
    sky.fillStyle = gradient;
    sky.fillRect(0, 0, width, height);
    fragments = [];
    shelter = null;
    resetDrops();
    paint();
  }

  const playing = () => inView && !reducedMotion.matches && !document.hidden;

  function animate(now) {
    frame = 0;
    if (!playing()) return;
    const elapsed = lastFrame ? (now - lastFrame) / 1000 : 0;
    if (!lastFrame || elapsed >= 1 / 32) {
      lastFrame = now;
      const dt = Math.min(elapsed, 0.05) * settings.speed / 100;
      clock += dt;
      step(dt);
      paint();
    }
    frame = requestAnimationFrame(animate);
  }

  function syncPlayback() {
    if (playing()) {
      if (!frame) frame = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(frame);
      frame = lastFrame = 0;
      shelter = null;
    }
  }

  function moveShelter(event) {
    if (!playing()) return;
    const rect = stage.getBoundingClientRect();
    shelter = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  const clearShelter = () => { shelter = null; };
  canvas.addEventListener('pointermove', moveShelter);
  canvas.addEventListener('pointerdown', moveShelter);
  canvas.addEventListener('pointerleave', clearShelter);
  canvas.addEventListener('pointercancel', clearShelter);
  canvas.addEventListener('pointerup', event => {
    if (event.pointerType !== 'mouse') clearShelter();
  });
  reducedMotion.addEventListener('change', syncPlayback);
  document.addEventListener('visibilitychange', syncPlayback);
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting && entry.intersectionRatio > 0;
    if (inView) resize();
    syncPlayback();
  }).observe(stage);
  syncPlayback();

  return {
    update(nextSettings) {
      const densityChanged = settings.density !== nextSettings.density;
      settings = { ...nextSettings };
      if (!width) return;
      if (densityChanged) resetDrops();
      paint();
    },
  };
}

function codeFor(settings) {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ASCII Rain</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 1rem auto; width: min(100% - 2rem, 620px); }
  .rain-stage { background: #111b24; border-radius: 12px; height: clamp(248px, 58vw, 340px); overflow: hidden; touch-action: pan-y pinch-zoom; }
  canvas { display: block; height: 100%; width: 100%; }
</style>
<div class="rain-stage"><canvas aria-hidden="true"></canvas></div>
<p>Move your pointer or touch the preview to take shelter.</p>
<script>
${mountAsciiRain.toString()}
mountAsciiRain(document.querySelector('canvas'), ${JSON.stringify(settings)});
</script>
</html>`;
}

function promptFor(settings) {
  const { density, speed, trailLength } = settings;
  return `Add the “ASCII Rain” component from My lab to my project. The rain was adapted from Study Haven. Use the complete standalone HTML below as the visual and behavioral reference.

Integration
1. Create a reusable component named AsciiRain in the project's existing component directory. The renderer uses Canvas 2D and browser APIs only. In a framework, mount it once after the canvas exists and disconnect observers, remove listeners, and cancel the frame callback when the component unmounts.
2. Scope the stage styles to the component. Match the host's sizing and corner radius, and use its typography for any controls or instructions. Keep the stage's dark blue-to-teal gradient and pale mint glyphs as the starting palette. Use the project's colors for the stage only if they preserve the contrast between the glyph heads, fading tails, and background.
3. Expose three independently adjustable values. Start from this preset:
   - Intensity (density): ${density}% of the width-based drop count. Editor range 25–200%, in steps of 5.
   - Speed (speed): ${speed / 100}×. The renderer accepts ${speed} as a percentage, with 100 meaning 1×. Editor range 25–200%, in steps of 5.
   - Trail length (trailLength): ${trailLength} CSS px. Editor range 24–120 px, in steps of 1. This sets the rate of exponential falloff, so the exact visible length also depends on opacity.
   The reference's update method accepts all three values together. Reuse the same renderer instance when settings change.

Behavior to preserve
- Align falling characters to a 7 × 12 CSS-pixel grid. Stagger the drops across columns and vary their speeds. Keep the head bright and fade the older characters above it.
- Follow the mouse or touch with a thin, 42 px-radius semicircular shelter. A drop can hit the upper arc or the floor. At impact, emit six small glyphs along the surface normal and tangent, pin the existing trail to the contact point, and let it shorten and fade over 0.24 seconds of simulation time.
- Use ResizeObserver to fit the backing canvas to the stage, with device pixel ratio capped at 2. Calculate pointer and collision positions in CSS pixels. Keep touch interaction compatible with vertical scrolling and pinch zoom.
- Run one animation loop per visible preview. Suspend it when the preview leaves the viewport or the document is hidden. Render a still frame when the user prefers reduced motion. Treat the canvas as decorative and label any settings controls you add.

Acceptance checks
- Hover on desktop and touch on mobile. The shelter follows the pointer, and the drops visibly break on its arc.
- Resize the container and try a high-DPI display. The stage stays filled and the shelter still lines up with the pointer.
- Change all three settings independently. The current values survive while the animation runs, and reduced-motion mode displays a still frame.

Standalone reference (HTML)
${codeFor(settings)}`;
}

function mountRainPlayground(demo) {
  const trigger = demo.querySelector('.lab-card-trigger');
  const editor = demo.querySelector('.lab-editor');
  const galleryPreview = demo.querySelector('.lab-card-preview');
  const editorPreview = editor.querySelector('.lab-editor-preview');
  const stage = galleryPreview.querySelector('.lab-rain-stage');
  let press = null, dragged = false;
  trigger.addEventListener('pointerdown', event => {
    press = { x: event.clientX, y: event.clientY };
    dragged = false;
  });
  trigger.addEventListener('pointermove', event => {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8) dragged = true;
  });
  trigger.addEventListener('pointerup', () => { press = null; });
  trigger.addEventListener('pointercancel', () => { press = null; });
  trigger.addEventListener('click', event => {
    if (event.detail && dragged) return;
    editorPreview.append(stage);
    editor.showModal();
  });
  editor.querySelector('.lab-editor-close').addEventListener('click', () => editor.close());
  editor.addEventListener('close', () => {
    if (editor.open) return;
    galleryPreview.append(stage);
    if (document.body.classList.contains('is-lab-open')) trigger.focus({ preventScroll: true });
  });
  window.addEventListener('peace:pagechange', ({ detail }) => {
    if (editor.open && detail?.page && detail.page !== 'lab') editor.close();
  });

  const inputs = [...demo.querySelectorAll('input[type="range"]')];
  inputs.forEach(mountSloshSlider);
  const readSettings = () => Object.fromEntries(inputs.map(input => [input.name, input.valueAsNumber]));
  const rain = mountAsciiRain(demo.querySelector('canvas'), readSettings());

  const format = {
    density: value => `${value}%`,
    speed: value => `${value / 100}×`,
    trailLength: value => `${value} px`,
  };
  function update() {
    for (const input of inputs) {
      const value = format[input.name](input.valueAsNumber);
      input.parentElement.querySelector('output').textContent = value;
      input.setAttribute('aria-valuetext', value);
    }
    rain?.update(readSettings());
  }
  inputs.forEach(input => input.addEventListener('input', update));
  update();

  const status = demo.querySelector('.lab-rain-status');
  const fallback = demo.querySelector('.lab-rain-copy-fallback');
  demo.querySelectorAll('[data-rain-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const isCode = button.dataset.rainCopy === 'code';
      const text = (isCode ? codeFor : promptFor)(readSettings());
      status.textContent = '';
      fallback.hidden = true;
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = isCode ? 'Code copied.' : 'Prompt copied.';
      } catch {
        status.textContent = 'Select and copy the text below.';
        fallback.value = text;
        fallback.hidden = false;
        fallback.focus();
        fallback.select();
      }
    });
  });
}

const demo = document.querySelector('#ascii-rain');
if (demo) mountRainPlayground(demo);
