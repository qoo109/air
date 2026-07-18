(() => {
  'use strict';

  const quick = document.getElementById('quick-match-btn');
  const status = document.getElementById('match-status');

  const required = (source, from, to, label) => {
    if (!source.includes(from)) throw new Error(`v4.2.1 patch missing: ${label}`);
    return source.replace(from, to);
  };

  async function boot() {
    if (quick) {
      quick.disabled = true;
      quick.textContent = '🌐 Metered TURN 載入中…';
    }

    let source = await fetch(`multiplayer-v408.js?v=4.2.1-${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });

    source = required(
      source,
      "storageKey: 'bubble-island-auth-v408'",
      "storageKey: 'bubble-island-auth-v421'",
      'auth storage',
    );

    source = required(
      source,
      'realtime: { params: { eventsPerSecond: 25 } }',
      'realtime: { params: { eventsPerSecond: 35 } }',
      'signaling rate',
    );

    source = required(
      source,
      `stateInterval: 50,\n    inputInterval: 33,\n    inputKeepAlive: 180,\n    correctionRate: 9,\n    snapDistance: 230,\n    p2pTimeout: 8500,\n    disconnectTimeout: 9500`,
      `stateInterval: 36,\n    inputInterval: 24,\n    inputKeepAlive: 160,\n    correctionRate: 7.5,\n    snapDistance: 300,\n    p2pTimeout: 16000,\n    disconnectTimeout: 12000`,
      'network timing',
    );

    source = required(
      source,
      `const ICE_SERVERS = [\n    { urls: 'stun:stun.cloudflare.com:3478' },\n    { urls: 'stun:stun.l.google.com:19302' },\n    { urls: 'stun:stun1.l.google.com:19302' }\n  ];`,
      `let ICE_SERVERS = [\n    { urls: 'stun:stun.cloudflare.com:3478' },\n    { urls: 'stun:stun.l.google.com:19302' }\n  ];\n  let turnCredentialExpiresAt = 0;\n  let routeLabel = 'WEBRTC';\n\n  async function loadTurnIceServers() {\n    if (turnCredentialExpiresAt > Date.now() + 120000 && ICE_SERVERS.some(server => {\n      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];\n      return urls.some(url => typeof url === 'string' && /^turns?:/i.test(url));\n    })) return;\n\n    setStatus('正在取得 Metered TURN 路由…');\n    if (queueOnline) queueOnline.textContent = '連線狀態：取得 Metered 憑證';\n    const result = await client.functions.invoke('turn-credentials', { body: {} });\n    if (result.error) {\n      const detail = result.error?.context?.body || result.error.message || 'TURN Edge Function 無法使用';\n      throw new Error('Metered TURN 尚未完成設定：' + detail);\n    }\n    const servers = Array.isArray(result.data?.iceServers) ? result.data.iceServers : [];\n    const hasTurn = servers.some(server => {\n      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];\n      return urls.some(url => typeof url === 'string' && /^turns?:/i.test(url));\n    });\n    if (!hasTurn) throw new Error('Metered 沒有回傳 TURN 伺服器。');\n    ICE_SERVERS = servers;\n    turnCredentialExpiresAt = Number(result.data?.expiresAt) || Date.now() + 12 * 60 * 1000;\n  }\n\n  async function detectWebRtcRoute() {\n    if (!peer) return;\n    try {\n      const stats = await peer.getStats();\n      let selectedPair = null;\n      const localCandidates = new Map();\n      stats.forEach(report => {\n        if (report.type === 'local-candidate') localCandidates.set(report.id, report);\n        if (report.type === 'candidate-pair' && report.state === 'succeeded' && (report.selected || report.nominated)) selectedPair = report;\n      });\n      const local = selectedPair ? localCandidates.get(selectedPair.localCandidateId) : null;\n      routeLabel = local?.candidateType === 'relay' ? 'METERED' : 'P2P';\n      if (queueOnline) queueOnline.textContent = routeLabel === 'METERED' ? '連線狀態：Metered TURN' : '連線狀態：WebRTC P2P';\n      updateOnlineHud();\n    } catch (_) {\n      routeLabel = 'WEBRTC';\n    }\n  }`,
      'Metered TURN credential loader',
    );

    source = required(
      source,
      `await ensureAuth();\n      if (token !== attemptToken) return;\n      await safeCancelServerMatch();`,
      `await ensureAuth();\n      if (token !== attemptToken) return;\n      await loadTurnIceServers();\n      if (token !== attemptToken) return;\n      await safeCancelServerMatch();`,
      'load TURN before matchmaking',
    );

    source = required(
      source,
      `peer = new RTCPeerConnection({\n      iceServers: ICE_SERVERS,\n      iceCandidatePoolSize: 4,\n      bundlePolicy: 'max-bundle'\n    });`,
      `peer = new RTCPeerConnection({\n      iceServers: ICE_SERVERS,\n      iceCandidatePoolSize: 6,\n      bundlePolicy: 'max-bundle',\n      iceTransportPolicy: 'all'\n    });`,
      'peer TURN configuration',
    );

    source = required(
      source,
      `transport = 'p2p';\n      clearTimeout(connectTimeout);\n      connectTimeout = null;\n      setStatus(\`已與 \${opponentName} 直接連線，準備開局…\`);\n      if (queueOnline) queueOnline.textContent = '連線狀態：WebRTC P2P';\n      if (role === 'host') sendStartOffer();`,
      `transport = 'p2p';\n      routeLabel = 'WEBRTC';\n      clearTimeout(connectTimeout);\n      connectTimeout = null;\n      setStatus(\`已與 \${opponentName} 建立 WebRTC，準備開局…\`);\n      if (queueOnline) queueOnline.textContent = '連線狀態：檢查 P2P／Metered TURN';\n      detectWebRtcRoute();\n      if (role === 'host') sendStartOffer();`,
      'route detection',
    );

    source = required(
      source,
      `if (bestComboHud) bestComboHud.textContent = transport === 'p2p' ? 'P2P 直連' : '相容模式';`,
      `if (bestComboHud) bestComboHud.textContent = transport === 'p2p' ? routeLabel + ' 模式' : '相容模式';`,
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
      `.on('broadcast', { event: 'relay-ready-v408' }, ({ payload }) => {\n        if (!payload || payload.from === role) return;\n        peerSeen = true;\n        if (role === 'host' && transport === 'relay') sendStartOffer();\n      })`,
      `.on('broadcast', { event: 'relay-ready-v408' }, ({ payload }) => {\n        if (!payload || payload.from === role) return;\n        peerSeen = true;\n        if (transport !== 'p2p') {\n          closePeer();\n          transport = 'relay';\n          relayReady = true;\n          if (queueOnline) queueOnline.textContent = '連線狀態：Realtime 緊急備援';\n          sendSignal('relay-ready-v408', { from: role, name: playerName });\n        }\n        if (role === 'host') sendStartOffer();\n      })`,
      'relay fallback handshake',
    );

    source = source
      .replaceAll('hello-v408', 'hello-v421')
      .replaceAll('sdp-offer-v408', 'sdp-offer-v421')
      .replaceAll('sdp-answer-v408', 'sdp-answer-v421')
      .replaceAll('ice-v408', 'ice-v421')
      .replaceAll('relay-ready-v408', 'relay-ready-v421')
      .replaceAll('relay-control-v408', 'relay-control-v421')
      .replaceAll('relay-game-v408', 'relay-game-v421');

    Function(`${source}\n//# sourceURL=multiplayer-v421-runtime.js`)();

    if (quick) {
      quick.disabled = false;
      quick.textContent = '⚡ Metered TURN 快速配對';
    }
  }

  boot().catch((error) => {
    console.error('Bubble multiplayer v4.2.1 failed to load', error);
    if (quick) {
      quick.disabled = true;
      quick.textContent = '⚠ Metered TURN 載入失敗';
    }
    if (status) status.textContent = `Metered TURN 引擎載入失敗：${error.message}`;
  });
})();
