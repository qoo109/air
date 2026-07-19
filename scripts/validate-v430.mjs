import fs from 'node:fs/promises';
import vm from 'node:vm';

const baseSource = await fs.readFile(new URL('../multiplayer-v408.js', import.meta.url), 'utf8');
const loader430Source = await fs.readFile(new URL('../multiplayer-v430-loader.js', import.meta.url), 'utf8');
const loader431Source = await fs.readFile(new URL('../multiplayer-v431-loader.js', import.meta.url), 'utf8');
const loader432Source = await fs.readFile(new URL('../multiplayer-v432-loader.js', import.meta.url), 'utf8');
const loader433Source = await fs.readFile(new URL('../multiplayer-v433-loader.js', import.meta.url), 'utf8');
const loader435Source = await fs.readFile(new URL('../multiplayer-v435-loader.js', import.meta.url), 'utf8');

const quickButton = { disabled: false, textContent: '' };
const matchStatus = { textContent: '' };
const executedSources = [];

const context = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  JSON,
  Promise,
  URL,
  location: { search: '' },
  matchMedia: () => ({ matches: false }),
  document: {
    getElementById(id) {
      if (id === 'quick-match-btn') return quickButton;
      if (id === 'match-status') return matchStatus;
      return null;
    },
  },
  fetch: async (url) => {
    const target = String(url);
    if (target.includes('multiplayer-v433-loader.js')) {
      return { ok: true, status: 200, text: async () => loader433Source };
    }
    if (target.includes('multiplayer-v432-loader.js')) {
      return { ok: true, status: 200, text: async () => loader432Source };
    }
    if (target.includes('multiplayer-v431-loader.js')) {
      return { ok: true, status: 200, text: async () => loader431Source };
    }
    if (target.includes('multiplayer-v430-loader.js')) {
      return { ok: true, status: 200, text: async () => loader430Source };
    }
    if (target.includes('multiplayer-v408.js')) {
      return { ok: true, status: 200, text: async () => baseSource };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  },
};
context.window = context;
context.globalThis = context;
context.Function = (source) => () => {
  const code = String(source);
  executedSources.push(code);
  return vm.runInContext(code, context, {
    filename: `dynamic-multiplayer-${executedSources.length}.js`,
  });
};

vm.createContext(context);
vm.runInContext(loader435Source, context, { filename: 'multiplayer-v435-loader.js' });

await new Promise((resolve) => setTimeout(resolve, 650));

if (quickButton.disabled) {
  throw new Error(`v4.3.5 loader stayed disabled: ${quickButton.textContent}; ${matchStatus.textContent}`);
}

if (quickButton.textContent !== '⚡ 自適應穩定同步配對') {
  throw new Error(`Unexpected quick-match label: ${quickButton.textContent}`);
}

if (matchStatus.textContent.includes('失敗')) {
  throw new Error(`Loader reported failure: ${matchStatus.textContent}`);
}

const runtimeSource = [...executedSources]
  .reverse()
  .find((source) => source.includes('function receiveAuthoritativeState(packet)'));

if (!runtimeSource) {
  throw new Error('v4.3.5 validation did not capture the fully patched multiplayer runtime');
}

const receiveStart = runtimeSource.indexOf('function receiveAuthoritativeState(packet)');
const receiveEnd = runtimeSource.indexOf('function updateGuest(dt)', receiveStart);
if (receiveStart < 0 || receiveEnd < 0) {
  throw new Error('v4.3.5 validation could not isolate receiveAuthoritativeState');
}

const receiveSource = runtimeSource.slice(receiveStart, receiveEnd);
const snapshotScoreDeclaration = receiveSource.indexOf('const snapshotScoreChanged =');
const snapshotScoreUse = receiveSource.indexOf('snapshotScoreChanged', snapshotScoreDeclaration + 1);
const scoreChangedDeclaration = receiveSource.indexOf('const scoreChanged =');
const scoreChangedBeforeDeclaration = scoreChangedDeclaration >= 0
  && /\bscoreChanged\b/.test(receiveSource.slice(0, scoreChangedDeclaration));

if (snapshotScoreDeclaration < 0 || snapshotScoreUse < snapshotScoreDeclaration) {
  throw new Error('v4.3.5 collision snapshot queue is missing a safe score-change guard');
}

if (scoreChangedBeforeDeclaration) {
  throw new Error('v4.3.5 runtime reads scoreChanged before its declaration');
}

console.log('✅ v4.3.5 adaptive synchronization, runtime ordering, snapshot interpolation, roles, fixed-step physics and network patches passed');
