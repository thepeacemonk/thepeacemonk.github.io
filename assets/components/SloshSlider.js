// Adapted from Bencho's Slosh slider. MIT; see Bencho.LICENSE.txt.
const VISCOSITY = 5;
const TILT = 0.45;
const FRAME_MS = 16.67;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function mountSloshSlider(input) {
  const track = input.parentElement;
  const min = Number(input.min);
  const max = Number(input.max);
  const step = Number(input.step || 1);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const positionForValue = () => (input.valueAsNumber - min) / (max - min) * 100;
  let position = positionForValue();
  let fill = position;
  let fillVelocity = 0;
  let pointerId = null, frame = 0, previousFrame = 0;
  let publishing = false;

  function paint() {
    // The leading edge only leans while moving. At rest it is upright.
    const lean = reduced.matches ? 0 : clamp(TILT * fillVelocity * 3, -20, 20);
    const level = `${Number(fill.toFixed(2))}%`;
    track.style.setProperty('--slosh-fill', level);
    track.style.setProperty('--slosh-top', `calc(var(--slosh-fill) + ${lean}px)`);
    track.style.setProperty('--slosh-bottom', `calc(var(--slosh-fill) - ${lean}px)`);
    track.style.setProperty('--slosh-position', `${position}%`);
  }

  function publish() {
    const value = clamp(min + Math.round(position / 100 * (max - min) / step) * step, min, max);
    if (value === input.valueAsNumber) return;
    input.valueAsNumber = value;
    publishing = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    publishing = false;
  }

  function animate(now) {
    frame = 0;
    const dt = previousFrame ? clamp((now - previousFrame) / FRAME_MS, 0, 2.5) : 1;
    previousFrame = now;

    // Only the fill has inertia. Animation never changes the selected value.
    const soft = VISCOSITY / 100;
    const stiffness = 0.34 - soft * 0.29;
    const damping = 0.74 + soft * 0.22;
    fillVelocity += (position - fill) * stiffness * dt;
    fillVelocity *= damping ** dt;
    fill += fillVelocity * dt;
    // The end stops give back some of the liquid's velocity.
    if (fill < 0 || fill > 100) {
      fill = clamp(fill, 0, 100);
      fillVelocity *= -0.42;
    }
    const settled = Math.abs(position - fill) < 0.02 && Math.abs(fillVelocity) < 0.02;
    if (settled) {
      fill = position;
      fillVelocity = 0;
    }
    paint();
    if (!settled) {
      frame = requestAnimationFrame(animate);
    } else {
      previousFrame = 0;
    }
  }

  function render() {
    if (reduced.matches) {
      cancelAnimationFrame(frame);
      frame = previousFrame = fillVelocity = 0;
      fill = position;
    } else if (!frame) {
      frame = requestAnimationFrame(animate);
    }
    paint();
  }

  function readPointer(event) {
    const rect = track.getBoundingClientRect();
    return clamp((event.clientX - rect.left) / rect.width * 100, 0, 100);
  }

  input.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointerId !== null) return;
    event.preventDefault();
    input.focus({ preventScroll: true });
    input.setPointerCapture(event.pointerId);
    pointerId = event.pointerId;
    position = readPointer(event);
    publish();
    render();
  });

  input.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    position = readPointer(event);
    publish();
    render();
  });

  function release(event) {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    if (event.type === 'pointerup') {
      position = readPointer(event);
      publish();
    }
    position = positionForValue();
    render();
  }
  input.addEventListener('pointerup', release);
  input.addEventListener('pointercancel', release);
  input.addEventListener('lostpointercapture', release);

  input.addEventListener('input', () => {
    if (publishing) return;
    position = positionForValue();
    render();
  });
  reduced.addEventListener('change', () => {
    if (pointerId === null) position = positionForValue();
    render();
  });
  paint();
}
