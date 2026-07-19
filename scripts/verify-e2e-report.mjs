import fs from 'node:fs/promises';
import path from 'node:path';

const expectedRoute = String(
  process.env.EXPECT_ROUTE || (String(process.env.FORCE_REALTIME).toLowerCase() === 'true'
    ? 'REALTIME'
    : String(process.env.FORCE_TURN).toLowerCase() === 'true' ? 'METERED' : 'P2P'),
).toUpperCase();
const CENTER = { x: 500, y: 850 };
const CENTER_RADIUS = 20;
const TARGET = expectedRoute === 'REALTIME'
  ? { averagePx: 45, p95Px: 90, maxPx: 160 }
  : { averagePx: 25, p95Px: 50, maxPx: 90 };

const distance = (a, b) => Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.y || 0) - Number(b?.y || 0));
const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};
const summarize = (values) => ({
  samples: values.length,
  averagePx: +average(values).toFixed(2),
  p95Px: +percentile(values, 0.95).toFixed(2),
  maxPx: +(values.length ? Math.max(...values) : 0).toFixed(2),
});

function collectAttachments(node, results = []) {
  if (!node || typeof node !== 'object') return results;
  if (Array.isArray(node)) {
    for (const value of node) collectAttachments(value, results);
    return results;
  }
  if (node.name === 'multiplayer-drift-report.json' && typeof node.body === 'string') results.push(node);
  for (const value of Object.values(node)) collectAttachments(value, results);
  return results;
}

function interpolateHost(samples, targetAt) {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (Number(samples[middle].at) < targetAt) low = middle + 1;
    else high = middle;
  }
  if (low === 0 || low >= samples.length) return null;
  const before = samples[low - 1];
  const after = samples[low];
  const span = Number(after.at) - Number(before.at);
  if (!(span > 0 && span <= 200)) return null;
  const amount = (targetAt - Number(before.at)) / span;
  return {
    x: Number(before.hostPuck.x) + (Number(after.hostPuck.x) - Number(before.hostPuck.x)) * amount,
    y: Number(before.hostPuck.y) + (Number(after.hostPuck.y) - Number(before.hostPuck.y)) * amount,
  };
}

function calculateInterpolatedPathDrift(input) {
  const samples = [...input].sort((a, b) => Number(a.at) - Number(b.at));
  const candidates = [];
  const maxLagMs = expectedRoute === 'REALTIME' ? 400 : 220;
  for (let lagMs = 0; lagMs <= maxLagMs; lagMs += 10) {
    const errors = [];
    for (const sample of samples) {
      const host = interpolateHost(samples, Number(sample.at) - lagMs);
      if (host) errors.push(distance(host, sample.guestInHostView));
    }
    if (errors.length > 30) candidates.push({ lagMs, errors, averagePx: average(errors) });
  }
  const best = candidates.sort((a, b) => a.averagePx - b.averagePx)[0] || { lagMs: 0, errors: [] };
  return { estimatedVisualLagMs: best.lagMs, ...summarize(best.errors) };
}

const reporter = JSON.parse(await fs.readFile('test-results/playwright-results.json', 'utf8'));
const attachment = collectAttachments(reporter).at(-1);
if (!attachment) throw new Error('Playwright JSON reporter did not contain multiplayer-drift-report.json.');
const report = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));

const routes = [report.routes?.host, report.routes?.guest];
const actualRoutes = routes.map(route => String(route?.route || '').toUpperCase());
const peerStates = routes.map(route => String(route?.peerState || '').toLowerCase());
const transports = routes.map(route => String(route?.transport || '').toLowerCase());
if (actualRoutes.some(route => route !== expectedRoute)) throw new Error(`Expected ${expectedRoute}, received ${actualRoutes.join(' / ')}.`);

if (expectedRoute === 'REALTIME') {
  if (transports.some(transport => transport !== 'relay')) throw new Error(`Expected Supabase relay transport, received ${transports.join(' / ')}.`);
  if (peerStates.some(state => state === 'connected')) throw new Error(`Realtime fallback unexpectedly retained connected WebRTC peers: ${peerStates.join(' / ')}.`);
  if (routes.some(route => route?.forcedRealtime !== true)) throw new Error('Realtime fallback run was not marked as intentionally forced on both players.');
} else {
  if (peerStates.some(state => state !== 'connected')) throw new Error(`Expected connected peers, received ${peerStates.join(' / ')}.`);
  if (transports.some(transport => transport !== 'p2p')) throw new Error(`Expected WebRTC DataChannel transport, received ${transports.join(' / ')}.`);
  if (expectedRoute === 'METERED' && routes.some(route => route?.relayOnlyAttempt !== true)) throw new Error('Forced TURN did not use relay-only ICE on both players.');
}

const measured = Array.isArray(report.rawSamples) ? report.rawSamples.slice(10) : [];
const active = measured.filter(sample => distance(sample.hostPuck, CENTER) > CENTER_RADIUS);
const activePlay = {
  excludedServeSamples: measured.length - active.length,
  rawDrift: summarize(active.map(sample => Number(sample.rawDistancePx || 0))),
  pathDrift: calculateInterpolatedPathDrift(active),
};
const drift = activePlay.pathDrift;
if (drift.samples <= 40) throw new Error(`Only ${drift.samples} active-play drift samples were usable.`);
if (drift.averagePx > TARGET.averagePx || drift.p95Px > TARGET.p95Px || drift.maxPx > TARGET.maxPx) {
  throw new Error(`Active-play drift exceeded ${TARGET.averagePx}/${TARGET.p95Px}/${TARGET.maxPx}: avg=${drift.averagePx}, p95=${drift.p95Px}, max=${drift.maxPx}.`);
}

const visualP95 = [report.visual?.host?.p95JumpPx, report.visual?.guest?.p95JumpPx].map(Number);
const visualTarget = expectedRoute === 'REALTIME' ? 65 : 45;
if (visualP95.some(value => !Number.isFinite(value) || value > visualTarget)) throw new Error(`Visual P95 jump failed: ${visualP95.join(' / ')}.`);
const sendErrors = [report.packetSimulation?.host?.sendErrors, report.packetSimulation?.guest?.sendErrors].map(Number);
if (sendErrors.some(value => value !== 0)) throw new Error(`Packet send errors detected: ${sendErrors.join(' / ')}.`);

if (expectedRoute === 'REALTIME') {
  const gameplayPackets = [
    report.packetSimulation?.host?.realtimeGameplayPackets,
    report.packetSimulation?.guest?.realtimeGameplayPackets,
  ].map(Number);
  const realtimeErrors = [
    report.packetSimulation?.host?.realtimeSendErrors,
    report.packetSimulation?.guest?.realtimeSendErrors,
  ].map(Number);
  if (gameplayPackets.some(value => !Number.isFinite(value) || value <= 20)) throw new Error(`Realtime gameplay traffic was insufficient: ${gameplayPackets.join(' / ')}.`);
  if (realtimeErrors.some(value => value !== 0)) throw new Error(`Realtime send errors detected: ${realtimeErrors.join(' / ')}.`);
}

const result = {
  verifiedAt: new Date().toISOString(),
  expectedRoute,
  thresholds: TARGET,
  environment: report.environment,
  routes: report.routes,
  fullWindow: { rawDrift: report.rawDrift, pathDrift: report.pathDrift },
  activePlay,
  visual: report.visual,
  packetSimulation: report.packetSimulation,
};
await fs.mkdir('test-results', { recursive: true });
await fs.writeFile(path.join('test-results', `route-gate-${expectedRoute.toLowerCase()}.json`), `${JSON.stringify(result, null, 2)}\n`);
console.log(`✅ ${expectedRoute} route verified on both players`);
console.log(`✅ Active-play drift: avg ${drift.averagePx}px / p95 ${drift.p95Px}px / max ${drift.maxPx}px`);
