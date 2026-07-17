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
            storageKey: 'bubble-island-auth-v407'
          },
          realtime: { params: { eventsPerSecond: 20 } }
        })
      : null
  );

  const FIELD = {
    width: 1000,
    height: 1600,
    left: 45,
    right: 955,
    top: 150,
    bottom: 1550,
    middle: 850,
    goalLeft: 335,
    goalRight: 665,
    paddleRadius: 80,
    puckRadius: 30
  };

  const NETWORK = {
    stateInterval: 72,
    inputInterval: 50,
    inputKeepAlive: 240,
    snapshotDelay: 110,
    maxExtrapolation: 120
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

  const localPaddle = { x: 500, y: 1430, targetX: 500, targetY: 1430 };
  const remotePaddle = { x: 500, y: 270, targetX: 500, targetY: 270 };
  const puck = { x: 500, y: 850, vx: 120, vy: -520 };
  const display = { puckX: 500, puckY: 850, opponentX: 500, opponentY: 270 };
  const game = { hostScore: 0, guestScore: 0, pause: 0, sequence: 0 };
  const snapshots = [];

  const layout = {
    width: 0,
    height: 0,
    dpr: 1,
    scale: 1,
    offsetX: 0,
    offsetY: 0
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
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
    const remainder = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  function describeError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '未知錯誤');
    const status = Number(error?.status || 0);
    if (code === 'anonymous_provider_disabled') return '匿名登入尚未開啟。';
    if (status === 429 || code.includes('rate_limit')) return '匿名登入次數暫時超過限制（429），請稍後再試。';
    if (status === 401 || status === 403 || code.includes('api_key')) return `Supabase 權限被拒絕（${code || status}）。`;
    if (code === 'pgrst202' || message.includes('join_quick_match')) return '多人配對資料庫尚未安裝或尚未更新。';
    return `連線失敗（${code || status || 'unknown'}）：${message}`;
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
    if (!client) throw new Error('NO_CLOUD_CONFIG');
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
    if (!signInResult.data?.user) throw new Error('ANONYMOUS_USER_MISSING');
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
    peerSeen = false;
    started = false;
    startOffer = null;
    latency = 0;
    snapshots.length = 0;
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
    setStatus(`找到對手：${opponentName}，正在建立即時連線…`);
    if (queueOnline) queueOnline.textContent = '連線狀態：握手中';
    await connectRealtime(token);
  }

  function send(event, payload = {}) {
    if (!channel) return Promise.resolve('no-channel');
    return channel.send({ type: 'broadcast', event, payload });
  }

  function sendHello() {
    return send('hello', { role, name: playerName, sentAt: Date.now() });
  }

  function beginHostOffer() {
    if (role !== 'host' || !peerSeen || started || !channel) return;
    if (!startOffer) startOffer = { seed: Date.now(), startAt: Date.now() + 2400 };
    const broadcastOffer = () => send('start-offer', startOffer);
    broadcastOffer();
    clearInterval(offerTimer);
    offerTimer = setInterval(broadcastOffer, 500);
  }

  function pushSnapshot(payload) {
    const receivedAt = performance.now();
    const snapshot = {
      receivedAt,
      sequence: Number(payload.q || 0),
      puckX: FIELD.width - Number(payload.px || 500),
      puckY: FIELD.height - Number(payload.py || 850),
      puckVX: -Number(payload.vx || 0),
      puckVY: -Number(payload.vy || 0),
      opponentX: FIELD.width - Number(payload.hx || 500),
      opponentY: FIELD.height - Number(payload.hy || 1430),
      hostScore: Number(payload.hs || 0),
      guestScore: Number(payload.gs || 0),
      ended: Boolean(payload.e),
      winner: payload.w || null
    };
    snapshots.push(snapshot);
    if (snapshots.length > 12) snapshots.splice(0, snapshots.length - 12);
    game.hostScore = snapshot.hostScore;
    game.guestScore = snapshot.guestScore;
    updateOnlineHud();
    if (snapshot.ended) finishMatch(snapshot.winner, 'remote');
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
      .on('broadcast', { event: 'hello' }, ({ payload }) => {
        if (!payload || payload.role === role) return;
        lastRemoteMessage = performance.now();
        peerSeen = true;
        opponentName = payload.name || opponentName;
        setStatus(`已連上 ${opponentName}，同步開局中…`);
        if (queueOnline) queueOnline.textContent = '連線狀態：已找到雙方';
        sendHello();
        beginHostOffer();
      })
      .on('broadcast', { event: 'start-offer' }, ({ payload }) => {
        if (role !== 'guest' || !payload) return;
        lastRemoteMessage = performance.now();
        send('start-ack', { startAt: payload.startAt });
        beginMatch(payload);
      })
      .on('broadcast', { event: 'start-ack' }, ({ payload }) => {
        if (role !== 'host' || !startOffer || !payload) return;
        lastRemoteMessage = performance.now();
        clearInterval(offerTimer);
        offerTimer = null;
        beginMatch(startOffer);
      })
      .on('broadcast', { event: 'input' }, ({ payload }) => {
        if (role !== 'host' || !payload) return;
        lastRemoteMessage = performance.now();
        remotePaddle.targetX = clamp(Number(payload.x) || 500, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);
        remotePaddle.targetY = clamp(Number(payload.y) || 270, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 12);
      })
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        if (role !== 'guest' || !payload) return;
        lastRemoteMessage = performance.now();
        pushSnapshot(payload);
      })
      .on('broadcast', { event: 'ping' }, ({ payload }) => {
        lastRemoteMessage = performance.now();
        send('pong', { sentAt: payload?.sentAt || Date.now() });
      })
      .on('broadcast', { event: 'pong' }, ({ payload }) => {
        lastRemoteMessage = performance.now();
        latency = Math.max(1, Math.round((Date.now() - Number(payload?.sentAt || Date.now())) / 2));
        updateOnlineHud();
      })
      .on('broadcast', { event: 'leave' }, () => {
        lastRemoteMessage = performance.now();
        finishMatch(role, 'opponent-left');
      })
      .subscribe(subscriptionStatus => {
        if (token !== attemptToken) return;
        if (subscriptionStatus === 'SUBSCRIBED') {
          lastRemoteMessage = performance.now();
          setStatus(`已進入即時頻道，等待 ${opponentName} 回應…`);
          if (queueOnline) queueOnline.textContent = '連線狀態：等待對手';
          sendHello();
          clearInterval(helloTimer);
          helloTimer = setInterval(() => {
            if (mode !== 'connecting') return clearInterval(helloTimer);
            sendHello();
          }, 850);
          clearTimeout(connectTimeout);
          connectTimeout = setTimeout(() => {
            if (mode !== 'connecting' || token !== attemptToken) return;
            showError(new Error('對手沒有完成即時連線，已取消這次配對。'));
            safeCancelServerMatch();
            if (channel) client.removeChannel(channel).catch(() => {});
            channel = null;
          }, 12000);
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
    if (bestComboHud) bestComboHud.textContent = '平滑同步';
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
    if (speedLabel) speedLabel.textContent = latency > 0 ? `ONLINE ${latency}ms` : 'ONLINE';
  }

  function resetMatch(seed) {
    game.hostScore = 0;
    game.guestScore = 0;
    game.pause = 0.45;
    game.sequence = 0;
    Object.assign(localPaddle, { x: 500, y: 1430, targetX: 500, targetY: 1430 });
    Object.assign(remotePaddle, { x: 500, y: 270, targetX: 500, targetY: 270 });
    Object.assign(puck, { x: 500, y: 850, vx: (seed % 401) - 200, vy: seed % 2 ? 520 : -520 });
    Object.assign(display, { puckX: 500, puckY: 850, opponentX: 500, opponentY: 270 });
    snapshots.length = 0;
    lastInputX = lastInputY = NaN;
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
    resizeCanvas(true);
    countdown?.classList.add('active');
    matchScreen?.classList.remove('active');
    const startAt = Math.max(Date.now() + 250, Number(offer.startAt) || Date.now() + 1600);
    while (mode === 'countdown' && Date.now() < startAt) {
      const remaining = startAt - Date.now();
      if (countdownText) countdownText.textContent = remaining > 1400 ? '3' : remaining > 700 ? '2' : '1';
      draw();
      await sleep(70);
    }
    if (mode !== 'countdown') return;
    if (countdownText) countdownText.textContent = 'GO';
    draw();
    await sleep(250);
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

  function collidePaddle(paddle) {
    const dx = puck.x - paddle.x;
    const dy = puck.y - paddle.y;
    const distance = Math.hypot(dx, dy);
    const minimum = FIELD.puckRadius + FIELD.paddleRadius * 0.9;
    if (!distance || distance >= minimum) return;
    const nx = dx / distance;
    const ny = dy / distance;
    puck.x = paddle.x + nx * minimum;
    puck.y = paddle.y + ny * minimum;
    const dot = puck.vx * nx + puck.vy * ny;
    if (dot < 0) {
      puck.vx -= 1.88 * dot * nx;
      puck.vy -= 1.88 * dot * ny;
    }
    const currentSpeed = Math.hypot(puck.vx, puck.vy);
    if (currentSpeed > 1120) {
      puck.vx *= 1120 / currentSpeed;
      puck.vy *= 1120 / currentSpeed;
    }
  }

  function serve(direction) {
    puck.x = 500;
    puck.y = 850;
    puck.vx = (Math.random() - 0.5) * 220;
    puck.vy = direction * 500;
    game.pause = 0.85;
  }

  function simulateHost(dt) {
    moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2000, dt);
    moveObject(remotePaddle, remotePaddle.targetX, remotePaddle.targetY, 1750, dt);
    localPaddle.x = clamp(localPaddle.x, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);
    localPaddle.y = clamp(localPaddle.y, FIELD.middle + FIELD.paddleRadius + 12, FIELD.bottom - FIELD.paddleRadius);
    remotePaddle.x = clamp(remotePaddle.x, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);
    remotePaddle.y = clamp(remotePaddle.y, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 12);
    if (game.pause > 0) {
      game.pause -= dt;
      return;
    }
    const currentSpeed = Math.hypot(puck.vx, puck.vy);
    const steps = clamp(Math.ceil((currentSpeed * dt) / 14), 1, 8);
    const step = dt / steps;
    for (let index = 0; index < steps; index += 1) {
      puck.x += puck.vx * step;
      puck.y += puck.vy * step;
      if (puck.x - FIELD.puckRadius < FIELD.left) {
        puck.x = FIELD.left + FIELD.puckRadius;
        puck.vx = Math.abs(puck.vx);
      }
      if (puck.x + FIELD.puckRadius > FIELD.right) {
        puck.x = FIELD.right - FIELD.puckRadius;
        puck.vx = -Math.abs(puck.vx);
      }
      const insideGoal = puck.x > FIELD.goalLeft + FIELD.puckRadius * 0.25 && puck.x < FIELD.goalRight - FIELD.puckRadius * 0.25;
      if (puck.y - FIELD.puckRadius < FIELD.top) {
        if (insideGoal && puck.y + FIELD.puckRadius < FIELD.top - 5) {
          game.hostScore += 1;
          serve(-1);
          break;
        }
        if (!insideGoal) {
          puck.y = FIELD.top + FIELD.puckRadius;
          puck.vy = Math.abs(puck.vy);
        }
      }
      if (puck.y + FIELD.puckRadius > FIELD.bottom) {
        if (insideGoal && puck.y - FIELD.puckRadius > FIELD.bottom + 5) {
          game.guestScore += 1;
          serve(1);
          break;
        }
        if (!insideGoal) {
          puck.y = FIELD.bottom - FIELD.puckRadius;
          puck.vy = -Math.abs(puck.vy);
        }
      }
      collidePaddle(localPaddle);
      collidePaddle(remotePaddle);
    }
    puck.vx *= Math.pow(0.99825, dt * 60);
    puck.vy *= Math.pow(0.99825, dt * 60);
    const adjustedSpeed = Math.hypot(puck.vx, puck.vy);
    if (adjustedSpeed < 290 && game.pause <= 0) {
      puck.vx *= 290 / Math.max(1, adjustedSpeed);
      puck.vy *= 290 / Math.max(1, adjustedSpeed);
    }
    if (Math.abs(puck.vy) < 95) puck.vy = (puck.vy < 0 ? -1 : 1) * 95;
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
    send('state', {
      q: game.sequence,
      t: Date.now(),
      px: round1(puck.x),
      py: round1(puck.y),
      vx: round1(puck.vx),
      vy: round1(puck.vy),
      hx: round1(localPaddle.x),
      hy: round1(localPaddle.y),
      gx: round1(remotePaddle.x),
      gy: round1(remotePaddle.y),
      hs: game.hostScore,
      gs: game.guestScore,
      e: isEnded ? 1 : 0,
      w: winningRole
    });
  }

  function sampleGuest(now) {
    if (!snapshots.length) return null;
    const target = now - NETWORK.snapshotDelay;
    while (snapshots.length >= 3 && snapshots[1].receivedAt <= target) snapshots.shift();
    const first = snapshots[0];
    const second = snapshots[1];
    if (second && first.receivedAt <= target && second.receivedAt >= target) {
      const span = Math.max(1, second.receivedAt - first.receivedAt);
      const amount = clamp((target - first.receivedAt) / span, 0, 1);
      return {
        puckX: lerp(first.puckX, second.puckX, amount),
        puckY: lerp(first.puckY, second.puckY, amount),
        opponentX: lerp(first.opponentX, second.opponentX, amount),
        opponentY: lerp(first.opponentY, second.opponentY, amount)
      };
    }
    const latest = snapshots[snapshots.length - 1];
    const extra = clamp(now - latest.receivedAt, 0, NETWORK.maxExtrapolation) / 1000;
    return {
      puckX: clamp(latest.puckX + latest.puckVX * extra, FIELD.left + FIELD.puckRadius, FIELD.right - FIELD.puckRadius),
      puckY: clamp(latest.puckY + latest.puckVY * extra, FIELD.top - 70, FIELD.bottom + 70),
      opponentX: latest.opponentX,
      opponentY: latest.opponentY
    };
  }

  function updateGuest(dt, now) {
    const sample = sampleGuest(now);
    if (sample) {
      const puckSmooth = 1 - Math.exp(-24 * dt);
      const paddleSmooth = 1 - Math.exp(-18 * dt);
      const puckDistance = Math.hypot(sample.puckX - display.puckX, sample.puckY - display.puckY);
      if (puckDistance > 260) {
        display.puckX = sample.puckX;
        display.puckY = sample.puckY;
      } else {
        display.puckX = lerp(display.puckX, sample.puckX, puckSmooth);
        display.puckY = lerp(display.puckY, sample.puckY, puckSmooth);
      }
      display.opponentX = lerp(display.opponentX, sample.opponentX, paddleSmooth);
      display.opponentY = lerp(display.opponentY, sample.opponentY, paddleSmooth);
    }
    moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2100, dt);
    localPaddle.x = clamp(localPaddle.x, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);
    localPaddle.y = clamp(localPaddle.y, FIELD.middle + FIELD.paddleRadius + 12, FIELD.bottom - FIELD.paddleRadius);
  }

  function maybeSendGuestInput(now) {
    const transformedX = FIELD.width - localPaddle.x;
    const transformedY = FIELD.height - localPaddle.y;
    const moved = !Number.isFinite(lastInputX) || Math.hypot(transformedX - lastInputX, transformedY - lastInputY) > 2.5;
    const keepAlive = now - lastInputKeepAlive >= NETWORK.inputKeepAlive;
    if (now - lastInputSent < NETWORK.inputInterval || (!moved && !keepAlive)) return;
    lastInputSent = now;
    lastInputKeepAlive = now;
    lastInputX = transformedX;
    lastInputY = transformedY;
    send('input', { x: round1(transformedX), y: round1(transformedY) });
  }

  function gameLoop(now) {
    if (mode !== 'playing') return;
    const dt = Math.min(0.033, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    if (role === 'host') {
      simulateHost(dt);
      if (now - lastStateSent >= NETWORK.stateInterval) {
        lastStateSent = now;
        sendState();
      }
    } else {
      updateGuest(dt, now);
      maybeSendGuestInput(now);
    }
    if (now - lastPingSent >= 2600) {
      lastPingSent = now;
      send('ping', { sentAt: Date.now() });
    }
    if (lastRemoteMessage && now - lastRemoteMessage > 9500) {
      finishMatch(role, 'timeout');
      return;
    }
    draw();
    animationFrame = requestAnimationFrame(gameLoop);
  }

  function viewportSize() {
    const viewport = window.visualViewport;
    const width = Math.round(viewport?.width || document.documentElement.clientWidth || innerWidth);
    const height = Math.round(viewport?.height || document.documentElement.clientHeight || innerHeight);
    return { width: Math.max(280, width), height: Math.max(480, height) };
  }

  function resizeCanvas(force = false) {
    const { width, height } = viewportSize();
    if (!force && Math.abs(width - layout.width) < 3 && Math.abs(height - layout.height) < 3) return;
    const mobile = matchMedia?.('(pointer: coarse)')?.matches || width < 700;
    const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.15 : 1.5);
    layout.width = width;
    layout.height = height;
    layout.dpr = dpr;
    layout.scale = Math.min(width / FIELD.width, height / FIELD.height);
    layout.offsetX = (width - FIELD.width * layout.scale) / 2;
    layout.offsetY = (height - FIELD.height * layout.scale) / 2;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCanvas(true);
      draw();
    }, 180);
  }

  function pointerPosition(event) {
    return {
      x: (event.clientX - layout.offsetX) / layout.scale,
      y: (event.clientY - layout.offsetY) / layout.scale
    };
  }

  canvas.addEventListener('pointerdown', event => {
    if (mode !== 'playing' || pointerId !== null) return;
    const position = pointerPosition(event);
    if (position.y < FIELD.middle - 30) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    localPaddle.targetX = position.x;
    localPaddle.targetY = position.y - 55;
  }, { passive: true });

  canvas.addEventListener('pointermove', event => {
    if (mode !== 'playing' || pointerId !== event.pointerId) return;
    const samples = event.getCoalescedEvents?.() || [event];
    const position = pointerPosition(samples[samples.length - 1]);
    localPaddle.targetX = position.x;
    localPaddle.targetY = position.y - 55;
  }, { passive: true });

  function releasePointer(event) {
    if (pointerId === event.pointerId) pointerId = null;
  }

  canvas.addEventListener('pointerup', releasePointer, { passive: true });
  canvas.addEventListener('pointercancel', releasePointer, { passive: true });
  canvas.addEventListener('lostpointercapture', releasePointer, { passive: true });
  window.addEventListener('resize', scheduleResize, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleResize, { passive: true });
  window.addEventListener('orientationchange', scheduleResize, { passive: true });

  function roundedRect(target, x, y, width, height, radius) {
    const safe = Math.min(radius, width / 2, height / 2);
    target.beginPath();
    target.moveTo(x + safe, y);
    target.arcTo(x + width, y, x + width, y + height, safe);
    target.arcTo(x + width, y + height, x, y + height, safe);
    target.arcTo(x, y + height, x, y, safe);
    target.arcTo(x, y, x + width, y, safe);
    target.closePath();
  }

  const staticLayer = document.createElement('canvas');
  staticLayer.width = 500;
  staticLayer.height = 800;
  const staticCtx = staticLayer.getContext('2d', { alpha: false });

  function buildStaticLayer() {
    const c = staticCtx;
    c.setTransform(0.5, 0, 0, 0.5, 0, 0);
    const bg = c.createLinearGradient(0, 0, 0, FIELD.height);
    bg.addColorStop(0, '#86dcf4');
    bg.addColorStop(1, '#e4fbff');
    c.fillStyle = bg;
    c.fillRect(0, 0, FIELD.width, FIELD.height);
    c.fillStyle = 'rgba(255,255,255,.32)';
    [[120,250,55],[835,310,32],[155,1280,38],[875,1180,52]].forEach(([x,y,r]) => {
      c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill();
    });
    c.fillStyle = 'rgba(35,62,78,.18)';
    roundedRect(c, FIELD.left + 7, FIELD.top + 10, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top, 42);
    c.fill();
    const rink = c.createLinearGradient(0, FIELD.top, 0, FIELD.bottom);
    rink.addColorStop(0, '#c9efe9');
    rink.addColorStop(1, '#82d1c4');
    c.fillStyle = rink;
    c.strokeStyle = '#36586b';
    c.lineWidth = 8;
    roundedRect(c, FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top, 42);
    c.fill();
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.9)';
    c.lineWidth = 6;
    c.setLineDash([22,18]);
    c.beginPath();
    c.moveTo(FIELD.left + 28, FIELD.middle);
    c.lineTo(FIELD.right - 28, FIELD.middle);
    c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.arc(FIELD.width / 2, FIELD.middle, 100, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 18;
    c.strokeStyle = '#f19778';
    c.beginPath();
    c.moveTo(FIELD.goalLeft, FIELD.top);
    c.lineTo(FIELD.goalRight, FIELD.top);
    c.stroke();
    c.strokeStyle = '#5bc696';
    c.beginPath();
    c.moveTo(FIELD.goalLeft, FIELD.bottom);
    c.lineTo(FIELD.goalRight, FIELD.bottom);
    c.stroke();
  }

  function makeShellSprite(type) {
    const sprite = document.createElement('canvas');
    sprite.width = 220;
    sprite.height = 220;
    const c = sprite.getContext('2d');
    c.translate(110, 110);
    const r = 82;
    c.fillStyle = 'rgba(35,62,78,.2)';
    c.beginPath();
    c.ellipse(7, 12, r * 0.98, r * 0.84, 0, 0, Math.PI * 2);
    c.fill();
    const gradient = c.createRadialGradient(-r * 0.28, -r * 0.3, 3, 0, 0, r);
    if (type === 'turtle') {
      gradient.addColorStop(0, '#eaf7b5');
      gradient.addColorStop(0.45, '#60c795');
      gradient.addColorStop(1, '#34785f');
    } else {
      gradient.addColorStop(0, '#fff1cc');
      gradient.addColorStop(0.46, '#f6ab83');
      gradient.addColorStop(1, '#c96c69');
    }
    c.fillStyle = gradient;
    c.strokeStyle = '#36586b';
    c.lineWidth = 8;
    c.beginPath();
    c.ellipse(0, 0, r * 0.98, r * 0.84, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = 'rgba(54,88,107,.58)';
    c.lineWidth = 5;
    if (type === 'turtle') {
      c.beginPath();
      c.moveTo(-r * 0.5, -r * 0.34);
      c.lineTo(0, r * 0.38);
      c.lineTo(r * 0.5, -r * 0.34);
      c.moveTo(-r * 0.22, -r * 0.05);
      c.lineTo(0, -r * 0.45);
      c.lineTo(r * 0.22, -r * 0.05);
      c.stroke();
    } else {
      c.beginPath();
      for (let angle = 0; angle < Math.PI * 5.2; angle += 0.16) {
        const spiralRadius = r * (0.06 + (angle / (Math.PI * 5.2)) * 0.58);
        const x = Math.cos(angle) * spiralRadius;
        const y = Math.sin(angle) * spiralRadius * 0.84;
        if (angle === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    return sprite;
  }

  function makePuckSprite() {
    const sprite = document.createElement('canvas');
    sprite.width = 96;
    sprite.height = 96;
    const c = sprite.getContext('2d');
    const gradient = c.createRadialGradient(34, 30, 2, 48, 48, 34);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(0.45, '#fff5bd');
    gradient.addColorStop(1, '#ffd75a');
    c.fillStyle = gradient;
    c.strokeStyle = '#36586b';
    c.lineWidth = 7;
    c.beginPath();
    c.arc(48, 48, 31, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    return sprite;
  }

  buildStaticLayer();
  const turtleSprite = makeShellSprite('turtle');
  const shellSprite = makeShellSprite('shell');
  const puckSprite = makePuckSprite();

  function draw() {
    resizeCanvas();
    const dpr = layout.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#86dcf4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * layout.scale, 0, 0, dpr * layout.scale, dpr * layout.offsetX, dpr * layout.offsetY);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(staticLayer, 0, 0, FIELD.width, FIELD.height);

    let puckX;
    let puckY;
    let opponentX;
    let opponentY;
    if (role === 'host') {
      puckX = puck.x;
      puckY = puck.y;
      opponentX = remotePaddle.x;
      opponentY = remotePaddle.y;
    } else {
      puckX = display.puckX;
      puckY = display.puckY;
      opponentX = display.opponentX;
      opponentY = display.opponentY;
    }

    ctx.drawImage(shellSprite, opponentX - 105, opponentY - 105, 210, 210);
    ctx.drawImage(turtleSprite, localPaddle.x - 105, localPaddle.y - 105, 210, 210);
    ctx.drawImage(puckSprite, puckX - 45, puckY - 45, 90, 90);
  }

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
    if ((reason === 'timeout' || reason === 'opponent-left') && client) safeCancelServerMatch();
    if (winnerText) {
      winnerText.textContent = reason === 'opponent-left' || reason === 'timeout'
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
    if (wasActive && channel) send('leave', { reason });
    clearTimers();
    cancelAnimationFrame(animationFrame);
    pointerId = null;
    if (wasActive && client && user) safeCancelServerMatch();
    if (channel && client) {
      try { await client.removeChannel(channel); } catch (_) {}
    }
    if (token !== attemptToken) return;
    channel = null;
    role = null;
    matchId = null;
    peerSeen = false;
    started = false;
    ended = false;
    startOffer = null;
    snapshots.length = 0;
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

  window.BubbleMultiplayer = {
    start: startQueue,
    leave,
    isActive: () => mode !== 'idle'
  };

  resizeCanvas(true);
  draw();
})();