(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas?.getContext('2d', { alpha: false, desynchronized: true });
  const quickButton = $('quick-match-btn');
  const cancelButton = $('cancel-match-btn');
  const fallbackButton = $('match-ai-fallback-btn');
  const menu = $('menu');
  const matchScreen = $('match-screen');
  const matchStatus = $('match-status');
  const queueTime = $('queue-time');
  const queueOnline = $('queue-online');
  const countdown = $('countdown');
  const countdownText = $('countdown-text');
  const hud = $('hud');
  const aiScore = $('ai-score');
  const playerScore = $('player-score');
  const speedLabel = $('speed-label');
  const comboLabel = $('combo-label');
  const bestComboHud = $('best-combo-hud');
  const streakHud = $('win-streak-hud');
  const pauseButton = $('pause-btn');
  const gameOver = $('game-over');
  const winnerText = $('winner-text');
  const finalScore = $('final-score');
  const restartButton = $('restart-button');
  const homeButton = $('home-button');

  if (!canvas || !ctx || !quickButton) return;

  const config = window.BUBBLE_CLOUD_CONFIG || {};
  const client = window.BubbleSupabaseClient || (
    config.enabled && config.supabaseUrl && config.supabasePublishableKey && window.supabase?.createClient
      ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storageKey: 'bubble-island-auth-v409'
          },
          realtime: { params: { eventsPerSecond: 45 } }
        })
      : null
  );

  const FIELD = {
    width: 1000,
    height: 1600,
    left: 48,
    right: 952,
    top: 150,
    bottom: 1548,
    middle: 850,
    goalLeft: 345,
    goalRight: 655,
    paddleRadius: 82,
    puckRadius: 30
  };

  const NET = {
    stateInterval: 42,
    inputInterval: 30,
    inputKeepAlive: 180,
    maxPrediction: 95,
    disconnectTimeout: 10000
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const round1 = value => Math.round(value * 10) / 10;

  let mode = 'idle';
  let attemptToken = 0;
  let user = null;
  let playerName = '玩家';
  let role = null;
  let opponentName = '對手';
  let matchId = null;
  let channel = null;
  let subscribed = false;
  let peerSeen = false;
  let started = false;
  let ended = false;
  let pointerId = null;
  let startOffer = null;
  let latency = 0;
  let queueSeconds = 0;
  let queueTimer = null;
  let pollTimer = null;
  let countTimer = null;
  let helloTimer = null;
  let offerTimer = null;
  let connectTimeout = null;
  let animationFrame = null;
  let resizeTimer = null;
  let lastFrame = 0;
  let lastStateSent = 0;
  let lastInputSent = 0;
  let lastInputKeepAlive = 0;
  let lastRemoteMessage = 0;
  let lastPingSent = 0;
  let lastInputX = NaN;
  let lastInputY = NaN;
  let lastStateSequence = 0;

  const localPaddle = { x: 500, y: 1430, targetX: 500, targetY: 1430 };
  const remotePaddle = { x: 500, y: 270, targetX: 500, targetY: 270 };
  const puck = { x: 500, y: 850, vx: 120, vy: -500 };
  const predictedPuck = { x: 500, y: 850, vx: 120, vy: -500 };
  const authoritative = { x: 500, y: 850, vx: 120, vy: -500, receivedAt: 0 };
  const display = { opponentX: 500, opponentY: 270 };
  const game = { hostScore: 0, guestScore: 0, pause: 0, sequence: 0 };

  const render = {
    scale: 0.75,
    cssWidth: 0,
    cssHeight: 0,
    left: 0,
    top: 0,
    staticLayer: null,
    turtleSprite: null,
    shellSprite: null,
    puckSprite: null
  };

  function readPlayerName() {
    try {
      const stored = JSON.parse(localStorage.getItem('bubble_island_user') || '{}');
      playerName = String(stored.name || '玩家').replace(/\s+/g, ' ').trim().slice(0, 12) || '玩家';
    } catch (_) {
      playerName = '玩家';
    }
  }

  function setStatus(text) {
    if (matchStatus) matchStatus.textContent = text;
  }

  function formatTime(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function describeError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '未知錯誤');
    const status = Number(error?.status || 0);
    if (code === 'anonymous_provider_disabled') return '匿名登入尚未開啟。';
    if (status === 429 || code.includes('rate_limit')) return '匿名登入次數暫時超過限制（429），請稍後再試。';
    if (status === 401 || status === 403 || code.includes('api_key')) return `Supabase 權限被拒絕（${code || status}）。`;
    if (code === 'pgrst202' || message.includes('join_quick_match')) return '多人配對資料庫尚未安裝或尚未更新。';
    return `連線失敗：${message}`;
  }

  function clearTimers() {
    clearInterval(queueTimer);
    clearInterval(pollTimer);
    clearInterval(countTimer);
    clearInterval(helloTimer);
    clearInterval(offerTimer);
    clearTimeout(connectTimeout);
    queueTimer = pollTimer = countTimer = helloTimer = offerTimer = connectTimeout = null;
  }

  function setFallback(kind) {
    if (!fallbackButton) return;
    if (kind === 'retry') {
      fallbackButton.hidden = false;
      fallbackButton.textContent = '↻ 重新嘗試';
      fallbackButton.dataset.action = 'retry';
      return;
    }
    if (kind === 'ai') {
      fallbackButton.hidden = false;
      fallbackButton.textContent = '🤖 改與 AI 對戰';
      fallbackButton.dataset.action = 'ai';
      return;
    }
    fallbackButton.hidden = true;
    fallbackButton.dataset.action = '';
  }

  function showMatchScreen() {
    document.body.classList.add('multiplayer-pending');
    document.body.classList.remove('multiplayer-running');
    menu?.classList.remove('active');
    gameOver?.classList.remove('active');
    countdown?.classList.remove('active');
    matchScreen?.classList.add('active');
  }

  function restoreMenu() {
    document.body.classList.remove('multiplayer-pending', 'multiplayer-running');
    hud?.classList.remove('multiplayer-hud');
    matchScreen?.classList.remove('active');
    countdown?.classList.remove('active');
    gameOver?.classList.remove('active');
    menu?.classList.add('active');
    if (pauseButton) {
      pauseButton.textContent = 'Ⅱ';
      pauseButton.setAttribute('aria-label', '暫停');
    }
  }

  function showError(error) {
    mode = 'error';
    clearTimers();
    showMatchScreen();
    setStatus(describeError(error));
    if (queueOnline) queueOnline.textContent = '連線狀態：失敗';
    setFallback('retry');
  }

  async function ensureAuth() {
    if (!client) throw new Error('雲端連線尚未設定。');
    const sessionResult = await client.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    if (sessionResult.data?.session?.user) {
      user = sessionResult.data.session.user;
      return user;
    }
    const signInResult = await client.auth.signInAnonymously({
      options: { data: { player_name: playerName } }
    });
    if (signInResult.error) throw signInResult.error;
    if (!signInResult.data?.user) throw new Error('無法建立匿名玩家。');
    user = signInResult.data.user;
    return user;
  }

  async function safeCancelServerMatch() {
    if (!client || !user) return;
    try { await client.rpc('cancel_quick_match'); } catch (_) {}
  }

  async function refreshWaitingCount(token) {
    if (!client || mode !== 'queue' || token !== attemptToken) return;
    const result = await client.rpc('quick_match_waiting_count');
    if (token === attemptToken && mode === 'queue' && !result.error && Number.isFinite(result.data) && queueOnline) {
      queueOnline.textContent = `等待玩家：${result.data}`;
    }
  }

  async function startQueue() {
    if (!['idle', 'error', 'finished'].includes(mode)) return;
    const token = ++attemptToken;
    readPlayerName();
    ended = false;
    role = null;
    opponentName = '對手';
    matchId = null;
    subscribed = false;
    peerSeen = false;
    started = false;
    startOffer = null;
    latency = 0;
    lastStateSequence = 0;
    clearTimers();
    showMatchScreen();
    setFallback(null);
    queueSeconds = 0;
    if (queueTime) queueTime.textContent = '00:00';
    if (queueOnline) queueOnline.textContent = '等待玩家：計算中';
    setStatus('正在建立匿名玩家連線…');
    mode = 'preparing';

    try {
      await ensureAuth();
      if (token !== attemptToken) return;
      await safeCancelServerMatch();
      if (token !== attemptToken) return;
      mode = 'queue';
      setStatus('正在尋找真人對手…');
      queueTimer = setInterval(() => {
        if (mode !== 'queue' || token !== attemptToken) return;
        queueSeconds += 1;
        if (queueTime) queueTime.textContent = formatTime(queueSeconds);
        if (queueSeconds === 10) setStatus('目前配對人數較少，繼續等待中…');
        if (queueSeconds >= 30) setFallback('ai');
      }, 1000);
      await pollQueue(token);
      if (token !== attemptToken || mode !== 'queue') return;
      pollTimer = setInterval(() => pollQueue(token), 1250);
      countTimer = setInterval(() => refreshWaitingCount(token), 4000);
      refreshWaitingCount(token);
    } catch (error) {
      if (token !== attemptToken) return;
      showError(error);
    }
  }

  async function pollQueue(token) {
    if (!client || mode !== 'queue' || token !== attemptToken) return;
    const result = await client.rpc('join_quick_match', { p_player_name: playerName });
    if (token !== attemptToken || mode !== 'queue') return;
    if (result.error) {
      showError(result.error);
      return;
    }
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row?.match_id) return;
    role = row.player_role;
    opponentName = row.opponent_name || '對手';
    matchId = row.match_id;
    clearInterval(queueTimer);
    clearInterval(pollTimer);
    clearInterval(countTimer);
    queueTimer = pollTimer = countTimer = null;
    setStatus(`找到對手：${opponentName}，建立高速同步…`);
    if (queueOnline) queueOnline.textContent = '連線狀態：Realtime Fast';
    await connectRealtime(token);
  }

  function send(event, payload = {}) {
    if (!channel || !subscribed) return Promise.resolve('not-subscribed');
    return channel.send({ type: 'broadcast', event, payload });
  }

  function sendHello() {
    return send('hello-v409', { role, name: playerName, sentAt: Date.now() });
  }

  function sendControl(packet) {
    return send('control-v409', { from: role, packet });
  }

  function sendGame(packet) {
    return send('game-v409', { from: role, packet });
  }

  function sendStartOffer() {
    if (role !== 'host' || started || !peerSeen || !subscribed) return;
    if (!startOffer) startOffer = { seed: Date.now(), startAt: Date.now() + 1900 };
    const packet = { type: 'start', ...startOffer };
    sendControl(packet);
    clearInterval(offerTimer);
    offerTimer = setInterval(() => {
      if (started || mode !== 'connecting') return clearInterval(offerTimer);
      sendControl(packet);
    }, 280);
  }

  function handleControl(packet) {
    if (!packet || typeof packet !== 'object') return;
    if (packet.type === 'start' && role === 'guest') {
      peerSeen = true;
      sendControl({ type: 'start-ack', seed: packet.seed, startAt: packet.startAt });
      beginMatch(packet);
      return;
    }
    if (packet.type === 'start-ack' && role === 'host' && startOffer) {
      clearInterval(offerTimer);
      offerTimer = null;
      beginMatch(startOffer);
      return;
    }
    if (packet.type === 'ping') {
      sendControl({ type: 'pong', id: packet.id, sentAt: packet.sentAt });
      return;
    }
    if (packet.type === 'pong') {
      latency = Math.max(1, Math.round((Date.now() - Number(packet.sentAt || Date.now())) / 2));
      updateOnlineHud();
      return;
    }
    if (packet.type === 'leave') finishMatch(role, 'opponent-left');
  }

  function handleGame(packet) {
    if (!Array.isArray(packet)) return;
    if (packet[0] === 'i' && role === 'host') {
      remotePaddle.targetX = clamp(Number(packet[1]) || 500, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);
      remotePaddle.targetY = clamp(Number(packet[2]) || 270, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 10);
      return;
    }
    if (packet[0] === 's' && role === 'guest') receiveAuthoritativeState(packet);
  }

  async function connectRealtime(token) {
    if (!client || !matchId || token !== attemptToken) return;
    mode = 'connecting';
    showMatchScreen();
    if (channel) {
      try { await client.removeChannel(channel); } catch (_) {}
      channel = null;
    }

    channel = client.channel(`game:${matchId}:play`, {
      config: { private: false, broadcast: { ack: false, self: false } }
    });

    channel
      .on('broadcast', { event: 'hello-v409' }, ({ payload }) => {
        if (!payload || payload.role === role) return;
        lastRemoteMessage = performance.now();
        peerSeen = true;
        opponentName = payload.name || opponentName;
        setStatus(`已連上 ${opponentName}，同步開局中…`);
        if (queueOnline) queueOnline.textContent = '連線狀態：雙方已就緒';
        sendHello();
        if (role === 'host') sendStartOffer();
      })
      .on('broadcast', { event: 'control-v409' }, ({ payload }) => {
        if (!payload || payload.from === role) return;
        lastRemoteMessage = performance.now();
        handleControl(payload.packet);
      })
      .on('broadcast', { event: 'game-v409' }, ({ payload }) => {
        if (!payload || payload.from === role) return;
        lastRemoteMessage = performance.now();
        handleGame(payload.packet);
      })
      .subscribe(subscriptionStatus => {
        if (token !== attemptToken) return;
        if (subscriptionStatus === 'SUBSCRIBED') {
          subscribed = true;
          lastRemoteMessage = performance.now();
          setStatus(`已進入高速頻道，等待 ${opponentName} 回應…`);
          if (queueOnline) queueOnline.textContent = '連線狀態：等待對手';
          sendHello();
          clearInterval(helloTimer);
          helloTimer = setInterval(() => {
            if (mode !== 'connecting') return clearInterval(helloTimer);
            sendHello();
            if (role === 'host' && peerSeen) sendStartOffer();
          }, 600);
          clearTimeout(connectTimeout);
          connectTimeout = setTimeout(() => {
            if (mode === 'connecting' && token === attemptToken) {
              showError(new Error('對手沒有完成連線，請重新配對。'));
              safeCancelServerMatch();
            }
          }, 14000);
          return;
        }
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(subscriptionStatus)) {
          showError(new Error(`Realtime 頻道狀態：${subscriptionStatus}`));
        }
      });
  }

  function prepareOnlineHud() {
    document.body.classList.remove('multiplayer-pending');
    document.body.classList.add('multiplayer-running');
    hud?.classList.add('multiplayer-hud');
    if (comboLabel) comboLabel.textContent = '真人對戰';
    if (bestComboHud) bestComboHud.textContent = 'Fast Sync';
    if (streakHud) streakHud.textContent = role === 'host' ? '主場' : '客場';
    if (pauseButton) {
      pauseButton.textContent = '✕';
      pauseButton.setAttribute('aria-label', '離開真人對戰');
    }
    updateOnlineHud();
  }

  function resetOnlineHud() {
    document.body.classList.remove('multiplayer-pending', 'multiplayer-running');
    hud?.classList.remove('multiplayer-hud');
    if (pauseButton) {
      pauseButton.textContent = 'Ⅱ';
      pauseButton.setAttribute('aria-label', '暫停');
    }
  }

  function updateOnlineHud() {
    const myScore = role === 'host' ? game.hostScore : game.guestScore;
    const rivalScore = role === 'host' ? game.guestScore : game.hostScore;
    if (playerScore) playerScore.textContent = `${playerName} ${myScore}`;
    if (aiScore) aiScore.textContent = `${opponentName} ${rivalScore}`;
    if (speedLabel) speedLabel.textContent = latency > 0 ? `FAST ${latency}ms` : 'FAST';
  }

  function resetMatch(seed) {
    game.hostScore = 0;
    game.guestScore = 0;
    game.pause = 0.42;
    game.sequence = 0;
    Object.assign(localPaddle, { x: 500, y: 1430, targetX: 500, targetY: 1430 });
    Object.assign(remotePaddle, { x: 500, y: 270, targetX: 500, targetY: 270 });
    const vx = (seed % 361) - 180;
    const vy = seed % 2 ? 500 : -500;
    Object.assign(puck, { x: 500, y: 850, vx, vy });
    Object.assign(predictedPuck, { x: 500, y: 850, vx: -vx, vy: -vy });
    Object.assign(authoritative, { x: 500, y: 850, vx: -vx, vy: -vy, receivedAt: performance.now() });
    Object.assign(display, { opponentX: 500, opponentY: 270 });
    lastInputX = lastInputY = NaN;
    lastStateSequence = 0;
    updateOnlineHud();
  }

  async function beginMatch(offer) {
    if (started || !offer || !['connecting', 'countdown'].includes(mode)) return;
    started = true;
    mode = 'countdown';
    clearInterval(helloTimer);
    clearInterval(offerTimer);
    clearTimeout(connectTimeout);
    helloTimer = offerTimer = connectTimeout = null;
    try { await client.rpc('start_quick_match', { p_match_id: matchId }); } catch (_) {}
    prepareOnlineHud();
    resetMatch(Number(offer.seed) || Date.now());
    setupCanvas(true);
    countdown?.classList.add('active');
    matchScreen?.classList.remove('active');
    const startAt = Math.max(Date.now() + 180, Number(offer.startAt) || Date.now() + 1400);
    while (mode === 'countdown' && Date.now() < startAt) {
      const remaining = startAt - Date.now();
      if (countdownText) countdownText.textContent = remaining > 1150 ? '3' : remaining > 580 ? '2' : '1';
      draw();
      await sleep(60);
    }
    if (mode !== 'countdown') return;
    if (countdownText) countdownText.textContent = 'GO';
    draw();
    await sleep(180);
    if (mode !== 'countdown') return;
    countdown?.classList.remove('active');
    mode = 'playing';
    lastFrame = performance.now();
    lastRemoteMessage = performance.now();
    animationFrame = requestAnimationFrame(gameLoop);
  }

  function moveObject(object, targetX, targetY, maxSpeed, dt) {
    const dx = targetX - object.x;
    const dy = targetY - object.y;
    const distance = Math.hypot(dx, dy);
    if (!distance) return;
    const travel = Math.min(distance, maxSpeed * dt);
    object.x += (dx / distance) * travel;
    object.y += (dy / distance) * travel;
  }

  function collidePaddle(ball, paddle, maxSpeed = 1100) {
    const dx = ball.x - paddle.x;
    const dy = ball.y - paddle.y;
    const distance = Math.hypot(dx, dy);
    const minimum = FIELD.puckRadius + FIELD.paddleRadius * 0.9;
    if (!distance || distance >= minimum) return false;
    const nx = dx / distance;
    const ny = dy / distance;
    ball.x = paddle.x + nx * minimum;
    ball.y = paddle.y + ny * minimum;
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= 1.86 * dot * nx;
      ball.vy -= 1.86 * dot * ny;
    }
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > maxSpeed) {
      ball.vx *= maxSpeed / speed;
      ball.vy *= maxSpeed / speed;
    }
    return true;
  }

  function serve(direction) {
    puck.x = 500;
    puck.y = 850;
    puck.vx = (Math.random() - 0.5) * 210;
    puck.vy = direction * 490;
    game.pause = 0.8;
  }

  function simulateBall(ball, dt, local, remote, allowScore) {
    const currentSpeed = Math.hypot(ball.vx, ball.vy);
    const steps = clamp(Math.ceil((currentSpeed * dt) / 13), 1, 8);
    const step = dt / steps;
    let scored = 0;
    for (let index = 0; index < steps; index += 1) {
      ball.x += ball.vx * step;
      ball.y += ball.vy * step;
      if (ball.x - FIELD.puckRadius < FIELD.left) {
        ball.x = FIELD.left + FIELD.puckRadius;
        ball.vx = Math.abs(ball.vx);
      }
      if (ball.x + FIELD.puckRadius > FIELD.right) {
        ball.x = FIELD.right - FIELD.puckRadius;
        ball.vx = -Math.abs(ball.vx);
      }
      const insideGoal = ball.x > FIELD.goalLeft + FIELD.puckRadius * 0.3 && ball.x < FIELD.goalRight - FIELD.puckRadius * 0.3;
      if (ball.y - FIELD.puckRadius < FIELD.top) {
        if (insideGoal && ball.y < FIELD.top - 52) {
          if (allowScore) scored = 1;
          else ball.y = FIELD.top - 52;
          break;
        }
        if (!insideGoal) {
          ball.y = FIELD.top + FIELD.puckRadius;
          ball.vy = Math.abs(ball.vy);
        }
      }
      if (ball.y + FIELD.puckRadius > FIELD.bottom) {
        if (insideGoal && ball.y > FIELD.bottom + 52) {
          if (allowScore) scored = -1;
          else ball.y = FIELD.bottom + 52;
          break;
        }
        if (!insideGoal) {
          ball.y = FIELD.bottom - FIELD.puckRadius;
          ball.vy = -Math.abs(ball.vy);
        }
      }
      collidePaddle(ball, local);
      collidePaddle(ball, remote);
    }
    ball.vx *= Math.pow(0.99835, dt * 60);
    ball.vy *= Math.pow(0.99835, dt * 60);
    const adjusted = Math.hypot(ball.vx, ball.vy);
    if (adjusted < 285) {
      ball.vx *= 285 / Math.max(1, adjusted);
      ball.vy *= 285 / Math.max(1, adjusted);
    }
    if (Math.abs(ball.vy) < 90) ball.vy = (ball.vy < 0 ? -1 : 1) * 90;
    return scored;
  }

  function simulateHost(dt) {
    moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2300, dt);
    moveObject(remotePaddle, remotePaddle.targetX, remotePaddle.targetY, 1950, dt);
    localPaddle.x = clamp(localPaddle.x, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);
    localPaddle.y = clamp(localPaddle.y, FIELD.middle + FIELD.paddleRadius + 10, FIELD.bottom - FIELD.paddleRadius);
    remotePaddle.x = clamp(remotePaddle.x, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);
    remotePaddle.y = clamp(remotePaddle.y, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 10);
    if (game.pause > 0) {
      game.pause -= dt;
      return;
    }
    const scored = simulateBall(puck, dt, localPaddle, remotePaddle, true);
    if (scored === 1) {
      game.hostScore += 1;
      serve(-1);
    } else if (scored === -1) {
      game.guestScore += 1;
      serve(1);
    }
    if (game.hostScore >= 7 || game.guestScore >= 7) {
      const winningRole = game.hostScore > game.guestScore ? 'host' : 'guest';
      sendState(true, winningRole);
      client.rpc('finish_quick_match', {
        p_match_id: matchId,
        p_host_score: game.hostScore,
        p_guest_score: game.guestScore
      }).catch(() => {});
      finishMatch(winningRole, 'score');
    }
  }

  function sendState(isEnded = false, winningRole = null) {
    game.sequence += 1;
    sendGame([
      's', game.sequence, Date.now(),
      round1(puck.x), round1(puck.y), round1(puck.vx), round1(puck.vy),
      round1(localPaddle.x), round1(localPaddle.y),
      round1(remotePaddle.x), round1(remotePaddle.y),
      game.hostScore, game.guestScore,
      isEnded ? 1 : 0, winningRole
    ]);
  }

  function receiveAuthoritativeState(packet) {
    const sequence = Number(packet[1]) || 0;
    if (sequence <= lastStateSequence) return;
    lastStateSequence = sequence;
    const now = performance.now();
    const sentAt = Number(packet[2]) || Date.now();
    const age = clamp(Date.now() - sentAt, 0, NET.maxPrediction) / 1000;
    authoritative.x = FIELD.width - Number(packet[3] || 500);
    authoritative.y = FIELD.height - Number(packet[4] || 850);
    authoritative.vx = -Number(packet[5] || 0);
    authoritative.vy = -Number(packet[6] || 0);
    authoritative.receivedAt = now;
    const targetX = authoritative.x + authoritative.vx * age;
    const targetY = authoritative.y + authoritative.vy * age;
    const distance = Math.hypot(targetX - predictedPuck.x, targetY - predictedPuck.y);
    if (distance > 210) {
      predictedPuck.x = targetX;
      predictedPuck.y = targetY;
      predictedPuck.vx = authoritative.vx;
      predictedPuck.vy = authoritative.vy;
    }
    display.opponentX = FIELD.width - Number(packet[7] || 500);
    display.opponentY = FIELD.height - Number(packet[8] || 1430);
    game.hostScore = Number(packet[11] || 0);
    game.guestScore = Number(packet[12] || 0);
    updateOnlineHud();
    if (packet[13]) finishMatch(packet[14], 'remote');
  }

  function simulateGuest(dt) {
    moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2350, dt);
    localPaddle.x = clamp(localPaddle.x, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);
    localPaddle.y = clamp(localPaddle.y, FIELD.middle + FIELD.paddleRadius + 10, FIELD.bottom - FIELD.paddleRadius);

    simulateBall(predictedPuck, dt, localPaddle, display, false);
    const age = clamp(performance.now() - authoritative.receivedAt, 0, NET.maxPrediction) / 1000;
    const targetX = authoritative.x + authoritative.vx * age;
    const targetY = authoritative.y + authoritative.vy * age;
    const amount = 1 - Math.exp(-13 * dt);
    predictedPuck.x = lerp(predictedPuck.x, targetX, amount);
    predictedPuck.y = lerp(predictedPuck.y, targetY, amount);
    predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, amount * 0.65);
    predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, amount * 0.65);
  }

  function maybeSendInput(now) {
    const x = FIELD.width - localPaddle.x;
    const y = FIELD.height - localPaddle.y;
    const moved = !Number.isFinite(lastInputX) || Math.hypot(x - lastInputX, y - lastInputY) > 2;
    const keepAlive = now - lastInputKeepAlive >= NET.inputKeepAlive;
    if (now - lastInputSent < NET.inputInterval || (!moved && !keepAlive)) return;
    lastInputSent = now;
    lastInputKeepAlive = now;
    lastInputX = x;
    lastInputY = y;
    sendGame(['i', round1(x), round1(y)]);
  }

  function gameLoop(now) {
    if (mode !== 'playing') return;
    const dt = Math.min(0.033, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    if (role === 'host') {
      simulateHost(dt);
      if (now - lastStateSent >= NET.stateInterval) {
        lastStateSent = now;
        sendState();
      }
    } else {
      simulateGuest(dt);
      maybeSendInput(now);
    }
    if (now - lastPingSent >= 2300) {
      lastPingSent = now;
      sendControl({ type: 'ping', id: game.sequence, sentAt: Date.now() });
    }
    if (lastRemoteMessage && now - lastRemoteMessage > NET.disconnectTimeout) {
      finishMatch(role, 'timeout');
      return;
    }
    draw();
    animationFrame = requestAnimationFrame(gameLoop);
  }

  function viewportSize() {
    const viewport = window.visualViewport;
    return {
      width: Math.max(280, Math.round(viewport?.width || document.documentElement.clientWidth || innerWidth)),
      height: Math.max(480, Math.round(viewport?.height || document.documentElement.clientHeight || innerHeight))
    };
  }

  function setupCanvas(force = false) {
    const { width, height } = viewportSize();
    const scale = Math.min(width / FIELD.width, height / FIELD.height);
    const cssWidth = Math.round(FIELD.width * scale);
    const cssHeight = Math.round(FIELD.height * scale);
    if (!force && Math.abs(cssWidth - render.cssWidth) < 2 && Math.abs(cssHeight - render.cssHeight) < 2) return;
    render.scale = scale;
    render.cssWidth = cssWidth;
    render.cssHeight = cssHeight;
    render.left = Math.round((width - cssWidth) / 2);
    render.top = Math.round((height - cssHeight) / 2);
    const mobile = matchMedia?.('(pointer: coarse)')?.matches || width < 700;
    const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.1 : 1.45);
    canvas.width = Math.max(1, Math.round(FIELD.width * dpr));
    canvas.height = Math.max(1, Math.round(FIELD.height * dpr));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.style.left = `${render.left}px`;
    canvas.style.top = `${render.top}px`;
    canvas.style.right = 'auto';
    canvas.style.bottom = 'auto';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render.staticLayer = buildStaticLayer();
    render.turtleSprite = buildPaddleSprite('turtle');
    render.shellSprite = buildPaddleSprite('shell');
    render.puckSprite = buildPuckSprite();
  }

  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!['countdown', 'playing'].includes(mode)) return;
      setupCanvas();
      draw();
    }, 180);
  }

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    if (context.roundRect) context.roundRect(x, y, width, height, radius);
    else {
      const r = Math.min(radius, width / 2, height / 2);
      context.moveTo(x + r, y);
      context.arcTo(x + width, y, x + width, y + height, r);
      context.arcTo(x + width, y + height, x, y + height, r);
      context.arcTo(x, y + height, x, y, r);
      context.arcTo(x, y, x + width, y, r);
      context.closePath();
    }
  }

  function buildStaticLayer() {
    const layer = document.createElement('canvas');
    layer.width = FIELD.width;
    layer.height = FIELD.height;
    const g = layer.getContext('2d', { alpha: false });
    const background = g.createLinearGradient(0, 0, 0, FIELD.height);
    background.addColorStop(0, '#86dcf4');
    background.addColorStop(1, '#e4fbff');
    g.fillStyle = background;
    g.fillRect(0, 0, FIELD.width, FIELD.height);
    g.fillStyle = 'rgba(74,190,170,.35)';
    g.strokeStyle = '#36586b';
    g.lineWidth = 8;
    roundedRect(g, FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top, 42);
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.88)';
    g.lineWidth = 6;
    g.setLineDash([24, 24]);
    g.beginPath();
    g.moveTo(FIELD.left + 28, FIELD.middle);
    g.lineTo(FIELD.right - 28, FIELD.middle);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.arc(500, FIELD.middle, 106, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 18;
    g.strokeStyle = '#f19778';
    g.beginPath();
    g.moveTo(FIELD.goalLeft, FIELD.top);
    g.lineTo(FIELD.goalRight, FIELD.top);
    g.stroke();
    g.strokeStyle = '#5bc696';
    g.beginPath();
    g.moveTo(FIELD.goalLeft, FIELD.bottom);
    g.lineTo(FIELD.goalRight, FIELD.bottom);
    g.stroke();
    return layer;
  }

  function buildPaddleSprite(type) {
    const size = 210;
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = size;
    const g = sprite.getContext('2d');
    const r = 82;
    g.translate(size / 2, size / 2);
    g.fillStyle = 'rgba(35,62,78,.2)';
    g.beginPath();
    g.ellipse(6, 10, r * .98, r * .84, 0, 0, Math.PI * 2);
    g.fill();
    const gradient = g.createRadialGradient(-r * .28, -r * .3, 4, 0, 0, r);
    if (type === 'turtle') {
      gradient.addColorStop(0, '#eaf7b5');
      gradient.addColorStop(.45, '#60c795');
      gradient.addColorStop(1, '#34785f');
    } else {
      gradient.addColorStop(0, '#fff1cc');
      gradient.addColorStop(.46, '#f6ab83');
      gradient.addColorStop(1, '#c96c69');
    }
    g.fillStyle = gradient;
    g.strokeStyle = '#36586b';
    g.lineWidth = 8;
    g.beginPath();
    g.ellipse(0, 0, r * .98, r * .84, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(54,88,107,.58)';
    g.lineWidth = 5;
    g.lineCap = 'round';
    if (type === 'turtle') {
      g.beginPath();
      g.moveTo(-43, -31); g.lineTo(-16, -5); g.lineTo(-31, 30);
      g.moveTo(43, -31); g.lineTo(16, -5); g.lineTo(31, 30);
      g.moveTo(-16, -5); g.lineTo(0, -38); g.lineTo(16, -5);
      g.moveTo(-16, -5); g.lineTo(0, 32); g.lineTo(16, -5);
      g.stroke();
    } else {
      g.beginPath();
      for (let angle = 0; angle < Math.PI * 5.5; angle += .14) {
        const radius = 5 + (angle / (Math.PI * 5.5)) * 47;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * .84;
        if (angle === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    return sprite;
  }

  function buildPuckSprite() {
    const size = 90;
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = size;
    const g = sprite.getContext('2d');
    const gradient = g.createRadialGradient(34, 31, 2, 45, 45, 30);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(.45, '#fff5bd');
    gradient.addColorStop(1, '#f4c94e');
    g.fillStyle = 'rgba(35,62,78,.17)';
    g.beginPath(); g.ellipse(48, 51, 29, 23, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = gradient;
    g.strokeStyle = '#36586b';
    g.lineWidth = 5;
    g.beginPath(); g.arc(45, 45, 30, 0, Math.PI * 2); g.fill(); g.stroke();
    return sprite;
  }

  function drawSprite(sprite, x, y, width, height = width) {
    ctx.drawImage(sprite, x - width / 2, y - height / 2, width, height);
  }

  function draw() {
    if (!render.staticLayer) setupCanvas(true);
    ctx.drawImage(render.staticLayer, 0, 0);
    const ball = role === 'host' ? puck : predictedPuck;
    drawSprite(render.puckSprite, ball.x, ball.y, 90, 90);
    drawSprite(render.shellSprite, role === 'host' ? remotePaddle.x : display.opponentX, role === 'host' ? remotePaddle.y : display.opponentY, 210, 210);
    drawSprite(render.turtleSprite, localPaddle.x, localPaddle.y, 210, 210);
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * FIELD.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * FIELD.height
    };
  }

  canvas.addEventListener('pointerdown', event => {
    if (mode !== 'playing' || pointerId !== null) return;
    const point = pointerPosition(event);
    if (point.y < FIELD.middle - 35) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    localPaddle.targetX = point.x;
    localPaddle.targetY = point.y - 54;
  }, { passive: true });

  canvas.addEventListener('pointermove', event => {
    if (mode !== 'playing' || pointerId !== event.pointerId) return;
    const samples = event.getCoalescedEvents?.() || [event];
    const point = pointerPosition(samples[samples.length - 1]);
    localPaddle.targetX = point.x;
    localPaddle.targetY = point.y - 54;
  }, { passive: true });

  const releasePointer = event => {
    if (pointerId === event.pointerId) pointerId = null;
  };
  canvas.addEventListener('pointerup', releasePointer, { passive: true });
  canvas.addEventListener('pointercancel', releasePointer, { passive: true });
  canvas.addEventListener('lostpointercapture', releasePointer, { passive: true });

  async function finishMatch(winningRole, reason) {
    if (ended) return;
    ended = true;
    mode = 'finished';
    clearTimers();
    cancelAnimationFrame(animationFrame);
    pointerId = null;
    const won = winningRole === role;
    const myScore = role === 'host' ? game.hostScore : game.guestScore;
    const rivalScore = role === 'host' ? game.guestScore : game.hostScore;
    if (reason === 'timeout' || reason === 'opponent-left') safeCancelServerMatch();
    if (winnerText) {
      winnerText.textContent = reason === 'timeout' || reason === 'opponent-left'
        ? '對手已離線'
        : won ? '真人對戰勝利！' : '真人對戰結束';
    }
    if (finalScore) {
      const suffix = reason === 'timeout' ? '｜連線逾時' : reason === 'opponent-left' ? '｜對手離開' : '';
      finalScore.textContent = `${playerName} ${myScore}：${rivalScore} ${opponentName}${suffix}`;
    }
    if (restartButton) restartButton.textContent = '🌐 再次配對';
    if (homeButton) homeButton.textContent = '⌂ 回主選單';
    window.BubbleRanking?.recordGame?.(playerName, won);
    window.BubbleRanking?.sync?.();
    gameOver?.classList.add('active');
    matchScreen?.classList.remove('active');
    countdown?.classList.remove('active');
    resetOnlineHud();
  }

  async function leave(reason = 'user') {
    const token = ++attemptToken;
    const wasActive = !['idle', 'error'].includes(mode);
    if (wasActive && channel && subscribed) sendControl({ type: 'leave', reason });
    clearTimers();
    cancelAnimationFrame(animationFrame);
    pointerId = null;
    if (wasActive && client && user) safeCancelServerMatch();
    if (channel && client) {
      try { await client.removeChannel(channel); } catch (_) {}
    }
    if (token !== attemptToken) return;
    channel = null;
    subscribed = false;
    role = null;
    matchId = null;
    peerSeen = false;
    started = false;
    ended = false;
    startOffer = null;
    mode = 'idle';
    resetOnlineHud();
    restoreMenu();
  }

  quickButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    startQueue();
  });

  cancelButton?.addEventListener('click', event => {
    event.preventDefault();
    leave('cancel');
  });

  fallbackButton?.addEventListener('click', async event => {
    event.preventDefault();
    const action = fallbackButton.dataset.action;
    if (action === 'retry') {
      mode = 'error';
      startQueue();
      return;
    }
    if (action === 'ai') {
      await leave('ai');
      $('start-button')?.click();
    }
  });

  pauseButton?.addEventListener('click', event => {
    if (['connecting', 'countdown', 'playing'].includes(mode)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      leave('exit');
    }
  }, true);

  restartButton?.addEventListener('click', event => {
    if (mode === 'finished') {
      event.preventDefault();
      event.stopImmediatePropagation();
      gameOver?.classList.remove('active');
      mode = 'idle';
      startQueue();
    }
  }, true);

  homeButton?.addEventListener('click', event => {
    if (mode === 'finished') {
      event.preventDefault();
      event.stopImmediatePropagation();
      leave('home');
    }
  }, true);

  addEventListener('resize', scheduleResize);
  addEventListener('orientationchange', () => setTimeout(scheduleResize, 140));
  window.visualViewport?.addEventListener('resize', scheduleResize);

  window.BubbleMultiplayer = {
    start: startQueue,
    leave,
    isActive: () => mode !== 'idle',
    transport: () => 'realtime-fast'
  };

  if (!client) {
    quickButton.disabled = true;
    quickButton.textContent = '🌐 雲端尚未連線';
  }
})();