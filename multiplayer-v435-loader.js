(() => {
  'use strict';

  const quick = document.getElementById('quick-match-btn');
  const status = document.getElementById('match-status');

  const replaceToken = (source, token, replacement, label) => {
    if (!source.includes(token)) throw new Error(`v4.3.5 patch missing: ${label}`);
    return source.replace(token, replacement);
  };

  const replacePattern = (source, pattern, replacement, label) => {
    if (!pattern.test(source)) throw new Error(`v4.3.5 patch missing: ${label}`);
    return source.replace(pattern, replacement);
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

    loader = replaceToken(
      loader,
      'const SNAPSHOT_DELAY_MS = 46;',
      `let adaptiveSnapshotDelayMs = 38;
   let snapshotIntervalEma = 32;
   let snapshotJitterEma = 0;
   let lastSnapshotAt = 0;`,
      'adaptive snapshot state',
    );

    loader = replaceToken(
      loader,
      'const renderAt = now - SNAPSHOT_DELAY_MS;',
      'const renderAt = now - adaptiveSnapshotDelayMs;',
      'adaptive render delay',
    );

    loader = replaceToken(
      loader,
      'const extra = Math.min(0.035, Math.max(0, (renderAt - newer.receivedAt) / 1000));',
      'const extra = Math.min(0.050, Math.max(0, (renderAt - newer.receivedAt) / 1000));',
      'bounded short extrapolation',
    );

    loader = replaceToken(
      loader,
      'puckSnapshots.push({',
      `const previousSnapshot = puckSnapshots[puckSnapshots.length - 1];
     if (lastSnapshotAt > 0) {
       const interval = clamp(stateReceivedAt - lastSnapshotAt, 8, 180);
       const intervalError = Math.abs(interval - snapshotIntervalEma);
       snapshotIntervalEma = lerp(snapshotIntervalEma, interval, 0.16);
       snapshotJitterEma = lerp(snapshotJitterEma, intervalError, 0.14);
       adaptiveSnapshotDelayMs = clamp(22 + snapshotJitterEma * 1.7 + Math.max(0, snapshotIntervalEma - 32) * 0.28, 28, 58);
     }
     lastSnapshotAt = stateReceivedAt;

     if (previousSnapshot) {
       const snapshotScoreChanged = previousGuestScore !== next.guestScore || previousHostScore !== next.hostScore;
       const speedBefore = Math.hypot(previousSnapshot.vx, previousSnapshot.vy);
       const speedAfter = Math.hypot(next.vx, next.vy);
       const dot = previousSnapshot.vx * next.vx + previousSnapshot.vy * next.vy;
       const sharpDirectionChange = speedBefore > 160 && speedAfter > 160 && dot < speedBefore * speedAfter * 0.20;
       const discontinuity = Math.hypot(next.x - previousSnapshot.x, next.y - previousSnapshot.y) > 150;
       if (sharpDirectionChange || discontinuity || snapshotScoreChanged) puckSnapshots.length = 0;
     }

     puckSnapshots.push({`,
      'collision-aware snapshot queue',
    );

    loader = replaceToken(
      loader,
      'if (puckSnapshots.length > 10) puckSnapshots.splice(0, puckSnapshots.length - 10);',
      'if (puckSnapshots.length > 14) puckSnapshots.splice(0, puckSnapshots.length - 14);',
      'snapshot queue limit',
    );

    loader = replaceToken(
      loader,
      'const snapDistance = inHitGrace ? 420 : 220;',
      'const snapDistance = inHitGrace ? 320 : 150;',
      'tighter divergence bound',
    );

    loader = replaceToken(
      loader,
      'const correctionRate = distance > 100 ? 16 : distance > 36 ? 11 : 7;',
      'const correctionRate = distance > 90 ? 20 : distance > 30 ? 14 : 9;',
      'faster bounded correction',
    );

    loader = replacePattern(
      loader,
      /puckSnapshots\.length = 0;\s*lastStateSequence = 0;/,
      `puckSnapshots.length = 0;
    adaptiveSnapshotDelayMs = 38;
    snapshotIntervalEma = 32;
    snapshotJitterEma = 0;
    lastSnapshotAt = 0;
    lastStateSequence = 0;`,
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
