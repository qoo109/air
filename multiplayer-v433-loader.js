(() => {
  'use strict';

  const quick = document.getElementById('quick-match-btn');
  const status = document.getElementById('match-status');

  const injectBefore = (source, marker, addition, label) => {
    if (!source.includes(marker)) throw new Error(`v4.3.3 loader patch missing: ${label}`);
    return source.replace(marker, `${addition}\n\n${marker}`);
  };

  async function boot() {
    if (quick) {
      quick.disabled = true;
      quick.textContent = '🌐 防漂移同步引擎載入中…';
    }

    let loader = await fetch(`multiplayer-v432-loader.js?v=4.3.3-${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });

    const versionMarker = `    loader = loader\n      .replaceAll('v4.3.1', 'v4.3.2')`;

    const antiDriftLayer = `    const antiDriftLayer = \`    const antiDriftPatches = \\\`    source = required(source,
      \\\\\\\`const authoritative = { x: 500, y: 850, vx: 120, vy: -500, receivedAt: 0, sentAt: 0 };\\\\\\\`,
      \\\\\\\`const authoritative = { x: 500, y: 850, vx: 120, vy: -500, receivedAt: 0, sentAt: 0 };
  const puckSnapshots = [];
  const SNAPSHOT_DELAY_MS = 46;
  const noRemotePaddle = { x: -10000, y: -10000 };

  function sampleAuthoritativePuck(now) {
    if (!puckSnapshots.length) return authoritative;
    const renderAt = now - SNAPSHOT_DELAY_MS;
    let older = puckSnapshots[0];
    let newer = puckSnapshots[puckSnapshots.length - 1];
    for (let index = 1; index < puckSnapshots.length; index += 1) {
      if (puckSnapshots[index].receivedAt >= renderAt) {
        older = puckSnapshots[index - 1];
        newer = puckSnapshots[index];
        break;
      }
    }
    if (renderAt >= newer.receivedAt) {
      const extra = Math.min(0.035, Math.max(0, (renderAt - newer.receivedAt) / 1000));
      return {
        x: newer.x + newer.vx * extra,
        y: newer.y + newer.vy * extra,
        vx: newer.vx,
        vy: newer.vy,
      };
    }
    const span = Math.max(1, newer.receivedAt - older.receivedAt);
    const amount = clamp((renderAt - older.receivedAt) / span, 0, 1);
    return {
      x: lerp(older.x, newer.x, amount),
      y: lerp(older.y, newer.y, amount),
      vx: lerp(older.vx, newer.vx, amount),
      vy: lerp(older.vy, newer.vy, amount),
    };
  }\\\\\\\`,
      'authoritative puck snapshot buffer');

    source = required(source,
      \\\\\\\`Object.assign(authoritative, {
      x: next.x,
      y: next.y,
      vx: next.vx,
      vy: next.vy,
      receivedAt: performance.now(),
      sentAt: Number(packet[14]) || 0
    });\\\\\\\`,
      \\\\\\\`const stateReceivedAt = performance.now();
    Object.assign(authoritative, {
      x: next.x,
      y: next.y,
      vx: next.vx,
      vy: next.vy,
      receivedAt: stateReceivedAt,
      sentAt: Number(packet[14]) || 0
    });
    puckSnapshots.push({
      x: next.x,
      y: next.y,
      vx: next.vx,
      vy: next.vy,
      receivedAt: stateReceivedAt,
    });
    if (puckSnapshots.length > 10) puckSnapshots.splice(0, puckSnapshots.length - 10);\\\\\\\`,
      'record authoritative puck snapshots');

    source = required(source,
      \\\\\\\`const beforeLocalVy = predictedPuck.vy;
    simulateBall(predictedPuck, dt, localPaddle, remotePaddle, false);
    const localContactDistance = Math.hypot(predictedPuck.x - localPaddle.x, predictedPuck.y - localPaddle.y);
    if (beforeLocalVy > 35 && predictedPuck.vy < -35 && localContactDistance < FIELD.paddleRadius + FIELD.puckRadius + 58) {
      localHitGraceUntil = performance.now() + 130 + Math.min(110, latency);
    }

    const receivedAge = Math.max(0, (performance.now() - authoritative.receivedAt) / 1000);
    const clockAge = authoritative.sentAt ? (Date.now() - authoritative.sentAt) / 1000 : -1;
    const safeClockAge = clockAge >= 0 && clockAge <= 0.5 ? clockAge : 0;
    const age = Math.min(0.22, Math.max(safeClockAge, receivedAge + latency / 1000));
    const targetX = authoritative.x + authoritative.vx * age;
    const targetY = authoritative.y + authoritative.vy * age;
    const distance = Math.hypot(predictedPuck.x - targetX, predictedPuck.y - targetY);
    const inHitGrace = performance.now() < localHitGraceUntil;
    const effectiveSnapDistance = inHitGrace ? NET.snapDistance * 1.45 : NET.snapDistance;
    if (distance > effectiveSnapDistance) {
      predictedPuck.x = targetX;
      predictedPuck.y = targetY;
      predictedPuck.vx = authoritative.vx;
      predictedPuck.vy = authoritative.vy;
      localHitGraceUntil = 0;
    } else if (!inHitGrace && distance > 10) {
      const adaptiveRate = latency > 120 ? 2.25 : latency > 80 ? 3.0 : NET.correctionRate;
      const distanceWeight = Math.min(1, 0.28 + distance / 180);
      const correction = (1 - Math.exp(-adaptiveRate * dt)) * distanceWeight;
      predictedPuck.x = lerp(predictedPuck.x, targetX, correction);
      predictedPuck.y = lerp(predictedPuck.y, targetY, correction);
      predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, correction * 0.12);
      predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, correction * 0.12);
    } else {
      const velocityCorrection = 1 - Math.exp(-1.6 * dt);
      predictedPuck.vx = lerp(predictedPuck.vx, authoritative.vx, velocityCorrection * 0.08);
      predictedPuck.vy = lerp(predictedPuck.vy, authoritative.vy, velocityCorrection * 0.08);
    }\\\\\\\`,
      \\\\\\\`const ballNow = performance.now();
    const beforeLocalVx = predictedPuck.vx;
    const beforeLocalVy = predictedPuck.vy;
    simulateBall(predictedPuck, dt, localPaddle, noRemotePaddle, false);
    const localContactDistance = Math.hypot(predictedPuck.x - localPaddle.x, predictedPuck.y - localPaddle.y);
    const localVelocityChange = Math.hypot(predictedPuck.vx - beforeLocalVx, predictedPuck.vy - beforeLocalVy);
    if (localVelocityChange > 90 && localContactDistance < FIELD.paddleRadius + FIELD.puckRadius + 58) {
      localHitGraceUntil = ballNow + 95 + Math.min(55, latency);
    }

    const target = sampleAuthoritativePuck(ballNow);
    const targetX = target.x;
    const targetY = target.y;
    const distance = Math.hypot(predictedPuck.x - targetX, predictedPuck.y - targetY);
    const inHitGrace = ballNow < localHitGraceUntil;
    const snapDistance = inHitGrace ? 420 : 220;
    if (distance > snapDistance) {
      predictedPuck.x = targetX;
      predictedPuck.y = targetY;
      predictedPuck.vx = target.vx;
      predictedPuck.vy = target.vy;
      localHitGraceUntil = 0;
    } else if (!inHitGrace && distance > 3) {
      const correctionRate = distance > 100 ? 16 : distance > 36 ? 11 : 7;
      const correction = 1 - Math.exp(-correctionRate * dt);
      predictedPuck.x = lerp(predictedPuck.x, targetX, correction);
      predictedPuck.y = lerp(predictedPuck.y, targetY, correction);
      predictedPuck.vx = lerp(predictedPuck.vx, target.vx, correction * 0.30);
      predictedPuck.vy = lerp(predictedPuck.vy, target.vy, correction * 0.30);
    } else if (!inHitGrace) {
      const velocityCorrection = 1 - Math.exp(-8 * dt);
      predictedPuck.vx = lerp(predictedPuck.vx, target.vx, velocityCorrection);
      predictedPuck.vy = lerp(predictedPuck.vy, target.vy, velocityCorrection);
    }\\\\\\\`,
      'snapshot interpolation instead of long extrapolation');

    source = required(source,
      \\\\\\\`lastStateSequence = 0;
    lastInputSampleAt = 0;\\\\\\\`,
      \\\\\\\`puckSnapshots.length = 0;
    lastStateSequence = 0;
    lastInputSampleAt = 0;\\\\\\\`,
      'reset puck snapshot buffer');

    source = required(source,
      \\\\\\\`const renderAhead = Math.min(PHYSICS_STEP, Math.max(0, physicsAccumulator));\\\\\\\`,
      \\\\\\\`const renderAhead = role === 'host' ? Math.min(PHYSICS_STEP, Math.max(0, physicsAccumulator)) : 0;\\\\\\\`,
      'disable guest-side extra extrapolation');\\\`;

    loader = injectAfter(loader, eventMarker, antiDriftPatches, 'anti-drift snapshot injection');\`;

    loader = injectBefore(loader, afterBallInjectionMarker, antiDriftLayer, 'anti-drift layer');`;

    loader = injectBefore(loader, versionMarker, antiDriftLayer, 'anti-drift bootstrap layer');
    loader = loader
      .replaceAll('v4.3.2', 'v4.3.3')
      .replaceAll('v432', 'v433')
      .replace('⚡ 雙角色低延遲配對', '⚡ 防漂移低延遲配對')
      .replace('🌐 雙角色引擎載入中…', '🌐 防漂移同步引擎載入中…');

    Function(`${loader}\n//# sourceURL=multiplayer-v433-bootstrap.js`)();
  }

  boot().catch((error) => {
    console.error('Bubble multiplayer v4.3.3 bootstrap failed', error);
    if (quick) {
      quick.disabled = true;
      quick.textContent = '⚠ 防漂移引擎載入失敗';
    }
    if (status) status.textContent = `防漂移同步引擎載入失敗：${error.message}`;
  });
})();