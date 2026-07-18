(() => {
  'use strict';

  const quick = document.getElementById('quick-match-btn');
  const status = document.getElementById('match-status');

  const required = (source, before, after, label) => {
    if (!source.includes(before)) throw new Error(`v4.3.5 patch missing: ${label}`);
    return source.replace(before, after);
  };

  async function boot() {
    if (quick) {
      quick.disabled = true;
      quick.textContent = '🌐 自適應同步引擎載入中…';
    }

    let loader = await fetch(`multiplayer-v433-loader.js?v=4.3.5-${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });

    loader = required(
      loader,
      `const SNAPSHOT_DELAY_MS = 46;\n   const noRemotePaddle = { x: -10000, y: -10000 };`,
      `let adaptiveSnapshotDelayMs = 38;\n   let snapshotIntervalEma = 32;\n   let snapshotJitterEma = 0;\n   let lastSnapshotAt = 0;\n   const noRemotePaddle = { x: -10000, y: -10000 };`,
      'adaptive snapshot state',
    );

    loader = required(
      loader,
      `const renderAt = now - SNAPSHOT_DELAY_MS;`,
      `const renderAt = now - adaptiveSnapshotDelayMs;`,
      'adaptive render delay',
    );

    loader = required(
      loader,
      `const extra = Math.min(0.035, Math.max(0, (renderAt - newer.receivedAt) / 1000));`,
      `const extra = Math.min(0.050, Math.max(0, (renderAt - newer.receivedAt) / 1000));`,
      'bounded short extrapolation',
    );

    loader = required(
      loader,
      `puckSnapshots.push({\n       x: next.x,\n       y: next.y,\n       vx: next.vx,\n       vy: next.vy,\n       receivedAt: stateReceivedAt,\n     });\n     if (puckSnapshots.length > 10) puckSnapshots.splice(0, puckSnapshots.length - 10);`,
      `const previousSnapshot = puckSnapshots[puckSnapshots.length - 1];\n     if (lastSnapshotAt > 0) {\n       const interval = clamp(stateReceivedAt - lastSnapshotAt, 8, 180);\n       const intervalError = Math.abs(interval - snapshotIntervalEma);\n       snapshotIntervalEma = lerp(snapshotIntervalEma, interval, 0.16);\n       snapshotJitterEma = lerp(snapshotJitterEma, intervalError, 0.14);\n       adaptiveSnapshotDelayMs = clamp(22 + snapshotJitterEma * 1.7 + Math.max(0, snapshotIntervalEma - 32) * 0.28, 28, 58);\n     }\n     lastSnapshotAt = stateReceivedAt;\n\n     if (previousSnapshot) {\n       const speedBefore = Math.hypot(previousSnapshot.vx, previousSnapshot.vy);\n       const speedAfter = Math.hypot(next.vx, next.vy);\n       const dot = previousSnapshot.vx * next.vx + previousSnapshot.vy * next.vy;\n       const sharpDirectionChange = speedBefore > 160 && speedAfter > 160 && dot < speedBefore * speedAfter * 0.20;\n       const discontinuity = Math.hypot(next.x - previousSnapshot.x, next.y - previousSnapshot.y) > 150;\n       if (sharpDirectionChange || discontinuity || scoreChanged) puckSnapshots.length = 0;\n     }\n\n     puckSnapshots.push({\n       x: next.x,\n       y: next.y,\n       vx: next.vx,\n       vy: next.vy,\n       receivedAt: stateReceivedAt,\n     });\n     if (puckSnapshots.length > 14) puckSnapshots.splice(0, puckSnapshots.length - 14);`,
      'collision-aware snapshot queue',
    );

    loader = required(
      loader,
      `const snapDistance = inHitGrace ? 420 : 220;`,
      `const snapDistance = inHitGrace ? 320 : 150;`,
      'tighter divergence bound',
    );

    loader = required(
      loader,
      `const correctionRate = distance > 100 ? 16 : distance > 36 ? 11 : 7;`,
      `const correctionRate = distance > 90 ? 20 : distance > 30 ? 14 : 9;`,
      'faster bounded correction',
    );

    loader = required(
      loader,
      `puckSnapshots.length = 0;\n     lastStateSequence = 0;`,
      `puckSnapshots.length = 0;\n     adaptiveSnapshotDelayMs = 38;\n     snapshotIntervalEma = 32;\n     snapshotJitterEma = 0;\n     lastSnapshotAt = 0;\n     lastStateSequence = 0;`,
      'reset adaptive synchronizer',
    );

    loader = loader
      .replaceAll('v4.3.3', 'v4.3.5')
      .replaceAll('v433', 'v435')
      .replace('⚡ 防漂移低延遲配對', '⚡ 自適應穩定同步配對')
      .replace('🌐 防漂移同步引擎載入中…', '🌐 自適應同步引擎載入中…')
      .replace('⚠ 防漂移引擎載入失敗', '⚠ 自適應同步引擎載入失敗');

    Function(`${loader}\n//# sourceURL=multiplayer-v435-bootstrap.js`)();
  }

  boot().catch((error) => {
    console.error('Bubble multiplayer v4.3.5 bootstrap failed', error);
    if (quick) {
      quick.disabled = true;
      quick.textContent = '⚠ 自適應同步引擎載入失敗';
    }
    if (status) status.textContent = `自適應同步引擎載入失敗：${error.message}`;
  });
})();
