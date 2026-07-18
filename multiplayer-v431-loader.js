(() => {
  'use strict';

  const quick = document.getElementById('quick-match-btn');
  const status = document.getElementById('match-status');

  const injectAfter = (source, marker, addition, label) => {
    if (!source.includes(marker)) throw new Error(`v4.3.1 loader patch missing: ${label}`);
    return source.replace(marker, `${addition}\n\n${marker}`);
  };

  async function boot() {
    if (quick) {
      quick.disabled = true;
      quick.textContent = '🌐 球體平滑引擎載入中…';
    }

    let loader = await fetch(`multiplayer-v430-loader.js?v=4.3.1-${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });

    const eventMarker = `    source = source\n      .replaceAll('hello-v408', 'hello-v430')`;

    const ballSmoothingPatches = String.raw`    source = required(source,
      \`stateInterval: 40,\n    inputInterval: 28,\n    inputKeepAlive: 170,\n    correctionRate: 5.2,\n    snapDistance: 440,\n    p2pTimeout: 5200,\n    disconnectTimeout: 14000\`,
      \`stateInterval: 32,\n    inputInterval: 24,\n    inputKeepAlive: 150,\n    correctionRate: 4.2,\n    snapDistance: 560,\n    p2pTimeout: 5200,\n    disconnectTimeout: 14000\`,
      'ball network cadence');

    source = required(source,
      \`let lastFrame = 0;\n  let lastStateSent = 0;\`,
      \`let lastFrame = 0;\n  let physicsAccumulator = 0;\n  const PHYSICS_STEP = 1 / 120;\n  let localHitGraceUntil = 0;\n  let lastStateSent = 0;\`,
      'fixed physics state');

    source = required(source,
      \`const authoritative = { x: 500, y: 850, vx: 120, vy: -500, receivedAt: 0 };\`,
      \`const authoritative = { x: 500, y: 850, vx: 120, vy: -500, receivedAt: 0, sentAt: 0 };\`,
      'authoritative packet time');

    source = required(source,
      \`Object.assign(authoritative, {\n      x: next.x,\n      y: next.y,\n      vx: next.vx,\n      vy: next.vy,\n      receivedAt: performance.now()\n    });\`,
      \`Object.assign(authoritative, {\n      x: next.x,\n      y: next.y,\n      vx: next.vx,\n      vy: next.vy,\n      receivedAt: performance.now(),\n      sentAt: Number(packet[14]) || 0\n    });\`,
      'state packet timestamp');

    source = required(source,
      \`simulateBall(predictedPuck, dt, localPaddle, remotePaddle, false);\n\n    const age = Math.min(0.18, Math.max(0, (performance.now() - authoritative.receivedAt) / 1000 + latency / 1000));\n    const targetX = authoritative.x + authoritative.vx * age;\n    const targetY = authoritative.y + authoritative.vy * age;\n    const distance = Math.hypot(predictedPuck.x - targetX, predictedPuck.y - targetY);\n    if (distance > NET.snapDistance) {\n      predictedPuck.x = targetX;\n      predictedPuck.y = targetY;\n      predictedPuck.vx = authoritative.vx;\n      predictedPuck.vy = authoritative.vy;\n    } else {\n      const correction = 1 - Math.exp(-NET.correctionRate * dt);\n      predictedPuck.x = lerp(predictedPuck.x, targetX, correction);\n      predictedPuck.y = lerp(predictedPuck.y, targetY, correction);\n      predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, correction * 0.20);\n      predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, correction * 0.20);\n    }\`,
      \`const beforeLocalVy = predictedPuck.vy;\n    simulateBall(predictedPuck, dt, localPaddle, remotePaddle, false);\n    const localContactDistance = Math.hypot(predictedPuck.x - localPaddle.x, predictedPuck.y - localPaddle.y);\n    if (beforeLocalVy > 35 && predictedPuck.vy < -35 && localContactDistance < FIELD.paddleRadius + FIELD.puckRadius + 58) {\n      localHitGraceUntil = performance.now() + 130 + Math.min(110, latency);\n    }\n\n    const receivedAge = Math.max(0, (performance.now() - authoritative.receivedAt) / 1000);\n    const clockAge = authoritative.sentAt ? (Date.now() - authoritative.sentAt) / 1000 : -1;\n    const safeClockAge = clockAge >= 0 && clockAge <= 0.5 ? clockAge : 0;\n    const age = Math.min(0.22, Math.max(safeClockAge, receivedAge + latency / 1000));\n    const targetX = authoritative.x + authoritative.vx * age;\n    const targetY = authoritative.y + authoritative.vy * age;\n    const distance = Math.hypot(predictedPuck.x - targetX, predictedPuck.y - targetY);\n    const inHitGrace = performance.now() < localHitGraceUntil;\n    const effectiveSnapDistance = inHitGrace ? NET.snapDistance * 1.45 : NET.snapDistance;\n    if (distance > effectiveSnapDistance) {\n      predictedPuck.x = targetX;\n      predictedPuck.y = targetY;\n      predictedPuck.vx = authoritative.vx;\n      predictedPuck.vy = authoritative.vy;\n      localHitGraceUntil = 0;\n    } else if (!inHitGrace && distance > 10) {\n      const adaptiveRate = latency > 120 ? 2.25 : latency > 80 ? 3.0 : NET.correctionRate;\n      const distanceWeight = Math.min(1, 0.28 + distance / 180);\n      const correction = (1 - Math.exp(-adaptiveRate * dt)) * distanceWeight;\n      predictedPuck.x = lerp(predictedPuck.x, targetX, correction);\n      predictedPuck.y = lerp(predictedPuck.y, targetY, correction);\n      predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, correction * 0.12);\n      predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, correction * 0.12);\n    } else {\n      const velocityCorrection = 1 - Math.exp(-1.6 * dt);\n      predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, velocityCorrection * 0.08);\n      predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, velocityCorrection * 0.08);\n    }\`,
      'collision grace and dead-zone correction');

    source = required(source,
      \`function gameLoop(now) {\n    if (mode !== 'playing') return;\n    const dt = Math.min(0.032, (now - lastFrame) / 1000 || 0.016);\n    lastFrame = now;\n    if (role === 'host') {\n      simulateHost(dt);\n      if (now - lastStateSent >= (transport === 'p2p' ? NET.stateInterval : 65)) {\n        lastStateSent = now;\n        sendState();\n      }\n    } else {\n      updateGuest(dt);\n      maybeSendGuestInput(now);\n    }\n    if (now - lastPingSent >= 1800) {\n      lastPingSent = now;\n      lastPingId += 1;\n      sendControl({ type: 'ping', id: lastPingId, sentAt: Date.now() });\n    }\n    if (lastRemoteMessage && now - lastRemoteMessage > NET.disconnectTimeout) {\n      finishMatch(role, 'timeout');\n      return;\n    }\n    draw();\n    animationFrame = requestAnimationFrame(gameLoop);\n  }\`,
      \`function gameLoop(now) {\n    if (mode !== 'playing') return;\n    const frameDt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000 || 0.016));\n    lastFrame = now;\n    physicsAccumulator = Math.min(0.10, physicsAccumulator + frameDt);\n    let physicsSteps = 0;\n    while (physicsAccumulator >= PHYSICS_STEP && physicsSteps < 10) {\n      if (role === 'host') simulateHost(PHYSICS_STEP);\n      else updateGuest(PHYSICS_STEP);\n      physicsAccumulator -= PHYSICS_STEP;\n      physicsSteps += 1;\n    }\n    if (role === 'host') {\n      if (now - lastStateSent >= (transport === 'p2p' ? NET.stateInterval : 65)) {\n        lastStateSent = now;\n        sendState();\n      }\n    } else {\n      maybeSendGuestInput(now);\n    }\n    if (now - lastPingSent >= 1800) {\n      lastPingSent = now;\n      lastPingId += 1;\n      sendControl({ type: 'ping', id: lastPingId, sentAt: Date.now() });\n    }\n    if (lastRemoteMessage && now - lastRemoteMessage > NET.disconnectTimeout) {\n      finishMatch(role, 'timeout');\n      return;\n    }\n    draw();\n    animationFrame = requestAnimationFrame(gameLoop);\n  }\`,
      'fixed-step game loop');

    source = required(source,
      \`lastFrame = performance.now();\n    lastRemoteMessage = performance.now();\`,
      \`lastFrame = performance.now();\n    physicsAccumulator = 0;\n    localHitGraceUntil = 0;\n    lastRemoteMessage = performance.now();\`,
      'physics reset');

    source = required(source,
      \`function draw() {\n    if (!render.staticLayer) setupCanvas(true);\n    ctx.setTransform(1, 0, 0, 1, 0, 0);\n    ctx.drawImage(render.staticLayer, 0, 0);\n    const ball = role === 'host' ? puck : predictedPuck;\n    const opponent = remotePaddle;\n    drawSprite(render.shellSprite, opponent.x, opponent.y, 210);\n    drawSprite(render.turtleSprite, localPaddle.x, localPaddle.y, 210);\n    drawSprite(render.puckSprite, ball.x, ball.y, 90);\n  }\`,
      \`function draw() {\n    if (!render.staticLayer) setupCanvas(true);\n    ctx.setTransform(1, 0, 0, 1, 0, 0);\n    ctx.drawImage(render.staticLayer, 0, 0);\n    const ball = role === 'host' ? puck : predictedPuck;\n    const renderAhead = Math.min(PHYSICS_STEP, Math.max(0, physicsAccumulator));\n    const ballX = clamp(ball.x + ball.vx * renderAhead, FIELD.left - 70, FIELD.right + 70);\n    const ballY = clamp(ball.y + ball.vy * renderAhead, FIELD.top - 90, FIELD.bottom + 90);\n    const opponent = remotePaddle;\n    drawSprite(render.shellSprite, opponent.x, opponent.y, 210);\n    drawSprite(render.turtleSprite, localPaddle.x, localPaddle.y, 210);\n    drawSprite(render.puckSprite, ballX, ballY, 90);\n  }\`,
      'sub-frame puck rendering');`;

    loader = injectAfter(loader, eventMarker, ballSmoothingPatches, 'ball smoothing injection');
    loader = loader
      .replaceAll('v4.3.0', 'v4.3.1')
      .replaceAll('v430', 'v431')
      .replace('⚡ 智慧低延遲配對', '⚡ 超順球體配對')
      .replace('v4.3 連線引擎載入中', 'v4.3.1 球體引擎載入中');

    Function(`${loader}\n//# sourceURL=multiplayer-v431-bootstrap.js`)();
  }

  boot().catch((error) => {
    console.error('Bubble multiplayer v4.3.1 bootstrap failed', error);
    if (quick) {
      quick.disabled = true;
      quick.textContent = '⚠ 球體引擎載入失敗';
    }
    if (status) status.textContent = `球體平滑引擎載入失敗：${error.message}`;
  });
})();
