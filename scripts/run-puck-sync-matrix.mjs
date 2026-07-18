import fs from 'node:fs/promises';

const scenarios = [
  { name: 'wifi-good', delay: 20, jitter: 5, loss: 0, reorder: 0 },
  { name: 'mobile-normal', delay: 50, jitter: 15, loss: 1, reorder: 1 },
  { name: 'mobile-busy', delay: 80, jitter: 25, loss: 3, reorder: 2 },
  { name: 'mobile-hard', delay: 120, jitter: 40, loss: 5, reorder: 4 },
];

const FIELD = { left: 48, right: 952, top: 150, bottom: 1548, radius: 30 };
const STEP_MS = 1000 / 120;
const STATE_MS = 32;
const SNAPSHOT_DELAY_MS = 46;

function rng(seed = 0x12345678) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};

function simulateScenario(config, seedIndex) {
  const random = rng(0xA17C0DE + seedIndex * 7919);
  const host = { x: 500, y: 850, vx: 410, vy: -690 };
  const history = [];
  const network = [];
  const snapshots = [];
  const guest = { x: 500, y: 850, vx: 410, vy: -690 };
  const errors = [];
  const liveGaps = [];
  const visualJumps = [];
  let previousGuest = { x: guest.x, y: guest.y };
  let nextStateAt = 0;
  let sent = 0;
  let dropped = 0;
  let delivered = 0;
  let forcedSnaps = 0;

  function hostStep(dt) {
    host.x += host.vx * dt;
    host.y += host.vy * dt;
    if (host.x - FIELD.radius < FIELD.left) {
      host.x = FIELD.left + FIELD.radius;
      host.vx = Math.abs(host.vx);
    }
    if (host.x + FIELD.radius > FIELD.right) {
      host.x = FIELD.right - FIELD.radius;
      host.vx = -Math.abs(host.vx);
    }
    if (host.y - FIELD.radius < FIELD.top) {
      host.y = FIELD.top + FIELD.radius;
      host.vy = Math.abs(host.vy);
    }
    if (host.y + FIELD.radius > FIELD.bottom) {
      host.y = FIELD.bottom - FIELD.radius;
      host.vy = -Math.abs(host.vy);
    }
    const speed = Math.hypot(host.vx, host.vy);
    const targetSpeed = 790;
    host.vx *= targetSpeed / speed;
    host.vy *= targetSpeed / speed;
  }

  function historyAt(targetTime) {
    if (!history.length) return host;
    let older = history[0];
    let newer = history[history.length - 1];
    for (let i = 1; i < history.length; i += 1) {
      if (history[i].t >= targetTime) {
        older = history[i - 1];
        newer = history[i];
        break;
      }
    }
    if (targetTime >= newer.t) {
      const extra = Math.min(35, Math.max(0, targetTime - newer.t)) / 1000;
      return { x: newer.x + newer.vx * extra, y: newer.y + newer.vy * extra, vx: newer.vx, vy: newer.vy };
    }
    const amount = clamp((targetTime - older.t) / Math.max(1, newer.t - older.t), 0, 1);
    return {
      x: lerp(older.x, newer.x, amount),
      y: lerp(older.y, newer.y, amount),
      vx: lerp(older.vx, newer.vx, amount),
      vy: lerp(older.vy, newer.vy, amount),
    };
  }

  function sampleSnapshots(now) {
    if (!snapshots.length) return guest;
    const renderAt = now - SNAPSHOT_DELAY_MS;
    let older = snapshots[0];
    let newer = snapshots[snapshots.length - 1];
    for (let i = 1; i < snapshots.length; i += 1) {
      if (snapshots[i].receivedAt >= renderAt) {
        older = snapshots[i - 1];
        newer = snapshots[i];
        break;
      }
    }
    if (renderAt >= newer.receivedAt) {
      const extra = Math.min(35, Math.max(0, renderAt - newer.receivedAt)) / 1000;
      return { x: newer.x + newer.vx * extra, y: newer.y + newer.vy * extra, vx: newer.vx, vy: newer.vy };
    }
    const amount = clamp((renderAt - older.receivedAt) / Math.max(1, newer.receivedAt - older.receivedAt), 0, 1);
    return {
      x: lerp(older.x, newer.x, amount),
      y: lerp(older.y, newer.y, amount),
      vx: lerp(older.vx, newer.vx, amount),
      vy: lerp(older.vy, newer.vy, amount),
    };
  }

  const durationMs = 24000;
  for (let now = 0; now <= durationMs; now += STEP_MS) {
    hostStep(STEP_MS / 1000);
    history.push({ t: now, ...host });
    while (history.length && history[0].t < now - 1000) history.shift();

    if (now >= nextStateAt) {
      nextStateAt += STATE_MS;
      sent += 1;
      if (random() * 100 < config.loss) {
        dropped += 1;
      } else {
        const jitter = (random() * 2 - 1) * config.jitter;
        const reorder = random() * 100 < config.reorder ? random() * 55 : 0;
        network.push({
          deliverAt: now + Math.max(0, config.delay + jitter + reorder),
          packet: { x: host.x, y: host.y, vx: host.vx, vy: host.vy },
        });
      }
    }

    network.sort((a, b) => a.deliverAt - b.deliverAt);
    while (network.length && network[0].deliverAt <= now) {
      const item = network.shift();
      snapshots.push({ ...item.packet, receivedAt: now });
      if (snapshots.length > 10) snapshots.splice(0, snapshots.length - 10);
      delivered += 1;
    }

    if (snapshots.length) {
      const target = sampleSnapshots(now);
      const distance = Math.hypot(guest.x - target.x, guest.y - target.y);
      if (distance > 220) {
        Object.assign(guest, target);
        forcedSnaps += 1;
      } else {
        const correctionRate = distance > 100 ? 16 : distance > 36 ? 11 : 7;
        const correction = 1 - Math.exp(-correctionRate * STEP_MS / 1000);
        guest.x = lerp(guest.x, target.x, correction);
        guest.y = lerp(guest.y, target.y, correction);
        guest.vx = lerp(guest.vx, target.vx, correction * 0.30);
        guest.vy = lerp(guest.vy, target.vy, correction * 0.30);
      }
    }

    if (now > 2000) {
      const intended = historyAt(now - SNAPSHOT_DELAY_MS - config.delay);
      errors.push(Math.hypot(guest.x - intended.x, guest.y - intended.y));
      liveGaps.push(Math.hypot(guest.x - host.x, guest.y - host.y));
      visualJumps.push(Math.hypot(guest.x - previousGuest.x, guest.y - previousGuest.y));
    }
    previousGuest = { x: guest.x, y: guest.y };
  }

  const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const result = {
    scenario: config.name,
    network: config,
    packets: { sent, delivered, dropped, observedLossPct: +(dropped / sent * 100).toFixed(2) },
    drift: {
      averagePx: +average(errors).toFixed(2),
      p95Px: +percentile(errors, 0.95).toFixed(2),
      maxPx: +Math.max(...errors).toFixed(2),
      averageLiveGapPx: +average(liveGaps).toFixed(2),
      p95VisualJumpPx: +percentile(visualJumps, 0.95).toFixed(2),
      maxVisualJumpPx: +Math.max(...visualJumps).toFixed(2),
      forcedSnaps,
    },
  };
  result.pass = result.drift.averagePx <= 80 && result.drift.p95Px <= 100 && result.drift.maxPx <= 150 && result.drift.p95VisualJumpPx <= 18;
  return result;
}

const results = scenarios.map(simulateScenario);
const report = {
  generatedAt: new Date().toISOString(),
  algorithm: '46ms authoritative snapshot interpolation, 35ms max extrapolation, 120Hz simulation',
  passed: results.every((result) => result.pass),
  results,
};

await fs.mkdir('test-results', { recursive: true });
await fs.writeFile('test-results/puck-sync-matrix.json', JSON.stringify(report, null, 2));
console.table(results.map((r) => ({
  scenario: r.scenario,
  avg: r.drift.averagePx,
  p95: r.drift.p95Px,
  max: r.drift.maxPx,
  jump95: r.drift.p95VisualJumpPx,
  snaps: r.drift.forcedSnaps,
  pass: r.pass,
})));

if (!report.passed) {
  console.error('❌ Puck synchronization matrix failed');
  process.exitCode = 1;
} else {
  console.log('✅ Puck synchronization matrix passed');
}
