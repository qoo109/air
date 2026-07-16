(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);

  const ui = {
    aiScore: $('ai-score'), playerScore: $('player-score'), speed: $('speed-label'), combo: $('combo-label'),
    pauseBtn: $('pause-btn'), menu: $('menu'), pause: $('pause'), gameOver: $('game-over'), countdown: $('countdown'),
    countdownText: $('countdown-text'), start: $('start-button'), resume: $('resume-button'), restart: $('restart-button'),
    home: $('home-button'), back: $('back-menu-button'), difficulty: $('difficulty-select'), theme: $('theme-select'),
    sound: $('sound-toggle'), vibration: $('vibration-toggle'), winner: $('winner-text'), finalScore: $('final-score'), best: $('best-win')
  };

  const palettes = {
    steampunk: { name: '金色桌面', bg: '#d7ecfa', grid: '#a7cbe4', rink: '#fff3dd', edge: '#4b3546', player: '#f2cd61', ai: '#f58aa8', puck: '#6dc9bd', accent: '#f39a54' },
    copper: { name: '蜜桃橘', bg: '#f9dfd4', grid: '#e5b7ad', rink: '#fff4e9', edge: '#563a44', player: '#f3a35c', ai: '#e97ca5', puck: '#75c7c1', accent: '#f2cc64' },
    royal: { name: '檸檬黃', bg: '#fff1b8', grid: '#e4cd78', rink: '#fff9df', edge: '#4f3a45', player: '#75c8bc', ai: '#f185aa', puck: '#f2cd61', accent: '#ef9a50' },
    coal: { name: '深色像素', bg: '#283141', grid: '#3e4e64', rink: '#39485b', edge: '#f6e4cf', player: '#f1cf67', ai: '#f080a5', puck: '#70c8be', accent: '#f09a50' }
  };

  const difficulty = {
    easy: { speed: 250, reaction: 0.07, predict: 0.15 },
    normal: { speed: 340, reaction: 0.10, predict: 0.36 },
    hard: { speed: 440, reaction: 0.14, predict: 0.62 },
    boss: { speed: 560, reaction: 0.19, predict: 0.88 }
  };

  let palette = palettes.steampunk;
  let aiCfg = difficulty.normal;
  let raf = 0;
  let last = 0;
  let audioCtx = null;

  const state = {
    mode: 'menu', playerScore: 0, aiScore: 0, winScore: 7, combo: 0, comboTimer: 0,
    sound: localStorage.getItem('nah_sound') !== 'off', vibration: localStorage.getItem('nah_vibration') !== 'off',
    best: Number(localStorage.getItem('nah_best_win') || 0), pointerId: null, shake: 0, flash: 0
  };

  const pointer = { x: 0, y: 0, down: false };
  const ball = { x: 0, y: 0, vx: 0, vy: 0, r: 12, trail: [] };
  const player = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 28 };
  const ai = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 28 };
  const particles = [];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function vibrate(pattern) { if (state.vibration && navigator.vibrate) navigator.vibrate(pattern); }
  function beep(type = 'hit') {
    if (!state.sound) return;
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const [freq, dur, wave, vol] = ({
      hit: [360, .05, 'square', .045], wall: [180, .035, 'triangle', .03], goal: [660, .22, 'square', .06],
      start: [780, .08, 'square', .04], win: [980, .3, 'triangle', .07]
    })[type] || [360, .05, 'square', .04];
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = wave; osc.frequency.setValueAtTime(freq, now); osc.frequency.exponentialRampToValueAtTime(freq * .72, now + dur);
    gain.gain.setValueAtTime(vol, now); gain.gain.exponentialRampToValueAtTime(.001, now + dur);
    osc.connect(gain).connect(audioCtx.destination); osc.start(now); osc.stop(now + dur);
  }

  function updateToggleUI() {
    ui.sound.textContent = state.sound ? '音效 ON' : '音效 OFF';
    ui.vibration.textContent = state.vibration ? '震動 ON' : '震動 OFF';
    ui.sound.classList.toggle('active', state.sound);
    ui.vibration.classList.toggle('active', state.vibration);
    ui.best.textContent = state.best;
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = innerWidth, h = innerHeight;
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = Math.min(w, h);
    ball.r = Math.max(10, m * .025);
    player.r = ai.r = Math.max(25, m * .06);
    player.x = w / 2; player.y = h - 95;
    ai.x = w / 2; ai.y = 105;
    pointer.x = player.x; pointer.y = player.y;
    if (state.mode !== 'playing') resetBall(Math.random() < .5 ? 1 : -1);
    draw();
  }

  function resetBall(dir = 1) {
    const speed = Math.max(330, Math.min(innerWidth, innerHeight) * .9);
    const a = (Math.random() * .7 - .35);
    ball.x = innerWidth / 2; ball.y = innerHeight / 2;
    ball.vx = Math.sin(a) * speed; ball.vy = Math.cos(a) * speed * dir;
    ball.trail.length = 0;
  }

  function resetGame() {
    state.playerScore = 0; state.aiScore = 0; state.combo = 0; state.comboTimer = 0;
    particles.length = 0; resize(); updateHud();
  }

  function updateHud() {
    ui.aiScore.textContent = `AI ${state.aiScore}`;
    ui.playerScore.textContent = `YOU ${state.playerScore}`;
    ui.combo.textContent = `COMBO x${state.combo}`;
    ui.speed.textContent = `${Math.round(Math.hypot(ball.vx, ball.vy) / 7)} km/h`;
  }

  function movePaddle(p, tx, ty, strength, dt) {
    p.px = p.x; p.py = p.y;
    const k = 1 - Math.pow(1 - strength, dt * 60);
    p.x += (tx - p.x) * k; p.y += (ty - p.y) * k;
    p.vx = (p.x - p.px) / Math.max(dt, .001); p.vy = (p.y - p.py) / Math.max(dt, .001);
  }

  function collidePaddle(p, isPlayer) {
    const dx = ball.x - p.x, dy = ball.y - p.y;
    const dist = Math.hypot(dx, dy), min = ball.r + p.r;
    if (dist >= min || dist === 0) return;
    const nx = dx / dist, ny = dy / dist;
    ball.x = p.x + nx * min; ball.y = p.y + ny * min;
    const rel = (ball.vx - p.vx) * nx + (ball.vy - p.vy) * ny;
    if (rel < 0) {
      const power = 1.9;
      ball.vx -= power * rel * nx; ball.vy -= power * rel * ny;
      ball.vx += p.vx * .38; ball.vy += p.vy * .38;
      const max = 1450, s = Math.hypot(ball.vx, ball.vy);
      if (s > max) { ball.vx *= max / s; ball.vy *= max / s; }
      state.combo = isPlayer ? state.combo + 1 : 0; state.comboTimer = 1.4;
      spawnPixels(ball.x, ball.y, isPlayer ? palette.player : palette.ai, 18);
      state.shake = 5; beep('hit'); vibrate(18); updateHud();
    }
  }

  function spawnPixels(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = 70 + Math.random() * 260;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .3 + Math.random() * .35, max: .65, size: 3 + Math.random() * 5, color });
    }
  }

  function scoreGoal(playerScored) {
    if (playerScored) { state.playerScore++; state.combo++; } else { state.aiScore++; state.combo = 0; }
    spawnPixels(innerWidth / 2, playerScored ? 24 : innerHeight - 24, playerScored ? palette.player : palette.ai, 46);
    state.flash = .2; state.shake = 10; beep('goal'); vibrate([35, 25, 70]); updateHud();
    if (state.playerScore >= state.winScore || state.aiScore >= state.winScore) { endGame(); return; }
    resetBall(playerScored ? -1 : 1);
  }

  function update(dt) {
    if (state.comboTimer > 0) { state.comboTimer -= dt; if (state.comboTimer <= 0) { state.combo = 0; updateHud(); } }
    state.shake = Math.max(0, state.shake - dt * 28); state.flash = Math.max(0, state.flash - dt);

    if (pointer.down) {
      movePaddle(player, clamp(pointer.x, player.r, innerWidth - player.r), clamp(pointer.y, innerHeight / 2 + player.r, innerHeight - player.r), .32, dt);
    } else movePaddle(player, player.x, innerHeight - 95, .08, dt);

    let targetX = innerWidth / 2;
    if (ball.vy < 0) {
      const t = (ball.y - ai.y) / Math.max(80, Math.abs(ball.vy));
      targetX = ball.x + ball.vx * t * aiCfg.predict;
      const span = innerWidth - ai.r * 2;
      while (targetX < ai.r || targetX > innerWidth - ai.r) targetX = targetX < ai.r ? ai.r + (ai.r - targetX) : innerWidth - ai.r - (targetX - (innerWidth - ai.r));
      targetX = clamp(targetX, ai.r, ai.r + span);
    }
    movePaddle(ai, targetX, 105, aiCfg.reaction, dt);
    const aiSpeed = Math.hypot(ai.vx, ai.vy);
    if (aiSpeed > aiCfg.speed) { ai.vx *= aiCfg.speed / aiSpeed; ai.vy *= aiCfg.speed / aiSpeed; }

    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    ball.vx *= Math.pow(.9975, dt * 60); ball.vy *= Math.pow(.9975, dt * 60);
    ball.trail.unshift({ x: ball.x, y: ball.y }); if (ball.trail.length > 12) ball.trail.pop();

    if (ball.x - ball.r < 10) { ball.x = 10 + ball.r; ball.vx = Math.abs(ball.vx); beep('wall'); }
    if (ball.x + ball.r > innerWidth - 10) { ball.x = innerWidth - 10 - ball.r; ball.vx = -Math.abs(ball.vx); beep('wall'); }

    const goalW = innerWidth * .42, goalL = (innerWidth - goalW) / 2, goalR = goalL + goalW;
    if (ball.y + ball.r < 0) { if (ball.x > goalL && ball.x < goalR) scoreGoal(true); else { ball.y = ball.r; ball.vy = Math.abs(ball.vy); } }
    if (ball.y - ball.r > innerHeight) { if (ball.x > goalL && ball.x < goalR) scoreGoal(false); else { ball.y = innerHeight - ball.r; ball.vy = -Math.abs(ball.vy); } }

    collidePaddle(ai, false); collidePaddle(player, true);
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96; p.life -= dt; });
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
    updateHud();
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  }

  function drawBackground() {
    ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.strokeStyle = palette.grid; ctx.lineWidth = 1;
    const gap = 24;
    for (let x = 0; x < innerWidth; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, innerHeight); ctx.stroke(); }
    for (let y = 0; y < innerHeight; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(innerWidth, y); ctx.stroke(); }
  }

  function drawRink() {
    const pad = 16, top = 72, bottom = 24;
    ctx.save();
    ctx.fillStyle = 'rgba(73,50,67,.18)'; roundedRect(pad + 5, top + 6, innerWidth - pad * 2, innerHeight - top - bottom, 30); ctx.fill();
    ctx.fillStyle = palette.rink; ctx.strokeStyle = palette.edge; ctx.lineWidth = 4;
    roundedRect(pad, top, innerWidth - pad * 2, innerHeight - top - bottom, 30); ctx.fill(); ctx.stroke();

    ctx.save(); roundedRect(pad + 4, top + 4, innerWidth - pad * 2 - 8, innerHeight - top - bottom - 8, 26); ctx.clip();
    ctx.globalAlpha = .25; ctx.strokeStyle = palette.grid; ctx.lineWidth = 1;
    for (let x = pad; x < innerWidth - pad; x += 28) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, innerHeight - bottom); ctx.stroke(); }
    for (let y = top; y < innerHeight - bottom; y += 28) { ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(innerWidth - pad, y); ctx.stroke(); }
    ctx.restore();

    ctx.strokeStyle = palette.edge; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(pad + 10, innerHeight / 2); ctx.lineTo(innerWidth - pad - 10, innerHeight / 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = palette.rink; ctx.strokeStyle = palette.accent; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(innerWidth / 2, innerHeight / 2, Math.min(innerWidth, innerHeight) * .11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = palette.accent; roundedRect(innerWidth / 2 - 7, innerHeight / 2 - 7, 14, 14, 4); ctx.fill();

    const goalW = innerWidth * .42, left = (innerWidth - goalW) / 2;
    ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.strokeStyle = palette.ai; ctx.beginPath(); ctx.moveTo(left, top + 2); ctx.lineTo(left + goalW, top + 2); ctx.stroke();
    ctx.strokeStyle = palette.player; ctx.beginPath(); ctx.moveTo(left, innerHeight - bottom - 2); ctx.lineTo(left + goalW, innerHeight - bottom - 2); ctx.stroke();
    ctx.restore();
  }

  function drawTrail() {
    for (let i = ball.trail.length - 1; i >= 0; i--) {
      const p = ball.trail[i], a = (ball.trail.length - i) / ball.trail.length * .16;
      ctx.globalAlpha = a; ctx.fillStyle = palette.puck; roundedRect(p.x - ball.r * .55, p.y - ball.r * .55, ball.r * 1.1, ball.r * 1.1, 5); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPixelPaddle(p, color, face) {
    const r = p.r;
    ctx.save();
    ctx.fillStyle = 'rgba(65,45,60,.22)'; roundedRect(p.x - r + 4, p.y - r + 6, r * 2, r * 2, r * .65); ctx.fill();
    ctx.fillStyle = color; ctx.strokeStyle = palette.edge; ctx.lineWidth = 4; roundedRect(p.x - r, p.y - r, r * 2, r * 2, r * .65); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.42)'; roundedRect(p.x - r * .55, p.y - r * .55, r * 1.1, r * .35, r * .15); ctx.fill();
    ctx.fillStyle = palette.edge; ctx.font = `bold ${Math.max(15, r * .55)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(face, p.x, p.y + 1);
    ctx.restore();
  }

  function drawPuck() {
    const r = ball.r;
    ctx.save();
    ctx.fillStyle = 'rgba(60,43,56,.22)'; roundedRect(ball.x - r + 3, ball.y - r + 4, r * 2, r * 2, 6); ctx.fill();
    ctx.fillStyle = palette.puck; ctx.strokeStyle = palette.edge; ctx.lineWidth = 3; roundedRect(ball.x - r, ball.y - r, r * 2, r * 2, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff9e9'; roundedRect(ball.x - r * .48, ball.y - r * .52, r * .52, r * .28, 3); ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach(p => { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; roundedRect(p.x, p.y, p.size, p.size, 2); ctx.fill(); });
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random() - .5) * state.shake, (Math.random() - .5) * state.shake);
    drawBackground(); drawRink(); drawTrail(); drawParticles(); drawPuck(); drawPixelPaddle(ai, palette.ai, 'AI'); drawPixelPaddle(player, palette.player, 'YOU');
    if (state.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${state.flash * 2})`; ctx.fillRect(0, 0, innerWidth, innerHeight); }
    ctx.restore();
  }

  function loop(t) {
    if (state.mode !== 'playing') return;
    const dt = Math.min((t - last) / 1000 || .016, .033); last = t;
    update(dt); draw(); raf = requestAnimationFrame(loop);
  }

  async function countdown() {
    ui.countdown.classList.add('active');
    for (const n of ['3', '2', '1', 'GO']) { ui.countdownText.textContent = n; beep('start'); vibrate(20); await new Promise(r => setTimeout(r, n === 'GO' ? 320 : 500)); }
    ui.countdown.classList.remove('active');
  }

  async function startGame() {
    cancelAnimationFrame(raf);
    palette = palettes[ui.theme.value] || palettes.steampunk;
    aiCfg = difficulty[ui.difficulty.value] || difficulty.normal;
    resetGame(); ui.menu.classList.remove('active'); ui.pause.classList.remove('active'); ui.gameOver.classList.remove('active');
    state.mode = 'countdown'; draw(); await countdown(); state.mode = 'playing'; last = performance.now(); raf = requestAnimationFrame(loop);
  }

  function pauseGame() { if (state.mode !== 'playing') return; cancelAnimationFrame(raf); state.mode = 'paused'; ui.pause.classList.add('active'); vibrate(12); }
  function resumeGame() { if (state.mode !== 'paused') return; ui.pause.classList.remove('active'); state.mode = 'playing'; last = performance.now(); raf = requestAnimationFrame(loop); }
  function goHome() { cancelAnimationFrame(raf); state.mode = 'menu'; ui.pause.classList.remove('active'); ui.gameOver.classList.remove('active'); ui.countdown.classList.remove('active'); ui.menu.classList.add('active'); draw(); }
  function endGame() {
    cancelAnimationFrame(raf); state.mode = 'gameover'; const win = state.playerScore > state.aiScore;
    ui.winner.textContent = win ? '你贏了！' : 'AI 獲勝'; ui.finalScore.textContent = `最終比分：YOU ${state.playerScore}：${state.aiScore} AI`;
    if (win) { state.best++; localStorage.setItem('nah_best_win', String(state.best)); ui.best.textContent = state.best; beep('win'); vibrate([45, 35, 90]); }
    ui.gameOver.classList.add('active');
  }

  function setPointer(e) { const r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; }
  canvas.addEventListener('pointerdown', e => { if (state.pointerId !== null) return; state.pointerId = e.pointerId; pointer.down = true; canvas.setPointerCapture(e.pointerId); setPointer(e); });
  canvas.addEventListener('pointermove', e => { if (state.pointerId === e.pointerId) setPointer(e); });
  function release(e) { if (state.pointerId === e.pointerId) { state.pointerId = null; pointer.down = false; } }
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);

  ui.start.addEventListener('click', startGame); ui.restart.addEventListener('click', startGame); ui.resume.addEventListener('click', resumeGame);
  ui.pauseBtn.addEventListener('click', pauseGame); ui.home.addEventListener('click', goHome); ui.back.addEventListener('click', goHome);
  ui.sound.addEventListener('click', () => { state.sound = !state.sound; localStorage.setItem('nah_sound', state.sound ? 'on' : 'off'); updateToggleUI(); if (state.sound) beep('start'); });
  ui.vibration.addEventListener('click', () => { state.vibration = !state.vibration; localStorage.setItem('nah_vibration', state.vibration ? 'on' : 'off'); updateToggleUI(); vibrate(15); });
  ui.theme.addEventListener('change', () => { palette = palettes[ui.theme.value] || palettes.steampunk; draw(); });
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') state.mode === 'playing' ? pauseGame() : state.mode === 'paused' && resumeGame(); });

  updateToggleUI(); resize(); draw();
})();