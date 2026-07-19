import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const expectedRoute = String(
  process.env.EXPECT_ROUTE || (String(process.env.FORCE_TURN).toLowerCase() === 'true' ? 'METERED' : 'P2P'),
).toUpperCase();

function extractJsonObjects(text, marker = '"environment"') {
  const results = [];
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const markerIndex = text.indexOf(marker, searchFrom);
    if (markerIndex < 0) break;
    const start = text.lastIndexOf('{', markerIndex);
    if (start < 0) break;

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }

    if (end < 0) break;
    try {
      const parsed = JSON.parse(text.slice(start, end));
      if (parsed?.environment && parsed?.routes && parsed?.pathDrift) results.push(parsed);
    } catch (_) {}
    searchFrom = end;
  }

  return results;
}

const child = spawn('npm', ['run', 'test:e2e'], {
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

let output = '';
const capture = (chunk, target) => {
  const text = chunk.toString();
  output += text;
  target.write(text);
};
child.stdout.on('data', (chunk) => capture(chunk, process.stdout));
child.stderr.on('data', (chunk) => capture(chunk, process.stderr));

const exitCode = await new Promise((resolve) => {
  child.on('error', (error) => {
    console.error('Unable to start Playwright E2E:', error);
    resolve(1);
  });
  child.on('close', (code) => resolve(code ?? 1));
});

if (exitCode !== 0) process.exit(exitCode);

const reports = extractJsonObjects(output);
const report = reports.at(-1);
if (!report) throw new Error('E2E completed without a parseable multiplayer drift report.');

const host = report.routes?.host || {};
const guest = report.routes?.guest || {};
const actualRoutes = [host.route, guest.route].map((value) => String(value || '').toUpperCase());
const peerStates = [host.peerState, guest.peerState].map((value) => String(value || '').toLowerCase());
const transports = [host.transport, guest.transport].map((value) => String(value || '').toLowerCase());

if (actualRoutes.some((route) => route !== expectedRoute)) {
  throw new Error(`Expected both players to use ${expectedRoute}, received ${actualRoutes.join(' / ') || 'unknown'}.`);
}
if (peerStates.some((state) => state !== 'connected')) {
  throw new Error(`Expected connected WebRTC peers, received ${peerStates.join(' / ') || 'unknown'}.`);
}
if (transports.some((transport) => transport !== 'p2p')) {
  throw new Error(`Expected WebRTC DataChannel transport, received ${transports.join(' / ') || 'unknown'}.`);
}
if (expectedRoute === 'METERED' && [host.relayOnlyAttempt, guest.relayOnlyAttempt].some((value) => value !== true)) {
  throw new Error('Forced TURN run connected without relayOnlyAttempt on both players.');
}

const routeReport = {
  verifiedAt: new Date().toISOString(),
  expectedRoute,
  environment: report.environment,
  routes: report.routes,
  pathDrift: report.pathDrift,
  rawDrift: report.rawDrift,
  visual: report.visual,
};
const outputDirectory = path.resolve('test-results');
await fs.mkdir(outputDirectory, { recursive: true });
await fs.writeFile(
  path.join(outputDirectory, `route-gate-${expectedRoute.toLowerCase()}.json`),
  `${JSON.stringify(routeReport, null, 2)}\n`,
);

console.log(`✅ Route gate passed: ${expectedRoute} on both players`);
