const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const playerScoreEl = document.getElementById("playerScore");
const aiScoreEl = document.getElementById("aiScore");
const rallyCountEl = document.getElementById("rallyCount");
const bestRallyEl = document.getElementById("bestRally");
const speedReadoutEl = document.getElementById("speedReadout");
const bannerEl = document.getElementById("roundBanner");
const startButton = document.getElementById("startButton");
const resetButton = document.getElementById("resetButton");
const soundToggle = document.getElementById("soundToggle");
const difficultySelect = document.getElementById("difficultySelect");

const W = canvas.width;
const H = canvas.height;
const targetScore = 7;
const goalWidth = 330;
const rail = 38;
const centerY = H / 2;
const paddleRadius = 62;
const puckRadius = 28;

const difficulties = {
  easy: { speed: 0.072, error: 64, strike: 0.8 },
  normal: { speed: 0.095, error: 34, strike: 1.0 },
  hard: { speed: 0.124, error: 14, strike: 1.18 },
};

let running = false;
let pausedBannerTimer = 0;
let last = performance.now();
let audio;
let scores = { player: 0, ai: 0 };
let rally = 0;
let bestRally = 0;
let screenShake = 0;
let matchOver = false;

const pointer = {
  active: false,
  x: W / 2,
  y: H * 0.76,
};

const player = {
  x: W / 2,
  y: H * 0.78,
  px: W / 2,
  py: H * 0.78,
  vx: 0,
  vy: 0,
  color: "#38e8ff",
};

const ai = {
  x: W / 2,
  y: H * 0.22,
  px: W / 2,
  py: H * 0.22,
  vx: 0,
  vy: 0,
  color: "#ff476a",
  wobble: 0,
};

const puck = {
  x: W / 2,
  y: centerY,
  vx: 0,
  vy: 0,
};

function ensureAudio() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audio.state === "suspended") {
    audio.resume();
  }
}

function tone(freq, duration, type = "sine", gain = 0.05) {
  if (!soundToggle.checked || !audio) return;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, audio.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + duration);
}

function showBanner(text, ms = 1100) {
  bannerEl.textContent = text;
  bannerEl.classList.add("show");
  pausedBannerTimer = ms;
}

function updateScoreUI() {
  playerScoreEl.textContent = scores.player;
  aiScoreEl.textContent = scores.ai;
  rallyCountEl.textContent = rally;
  bestRallyEl.textContent = bestRally;
  speedReadoutEl.textContent = Math.round(Math.hypot(puck.vx, puck.vy));
}

function resetPuck(direction = Math.random() > 0.5 ? 1 : -1) {
  puck.x = W / 2;
  puck.y = centerY;
  const angle = -Math.PI / 2 + direction * (Math.random() * 0.44 - 0.22);
  const speed = 8.6;
  puck.vx = Math.sin(angle) * speed;
  puck.vy = Math.cos(angle) * speed * direction;
  rally = 0;
}

function resetMatch() {
  matchOver = false;
  scores = { player: 0, ai: 0 };
  rally = 0;
  bestRally = 0;
  player.x = W / 2;
  player.y = H * 0.78;
  ai.x = W / 2;
  ai.y = H * 0.22;
  pointer.x = player.x;
  pointer.y = player.y;
  resetPuck(Math.random() > 0.5 ? 1 : -1);
  updateScoreUI();
  showBanner("拖曳藍色球拍開始", 1600);
}

function startGame() {
  ensureAudio();
  if (matchOver) {
    resetMatch();
  }
  running = true;
  startButton.textContent = "繼續";
  showBanner("開球", 700);
  if (Math.abs(puck.vx) < 1 && Math.abs(puck.vy) < 1) resetPuck(1);
}

function clampToTable(body, half) {
  body.x = Math.max(rail + paddleRadius, Math.min(W - rail - paddleRadius, body.x));
  const yMin = half === "top" ? rail + paddleRadius : centerY + paddleRadius;
  const yMax = half === "top" ? centerY - paddleRadius : H - rail - paddleRadius;
  body.y = Math.max(yMin, Math.min(yMax, body.y));
}

function movePlayer(dt) {
  player.px = player.x;
  player.py = player.y;
  if (pointer.active) {
    player.x += (pointer.x - player.x) * Math.min(1, 0.28 * dt);
    player.y += (pointer.y - player.y) * Math.min(1, 0.28 * dt);
  }
  clampToTable(player, "bottom");
  player.vx = player.x - player.px;
  player.vy = player.y - player.py;
}

function moveAI(dt) {
  ai.px = ai.x;
  ai.py = ai.y;
  const diff = difficulties[difficultySelect.value];
  ai.wobble += 0.024 * dt;
  const defendY = H * 0.22;
  const attackY = Math.min(centerY - paddleRadius - 10, puck.y - 86);
  const targetY = puck.y < centerY + 80 && puck.vy < 13 ? attackY : defendY;
  const targetX = puck.x + Math.sin(ai.wobble) * diff.error;
  const reactivity = diff.speed * dt;
  ai.x += (targetX - ai.x) * reactivity;
  ai.y += (targetY - ai.y) * reactivity;
  clampToTable(ai, "top");
  ai.vx = ai.x - ai.px;
  ai.vy = ai.y - ai.py;
}

function collidePaddle(paddle, isAI) {
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const dist = Math.hypot(dx, dy);
  const minDist = paddleRadius + puckRadius;
  if (dist >= minDist || dist === 0) return;

  const nx = dx / dist;
  const ny = dy / dist;
  puck.x = paddle.x + nx * minDist;
  puck.y = paddle.y + ny * minDist;

  const incoming = puck.vx * nx + puck.vy * ny;
  if (incoming < 0) {
    puck.vx -= 2 * incoming * nx;
    puck.vy -= 2 * incoming * ny;
  }

  const boost = isAI ? difficulties[difficultySelect.value].strike : 1.16;
  puck.vx += paddle.vx * 0.42 * boost;
  puck.vy += paddle.vy * 0.42 * boost;
  const speed = Math.min(22, Math.max(9, Math.hypot(puck.vx, puck.vy) * 1.035));
  const angle = Math.atan2(puck.vy, puck.vx);
  puck.vx = Math.cos(angle) * speed;
  puck.vy = Math.sin(angle) * speed;
  rally += 1;
  bestRally = Math.max(bestRally, rally);
  screenShake = Math.min(16, speed * 0.42);
  tone(isAI ? 260 : 520, 0.06, "square", 0.045);
}

function updatePuck(dt) {
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;
  puck.vx *= 0.9985;
  puck.vy *= 0.9985;

  const inGoalMouth = Math.abs(puck.x - W / 2) < goalWidth / 2;
  if (puck.x < rail + puckRadius) {
    puck.x = rail + puckRadius;
    puck.vx = Math.abs(puck.vx);
    tone(190, 0.04, "triangle", 0.035);
  }
  if (puck.x > W - rail - puckRadius) {
    puck.x = W - rail - puckRadius;
    puck.vx = -Math.abs(puck.vx);
    tone(190, 0.04, "triangle", 0.035);
  }

  if (puck.y < rail + puckRadius && !inGoalMouth) {
    puck.y = rail + puckRadius;
    puck.vy = Math.abs(puck.vy);
    tone(180, 0.04, "triangle", 0.035);
  }
  if (puck.y > H - rail - puckRadius && !inGoalMouth) {
    puck.y = H - rail - puckRadius;
    puck.vy = -Math.abs(puck.vy);
    tone(180, 0.04, "triangle", 0.035);
  }

  if (puck.y < -puckRadius) {
    score("player");
  } else if (puck.y > H + puckRadius) {
    score("ai");
  }

  collidePaddle(player, false);
  collidePaddle(ai, true);
}

function score(side) {
  scores[side] += 1;
  tone(side === "player" ? 740 : 150, 0.22, "sawtooth", 0.06);
  screenShake = 22;
  const winner = scores[side] >= targetScore;
  if (winner) {
    running = false;
    matchOver = true;
    showBanner(side === "player" ? "你贏了！按開始再戰" : "AI 獲勝，按開始再戰", 2200);
  } else {
    showBanner(side === "player" ? "玩家得分" : "AI 得分", 1100);
  }
  resetPuck(side === "player" ? 1 : -1);
  updateScoreUI();
}

function drawTable() {
  const shakeX = (Math.random() - 0.5) * screenShake;
  const shakeY = (Math.random() - 0.5) * screenShake;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  screenShake *= 0.86;

  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#171018");
  gradient.addColorStop(0.48, "#111924");
  gradient.addColorStop(1, "#0b1e26");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let y = rail + 20; y < H - rail; y += 54) {
    for (let x = rail + 22; x < W - rail; x += 54) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 4;
  ctx.strokeRect(rail, rail, W - rail * 2, H - rail * 2);

  ctx.strokeStyle = "rgba(56,232,255,0.68)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(rail, centerY);
  ctx.lineTo(W - rail, centerY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, centerY, 145, 0, Math.PI * 2);
  ctx.stroke();

  drawGoal(W / 2, rail, "#ff476a", true);
  drawGoal(W / 2, H - rail, "#38e8ff", false);
  drawPuck();
  drawPaddle(ai, "AI");
  drawPaddle(player, "玩家");
  ctx.restore();
}

function drawGoal(x, y, color, top) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(x - goalWidth / 2, y);
  ctx.lineTo(x + goalWidth / 2, y);
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.36)";
  ctx.fillRect(x - goalWidth / 2, top ? 0 : H - rail, goalWidth, rail);
  ctx.restore();
}

function drawPaddle(paddle, label) {
  ctx.save();
  const glow = ctx.createRadialGradient(paddle.x, paddle.y, 12, paddle.x, paddle.y, paddleRadius);
  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(0.2, paddle.color);
  glow.addColorStop(1, "rgba(255,255,255,0.08)");
  ctx.shadowColor = paddle.color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(paddle.x, paddle.y, paddleRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.arc(paddle.x, paddle.y, paddleRadius * 0.44, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, paddle.x, paddle.y);
  ctx.restore();
}

function drawPuck() {
  ctx.save();
  ctx.shadowColor = "#ffbf4d";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ffbf4d";
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, puckRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.88)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, puckRadius * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function tick(now) {
  const elapsed = now - last;
  const dt = Math.min(2.4, elapsed / 16.67);
  last = now;
  if (pausedBannerTimer > 0) {
    pausedBannerTimer -= elapsed;
    if (pausedBannerTimer <= 0) bannerEl.classList.remove("show");
  }

  if (running) {
    movePlayer(dt);
    moveAI(dt);
    updatePuck(dt);
    updateScoreUI();
  } else {
    movePlayer(dt);
    moveAI(dt * 0.45);
  }
  drawTable();
  requestAnimationFrame(tick);
}

function canvasPointer(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * W,
    y: ((evt.clientY - rect.top) / rect.height) * H,
  };
}

canvas.addEventListener("pointerdown", (evt) => {
  canvas.setPointerCapture(evt.pointerId);
  pointer.active = true;
  const pos = canvasPointer(evt);
  pointer.x = pos.x;
  pointer.y = Math.max(centerY + paddleRadius, pos.y);
  startGame();
});

canvas.addEventListener("pointermove", (evt) => {
  if (!pointer.active) return;
  const pos = canvasPointer(evt);
  pointer.x = pos.x;
  pointer.y = Math.max(centerY + paddleRadius, pos.y);
});

canvas.addEventListener("pointerup", () => {
  pointer.active = false;
});

canvas.addEventListener("pointercancel", () => {
  pointer.active = false;
});

startButton.addEventListener("click", startGame);
resetButton.addEventListener("click", () => {
  ensureAudio();
  running = false;
  resetMatch();
});

difficultySelect.addEventListener("change", () => {
  showBanner(`難度：${difficultySelect.selectedOptions[0].textContent}`, 800);
});

resetMatch();
requestAnimationFrame(tick);
