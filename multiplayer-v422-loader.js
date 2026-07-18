(() => {
  'use strict';

  const quick = document.getElementById('quick-match-btn');
  const status = document.getElementById('match-status');

  const required = (source, from, to, label) => {
    if (!source.includes(from)) throw new Error(`v4.2.2 patch missing: ${label}`);
    return source.replace(from, to);
  };

  async function boot() {
    if (quick) {
      quick.disabled = true;
      quick.textContent = '🌐 低延遲引擎載入中…';
    }

    let source = await fetch(`multiplayer-v408.js?v=4.2.2-${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });

    source = required(
      source,
      "storageKey: 'bubble-island-auth-v408'",
      "storageKey: 'bubble-island-auth-v422'",
      'auth storage',
    );

    source = required(
      source,
      'realtime: { params: { eventsPerSecond: 25 } }',
      'realtime: { params: { eventsPerSecond: 30 } }',
      'signaling rate',
    );

    source = required(
      source,
      `stateInterval: 50,\n    inputInterval: 33,\n    inputKeepAlive: 180,\n    correctionRate: 9,\n    snapDistance: 230,\n    p2pTimeout: 8500,\n    disconnectTimeout: 9500`,
      `stateInterval: 42,\n    inputInterval: 30,\n    inputKeepAlive: 180,\n    correctionRate: 5.4,\n    snapDistance: 420,\n    p2pTimeout: 12000,\n    disconnectTimeout: 12000`,
      'network timing',
    );

    source = required(
      source,
      `const ICE_SERVERS = [\n    { urls: 'stun:stun.cloudflare.com:3478' },\n    { urls: 'stun:stun.l.google.com:19302' },\n    { urls: 'stun:stun1.l.google.com:19302' }\n  ];`,
      `let ICE_SERVERS = [\n    { urls: 'stun:stun.cloudflare.com:3478' },\n    { urls: 'stun:stun.l.google.com:19302' }\n  ];\n  let turnCredentialExpiresAt = 0;\n  let routeLabel = 'WEBRTC';\n  const FORCE_METERED_TURN = matchMedia?.('(pointer: coarse)')?.matches || /(?:^|[?&])forceTurn=1(?:&|$)/.test(location.search);\n\n  function normalizeIceServers(servers) {\n    const expanded = [];\n    for (const server of servers || []) {\n      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls || server?.url];\n      for (const url of urls) {\n        if (typeof url !== 'string' || !url) continue;\n        expanded.push({\n          urls: url,\n          ...(server.username ? { username: server.username } : {}),\n          ...(server.credential ? { credential: server.credential } : {}),\n        });\n      }\n    }\n    const score = (server) => {\n      const url = String(server.urls || '').toLowerCase();\n      if (url.startsWith('turn:') && !url.includes('transport=tcp')) return 0;\n      if (url.startsWith('turns:')) return 1;\n      if (url.startsWith('turn:')) return 2;\n      return 3;\n    };\n    return expanded.sort((a, b) => score(a) - score(b));\n  }\n\n  async function loadTurnIceServers() {\n    if (turnCredentialExpiresAt > Date.now() + 120000 && ICE_SERVERS.some(server => /^turns?:/i.test(String(server.urls || '')))) return;\n    setStatus('正在取得 Metered 低延遲路由…');\n    if (queueOnline) queueOnline.textContent = '連線狀態：取得 Metered 憑證';\n    const result = await client.functions.invoke('turn-credentials', { body: {} });\n    if (result.error) {\n      const detail = result.error?.context?.body || result.error.message || 'TURN Edge Function 無法使用';\n      throw new Error('Metered TURN 設定錯誤：' + detail);\n    }\n    const servers = normalizeIceServers(Array.isArray(result.data?.iceServers) ? result.data.iceServers : []);\n    if (!servers.some(server => /^turns?:/i.test(String(server.urls || '')))) throw new Error('Metered 沒有回傳 TURN 伺服器。');\n    ICE_SERVERS = servers;\n    turnCredentialExpiresAt = Number(result.data?.expiresAt) || Date.now() + 12 * 60 * 1000;\n  }\n\n  async function detectWebRtcRoute(attempt = 0) {\n    if (!peer) return;\n    try {\n      const stats = await peer.getStats();\n      const reports = new Map();\n      stats.forEach(report => reports.set(report.id, report));\n      let pair = null;\n      stats.forEach(report => {\n        if (report.type === 'transport' && report.selectedCandidatePairId) pair = reports.get(report.selectedCandidatePairId) || pair;\n        if (report.type === 'candidate-pair' && report.state === 'succeeded' && (report.selected || report.nominated)) pair = report;\n      });\n      const local = pair ? reports.get(pair.localCandidateId) : null;\n      const remote = pair ? reports.get(pair.remoteCandidateId) : null;\n      if (pair) {\n        routeLabel = local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'METERED' : 'P2P';\n        if (Number.isFinite(pair.currentRoundTripTime) && pair.currentRoundTripTime > 0) {\n          latency = Math.max(1, Math.round(pair.currentRoundTripTime * 500));\n        }\n        if (queueOnline) queueOnline.textContent = routeLabel === 'METERED' ? '連線狀態：Metered TURN' : '連線狀態：WebRTC P2P';\n        updateOnlineHud();\n        return;\n      }\n    } catch (_) {}\n    if (attempt < 4 && peer) setTimeout(() => detectWebRtcRoute(attempt + 1), 350 + attempt * 350);\n  }`,
      'Metered TURN loader',
    );

    source = required(
      source,
      `const display = { opponentX: 500, opponentY: 270 };`,
      `const display = { opponentX: 500, opponentY: 270, vx: 0, vy: 0, receivedAt: 0 };\n  const remoteInput = { x: 500, y: 270, vx: 0, vy: 0, receivedAt: 0 };`,
      'prediction state',
    );

    source = required(
      source,
      `await ensureAuth();\n      if (token !== attemptToken) return;\n      await safeCancelServerMatch();`,
      `await ensureAuth();\n      if (token !== attemptToken) return;\n      await loadTurnIceServers();\n      if (token !== attemptToken) return;\n      await safeCancelServerMatch();`,
      'load TURN before matchmaking',
    );

    source = required(
      source,
      `if (gameChannel?.readyState === 'open' && gameChannel.bufferedAmount < 48000) {`,
      `if (gameChannel?.readyState === 'open' && gameChannel.bufferedAmount < 12000) {`,
      'drop stale game packets',
    );

    source = required(
      source,
      `peer = new RTCPeerConnection({\n      iceServers: ICE_SERVERS,\n      iceCandidatePoolSize: 4,\n      bundlePolicy: 'max-bundle'\n    });`,
      `peer = new RTCPeerConnection({\n      iceServers: ICE_SERVERS,\n      iceCandidatePoolSize: 8,\n      bundlePolicy: 'max-bundle',\n      iceTransportPolicy: FORCE_METERED_TURN ? 'relay' : 'all'\n    });`,
      'mobile Metered routing',
    );

    source = required(
      source,
      `transport = 'p2p';\n      clearTimeout(connectTimeout);\n      connectTimeout = null;\n      setStatus(\`已與 \${opponentName} 直接連線，準備開局…\`);\n      if (queueOnline) queueOnline.textContent = '連線狀態：WebRTC P2P';\n      if (role === 'host') sendStartOffer();`,
      `transport = 'p2p';\n      routeLabel = FORCE_METERED_TURN ? 'METERED' : 'WEBRTC';\n      clearTimeout(connectTimeout);\n      connectTimeout = null;\n      setStatus(\`已與 \${opponentName} 建立低延遲連線，準備開局…\`);\n      if (queueOnline) queueOnline.textContent = FORCE_METERED_TURN ? '連線狀態：Metered TURN 已連線' : '連線狀態：檢查連線路由';\n      setTimeout(() => detectWebRtcRoute(), 120);\n      if (role === 'host') sendStartOffer();`,
      'route detection',
    );

    source = required(
      source,
      `if (bestComboHud) bestComboHud.textContent = transport === 'p2p' ? 'P2P 直連' : '相容模式';`,
      `if (bestComboHud) bestComboHud.textContent = transport === 'p2p' ? routeLabel + ' 模式' : '備援模式';`,
      'HUD route label',
    );

    source = required(
      source,
      `const label = transport === 'p2p' ? 'P2P' : transport === 'relay' ? 'RELAY' : 'ONLINE';`,
      `const label = transport === 'p2p' ? routeLabel : transport === 'relay' ? 'RELAY' : 'ONLINE';`,
      'latency route label',
    );

    source = required(
      source,
      `if (packet[0] === 'i' && role === 'host') {\n      remotePaddle.targetX = clamp(Number(packet[1]) || 500, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);\n      remotePaddle.targetY = clamp(Number(packet[2]) || 270, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 12);\n      return;\n    }`,
      `if (packet[0] === 'i' && role === 'host') {\n      const now = performance.now();\n      const nextX = clamp(Number(packet[1]) || 500, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);\n      const nextY = clamp(Number(packet[2]) || 270, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 12);\n      const elapsed = Math.max(0.016, Math.min(0.18, (now - remoteInput.receivedAt) / 1000 || 0.033));\n      remoteInput.vx = (nextX - remoteInput.x) / elapsed;\n      remoteInput.vy = (nextY - remoteInput.y) / elapsed;\n      remoteInput.x = nextX;\n      remoteInput.y = nextY;\n      remoteInput.receivedAt = now;\n      remotePaddle.targetX = nextX;\n      remotePaddle.targetY = nextY;\n      return;\n    }`,
      'host remote paddle prediction input',
    );

    source = required(
      source,
      `moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2300, dt);\n    moveObject(remotePaddle, remotePaddle.targetX, remotePaddle.targetY, 1900, dt);`,
      `localPaddle.x = localPaddle.targetX;\n    localPaddle.y = localPaddle.targetY;\n    const remoteAge = Math.min(0.18, Math.max(0, (performance.now() - remoteInput.receivedAt) / 1000 + latency / 1000));\n    const predictedRemoteX = remoteInput.x + remoteInput.vx * remoteAge;\n    const predictedRemoteY = remoteInput.y + remoteInput.vy * remoteAge;\n    moveObject(remotePaddle, predictedRemoteX, predictedRemoteY, 4200, dt);`,
      'host direct local paddle',
    );

    source = required(
      source,
      `display.opponentX = next.opponentX;\n    display.opponentY = next.opponentY;\n    Object.assign(authoritative, {`,
      `const displayNow = performance.now();\n    const displayElapsed = Math.max(0.016, Math.min(0.18, (displayNow - display.receivedAt) / 1000 || 0.042));\n    display.vx = (next.opponentX - display.opponentX) / displayElapsed;\n    display.vy = (next.opponentY - display.opponentY) / displayElapsed;\n    display.opponentX = next.opponentX;\n    display.opponentY = next.opponentY;\n    display.receivedAt = displayNow;\n    Object.assign(authoritative, {`,
      'guest opponent velocity tracking',
    );

    source = required(
      source,
      `moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2350, dt);\n    localPaddle.x = clamp(localPaddle.x, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);\n    localPaddle.y = clamp(localPaddle.y, FIELD.middle + FIELD.paddleRadius + 10, FIELD.bottom - FIELD.paddleRadius);\n    const opponentTarget = { x: display.opponentX, y: display.opponentY };\n    moveObject(remotePaddle, opponentTarget.x, opponentTarget.y, 1900, dt);`,
      `localPaddle.x = clamp(localPaddle.targetX, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);\n    localPaddle.y = clamp(localPaddle.targetY, FIELD.middle + FIELD.paddleRadius + 10, FIELD.bottom - FIELD.paddleRadius);\n    const displayAge = Math.min(0.18, Math.max(0, (performance.now() - display.receivedAt) / 1000 + latency / 1000));\n    const opponentTarget = { x: display.opponentX + display.vx * displayAge, y: display.opponentY + display.vy * displayAge };\n    moveObject(remotePaddle, opponentTarget.x, opponentTarget.y, 4200, dt);`,
      'guest direct local paddle',
    );

    source = required(
      source,
      `const age = Math.min(0.12, Math.max(0, (performance.now() - authoritative.receivedAt) / 1000));`,
      `const age = Math.min(0.20, Math.max(0, (performance.now() - authoritative.receivedAt) / 1000 + latency / 1000));`,
      'puck latency compensation',
    );

    source = required(
      source,
      `predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, correction * 0.45);\n      predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, correction * 0.45);`,
      `predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, correction * 0.22);\n      predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, correction * 0.22);`,
      'soft puck velocity correction',
    );

    source = required(
      source,
      `const keepAlive = now - lastInputKeepAlive >= NET.inputKeepAlive;\n    if (now - lastInputSent < NET.inputInterval || (!moved && !keepAlive)) return;`,
      `const keepAlive = now - lastInputKeepAlive >= NET.inputKeepAlive;\n    const adaptiveInputInterval = transport === 'p2p' ? NET.inputInterval : 50;\n    if (now - lastInputSent < adaptiveInputInterval || (!moved && !keepAlive)) return;`,
      'adaptive input rate',
    );

    source = required(
      source,
      `if (now - lastStateSent >= NET.stateInterval) {`,
      `if (now - lastStateSent >= (transport === 'p2p' ? NET.stateInterval : 65)) {`,
      'adaptive state rate',
    );

    source = required(
      source,
      `render.scale = mobile ? 0.72 : 0.95;`,
      `render.scale = mobile ? 0.62 : 0.92;`,
      'mobile render resolution',
    );

    source = source
      .replaceAll('hello-v408', 'hello-v422')
      .replaceAll('sdp-offer-v408', 'sdp-offer-v422')
      .replaceAll('sdp-answer-v408', 'sdp-answer-v422')
      .replaceAll('ice-v408', 'ice-v422')
      .replaceAll('relay-ready-v408', 'relay-ready-v422')
      .replaceAll('relay-control-v408', 'relay-control-v422')
      .replaceAll('relay-game-v408', 'relay-game-v422');

    Function(`${source}\n//# sourceURL=multiplayer-v422-runtime.js`)();

    if (quick) {
      quick.disabled = false;
      quick.textContent = '⚡ 低延遲真人配對';
    }
  }

  boot().catch((error) => {
    console.error('Bubble multiplayer v4.2.2 failed to load', error);
    if (quick) {
      quick.disabled = true;
      quick.textContent = '⚠ 多人引擎載入失敗';
    }
    if (status) status.textContent = `低延遲引擎載入失敗：${error.message}`;
  });
})();
