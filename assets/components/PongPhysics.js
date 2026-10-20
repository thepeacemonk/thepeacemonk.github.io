// Continuous circle-versus-capsule collisions: the visible rounded paddles
// are a vertical line segment swept by their 5px corner radius. Sweeping the
// ball against that segment expanded by its own radius catches the first
// contact, including the round ends, before it can cross either paddle.
const EPS = 1e-7;
const SEPARATION = 1e-5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function paddleContact(ball, paddle, elapsed, duration, remaining, radius) {
  const speedY = duration > 0 ? (paddle.endY - paddle.startY) / duration : 0;
  const centerY = paddle.startY + speedY * elapsed;
  const x = ball.x - paddle.x, y = ball.y - centerY;
  const vx = ball.vx, vy = ball.vy - speedY;
  const halfWidth = paddle.width / 2;
  const segment = Math.max(0, paddle.halfHeight - halfWidth);
  const expanded = radius + halfWidth;
  const nearest = clamp(y, -segment, segment);
  const dx = x, dy = y - nearest, distance = Math.hypot(dx, dy);
  // Cursor input can place a paddle over an already nearby ball between
  // frames. Separate that overlap as well; never require a previous X plane.
  if (distance < expanded - EPS) {
    const nx = distance > EPS ? dx / distance : paddle.direction;
    const ny = distance > EPS ? dy / distance : 0;
    return { t: 0, nx, ny, depth: expanded - distance, paddle, centerY, speedY };
  }
  let earliest = null;
  const offer = (t, nx, ny) => {
    if (t < -EPS || t > remaining + EPS || vx * nx + vy * ny >= -EPS) return;
    t = clamp(t, 0, remaining);
    if (!earliest || t < earliest.t) earliest = { t, nx, ny, depth: 0, paddle, centerY: centerY + speedY * t, speedY };
  };
  // The flat faces are only the portion between the cap centres.
  if (Math.abs(vx) > EPS) for (const side of [-1, 1]) {
    const t = (side * expanded - x) / vx;
    if (Math.abs(y + vy * t) <= segment + EPS) offer(t, side, 0);
  }
  // The two semicircular ends use an exact ray/circle intersection, rather
  // than a rectangular hitbox that would turn legitimate near misses into hits.
  const a = vx * vx + vy * vy;
  if (a > EPS) for (const side of [-1, 1]) {
    const cy = side * segment, ry = y - cy;
    const b = 2 * (x * vx + ry * vy), c = x * x + ry * ry - expanded * expanded;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < -EPS) continue;
    const t = (-b - Math.sqrt(Math.max(0, discriminant))) / (2 * a);
    const hx = x + vx * t, hy = y + vy * t - cy;
    if (side * hy >= -EPS) offer(t, hx / expanded, hy / expanded);
  }
  return earliest;
}

// Resolve a narrow wall/paddle pocket on the side of contact. In this
// pocket there is not enough room for the ball's diameter: return-angle
// formulas otherwise aim it straight back into the neighbouring wall.
function escapePocket(ball, paddle, radius, height, side = paddle.direction) {
  const speed = clamp(Math.hypot(ball.vx, ball.vy), 250, 780);
  ball.x = paddle.x + side * (paddle.width / 2 + radius + .05);
  ball.y = clamp(ball.y, radius + .05, height - radius - .05);
  ball.vx = side * speed * .8;
  ball.vy = (ball.y < height / 2 ? 1 : -1) * speed * .6;
}

export function advanceBall(ball, duration, {
  width, height, radius, paddles, onPaddleHit, onWallHit,
}) {
  let elapsed = 0, remaining = duration;
  let cluster = 0;
  // Bound pathological contact clusters. If the guard is reached, the ball
  // stays at its last safe contact; untested time is never advanced blindly.
  for (let contacts = 0; contacts < 32 && remaining > EPS; contacts++) {
    ball.y = clamp(ball.y, radius, height - radius);
    if (ball.x < -radius) return 'left';
    if (ball.x > width + radius) return 'right';
    let hit = null;
    const offer = event => {
      if (event.t < -EPS || event.t > remaining + EPS) return;
      if (!hit || event.t < hit.t) hit = { ...event, t: clamp(event.t, 0, remaining) };
    };
    for (const paddle of paddles) {
      const contact = paddleContact(ball, paddle, elapsed, duration, remaining, radius);
      if (contact) offer({ ...contact, kind: 'paddle' });
    }
    if (ball.vy < -EPS) offer({ kind: 'wall', t: (radius - ball.y) / ball.vy, ny: 1 });
    if (ball.vy > EPS) offer({ kind: 'wall', t: (height - radius - ball.y) / ball.vy, ny: -1 });
    if (ball.vx < -EPS) offer({ kind: 'goal', side: 'left', t: (-radius - ball.x) / ball.vx });
    if (ball.vx > EPS) offer({ kind: 'goal', side: 'right', t: (width + radius - ball.x) / ball.vx });
    if (!hit) { ball.x += ball.vx * remaining; ball.y += ball.vy * remaining; return null; }
    ball.x += ball.vx * hit.t; ball.y += ball.vy * hit.t;
    elapsed += hit.t; remaining -= hit.t;
    cluster = hit.t < 1e-5 ? cluster + 1 : 0;
    if (hit.kind === 'goal') return hit.side;
    if (hit.kind === 'wall') {
      ball.y = hit.ny > 0 ? radius + SEPARATION : height - radius - SEPARATION;
      ball.vy = Math.abs(ball.vy) * hit.ny;
      onWallHit?.(); continue;
    }
    const paddleTop = hit.centerY - hit.paddle.halfHeight;
    const paddleBottom = hit.centerY + hit.paddle.halfHeight;
    const narrowPocket = (paddleTop < radius * 2 + 2 && ball.y < hit.centerY - hit.paddle.halfHeight + hit.paddle.width / 2)
      || (height - paddleBottom < radius * 2 + 2 && ball.y > hit.centerY + hit.paddle.halfHeight - hit.paddle.width / 2);
    if (narrowPocket || cluster >= 3) {
      const side = hit.nx * hit.paddle.direction < -EPS ? -hit.paddle.direction : hit.paddle.direction;
      onPaddleHit?.(hit.paddle, hit.centerY);
      escapePocket(ball, hit.paddle, radius, height, side);
      continue;
    }
    ball.x += hit.nx * (hit.depth + SEPARATION);
    ball.y += hit.ny * (hit.depth + SEPARATION);
    if (ball.y < radius || ball.y > height - radius) {
      // A rounded paddle end can pinch a ball against a wall. Escape toward
      // the court along that cap, rather than alternating overlapping clamps.
      ball.y = clamp(ball.y, radius, height - radius);
      const segment = hit.paddle.halfHeight - hit.paddle.width / 2;
      const relativeY = ball.y - hit.centerY;
      const dy = relativeY - clamp(relativeY, -segment, segment);
      const expanded = radius + hit.paddle.width / 2;
      const dx = Math.sqrt(Math.max(0, expanded * expanded - dy * dy));
      ball.x = hit.paddle.x + hit.paddle.direction * (dx + SEPARATION);
      const distance = Math.hypot(ball.x - hit.paddle.x, dy);
      hit.nx = (ball.x - hit.paddle.x) / distance; hit.ny = dy / distance;
    }
    const inward = ball.vx * hit.nx + (ball.vy - hit.speedY) * hit.ny;
    if (inward < -EPS) {
      const beforeX = ball.vx, beforeY = ball.vy;
      if (onPaddleHit) onPaddleHit(hit.paddle, hit.centerY);
      if (!onPaddleHit || hit.nx * hit.paddle.direction < -EPS) {
        // A contact on the back must reflect on that side. Forcing the
        // front-facing arcade angle here can pin the ball into the paddle.
        ball.vx = beforeX - 2 * inward * hit.nx; ball.vy = beforeY - 2 * inward * hit.ny;
      }
      // Arcade return angles must still separate from a moving rounded end.
      // Otherwise a fast paddle could immediately sweep through the ball again.
      const after = ball.vx * hit.nx + (ball.vy - hit.speedY) * hit.ny;
      if (after < EPS) { ball.vx += (EPS - after) * hit.nx; ball.vy += (EPS - after) * hit.ny; }
    }
  }
  return null;
}
