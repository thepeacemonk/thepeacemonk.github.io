import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceBall } from '../assets/components/PongPhysics.js';

const paddles = () => [
  { x: 31, startY: 200, endY: 200, width: 10, halfHeight: 35, direction: 1 },
  { x: 689, startY: 200, endY: 200, width: 10, halfHeight: 35, direction: -1 },
];
const advance = (ball, dt, bars = paddles()) => advanceBall(ball, dt, {
  width: 720, height: 400, radius: 8, paddles: bars,
});
function separated(ball, bars) {
  for (const bar of bars) {
    const y = ball.y - bar.endY;
    const distance = Math.hypot(ball.x - bar.x, y - Math.max(-30, Math.min(30, y)));
    assert.ok(distance >= 13 - 1e-4, `Ball intersects a rounded paddle: ${JSON.stringify({ ball, bar, distance })}`);
  }
  assert.ok(ball.y >= 8 - 1e-4 && ball.y <= 392 + 1e-4, 'Ball stays inside the top/bottom walls');
}

test('neither paddle tunnels at speeds far beyond the game speed cap', () => {
  for (const [x, vx, direction] of [[80, -100000, 1], [640, 100000, -1]]) {
    const ball = { x, y: 200, vx, vy: 0 };
    assert.equal(advance(ball, .001), null);
    assert.equal(Math.sign(ball.vx), direction);
    separated(ball, paddles());
  }
});

test('diagonal hits use the impact height, not the end-of-frame height', () => {
  const ball = { x: 100, y: 130, vx: -20000, vy: 30000 };
  assert.equal(advance(ball, .004), null);
  assert.ok(ball.vx > 0);
  separated(ball, paddles());
});

test('rounded tips bounce while genuine near misses remain goals', () => {
  const hit = { x: 70, y: 238, vx: -1000, vy: 0 };
  assert.equal(advance(hit, .05), null);
  assert.ok(hit.vx > 0);
  separated(hit, paddles());
  assert.equal(advance({ x: 70, y: 244, vx: -1000, vy: 0 }, .1), 'left');
});

test('a cursor-positioned paddle overlapping the ball separates and returns it', () => {
  const ball = { x: 680, y: 200, vx: 400, vy: 0 };
  advance(ball, .008);
  assert.ok(ball.vx < 0);
  separated(ball, paddles());
});

test('a moving paddle end cannot sweep through a stationary ball', () => {
  const bars = paddles(); bars[1].startY = 270; bars[1].endY = 150;
  const ball = { x: 680, y: 200, vx: 0, vy: 0 };
  assert.equal(advance(ball, .02, bars), null);
  separated(ball, bars);
});

test('wall/paddle pinches resolve toward the court, inside both surfaces', () => {
  for (const bottom of [false, true]) {
    const bars = paddles(); bars[0].startY = bars[0].endY = bottom ? 351 : 49;
    const ball = { x: 31, y: bottom ? 392 : 8, vx: 0, vy: bottom ? 100 : -100 };
    advance(ball, .008, bars);
    separated(ball, bars);
  }
});

test('touching a paddle while moving away does not create another rebound', () => {
  const ball = { x: 676, y: 200, vx: -400, vy: 0 };
  advance(ball, 1 / 120);
  assert.equal(ball.vx, -400);
  assert.ok(ball.x < 676);
});

test('30,000 seeded high-speed sweeps stay outside both moving paddles', () => {
  let seed = 41411;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 30000; i++) {
    const bars = paddles().map(p => ({ ...p, startY: 49 + random() * 302, endY: 49 + random() * 302 }));
    const ball = { x: 18 + random() * 684, y: 8 + random() * 384, vx: (random() - .5) * 120000, vy: (random() - .5) * 120000 };
    const goal = advance(ball, 1 / 120, bars);
    assert.ok(Object.values(ball).every(Number.isFinite));
    if (!goal) separated(ball, bars);
  }
});

test('arcade returns escape the reported wall/paddle trap on all four corners', () => {
  for (const right of [false, true]) for (const bottom of [false, true]) {
    const bar = { x: right ? 689 : 31, startY: bottom ? 348.84342302475125 : 51.15657697524875, endY: bottom ? 351 : 49, width: 10, halfHeight: 35, direction: right ? -1 : 1 };
    const ball = { x: right ? 687.9137523025274 : 32.0862476974726, y: bottom ? 391.5331324869767 : 8.4668675130233, vx: right ? 753.6760453786701 : -753.6760453786701, vy: bottom ? -12.300031520426273 : 12.300031520426273 };
    let hits = 0;
    const options = {
      width: 720, height: 400, radius: 8, paddles: [bar],
      onPaddleHit(p, y) {
        hits++;
        const angle = Math.max(-1, Math.min(1, (ball.y - y) / 35)) * Math.PI / 3;
        const speed = Math.min(780, Math.hypot(ball.vx, ball.vy) * 1.065);
        ball.vx = p.direction * speed * Math.cos(angle); ball.vy = speed * Math.sin(angle);
      },
      onWallHit() { hits++; },
    };
    assert.equal(advanceBall(ball, 1 / 120, options), null);
    assert.ok(hits <= 2, 'A pinch cannot become a contact burst');
    assert.equal(Math.sign(ball.vx), bar.direction);
    separated(ball, [bar]);
    bar.startY = bar.endY;
    for (let frame = 0; frame < 12; frame++) { advanceBall(ball, 1 / 120, options); separated(ball, [bar]); }
    assert.ok(Math.abs(ball.x - bar.x) > 60, 'Ball visibly leaves the corner instead of freezing there');
  }
});
