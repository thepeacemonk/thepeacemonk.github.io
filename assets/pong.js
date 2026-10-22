import { WakeSlider } from './components/WakeSlider.js?v=2';
import { StackedBars } from './components/StackedBars.js?v=2';
import { PONG_MODES as modes } from './components/PongDifficulty.js';
import { PongSound } from './components/PongSound.js?v=3';
import { GooeyMorph } from './components/GooeyMorph.js?v=3';
import { EyeTracker } from './components/EyeTracker.js?v=2';
import { advanceBall } from './components/PongPhysics.js?v=3';

// The secret court is self-contained; only completed matches affect its local record.
const dialog = document.querySelector('#pong-dialog');
const trigger = document.querySelector('.pong-secret');
// The same glyph palette as the ambient ASCII background, resolved left to right.
const secretWord = trigger.querySelector('.pong-secret-word');
const secretGlyphs = '.,:;-+=*0123456789ilrtfxnouczLCQOahkbdpqwmMW#%&@$';
const secretMotion = matchMedia('(prefers-reduced-motion: reduce)');
let secretFrame = 0, secretHover = false, secretFocus = false;
function revealSecretName() {
  cancelAnimationFrame(secretFrame);
  const target = secretHover || secretFocus ? 'Wupong' : 'Wukong';
  if (secretMotion.matches || document.hidden) { secretWord.textContent = target; return; }
  const from = secretWord.textContent, start = performance.now();
  let previousStep = -1;
  const animate = now => {
    const progress = Math.min(1, (now - start) / 540);
    const step = Math.floor((now - start) / 42);
    if (step !== previousStep || progress === 1) {
      previousStep = step;
      secretWord.textContent = [...target].map((letter, i) => {
        const local = progress * 1.5 - i / target.length * .5;
        if (local >= .75) return letter;
        if (local <= 0) return from[i] || letter;
        return secretGlyphs[Math.floor(Math.random() * secretGlyphs.length)];
      }).join('');
    }
    if (progress < 1) secretFrame = requestAnimationFrame(animate);
    else { secretWord.textContent = target; secretFrame = 0; }
  };
  secretFrame = requestAnimationFrame(animate);
}
trigger.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { secretHover = true; revealSecretName(); } });
trigger.addEventListener('pointerleave', () => { secretHover = false; revealSecretName(); });
trigger.addEventListener('focus', () => { secretFocus = true; revealSecretName(); });
trigger.addEventListener('blur', () => { secretFocus = false; revealSecretName(); });
secretMotion.addEventListener('change', revealSecretName);
const canvas = dialog.querySelector('canvas');
const ctx = canvas.getContext('2d');
const play = dialog.querySelector('.pong-play');
const levels = dialog.querySelector('.pong-levels');
const overlay = dialog.querySelector('.pong-overlay');
const sideHint = dialog.querySelector('.pong-side-hint');
const feedback = dialog.querySelector('.pong-feedback');
let feedbackAnimation;
const court = dialog.querySelector('.pong-court');
const avatar = court.querySelector('.pong-paddle-avatar');
const avatarPath = avatar.querySelector('.pong-paddle-avatar-path');
const CURSOR_PATH = 'M50 0C77.6 0 100 22.4 100 50C100 77.6 77.6 100 50 100C22.4 100 0 77.6 0 50C0 22.4 22.4 0 50 0Z';
const PADDLE_PATH = 'M50 0C22.4 0 0 22.4 0 50L0 50C0 77.6 22.4 100 50 100C50 100 50 100 50 100C50 100 50 100 50 100C50 100 50 100 50 100C77.6 100 100 77.6 100 50C100 22.4 77.6 0 50 0Z';
let paddleActive = false;
let glide = 0, glideLast = 0;
const PADDLE_SPEED = 480;
let avatarAnimation, pathAnimation;
const historyDialog = document.querySelector('#pong-history');
for (const surface of [dialog, historyDialog]) {
  surface.addEventListener('selectstart', event => event.preventDefault());
  surface.addEventListener('dragstart', event => event.preventDefault());
}
const root = document.documentElement;
const KEY = 'peace.pong.records.v1';
const MATCH_KEY = 'peace.pong.matches.v1';
const CONTROL_KEY = 'peace.pong.control.v1';
const dockMenu = dialog.querySelector('.pong-dock-menu');
const modeGroup = dialog.querySelector('.pong-control-mode');
const modeButtons = modeGroup ? [...modeGroup.querySelectorAll('.pong-mode-btn')] : [];
const dockButtons = dockMenu ? [...dockMenu.querySelectorAll('.pong-dock-btn')] : [];
const modeTip = dockMenu?.querySelector('.pong-mode-tip');
const modeTipWord = modeTip?.querySelector('span');
let controlMode = 'cursor';
try {
  const savedControl = localStorage.getItem(CONTROL_KEY);
  if (savedControl === 'keyboard' || savedControl === 'cursor') controlMode = savedControl;
} catch {}
const W = 720, H = 400, HALF = 35, R = 8, PADDLE_PAD = 14;
const MIN_Y = HALF + PADDLE_PAD, MAX_Y = H - HALF - PADDLE_PAD;
const modeKeys = Object.keys(modes);
const lines = {
  point: [
    'That was a warm-up. Obviously.', 'A tactical miss. Very advanced stuff.',
    'Your paddle has suspiciously good Wi-Fi.', 'Okay, that one was kind of beautiful.',
    "My paddle blinked. That's my story.", 'That point had your name on it.',
    "I'm choosing to call that research.", 'A small setback for a very small square.',
    'Okay. Respectfully: rude.', 'You found the gap in my confidence.',
    'I saw that coming. Emotionally, I was elsewhere.', 'My comeback is buffering.',
    'One point to you. A deep sigh to me.', 'That was annoyingly elegant.',
    'I was guarding the other timeline.', 'That angle was not in the syllabus.',
    'My reflexes are on a tea break.', 'The wall and I need to have a talk.',
    'A point for you. A plot twist for me.', 'I moved. Just in the wrong direction.',
    'You made that look much too easy.', 'That ball took the scenic route.',
    'I would appeal, but the ball has receipts.', 'My confidence just lost a pixel.',
    'The gap was tiny. Your aim was not.', 'Please stop improving during the match.',
  ],
  miss: [
    'A tiny donation to the Wu appreciation club. Thank you.', 'My training data finally paid off.',
    'Nothing is difficult. Except that return.', 'One point closer to my robot retirement.',
    'Wu-hoo. That one counts.', 'A round of applause for this square.',
    'I meant to do that. This time.', 'Another point for the tiny rectangle.',
    'Did you see that? I have witnesses.', 'Please admire my very modest celebration.',
    'My two eyes are smiling. Both of them.', 'A little point. A lot of joy.',
    'That bounce deserves a tiny trophy.', 'Confidence level: slightly unreasonable.',
    'A calculated bounce. Ignore the calculator.', 'Right through the gap. How polite.',
    'My paddle would like a little applause.', 'One small point for Wu-kind.',
    'That one came with a victory wiggle.', 'The wall is my doubles partner.',
    'I have peaked. Until the next point.', 'That ball understood the assignment.',
    'Filed under: things I will brag about.', 'A little bounce of destiny.',
    'I was cool about that. Internally: fireworks.', 'You blinked. I took notes.',
  ],
  win: [
    'I demand a rematch. And a larger paddle.', 'You mastered it. I’m going to stare at a wall.',
    'Defeated by someone with actual homework. Humbling.', 'Fine. The Patriarch was right about you.',
    'You win. My dramatic exit is loading.', 'Five points. Zero mercy. Impressive.',
    'I need a minute and a software update.', 'Your victory. My character development.',
    'You beat me fair and square. Mostly square.', 'Please be gentle in the match history.',
    'I shall return. After a very small nap.', 'My eyes are Xs. My respect is real.',
    'You earned that. I earned a snack break.', 'The student has defeated the little square.',
    'Five points. I have five new questions.', 'The rematch button is looking at you.',
    'I brought a paddle to a masterclass.', 'You win. I will supervise the confetti.',
    'That was a lesson. Where is my certificate?', 'My defeat has excellent replay value.',
    'I accept this loss with several tiny sighs.', 'The legend grows. Mine needs a nap.',
    'Please put: brave opponent in the history.', 'You found the ending where Wu learns humility.',
    'I bow to your paddle. Very slightly.', 'Your training arc is going alarmingly well.',
  ],
  lose: [
    'Truly difficult, said the human. Play again?', 'I won! Adding this to my very small résumé.',
    'You let me win, right? ...Right?', 'The secret is practice. Also being a computer.',
    'Small square. Big scoreboard.', 'Five points. One very proud Wu.',
    'My victory speech is bigger than I am.', 'I would take a bow, but I might roll away.',
    'Behold: your tiny undefeated-looking rival.', 'I won the match. You won my respect.',
    'Wu: one. Humility: temporarily unavailable.', 'The trophy goes right beside my imaginary sofa.',
    'Same time next rematch?', 'Today, the square gets the happy ending.',
    'My victory dance requires very little space.', 'I would high-five you, but: no hands.',
    'Five points! I counted them twice.', 'That was close. My ego says otherwise.',
    'I believe this makes me a sports cube.', 'A win for me. A rematch for us?',
    'The Patriarch said practice. I listened.', 'My imaginary crowd is going wild.',
    'I will be unbearable for several seconds.', 'You gave me a workout and a story.',
    'I saved you a spot in the comeback arc.', 'Victory secured. Snack negotiations begin.',
  ],
};

let stats = Object.fromEntries(Object.keys(modes).map(key => [key, { wins: 0, losses: 0 }]));
let storageOK = true;
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  for (const key of Object.keys(modes)) for (const field of ['wins', 'losses']) {
    if (Number.isSafeInteger(saved?.[key]?.[field]) && saved[key][field] >= 0) stats[key][field] = saved[key][field];
  }
} catch { storageOK = false; }
let matches = [];
try {
  const saved = JSON.parse(localStorage.getItem(MATCH_KEY));
  if (Array.isArray(saved)) matches = saved.filter(m => m && Number.isFinite(m.at) && Object.hasOwn(modes, m.mode) && Number.isInteger(m.you) && Number.isInteger(m.bot) && m.you >= 0 && m.bot >= 0 && ((m.you === 5 && m.bot < 5) || (m.bot === 5 && m.you < 5)));
} catch { storageOK = false; }
let mode = 'easy', state = 'idle', you = 0, bot = 0;
let playerY = H / 2, botY = H / 2, targetY = H / 2;
let ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
let ballInCourt = true;
let frame = 0, last = 0, serve = 0, reaction = 0, morph = 0;
let aimError = 0;
let exitTimer = 0, lastPointerPos = { clientX: 0, clientY: 0 };
let countdown = 0;
let ink = '#111', openingAnimations = [], previousComment = '';
const commentPools = new Map();
const keys = new Set();
const difficulty = new WakeSlider(levels, {
  labels: modeKeys.map(key => modes[key].label),
  onChange: value => { mode = modeKeys[value]; reset(); },
});
const history = new StackedBars(historyDialog.querySelector('.pong-history-card'), {
  getMatches: () => matches,
  getTotals: () => Object.values(stats).reduce((total, item) => ({ wins: total.wins + item.wins, losses: total.losses + item.losses }), { wins: 0, losses: 0 }),
});
const sound = new PongSound(dialog.querySelector('.pong-sound'), () => dialog.open && !historyDialog.open);
const wu = new EyeTracker(dialog.querySelector('.wu-host'), { frame: dialog.querySelector('.pong-frame'), isVisible: () => dialog.open && !historyDialog.open && !document.hidden });
const gooeyCanvas = dialog.querySelector('.pong-gooey');
const gooey = new GooeyMorph(gooeyCanvas, {
  getInk: () => getComputedStyle(dialog).color || ink,
  onSettle: kind => {
    if (kind === 'court') {
      paddleActive = true;
      ballInCourt = true;
      draw();
    } else if (kind === 'cursor') {
      root.classList.remove('is-gooey-leaving');
    }
  },
});

const wuHost = dialog.querySelector('.wu-host');
const wuBirthCanvas = document.createElement('canvas');
wuBirthCanvas.className = 'pong-gooey wu-birth';
wuBirthCanvas.setAttribute('aria-hidden', 'true');
dialog.append(wuBirthCanvas);
const revealWu = () => {
  dialog.classList.remove('wu-forming');
  if (dialog.open) wu.start();
};
const wuBirth = new GooeyMorph(wuBirthCanvas, {
  getInk: () => getComputedStyle(dialog).color || ink,
  onSettle: revealWu,
});
function birthWu() {
  const path = dialog.querySelector('.pong-frame-corner path');
  const matrix = path.getScreenCTM();
  const length = path.getTotalLength();
  // Sample the actual stroke, including its curve, in viewport coordinates.
  const points = Array.from({ length: 14 }, (_, i) => {
    const point = path.getPointAtLength(length * (i + .5) / 14);
    return new DOMPoint(point.x, point.y).matrixTransform(matrix);
  });
  const face = wuHost.querySelector('.wu-avatar').getBoundingClientRect();
  if (!wuBirth.birth(points, {
    x: face.left + face.width / 2, y: face.top + face.height / 2, r: face.width * .44,
  })) revealWu();
}

function getCourtScreen() {
  const rect = canvas.getBoundingClientRect();
  return {
    rect,
    paddle: {
      x: rect.left + ((W - 31) / W) * rect.width,
      y: rect.top + (playerY / H) * rect.height,
      hw: (5 / W) * rect.width,
      hh: (HALF / H) * rect.height,
    },
    ball: {
      x: rect.left + (ball.x / W) * rect.width,
      y: rect.top + (ball.y / H) * rect.height,
      r: (R / W) * rect.width,
    }
  };
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const keyMovement = () => (keys.has('arrowdown') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0);
function say(kind) {
  let options = commentPools.get(kind);
  if (!options?.length) { options = [...lines[kind]]; commentPools.set(kind, options); }
  let index = Math.floor(Math.random() * options.length);
  if (options[index] === previousComment && options.length > 1) index = (index + 1) % options.length;
  previousComment = options.splice(index, 1)[0];
  wu.react(({ point: 'sad', miss: 'happy', win: 'defeat', lose: 'victory' })[kind], previousComment, kind === 'win' || kind === 'lose');
}
function showRecord() {
  historyDialog.querySelector('.stb-storage').hidden = storageOK;
}
function showOverlay(title) {
  overlay.querySelector('.pong-overlay-title').textContent = title;
  overlay.hidden = false;
}
function arenaFeedback(playerScored) {
  feedbackAnimation?.cancel();
  feedback.dataset.result = playerScored ? 'player-goal' : 'bot-goal';
  feedbackAnimation = feedback.animate([
    { opacity: 0 },
    { opacity: 1, offset: .15 },
    { opacity: 0.85, offset: .45 },
    { opacity: 0 },
  ], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 260 : 950, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
}
function setControlMode(nextMode) {
  if (exitTimer) { clearTimeout(exitTimer); exitTimer = 0; }
  dialog.classList.remove('in-arena-buffer');
  controlMode = nextMode === 'keyboard' ? 'keyboard' : 'cursor';
  dialog.dataset.control = controlMode;
  try {
    localStorage.setItem(CONTROL_KEY, controlMode);
  } catch {}
  modeButtons.forEach(btn => {
    const isActive = btn.dataset.mode === controlMode;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-checked', String(isActive));
  });
  avatarAnimation?.cancel();
  pathAnimation?.cancel();
  avatar.style.display = 'none';
  gooey.cancel();
  if (controlMode === 'keyboard') {
    paddleActive = true;
    ballInCourt = true;
  } else {
    paddleActive = court.matches(':hover');
    ballInCourt = court.matches(':hover');
  }
  score();
  draw();
}
function score() {
  dialog.querySelector('#pong-you').textContent = you;
  dialog.querySelector('#pong-bot').textContent = bot;
  const controlHint = controlMode === 'keyboard'
    ? 'Use the up and down arrow keys to move your paddle on the right.'
    : 'Use your cursor, mouse or touch to move your paddle on the right.';
  canvas.setAttribute('aria-label', `Wupong court. You ${you}, Wu ${bot}. ${controlHint}`);
}
function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = ink;
  ctx.globalAlpha = .15;
  for (let y = 8; y < H; y += 20) ctx.fillRect(W / 2 - 1, y, 2, 9);
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.roundRect(26, botY - HALF, 10, HALF * 2, 5); ctx.fill();
  if (controlMode === 'keyboard' || paddleActive || keys.size > 0) {
    ctx.beginPath(); ctx.roundRect(W - 36, playerY - HALF, 10, HALF * 2, 5); ctx.fill();
  }
  if (state !== 'countdown' && (controlMode === 'keyboard' || ballInCourt)) {
    ctx.beginPath(); ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2); ctx.fill();
  }
  sideHint.style.top = `${playerY / H * 100}%`;
  sideHint.hidden = (state === 'playing') || (controlMode === 'cursor' && !paddleActive && keys.size === 0);
  if (state === 'countdown' && (controlMode === 'keyboard' || paddleActive || keys.size > 0)) {
    ctx.globalAlpha = .06;
    ctx.beginPath(); ctx.roundRect(W - 44, playerY - HALF - 8, 26, HALF * 2 + 16, 13); ctx.fill();
    ctx.globalAlpha = 1;
  }
}
function reset() {
  if (exitTimer) { clearTimeout(exitTimer); exitTimer = 0; }
  feedbackAnimation?.cancel();
  avatarAnimation?.cancel(); pathAnimation?.cancel();
  avatar.style.display = 'none'; paddleActive = controlMode === 'keyboard' || (paddleActive && court.matches(':hover'));
  ballInCourt = controlMode === 'keyboard' || court.matches(':hover');
  state = 'idle'; dialog.dataset.state = state; countdown = 0; sideHint.hidden = (controlMode === 'cursor'); you = bot = 0; playerY = botY = targetY = H / 2;
  ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  difficulty.setDisabled(false); play.textContent = 'Play'; score();
  overlay.hidden = true;
  wu.reset();
  showRecord(); draw();
  window.dispatchEvent(new CustomEvent('peace:pong-reset'));
}
function resetBotAim() {
  const settings = modes[mode];
  reaction = settings.reaction;
  targetY = botY;
  // Keep one aiming error for the whole return; repeated rerolls cancel mistakes out.
  aimError = (Math.random() - .5) * settings.error * 2;
}
function launch(direction) {
  const angle = (Math.random() - .5) * .7;
  ball = { x: W / 2, y: H / 2, vx: direction * modes[mode].speed * Math.cos(angle), vy: modes[mode].speed * Math.sin(angle) };
  serve = .8;
  resetBotAim();
}
function finish() {
  state = 'finished'; dialog.dataset.state = state; sideHint.hidden = true; keys.clear(); difficulty.setDisabled(false);
  const won = you === 5;
  stats[mode][won ? 'wins' : 'losses']++;
  matches.push({ at: Date.now(), mode, you, bot });
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
    localStorage.setItem(MATCH_KEY, JSON.stringify(matches));
    storageOK = true;
  } catch { storageOK = false; }
  sound.play(won ? 'win' : 'lose');
  showRecord(); say(won ? 'win' : 'lose');
  showOverlay(won ? 'You win.' : 'Wu wins.');
  play.textContent = won ? 'Rematch?' : 'Try again';
  window.dispatchEvent(new CustomEvent('peace:pong-finish', { detail: { won } }));
}
function point(playerScored) {
  arenaFeedback(playerScored);
  if (playerScored) you++; else bot++;
  score();
  if (you === 5 || bot === 5) { finish(); return; }
  say(playerScored ? 'point' : 'miss');
  sound.play(playerScored ? 'point' : 'miss');
  launch(playerScored ? -1 : 1);
}
function rebound(paddleY, direction) {
  sound.play('hit');
  const offset = clamp((ball.y - paddleY) / HALF, -1, 1);
  const angle = offset * Math.PI / 3;
  const settings = modes[mode];
  const speed = Math.min(settings.maxSpeed, Math.hypot(ball.vx, ball.vy) * settings.acceleration);
  ball.vx = direction * speed * Math.cos(angle); ball.vy = speed * Math.sin(angle);
  if (direction < 0) resetBotAim();
}
function step(dt) {
  const previousPlayerY = playerY, previousWuY = botY;
  playerY = clamp(playerY + keyMovement() * PADDLE_SPEED * dt, MIN_Y, MAX_Y);
  if (serve > 0) { serve -= dt; return; }
  const settings = modes[mode];
  reaction -= dt;
  if (reaction <= 0) {
    // Easier levels see less of the future, rather than predicting every landing perfectly.
    const approaching = ball.vx < 0;
    const lookAhead = approaching ? Math.min(settings.lookAhead, Math.max(0, (36 + R - ball.x) / ball.vx)) : 0;
    let projected = approaching ? ball.y + ball.vy * lookAhead : H / 2;
    const span = H - 2 * R;
    projected = ((projected - R) % (2 * span) + 2 * span) % (2 * span);
    targetY = clamp(R + (projected > span ? 2 * span - projected : projected) + (approaching ? aimError : 0), MIN_Y, MAX_Y);
    reaction = settings.reaction;
  }
  botY = clamp(botY + clamp(targetY - botY, -settings.paddle * dt, settings.paddle * dt), MIN_Y, MAX_Y);
  const goal = advanceBall(ball, dt, {
    width: W, height: H, radius: R,
    paddles: [
      { x: 31, startY: previousWuY, endY: botY, width: 10, halfHeight: HALF, direction: 1 },
      { x: W - 31, startY: previousPlayerY, endY: playerY, width: 10, halfHeight: HALF, direction: -1 },
    ],
    onPaddleHit: (paddle, impactY) => rebound(impactY, paddle.direction),
    onWallHit: () => sound.play('wall'),
  });
  if (goal) point(goal === 'left');
}
function tick(now) {
  frame = 0;
  if (!dialog.open) return;
  const elapsed = last ? Math.max(0, (now - last) / 1000) : 0;
  let dt = Math.min(elapsed, .05); last = now;
  if (state === 'countdown') {
    playerY = clamp(playerY + keyMovement() * PADDLE_SPEED * dt, MIN_Y, MAX_Y);
    countdown = Math.max(0, countdown - elapsed);
    const label = String(Math.max(1, Math.ceil(countdown)));
    if (overlay.querySelector('.pong-overlay-title').textContent !== label) showOverlay(label);
    if (countdown === 0) {
      state = 'playing'; dialog.dataset.state = state; sideHint.hidden = true; overlay.hidden = true;
      if (!ball.vx) launch(-1);
      serve = 0;
    }
    dt = 0;
  }
  if (state === 'playing') while (dt > 0 && state === 'playing') { const slice = Math.min(dt, 1 / 120); step(slice); dt -= slice; }
  draw();
  if (state === 'playing' || state === 'countdown') frame = requestAnimationFrame(tick);
}
function run() { last = 0; if (!frame) frame = requestAnimationFrame(tick); }
// Outside of a rally (idle, paused, finished) held keys still glide the paddle smoothly.
function glideTick(now) {
  glide = 0;
  if (!dialog.open || state === 'playing' || state === 'countdown' || !keyMovement()) { glideLast = 0; return; }
  const dt = glideLast ? Math.min((now - glideLast) / 1000, .05) : 1 / 60;
  glideLast = now;
  playerY = clamp(playerY + keyMovement() * PADDLE_SPEED * dt, MIN_Y, MAX_Y);
  draw();
  glide = requestAnimationFrame(glideTick);
}
function startGlide() { if (!glide) { glideLast = 0; glide = requestAnimationFrame(glideTick); } }
function pause() {
  if (exitTimer) { clearTimeout(exitTimer); exitTimer = 0; }
  if (state !== 'playing' && state !== 'countdown') return;
  state = 'paused'; dialog.dataset.state = state; sideHint.hidden = true; keys.clear(); cancelAnimationFrame(frame); frame = 0;
  play.textContent = 'Resume'; showOverlay('Paused.'); sound.sleep();
}
function action() {
  if ((dialog.classList.contains('is-opening') || dialog.classList.contains('is-closing'))) return;
  if (state === 'playing' || state === 'countdown') { pause(); return; }
  if (state !== 'paused') reset();
  state = 'countdown'; dialog.dataset.state = state; countdown = 3; sideHint.hidden = !paddleActive && keys.size === 0; showOverlay('3'); difficulty.setDisabled(true); play.textContent = 'Pause'; sound.unlock();
  canvas.focus({ preventScroll: true }); run();
}
function enterCourt(event) {
  if (!dialog.open || (dialog.classList.contains('is-opening') || dialog.classList.contains('is-closing')) || historyDialog.open) return;
  if (exitTimer) { clearTimeout(exitTimer); exitTimer = 0; }
  root.classList.remove('is-gooey-leaving');
  dialog.classList.add('in-arena-buffer');
  if (controlMode === 'keyboard') {
    paddleActive = true;
    ballInCourt = true;
    return;
  }
  if (paddleActive && ballInCourt) return;

  const bounds = canvas.getBoundingClientRect();
  playerY = clamp((event.clientY - bounds.top) / bounds.height * H, MIN_Y, MAX_Y);

  if (gooey.supported) {
    if (gooey.entering) return;
    paddleActive = false;
    ballInCourt = false;
    if (state !== 'playing' && state !== 'countdown') draw();
    gooey.enter(event.clientX, event.clientY, getCourtScreen());
    return;
  }

  const courtBounds = court.getBoundingClientRect();
  const entryX = clamp(event.clientX - courtBounds.left, 13, courtBounds.width - 13);
  const entryY = clamp(event.clientY - courtBounds.top, 13, courtBounds.height - 13);

  playerY = clamp((entryY / courtBounds.height) * H, MIN_Y, MAX_Y);
  if (state !== 'playing' && state !== 'countdown') draw();

  const targetX = (W - 36) * courtBounds.width / W;
  const targetY = (playerY - HALF) * courtBounds.height / H;
  const targetW = 10 * courtBounds.width / W;
  const targetH = (HALF * 2) * courtBounds.height / H;

  avatarAnimation?.cancel();
  pathAnimation?.cancel();
  avatar.style.display = 'block';

  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
  const timing = { duration, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'forwards' };

  avatarAnimation = avatar.animate([
    {
      transform: `translate(${entryX - 8}px, ${entryY - 8}px)`,
      width: '16px',
      height: '16px',
      opacity: 1,
    },
    {
      transform: `translate(${targetX}px, ${targetY}px)`,
      width: `${targetW}px`,
      height: `${targetH}px`,
      opacity: 1,
    }
  ], timing);

  pathAnimation = avatarPath.animate([
    { d: `path('${CURSOR_PATH}')` },
    { d: `path('${PADDLE_PATH}')` },
  ], timing);

  avatarAnimation.finished.then(() => {
    paddleActive = true;
    ballInCourt = true;
    avatar.style.display = 'none';
    draw();
  }).catch(() => {});
}
function leaveCourt(event) {
  if (!dialog.open || (dialog.classList.contains('is-opening') || dialog.classList.contains('is-closing')) || historyDialog.open) return;
  if (exitTimer) { clearTimeout(exitTimer); exitTimer = 0; }
  dialog.classList.remove('in-arena-buffer');
  if (controlMode === 'keyboard') return;

  if (state === 'playing' || state === 'countdown') {
    pause();
  }

  const exitPos = event || lastPointerPos;

  if (gooey.supported) {
    if (!paddleActive && !ballInCourt && !gooey.active) return;
    paddleActive = false;
    ballInCourt = false;
    root.classList.add('is-gooey-leaving');
    draw();
    gooey.leave(exitPos.clientX, exitPos.clientY, getCourtScreen());
    return;
  }

  if (!paddleActive && avatar.style.display === 'none') return;
  paddleActive = false;
  ballInCourt = false;
  draw();

  const courtBounds = court.getBoundingClientRect();
  const exitX = clamp(exitPos.clientX - courtBounds.left, 13, courtBounds.width - 13);
  const exitY = clamp(exitPos.clientY - courtBounds.top, 13, courtBounds.height - 13);

  const startX = (W - 36) * courtBounds.width / W;
  const startY = (playerY - HALF) * courtBounds.height / H;
  const startW = 10 * courtBounds.width / W;
  const startH = (HALF * 2) * courtBounds.height / H;

  avatarAnimation?.cancel();
  pathAnimation?.cancel();
  avatar.style.display = 'block';

  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
  const timing = { duration, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'forwards' };

  avatarAnimation = avatar.animate([
    {
      transform: `translate(${startX}px, ${startY}px)`,
      width: `${startW}px`,
      height: `${startH}px`,
      opacity: 1,
    },
    {
      transform: `translate(${exitX - 8}px, ${exitY - 8}px)`,
      width: '16px',
      height: '16px',
      opacity: 0,
    }
  ], timing);

  pathAnimation = avatarPath.animate([
    { d: `path('${PADDLE_PATH}')` },
    { d: `path('${CURSOR_PATH}')` },
  ], timing);

  avatarAnimation.finished.then(() => {
    avatar.style.display = 'none';
  }).catch(() => {});
}
function getArenaBuffer() {
  if (state === 'playing' || state === 'countdown') {
    return { top: 32, bottom: 28, left: 24, right: 36 };
  }
  return { top: 14, bottom: 14, left: 14, right: 16 };
}
function checkPointerInArena(x, y) {
  const rect = canvas.getBoundingClientRect();
  const buf = getArenaBuffer();
  return (
    x >= rect.left - buf.left &&
    x <= rect.right + buf.right &&
    y >= rect.top - buf.top &&
    y <= rect.bottom + buf.bottom
  );
}
function getPointerArenaDistance(x, y) {
  const rect = canvas.getBoundingClientRect();
  const dx = Math.max(0, rect.left - x, x - rect.right);
  const dy = Math.max(0, rect.top - y, y - rect.bottom);
  return Math.hypot(dx, dy);
}
function triggerLeave(event, immediate = false) {
  if (exitTimer) {
    clearTimeout(exitTimer);
    exitTimer = 0;
  }
  dialog.classList.remove('in-arena-buffer');
  leaveCourt(event || lastPointerPos);
}
function handlePointer(event) {
  if (!dialog.open || (dialog.classList.contains('is-opening') || dialog.classList.contains('is-closing')) || historyDialog.open) return;
  if (event.pointerType !== 'mouse' && !canvas.hasPointerCapture(event.pointerId)) return;

  lastPointerPos = { clientX: event.clientX, clientY: event.clientY };

  if (gooey.leaving) {
    const cursor = gooey.nodes.get('cursor');
    if (cursor) {
      cursor.x = event.clientX;
      cursor.y = event.clientY;
    }
  }

  if (controlMode === 'keyboard') return;

  // Immediate departure if hovering explicit controls outside the court (buttons, sliders, modes)
  const overControl = event.target?.closest?.('button, .pong-control-mode, [role=slider], a');
  if (overControl && !court.contains(overControl)) {
    if (paddleActive || ballInCourt || exitTimer) {
      triggerLeave(event, true);
    }
    return;
  }

  const inArena = checkPointerInArena(event.clientX, event.clientY);
  if (inArena) {
    if (exitTimer) {
      clearTimeout(exitTimer);
      exitTimer = 0;
    }
    dialog.classList.add('in-arena-buffer');

    const bounds = canvas.getBoundingClientRect();
    playerY = clamp((event.clientY - bounds.top) / bounds.height * H, MIN_Y, MAX_Y);

    if (gooey.entering) {
      const pNode = gooey.nodes.get('paddle');
      if (pNode) {
        const cs = getCourtScreen();
        pNode.y = cs.paddle.y;
        pNode.x = cs.paddle.x;
      }
    }

    if ((!paddleActive || !ballInCourt) && avatar.style.display === 'none') {
      enterCourt(event);
    }
    if (state !== 'playing' && state !== 'countdown') draw();
    return;
  }

  // Pointer is outside the arena and its buffer zone
  if (paddleActive || ballInCourt) {
    const dist = getPointerArenaDistance(event.clientX, event.clientY);
    const isPlaying = state === 'playing' || state === 'countdown';

    // Deliberate or distant move (> 60px) or idle/paused state -> leave immediately
    if (dist > 60 || !isPlaying) {
      triggerLeave(event, true);
      return;
    }

    // Near border while actively playing -> grace window of 220ms to allow recovery from accidental flick
    if (!exitTimer) {
      exitTimer = setTimeout(() => {
        exitTimer = 0;
        triggerLeave(lastPointerPos, false);
      }, 220);
    }
  }
}
canvas.addEventListener('pointerdown', event => {
  if (state === 'paused') {
    action();
    return;
  }
  if (controlMode === 'keyboard') {
    canvas.focus({ preventScroll: true });
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  handlePointer(event);
});
canvas.addEventListener('pointerup', event => {
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});
window.addEventListener('pointermove', handlePointer, { passive: true });
document.addEventListener('mouseleave', event => {
  if (dialog.open && controlMode === 'cursor' && (paddleActive || ballInCourt || exitTimer)) {
    triggerLeave(event, true);
  }
});
play.addEventListener('click', action);
function openStats() {
  if (!dialog.open || historyDialog.open || (dialog.classList.contains('is-opening') || dialog.classList.contains('is-closing'))) return;
  pause(); sound.sleep(); wu.stop(); historyDialog.showModal(); history.render();
}
dialog.querySelector('.pong-history-open').addEventListener('click', openStats);
historyDialog.querySelector('.pong-history-close').addEventListener('click', () => historyDialog.close());
historyDialog.addEventListener('click', event => { if (event.target === historyDialog) historyDialog.close(); });
historyDialog.addEventListener('close', () => { history.stop(); if (dialog.open) { wu.start(); dialog.querySelector('.pong-history-open').focus({ preventScroll: true }); } });
dialog.querySelector('.pong-close').addEventListener('click', closeToCursor);
dialog.addEventListener('click', event => { if (event.target === dialog) closeToCursor(event); });
dialog.addEventListener('cancel', event => { event.preventDefault(); closeToCursor(); });
dialog.addEventListener('keydown', event => {
  if (dialog.classList.contains('is-closing')) return;
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'w'].includes(key)) {
    if (event.target.closest('.pong-control-mode, [role=slider]')) return;
    event.preventDefault();
    paddleActive = true;
    keys.add(key);
    if (state !== 'playing' && state !== 'countdown') startGlide();
  }
  if (key === 'p' && !event.target.closest('button, input, [role=slider]')) { event.preventDefault(); if (!event.repeat) action(); }
});
// Capture before focused buttons handle Space, so it always controls the match
// instead of accidentally toggling sound, selecting a mode, or closing Pong.
document.addEventListener('keydown', event => {
  if (!dialog.open || historyDialog.open || (dialog.classList.contains('is-opening') || dialog.classList.contains('is-closing'))) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  const key = event.key.toLowerCase();
  if (![' ', 'k', 'c', 's', 'm'].includes(key)) return;
  event.preventDefault(); event.stopPropagation();
  if (event.repeat) return;
  if (key === ' ') action();
  else if (key === 's') openStats();
  else if (key === 'm') dialog.querySelector('.pong-sound').click();
  else {
    keys.clear();
    setControlMode(key === 'k' ? 'keyboard' : 'cursor');
    canvas.focus({ preventScroll: true });
  }
}, { capture: true });
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { pause(); sound.sleep(); });
window.addEventListener('resize', () => {
  if (wuBirth.active) { wuBirth.cancel(); revealWu(); }
  if (historyDialog.open) history.render();
});
dialog.addEventListener('focusout', event => { if (!dialog.contains(event.relatedTarget)) keys.clear(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); sound.sleep(); wu.stop(); } else if (dialog.open && !historyDialog.open) wu.start(); });
async function closeToCursor(event) {
  if (!dialog.open || dialog.classList.contains('is-closing')) return;
  const destination = event?.detail ? { x: event.clientX, y: event.clientY }
    : { x: lastPointerPos.clientX || innerWidth / 2, y: lastPointerPos.clientY || innerHeight / 2 };
  const token = ++morph;
  clearOpening();
  pause(); sound.sleep(); wu.stop(); wuBirth.cancel(); gooey.cancel();
  clearTimeout(exitTimer); exitTimer = 0;
  cancelAnimationFrame(frame); frame = 0;
  avatar.style.display = 'none';
  const panel = dialog.querySelector('.pong-frame');
  const stage = dialog.querySelector('.pong-stage');
  const rect = panel.getBoundingClientRect();
  const court = getCourtScreen();
  dialog.classList.add('is-closing');
  dialog.classList.remove('wu-forming');
  root.classList.add('pong-morphing');
  const duration = secretMotion.matches ? 0 : 680;
  const timing = { duration, easing: 'cubic-bezier(.65, 0, .2, 1)', fill: 'both' };
  const flight = dialog.querySelector('.pong-flight');
  const corners = [...panel.querySelectorAll('.pong-frame-corner')];
  const offsets = [[-1,-1],[1,-1],[1,1],[-1,1]];
  const starts = [[rect.left,rect.top],[rect.right,rect.top],[rect.right,rect.bottom],[rect.left,rect.bottom]];
  const retarget = [];
  corners.forEach((original, i) => {
    const corner = document.createElement('span');
    corner.className = 'pong-flight-corner';
    corner.append(original.querySelector('svg').cloneNode(true));
    // Normalize the SVG viewBox so its path can morph into the cursor glyph.
    corner.querySelector('svg').setAttribute('viewBox', '0 0 10 10');
    const path = corner.querySelector('path');
    path.setAttribute('d', 'M.416667 9.583333V8A7.583333 7.583333 0 0 1 8 .416667H9.583333');
    flight.append(corner);
    const from = { width:'30px', height:'30px', transform:`translate(${starts[i][0]}px, ${starts[i][1]}px) rotate(${i*90}deg)` };
    const frames = () => [from, { width:'10px', height:'10px', transform:`translate(${destination.x+offsets[i][0]*18}px, ${destination.y+offsets[i][1]*18}px) rotate(${i*90}deg)` }];
    const animation = corner.animate(frames(), timing);
    openingAnimations.push(animation, path.animate([
      { d: "path('M.416667 9.583333V8A7.583333 7.583333 0 0 1 8 .416667H9.583333')" },
      { d: "path('M1.25 8.75V3.25A2 2 0 0 1 3.25 1.25H8.75')" },
    ], timing));
    retarget.push(() => animation.effect.setKeyframes(frames()));
  });
  const dot = document.createElement('span'); dot.className = 'pong-flight-dot'; flight.append(dot);
  const dotFrames = () => [
    { width:`${court.ball.r*2}px`, height:`${court.ball.r*2}px`, transform:`translate(${court.ball.x}px, ${court.ball.y}px) translate(-50%, -50%)` },
    { width:'7.5px', height:'7.5px', transform:`translate(${destination.x}px, ${destination.y}px) translate(-50%, -50%)` },
  ];
  const dotAnimation = dot.animate(dotFrames(), timing);
  openingAnimations.push(dotAnimation);
  retarget.push(() => dotAnimation.effect.setKeyframes(dotFrames()));
  const stageRect = stage.getBoundingClientRect();
  const stageFrames = () => [
    { transform:'translate(0, 0) scale(1)', opacity:1 },
    { transform:`translate(${destination.x-stageRect.left}px, ${destination.y-stageRect.top}px) scale(0)`, opacity:0 },
  ];
  const stageAnimation = stage.animate(stageFrames(), timing);
  stage.style.transformOrigin = '0 0';
  openingAnimations.push(stageAnimation);
  retarget.push(() => stageAnimation.effect.setKeyframes(stageFrames()));
  const follow = e => { if (e.pointerType === 'mouse') { destination.x=e.clientX; destination.y=e.clientY; retarget.forEach(update=>update()); } };
  window.addEventListener('pointermove', follow);
  await Promise.all(openingAnimations.map(animation=>animation.finished.catch(()=>{})));
  window.removeEventListener('pointermove', follow);
  stage.style.transformOrigin = '';
  if (token !== morph || !dialog.open) return;
  dialog.close();
  window.dispatchEvent(new CustomEvent('peace:cursor-return', { detail: destination }));
}

function clearOpening() {
  openingAnimations.forEach(animation => animation.cancel()); openingAnimations = [];
  dialog.querySelector('.pong-flight').replaceChildren();
  dialog.classList.remove('is-opening', 'is-closing'); root.classList.remove('pong-morphing');
  play.disabled = false;
}
dialog.addEventListener('close', () => {
  if (exitTimer) { clearTimeout(exitTimer); exitTimer = 0; }
  dialog.classList.remove('in-arena-buffer');
  morph++; clearOpening(); wuBirth.cancel(); dialog.classList.remove('wu-forming'); wu.stop(); feedbackAnimation?.cancel(); avatarAnimation?.cancel(); pathAnimation?.cancel(); gooey.cancel(); avatar.style.display = 'none'; paddleActive = false; ballInCourt = false; root.classList.remove('pong-active', 'is-gooey-leaving'); window.dispatchEvent(new Event('peace:pagechange')); sound.sleep(); difficulty.stop(); if (historyDialog.open) historyDialog.close(); cancelAnimationFrame(frame); frame = 0; last = 0; keys.clear(); state = 'idle'; dialog.dataset.state = state; sideHint.hidden = true;
  trigger.focus({ preventScroll: true });
});
trigger.addEventListener('click', async event => {
  if (dialog.open) return;
  const token = ++morph;
  const bounds = trigger.getBoundingClientRect();
  const origin = event.detail ? { x: event.clientX, y: event.clientY } : { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  const existing = [...document.querySelectorAll('.target-cursor__corner')];
  const starts = existing.map(corner => getComputedStyle(corner).transform);
  const useCursor = matchMedia('(pointer: fine)').matches && existing.length === 4 && root.classList.contains('has-target-cursor');
  dialog.classList.add('is-opening'); root.classList.add('pong-morphing', 'pong-active');
  dialog.classList.add('wu-forming');
  dialog.showModal(); play.disabled = true;
  ink = getComputedStyle(dialog).color; reset();
  const panel = dialog.querySelector('.pong-frame');
  const dest = panel.getBoundingClientRect();
  const court = canvas.getBoundingClientRect();
  const flight = dialog.querySelector('.pong-flight');
  const endPoints = [[dest.left, dest.top], [dest.right, dest.top], [dest.right, dest.bottom], [dest.left, dest.bottom]];
  const offsets = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 740;
  const timing = { duration, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'both' };
  endPoints.forEach(([x, y], i) => {
    const corner = useCursor ? existing[i].cloneNode(true) : document.createElement('span');
    corner.className = 'pong-flight-corner';
    if (!useCursor) corner.innerHTML = '<svg viewBox="0 0 10 10"><path d="M1.25 8.75V3.25A2 2 0 0 1 3.25 1.25H8.75" /></svg>';
    flight.append(corner);
    openingAnimations.push(corner.animate([
      { width: '10px', height: '10px', transform: useCursor ? starts[i] : `translate(${origin.x + offsets[i][0] * 18}px, ${origin.y + offsets[i][1] * 18}px) rotate(${i * 90}deg)` },
      { width: '30px', height: '30px', transform: `translate(${x}px, ${y}px) rotate(${i * 90}deg)` },
    ], timing));
    const arc = corner.querySelector('path');
    openingAnimations.push(arc.animate([
      { d: `path('${arc.getAttribute('d')}')` },
      { d: "path('M.416667 9.583333V8A7.583333 7.583333 0 0 1 8 .416667H9.583333')" },
    ], timing));
  });
  const dot = document.createElement('span'); dot.className = 'pong-flight-dot'; flight.append(dot);
  openingAnimations.push(dot.animate([
    { width: '8px', height: '8px', transform: `translate(${origin.x}px, ${origin.y}px) translate(-50%, -50%)` },
    { width: `${2 * R * court.width / W}px`, height: `${2 * R * court.height / H}px`, transform: `translate(${court.left + court.width / 2}px, ${court.top + court.height / 2}px) translate(-50%, -50%)` },
  ], timing));
  // Grow the paper from the clicked point while the real cursor corners become its frame.
  const ox = clamp(origin.x - dest.left, 0, dest.width), oy = clamp(origin.y - dest.top, 0, dest.height);
  openingAnimations.push(panel.animate([
    { clipPath: `inset(${oy}px ${dest.width - ox}px ${dest.height - oy}px ${ox}px round 24px)` },
    { clipPath: 'inset(0px 0px 0px 0px round 24px)' },
  ], timing));
  await Promise.all(openingAnimations.map(animation => animation.finished.catch(() => {})));
  if (token !== morph || !dialog.open) return;
  clearOpening();
  birthWu();
  setControlMode(controlMode);
  play.focus({ preventScroll: true });
});
/* ══ dock magnification & traveling tip (Bencho GlassDock) ═════
   Scale falls off with distance from the cursor using a raised cosine
   reach across all buttons. One traveling tooltip pill slides over whichever icon is
   focused or hovered, adjusting its width to the label. */
let dockHover = null;
let dockDown = false;
let dockChose = false;

const atDock = (clientX) => {
  if (!dockButtons.length) return null;
  let best = 0;
  let gap = Infinity;
  dockButtons.forEach((el, i) => {
    const b = el.getBoundingClientRect();
    const d = Math.abs(clientX - (b.left + b.width / 2));
    if (d < gap) { gap = d; best = i; }
  });
  return best;
};

const renderDockMagnification = (hoverIndex) => {
  const magnify = 1.32;
  const spread = 1.8;
  const lift = 3.5;
  dockButtons.forEach((btn, i) => {
    const glyph = btn.querySelector('.pong-mode-glyph');
    if (!glyph) return;
    const d = hoverIndex === null ? 99 : Math.abs(i - hoverIndex);
    const f = d > spread ? 0 : (1 + Math.cos((Math.PI * d) / (spread + 1))) / 2;
    const scale = 1 + (magnify - 1) * f;
    glyph.style.transform = `translateY(${-lift * f}px) scale(${scale})`;
    if (d <= 1) btn.dataset.near = String(Math.round(d));
    else delete btn.dataset.near;
  });
};

const getDockButtonTip = (btn) => {
  if (btn.classList.contains('pong-sound')) {
    return btn.getAttribute('aria-pressed') === 'true' ? 'Unmute' : 'Mute';
  }
  return btn.dataset.tip || (btn.dataset.mode === 'cursor' ? 'Cursor' : 'Keyboard');
};

const renderDockTip = (hoverIndex) => {
  if (!modeTip || !modeTipWord || !dockMenu) return;
  if (hoverIndex === null || hoverIndex < 0 || hoverIndex >= dockButtons.length) {
    modeTip.dataset.on = 'false';
    return;
  }
  const btn = dockButtons[hoverIndex];
  const text = getDockButtonTip(btn);
  modeTipWord.textContent = text;
  const w = Math.ceil(modeTipWord.scrollWidth) + 20;
  const menuRect = dockMenu.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const x = (btnRect.left - menuRect.left) + btnRect.width / 2 - w / 2;
  modeTip.style.width = `${w}px`;
  modeTip.style.transform = `translateX(${x}px)`;
  modeTip.dataset.on = 'true';
};

const toDock = (i) => {
  dockHover = i;
  renderDockMagnification(i);
  renderDockTip(i);
};

if (dockMenu) {
  dockMenu.addEventListener('pointerdown', (e) => {
    dockDown = true;
    dockChose = false;
    toDock(atDock(e.clientX));
  }, { capture: true });

  dockMenu.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' && !dockDown) return;
    toDock(atDock(e.clientX));
  }, { capture: true });

  dockMenu.addEventListener('pointerup', (e) => {
    if (dockDown && e.pointerType !== 'mouse') {
      const i = atDock(e.clientX);
      if (i !== null && dockButtons[i]) {
        dockChose = true;
        const chosenBtn = dockButtons[i];
        if (chosenBtn.dataset.mode) {
          setControlMode(chosenBtn.dataset.mode);
        } else {
          chosenBtn.click();
        }
      }
    }
    dockDown = false;
    if (e.pointerType !== 'mouse') toDock(null);
  }, { capture: true });

  dockMenu.addEventListener('pointercancel', () => {
    dockDown = false;
    toDock(null);
  });

  dockMenu.addEventListener('pointerleave', () => {
    if (!dockDown) toDock(null);
  });
}

dockButtons.forEach((btn, index) => {
  if (btn.dataset.mode) {
    btn.addEventListener('click', () => {
      if (dockChose) return;
      setControlMode(btn.dataset.mode);
      canvas.focus({ preventScroll: true });
    });
  }
  btn.addEventListener('focus', () => {
    toDock(index);
  });
  btn.addEventListener('blur', () => {
    if (!dockMenu?.matches(':hover')) toDock(null);
  });
});

const soundBtn = dockMenu?.querySelector('.pong-sound');
soundBtn?.addEventListener('click', () => {
  if (dockHover !== null && dockButtons[dockHover] === soundBtn) {
    renderDockTip(dockHover);
  }
});

modeGroup?.addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const nextMode = controlMode === 'cursor' ? 'keyboard' : 'cursor';
    setControlMode(nextMode);
    const targetIndex = dockButtons.findIndex(b => b.dataset.mode === nextMode);
    const targetBtn = dockButtons[targetIndex];
    targetBtn?.focus();
    toDock(targetIndex);
  }
});

requestAnimationFrame(() => {
  if (modeTip) modeTip.dataset.ready = 'true';
});

setControlMode(controlMode);
showRecord();
