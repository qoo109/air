(() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const aiScoreEl = document.getElementById("ai-score");
  const playerScoreEl = document.getElementById("player-score");
  const speedLabel = document.getElementById("speed-label");
  const comboLabel = document.getElementById("combo-label");
  const pauseBtn = document.getElementById("pause-btn");

  const menuOverlay = document.getElementById("menu");
  const pauseOverlay = document.getElementById("pause");
  const gameOverOverlay = document.getElementById("game-over");
  const countdownOverlay = document.getElementById("countdown");
  const countdownText = document.getElementById("countdown-text");

  const startButton = document.getElementById("start-button");
  const resumeButton = document.getElementById("resume-button");
  const restartButton = document.getElementById("restart-button");
  const homeButton = document.getElementById("home-button");
  const backMenuButton = document.getElementById("back-menu-button");
  const difficultySelect = document.getElementById("difficulty-select");
  const themeSelect = document.getElementById("theme-select");
  const soundToggle = document.getElementById("sound-toggle");
  const vibrationToggle = document.getElementById("vibration-toggle");
  const winnerText = document.getElementById("winner-text");
  const finalScore = document.getElementById("final-score");
  const bestWinEl = document.getElementById("best-win");

  const THEMES = {
    steampunk: {
      name: "Steampunk",
      bgA: "#120b05",
      bgB: "#2a180b",
      player: "#f5d27a",
      ai: "#c05a2b",
      accent: "#b8792d",
      gold: "#ffe1a0",
      ball: "#f6e0b5",
      smoke: "rgba(180,150,110,0.18)"
    },
    copper: {
      name: "Copper",
      bgA: "#160805",
      bgB: "#33130a",
      player: "#ffb15e",
      ai: "#b44724",
      accent: "#d06c2c",
      gold: "#ffd48a",
      ball: "#ffe3bc",
      smoke: "rgba(210,135,82,0.16)"
    },
    royal: {
      name: "Royal Brass",
      bgA: "#0d0a06",
      bgB: "#2d220f",
      player: "#ffe08a",
      ai: "#7f4b1d",
      accent: "#c69b3c",
      gold: "#fff0b8",
      ball: "#fff3cf",
      smoke: "rgba(220,190,130,0.17)"
    },
    coal: {
      name: "Coal Engine",
      bgA: "#060504",
      bgB: "#1d1710",
      player: "#d49a45",
      ai: "#8a3a23",
      accent: "#a86f32",
      gold: "#f0c36a",
      ball: "#d8c4a1",
      smoke: "rgba(120,110,96,0.20)"
    }
  };

  let theme = THEMES.steampunk;

  const state = {
    mode: "menu",
    playerScore: 0,
    aiScore: 0,
    winScore: 7,
    sound: localStorage.getItem("nah_sound") !== "off",
    vibration: localStorage.getItem("nah_vibration") !== "off",
    bestWin: Number(localStorage.getItem("nah_best_win") || 0),
    lastTime: 0,
    hitStop: 0,
    slowMo: 0,
    flash: 0,
    shake: 0,
    zoom: 1,
    combo: 0,
    comboTimer: 0,
    activePointerId: null,
    startTime: performance.now()
  };

  const HAPTIC_PATTERNS = {
    tap: 12,
    wall: 10,
    hit: 22,
    heavyHit: [18, 18, 38],
    perfect: [20, 18, 28, 18, 48],
    goal: [40, 35, 90, 40, 120],
    countdown: 24,
    start: [28, 22, 42],
    win: [55, 45, 75, 45, 130],
    lose: [90, 60, 90]
  };

  function haptic(type = "tap") {
    if (!state.vibration || !navigator.vibrate) return;
    const pattern = HAPTIC_PATTERNS[type] ?? HAPTIC_PATTERNS.tap;
    navigator.vibrate(pattern);
  }

  const difficulty = {
    easy: { speed: 250, reaction: 0.16, predict: 0.15 },
    normal: { speed: 360, reaction: 0.24, predict: 0.35 },
    hard: { speed: 480, reaction: 0.34, predict: 0.58 },
    boss: { speed: 630, reaction: 0.45, predict: 0.88 }
  };

  let aiConfig = difficulty.normal;

  const pointer = { x: 0, y: 0, down: false, offsetY: -46 };

  const ball = {
    x: 0, y: 0, vx: 0, vy: 0, r: 12,
    spin: 0,
    trail: []
  };

  const player = { x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0, r: 26 };
  const ai = { x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0, r: 26 };

  const particles = [];
  const waves = [];
  const texts = [];
  const sparks = [];

  function setToggleVisuals() {
    soundToggle.textContent = state.sound ? "音效 ON" : "音效 OFF";
    soundToggle.classList.toggle("active", state.sound);
    vibrationToggle.textContent = state.vibration ? "震動 ON" : "震動 OFF";
    vibrationToggle.classList.toggle("active", state.vibration);
    bestWinEl.textContent = state.bestWin;
  }

  function vibrate(pattern) {
    if (state.vibration && navigator.vibrate) navigator.vibrate(pattern);
  }

  let audioCtx = null;
  function beep(type = "hit") {
    if (!state.sound) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;

    const settings = {
      hit: [260, 0.04, "square", 0.055],
      wall: [150, 0.025, "triangle", 0.035],
      goal: [520, 0.26, "sawtooth", 0.09],
      start: [740, 0.08, "sine", 0.05],
      win: [900, 0.28, "triangle", 0.08],
      perfect: [1120, 0.18, "sine", 0.065]
    }[type] || [260, 0.04, "square", 0.05];

    osc.frequency.setValueAtTime(settings[0], now);
    osc.frequency.exponentialRampToValueAtTime(settings[0] * 0.72, now + settings[1]);
    osc.type = settings[2];
    gain.gain.setValueAtTime(settings[3], now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + settings[1]);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + settings[1]);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const min = Math.min(w, h);
    ball.r = Math.max(9, min * 0.025);
    player.r = Math.max(23, min * 0.055);
    ai.r = player.r;

    player.x = w / 2;
    player.y = h - player.r - 70;
    ai.x = w / 2;
    ai.y = ai.r + 74;
    pointer.x = player.x;
    pointer.y = player.y - pointer.offsetY;

    if (state.mode !== "playing") resetBall(1);
  }

  function resetBall(dir = 1) {
    const w = innerWidth;
    const h = innerHeight;
    const speed = Math.max(340, Math.min(w, h) * 0.94);
    const angle = (Math.random() * 0.65 + 0.4) * (Math.random() < 0.5 ? 1 : -1);
    ball.x = w / 2;
    ball.y = h / 2;
    ball.vx = Math.sin(angle) * speed * 0.38;
    ball.vy = Math.abs(Math.cos(angle) * speed) * dir;
    ball.spin = 0;
    ball.trail = [];
  }

  function resetGame() {
    state.playerScore = 0;
    state.aiScore = 0;
    state.combo = 0;
    state.comboTimer = 0;
    updateHud();
    resize();
    resetBall(Math.random() < 0.5 ? 1 : -1);
    particles.length = 0;
    waves.length = 0;
    texts.length = 0;
    sparks.length = 0;
  }

  function updateHud() {
    aiScoreEl.textContent = `AI ${state.aiScore}`;
    playerScoreEl.textContent = `YOU ${state.playerScore}`;
    comboLabel.textContent = `COMBO x${state.combo}`;
    const speed = Math.round(Math.hypot(ball.vx, ball.vy) / 7);
    speedLabel.textContent = `${speed} km/h`;
  }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function addText(text, x, y, color = theme.gold, size = 28) {
    texts.push({ text, x, y, vy: -70, life: 0.72, max: 0.72, color, size });
  }

  function addWave(x, y, color, maxR = 180, life = 0.45) {
    waves.push({ x, y, r: 4, maxR, life, max: life, color });
  }

  function spawnParticles(x, y, color, count = 14, power = 260, kind = "spark") {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * power + power * 0.25;
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: Math.random() * 0.4 + 0.25,
        max: 0.65,
        color,
        kind,
        size: Math.random() * 3 + 2
      });
    }
  }

  function spawnLightning(x, y, color) {
    for (let i = 0; i < 5; i++) {
      sparks.push({
        x, y,
        points: Array.from({ length: 5 }, (_, k) => ({
          x: x + (Math.random() - 0.5) * 80 * (k + 1) / 5,
          y: y + (Math.random() - 0.5) * 80 * (k + 1) / 5
        })),
        life: 0.12,
        max: 0.12,
        color
      });
    }
  }

  function movePaddle(p, targetX, targetY, strength, dt) {
    p.px = p.x;
    p.py = p.y;
    const k = 1 - Math.pow(1 - strength, dt * 60);
    p.x += (targetX - p.x) * k;
    p.y += (targetY - p.y) * k;
    p.vx = (p.x - p.px) / Math.max(dt, 0.001);
    p.vy = (p.y - p.py) / Math.max(dt, 0.001);
  }

  function predictBallX() {
    const w = innerWidth;
    if (ball.vy >= 0) return innerWidth / 2;
    let t = (ball.y - ai.y) / Math.abs(ball.vy);
    let x = ball.x + ball.vx * t * aiConfig.predict;
    const min = ball.r;
    const max = w - ball.r;
    while (x < min || x > max) {
      if (x < min) x = min + (min - x);
      if (x > max) x = max - (x - max);
    }
    return x;
  }

  function collidePaddle(p, color, isPlayer) {
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    let dist = Math.hypot(dx, dy);
    const min = ball.r + p.r;
    if (dist <= 0) dist = 0.0001;

    if (dist < min) {
      const nx = dx / dist;
      const ny = dy / dist;

      ball.x = p.x + nx * min;
      ball.y = p.y + ny * min;

      const paddleSpeed = Math.hypot(p.vx, p.vy);
      let speed = Math.hypot(ball.vx, ball.vy);
      speed = Math.min(speed + 62 + paddleSpeed * 0.05, 1500);

      ball.vx = nx * speed + p.vx * 0.34;
      ball.vy = ny * speed + p.vy * 0.34;
      ball.spin += clamp((p.vx * ny - p.vy * nx) / 900, -1.8, 1.8);

      state.combo = isPlayer ? state.combo + 1 : 0;
      state.comboTimer = 1.5;
      updateHud();

      const perfect = isPlayer && paddleSpeed > 520 && Math.abs(ny) > 0.45;
      if (perfect) {
        state.slowMo = 0.18;
        state.hitStop = 0.045;
        state.shake = 14;
        state.flash = 0.08;
        addText("PERFECT!", ball.x, ball.y - 44, theme.gold, 34);
        spawnParticles(ball.x, ball.y, theme.gold, 28, 520, "star");
        spawnLightning(ball.x, ball.y, theme.accent);
        beep("perfect");
        haptic("perfect");
      } else {
        state.hitStop = 0.032;
        state.shake = 8;
        beep("hit");
        haptic("hit");
      }

      addWave(ball.x, ball.y, color, perfect ? 220 : 135, perfect ? 0.55 : 0.34);
      spawnParticles(ball.x, ball.y, color, perfect ? 22 : 14, perfect ? 420 : 280);
      spawnSteam(ball.x, ball.y, perfect ? 18 : 8, perfect ? 120 : 70);
    }
  }

  function score(side) {
    if (side === "player") {
      state.playerScore++;
      spawnGoalBurst(innerWidth / 2, 26, theme.player);
    } else {
      state.aiScore++;
      spawnGoalBurst(innerWidth / 2, innerHeight - 26, theme.ai);
    }

    state.combo = 0;
    state.comboTimer = 0;
    state.flash = 0.24;
    state.shake = 18;
    state.slowMo = 0.25;
    updateHud();
    beep("goal");
    haptic("goal");

    if (state.playerScore >= state.winScore || state.aiScore >= state.winScore) {
      endGame();
      return;
    }

    resetBall(side === "player" ? 1 : -1);
  }

  function spawnGoalBurst(x, y, color) {
    addWave(x, y, color, Math.min(innerWidth, innerHeight) * 0.75, 0.68);
    addWave(x, y, theme.gold, Math.min(innerWidth, innerHeight) * 0.42, 0.5);
    spawnParticles(x, y, color, 70, 720, "spark");
    spawnParticles(x, y, theme.gold, 30, 520, "star");
    spawnLightning(x, y, color);
    spawnSteam(x, y, 34, 140);
    addText("GOAL!", x, y + (y < innerHeight / 2 ? 90 : -70), color, 44);
  }

  function update(dt) {
    if (state.mode !== "playing") return;

    if (state.hitStop > 0) {
      state.hitStop -= dt;
      dt *= 0.18;
    }

    if (state.slowMo > 0) {
      state.slowMo -= dt;
      dt *= 0.36;
    }

    const w = innerWidth;
    const h = innerHeight;

    const targetX = clamp(pointer.x, player.r, w - player.r);
    const targetY = clamp(pointer.y + pointer.offsetY, h / 2 + player.r, h - player.r - 10);
    movePaddle(player, targetX, targetY, 0.28, dt);

    const aiX = predictBallX();
    const aiHomeY = ai.r + 74;
    const aiTargetY = ball.y < h / 2
      ? clamp(ball.y - ai.r * 1.2, ai.r + 18, h / 2 - ai.r - 12)
      : aiHomeY;

    const maxStep = aiConfig.speed * dt;
    const nextAiX = ai.x + clamp(aiX - ai.x, -maxStep, maxStep);
    const nextAiY = ai.y + clamp(aiTargetY - ai.y, -maxStep * aiConfig.reaction, maxStep * aiConfig.reaction);
    movePaddle(ai, clamp(nextAiX, ai.r, w - ai.r), clamp(nextAiY, ai.r, h / 2 - ai.r), 0.55, dt);

    const spd = Math.hypot(ball.vx, ball.vy);
    ball.trail.push({ x: ball.x, y: ball.y, r: ball.r, life: clamp(spd / 1400, 0.25, 0.95) });
    if (ball.trail.length > 24) ball.trail.shift();

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.vx += ball.spin * 14 * dt;
    ball.spin *= Math.pow(0.985, dt * 60);

    ball.vx *= Math.pow(0.997, dt * 60);
    ball.vy *= Math.pow(0.997, dt * 60);

    if (ball.x - ball.r < 0) {
      ball.x = ball.r;
      ball.vx *= -1;
      wallHit();
    } else if (ball.x + ball.r > w) {
      ball.x = w - ball.r;
      ball.vx *= -1;
      wallHit();
    }

    const goalWidth = w * 0.42;
    const left = (w - goalWidth) / 2;
    const right = left + goalWidth;

    if (ball.y - ball.r < 0) {
      if (ball.x > left && ball.x < right) score("player");
      else {
        ball.y = ball.r;
        ball.vy *= -1;
        wallHit();
      }
    }

    if (ball.y + ball.r > h) {
      if (ball.x > left && ball.x < right) score("ai");
      else {
        ball.y = h - ball.r;
        ball.vy *= -1;
        wallHit();
      }
    }

    collidePaddle(player, theme.player, true);
    collidePaddle(ai, theme.ai, false);

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        updateHud();
      }
    }

    updateEffects(dt);
    updateHud();
  }

  function wallHit() {
    beep("wall");
    haptic("wall");
    state.shake = Math.max(state.shake, 4);
    spawnParticles(ball.x, ball.y, theme.accent, 8, 180);
    spawnSteam(ball.x, ball.y, 6, 55);
  }

  function updateEffects(dt) {
    particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.91, dt * 60);
      p.vy *= Math.pow(0.91, dt * 60);
      p.life -= dt;
    });

    waves.forEach(w => {
      const k = 1 - w.life / w.max;
      w.r = w.maxR * k;
      w.life -= dt;
    });

    texts.forEach(t => {
      t.y += t.vy * dt;
      t.life -= dt;
    });

    sparks.forEach(s => s.life -= dt);

    ball.trail.forEach(t => t.life -= dt * 1.6);

    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
    for (let i = waves.length - 1; i >= 0; i--) if (waves[i].life <= 0) waves.splice(i, 1);
    for (let i = texts.length - 1; i >= 0; i--) if (texts[i].life <= 0) texts.splice(i, 1);
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
    ball.trail = ball.trail.filter(t => t.life > 0);

    state.flash = Math.max(0, state.flash - dt);
    state.shake = Math.max(0, state.shake - dt * 42);
  }

  function drawBackground() {
    const w = innerWidth;
    const h = innerHeight;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, theme.bgB);
    g.addColorStop(1, theme.bgA);
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, w + 80, h + 80);

    const rg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    rg.addColorStop(0, rgba(theme.accent, 0.13));
    rg.addColorStop(0.55, "rgba(0,0,0,0)");
    rg.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawTable() {
    const w = innerWidth;
    const h = innerHeight;
    const min = Math.min(w, h);
    const t = performance.now() / 1000;

    drawEnergyGrid(t);

    ctx.save();
    ctx.strokeStyle = rgba(theme.accent, 0.28);
    ctx.lineWidth = 4;
    ctx.shadowBlur = 18;
    ctx.shadowColor = theme.accent;

    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(t * 0.45);
    ctx.beginPath();
    ctx.arc(0, 0, min * 0.112, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, min * 0.065, 0, Math.PI * 1.45);
    ctx.stroke();
    ctx.restore();

    const goalWidth = w * 0.42;
    const left = (w - goalWidth) / 2;
    const right = left + goalWidth;
    const pulse = 0.5 + Math.sin(t * 4) * 0.5;

    ctx.lineWidth = 7 + pulse * 2;
    ctx.shadowBlur = 18 + pulse * 14;

    ctx.strokeStyle = theme.ai;
    ctx.shadowColor = theme.ai;
    ctx.beginPath();
    ctx.moveTo(left, 5);
    ctx.lineTo(right, 5);
    ctx.stroke();

    ctx.strokeStyle = theme.player;
    ctx.shadowColor = theme.player;
    ctx.beginPath();
    ctx.moveTo(left, h - 5);
    ctx.lineTo(right, h - 5);
    ctx.stroke();

    ctx.restore();
  }

  function drawEnergyGrid(t) {
    const w = innerWidth;
    const h = innerHeight;
    const min = Math.min(w, h);
    const gap = Math.max(38, min / 8);
    const offset = (t * 10) % gap;
    const ballSpeed = Math.hypot(ball.vx, ball.vy);
    const glowRadius = clamp(120 + ballSpeed * 0.07, 145, 255);

    ctx.save();
    ctx.globalAlpha = 0.26;
    ctx.strokeStyle = rgba(theme.accent, 0.18);
    ctx.lineWidth = 1;

    for (let x = -gap + offset; x < w + gap; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - w * 0.10, h);
      ctx.stroke();
    }

    for (let y = -gap + offset; y < h + gap; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + h * 0.04);
      ctx.stroke();
    }

    drawGear(w * 0.18, h * 0.22, min * 0.11, 16, theme.accent, t * 0.22, 0.18);
    drawGear(w * 0.84, h * 0.76, min * 0.14, 18, theme.gold, -t * 0.18, 0.14);
    drawGear(w * 0.12, h * 0.78, min * 0.075, 14, theme.ai, -t * 0.28, 0.12);

    const gridGlow = ctx.createRadialGradient(ball.x, ball.y, 8, ball.x, ball.y, glowRadius);
    gridGlow.addColorStop(0, rgba(theme.gold, 0.38));
    gridGlow.addColorStop(0.45, rgba(theme.accent, 0.18));
    gridGlow.addColorStop(1, "rgba(0,0,0,0)");

    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = gridGlow;
    ctx.lineWidth = 2.0;
    ctx.shadowBlur = 15;
    ctx.shadowColor = theme.gold;

    for (let x = -gap + offset; x < w + gap; x += gap) {
      if (Math.abs(x - ball.x) < glowRadius * 1.25) {
        ctx.beginPath();
        ctx.moveTo(x, ball.y - glowRadius);
        ctx.lineTo(x - w * 0.10, ball.y + glowRadius);
        ctx.stroke();
      }
    }

    for (let y = -gap + offset; y < h + gap; y += gap) {
      if (Math.abs(y - ball.y) < glowRadius * 1.25) {
        ctx.beginPath();
        ctx.moveTo(ball.x - glowRadius, y);
        ctx.lineTo(ball.x + glowRadius, y + h * 0.04);
        ctx.stroke();
      }
    }

    const floorGlow = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, glowRadius * 0.8);
    floorGlow.addColorStop(0, rgba(theme.gold, 0.12));
    floorGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = floorGlow;
    ctx.fillRect(ball.x - glowRadius, ball.y - glowRadius, glowRadius * 2, glowRadius * 2);
    ctx.restore();
  }

  function drawOrb(x, y, r, color, isBall = false) {
    const speed = Math.hypot(ball.vx, ball.vy);

    ctx.save();

    // 外層 HDR 光暈
    ctx.globalCompositeOperation = "screen";
    const glowLayers = isBall && speed > 980 ? 5 : 4;
    for (let i = glowLayers; i >= 1; i--) {
      ctx.globalAlpha = 0.055 * i;
      ctx.shadowBlur = r * i * 2.45;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r * (1 + i * 0.36), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // 主體玻璃球漸層
    const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.45, r * 0.08, x, y, r * 1.05);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.20, rgba(color, 0.98));
    g.addColorStop(0.62, rgba(color, 0.82));
    g.addColorStop(1, rgba(color, 0.52));
    ctx.shadowBlur = r * 1.65;
    ctx.shadowColor = color;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // 內陰影與折射：讓球看起來像發光水晶
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    const innerShadow = ctx.createRadialGradient(x, y, r * 0.45, x, y, r * 1.05);
    innerShadow.addColorStop(0, "rgba(0,0,0,0)");
    innerShadow.addColorStop(0.72, "rgba(0,0,0,0.10)");
    innerShadow.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = innerShadow;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    const bottomRefract = ctx.createRadialGradient(x, y + r * 0.52, 0, x, y + r * 0.52, r * 0.82);
    bottomRefract.addColorStop(0, rgba(color, 0.50));
    bottomRefract.addColorStop(0.42, rgba(color, 0.20));
    bottomRefract.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bottomRefract;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    const topGloss = ctx.createLinearGradient(x - r * 0.7, y - r, x + r * 0.55, y + r * 0.3);
    topGloss.addColorStop(0, "rgba(255,255,255,0.62)");
    topGloss.addColorStop(0.35, "rgba(255,255,255,0.13)");
    topGloss.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = topGloss;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.22, y - r * 0.40, r * 0.55, r * 0.24, -0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 玻璃外圈
    ctx.strokeStyle = "rgba(255,255,255,0.48)";
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();

    // 小高光
    ctx.fillStyle = "rgba(255,255,255,0.84)";
    ctx.beginPath();
    ctx.arc(x - r * 0.34, y - r * 0.42, r * 0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawPaddle(x, y, r, color, isPlayer) {
    const t = performance.now() / 1000;
    const paddleObj = isPlayer ? player : ai;
    const speed = Math.hypot(paddleObj.vx, paddleObj.vy);
    const pulse = Math.min(speed / 1500, 1) * 0.13;
    const dynamicRadius = r * (1 + pulse);
    const rotationDir = isPlayer ? 1 : -1;

    ctx.save();

    ctx.globalCompositeOperation = "screen";
    for (let i = 3; i >= 1; i--) {
      ctx.globalAlpha = 0.055 * i;
      ctx.shadowBlur = dynamicRadius * (1.5 + i * 0.8);
      ctx.shadowColor = theme.gold;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, dynamicRadius * (1.08 + i * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotationDir * t * 0.75);
    ctx.strokeStyle = rgba(theme.gold, 0.78);
    ctx.fillStyle = rgba(color, 0.16);
    ctx.lineWidth = Math.max(2, r * 0.055);
    ctx.shadowBlur = 10;
    ctx.shadowColor = theme.gold;
    ctx.beginPath();
    const teeth = 18;
    for (let i = 0; i < teeth * 2; i++) {
      const a = (Math.PI * 2 * i) / (teeth * 2);
      const rr = i % 2 === 0 ? dynamicRadius * 1.18 : dynamicRadius * 1.02;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-rotationDir * t * 0.22);
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      const px = Math.cos(a) * r * 0.78;
      const py = Math.sin(a) * r * 0.78;
      ctx.fillStyle = "#f7d58a";
      ctx.shadowBlur = 6;
      ctx.shadowColor = theme.gold;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2.2, r * 0.055), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const borderGradient = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    borderGradient.addColorStop(0, "#fff1b8");
    borderGradient.addColorStop(0.28, "#d6a84f");
    borderGradient.addColorStop(0.62, "#8a4f1c");
    borderGradient.addColorStop(1, "#1a0e04");
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = Math.max(4, r * 0.13);
    ctx.shadowBlur = 9;
    ctx.shadowColor = theme.gold;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.96, 0, Math.PI * 2);
    ctx.stroke();

    const baseGlow = ctx.createRadialGradient(x - r * 0.22, y - r * 0.30, r * 0.08, x, y, r);
    baseGlow.addColorStop(0, "#fff0bb");
    baseGlow.addColorStop(0.22, rgba(color, 0.95));
    baseGlow.addColorStop(0.68, "#9b5f24");
    baseGlow.addColorStop(1, "#150b04");
    ctx.fillStyle = baseGlow;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotationDir * -t * 1.8);
    ctx.strokeStyle = "rgba(255,240,190,0.68)";
    ctx.lineWidth = Math.max(1.5, r * 0.045);
    ctx.setLineDash([r * 0.24, r * 0.18]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.88, 0, Math.PI * 2);
    ctx.clip();

    const innerShadow = ctx.createRadialGradient(x, y, r * 0.42, x, y, r);
    innerShadow.addColorStop(0, "rgba(0,0,0,0)");
    innerShadow.addColorStop(0.78, "rgba(0,0,0,0.18)");
    innerShadow.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = innerShadow;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    ctx.fillStyle = "rgba(255,248,218,0.42)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.18, y - r * 0.42, r * 0.42, r * 0.17, -0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    const core = ctx.createRadialGradient(x, y, 0, x, y, r * 0.25);
    core.addColorStop(0, "#fff8dc");
    core.addColorStop(0.36, theme.gold);
    core.addColorStop(1, "rgba(80,35,10,0.25)");
    ctx.fillStyle = core;
    ctx.shadowBlur = 12 + pulse * 24;
    ctx.shadowColor = theme.gold;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.21, 0, Math.PI * 2);
    ctx.fill();

    if (speed > 260) {
      const angle = Math.atan2(paddleObj.vy, paddleObj.vx) + Math.PI;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      const streak = ctx.createLinearGradient(0, 0, -r * (1.3 + pulse * 3), 0);
      streak.addColorStop(0, rgba(theme.gold, 0.30));
      streak.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = streak;
      ctx.globalCompositeOperation = "screen";
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.42);
      ctx.lineTo(-r * (1.8 + pulse * 3.3), 0);
      ctx.lineTo(-r * 0.2, r * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawReflection(x, y, r, color) {
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.translate(x, y + r * 1.7);
    ctx.scale(1, 0.28);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.2);
    g.addColorStop(0, rgba(color, 0.6));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }


  function spawnSteam(x, y, count = 10, power = 70) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
      const speed = Math.random() * power + 25;
      particles.push({
        x: x + (Math.random() - 0.5) * 18,
        y: y + (Math.random() - 0.5) * 18,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: Math.random() * 0.75 + 0.55,
        max: 1.25,
        color: theme.smoke || "rgba(180,150,110,0.18)",
        kind: "steam",
        size: Math.random() * 9 + 8
      });
    }
  }

  function drawGear(cx, cy, r, teeth, color, rotation, alpha = 0.28) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = rgba(color, 0.08);
    ctx.lineWidth = Math.max(1, r * 0.045);
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (Math.PI * 2 * i) / (teeth * 2);
      const rr = i % 2 === 0 ? r : r * 0.82;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawEffects() {
    waves.forEach(w => {
      const a = Math.max(0, w.life / w.max);
      const progress = 1 - a;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = a;
      ctx.strokeStyle = w.color;
      ctx.shadowBlur = 28;
      ctx.shadowColor = w.color;
      ctx.lineWidth = Math.max(1, 5 * a);

      // 主衝擊波
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.stroke();

      // 科技虛線圈
      ctx.setLineDash([10 + progress * 12, 14]);
      ctx.lineWidth = Math.max(1, 3 * a);
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r * 1.16, 0, Math.PI * 2);
      ctx.stroke();

      // 刻度線：Perfect Hit / 進球時會更像能量爆震
      ctx.setLineDash([]);
      const ticks = 24;
      for (let i = 0; i < ticks; i++) {
        if (i % 2 && w.r < 80) continue;
        const ang = (Math.PI * 2 * i) / ticks + progress * 1.4;
        const r1 = w.r * 0.88;
        const r2 = w.r * (1.02 + 0.14 * progress);
        ctx.beginPath();
        ctx.moveTo(w.x + Math.cos(ang) * r1, w.y + Math.sin(ang) * r1);
        ctx.lineTo(w.x + Math.cos(ang) * r2, w.y + Math.sin(ang) * r2);
        ctx.stroke();
      }

      ctx.restore();
    });

    particles.forEach(p => {
      ctx.save();
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.shadowBlur = p.kind === "star" ? 22 : 14;
      ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;

      if (p.kind === "star") {
        ctx.translate(p.x, p.y);
        ctx.rotate(performance.now() / 140);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const rr = i % 2 ? p.size * 0.55 : p.size * 1.9;
          const ang = (Math.PI * 2 * i) / 8;
          ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === "steam") {
        ctx.shadowBlur = 0;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * 1.35, p.size, Math.sin(performance.now()/600 + p.x) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });

    sparks.forEach(s => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.life / s.max);
      ctx.strokeStyle = s.color;
      ctx.shadowBlur = 20;
      ctx.shadowColor = s.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      s.points.forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
      ctx.restore();
    });

    texts.forEach(t => {
      ctx.save();
      const a = Math.max(0, t.life / t.max);
      ctx.globalAlpha = a;
      ctx.font = `1000 ${t.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 24;
      ctx.shadowColor = t.color;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    });
  }

  function drawTrail() {
    if (ball.trail.length < 2) return;

    const speed = Math.hypot(ball.vx, ball.vy);
    const coreColor = speed > 1150 ? theme.gold : speed > 880 ? theme.accent : theme.ball;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function pathThroughTrail() {
      ctx.beginPath();
      ctx.moveTo(ball.trail[0].x, ball.trail[0].y);
      for (let i = 1; i < ball.trail.length - 1; i++) {
        const p = ball.trail[i];
        const n = ball.trail[i + 1];
        const mx = (p.x + n.x) * 0.5;
        const my = (p.y + n.y) * 0.5;
        ctx.quadraticCurveTo(p.x, p.y, mx, my);
      }
      const last = ball.trail[ball.trail.length - 1];
      ctx.lineTo(last.x, last.y);
    }

    // 外層寬光暈
    pathThroughTrail();
    ctx.strokeStyle = rgba(coreColor, 0.18);
    ctx.lineWidth = ball.r * 3.4;
    ctx.shadowBlur = ball.r * 4.0;
    ctx.shadowColor = coreColor;
    ctx.stroke();

    // 中層能量帶
    pathThroughTrail();
    ctx.strokeStyle = rgba(coreColor, 0.36);
    ctx.lineWidth = ball.r * 1.75;
    ctx.shadowBlur = ball.r * 2.6;
    ctx.stroke();

    // 內層核心亮軌
    pathThroughTrail();
    ctx.strokeStyle = rgba("#ffffff", 0.82);
    ctx.lineWidth = ball.r * 0.48;
    ctx.shadowBlur = ball.r * 1.4;
    ctx.shadowColor = "#ffffff";
    ctx.stroke();

    // 尾端粒子化，避免光軌像一條死線
    for (let i = 0; i < ball.trail.length; i += 3) {
      const p = ball.trail[i];
      const a = Math.max(0, p.life) * (i / ball.trail.length);
      ctx.globalAlpha = a * 0.42;
      ctx.fillStyle = coreColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ball.r * (0.12 + a * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function draw() {
    const w = innerWidth;
    const h = innerHeight;

    ctx.save();

    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }

    drawBackground();
    drawTable();

    drawTrail();

    drawReflection(ai.x, ai.y, ai.r, theme.ai);
    drawReflection(player.x, player.y, player.r, theme.player);
    drawReflection(ball.x, ball.y, ball.r, theme.ball);

    drawEffects();

    const speed = Math.hypot(ball.vx, ball.vy);
    const ballColor = speed > 1150 ? theme.gold : speed > 880 ? theme.accent : theme.ball;

    drawOrb(ball.x, ball.y, ball.r, ballColor, true);
    drawPaddle(ai.x, ai.y, ai.r, theme.ai, false);
    drawPaddle(player.x, player.y, player.r, theme.player, true);

    if (speed > 1050) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = theme.gold;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 18;
      ctx.shadowColor = theme.gold;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r * (1.5 + i * 0.42), Math.random() * 6, Math.random() * 6 + 1.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${state.flash * 1.35})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  function loop(time) {
    if (state.mode !== "playing") return;
    const dt = Math.min((time - state.lastTime) / 1000 || 0.016, 0.033);
    state.lastTime = time;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  async function countdown() {
    countdownOverlay.classList.add("active");
    for (const text of ["3", "2", "1", "GO"]) {
      countdownText.textContent = text;
      beep("start");
      haptic(text === "GO" ? "start" : "countdown");
      await new Promise(r => setTimeout(r, text === "GO" ? 360 : 520));
    }
    countdownOverlay.classList.remove("active");
  }

  async function startGame() {
    aiConfig = difficulty[difficultySelect.value] || difficulty.normal;
    theme = THEMES[themeSelect.value] || THEMES.steampunk;
    resetGame();

    menuOverlay.classList.remove("active");
    gameOverOverlay.classList.remove("active");
    pauseOverlay.classList.remove("active");

    state.mode = "countdown";
    draw();
    await countdown();

    state.mode = "playing";
    state.lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function pauseGame() {
    if (state.mode !== "playing") return;
    haptic("tap");
    state.mode = "paused";
    pauseOverlay.classList.add("active");
  }

  function resumeGame() {
    if (state.mode !== "paused") return;
    haptic("tap");
    pauseOverlay.classList.remove("active");
    state.mode = "playing";
    state.lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function endGame() {
    state.mode = "gameover";
    const playerWon = state.playerScore > state.aiScore;
    winnerText.textContent = playerWon ? "你贏了！" : "AI 獲勝";
    finalScore.textContent = `最終比分：YOU ${state.playerScore}：${state.aiScore} AI`;

    if (playerWon) {
      state.bestWin += 1;
      localStorage.setItem("nah_best_win", String(state.bestWin));
      bestWinEl.textContent = state.bestWin;
      beep("win");
      haptic("win");
    } else {
      haptic("lose");
    }

    gameOverOverlay.classList.add("active");
  }

  function goHome() {
    state.mode = "menu";
    pauseOverlay.classList.remove("active");
    gameOverOverlay.classList.remove("active");
    countdownOverlay.classList.remove("active");
    menuOverlay.classList.add("active");
    draw();
  }

  function updatePointer(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
  }

  canvas.addEventListener("pointerdown", e => {
    if (state.activePointerId !== null) return;
    state.activePointerId = e.pointerId;
    pointer.down = true;
    canvas.setPointerCapture(e.pointerId);
    updatePointer(e);
    if (state.mode === "playing") haptic("tap");
  });

  canvas.addEventListener("pointermove", e => {
    if (state.activePointerId !== e.pointerId) return;
    updatePointer(e);
  });

  canvas.addEventListener("pointerup", e => {
    if (state.activePointerId === e.pointerId) {
      state.activePointerId = null;
      pointer.down = false;
    }
  });

  canvas.addEventListener("pointercancel", e => {
    if (state.activePointerId === e.pointerId) {
      state.activePointerId = null;
      pointer.down = false;
    }
  });

  startButton.addEventListener("click", startGame);
  restartButton.addEventListener("click", startGame);
  resumeButton.addEventListener("click", resumeGame);
  pauseBtn.addEventListener("click", pauseGame);
  homeButton.addEventListener("click", goHome);
  backMenuButton.addEventListener("click", goHome);

  soundToggle.addEventListener("click", () => {
    state.sound = !state.sound;
    localStorage.setItem("nah_sound", state.sound ? "on" : "off");
    setToggleVisuals();
    if (state.sound) beep("start");
  });

  vibrationToggle.addEventListener("click", () => {
    state.vibration = !state.vibration;
    localStorage.setItem("nah_vibration", state.vibration ? "on" : "off");
    setToggleVisuals();
    haptic("tap");
  });

  themeSelect.addEventListener("change", () => {
    theme = THEMES[themeSelect.value] || THEMES.steampunk;
    draw();
  });

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (state.mode === "playing") pauseGame();
      else if (state.mode === "paused") resumeGame();
    }
  });

  setToggleVisuals();
  resize();
  resetBall(1);
  draw();
})();
