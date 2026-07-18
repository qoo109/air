import { test, expect, devices } from '@playwright/test';

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};
const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

async function enterIsland(page, name, query) {
  await page.goto(`/${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.BubbleE2E?.enabled === true);
  const auth = page.locator('#auth-screen');
  if (await auth.evaluate((element) => element.classList.contains('active'))) {
    await page.locator('#guest-name-input').fill(name);
    await page.locator('#guest-login-btn').click();
  }
  await expect(page.locator('#menu')).toHaveClass(/active/);
  await expect(page.locator('#quick-match-btn')).toBeEnabled({ timeout: 45_000 });
}

async function waitForGame(page) {
  await page.waitForFunction(() => document.body.classList.contains('multiplayer-running'), null, { timeout: 120_000 });
  await page.waitForFunction(() => window.BubbleE2E?.getSnapshot?.().puck, null, { timeout: 30_000 });
}

async function drivePaddle(page, phase, durationMs) {
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Game canvas has no bounding box');
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height * 0.79;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  const started = Date.now();
  let index = 0;
  while (Date.now() - started < durationMs) {
    const t = index / 11 + phase;
    const x = box.x + box.width * (0.5 + Math.sin(t) * 0.28);
    const y = box.y + box.height * (0.77 + Math.cos(t * 0.73) * 0.12);
    await page.mouse.move(x, y, { steps: 2 });
    await page.waitForTimeout(55);
    index += 1;
  }
  await page.mouse.up();
}

async function snapshot(page) {
  return page.evaluate(() => window.BubbleE2E.getSnapshot());
}

test('two mobile players stay synchronized and generate a drift report', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);

  const delay = Number(process.env.NET_DELAY || 60);
  const jitter = Number(process.env.NET_JITTER || 20);
  const loss = Number(process.env.NET_LOSS || 2);
  const forceTurn = String(process.env.FORCE_TURN || 'false') === 'true';
  const sampleDurationMs = Number(process.env.SAMPLE_DURATION_MS || 15_000);
  const queryBase = `?e2e=1&netDelay=${delay}&netJitter=${jitter}&netLoss=${loss}${forceTurn ? '&forceTurn=1' : ''}`;

  const contextA = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-TW' });
  const contextB = await browser.newContext({ ...devices['Pixel 7'], locale: 'zh-TW' });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const suffix = String(Date.now()).slice(-5);

  try {
    await Promise.all([
      enterIsland(pageA, `測試甲${suffix}`, `${queryBase}&testSeed=101`),
      enterIsland(pageB, `測試乙${suffix}`, `${queryBase}&testSeed=202`),
    ]);

    await Promise.all([
      pageA.locator('#quick-match-btn').click(),
      pageB.locator('#quick-match-btn').click(),
    ]);
    await Promise.all([waitForGame(pageA), waitForGame(pageB)]);

    const firstA = await snapshot(pageA);
    const firstB = await snapshot(pageB);
    expect(firstA.roleLabel).not.toBe(firstB.roleLabel);

    const hostPage = firstA.roleLabel.includes('主場') ? pageA : pageB;
    const guestPage = hostPage === pageA ? pageB : pageA;
    const hostInitial = hostPage === pageA ? firstA : firstB;
    const guestInitial = hostPage === pageA ? firstB : firstA;
    expect(hostInitial.localAvatar).toBe('🐢');
    expect(guestInitial.localAvatar).toBe('🌀');

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
            distancePx: Math.hypot(host.puck.x - guestInHostView.x, host.puck.y - guestInHostView.y),
            hostPuck: host.puck,
            guestPuck: guest.puck,
            hostDiagnostics: host.diagnostics,
            guestDiagnostics: guest.diagnostics,
          });
        }
        await hostPage.waitForTimeout(100);
      }
    })();

    await Promise.all([
      drivePaddle(hostPage, 0, sampleDurationMs),
      drivePaddle(guestPage, Math.PI, sampleDurationMs),
      sampling,
    ]);

    const [hostFinal, guestFinal] = await Promise.all([snapshot(hostPage), snapshot(guestPage)]);
    const distances = driftSamples.slice(10).map((sample) => sample.distancePx);
    const report = {
      generatedAt: new Date().toISOString(),
      environment: { delay, jitter, loss, forceTurn, sampleDurationMs },
      routes: {
        host: hostFinal.diagnostics,
        guest: guestFinal.diagnostics,
      },
      roles: {
        host: { label: hostFinal.roleLabel, avatar: hostFinal.localAvatar },
        guest: { label: guestFinal.roleLabel, avatar: guestFinal.localAvatar },
      },
      drift: {
        samples: distances.length,
        averagePx: +average(distances).toFixed(2),
        p95Px: +percentile(distances, 0.95).toFixed(2),
        maxPx: +(distances.length ? Math.max(...distances) : 0).toFixed(2),
      },
      visual: {
        host: hostFinal.visual,
        guest: guestFinal.visual,
      },
      packetSimulation: {
        host: hostFinal.counters,
        guest: guestFinal.counters,
      },
      rawSamples: driftSamples,
    };

    await testInfo.attach('multiplayer-drift-report.json', {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: 'application/json',
    });

    console.log(JSON.stringify({ environment: report.environment, routes: report.routes, drift: report.drift, visual: report.visual }, null, 2));

    expect(report.drift.samples).toBeGreaterThan(50);
    expect(report.drift.averagePx).toBeLessThanOrEqual(180);
    expect(report.drift.p95Px).toBeLessThanOrEqual(300);
    expect(report.drift.maxPx).toBeLessThanOrEqual(520);
    expect(hostFinal.visual.p95JumpPx).toBeLessThanOrEqual(90);
    expect(guestFinal.visual.p95JumpPx).toBeLessThanOrEqual(90);
    expect(hostFinal.counters.sendErrors).toBe(0);
    expect(guestFinal.counters.sendErrors).toBe(0);
  } finally {
    await Promise.allSettled([contextA.close(), contextB.close()]);
  }
});
