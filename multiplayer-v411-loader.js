(() => {
  'use strict';

  const quick = document.getElementById('quick-match-btn');
  const status = document.getElementById('match-status');
  const required = (source, from, to, label) => {
    if (!source.includes(from)) throw new Error(`v4.1.1 patch missing: ${label}`);
    return source.replace(from, to);
  };

  async function boot() {
    if (quick) {
      quick.disabled = true;
      quick.textContent = '🌐 多人引擎載入中…';
    }

    let source = await fetch(`multiplayer-v409.js?v=4.1.1-${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin'
    }).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });

    source = required(source,
      "storageKey: 'bubble-island-auth-v409'",
      "storageKey: 'bubble-island-auth-v411'",
      'auth storage');

    source = required(source,
      'realtime: { params: { eventsPerSecond: 45 } }',
      'realtime: { params: { eventsPerSecond: 40 } }',
      'realtime rate');

    source = required(source,
      `stateInterval: 42,\n    inputInterval: 30,\n    inputKeepAlive: 180,\n    maxPrediction: 95,`,
      `stateInterval: 70,\n    inputInterval: 40,\n    inputKeepAlive: 220,\n    maxPrediction: 220,`,
      'network timing');

    source = required(source,
      `let lastStateSequence = 0;`,
      `let lastStateSequence = 0;\n  let remoteRawX = 500;\n  let remoteRawY = 270;\n  let remoteVelocityX = 0;\n  let remoteVelocityY = 0;\n  let remoteInputAt = 0;\n  let displayRawX = 500;\n  let displayRawY = 270;\n  let displayVelocityX = 0;\n  let displayVelocityY = 0;\n  let displayStateAt = 0;`,
      'prediction state');

    source = required(source,
      `if (packet[0] === 'i' && role === 'host') {\n      remotePaddle.targetX = clamp(Number(packet[1]) || 500, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);\n      remotePaddle.targetY = clamp(Number(packet[2]) || 270, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 10);\n      return;\n    }`,
      `if (packet[0] === 'i' && role === 'host') {\n      const now = performance.now();\n      const nextX = clamp(Number(packet[1]) || 500, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);\n      const nextY = clamp(Number(packet[2]) || 270, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 10);\n      if (remoteInputAt > 0) {\n        const elapsed = Math.max(0.016, (now - remoteInputAt) / 1000);\n        remoteVelocityX = clamp((nextX - remoteRawX) / elapsed, -3200, 3200);\n        remoteVelocityY = clamp((nextY - remoteRawY) / elapsed, -3200, 3200);\n      }\n      remoteRawX = nextX;\n      remoteRawY = nextY;\n      remoteInputAt = now;\n      return;\n    }`,
      'remote input prediction');

    source = required(source,
      `moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2300, dt);\n    moveObject(remotePaddle, remotePaddle.targetX, remotePaddle.targetY, 1950, dt);`,
      `localPaddle.x = localPaddle.targetX;\n    localPaddle.y = localPaddle.targetY;\n    const remoteAge = clamp((performance.now() - remoteInputAt) / 1000, 0, 0.18);\n    remotePaddle.targetX = clamp(remoteRawX + remoteVelocityX * remoteAge, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);\n    remotePaddle.targetY = clamp(remoteRawY + remoteVelocityY * remoteAge, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 10);\n    moveObject(remotePaddle, remotePaddle.targetX, remotePaddle.targetY, 4200, dt);`,
      'host paddle response');

    source = required(source,
      `moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2350, dt);`,
      `localPaddle.x = localPaddle.targetX;\n    localPaddle.y = localPaddle.targetY;`,
      'guest paddle response');

    source = required(source,
      `const distance = Math.hypot(targetX - predictedPuck.x, targetY - predictedPuck.y);\n    if (distance > 210) {\n      predictedPuck.x = targetX;\n      predictedPuck.y = targetY;\n      predictedPuck.vx = authoritative.vx;\n      predictedPuck.vy = authoritative.vy;\n    }\n    display.opponentX = FIELD.width - Number(packet[7] || 500);\n    display.opponentY = FIELD.height - Number(packet[8] || 1430);`,
      `const distance = Math.hypot(targetX - predictedPuck.x, targetY - predictedPuck.y);\n    if (distance > 420) {\n      predictedPuck.x = targetX;\n      predictedPuck.y = targetY;\n      predictedPuck.vx = authoritative.vx;\n      predictedPuck.vy = authoritative.vy;\n    }\n    const nextDisplayX = FIELD.width - Number(packet[7] || 500);\n    const nextDisplayY = FIELD.height - Number(packet[8] || 1430);\n    if (displayStateAt > 0) {\n      const elapsed = Math.max(0.016, (now - displayStateAt) / 1000);\n      displayVelocityX = clamp((nextDisplayX - displayRawX) / elapsed, -3200, 3200);\n      displayVelocityY = clamp((nextDisplayY - displayRawY) / elapsed, -3200, 3200);\n    }\n    displayRawX = nextDisplayX;\n    displayRawY = nextDisplayY;\n    displayStateAt = now;`,
      'state prediction');

    source = required(source,
      `simulateBall(predictedPuck, dt, localPaddle, display, false);\n    const age = clamp(performance.now() - authoritative.receivedAt, 0, NET.maxPrediction) / 1000;`,
      `const displayAge = clamp((performance.now() - displayStateAt) / 1000, 0, 0.18);\n    display.opponentX = clamp(displayRawX + displayVelocityX * displayAge, FIELD.left + FIELD.paddleRadius, FIELD.right - FIELD.paddleRadius);\n    display.opponentY = clamp(displayRawY + displayVelocityY * displayAge, FIELD.top + FIELD.paddleRadius, FIELD.middle - FIELD.paddleRadius - 10);\n    simulateBall(predictedPuck, dt, localPaddle, display, false);\n    const age = clamp(performance.now() - authoritative.receivedAt, 0, NET.maxPrediction) / 1000;`,
      'guest opponent prediction');

    source = required(source,
      `const amount = 1 - Math.exp(-13 * dt);\n    predictedPuck.x = lerp(predictedPuck.x, targetX, amount);\n    predictedPuck.y = lerp(predictedPuck.y, targetY, amount);\n    predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, amount * 0.65);\n    predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, amount * 0.65);`,
      `const distance = Math.hypot(targetX - predictedPuck.x, targetY - predictedPuck.y);\n    if (distance > 420) {\n      predictedPuck.x = targetX;\n      predictedPuck.y = targetY;\n      predictedPuck.vx = authoritative.vx;\n      predictedPuck.vy = authoritative.vy;\n    } else {\n      const amount = 1 - Math.exp(-3.2 * dt);\n      predictedPuck.x = lerp(predictedPuck.x, targetX, amount);\n      predictedPuck.y = lerp(predictedPuck.y, targetY, amount);\n      predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, 0.08);\n      predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, 0.08);\n    }`,
      'gentle reconciliation');

    source = required(source,
      `const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.1 : 1.45);`,
      `const dpr = Math.min(devicePixelRatio || 1, mobile ? 1 : 1.2);`,
      'canvas resolution');

    source = source
      .replaceAll('hello-v409', 'hello-v411')
      .replaceAll('control-v409', 'control-v411')
      .replaceAll('game-v409', 'game-v411')
      .replace("bestComboHud.textContent = 'Fast Sync'", "bestComboHud.textContent = 'Predict Mode'")
      .replace("speedLabel.textContent = latency > 0 ? `FAST ${latency}ms` : 'FAST'", "speedLabel.textContent = latency > 0 ? `PREDICT ${latency}ms` : 'PREDICT'")
      .replace("transport: () => 'realtime-fast'", "transport: () => 'realtime-predictive'");

    Function(`${source}\n//# sourceURL=multiplayer-v411-runtime.js`)();

    if (quick) {
      quick.disabled = false;
      quick.textContent = '🌐 真人快速配對';
    }
  }

  boot().catch(error => {
    console.error('Bubble multiplayer v4.1.1 failed to load', error);
    if (quick) {
      quick.disabled = true;
      quick.textContent = '🌐 多人引擎載入失敗';
    }
    if (status) status.textContent = `多人引擎載入失敗：${error.message}`;
  });
})();