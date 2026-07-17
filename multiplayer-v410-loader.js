(() => {
  'use strict';

  const status = document.getElementById('match-status');
  const quick = document.getElementById('quick-match-btn');
  const originalQuickLabel = quick?.textContent || '🌐 真人快速配對';

  if (quick) {
    quick.disabled = true;
    quick.textContent = '🌐 多人引擎載入中…';
  }

  const replaceRequired = (source, from, to, label) => {
    if (!source.includes(from)) {
      throw new Error(`v4.1.0 patch missing: ${label}`);
    }
    return source.replace(from, to);
  };

  async function boot() {
    let source = await fetch(`multiplayer-v409.js?v=4.1.0-${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin'
    }).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });

    source = replaceRequired(source,
      "storageKey: 'bubble-island-auth-v409'",
      "storageKey: 'bubble-island-auth-v410'",
      'auth storage');

    source = replaceRequired(source,
      'realtime: { params: { eventsPerSecond: 45 } }',
      'realtime: { params: { eventsPerSecond: 22 } }',
      'realtime rate');

    source = replaceRequired(source,
      `stateInterval: 42,\n    inputInterval: 30,\n    inputKeepAlive: 180,\n    maxPrediction: 95,`,
      `stateInterval: 90,\n    inputInterval: 50,\n    inputKeepAlive: 260,\n    maxPrediction: 160,`,
      'network timing');

    source = replaceRequired(source,
      `moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2300, dt);\n    moveObject(remotePaddle, remotePaddle.targetX, remotePaddle.targetY, 1950, dt);`,
      `localPaddle.x = localPaddle.targetX;\n    localPaddle.y = localPaddle.targetY;\n    moveObject(remotePaddle, remotePaddle.targetX, remotePaddle.targetY, 3400, dt);`,
      'host paddle response');

    source = replaceRequired(source,
      `moveObject(localPaddle, localPaddle.targetX, localPaddle.targetY, 2350, dt);`,
      `localPaddle.x = localPaddle.targetX;\n    localPaddle.y = localPaddle.targetY;`,
      'guest paddle response');

    source = replaceRequired(source,
      `const distance = Math.hypot(targetX - predictedPuck.x, targetY - predictedPuck.y);\n    if (distance > 210) {\n      predictedPuck.x = targetX;\n      predictedPuck.y = targetY;\n      predictedPuck.vx = authoritative.vx;\n      predictedPuck.vy = authoritative.vy;\n    }`,
      `const distance = Math.hypot(targetX - predictedPuck.x, targetY - predictedPuck.y);\n    if (distance > 360) {\n      predictedPuck.x = targetX;\n      predictedPuck.y = targetY;\n      predictedPuck.vx = authoritative.vx;\n      predictedPuck.vy = authoritative.vy;\n    }`,
      'snap threshold');

    source = replaceRequired(source,
      `const amount = 1 - Math.exp(-13 * dt);\n    predictedPuck.x = lerp(predictedPuck.x, targetX, amount);\n    predictedPuck.y = lerp(predictedPuck.y, targetY, amount);\n    predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, amount * 0.65);\n    predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, amount * 0.65);`,
      `const distance = Math.hypot(targetX - predictedPuck.x, targetY - predictedPuck.y);\n    if (distance > 360) {\n      predictedPuck.x = targetX;\n      predictedPuck.y = targetY;\n      predictedPuck.vx = authoritative.vx;\n      predictedPuck.vy = authoritative.vy;\n    } else {\n      const amount = 1 - Math.exp(-4.2 * dt);\n      predictedPuck.x = lerp(predictedPuck.x, targetX, amount);\n      predictedPuck.y = lerp(predictedPuck.y, targetY, amount);\n      predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, 0.11);\n      predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, 0.11);\n    }`,
      'gentle reconciliation');

    source = replaceRequired(source,
      `const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.1 : 1.45);`,
      `const dpr = Math.min(devicePixelRatio || 1, mobile ? 1 : 1.25);`,
      'canvas resolution');

    source = source
      .replaceAll('hello-v409', 'hello-v410')
      .replaceAll('control-v409', 'control-v410')
      .replaceAll('game-v409', 'game-v410')
      .replace("bestComboHud.textContent = 'Fast Sync'", "bestComboHud.textContent = 'Local Feel'")
      .replace("speedLabel.textContent = latency > 0 ? `FAST ${latency}ms` : 'FAST'", "speedLabel.textContent = latency > 0 ? `LOCAL ${latency}ms` : 'LOCAL'")
      .replace("transport: () => 'realtime-fast'", "transport: () => 'realtime-local-prediction'");

    Function(`${source}\n//# sourceURL=multiplayer-v410-runtime.js`)();

    if (quick) {
      quick.disabled = false;
      quick.textContent = originalQuickLabel;
    }
  }

  boot().catch(error => {
    console.error('Bubble multiplayer v4.1.0 failed to load', error);
    if (quick) {
      quick.disabled = true;
      quick.textContent = '🌐 多人引擎載入失敗';
    }
    if (status) status.textContent = `多人引擎載入失敗：${error.message}`;
  });
})();