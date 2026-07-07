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
  easy: { speed: 0.072, error: 88, strike: 0.82, predict: 8 },
  normal: { speed: 0.095, error: 42, strike: 1.0, predict: 16 },
  hard: { speed: 0.128, error: 16, strike: 1.2, predict: 28 },
};

let running = false;
let pausedBannerTimer = 0;
let last = performance.now();
let audio;
let scores = { player: 0, ai: 0 };
let rally = 0;
let bestRally = Number(localStorage.getItem("airHockeyBestRally") || 0);
let screenShake = 0;
let matchOver = false;
let flashAlpha = 0;
let goalText = "";
let goalTextTimer = 0;
let fps = 0;
let fpsTimer = 0;
let fpsFrames = 0;

const trail = [];
const particles = [];

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
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === "suspended") audio.resume();
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

function playGoalSound(isPlayer) {
  tone(isPlayer ? 660 : 180, 0.12, "sawtooth", 0.06);
  setTimeout(() => tone(isPlayer ? 880 : 140, 0.16, "square", 0.045), 90);
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

  const angle = -Math.PI / 2 + direction * (Math.random() * 0.5 - 0.25);
  const speed = 8.8;

  puck.vx = Math.sin(angle) * speed;
  puck.vy = Math.cos(angle) * speed * direction;

  rally = 0;
  trail.length = 0;
}

function resetMatch() {
  matchOver = false;
  running = false;
  scores = { player: 0, ai: 0 };
  rally = 0;
  particles.length = 0;
  trail.length = 0;

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

  if (matchOver) resetMatch();

  running = true;
  startButton.textContent = "進行中";
  showBanner("開始！", 700);

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

function predictPuckX(frames) {
  let x = puck.x;
  let vx = puck.vx;

  for (let i = 0; i < frames; i++) {
    x += vx;

    if (x < rail + puckRadius) {
      x = rail + puckRadius;
      vx = Math.abs(vx);
    }

    if (x > W - rail - puckRadius) {
      x = W - rail - puckRadius;
      vx = -Math.abs(vx);
    }
  }

  return x;
}

function moveAI(dt) {
  ai.px = ai.x;
  ai.py = ai.y;

  const diff = difficulties[difficultySelect.value];
  ai.wobble += 0.024 * dt;

  const attacking = puck.y < centerY + 100 && puck.vy < 16;
  const defendY = H * 0.22;
  const attackY = Math.min(centerY - paddleRadius - 12, puck.y - 92);

  const predictedX = predictPuckX(diff.predict);
  const error = Math.sin(ai.wobble * 1.7) * diff.error;

  const targetX = attacking ? predictedX + error : W / 2 + error * 0.6;
  const targetY = attacking ? attackY : defendY;

  const reactivity = diff.speed * dt;

  ai.x += (targetX - ai.x) * reactivity;
  ai.y += (targetY - ai.y) * reactivity;

  clampToTable(ai, "top");

  ai.vx = ai.x - ai.px;
  ai.vy = ai.y - ai.py;
}

function spawnParticles(x, y, color, amount = 18, power = 7) {
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * power + 1.5;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 34 + Math.random() * 20,
      maxLife: 54,
      size: 3 + Math.random() * 5,
      color,
    });
  }
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

  const speed = Math.min(22.5, Math.max(9, Math.hypot(puck.vx, puck.vy) * 1.04));
  const angle = Math.atan2(puck.vy, puck.vx);

  puck.vx = Math.cos(angle) * speed;
  puck.vy = Math.sin(angle) * speed;

  rally++;
  bestRally = Math.max(bestRally, rally);
  localStorage.setItem("airHockeyBestRally", String(bestRally));

  screenShake = Math.min(18, speed * 0.45);
  spawnParticles(puck.x, puck.y, paddle.color, 22, 8);
  tone(isAI ? 260 : 520, 0.06, "square", 0.045);
}

function updatePuck(dt) {
  trail.push({
    x: puck.x,
    y: puck.y,
    life: 24,
    speed: Math.hypot(puck.vx, puck.vy),
  });

  if (trail.length > 34) trail.shift();

  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;

  puck.vx *= 0.9985;
  puck.vy *= 0.9985;

  const inGoalMouth = Math.abs(puck.x - W / 2) < goalWidth / 2;

  if (puck.x < rail + puckRadius) {
    puck.x = rail + puckRadius;
    puck.vx = Math.abs(puck.vx);
    spawnParticles(puck.x, puck.y, "#ffffff", 8, 4);
    tone(190, 0.04, "triangle", 0.035);
  }

  if (puck.x > W - rail - puckRadius) {
    puck.x = W - rail - puckRadius;
    puck.vx = -Math.abs(puck.vx);
    spawnParticles(puck.x, puck.y, "#ffffff", 8, 4);
    tone(190, 0.04, "triangle", 0.035);
  }

  if (puck.y < rail + puckRadius && !inGoalMouth) {
    puck.y = rail + puckRadius;
    puck.vy = Math.abs(puck.vy);
    spawnParticles(puck.x, puck.y, "#ff476a", 10, 5);
    tone(180, 0.04, "triangle", 0.035);
  }

  if (puck.y > H - rail - puckRadius && !inGoalMouth) {
    puck.y = H - rail - puckRadius;
    puck.vy = -Math.abs(puck.vy);
    spawnParticles(puck.x, puck.y, "#38e8ff", 10, 5);
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

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;

    if (p.life <= 0) particles.splice(i, 1);
  }

  for (const t of trail) t.life -= dt;
  while (trail.length && trail[0].life <= 0) trail.shift();

  if (goalTextTimer > 0) goalTextTimer -= dt;
  flashAlpha *= 0.9;
}

function score(side) {
  scores[side]++;

  const isPlayer = side === "player";
  playGoalSound(isPlayer);

  screenShake = 26;
  flashAlpha = 0.5;
  goalText = isPlayer ? "玩家得分！" : "AI 得分！";
  goalTextTimer = 90;

  spawnParticles(W / 2, isPlayer ? rail : H - rail, isPlayer ? "#38e8ff" : "#ff476a", 70, 12);

  const winner = scores[side] >= targetScore;

  if (winner) {
    running = false;
    matchOver = true;
    startButton.textContent = "再玩一次";
    showBanner(isPlayer ? "玩家獲勝！🏆" : "AI 獲勝！", 2400);
  } else {
    showBanner(isPlayer ? "玩家得分！" : "AI 得分！", 1100);
  }

  resetPuck(isPlayer ? 1 : -1);
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

  drawGrid();
  drawTableLines();
  drawGoal(W / 2, rail, "#ff476a", true);
  drawGoal(W / 2, H - rail, "#38e8ff", false);
  drawTrail();
  drawParticles();
  drawPuck();
  drawPaddle(ai, "AI");
  drawPaddle(player, "玩家");
  drawGoalText();
  drawFPS();

  if (flashAlpha > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function drawGrid() {
  ctx.save();

  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let y = rail + 20; y < H - rail; y += 54) {
    for (let x = rail + 22; x < W - rail; x += 54) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const scanY = ((performance.now() / 18) % H);
  const scan = ctx.createLinearGradient(0, scanY - 80, 0, scanY + 80);
  scan.addColorStop(0, "rgba(56,232,255,0)");
  scan.addColorStop(0.5, "rgba(56,232,255,0.13)");
  scan.addColorStop(1, "rgba(56,232,255,0)");

  ctx.fillStyle = scan;
  ctx.fillRect(rail, scanY - 80, W - rail * 2, 160);

  ctx.restore();
}

function drawTableLines() {
  ctx.save();

  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 4;
  ctx.strokeRect(rail, rail, W - rail * 2, H - rail * 2);

  ctx.shadowColor = "#38e8ff";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = "rgba(56,232,255,0.72)";
  ctx.lineWidth = 5;

  ctx.beginPath();
  ctx.moveTo(rail, centerY);
  ctx.lineTo(W - rail, centerY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, centerY, 145, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawGoal(x, y, color, top) {
  ctx.save();

  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.lineWidth = 11;

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

  const glow = ctx.createRadialGradient(
    paddle.x,
    paddle.y,
    12,
    paddle.x,
    paddle.y,
    paddleRadius
  );

  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(0.2, paddle.color);
  glow.addColorStop(1, "rgba(255,255,255,0.08)");

  ctx.shadowColor = paddle.color;
  ctx.shadowBlur = 24;
  ctx.fillStyle = glow;

  ctx.beginPath();
  ctx.arc(paddle.x, paddle.y, paddleRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.arc(paddle.x, paddle.y, paddleRadius * 0.44, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, paddle.x, paddle.y);

  ctx.restore();
}

function drawTrail() {
  ctx.save();

  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    const alpha = Math.max(0, t.life / 24);
    const size = puckRadius * (0.35 + alpha * 0.75);

    ctx.globalAlpha = alpha * 0.45;
    ctx.shadowColor = "#ffbf4d";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#ffbf4d";

    ctx.beginPath();
    ctx.arc(t.x, t.y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawPuck() {
  ctx.save();

  ctx.shadowColor = "#ffbf4d";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#ffbf4d";

  ctx.beginPath();
  ctx.arc(puck.x, puck.y, puckRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 4;

  ctx.beginPath();
  ctx.arc(puck.x, puck.y, puckRadius * 0.62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  ctx.save();

  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);

    ctx.globalAlpha = alpha;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = p.color;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawGoalText() {
  if (goalTextTimer <= 0) return;

  ctx.save();

  const alpha = Math.min(1, goalTextTimer / 25);
  const scale = 1 + Math.sin(goalTextTimer * 0.12) * 0.05;

  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);

  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 92px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#38e8ff";
  ctx.shadowBlur = 28;
  ctx.fillText("GOAL!", 0, -34);

  ctx.font = "800 42px system-ui, sans-serif";
  ctx.fillStyle = "#ffbf4d";
  ctx.shadowColor = "#ffbf4d";
  ctx.fillText(goalText, 0, 42);

  ctx.restore();
}

function drawFPS() {
  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(W - 132, H - 58, 104, 34);

  ctx.fillStyle = "#56f39c";
  ctx.font = "bold 22px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`FPS ${fps}`, W - 80, H - 41);

  ctx.restore();
}

function tick(now) {
  const elapsed = now - last;
  const dt = Math.min(2.4, elapsed / 16.67);
  last = now;

  fpsFrames++;
  fpsTimer += elapsed;

  if (fpsTimer >= 500) {
    fps = Math.round((fpsFrames * 1000) / fpsTimer);
    fpsFrames = 0;
    fpsTimer = 0;
  }

  if (pausedBannerTimer > 0) {
    pausedBannerTimer -= elapsed;
    if (pausedBannerTimer <= 0) bannerEl.classList.remove("show");
  }

  if (running) {
    movePlayer(dt);
    moveAI(dt);
    updatePuck(dt);
    updateParticles(dt);
    updateScoreUI();
  } else {
    movePlayer(dt);
    moveAI(dt * 0.45);
    updateParticles(dt);
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
  resetMatch();
  startButton.textContent = "開始";
});

difficultySelect.addEventListener("change", () => {
  showBanner(`難度：${difficultySelect.selectedOptions[0].textContent}`, 900);
});

resetMatch();
requestAnimationFrame(tick);
