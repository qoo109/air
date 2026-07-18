(() => {
  'use strict';

  const quick = document.getElementById('quick-match-btn');
  const status = document.getElementById('match-status');

  const required = (source, from, to, label) => {
    if (!source.includes(from)) throw new Error(`v4.3.0 patch missing: ${label}`);
    return source.replace(from, to);
  };

  async function boot() {
    if (quick) {
      quick.disabled = true;
      quick.textContent = '🌐 v4.3 連線引擎載入中…';
    }

    let source = await fetch(`multiplayer-v408.js?v=4.3.0-${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });

    source = required(source,
      "storageKey: 'bubble-island-auth-v408'",
      "storageKey: 'bubble-island-auth-v430'",
      'auth storage');

    source = required(source,
      'realtime: { params: { eventsPerSecond: 25 } }',
      'realtime: { params: { eventsPerSecond: 30 } }',
      'signaling rate');

    source = required(source,
      `stateInterval: 50,\n    inputInterval: 33,\n    inputKeepAlive: 180,\n    correctionRate: 9,\n    snapDistance: 230,\n    p2pTimeout: 8500,\n    disconnectTimeout: 9500`,
      `stateInterval: 40,\n    inputInterval: 28,\n    inputKeepAlive: 170,\n    correctionRate: 5.2,\n    snapDistance: 440,\n    p2pTimeout: 5200,\n    disconnectTimeout: 14000`,
      'network timing');

    source = required(source,
      `const ICE_SERVERS = [\n    { urls: 'stun:stun.cloudflare.com:3478' },\n    { urls: 'stun:stun.l.google.com:19302' },\n    { urls: 'stun:stun1.l.google.com:19302' }\n  ];`,
      `let ICE_SERVERS = [\n    { urls: 'stun:stun.cloudflare.com:3478' },\n    { urls: 'stun:stun.l.google.com:19302' }\n  ];\n  let turnCredentialExpiresAt = 0;\n  let routeLabel = 'WEBRTC';\n  let relayOnlyAttempt = /(?:^|[?&])forceTurn=1(?:&|$)/.test(location.search);\n  let meteredRetryStarted = relayOnlyAttempt;\n  let suppressPeerClose = false;\n  let jitter = 0;\n  let lastLatencySample = 0;\n  let lastStateSequence = 0;\n\n  function normalizeIceServers(servers) {\n    const expanded = [];\n    for (const server of servers || []) {\n      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls || server?.url];\n      for (const url of urls) {\n        if (typeof url !== 'string' || !url) continue;\n        expanded.push({\n          urls: url,\n          ...(server.username ? { username: server.username } : {}),\n          ...(server.credential ? { credential: server.credential } : {}),\n        });\n      }\n    }\n    const score = (server) => {\n      const url = String(server.urls || '').toLowerCase();\n      if (url.startsWith('turn:') && !url.includes('transport=tcp')) return 0;\n      if (url.startsWith('turns:')) return 1;\n      if (url.startsWith('turn:')) return 2;\n      return 3;\n    };\n    return expanded.sort((a, b) => score(a) - score(b));\n  }\n\n  async function loadTurnIceServers() {\n    if (turnCredentialExpiresAt > Date.now() + 120000 && ICE_SERVERS.some(server => /^turns?:/i.test(String(server.urls || '')))) return;\n    setStatus('正在取得 Metered 低延遲路由…');\n    if (queueOnline) queueOnline.textContent = '連線狀態：取得 Metered 憑證';\n    const result = await client.functions.invoke('turn-credentials', { body: {} });\n    if (result.error) {\n      const detail = result.error?.context?.body || result.error.message || 'TURN Edge Function 無法使用';\n      throw new Error('Metered TURN 設定錯誤：' + detail);\n    }\n    const servers = normalizeIceServers(Array.isArray(result.data?.iceServers) ? result.data.iceServers : []);\n    if (!servers.some(server => /^turns?:/i.test(String(server.urls || '')))) throw new Error('Metered 沒有回傳 TURN 伺服器。');\n    ICE_SERVERS = servers;\n    turnCredentialExpiresAt = Number(result.data?.expiresAt) || Date.now() + 12 * 60 * 1000;\n  }\n\n  async function detectWebRtcRoute(attempt = 0) {\n    if (!peer) return;\n    try {\n      const stats = await peer.getStats();\n      const reports = new Map();\n      stats.forEach(report => reports.set(report.id, report));\n      let pair = null;\n      stats.forEach(report => {\n        if (report.type === 'transport' && report.selectedCandidatePairId) pair = reports.get(report.selectedCandidatePairId) || pair;\n        if (report.type === 'candidate-pair' && report.state === 'succeeded' && (report.selected || report.nominated)) pair = report;\n      });\n      const local = pair ? reports.get(pair.localCandidateId) : null;\n      const remote = pair ? reports.get(pair.remoteCandidateId) : null;\n      if (pair) {\n        routeLabel = local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'METERED' : 'P2P';\n        if (Number.isFinite(pair.currentRoundTripTime) && pair.currentRoundTripTime > 0) {\n          const sample = Math.max(1, Math.round(pair.currentRoundTripTime * 500));\n          jitter = lastLatencySample ? jitter * 0.75 + Math.abs(sample - lastLatencySample) * 0.25 : 0;\n          lastLatencySample = sample;\n          latency = latency ? Math.round(latency * 0.72 + sample * 0.28) : sample;\n        }\n        if (queueOnline) queueOnline.textContent = routeLabel === 'METERED' ? '連線狀態：Metered TURN' : '連線狀態：WebRTC P2P';\n        updateOnlineHud();\n        return;\n      }\n    } catch (_) {}\n    if (attempt < 5 && peer) setTimeout(() => detectWebRtcRoute(attempt + 1), 300 + attempt * 300);\n  }\n\n  function retryWithMeteredRelay(reason = 'P2P 無法建立') {\n    if (transport === 'p2p' || relayOnlyAttempt || meteredRetryStarted) return false;\n    meteredRetryStarted = true;\n    relayOnlyAttempt = true;\n    setStatus(reason + '，改用 Metered TURN 重試…');\n    if (queueOnline) queueOnline.textContent = '連線狀態：切換 Metered TURN';\n    suppressPeerClose = true;\n    closePeer();\n    suppressPeerClose = false;\n    transport = 'none';\n    remoteDescriptionReady = false;\n    makingOffer = false;\n    sendHello();\n    if (role === 'host' && peerSeen) setTimeout(() => makeHostOffer(), 140);\n    clearTimeout(connectTimeout);\n    connectTimeout = setTimeout(() => {\n      if (mode === 'connecting' && transport === 'none') activateRelayFallback('Metered TURN 仍無法建立');\n    }, 8500);\n    return true;\n  }`,
      'Metered auto route');

    source = required(source,
      `const display = { opponentX: 500, opponentY: 270 };`,
      `const display = { opponentX: 500, opponentY: 270, vx: 0, vy: 0, receivedAt: 0 };\n  const remoteInput = { x: 500, y: 270, vx: 0, vy: 0, receivedAt: 0 };`,
      'prediction state');

    source = required(source,
      `let lastInputX = NaN;\n  let lastInputY = NaN;\n  let lastPingId = 0;`,
      `let lastInputX = NaN;\n  let lastInputY = NaN;\n  let lastInputSampleAt = 0;\n  let lastPingId = 0;`,
      'input velocity state');

    source = required(source,
      `await ensureAuth();\n      if (token !== attemptToken) return;\n      await safeCancelServerMatch();`,
      `await ensureAuth();\n      if (token !== attemptToken) return;\n      await loadTurnIceServers();\n      if (token !== attemptToken) return;\n      await safeCancelServerMatch();`,
      'load TURN before matchmaking');

    source = required(source,
      `if (gameChannel?.readyState === 'open' && gameChannel.bufferedAmount < 48000) {`,
      `if (gameChannel?.readyState === 'open' && gameChannel.bufferedAmount < 10000) {`,
      'drop stale game packets');

    source = required(source,
      `function closePeer() {\n    remoteDescriptionReady = false;\n    pendingIce.length = 0;\n    try { controlChannel?.close(); } catch (_) {}\n    try { gameChannel?.close(); } catch (_) {}\n    try { peer?.close(); } catch (_) {}\n    controlChannel = null;\n    gameChannel = null;\n    peer = null;\n  }`,
      `function closePeer() {\n    remoteDescriptionReady = false;\n    pendingIce.length = 0;\n    const closingPeer = peer;\n    if (closingPeer) {\n      closingPeer.onconnectionstatechange = null;\n      closingPeer.oniceconnectionstatechange = null;\n      closingPeer.ondatachannel = null;\n    }\n    try { controlChannel?.close(); } catch (_) {}\n    try { gameChannel?.close(); } catch (_) {}\n    try { closingPeer?.close(); } catch (_) {}\n    controlChannel = null;\n    gameChannel = null;\n    peer = null;\n  }`,
      'safe peer close');

    source = required(source,
      `peer = new RTCPeerConnection({\n      iceServers: ICE_SERVERS,\n      iceCandidatePoolSize: 4,\n      bundlePolicy: 'max-bundle'\n    });`,
      `peer = new RTCPeerConnection({\n      iceServers: ICE_SERVERS,\n      iceCandidatePoolSize: 8,\n      bundlePolicy: 'max-bundle',\n      iceTransportPolicy: relayOnlyAttempt ? 'relay' : 'all'\n    });`,
      'two-stage ICE policy');

    source = required(source,
      `if (state === 'failed' || state === 'closed') activateRelayFallback('P2P 無法建立，已切換相容模式');`,
      `if (!suppressPeerClose && (state === 'failed' || state === 'closed')) {\n        if (mode === 'connecting' && transport === 'none' && retryWithMeteredRelay('P2P 無法建立')) return;\n        activateRelayFallback('WebRTC 無法建立，已切換備援模式');\n      }`,
      'Metered retry on failure');

    source = required(source,
      `transport = 'p2p';\n      clearTimeout(connectTimeout);\n      connectTimeout = null;\n      setStatus(\`已與 \${opponentName} 直接連線，準備開局…\`);\n      if (queueOnline) queueOnline.textContent = '連線狀態：WebRTC P2P';\n      if (role === 'host') sendStartOffer();`,
      `transport = 'p2p';\n      routeLabel = relayOnlyAttempt ? 'METERED' : 'WEBRTC';\n      clearTimeout(connectTimeout);\n      connectTimeout = null;\n      setStatus(\`已與 \${opponentName} 建立低延遲連線，準備開局…\`);\n      if (queueOnline) queueOnline.textContent = relayOnlyAttempt ? '連線狀態：Metered TURN 已連線' : '連線狀態：檢查 P2P 路由';\n      setTimeout(() => detectWebRtcRoute(), 120);\n      if (role === 'host') sendStartOffer();`,
      'route detection');

    source = required(source,
      `if (bestComboHud) bestComboHud.textContent = transport === 'p2p' ? 'P2P 直連' : '相容模式';`,
      `if (bestComboHud) bestComboHud.textContent = transport === 'p2p' ? routeLabel + ' 模式' : '備援模式';`,
      'HUD route label');

    source = required(source,
      `function updateOnlineHud() {\n    const myScore = role === 'host' ? game.hostScore : game.guestScore;\n    const rivalScore = role === 'host' ? game.guestScore : game.hostScore;\n    if (playerScore) playerScore.textContent = \`\${playerName} \${myScore}\`;\n    if (aiScore) aiScore.textContent = \`\${opponentName} \${rivalScore}\`;\n    if (speedLabel) {\n      const label = transport === 'p2p' ? 'P2P' : transport === 'relay' ? 'RELAY' : 'ONLINE';\n      speedLabel.textContent = latency > 0 ? \`\${label} \${latency}ms\` : label;\n    }\n  }`,
      `function updateOnlineHud() {\n    const myScore = role === 'host' ? game.hostScore : game.guestScore;\n    const rivalScore = role === 'host' ? game.guestScore : game.hostScore;\n    const myNameLabel = playerScore?.parentElement?.querySelector('small');\n    const rivalNameLabel = aiScore?.parentElement?.querySelector('small');\n    if (myNameLabel) myNameLabel.textContent = playerName;\n    if (rivalNameLabel) rivalNameLabel.textContent = opponentName;\n    if (playerScore) playerScore.textContent = String(myScore);\n    if (aiScore) aiScore.textContent = String(rivalScore);\n    const label = transport === 'p2p' ? routeLabel : transport === 'relay' ? 'RELAY' : 'ONLINE';\n    const quality = latency <= 45 && jitter <= 14 ? '極佳' : latency <= 80 && jitter <= 28 ? '穩定' : latency <= 130 ? '普通' : '較慢';\n    hud?.classList.toggle('net-good', latency > 0 && latency <= 80);\n    hud?.classList.toggle('net-warn', latency > 80 && latency <= 130);\n    hud?.classList.toggle('net-bad', latency > 130);\n    if (speedLabel) speedLabel.textContent = latency > 0 ? \`\${label} \${latency}ms\` : label;\n    if (bestComboHud) bestComboHud.textContent = transport === 'p2p' ? quality : '備援模式';\n    if (streakHud) streakHud.textContent = role === 'host' ? '主場' : '客場';\n  }`,
      'compact HUD diagnostics');

    source = required(source,
      `if (packet.type === 'pong') {\n      latency = Math.max(1, Math.round((Date.now() - Number(packet.sentAt || Date.now())) / 2));\n      updateOnlineHud();\n      return;\n    }`,
      `if (packet.type === 'pong') {\n      const sample = Math.max(1, Math.round((Date.now() - Number(packet.sentAt || Date.now())) / 2));\n      jitter = lastLatencySample ? jitter * 0.75 + Math.abs(sample - lastLatencySample) * 0.25 : 0;\n      lastLatencySample = sample;\n      latency = latency ? Math.round(latency * 0.72 + sample * 0.28) : sample;\n      updateOnlineHud();\n      return;\n    }`,
      'stable latency meter');

    source = required(source,
      `if (packet[0] === 'i' && role === 'host') {\n      remotePaddle.targetX = clamp(Number(packet[1]) || 500, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);\n      remotePaddle.targetY = clamp(Number(packet[2]) || 270, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 12);\n      return;\n    }`,
      `if (packet[0] === 'i' && role === 'host') {\n      const now = performance.now();\n      const nextX = clamp(Number(packet[1]) || 500, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);\n      const nextY = clamp(Number(packet[2]) || 270, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 12);\n      const elapsed = Math.max(0.016, Math.min(0.18, (now - remoteInput.receivedAt) / 1000 || 0.033));\n      const suppliedVx = Number(packet[3]);\n      const suppliedVy = Number(packet[4]);\n      remoteInput.vx = Number.isFinite(suppliedVx) ? clamp(suppliedVx, -5200, 5200) : (nextX - remoteInput.x) / elapsed;\n      remoteInput.vy = Number.isFinite(suppliedVy) ? clamp(suppliedVy, -5200, 5200) : (nextY - remoteInput.y) / elapsed;\n      remoteInput.x = nextX;\n      remoteInput.y = nextY;\n      remoteInput.receivedAt = now;\n      remotePaddle.targetX = nextX;\n      remotePaddle.targetY = nextY;\n      return;\n    }`,
      'explicit remote paddle velocity');

    source = required(source,
      `moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2300, dt);\n    moveObject(remotePaddle, remotePaddle.targetX, remotePaddle.targetY, 1900, dt);`,
      `localPaddle.x = localPaddle.targetX;\n    localPaddle.y = localPaddle.targetY;\n    const remoteAge = Math.min(0.16, Math.max(0, (performance.now() - remoteInput.receivedAt) / 1000 + latency / 1000));\n    const predictedRemoteX = remoteInput.x + remoteInput.vx * remoteAge;\n    const predictedRemoteY = remoteInput.y + remoteInput.vy * remoteAge;\n    moveObject(remotePaddle, predictedRemoteX, predictedRemoteY, 4600, dt);`,
      'host direct local paddle');

    source = required(source,
      `display.opponentX = next.opponentX;\n    display.opponentY = next.opponentY;\n    Object.assign(authoritative, {`,
      `const displayNow = performance.now();\n    const displayElapsed = Math.max(0.016, Math.min(0.18, (displayNow - display.receivedAt) / 1000 || 0.040));\n    display.vx = (next.opponentX - display.opponentX) / displayElapsed;\n    display.vy = (next.opponentY - display.opponentY) / displayElapsed;\n    display.opponentX = next.opponentX;\n    display.opponentY = next.opponentY;\n    display.receivedAt = displayNow;\n    Object.assign(authoritative, {`,
      'guest opponent velocity tracking');

    source = required(source,
      `function receiveAuthoritativeState(packet) {\n    const previousGuestScore = game.guestScore;`,
      `function receiveAuthoritativeState(packet) {\n    const incomingSequence = Number(packet[1] || 0);\n    if (incomingSequence && incomingSequence <= lastStateSequence) return;\n    if (incomingSequence) lastStateSequence = incomingSequence;\n    const previousGuestScore = game.guestScore;`,
      'drop out-of-order states');

    source = required(source,
      `moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2350, dt);\n    localPaddle.x = clamp(localPaddle.x, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);\n    localPaddle.y = clamp(localPaddle.y, FIELD.middle + FIELD.paddleRadius + 10, FIELD.bottom - FIELD.paddleRadius);\n    const opponentTarget = { x: display.opponentX, y: display.opponentY };\n    moveObject(remotePaddle, opponentTarget.x, opponentTarget.y, 1900, dt);`,
      `localPaddle.x = clamp(localPaddle.targetX, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);\n    localPaddle.y = clamp(localPaddle.targetY, FIELD.middle + FIELD.paddleRadius + 10, FIELD.bottom - FIELD.paddleRadius);\n    const displayAge = Math.min(0.16, Math.max(0, (performance.now() - display.receivedAt) / 1000 + latency / 1000));\n    const opponentTarget = { x: display.opponentX + display.vx * displayAge, y: display.opponentY + display.vy * displayAge };\n    moveObject(remotePaddle, opponentTarget.x, opponentTarget.y, 4600, dt);`,
      'guest direct local paddle');

    source = required(source,
      `const age = Math.min(0.12, Math.max(0, (performance.now() - authoritative.receivedAt) / 1000));`,
      `const age = Math.min(0.18, Math.max(0, (performance.now() - authoritative.receivedAt) / 1000 + latency / 1000));`,
      'puck latency compensation');

    source = required(source,
      `predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, correction * 0.45);\n      predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, correction * 0.45);`,
      `predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, correction * 0.20);\n      predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, correction * 0.20);`,
      'soft puck velocity correction');

    source = required(source,
      `function maybeSendGuestInput(now) {\n    const transformedX = FIELD.width - localPaddle.x;\n    const transformedY = FIELD.height - localPaddle.y;\n    const moved = !Number.isFinite(lastInputX) || Math.hypot(transformedX - lastInputX, transformedY - lastInputY) > 2;\n    const keepAlive = now - lastInputKeepAlive >= NET.inputKeepAlive;\n    if (now - lastInputSent < NET.inputInterval || (!moved && !keepAlive)) return;\n    lastInputSent = now;\n    lastInputKeepAlive = now;\n    lastInputX = transformedX;\n    lastInputY = transformedY;\n    sendGame(['i', round1(transformedX), round1(transformedY), Date.now()]);\n  }`,
      `function maybeSendGuestInput(now) {\n    const transformedX = FIELD.width - localPaddle.x;\n    const transformedY = FIELD.height - localPaddle.y;\n    const moved = !Number.isFinite(lastInputX) || Math.hypot(transformedX - lastInputX, transformedY - lastInputY) > 1.5;\n    const keepAlive = now - lastInputKeepAlive >= NET.inputKeepAlive;\n    const adaptiveInputInterval = transport === 'p2p' ? NET.inputInterval : 50;\n    if (now - lastInputSent < adaptiveInputInterval || (!moved && !keepAlive)) return;\n    const elapsed = Math.max(0.016, Math.min(0.18, (now - lastInputSampleAt) / 1000 || 0.033));\n    const inputVx = Number.isFinite(lastInputX) ? (transformedX - lastInputX) / elapsed : 0;\n    const inputVy = Number.isFinite(lastInputY) ? (transformedY - lastInputY) / elapsed : 0;\n    lastInputSent = now;\n    lastInputKeepAlive = now;\n    lastInputSampleAt = now;\n    lastInputX = transformedX;\n    lastInputY = transformedY;\n    sendGame(['i', round1(transformedX), round1(transformedY), round1(inputVx), round1(inputVy), Date.now()]);\n  }`,
      'velocity input packets');

    source = required(source,
      `if (now - lastStateSent >= NET.stateInterval) {`,
      `if (now - lastStateSent >= (transport === 'p2p' ? NET.stateInterval : 65)) {`,
      'adaptive state rate');

    source = required(source,
      `function scheduleDisconnectCheck() {\n    clearTimeout(disconnectTimer);\n    disconnectTimer = setTimeout(() => {\n      if (mode === 'playing' && transport === 'p2p' && peer?.connectionState !== 'connected') {\n        transport = 'relay';\n        if (bestComboHud) bestComboHud.textContent = '相容模式';\n        updateOnlineHud();\n      }\n    }, 1800);\n  }`,
      `function scheduleDisconnectCheck() {\n    clearTimeout(disconnectTimer);\n    if (queueOnline && mode === 'playing') queueOnline.textContent = '連線狀態：短暫恢復中';\n    disconnectTimer = setTimeout(() => {\n      if (mode === 'playing' && transport === 'p2p' && peer?.connectionState !== 'connected') {\n        transport = 'relay';\n        routeLabel = 'RELAY';\n        relayReady = true;\n        sendSignal('relay-ready-v408', { from: role, name: playerName });\n        if (bestComboHud) bestComboHud.textContent = '備援模式';\n        updateOnlineHud();\n      }\n    }, 2600);\n  }`,
      'graceful disconnect fallback');

    source = required(source,
      `connectTimeout = setTimeout(() => {\n            if (mode === 'connecting' && token === attemptToken && transport === 'none') {\n              activateRelayFallback('P2P 連線逾時');\n            }\n          }, NET.p2pTimeout);`,
      `connectTimeout = setTimeout(() => {\n            if (mode === 'connecting' && token === attemptToken && transport === 'none') {\n              if (retryWithMeteredRelay('P2P 連線逾時')) return;\n              activateRelayFallback('Metered TURN 連線逾時');\n            }\n          }, NET.p2pTimeout);`,
      'two-stage connection timeout');

    source = required(source,
      `Object.assign(display, { opponentX: 500, opponentY: 270 });\n    lastInputX = lastInputY = NaN;`,
      `Object.assign(display, { opponentX: 500, opponentY: 270, vx: 0, vy: 0, receivedAt: performance.now() });\n    Object.assign(remoteInput, { x: 500, y: 270, vx: 0, vy: 0, receivedAt: performance.now() });\n    lastStateSequence = 0;\n    lastInputSampleAt = 0;\n    lastInputX = lastInputY = NaN;`,
      'reset prediction state');

    source = required(source,
      `render.scale = mobile ? 0.72 : 0.95;`,
      `render.scale = mobile ? 0.60 : 0.92;`,
      'mobile render resolution');

    source = required(source,
      `transport: () => transport`,
      `transport: () => transport === 'p2p' ? routeLabel.toLowerCase() : transport,\n    diagnostics: () => ({ transport, route: routeLabel, latency, jitter: Math.round(jitter), peerState: peer?.connectionState || 'none', iceState: peer?.iceConnectionState || 'none', relayOnlyAttempt })`,
      'diagnostics API');

    source = source
      .replaceAll('hello-v408', 'hello-v430')
      .replaceAll('sdp-offer-v408', 'sdp-offer-v430')
      .replaceAll('sdp-answer-v408', 'sdp-answer-v430')
      .replaceAll('ice-v408', 'ice-v430')
      .replaceAll('relay-ready-v408', 'relay-ready-v430')
      .replaceAll('relay-control-v408', 'relay-control-v430')
      .replaceAll('relay-game-v408', 'relay-game-v430');

    Function(`${source}\n//# sourceURL=multiplayer-v430-runtime.js`)();

    if (quick) {
      quick.disabled = false;
      quick.textContent = '⚡ 智慧低延遲配對';
    }
  }

  boot().catch((error) => {
    console.error('Bubble multiplayer v4.3.0 failed to load', error);
    if (quick) {
      quick.disabled = true;
      quick.textContent = '⚠ 多人引擎載入失敗';
    }
    if (status) status.textContent = `v4.3 多人引擎載入失敗：${error.message}`;
  });
})();
