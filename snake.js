const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const speedEl = document.getElementById('speed');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub = document.getElementById('overlay-sub');
const leaderboardList = document.getElementById('leaderboard-list');
const nameModal = document.getElementById('name-modal');
const nameInput = document.getElementById('name-input');
const nameSubmit = document.getElementById('name-submit');
const nameCancel = document.getElementById('name-cancel');
const mobileControls = document.querySelector('.mobile-controls');
const boardWrap = document.querySelector('.board-wrap');

const SUPABASE_URL = 'https://rkgifqptlnnfxdmnhdul.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZ2lmcXB0bG5uZnhkbW5oZHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MTUzNzksImV4cCI6MjA4NjI5MTM3OX0.Jf9kfliKPVc0Zt3bEhNVfY9i6EKZvm8Iu8cbxDhfvMc';
const supabaseReady =
  typeof window.supabase !== 'undefined' &&
  SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
  SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
const supabaseClient = supabaseReady
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const gridSize = 20;
let cellSize = canvas.width / gridSize;

const baseStep = 165; // ms (0.15s + 10%)
const minStep = 132; // ms (120ms + 10%)
let stepTime = baseStep;
let lastStep = 0;

let running = false;
let paused = false;
let gameOver = false;

let direction = { x: 1, y: 0 };
let pendingDir = { x: 1, y: 0 };

let snake = [];
let food = { x: 8, y: 8, type: 'yellow' };
let score = 0;
let best = Number(localStorage.getItem('snake_best') || 0);
let popups = [];
let topScores = [];
let obstacles = [];
const maxObstacles = 4;
let wallSpawnCooldown = 12;
let bonusFood = null;
let nextBonusSpawnAt = 0;
let lastFrameTime = 0;

bestEl.textContent = best;

function resetGame() {
  snake = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ];
  obstacles = [];
  wallSpawnCooldown = 12;
  bonusFood = null;
  scheduleBonusSpawn(0);
  direction = { x: 1, y: 0 };
  pendingDir = { x: 1, y: 0 };
  score = 0;
  stepTime = baseStep;
  scoreEl.textContent = score;
  updateSpeed();
  placeFood();
  gameOver = false;
  paused = false;
  overlay.classList.remove('show');
}

function updateSpeed() {
  const secs = (stepTime / 1000).toFixed(2);
  speedEl.textContent = secs;
}

function placeFood() {
  const occupied = new Set(snake.map(p => `${p.x},${p.y}`));
  obstacles.forEach((wall) => {
    wall.cells.forEach((o) => occupied.add(`${o.x},${o.y}`));
  });
  if (bonusFood) occupied.add(`${bonusFood.x},${bonusFood.y}`);
  let x, y;
  do {
    x = Math.floor(Math.random() * gridSize);
    y = Math.floor(Math.random() * gridSize);
  } while (occupied.has(`${x},${y}`));
  const isPurple = Math.random() < 0.15;
  food = { x, y, type: isPurple ? 'purple' : 'yellow' };
}

function scheduleBonusSpawn(now) {
  const delay = 8000 + Math.floor(Math.random() * 10001);
  nextBonusSpawnAt = now + delay;
}

function spawnBonusFood() {
  const occupied = new Set(snake.map(p => `${p.x},${p.y}`));
  obstacles.forEach((wall) => {
    wall.cells.forEach((o) => occupied.add(`${o.x},${o.y}`));
  });
  occupied.add(`${food.x},${food.y}`);
  let x, y;
  let attempts = 0;
  do {
    attempts += 1;
    x = Math.floor(Math.random() * gridSize);
    y = Math.floor(Math.random() * gridSize);
    if (attempts > 50) return;
  } while (occupied.has(`${x},${y}`));
  bonusFood = { x, y, expiresAt: performance.now() + 5000 };
}

function spawnObstacle() {
  if (obstacles.length >= maxObstacles) return;
  const length = 3 + Math.floor(Math.random() * 7);
  const horizontal = Math.random() < 0.5;
  const occupied = new Set(snake.map(p => `${p.x},${p.y}`));
  occupied.add(`${food.x},${food.y}`);
  obstacles.forEach((wall) => {
    wall.cells.forEach((o) => occupied.add(`${o.x},${o.y}`));
  });

  let startX, startY;
  let attempts = 0;
  do {
    attempts += 1;
    startX = Math.floor(Math.random() * (gridSize - (horizontal ? length : 1)));
    startY = Math.floor(Math.random() * (gridSize - (horizontal ? 1 : length)));
    if (attempts > 50) return;
  } while (!isWallSpotFree(startX, startY, length, horizontal, occupied));

  const ttl = 30 + Math.floor(Math.random() * 81);
  const cells = [];
  for (let i = 0; i < length; i += 1) {
    const x = startX + (horizontal ? i : 0);
    const y = startY + (horizontal ? 0 : i);
    cells.push({ x, y });
  }
  obstacles.push({ id: `${startX},${startY},${horizontal}`, ttl, cells });
}

function isWallSpotFree(x, y, length, horizontal, occupied) {
  for (let i = 0; i < length; i += 1) {
    const cx = x + (horizontal ? i : 0);
    const cy = y + (horizontal ? 0 : i);
    if (occupied.has(`${cx},${cy}`)) return false;
  }
  return true;
}

function drawGrid() {
  ctx.fillStyle = '#0a0e11';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#161c22';
  ctx.lineWidth = 1;

  for (let i = 0; i <= gridSize; i += 1) {
    const pos = i * cellSize;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(canvas.width, pos);
    ctx.stroke();
  }
}

function drawObstacles() {
  ctx.fillStyle = '#46515b';
  obstacles.forEach((wall) => {
    wall.cells.forEach((o) => {
      const x = o.x * cellSize;
      const y = o.y * cellSize;
      ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    });
  });
}

function drawSnake() {
  snake.forEach((segment, index) => {
    const isHead = index === 0;
    const x = segment.x * cellSize;
    const y = segment.y * cellSize;
    const inset = cellSize * 0.08;
    const size = cellSize - inset * 2;

    const grad = ctx.createRadialGradient(
      x + cellSize * 0.35,
      y + cellSize * 0.35,
      cellSize * 0.1,
      x + cellSize * 0.6,
      y + cellSize * 0.6,
      cellSize * 0.7
    );

    if (isHead) {
      grad.addColorStop(0, '#8df5b2');
      grad.addColorStop(0.5, '#43cc78');
      grad.addColorStop(1, '#1f7a45');
    } else {
      grad.addColorStop(0, '#6feaa2');
      grad.addColorStop(0.6, '#2fb56b');
      grad.addColorStop(1, '#1a6b3b');
    }

    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = cellSize * 0.15;
    ctx.shadowOffsetY = cellSize * 0.05;
    roundRect(x + inset, y + inset, size, size, cellSize * 0.25);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (isHead) {
      const eyeSize = cellSize * 0.18;
      const eyeOffsetX = direction.x === -1 ? cellSize * 0.25 : cellSize * 0.62;
      const eyeOffsetY = direction.y === -1 ? cellSize * 0.25 : cellSize * 0.62;
      ctx.fillStyle = '#0a0f12';
      ctx.beginPath();
      ctx.arc(x + eyeOffsetX, y + eyeOffsetY, eyeSize * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d7f7ff';
      ctx.beginPath();
      ctx.arc(x + eyeOffsetX - eyeSize * 0.12, y + eyeOffsetY - eyeSize * 0.12, eyeSize * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawFood() {
  const cx = food.x * cellSize + cellSize / 2;
  const cy = food.y * cellSize + cellSize / 2;
  const r = cellSize * 0.34;
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
  if (food.type === 'purple') {
    grad.addColorStop(0, '#f3c3ff');
    grad.addColorStop(0.6, '#b06bff');
    grad.addColorStop(1, '#6b2bc5');
  } else {
    grad.addColorStop(0, '#fff2b1');
    grad.addColorStop(0.6, '#f2d06b');
    grad.addColorStop(1, '#c59b2d');
  }
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = r * 0.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawBonusFood() {
  if (!bonusFood) return;
  const cx = bonusFood.x * cellSize + cellSize / 2;
  const cy = bonusFood.y * cellSize + cellSize / 2;
  const r = cellSize * 0.34;
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
  grad.addColorStop(0, '#c8ffd9');
  grad.addColorStop(0.6, '#6eea8d');
  grad.addColorStop(1, '#1f8b49');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = r * 0.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawPopups() {
  popups.forEach((popup) => {
    ctx.save();
    ctx.globalAlpha = popup.alpha;
    ctx.fillStyle = popup.color;
    ctx.font = `${Math.floor(cellSize * 0.5)}px 'IBM Plex Mono', 'Courier New', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(popup.text, popup.x, popup.y);
    ctx.restore();
  });
}

function addPopup(points, x, y, color) {
  popups.push({
    text: `+${points}`,
    x: x * cellSize + cellSize / 2,
    y: y * cellSize + cellSize / 2,
    vy: cellSize * 0.02,
    alpha: 1,
    color: color || '#ffe8a0',
  });
}

function updatePopups() {
  popups = popups
    .map((popup) => ({
      ...popup,
      y: popup.y - cellSize * 0.04,
      alpha: popup.alpha - 0.03,
    }))
    .filter((popup) => popup.alpha > 0);
}

function step() {
  direction = pendingDir;
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  if (head.x < 0 || head.x >= gridSize || head.y < 0 || head.y >= gridSize) {
    endGame();
    return;
  }

  if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
    endGame();
    return;
  }

  if (obstacles.some(wall => wall.cells.some(o => o.x === head.x && o.y === head.y))) {
    endGame();
    return;
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    const points = food.type === 'purple' ? 25 : 10;
    score += points;
    scoreEl.textContent = score;
    addPopup(points, head.x, head.y, food.type === 'purple' ? '#d8a6ff' : '#ffe8a0');
    stepTime = Math.max(minStep, stepTime - 5);
    updateSpeed();
    placeFood();
    if (Math.random() < 0.4) spawnObstacle();
  } else {
    snake.pop();
  }

  if (bonusFood && head.x === bonusFood.x && head.y === bonusFood.y) {
    score += 50;
    scoreEl.textContent = score;
    addPopup(50, head.x, head.y, '#b9ffd0');
    bonusFood = null;
    scheduleBonusSpawn(performance.now());
  }

  wallSpawnCooldown -= 1;
  if (wallSpawnCooldown <= 0) {
    if (Math.random() < 0.7) spawnObstacle();
    wallSpawnCooldown = 8 + Math.floor(Math.random() * 9);
  }

  updateObstacles();
}

function updateObstacles() {
  obstacles = obstacles
    .map((wall) => ({ ...wall, ttl: wall.ttl - 1 }))
    .filter((wall) => wall.ttl > 0);
}

function endGame() {
  running = false;
  gameOver = true;
  if (score > best) {
    best = score;
    localStorage.setItem('snake_best', best);
    bestEl.textContent = best;
  }
  maybeSubmitLeaderboardScore();
  overlayTitle.textContent = 'Game Over';
  overlaySub.textContent = 'Press Enter to play again';
  overlay.classList.add('show');
}

function render() {
  drawGrid();
  drawFood();
  drawBonusFood();
  drawObstacles();
  drawSnake();
  drawPopups();
}

function loop(timestamp) {
  if (!running) return;
  if (!lastStep) lastStep = timestamp;
  if (!lastFrameTime) lastFrameTime = timestamp;
  const frameDelta = timestamp - lastFrameTime;
  lastFrameTime = timestamp;
  const delta = timestamp - lastStep;

  if (!bonusFood && timestamp >= nextBonusSpawnAt) {
    spawnBonusFood();
  }
  if (bonusFood && timestamp >= bonusFood.expiresAt) {
    bonusFood = null;
    scheduleBonusSpawn(timestamp);
  }

  if (!paused && delta >= stepTime) {
    lastStep = timestamp;
    step();
  }
  updatePopups();
  render();
  requestAnimationFrame(loop);
}

function startGame() {
  resetGame();
  running = true;
  lastStep = 0;
  overlayTitle.textContent = '';
  overlaySub.textContent = '';
  overlay.classList.remove('show');
  requestAnimationFrame(loop);
}

function togglePause() {
  if (!running || gameOver) return;
  paused = !paused;
  overlayTitle.textContent = paused ? 'Paused' : '';
  overlaySub.textContent = paused ? 'Press Space to resume' : '';
  overlay.classList.toggle('show', paused);
}

function handleDirection(newDir) {
  if (!running || paused) return;
  const isOpposite = newDir.x === -direction.x && newDir.y === -direction.y;
  if (isOpposite) return;
  pendingDir = newDir;
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }
  if (e.key === 'Enter') {
    startGame();
    return;
  }
  if (e.key === ' ') {
    togglePause();
    return;
  }
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    handleDirection({ x: 0, y: -1 });
  }
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
    handleDirection({ x: 0, y: 1 });
  }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    handleDirection({ x: -1, y: 0 });
  }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    handleDirection({ x: 1, y: 0 });
  }
});

overlay.classList.add('show');
overlay.addEventListener('click', () => {
  if (!running) startGame();
});
overlay.addEventListener('touchstart', () => {
  if (!running) startGame();
}, { passive: true });

if (mobileControls) {
  mobileControls.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const dir = btn.dataset.dir;
    const action = btn.dataset.action;
    if (dir === 'up') handleDirection({ x: 0, y: -1 });
    if (dir === 'down') handleDirection({ x: 0, y: 1 });
    if (dir === 'left') handleDirection({ x: -1, y: 0 });
    if (dir === 'right') handleDirection({ x: 1, y: 0 });
    if (action === 'pause') togglePause();
  });
}

if (boardWrap) {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchActive = false;

  boardWrap.addEventListener('touchstart', (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchActive = true;
  }, { passive: true });

  boardWrap.addEventListener('touchmove', (e) => {
    if (!touchActive) return;
    if (!e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const dist = Math.hypot(dx, dy);
    if (dist < 24) return;
    touchActive = false;
    if (Math.abs(dx) > Math.abs(dy)) {
      handleDirection({ x: dx > 0 ? 1 : -1, y: 0 });
    } else {
      handleDirection({ x: 0, y: dy > 0 ? 1 : -1 });
    }
  }, { passive: true });
}

async function fetchLeaderboard() {
  if (!supabaseClient) {
    console.warn('Supabase not ready. Check URL/key.');
    return;
  }
  const { data, error } = await supabaseClient
    .from('scores')
    .select('name, score')
    .order('score', { ascending: false })
    .limit(3);
  if (error) {
    console.error('Supabase fetch error:', error);
    return;
  }
  topScores = data || [];
  renderLeaderboard();
}

function renderLeaderboard() {
  if (!leaderboardList) return;
  const rows = topScores.length
    ? topScores.map((row) => `<li>${escapeHtml(row.name)}<span>${row.score}</span></li>`)
    : ['<li>—</li>', '<li>—</li>', '<li>—</li>'];
  leaderboardList.innerHTML = rows.join('');
}

function qualifiesForLeaderboard() {
  if (topScores.length < 3) return true;
  return score > topScores[topScores.length - 1].score;
}

async function maybeSubmitLeaderboardScore() {
  if (!supabaseClient) return;
  await fetchLeaderboard();
  if (!qualifiesForLeaderboard()) return;
  const name = await promptName();
  const cleanName = name.trim().slice(0, 12) || 'Player';
  const { error } = await supabaseClient.from('scores').insert({ name: cleanName, score });
  if (error) {
    console.error('Supabase insert error:', error);
    return;
  }
  await fetchLeaderboard();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

fetchLeaderboard();

function resizeBoard() {
  const maxSize = Math.min(window.innerWidth * 0.92, 420);
  const size = Math.floor(maxSize / gridSize) * gridSize;
  canvas.width = size;
  canvas.height = size;
  cellSize = canvas.width / gridSize;
  render();
}

window.addEventListener('resize', resizeBoard);
resizeBoard();

function promptName() {
  return new Promise((resolve) => {
    if (!nameModal || !nameInput || !nameSubmit || !nameCancel) {
      resolve('Player');
      return;
    }

    nameModal.classList.add('show');
    nameModal.setAttribute('aria-hidden', 'false');
    nameInput.value = '';
    nameInput.focus();

    const cleanup = () => {
      nameModal.classList.remove('show');
      nameModal.setAttribute('aria-hidden', 'true');
      nameSubmit.removeEventListener('click', onSubmit);
      nameCancel.removeEventListener('click', onCancel);
      nameInput.removeEventListener('keydown', onKey);
    };

    const onSubmit = () => {
      cleanup();
      resolve(nameInput.value || 'Player');
    };
    const onCancel = () => {
      cleanup();
      resolve('Player');
    };
    const onKey = (e) => {
      if (e.key === 'Enter') onSubmit();
      if (e.key === 'Escape') onCancel();
    };

    nameSubmit.addEventListener('click', onSubmit);
    nameCancel.addEventListener('click', onCancel);
    nameInput.addEventListener('keydown', onKey);
  });
}
