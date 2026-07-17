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
            storageKey: 'bubble-island-auth-v408'
          },
          realtime: { params: { eventsPerSecond: 25 } }
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
    stateInterval: 50,
    inputInterval: 33,
    inputKeepAlive: 180,
    correctionRate: 9,
    snapDistance: 230,
    p2pTimeout: 8500,
    disconnectTimeout: 9500
  };

  const ICE_SERVERS = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const round1 = value => Math.round(value * 10) / 10;
  const safeJson = value => {
    try { return JSON.parse(value); } catch (_) { return null; }
  };

  let mode = 'idle';
  let attemptToken = 0;
  let user = null;
  let playerName = '玩家';
  let role = null;
  let opponentName = '對手';
  let matchId = null;
  let signalChannel = null;
  let peer = null;
  let controlChannel = null;
  let gameChannel = null;
  let transport = 'none';
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
  let disconnectTimer = null;
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
  let lastPingId = 0;
  let relayReady = false;
  let remoteDescriptionReady = false;
  let makingOffer = false;
  const pendingIce = [];

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
    clearTimeout(disconnectTimer);
    queueTimer = pollTimer = countTimer = helloTimer = offerTimer = connectTimeout = disconnectTimer = null;
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
    peerSeen = false;
    started = false;
    startOffer = null;
    latency = 0;
    transport = 'none';
    relayReady = false;
    clearTimers();
    closePeer();
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
    setStatus(`找到對手：${opponentName}，建立點對點連線…`);
    if (queueOnline) queueOnline.textContent = '連線狀態：P2P 握手中';
    await connectSignaling(token);
  }

  function sendSignal(event, payload = {}) {
    if (!signalChannel) return Promise.resolve('no-signal-channel');
    return signalChannel.send({ type: 'broadcast', event, payload });
  }

  function sendHello() {
    return sendSignal('hello-v408', { role, name: playerName, sentAt: Date.now() });
  }

  function sendControl(packet) {
    if (controlChannel?.readyState === 'open') {
      try { controlChannel.send(JSON.stringify(packet)); return true; } catch (_) {}
    }
    sendSignal('relay-control-v408', { from: role, packet });
    return false;
  }

  function sendGame(packet) {
    if (gameChannel?.readyState === 'open' && gameChannel.bufferedAmount < 48000) {
      try { gameChannel.send(JSON.stringify(packet)); return true; } catch (_) {}
    }
    sendSignal('relay-game-v408', { from: role, packet });
    return false;
  }

  function closePeer() {
    remoteDescriptionReady = false;
    pendingIce.length = 0;
    try { controlChannel?.close(); } catch (_) {}
    try { gameChannel?.close(); } catch (_) {}
    try { peer?.close(); } catch (_) {}
    controlChannel = null;
    gameChannel = null;
    peer = null;
  }

  function attachControlChannel(channel) {
    controlChannel = channel;
    controlChannel.binaryType = 'arraybuffer';
    controlChannel.onopen = maybeTransportReady;
    controlChannel.onclose = scheduleDisconnectCheck;
    controlChannel.onerror = () => scheduleDisconnectCheck();
    controlChannel.onmessage = event => {
      lastRemoteMessage = performance.now();
      const packet = safeJson(event.data);
      if (packet) handleControl(packet);
    };
  }

  function attachGameChannel(channel) {
    gameChannel = channel;
    gameChannel.binaryType = 'arraybuffer';
    gameChannel.bufferedAmountLowThreshold = 8000;
    gameChannel.onopen = maybeTransportReady;
    gameChannel.onclose = scheduleDisconnectCheck;
    gameChannel.onerror = () => scheduleDisconnectCheck();
    gameChannel.onmessage = event => {
      lastRemoteMessage = performance.now();
      const packet = safeJson(event.data);
      if (packet) handleGame(packet);
    };
  }

  function createPeerConnection() {
    if (peer) return peer;
    peer = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 4,
      bundlePolicy: 'max-bundle'
    });

    peer.onicecandidate = event => {
      if (event.candidate) {
        sendSignal('ice-v408', {
          from: role,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
        });
      }
    };

    peer.ondatachannel = event => {
      if (event.channel.label === 'bubble-control') attachControlChannel(event.channel);
      if (event.channel.label === 'bubble-game') attachGameChannel(event.channel);
    };

    peer.onconnectionstatechange = () => {
      const state = peer?.connectionState;
      if (state === 'connected') maybeTransportReady();
      if (state === 'failed' || state === 'closed') activateRelayFallback('P2P 無法建立，已切換相容模式');
      if (state === 'disconnected') scheduleDisconnectCheck();
    };

    return peer;
  }

  async function flushPendingIce() {
    if (!peer || !remoteDescriptionReady) return;
    while (pendingIce.length) {
      const candidate = pendingIce.shift();
      try { await peer.addIceCandidate(candidate); } catch (_) {}
    }
  }

  async function makeHostOffer() {
    if (role !== 'host' || makingOffer || !peerSeen || transport !== 'none') return;
    makingOffer = true;
    try {
      const connection = createPeerConnection();
      if (!controlChannel) attachControlChannel(connection.createDataChannel('bubble-control', { ordered: true }));
      if (!gameChannel) attachGameChannel(connection.createDataChannel('bubble-game', { ordered: false, maxRetransmits: 0 }));
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await sendSignal('sdp-offer-v408', { from: role, description: connection.localDescription });
    } catch (error) {
      console.warn('WebRTC offer failed', error);
      activateRelayFallback('P2P 建立失敗，已切換相容模式');
    } finally {
      makingOffer = false;
    }
  }

  async function receiveOffer(description) {
    if (role !== 'guest' || !description || transport !== 'none') return;
    try {
      const connection = createPeerConnection();
      await connection.setRemoteDescription(description);
      remoteDescriptionReady = true;
      await flushPendingIce();
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await sendSignal('sdp-answer-v408', { from: role, description: connection.localDescription });
    } catch (error) {
      console.warn('WebRTC answer failed', error);
      activateRelayFallback('P2P 回應失敗，已切換相容模式');
    }
  }

  async function receiveAnswer(description) {
    if (role !== 'host' || !peer || !description || transport !== 'none') return;
    try {
      await peer.setRemoteDescription(description);
      remoteDescriptionReady = true;
      await flushPendingIce();
    } catch (error) {
      console.warn('WebRTC set answer failed', error);
      activateRelayFallback('P2P 回應失敗，已切換相容模式');
    }
  }

  async function receiveIce(candidate) {
    if (!candidate || transport !== 'none') return;
    if (!peer || !remoteDescriptionReady) {
      pendingIce.push(candidate);
      return;
    }
    try { await peer.addIceCandidate(candidate); } catch (_) {}
  }

  function maybeTransportReady() {
    if (transport !== 'none') return;
    if (controlChannel?.readyState === 'open' && gameChannel?.readyState === 'open') {
      transport = 'p2p';
      clearTimeout(connectTimeout);
      connectTimeout = null;
      setStatus(`已與 ${opponentName} 直接連線，準備開局…`);
      if (queueOnline) queueOnline.textContent = '連線狀態：WebRTC P2P';
      if (role === 'host') sendStartOffer();
    }
  }

  function activateRelayFallback(message = '已切換相容連線') {
    if (!['connecting', 'countdown'].includes(mode) || transport === 'p2p') return;
    closePeer();
    transport = 'relay';
    relayReady = true;
    setStatus(`${message}，準備開局…`);
    if (queueOnline) queueOnline.textContent = '連線狀態：Realtime 備援';
    sendSignal('relay-ready-v408', { from: role, name: playerName });
    if (role === 'host' && peerSeen) sendStartOffer();
  }

  function sendStartOffer() {
    if (role !== 'host' || started || !peerSeen) return;
    if (!startOffer) startOffer = { seed: Date.now(), startAt: Date.now() + 1800 };
    const packet = { type: 'start', ...startOffer };
    sendControl(packet);
    clearInterval(offerTimer);
    offerTimer = setInterval(() => {
      if (started) return clearInterval(offerTimer);
      sendControl(packet);
    }, 320);
  }

  function handleControl(packet) {
    if (!packet || typeof packet !== 'object') return;
    if (packet.type === 'start' && role === 'guest') {
      sendControl({ type: 'start-ack', startAt: packet.startAt });
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
      remotePaddle.targetY = clamp(Number(packet[2]) || 270, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 12);
      return;
    }
    if (packet[0] === 's' && role === 'guest') receiveAuthoritativeState(packet);
  }

  async function connectSignaling(token) {
    if (!client || !matchId || token !== attemptToken) return;
    mode = 'connecting';
    showMatchScreen();
    if (signalChannel) {
      try { await client.removeChannel(signalChannel); } catch (_) {}
      signalChannel = null;
    }

    signalChannel = client.channel(`game:${matchId}:play`, {
      config: { private: false, broadcast: { ack: false, self: false } }
    });

    signalChannel
      .on('broadcast', { event: 'hello-v408' }, ({ payload }) => {
        if (!payload || payload.role === role) return;
        lastRemoteMessage = performance.now();
        peerSeen = true;
        opponentName = payload.name || opponentName;
        setStatus(`找到 ${opponentName}，建立 WebRTC 點對點連線…`);
        if (queueOnline) queueOnline.textContent = '連線狀態：交換連線資訊';
        sendHello();
        if (role === 'host') makeHostOffer();
      })
      .on('broadcast', { event: 'sdp-offer-v408' }, ({ payload }) => {
        if (payload?.from !== role) receiveOffer(payload?.description);
      })
      .on('broadcast', { event: 'sdp-answer-v408' }, ({ payload }) => {
        if (payload?.from !== role) receiveAnswer(payload?.description);
      })
      .on('broadcast', { event: 'ice-v408' }, ({ payload }) => {
        if (payload?.from !== role) receiveIce(payload?.candidate);
      })
      .on('broadcast', { event: 'relay-ready-v408' }, ({ payload }) => {
        if (!payload || payload.from === role) return;
        peerSeen = true;
        if (role === 'host' && transport === 'relay') sendStartOffer();
      })
      .on('broadcast', { event: 'relay-control-v408' }, ({ payload }) => {
        if (!payload || payload.from === role || transport === 'p2p') return;
        lastRemoteMessage = performance.now();
        handleControl(payload.packet);
      })
      .on('broadcast', { event: 'relay-game-v408' }, ({ payload }) => {
        if (!payload || payload.from === role || transport === 'p2p') return;
        lastRemoteMessage = performance.now();
        handleGame(payload.packet);
      })
      .subscribe(subscriptionStatus => {
        if (token !== attemptToken) return;
        if (subscriptionStatus === 'SUBSCRIBED') {
          lastRemoteMessage = performance.now();
          setStatus(`等待 ${opponentName} 完成點對點連線…`);
          if (queueOnline) queueOnline.textContent = '連線狀態：WebRTC 準備中';
          sendHello();
          clearInterval(helloTimer);
          helloTimer = setInterval(() => {
            if (mode !== 'connecting' || transport !== 'none') return clearInterval(helloTimer);
            sendHello();
            if (role === 'host' && peerSeen) makeHostOffer();
          }, 700);
          clearTimeout(connectTimeout);
          connectTimeout = setTimeout(() => {
            if (mode === 'connecting' && token === attemptToken && transport === 'none') {
              activateRelayFallback('P2P 連線逾時');
            }
          }, NET.p2pTimeout);
          return;
        }
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(subscriptionStatus)) {
          showError(new Error(`Realtime 訊號頻道狀態：${subscriptionStatus}`));
        }
      });
  }

  function prepareOnlineHud() {
    document.body.classList.remove('multiplayer-pending');
    document.body.classList.add('multiplayer-running');
    hud?.classList.add('multiplayer-hud');
    if (comboLabel) comboLabel.textContent = '真人對戰';
    if (bestComboHud) bestComboHud.textContent = transport === 'p2p' ? 'P2P 直連' : '相容模式';
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
      const label = transport === 'p2p' ? 'P2P' : transport === 'relay' ? 'RELAY' : 'ONLINE';
      speedLabel.textContent = latency > 0 ? `${label} ${latency}ms` : label;
    }
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
    moveObject(remotePaddle, remotePaddle.targetX, remotePaddle.targetY, 1900, dt);
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
      's', game.sequence,
      round1(puck.x), round1(puck.y), round1(puck.vx), round1(puck.vy),
      round1(localPaddle.x), round1(localPaddle.y),
      round1(remotePaddle.x), round1(remotePaddle.y),
      game.hostScore, game.guestScore,
      isEnded ? 1 : 0, winningRole, Date.now()
    ]);
  }

  function receiveAuthoritativeState(packet) {
    const previousGuestScore = game.guestScore;
    const previousHostScore = game.hostScore;
    const next = {
      x: FIELD.width - Number(packet[2] || 500),
      y: FIELD.height - Number(packet[3] || 850),
      vx: -Number(packet[4] || 0),
      vy: -Number(packet[5] || 0),
      opponentX: FIELD.width - Number(packet[6] || 500),
      opponentY: FIELD.height - Number(packet[7] || 1430),
      hostScore: Number(packet[10] || 0),
      guestScore: Number(packet[11] || 0),
      ended: Boolean(packet[12]),
      winner: packet[13] || null
    };
    game.hostScore = next.hostScore;
    game.guestScore = next.guestScore;
    display.opponentX = next.opponentX;
    display.opponentY = next.opponentY;
    Object.assign(authoritative, {
      x: next.x,
      y: next.y,
      vx: next.vx,
      vy: next.vy,
      receivedAt: performance.now()
    });
    const scoreChanged = previousGuestScore !== game.guestScore || previousHostScore !== game.hostScore;
    const distance = Math.hypot(predictedPuck.x - next.x, predictedPuck.y - next.y);
    if (!authoritative.receivedAt || scoreChanged || distance > NET.snapDistance) {
      Object.assign(predictedPuck, { x: next.x, y: next.y, vx: next.vx, vy: next.vy });
    }
    updateOnlineHud();
    if (next.ended) finishMatch(next.winner, 'remote');
  }

  function updateGuest(dt) {
    moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2350, dt);
    localPaddle.x = clamp(localPaddle.x, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);
    localPaddle.y = clamp(localPaddle.y, FIELD.middle + FIELD.paddleRadius + 10, FIELD.bottom - FIELD.paddleRadius);
    const opponentTarget = { x: display.opponentX, y: display.opponentY };
    moveObject(remotePaddle, opponentTarget.x, opponentTarget.y, 1900, dt);
    remotePaddle.x = clamp(remotePaddle.x, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);
    remotePaddle.y = clamp(remotePaddle.y, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 10);
    simulateBall(predictedPuck, dt, localPaddle, remotePaddle, false);

    const age = Math.min(0.12, Math.max(0, (performance.now() - authoritative.receivedAt) / 1000));
    const targetX = authoritative.x + authoritative.vx * age;
    const targetY = authoritative.y + authoritative.vy * age;
    const distance = Math.hypot(predictedPuck.x - targetX, predictedPuck.y - targetY);
    if (distance > NET.snapDistance) {
      predictedPuck.x = targetX;
      predictedPuck.y = targetY;
      predictedPuck.vx = authoritative.vx;
      predictedPuck.vy = authoritative.vy;
    } else {
      const correction = 1 - Math.exp(-NET.correctionRate * dt);
      predictedPuck.x = lerp(predictedPuck.x, targetX, correction);
      predictedPuck.y = lerp(predictedPuck.y, targetY, correction);
      predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, correction * 0.45);
      predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, correction * 0.45);
    }
  }

  function maybeSendGuestInput(now) {
    const transformedX = FIELD.width - localPaddle.x;
    const transformedY = FIELD.height - localPaddle.y;
    const moved = !Number.isFinite(lastInputX) || Math.hypot(transformedX - lastInputX, transformedY - lastInputY) > 2;
    const keepAlive = now - lastInputKeepAlive >= NET.inputKeepAlive;
    if (now - lastInputSent < NET.inputInterval || (!moved && !keepAlive)) return;
    lastInputSent = now;
    lastInputKeepAlive = now;
    lastInputX = transformedX;
    lastInputY = transformedY;
    sendGame(['i', round1(transformedX), round1(transformedY), Date.now()]);
  }

  function scheduleDisconnectCheck() {
    clearTimeout(disconnectTimer);
    disconnectTimer = setTimeout(() => {
      if (mode === 'playing' && transport === 'p2p' && peer?.connectionState !== 'connected') {
        transport = 'relay';
        if (bestComboHud) bestComboHud.textContent = '相容模式';
        updateOnlineHud();
      }
    }, 1800);
  }

  function gameLoop(now) {
    if (mode !== 'playing') return;
    const dt = Math.min(0.032, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    if (role === 'host') {
      simulateHost(dt);
      if (now - lastStateSent >= NET.stateInterval) {
        lastStateSent = now;
        sendState();
      }
    } else {
      updateGuest(dt);
      maybeSendGuestInput(now);
    }
    if (now - lastPingSent >= 1800) {
      lastPingSent = now;
      lastPingId += 1;
      sendControl({ type: 'ping', id: lastPingId, sentAt: Date.now() });
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
    const width = Math.round(viewport?.width || document.documentElement.clientWidth || innerWidth);
    const height = Math.round(viewport?.height || document.documentElement.clientHeight || innerHeight);
    return { width: Math.max(280, width), height: Math.max(420, height) };
  }

  function setupCanvas(force = false) {
    const { width, height } = viewportSize();
    const scale = Math.min(width / FIELD.width, height / FIELD.height);
    const cssWidth = Math.round(FIELD.width * scale);
    const cssHeight = Math.round(FIELD.height * scale);
    if (!force && cssWidth === render.cssWidth && cssHeight === render.cssHeight) return;
    const mobile = matchMedia?.('(pointer: coarse)')?.matches || width < 700;
    render.scale = mobile ? 0.72 : 0.95;
    render.cssWidth = cssWidth;
    render.cssHeight = cssHeight;
    render.left = Math.round((width - cssWidth) / 2);
    render.top = Math.round((height - cssHeight) / 2);
    canvas.width = Math.round(FIELD.width * render.scale);
    canvas.height = Math.round(FIELD.height * render.scale);
    Object.assign(canvas.style, {
      width: `${cssWidth}px`,
      height: `${cssHeight}px`,
      left: `${render.left}px`,
      top: `${render.top}px`,
      right: 'auto',
      bottom: 'auto'
    });
    buildRenderAssets();
  }

  function scheduleCanvasLayout() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (['countdown', 'playing'].includes(mode)) {
        const oldWidth = render.cssWidth;
        const oldHeight = render.cssHeight;
        const { width, height } = viewportSize();
        const scale = Math.min(width / FIELD.width, height / FIELD.height);
        const newWidth = Math.round(FIELD.width * scale);
        const newHeight = Math.round(FIELD.height * scale);
        Object.assign(canvas.style, {
          width: `${newWidth}px`,
          height: `${newHeight}px`,
          left: `${Math.round((width - newWidth) / 2)}px`,
          top: `${Math.round((height - newHeight) / 2)}px`
        });
        render.cssWidth = newWidth;
        render.cssHeight = newHeight;
        if (Math.abs(oldWidth - newWidth) > 80 || Math.abs(oldHeight - newHeight) > 100) buildRenderAssets();
      }
    }, 180);
  }

  function logicalPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * FIELD.width,
      y: ((event.clientY - rect.top) / rect.height) * FIELD.height
    };
  }

  canvas.addEventListener('pointerdown', event => {
    if (mode !== 'playing' || pointerId !== null) return;
    const position = logicalPosition(event);
    if (position.y < FIELD.middle - 30) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    localPaddle.targetX = position.x;
    localPaddle.targetY = position.y - 48;
  }, { passive: true });

  canvas.addEventListener('pointermove', event => {
    if (mode !== 'playing' || pointerId !== event.pointerId) return;
    const samples = event.getCoalescedEvents?.() || [event];
    const position = logicalPosition(samples[samples.length - 1]);
    localPaddle.targetX = position.x;
    localPaddle.targetY = position.y - 48;
  }, { passive: true });

  function releasePointer(event) {
    if (pointerId === event.pointerId) pointerId = null;
  }

  canvas.addEventListener('pointerup', releasePointer, { passive: true });
  canvas.addEventListener('pointercancel', releasePointer, { passive: true });
  canvas.addEventListener('lostpointercapture', releasePointer, { passive: true });

  function makeLayer(width, height) {
    const layer = document.createElement('canvas');
    layer.width = Math.max(1, Math.round(width * render.scale));
    layer.height = Math.max(1, Math.round(height * render.scale));
    const layerContext = layer.getContext('2d', { alpha: true });
    layerContext.setTransform(render.scale, 0, 0, render.scale, 0, 0);
    return { canvas: layer, context: layerContext };
  }

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    if (context.roundRect) {
      context.roundRect(x, y, width, height, radius);
      return;
    }
    const safe = Math.min(radius, width / 2, height / 2);
    context.moveTo(x + safe, y);
    context.arcTo(x + width, y, x + width, y + height, safe);
    context.arcTo(x + width, y + height, x, y + height, safe);
    context.arcTo(x, y + height, x, y, safe);
    context.arcTo(x, y, x + width, y, safe);
    context.closePath();
  }

  function buildStaticLayer() {
    const { canvas: layer, context } = makeLayer(FIELD.width, FIELD.height);
    const background = context.createLinearGradient(0, 0, 0, FIELD.height);
    background.addColorStop(0, '#8adcf2');
    background.addColorStop(1, '#e8fbff');
    context.fillStyle = background;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    context.fillStyle = 'rgba(36,78,96,.13)';
    roundedRect(context, FIELD.left + 8, FIELD.top + 10, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top, 44);
    context.fill();

    const rink = context.createLinearGradient(0, FIELD.top, 0, FIELD.bottom);
    rink.addColorStop(0, '#c8f0e9');
    rink.addColorStop(1, '#8fd9ce');
    context.fillStyle = rink;
    context.strokeStyle = '#35566a';
    context.lineWidth = 8;
    roundedRect(context, FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top, 44);
    context.fill();
    context.stroke();

    context.strokeStyle = 'rgba(255,255,255,.92)';
    context.lineWidth = 7;
    context.setLineDash([26, 25]);
    context.beginPath();
    context.moveTo(FIELD.left + 34, FIELD.middle);
    context.lineTo(FIELD.right - 34, FIELD.middle);
    context.stroke();
    context.setLineDash([]);

    context.beginPath();
    context.arc(500, FIELD.middle, 108, 0, Math.PI * 2);
    context.stroke();

    context.lineWidth = 18;
    context.lineCap = 'round';
    context.strokeStyle = '#f39a7c';
    context.beginPath();
    context.moveTo(FIELD.goalLeft, FIELD.top);
    context.lineTo(FIELD.goalRight, FIELD.top);
    context.stroke();
    context.strokeStyle = '#58c696';
    context.beginPath();
    context.moveTo(FIELD.goalLeft, FIELD.bottom);
    context.lineTo(FIELD.goalRight, FIELD.bottom);
    context.stroke();
    context.lineCap = 'butt';
    return layer;
  }

  function buildShellSprite(type) {
    const size = 210;
    const { canvas: layer, context } = makeLayer(size, size);
    const r = 82;
    context.translate(size / 2, size / 2);
    context.fillStyle = 'rgba(35,62,78,.2)';
    context.beginPath();
    context.ellipse(6, 10, r * 0.98, r * 0.84, 0, 0, Math.PI * 2);
    context.fill();
    const gradient = context.createRadialGradient(-r * 0.28, -r * 0.3, 3, 0, 0, r);
    if (type === 'turtle') {
      gradient.addColorStop(0, '#ecf9b8');
      gradient.addColorStop(0.45, '#62ca98');
      gradient.addColorStop(1, '#34785f');
    } else {
      gradient.addColorStop(0, '#fff1cc');
      gradient.addColorStop(0.46, '#f6ab83');
      gradient.addColorStop(1, '#c96c69');
    }
    context.fillStyle = gradient;
    context.strokeStyle = '#36586b';
    context.lineWidth = 8;
    context.beginPath();
    context.ellipse(0, 0, r * 0.98, r * 0.84, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.strokeStyle = 'rgba(54,88,107,.58)';
    context.lineWidth = 5;
    context.lineCap = 'round';
    if (type === 'turtle') {
      context.beginPath();
      context.moveTo(-42, -31); context.lineTo(0, 35); context.lineTo(42, -31);
      context.moveTo(-19, -4); context.lineTo(0, -40); context.lineTo(19, -4);
      context.stroke();
    } else {
      context.beginPath();
      for (let angle = 0; angle < Math.PI * 5.2; angle += 0.13) {
        const sr = r * (0.06 + (angle / (Math.PI * 5.2)) * 0.58);
        const x = Math.cos(angle) * sr;
        const y = Math.sin(angle) * sr * 0.84;
        if (angle === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    }
    return layer;
  }

  function buildPuckSprite() {
    const size = 90;
    const { canvas: layer, context } = makeLayer(size, size);
    const r = 30;
    context.translate(size / 2, size / 2);
    context.fillStyle = 'rgba(35,62,78,.18)';
    context.beginPath();
    context.ellipse(4, 7, r * 0.95, r * 0.72, 0, 0, Math.PI * 2);
    context.fill();
    const gradient = context.createRadialGradient(-10, -12, 1, 0, 0, r);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(0.45, '#fff3ae');
    gradient.addColorStop(1, '#f1bd50');
    context.fillStyle = gradient;
    context.strokeStyle = '#36586b';
    context.lineWidth = 6;
    context.beginPath();
    context.arc(0, 0, r, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    return layer;
  }

  function buildRenderAssets() {
    render.staticLayer = buildStaticLayer();
    render.turtleSprite = buildShellSprite('turtle');
    render.shellSprite = buildShellSprite('shell');
    render.puckSprite = buildPuckSprite();
  }

  function drawSprite(sprite, x, y, logicalSize) {
    if (!sprite) return;
    ctx.drawImage(
      sprite,
      (x - logicalSize / 2) * render.scale,
      (y - logicalSize / 2) * render.scale,
      logicalSize * render.scale,
      logicalSize * render.scale
    );
  }

  function draw() {
    if (!render.staticLayer) setupCanvas(true);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(render.staticLayer, 0, 0);
    const ball = role === 'host' ? puck : predictedPuck;
    const opponent = remotePaddle;
    drawSprite(render.shellSprite, opponent.x, opponent.y, 210);
    drawSprite(render.turtleSprite, localPaddle.x, localPaddle.y, 210);
    drawSprite(render.puckSprite, ball.x, ball.y, 90);
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
    if (wasActive) sendControl({ type: 'leave', reason });
    clearTimers();
    cancelAnimationFrame(animationFrame);
    pointerId = null;
    if (wasActive && client && user) safeCancelServerMatch();
    closePeer();
    if (signalChannel && client) {
      try { await client.removeChannel(signalChannel); } catch (_) {}
    }
    if (token !== attemptToken) return;
    signalChannel = null;
    role = null;
    matchId = null;
    peerSeen = false;
    started = false;
    ended = false;
    startOffer = null;
    transport = 'none';
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

  addEventListener('resize', scheduleCanvasLayout, { passive: true });
  addEventListener('orientationchange', () => setTimeout(scheduleCanvasLayout, 180), { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleCanvasLayout, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleCanvasLayout, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'playing') lastRemoteMessage = performance.now();
  });

  window.BubbleMultiplayer = {
    start: startQueue,
    leave,
    isActive: () => !['idle', 'error'].includes(mode),
    transport: () => transport
  };
})();
