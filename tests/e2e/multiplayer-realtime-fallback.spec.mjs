import { test, expect, devices } from '@playwright/test';

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};
const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function collectBrowserDiagnostics(page, label) {
  const entries = [];
  const push = (type, text) => {
    entries.push({ at: new Date().toISOString(), label, type, text: String(text).slice(0, 2000) });
    if (entries.length > 600) entries.splice(0, entries.length - 600);
  };
  page.on('console', message => push(`console:${message.type()}`, message.text()));
  page.on('pageerror', error => push('pageerror', error?.stack || error?.message || error));
  page.on('requestfailed', request => push('requestfailed', `${request.method()} ${request.url()} — ${request.failure()?.errorText || 'unknown'}`));
  return entries;
}

async function pageState(page) {
  return page.evaluate(() => ({
    url: location.href,
    bodyClasses: document.body.className,
    status: document.getElementById('match-status')?.textContent || '',
    queue: document.getElementById('queue-online')?.textContent || '',
    queueTime: document.getElementById('queue-time')?.textContent || '',
    quickLabel: document.getElementById('quick-match-btn')?.textContent || '',
    quickDisabled: Boolean(document.getElementById('quick-match-btn')?.disabled),
    menuActive: Boolean(document.getElementById('menu')?.classList.contains('active')),
    matchActive: Boolean(document.getElementById('match-screen')?.classList.contains('active')),
    e2eEnabled: window.BubbleE2E?.enabled === true,
    snapshot: window.BubbleE2E?.getSnapshot?.() || null,
  }));
}

async function attachJson(testInfo, name, value) {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: 'application/json',
  });
}

async function enterIsland(page, name, query) {
  await page.goto(query, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.BubbleE2E?.enabled === true, null, { timeout: 30_000 });
  const auth = page.locator('#auth-screen');
  if (await auth.evaluate(element => element.classList.contains('active'))) {
    await page.locator('#guest-name-input').fill(name);
    await page.locator('#guest-login-btn').click();
  }
  await expect(page.locator('#menu')).toHaveClass(/active/, { timeout: 30_000 });
  await expect(page.locator('#quick-match-btn')).toBeEnabled({ timeout: 45_000 });
}

async function leaveMatch(page) {
  await page.evaluate(async () => {
    try { await window.BubbleMultiplayer?.leave?.('e2e-retry'); } catch (_) {}
  });
  await page.waitForFunction(() => document.getElementById('menu')?.classList.contains('active'), null, { timeout: 20_000 });
}

async function waitForGamePair(pageA, pageB, timeoutMs) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const [stateA, stateB] = await Promise.all([pageState(pageA), pageState(pageB)]);
    last = { stateA, stateB };
    const ready = [stateA, stateB].every(state => state.bodyClasses.includes('multiplayer-running') && state.snapshot?.puck);
    if (ready) return last;
    const combined = `${stateA.status} ${stateA.queue} ${stateB.status} ${stateB.queue}`;
    if (/連線失敗|設定錯誤|匿名登入.*限制|權限被拒絕|資料庫尚未安裝|CHANNEL_ERROR|TIMED_OUT/i.test(combined)) {
      throw new Error(`Realtime 備援明確失敗：${combined}`);
    }
    await pageA.waitForTimeout(500);
  }
  throw new Error(`等待 Realtime 雙玩家進入遊戲逾時：${JSON.stringify(last)}`);
}

async function pairWithOneRetry(pageA, pageB, testInfo) {
  const attempts = [
    { first: pageA, second: pageB, label: 'A-first' },
    { first: pageB, second: pageA, label: 'B-first-retry' },
  ];
  let previousError = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (index > 0) {
      await Promise.allSettled([leaveMatch(pageA), leaveMatch(pageB)]);
      await pageA.waitForTimeout(700);
    }
    await attempt.first.locator('#quick-match-btn').click();
    await attempt.first.waitForTimeout(650);
    await attempt.second.locator('#quick-match-btn').click();
    try {
      return await waitForGamePair(pageA, pageB, index === 0 ? 65_000 : 85_000);
    } catch (error) {
      previousError = error;
      const states = await Promise.all([pageState(pageA), pageState(pageB)]);
      await attachJson(testInfo, `realtime-pairing-attempt-${index + 1}-${attempt.label}.json`, {
        error: error instanceof Error ? error.message : String(error),
        pageA: states[0],
        pageB: states[1],
      });
    }
  }
  throw previousError || new Error('Realtime 雙玩家配對失敗');
}

async function drivePaddle(page, phase, durationMs) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Game canvas has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.79);
  await page.mouse.down();
  const started = Date.now();
  let index = 0;
  while (Date.now() - started < durationMs) {
    const t = index / 11 + phase;
    await page.mouse.move(
      box.x + box.width * (0.5 + Math.sin(t) * 0.28),
      box.y + box.height * (0.77 + Math.cos(t * 0.73) * 0.12),
      { steps: 2 },
    );
    await page.waitForTimeout(55);
    index += 1;
  }
  await page.mouse.up();
}

async function snapshot(page) {
  return page.evaluate(() => window.BubbleE2E.getSnapshot());
}

function calculateLagCompensatedDrift(samples) {
  const usable = samples.slice(10);
  const candidates = [];
  for (let lagMs = 0; lagMs <= 400; lagMs += 10) {
    const errors = [];
    for (const sample of usable) {
      const targetAt = sample.at - lagMs;
      let closest = null;
      let closestDelta = Infinity;
      for (const hostSample of usable) {
        const delta = Math.abs(hostSample.at - targetAt);
        if (delta < closestDelta) {
          closest = hostSample;
          closestDelta = delta;
        }
      }
      if (closest && closestDelta <= 100) errors.push(distance(closest.hostPuck, sample.guestInHostView));
    }
    if (errors.length > 30) candidates.push({ lagMs, errors, averagePx: average(errors) });
  }
  const best = candidates.sort((a, b) => a.averagePx - b.averagePx)[0] || { lagMs: 0, errors: [] };
  return {
    estimatedVisualLagMs: best.lagMs,
    samples: best.errors.length,
    averagePx: +average(best.errors).toFixed(2),
    p95Px: +percentile(best.errors, 0.95).toFixed(2),
    maxPx: +(best.errors.length ? Math.max(...best.errors) : 0).toFixed(2),
  };
}

test('two mobile players fall back to Supabase Realtime and stay synchronized', async ({ browser }, testInfo) => {
  test.setTimeout(270_000);
  const delay = Number(process.env.NET_DELAY || 60);
  const jitter = Number(process.env.NET_JITTER || 20);
  const loss = Number(process.env.NET_LOSS || 2);
  const sampleDurationMs = Number(process.env.SAMPLE_DURATION_MS || 15_000);
  const queryBase = `?e2e=1&forceRealtime=1&netDelay=${delay}&netJitter=${jitter}&netLoss=${loss}`;

  const contextA = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-TW' });
  const contextB = await browser.newContext({ ...devices['Pixel 7'], locale: 'zh-TW' });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const logA = collectBrowserDiagnostics(pageA, 'player-A');
  const logB = collectBrowserDiagnostics(pageB, 'player-B');
  const suffix = String(Date.now()).slice(-5);

  try {
    await Promise.all([
      enterIsland(pageA, `備援甲${suffix}`, `${queryBase}&testSeed=303`),
      enterIsland(pageB, `備援乙${suffix}`, `${queryBase}&testSeed=404`),
    ]);
    await pairWithOneRetry(pageA, pageB, testInfo);

    const firstA = await snapshot(pageA);
    const firstB = await snapshot(pageB);
    expect(firstA.roleLabel).not.toBe(firstB.roleLabel);
    const hostPage = firstA.roleLabel.includes('主場') ? pageA : pageB;
    const guestPage = hostPage === pageA ? pageB : pageA;
    const hostInitial = hostPage === pageA ? firstA : firstB;
    const guestInitial = hostPage === pageA ? firstB : firstA;
    expect(hostInitial.diagnostics?.route).toBe('REALTIME');
    expect(guestInitial.diagnostics?.route).toBe('REALTIME');
    expect(hostInitial.diagnostics?.transport).toBe('relay');
    expect(guestInitial.diagnostics?.transport).toBe('relay');

    await Promise.all([
      hostPage.evaluate(() => window.BubbleE2E.reset()),
      guestPage.evaluate(() => window.BubbleE2E.reset()),
    ]);

    const driftSamples = [];
    const sampling = (async () => {
      const started = Date.now();
      while (Date.now() - started < sampleDurationMs) {
        const [host, guest] = await Promise.all([snapshot(hostPage), snapshot(guestPage)]);
        if (host.puck && guest.puck) {
          const guestInHostView = { x: 1000 - guest.puck.x, y: 1600 - guest.puck.y };
          driftSamples.push({
            at: Date.now(),
            rawDistancePx: distance(host.puck, guestInHostView),
            hostPuck: host.puck,
            guestPuck: guest.puck,
            guestInHostView,
            hostDiagnostics: host.diagnostics,
            guestDiagnostics: guest.diagnostics,
          });
        }
        await hostPage.waitForTimeout(80);
      }
    })();

    await Promise.all([
      drivePaddle(hostPage, 0, sampleDurationMs),
      drivePaddle(guestPage, Math.PI, sampleDurationMs),
      sampling,
    ]);

    const [hostFinal, guestFinal] = await Promise.all([snapshot(hostPage), snapshot(guestPage)]);
    const rawDistances = driftSamples.slice(10).map(sample => sample.rawDistancePx);
    const pathDrift = calculateLagCompensatedDrift(driftSamples);
    const report = {
      generatedAt: new Date().toISOString(),
      environment: { delay, jitter, loss, forceTurn: false, forceRealtime: true, sampleDurationMs },
      routes: { host: hostFinal.diagnostics, guest: guestFinal.diagnostics },
      roles: {
        host: { label: hostFinal.roleLabel, avatar: hostFinal.localAvatar },
        guest: { label: guestFinal.roleLabel, avatar: guestFinal.localAvatar },
      },
      rawDrift: {
        samples: rawDistances.length,
        averagePx: +average(rawDistances).toFixed(2),
        p95Px: +percentile(rawDistances, 0.95).toFixed(2),
        maxPx: +(rawDistances.length ? Math.max(...rawDistances) : 0).toFixed(2),
      },
      pathDrift,
      visual: { host: hostFinal.visual, guest: guestFinal.visual },
      packetSimulation: { host: hostFinal.counters, guest: guestFinal.counters },
      rawSamples: driftSamples,
    };

    await attachJson(testInfo, 'multiplayer-drift-report.json', report);
    console.log(JSON.stringify({
      environment: report.environment,
      routes: report.routes,
      rawDrift: report.rawDrift,
      pathDrift: report.pathDrift,
      visual: report.visual,
      realtimePackets: {
        host: hostFinal.counters.realtimeGameplayPackets,
        guest: guestFinal.counters.realtimeGameplayPackets,
      },
    }, null, 2));

    expect(report.pathDrift.samples).toBeGreaterThan(40);
    expect(hostFinal.counters.realtimeGameplayPackets).toBeGreaterThan(20);
    expect(guestFinal.counters.realtimeGameplayPackets).toBeGreaterThan(20);
    expect(hostFinal.counters.realtimeSendErrors).toBe(0);
    expect(guestFinal.counters.realtimeSendErrors).toBe(0);
  } catch (error) {
    const [stateA, stateB] = await Promise.allSettled([pageState(pageA), pageState(pageB)]);
    await attachJson(testInfo, 'failure-diagnostics.json', {
      error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
      playerA: stateA.status === 'fulfilled' ? stateA.value : String(stateA.reason),
      playerB: stateB.status === 'fulfilled' ? stateB.value : String(stateB.reason),
      logs: [...logA, ...logB],
    });
    throw error;
  } finally {
    await Promise.allSettled([contextA.close(), contextB.close()]);
  }
});
