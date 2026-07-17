(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas?.getContext('2d');
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
  const client = window.BubbleSupabaseClient ||
    (config.enabled &&
     config.supabaseUrl &&
     config.supabasePublishableKey &&
     window.supabase?.createClient
      ? window.supabase.createClient(
          config.supabaseUrl,
          config.supabasePublishableKey,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: false,
              storageKey: 'bubble-island-auth-v404'
            },
            realtime: {
              params: { eventsPerSecond: 40 }
            }
          }
        )
      : null);

  const FIELD = {
    width: 1000,
    height: 1600,
    left: 45,
    right: 955,
    top: 150,
    bottom: 1550,
    middle: 850,
    goalLeft: 315,
    goalRight: 685,
    paddleRadius: 76,
    puckRadius: 30
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  let latestSnapshot = null;
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

  let lastFrame = 0;
  let lastStateSent = 0;
  let lastInputSent = 0;
  let lastRemoteMessage = 0;
  let lastPingSent = 0;

  const localPaddle = { x: 500, y: 1430, targetX: 500, targetY: 1430 };
  const remotePaddle = { x: 500, y: 270, targetX: 500, targetY: 270 };
  const puck = { x: 500, y: 850, vx: 120, vy: -520 };
  const display = { puckX: 500, puckY: 850, opponentX: 500, opponentY: 270 };
  const game = { hostScore: 0, guestScore: 0, pause: 0, sequence: 0 };

  function readPlayerName() {
    try {
      const stored = JSON.parse(localStorage.getItem('bubble_island_user') || '{}');
      playerName = String(stored.name || '玩家')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 12) || '玩家';
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

    if (code === 'anonymous_provider_disabled') {
      return '匿名登入尚未開啟，請回 Supabase 開啟 Allow anonymous sign-ins。';
    }
    if (
      status === 429 ||
      code.includes('rate_limit') ||
      message.toLowerCase().includes('rate limit')
    ) {
      return '匿名登入次數暫時超過限制（429），請稍後再試。';
    }
    if (status === 401 || status === 403 || code.includes('api_key')) {
      return `Supabase 公開金鑰或權限被拒絕（${code || status}）。`;
    }
    if (
      message.toLowerCase().includes('failed to fetch') ||
      message.toLowerCase().includes('network')
    ) {
      return '瀏覽器無法連到 Supabase，請確認網路或關閉內容阻擋器。';
    }
    if (code === 'pgrst202' || message.includes('join_quick_match')) {
      return '多人配對資料庫尚未安裝或尚未更新。';
    }
    return `連線失敗（${code || status || 'unknown'}）：${message}`;
  }

  function clearTimers() {
    clearInterval(queueTimer);
    clearInterval(pollTimer);
    clearInterval(countTimer);
    clearInterval(helloTimer);
    clearInterval(offerTimer);
    clearTimeout(connectTimeout);
    queueTimer = null;
    pollTimer = null;
    countTimer = null;
    helloTimer = null;
    offerTimer = null;
    connectTimeout = null;
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
    try {
      await client.rpc('cancel_quick_match');
    } catch (_) {}
  }

  async function refreshWaitingCount(token) {
    if (!client || mode !== 'queue' || token !== attemptToken) return;
    const result = await client.rpc('quick_match_waiting_count');
    if (
      token === attemptToken &&
      mode === 'queue' &&
      !result.error &&
      Number.isFinite(result.data) &&
      queueOnline
    ) {
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
    latestSnapshot = null;
    startOffer = null;
    latency = 0;

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

        if (queueSeconds === 10) {
          setStatus('目前配對人數較少，繼續等待中…');
        }
        if (queueSeconds >= 30) setFallback('ai');
      }, 1000);

      await pollQueue(token);
      if (token !== attemptToken || mode !== 'queue') return;

      pollTimer = setInterval(() => pollQueue(token), 1250);
      countTimer = setInterval(() => refreshWaitingCount(token), 4000);
      refreshWaitingCount(token);
    } catch (error) {
      if (token !== attemptToken) return;
      console.error('Bubble multiplayer auth error:', error);
      showError(error);
    }
  }

  async function pollQueue(token) {
    if (!client || mode !== 'queue' || token !== attemptToken) return;

    const result = await client.rpc('join_quick_match', {
      p_player_name: playerName
    });

    if (token !== attemptToken || mode !== 'queue') return;

    if (result.error) {
      console.error('Bubble matchmaking RPC error:', result.error);
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
    return channel.send({
      type: 'broadcast',
      event,
      payload
    });
  }

  function sendHello() {
    return send('hello', {
      role,
      name: playerName,
      sentAt: Date.now()
    });
  }

  function beginHostOffer() {
    if (role !== 'host' || !peerSeen || started || !channel) return;

    if (!startOffer) {
      startOffer = {
        seed: Date.now(),
        startAt: Date.now() + 2400
      };
    }

    const broadcastOffer = () => send('start-offer', startOffer);
    broadcastOffer();
    clearInterval(offerTimer);
    offerTimer = setInterval(broadcastOffer, 420);
  }

  async function connectRealtime(token) {
    if (!client || !matchId || token !== attemptToken) return;

    mode = 'connecting';
    showMatchScreen();

    if (channel) {
      try {
        await client.removeChannel(channel);
      } catch (_) {}
      channel = null;
    }

    const topic = `game:${matchId}:play`;
    channel = client.channel(topic, {
      config: {
        private: false,
        broadcast: {
          ack: false,
          self: false
        }
      }
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
        send('start-ack', {
          startAt: payload.startAt,
          receivedAt: Date.now()
        });
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
        remotePaddle.targetX = clamp(
          Number(payload.x) || 500,
          FIELD.left + FIELD.paddleRadius,
          FIELD.right - FIELD.paddleRadius
        );
        remotePaddle.targetY = clamp(
          Number(payload.y) || 270,
          FIELD.top + FIELD.paddleRadius,
          FIELD.middle - FIELD.paddleRadius - 12
        );
      })
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        if (role !== 'guest' || !payload) return;
        lastRemoteMessage = performance.now();
        latestSnapshot = payload;
        game.hostScore = Number(payload.hostScore) || 0;
        game.guestScore = Number(payload.guestScore) || 0;
        updateOnlineHud();

        if (payload.ended) {
          finishMatch(payload.winner, 'remote');
        }
      })
      .on('broadcast', { event: 'ping' }, ({ payload }) => {
        lastRemoteMessage = performance.now();
        send('pong', { sentAt: payload?.sentAt || Date.now() });
      })
      .on('broadcast', { event: 'pong' }, ({ payload }) => {
        lastRemoteMessage = performance.now();
        latency = Math.max(
          1,
          Math.round((Date.now() - Number(payload?.sentAt || Date.now())) / 2)
        );
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
            if (mode !== 'connecting') {
              clearInterval(helloTimer);
              helloTimer = null;
              return;
            }
            sendHello();
          }, 650);

          clearTimeout(connectTimeout);
          connectTimeout = setTimeout(() => {
            if (mode !== 'connecting' || token !== attemptToken) return;
            showError(new Error('對手沒有完成即時連線，已取消這次配對。'));
            safeCancelServerMatch();
            if (channel) {
              client.removeChannel(channel).catch(() => {});
              channel = null;
            }
          }, 12000);
          return;
        }

        if (
          subscriptionStatus === 'CHANNEL_ERROR' ||
          subscriptionStatus === 'TIMED_OUT' ||
          subscriptionStatus === 'CLOSED'
        ) {
          showError(
            new Error(`Realtime 頻道狀態：${subscriptionStatus}`)
          );
        }
      });
  }

  function prepareOnlineHud() {
    document.body.classList.remove('multiplayer-pending');
    document.body.classList.add('multiplayer-running');
    hud?.classList.add('multiplayer-hud');

    if (comboLabel) comboLabel.textContent = '真人對戰';
    if (bestComboHud) bestComboHud.textContent = '即時連線';
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
    if (speedLabel) {
      speedLabel.textContent = latency > 0 ? `ONLINE ${latency}ms` : 'ONLINE';
    }
  }

  function resetMatch(seed) {
    game.hostScore = 0;
    game.guestScore = 0;
    game.pause = 0.45;
    game.sequence = 0;

    Object.assign(localPaddle, {
      x: 500,
      y: 1430,
      targetX: 500,
      targetY: 1430
    });
    Object.assign(remotePaddle, {
      x: 500,
      y: 270,
      targetX: 500,
      targetY: 270
    });
    Object.assign(puck, {
      x: 500,
      y: 850,
      vx: (seed % 401) - 200,
      vy: seed % 2 ? 520 : -520
    });
    Object.assign(display, {
      puckX: 500,
      puckY: 850,
      opponentX: 500,
      opponentY: 270
    });

    latestSnapshot = null;
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

    try {
      await client.rpc('start_quick_match', { p_match_id: matchId });
    } catch (_) {}

    prepareOnlineHud();
    resetMatch(Number(offer.seed) || Date.now());

    countdown?.classList.add('active');
    matchScreen?.classList.remove('active');

    const startAt = Math.max(Date.now() + 250, Number(offer.startAt) || Date.now() + 1600);

    while (mode === 'countdown' && Date.now() < startAt) {
      const remaining = startAt - Date.now();
      const value = remaining > 1400 ? '3' : remaining > 700 ? '2' : '1';
      if (countdownText) countdownText.textContent = value;
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
    if (currentSpeed > 1180) {
      puck.vx *= 1180 / currentSpeed;
      puck.vy *= 1180 / currentSpeed;
    }
  }

  function serve(direction) {
    puck.x = 500;
    puck.y = 850;
    puck.vx = (Math.random() - 0.5) * 240;
    puck.vy = direction * 520;
    game.pause = 0.85;
  }

  function simulateHost(dt) {
    moveObject(
      localPaddle,
      localPaddle.targetX,
      localPaddle.targetY,
      1700,
      dt
    );
    moveObject(
      remotePaddle,
      remotePaddle.targetX,
      remotePaddle.targetY,
      1700,
      dt
    );

    localPaddle.x = clamp(
      localPaddle.x,
      FIELD.left + FIELD.paddleRadius,
      FIELD.right - FIELD.paddleRadius
    );
    localPaddle.y = clamp(
      localPaddle.y,
      FIELD.middle + FIELD.paddleRadius + 12,
      FIELD.bottom - FIELD.paddleRadius
    );
    remotePaddle.x = clamp(
      remotePaddle.x,
      FIELD.left + FIELD.paddleRadius,
      FIELD.right - FIELD.paddleRadius
    );
    remotePaddle.y = clamp(
      remotePaddle.y,
      FIELD.top + FIELD.paddleRadius,
      FIELD.middle - FIELD.paddleRadius - 12
    );

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

      const insideGoal =
        puck.x > FIELD.goalLeft + FIELD.puckRadius * 0.25 &&
        puck.x < FIELD.goalRight - FIELD.puckRadius * 0.25;

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

    puck.vx *= Math.pow(0.9982, dt * 60);
    puck.vy *= Math.pow(0.9982, dt * 60);

    const adjustedSpeed = Math.hypot(puck.vx, puck.vy);
    if (adjustedSpeed < 300 && game.pause <= 0) {
      puck.vx *= 300 / Math.max(1, adjustedSpeed);
      puck.vy *= 300 / Math.max(1, adjustedSpeed);
    }
    if (Math.abs(puck.vy) < 100) {
      puck.vy = (puck.vy < 0 ? -1 : 1) * 100;
    }

    if (game.hostScore >= 7 || game.guestScore >= 7) {
      const winningRole =
        game.hostScore > game.guestScore ? 'host' : 'guest';
      sendState(true, winningRole);
      client
        .rpc('finish_quick_match', {
          p_match_id: matchId,
          p_host_score: game.hostScore,
          p_guest_score: game.guestScore
        })
        .catch(() => {});
      finishMatch(winningRole, 'score');
    }
  }

  function sendState(isEnded = false, winningRole = null) {
    game.sequence += 1;
    send('state', {
      sequence: game.sequence,
      puckX: puck.x,
      puckY: puck.y,
      hostX: localPaddle.x,
      hostY: localPaddle.y,
      guestX: remotePaddle.x,
      guestY: remotePaddle.y,
      hostScore: game.hostScore,
      guestScore: game.guestScore,
      ended: isEnded,
      winner: winningRole
    });
  }

  function updateGuest(dt) {
    if (latestSnapshot) {
      const smooth = 1 - Math.pow(0.08, dt * 60);
      display.puckX = lerp(
        display.puckX,
        FIELD.width - Number(latestSnapshot.puckX || 500),
        smooth
      );
      display.puckY = lerp(
        display.puckY,
        FIELD.height - Number(latestSnapshot.puckY || 850),
        smooth
      );
      display.opponentX = lerp(
        display.opponentX,
        FIELD.width - Number(latestSnapshot.hostX || 500),
        smooth
      );
      display.opponentY = lerp(
        display.opponentY,
        FIELD.height - Number(latestSnapshot.hostY || 1430),
        smooth
      );
    }

    moveObject(
      localPaddle,
      localPaddle.targetX,
      localPaddle.targetY,
      1700,
      dt
    );
    localPaddle.x = clamp(
      localPaddle.x,
      FIELD.left + FIELD.paddleRadius,
      FIELD.right - FIELD.paddleRadius
    );
    localPaddle.y = clamp(
      localPaddle.y,
      FIELD.middle + FIELD.paddleRadius + 12,
      FIELD.bottom - FIELD.paddleRadius
    );
  }

  function gameLoop(now) {
    if (mode !== 'playing') return;

    const dt = Math.min(0.034, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;

    if (role === 'host') {
      simulateHost(dt);
      if (now - lastStateSent >= 40) {
        lastStateSent = now;
        sendState();
      }
    } else {
      updateGuest(dt);
      if (now - lastInputSent >= 34) {
        lastInputSent = now;
        send('input', {
          x: FIELD.width - localPaddle.x,
          y: FIELD.height - localPaddle.y
        });
      }
    }

    if (now - lastPingSent >= 2200) {
      lastPingSent = now;
      send('ping', { sentAt: Date.now() });
    }

    if (lastRemoteMessage && now - lastRemoteMessage > 9000) {
      finishMatch(role, 'timeout');
      return;
    }

    draw();
    animationFrame = requestAnimationFrame(gameLoop);
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * FIELD.width,
      y: ((event.clientY - rect.top) / rect.height) * FIELD.height
    };
  }

  canvas.addEventListener(
    'pointerdown',
    event => {
      if (mode !== 'playing' || pointerId !== null) return;
      const position = pointerPosition(event);
      if (position.y < FIELD.middle - 30) return;

      pointerId = event.pointerId;
      canvas.setPointerCapture?.(event.pointerId);
      localPaddle.targetX = position.x;
      localPaddle.targetY = position.y - 55;
    },
    { passive: true }
  );

  canvas.addEventListener(
    'pointermove',
    event => {
      if (mode !== 'playing' || pointerId !== event.pointerId) return;
      const samples = event.getCoalescedEvents?.() || [event];
      const position = pointerPosition(samples[samples.length - 1]);
      localPaddle.targetX = position.x;
      localPaddle.targetY = position.y - 55;
    },
    { passive: true }
  );

  function releasePointer(event) {
    if (pointerId === event.pointerId) pointerId = null;
  }

  canvas.addEventListener('pointerup', releasePointer, { passive: true });
  canvas.addEventListener('pointercancel', releasePointer, { passive: true });
  canvas.addEventListener('lostpointercapture', releasePointer, { passive: true });

  function scalePoint(x, y) {
    return {
      x: (x / FIELD.width) * innerWidth,
      y: (y / FIELD.height) * innerHeight
    };
  }

  function scaleRadius(radius) {
    return (
      radius *
      Math.min(innerWidth / FIELD.width, innerHeight / FIELD.height)
    );
  }

  function drawRoundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, width, height, radius);
      return;
    }
    const safe = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + safe, y);
    ctx.arcTo(x + width, y, x + width, y + height, safe);
    ctx.arcTo(x + width, y + height, x, y + height, safe);
    ctx.arcTo(x, y + height, x, y, safe);
    ctx.arcTo(x, y, x + width, y, safe);
    ctx.closePath();
  }

  function ensureCanvasResolution() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.floor(innerWidth * dpr);
    const targetHeight = Math.floor(innerHeight * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function drawShell(x, y, radius, type) {
    const point = scalePoint(x, y);
    const scaledRadius = scaleRadius(radius);

    ctx.save();
    ctx.translate(point.x, point.y);

    const gradient = ctx.createRadialGradient(
      -scaledRadius * 0.28,
      -scaledRadius * 0.3,
      2,
      0,
      0,
      scaledRadius
    );

    if (type === 'turtle') {
      gradient.addColorStop(0, '#eaf7b5');
      gradient.addColorStop(0.45, '#60c795');
      gradient.addColorStop(1, '#34785f');
    } else {
      gradient.addColorStop(0, '#fff1cc');
      gradient.addColorStop(0.46, '#f6ab83');
      gradient.addColorStop(1, '#c96c69');
    }

    ctx.fillStyle = gradient;
    ctx.strokeStyle = '#36586b';
    ctx.lineWidth = Math.max(3, scaledRadius * 0.09);
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      scaledRadius * 0.98,
      scaledRadius * 0.84,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(54,88,107,.55)';
    ctx.lineWidth = Math.max(2, scaledRadius * 0.055);

    if (type === 'turtle') {
      ctx.beginPath();
      ctx.moveTo(-scaledRadius * 0.5, -scaledRadius * 0.34);
      ctx.lineTo(0, scaledRadius * 0.38);
      ctx.lineTo(scaledRadius * 0.5, -scaledRadius * 0.34);
      ctx.moveTo(-scaledRadius * 0.22, -scaledRadius * 0.05);
      ctx.lineTo(0, -scaledRadius * 0.45);
      ctx.lineTo(scaledRadius * 0.22, -scaledRadius * 0.05);
      ctx.stroke();
    } else {
      ctx.beginPath();
      for (let angle = 0; angle < Math.PI * 5.2; angle += 0.15) {
        const spiralRadius =
          scaledRadius *
          (0.06 + (angle / (Math.PI * 5.2)) * 0.58);
        const xPoint = Math.cos(angle) * spiralRadius;
        const yPoint = Math.sin(angle) * spiralRadius * 0.84;
        if (angle === 0) ctx.moveTo(xPoint, yPoint);
        else ctx.lineTo(xPoint, yPoint);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function draw() {
    ensureCanvasResolution();

    const background = ctx.createLinearGradient(0, 0, 0, innerHeight);
    background.addColorStop(0, '#86dcf4');
    background.addColorStop(1, '#e4fbff');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, innerWidth, innerHeight);

    const topLeft = scalePoint(FIELD.left, FIELD.top);
    const bottomRight = scalePoint(FIELD.right, FIELD.bottom);

    ctx.fillStyle = 'rgba(74,190,170,.35)';
    ctx.strokeStyle = '#36586b';
    ctx.lineWidth = 5;
    drawRoundedRect(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y,
      30
    );
    ctx.fill();
    ctx.stroke();

    const middleY = scalePoint(0, FIELD.middle).y;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.moveTo(topLeft.x + 15, middleY);
    ctx.lineTo(bottomRight.x - 15, middleY);
    ctx.stroke();
    ctx.setLineDash([]);

    const topGoalLeft = scalePoint(FIELD.goalLeft, FIELD.top);
    const topGoalRight = scalePoint(FIELD.goalRight, FIELD.top);
    const bottomGoalLeft = scalePoint(FIELD.goalLeft, FIELD.bottom);
    const bottomGoalRight = scalePoint(FIELD.goalRight, FIELD.bottom);

    ctx.lineWidth = 12;
    ctx.strokeStyle = '#f19778';
    ctx.beginPath();
    ctx.moveTo(topGoalLeft.x, topGoalLeft.y);
    ctx.lineTo(topGoalRight.x, topGoalRight.y);
    ctx.stroke();

    ctx.strokeStyle = '#5bc696';
    ctx.beginPath();
    ctx.moveTo(bottomGoalLeft.x, bottomGoalLeft.y);
    ctx.lineTo(bottomGoalRight.x, bottomGoalRight.y);
    ctx.stroke();

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

    const puckPoint = scalePoint(puckX, puckY);
    const puckRadius = scaleRadius(FIELD.puckRadius);

    ctx.fillStyle = '#fff5bd';
    ctx.strokeStyle = '#36586b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      puckPoint.x,
      puckPoint.y,
      puckRadius,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();

    drawShell(
      opponentX,
      opponentY,
      FIELD.paddleRadius,
      'shell'
    );
    drawShell(
      localPaddle.x,
      localPaddle.y,
      FIELD.paddleRadius,
      'turtle'
    );
  }

  async function finishMatch(winningRole, reason) {
    if (ended) return;
    ended = true;
    mode = 'finished';
    clearTimers();
    cancelAnimationFrame(animationFrame);
    pointerId = null;

    const won = winningRole === role;
    const myScore =
      role === 'host' ? game.hostScore : game.guestScore;
    const rivalScore =
      role === 'host' ? game.guestScore : game.hostScore;

    if (
      (reason === 'timeout' || reason === 'opponent-left') &&
      client
    ) {
      safeCancelServerMatch();
    }

    if (winnerText) {
      winnerText.textContent =
        reason === 'opponent-left' || reason === 'timeout'
          ? '對手已離線'
          : won
            ? '真人對戰勝利！'
            : '真人對戰結束';
    }

    if (finalScore) {
      const suffix =
        reason === 'timeout'
          ? '｜連線逾時'
          : reason === 'opponent-left'
            ? '｜對手離開'
            : '';
      finalScore.textContent =
        `${playerName} ${myScore}：${rivalScore} ${opponentName}${suffix}`;
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

    if (wasActive && channel) {
      send('leave', { reason });
    }

    clearTimers();
    cancelAnimationFrame(animationFrame);
    pointerId = null;

    if (wasActive && client && user) {
      safeCancelServerMatch();
    }

    if (channel && client) {
      try {
        await client.removeChannel(channel);
      } catch (_) {}
    }

    if (token !== attemptToken) return;

    channel = null;
    role = null;
    matchId = null;
    peerSeen = false;
    started = false;
    ended = false;
    latestSnapshot = null;
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

  pauseButton?.addEventListener(
    'click',
    event => {
      if (['connecting', 'countdown', 'playing'].includes(mode)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        leave('exit');
      }
    },
    true
  );

  restartButton?.addEventListener(
    'click',
    event => {
      if (mode === 'finished') {
        event.preventDefault();
        event.stopImmediatePropagation();
        gameOver?.classList.remove('active');
        mode = 'idle';
        startQueue();
      }
    },
    true
  );

  homeButton?.addEventListener(
    'click',
    event => {
      if (mode === 'finished') {
        event.preventDefault();
        event.stopImmediatePropagation();
        leave('home');
      }
    },
    true
  );

  window.addEventListener('resize', () => {
    if (['countdown', 'playing'].includes(mode)) {
      requestAnimationFrame(draw);
    }
  });

  window.addEventListener('pagehide', () => {
    if (!['idle', 'error', 'finished'].includes(mode)) {
      send('leave', { reason: 'pagehide' });
      safeCancelServerMatch();
    }
  });

  window.BubbleMultiplayer = {
    start: startQueue,
    leave,
    isActive: () => !['idle', 'error'].includes(mode),
    getState: () => ({
      mode,
      role,
      opponentName,
      matchId,
      latency
    })
  };

  if (!client) {
    quickButton.disabled = true;
    quickButton.textContent = '🌐 雲端尚未連線';
  }
})();
