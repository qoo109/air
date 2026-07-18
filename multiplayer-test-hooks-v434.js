(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const enabled = params.get('e2e') === '1' || params.has('testNet') || params.has('netDelay');
  if (!enabled) {
    window.BubbleE2E = { enabled: false };
    return;
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const numberParam = (name, fallback, min, max) => {
    const value = Number(params.get(name));
    return Number.isFinite(value) ? clamp(value, min, max) : fallback;
  };

  const compact = String(params.get('testNet') || '').split(',').map(Number);
  const config = {
    delayMs: numberParam('netDelay', Number.isFinite(compact[0]) ? compact[0] : 0, 0, 1000),
    jitterMs: numberParam('netJitter', Number.isFinite(compact[1]) ? compact[1] : 0, 0, 500),
    lossPct: numberParam('netLoss', Number.isFinite(compact[2]) ? compact[2] : 0, 0, 50),
    seed: numberParam('testSeed', 4317, 1, 2147483646),
  };

  let randomState = config.seed >>> 0;
  const random = () => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  };

  const counters = {
    gameplayPackets: 0,
    delayedPackets: 0,
    droppedPackets: 0,
    sendErrors: 0,
    renderedFrames: 0,
    puckSamples: 0,
    maxPuckJumpPx: 0,
  };

  if (typeof RTCDataChannel !== 'undefined') {
    const originalSend = RTCDataChannel.prototype.send;
    RTCDataChannel.prototype.send = function patchedSend(data) {
      if (this.label !== 'bubble-game' || (!config.delayMs && !config.jitterMs && !config.lossPct)) {
        return originalSend.call(this, data);
      }

      counters.gameplayPackets += 1;
      if (random() * 100 < config.lossPct) {
        counters.droppedPackets += 1;
        return undefined;
      }

      const jitter = (random() * 2 - 1) * config.jitterMs;
      const delay = Math.max(0, Math.round(config.delayMs + jitter));
      if (!delay) return originalSend.call(this, data);

      counters.delayedPackets += 1;
      const channel = this;
      const payload = typeof data === 'string' ? String(data) : data;
      setTimeout(() => {
        if (channel.readyState !== 'open') return;
        try {
          originalSend.call(channel, payload);
        } catch (_) {
          counters.sendErrors += 1;
        }
      }, delay);
      return undefined;
    };
  }

  let lastPuck = null;
  let previousPuck = null;
  const puckHistory = [];

  if (typeof CanvasRenderingContext2D !== 'undefined') {
    const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function patchedDrawImage(...args) {
      const result = originalDrawImage.apply(this, args);
      if (this.canvas?.id !== 'gameCanvas') return result;

      counters.renderedFrames += 1;
      if (args.length !== 5) return result;
      const [, dx, dy, width, height] = args;
      const scale = this.canvas.width / 1000;
      if (!Number.isFinite(scale) || scale <= 0) return result;
      const logicalWidth = width / scale;
      const logicalHeight = height / scale;
      if (logicalWidth < 82 || logicalWidth > 98 || logicalHeight < 82 || logicalHeight > 98) return result;

      const puck = {
        x: (dx + width / 2) / scale,
        y: (dy + height / 2) / scale,
        at: performance.now(),
      };
      if (previousPuck) {
        const jump = Math.hypot(puck.x - previousPuck.x, puck.y - previousPuck.y);
        counters.maxPuckJumpPx = Math.max(counters.maxPuckJumpPx, jump);
        puck.jumpPx = jump;
      } else {
        puck.jumpPx = 0;
      }
      previousPuck = puck;
      lastPuck = puck;
      counters.puckSamples += 1;
      puckHistory.push(puck);
      if (puckHistory.length > 1200) puckHistory.splice(0, puckHistory.length - 1200);
      return result;
    };
  }

  const quantile = (values, value) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * value))];
  };

  window.BubbleE2E = {
    enabled: true,
    config,
    reset() {
      previousPuck = null;
      lastPuck = null;
      puckHistory.length = 0;
      counters.maxPuckJumpPx = 0;
      counters.puckSamples = 0;
    },
    getSnapshot() {
      const jumps = puckHistory.map((sample) => Number(sample.jumpPx || 0));
      return {
        at: performance.now(),
        puck: lastPuck ? { ...lastPuck } : null,
        roleLabel: document.getElementById('win-streak-hud')?.textContent || '',
        localAvatar: document.querySelector('.hud-you .hud-avatar')?.textContent || '',
        rivalAvatar: document.querySelector('.hud-ai .hud-avatar')?.textContent || '',
        playerScore: document.getElementById('player-score')?.textContent || '',
        rivalScore: document.getElementById('ai-score')?.textContent || '',
        diagnostics: window.BubbleMultiplayer?.diagnostics?.() || null,
        counters: { ...counters },
        visual: {
          p95JumpPx: quantile(jumps, 0.95),
          maxJumpPx: counters.maxPuckJumpPx,
        },
      };
    },
    exportReport() {
      return {
        generatedAt: new Date().toISOString(),
        config: { ...config },
        snapshot: this.getSnapshot(),
        puckHistory: puckHistory.map((sample) => ({ ...sample })),
      };
    },
  };
})();
