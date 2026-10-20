// Liquid cursor ⇄ court morph for Pong (paddle + ball ⇄ cursor).
// Adapted from React Bits' GooeyNav (MIT, https://reactbits.dev).
// When the cursor leaves the court, the paddle and ball melt into liquid droplets
// that stream across the arena boundary to form the solid circular cursor outside.
// When the cursor returns, it breaks into droplets that reform the paddle and ball in place.

const MAX_DROPS = 32;
const PADDLE_PARTICLES = 14;
const BALL_PARTICLES = 8;
const SPREAD = 42;
const DROP_R = 4.2;
const SMOOTH = 8.0;
const WOBBLE = 0.5;
const EMERGE = 0.08;
const ABSORB = 0.12;

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uRatio;
uniform vec4 uPaddle; // cx, cy, hw, hh
uniform vec4 uBall;   // cx, cy, r, _
uniform vec4 uCursor; // cx, cy, r, _
uniform vec4 uDrops[${MAX_DROPS}];
uniform vec2 uTails[${MAX_DROPS}];
uniform int uCount;
uniform float uSmooth;
uniform vec3 uInk;

out vec4 outColor;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdPill(vec2 p, vec4 box) {
  vec2 e = max(box.zw, vec2(0.0));
  float r = min(e.x, e.y);
  vec2 q = abs(p - box.xy) - e + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sdCircle(vec2 p, vec2 c, float r) {
  return length(p - c) - r;
}

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRatio;
  float d = 1e5;
  if (uPaddle.z > 0.0) d = smin(d, sdPill(p, uPaddle), uSmooth);
  if (uBall.z > 0.0) d = smin(d, sdCircle(p, uBall.xy, uBall.z), uSmooth);
  if (uCursor.z > 0.0) d = smin(d, sdCircle(p, uCursor.xy, uCursor.z), uSmooth);

  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uCount) break;
    vec4 drop = uDrops[i];
    if (drop.z <= 0.0) continue;
    float dd = sdCapsule(p, drop.xy, drop.xy - uTails[i], drop.z);
    if (dd > d + uSmooth) continue;
    d = smin(d, dd, uSmooth);
  }

  float aa = max(fwidth(d), 0.0001);
  float body = clamp(0.5 - d / aa, 0.0, 1.0);
  outColor = vec4(uInk * body, body);
}
`;

const clamp01 = value => Math.min(1, Math.max(0, value));
const travelEase = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const bezier = (a, b, c, d, t) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};
const parseColor = value => {
  const rgb = /rgba?\(([^)]+)\)/i.exec(String(value));
  if (rgb) return rgb[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).map(part => parseFloat(part) / 255);
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].replace(/./g, digit => digit + digit) : hex[1];
    return [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16) / 255);
  }
  return [0.07, 0.07, 0.07];
};

function build(gl) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return null; }
  const names = ['uRes', 'uRatio', 'uPaddle', 'uBall', 'uCursor', 'uDrops', 'uTails', 'uCount', 'uSmooth', 'uInk'];
  const uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)]));
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  return { program, uniforms, buffer, position: gl.getAttribLocation(program, 'aPosition') };
}

export class GooeyMorph {
  /**
   * @param {HTMLCanvasElement} canvas fixed fullscreen overlay canvas
   * @param {{ getInk: () => string, onSettle: (kind: 'court'|'cursor') => void }} options
   */
  constructor(canvas, options) {
    this.canvas = canvas;
    this.options = options;
    this.gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    this.pipeline = this.gl ? build(this.gl) : null;
    this.supported = Boolean(this.pipeline);
    this.nodes = new Map();
    this.drops = [];
    this.mode = null; // 'to_cursor' | 'to_court'
    this.raf = 0;
    this.last = 0;
    this.ratio = 1;
    this.inkKey = '';
    this.ink = [0.07, 0.07, 0.07];
    this.dropData = new Float32Array(MAX_DROPS * 4);
    this.tailData = new Float32Array(MAX_DROPS * 2);
    this.frame = this.frame.bind(this);
  }

  get active() { return this.raf !== 0 || this.nodes.size > 0 || this.drops.length > 0; }
  get entering() { return this.mode === 'to_court' && this.active; }
  get leaving() { return this.mode === 'to_cursor' && this.active; }

  reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

  measure() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.width = width;
    this.height = height;
    this.ratio = ratio;
    const bw = Math.max(1, Math.round(width * ratio));
    const bh = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
  }

  makeNode(kind, x, y, extra = {}) {
    return { kind, x, y, mass: 0, scale: 0, velocity: 0, outgoing: 0, fading: false, ...extra };
  }

  /**
   * Cursor left the court: paddle + ball break into droplets and stream to the cursor outside.
   * @param {number} exitX mouse X (screen px)
   * @param {number} exitY mouse Y (screen px)
   * @param {{ paddle: {x:number,y:number,hw:number,hh:number}, ball: {x:number,y:number,r:number} }} court
   */
  leave(exitX, exitY, court) {
    if (!this.supported) return false;
    this.measure();
    if (this.reduced()) { this.finish('cursor'); return true; }

    this.mode = 'to_cursor';
    this.nodes.clear();
    this.drops.length = 0;

    const paddleNode = this.makeNode('paddle', court.paddle.x, court.paddle.y, {
      hw: court.paddle.hw, hh: court.paddle.hh,
    });
    paddleNode.mass = paddleNode.scale = 1;
    this.nodes.set('paddle', paddleNode);

    const ballNode = this.makeNode('ball', court.ball.x, court.ball.y, {
      r: court.ball.r,
    });
    ballNode.mass = ballNode.scale = 1;
    this.nodes.set('ball', ballNode);

    const cursorNode = this.makeNode('cursor', exitX, exitY, { r: 8 });
    cursorNode.mass = cursorNode.scale = 0;
    this.nodes.set('cursor', cursorNode);

    const now = performance.now();
    this.emit('paddle', 'cursor', PADDLE_PARTICLES, now);
    this.emit('ball', 'cursor', BALL_PARTICLES, now);

    this.wake();
    return true;
  }

  /**
   * Cursor entered the court: cursor breaks into droplets reforming paddle and ball inside.
   * @param {number} entryX mouse X (screen px)
   * @param {number} entryY mouse Y (screen px)
   * @param {{ paddle: {x:number,y:number,hw:number,hh:number}, ball: {x:number,y:number,r:number} }} court
   */
  enter(entryX, entryY, court) {
    if (!this.supported) return false;
    this.measure();
    if (this.reduced()) { this.finish('court'); return true; }

    this.mode = 'to_court';
    this.nodes.clear();
    this.drops.length = 0;

    const cursorNode = this.makeNode('cursor', entryX, entryY, { r: 8 });
    cursorNode.mass = cursorNode.scale = 1;
    this.nodes.set('cursor', cursorNode);

    const paddleNode = this.makeNode('paddle', court.paddle.x, court.paddle.y, {
      hw: court.paddle.hw, hh: court.paddle.hh,
    });
    paddleNode.mass = paddleNode.scale = 0;
    this.nodes.set('paddle', paddleNode);

    const ballNode = this.makeNode('ball', court.ball.x, court.ball.y, {
      r: court.ball.r,
    });
    ballNode.mass = ballNode.scale = 0;
    this.nodes.set('ball', ballNode);

    const now = performance.now();
    // Split cursor mass into paddle and ball portions
    this.emitFraction('cursor', 'paddle', 0.64, PADDLE_PARTICLES, now);
    this.emitFraction('cursor', 'ball', 0.36, BALL_PARTICLES, now);

    this.wake();
    return true;
  }

  emit(fromId, toId, count, now) {
    const source = this.nodes.get(fromId);
    if (!source) return;
    const available = source.mass - source.outgoing;
    if (available <= 0.002) return;
    this.emitFraction(fromId, toId, available, count, now);
  }

  emitFraction(fromId, toId, fraction, count, now) {
    const source = this.nodes.get(fromId);
    const target = this.nodes.get(toId);
    if (!source || !target || count <= 0) return;

    source.outgoing += fraction;
    const window = 0.12;
    for (let i = 0; i < count; i++) {
      const mass = fraction / count;
      const isPaddle = source.kind === 'paddle';
      const spreadX = isPaddle ? 4 : (source.r || 8) * 0.8;
      const spreadY = isPaddle ? source.hh * 1.3 : (source.r || 8) * 0.8;

      this.drops.push({
        x: source.x + (Math.random() - 0.5) * spreadX,
        y: source.y + (Math.random() - 0.5) * spreadY,
        vx: 0, vy: 0,
        mass,
        given: 0,
        size: 0.8 + Math.random() * 0.4,
        source: fromId,
        index: toId,
        leave: now + Math.random() * window * 1000,
        emerged: 0,
        absorbed: 0,
        state: 'waiting',
      });
    }
  }

  plan(drop, now, fresh) {
    const target = this.nodes.get(drop.index);
    if (!target) return;
    const end = { x: target.x, y: target.y };
    const distance = Math.hypot(end.x - drop.x, end.y - drop.y);
    const base = 0.36 + 0.28 * Math.min(1, distance / 600);
    const duration = Math.max(0.18, base * (0.76 + Math.random() * 0.35) + (Math.random() - 0.5) * 0.08);

    const toTarget = Math.atan2(end.y - drop.y, end.x - drop.x);
    const outAngle = toTarget + (Math.random() - 0.5) * 1.3;
    const intoAngle = toTarget + (Math.random() - 0.5) * 1.3;

    const burst = SPREAD * (0.6 + Math.random() * 0.5);
    const swing = SPREAD * (0.5 + Math.random() * 0.5);
    const carry = Math.min(duration / 3, 0.12);

    drop.start = now;
    drop.duration = duration;
    drop.p0 = [drop.x, drop.y];
    drop.p1 = fresh
      ? [drop.x + Math.cos(outAngle) * burst, drop.y + Math.sin(outAngle) * burst]
      : [drop.x + drop.vx * carry, drop.y + drop.vy * carry];

    const isTargetPaddle = target.kind === 'paddle';
    drop.offset = isTargetPaddle
      ? [(Math.random() - 0.5) * 4, (Math.random() - 0.5) * target.hh * 1.2]
      : [(Math.random() - 0.5) * (target.r || 8) * 0.6, (Math.random() - 0.5) * (target.r || 8) * 0.6];
    drop.swing = [Math.cos(intoAngle) * swing, Math.sin(intoAngle) * swing];
  }

  cancel() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.nodes.clear();
    this.drops.length = 0;
    this.mode = null;
    this.clear();
  }

  wake() {
    this.canvas.style.visibility = 'visible';
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  frame(now) {
    this.raf = 0;
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;

    // Advance and simulate droplets
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      if (drop.state === 'waiting') {
        if (now < drop.leave) continue;
        drop.state = 'flying';
        this.plan(drop, now, true);
      }
      if (drop.state === 'flying') {
        drop.emerged = Math.min(1, drop.emerged + dt / EMERGE);
        const source = this.nodes.get(drop.source);
        if (source && drop.given < drop.mass) {
          const step = Math.min(drop.mass * (dt / EMERGE), drop.mass - drop.given);
          source.mass = Math.max(0, source.mass - step);
          source.outgoing = Math.max(0, source.outgoing - step);
          drop.given += step;
        }
        const target = this.nodes.get(drop.index);
        const end = target ? { x: target.x, y: target.y } : { x: drop.x, y: drop.y };
        const ex = end.x + drop.offset[0], ey = end.y + drop.offset[1];
        const t = clamp01((now - drop.start) / 1000 / drop.duration);
        const eased = travelEase(t);
        const x = bezier(drop.p0[0], drop.p1[0], ex + drop.swing[0], ex, eased);
        const y = bezier(drop.p0[1], drop.p1[1], ey + drop.swing[1], ey, eased);
        if (dt > 0) { drop.vx = (x - drop.x) / dt; drop.vy = (y - drop.y) / dt; }
        drop.x = x;
        drop.y = y;
        if (t >= 1) drop.state = 'absorbing';
      }
      if (drop.state === 'absorbing') {
        const step = Math.min(1 - drop.absorbed, dt / ABSORB);
        drop.absorbed += step;
        drop.vx *= 0.8;
        drop.vy *= 0.8;
        const host = this.nodes.get(drop.index);
        if (host) host.mass = Math.min(1, host.mass + drop.mass * step);
        if (drop.absorbed >= 1) this.drops.splice(i, 1);
      }
    }

    // Spring physics for all nodes
    const omega = 26;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (const [id, node] of this.nodes) {
      const zeta = node.fading ? 1 : 1 - 0.72 * WOBBLE;
      for (let n = 0; n < steps; n++) {
        node.velocity += (omega * omega * (node.mass - node.scale) - 2 * zeta * omega * node.velocity) * h;
        node.scale += node.velocity * h;
      }
      const spent = node.mass <= 0.002 && node.outgoing <= 0.002;
      if (node.fading && spent && Math.abs(node.scale) < 0.01) this.nodes.delete(id);
    }

    // Check completion
    if (this.mode === 'to_cursor') {
      const cursor = this.nodes.get('cursor');
      const resting = !this.drops.length && cursor && Math.abs(cursor.mass - cursor.scale) < 0.04;
      if (resting) {
        this.finish('cursor');
        return;
      }
    } else if (this.mode === 'to_court') {
      const paddle = this.nodes.get('paddle');
      const ball = this.nodes.get('ball');
      const resting = !this.drops.length && paddle && ball
        && Math.abs(paddle.mass - paddle.scale) < 0.04
        && Math.abs(ball.mass - ball.scale) < 0.04;
      if (resting) {
        this.finish('court');
        return;
      }
    }

    this.render();
    this.raf = requestAnimationFrame(this.frame);
  }

  finish(kind) {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.nodes.clear();
    this.drops.length = 0;
    this.mode = null;
    this.options.onSettle?.(kind);
    this.clear();
  }

  clear() {
    const { gl } = this;
    if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    this.canvas.style.visibility = 'hidden';
  }

  render() {
    const { gl, pipeline, canvas } = this;
    if (!gl || !pipeline) return;

    let paddleData = [0, 0, 0, 0];
    let ballData = [0, 0, 0, 0];
    let cursorData = [0, 0, 0, 0];

    const paddle = this.nodes.get('paddle');
    if (paddle && paddle.scale > 0.002) {
      const a = Math.max(0, paddle.scale);
      const w = paddle.hw * 2 * Math.min(1.08, 0.42 + 0.58 * Math.sqrt(a));
      const len = Math.max(w, paddle.hh * 2 * a ** 0.75);
      paddleData = [paddle.x, paddle.y, w / 2, len / 2];
    }

    const ball = this.nodes.get('ball');
    if (ball && ball.scale > 0.002) {
      const a = Math.max(0, ball.scale);
      ballData = [ball.x, ball.y, ball.r * a, 0];
    }

    const cursor = this.nodes.get('cursor');
    if (cursor && cursor.scale > 0.002) {
      const a = Math.max(0, cursor.scale);
      cursorData = [cursor.x, cursor.y, (cursor.r || 8) * a, 0];
    }

    let count = 0;
    this.dropData.fill(0);
    this.tailData.fill(0);
    for (const drop of this.drops) {
      if (drop.state === 'waiting' || count >= MAX_DROPS) continue;
      const r = DROP_R * drop.size * Math.min(drop.emerged, 1 - drop.absorbed);
      if (r <= 0.05) continue;
      const speed = Math.hypot(drop.vx, drop.vy);
      const tail = Math.min(r * 1.1, speed * 0.018);
      this.dropData.set([drop.x, drop.y, r, 0], count * 4);
      if (speed > 0.01) this.tailData.set([drop.vx / speed * tail, drop.vy / speed * tail], count * 2);
      count++;
    }

    const inkKey = this.options.getInk();
    if (inkKey !== this.inkKey) { this.inkKey = inkKey; this.ink = parseColor(inkKey); }

    const { program, uniforms, buffer, position } = pipeline;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
    gl.uniform1f(uniforms.uRatio, this.ratio);
    gl.uniform4f(uniforms.uPaddle, ...paddleData);
    gl.uniform4f(uniforms.uBall, ...ballData);
    gl.uniform4f(uniforms.uCursor, ...cursorData);
    gl.uniform4fv(uniforms.uDrops, this.dropData);
    gl.uniform2fv(uniforms.uTails, this.tailData);
    gl.uniform1i(uniforms.uCount, count);
    gl.uniform1f(uniforms.uSmooth, SMOOTH);
    gl.uniform3f(uniforms.uInk, ...this.ink);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
