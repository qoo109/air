import fs from 'node:fs/promises';
import vm from 'node:vm';

const baseSource = await fs.readFile(new URL('../multiplayer-v408.js', import.meta.url), 'utf8');
const loader430Source = await fs.readFile(new URL('../multiplayer-v430-loader.js', import.meta.url), 'utf8');
const loader431Source = await fs.readFile(new URL('../multiplayer-v431-loader.js', import.meta.url), 'utf8');
const loader432Source = await fs.readFile(new URL('../multiplayer-v432-loader.js', import.meta.url), 'utf8');

const quickButton = { disabled: false, textContent: '' };
const matchStatus = { textContent: '' };

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

vm.createContext(context);
vm.runInContext(loader432Source, context, { filename: 'multiplayer-v432-loader.js' });

await new Promise((resolve) => setTimeout(resolve, 320));

if (quickButton.disabled) {
  throw new Error(`v4.3.2 loader stayed disabled: ${quickButton.textContent}; ${matchStatus.textContent}`);
}

if (quickButton.textContent !== '⚡ 雙角色低延遲配對') {
  throw new Error(`Unexpected quick-match label: ${quickButton.textContent}`);
}

if (matchStatus.textContent.includes('失敗')) {
  throw new Error(`Loader reported failure: ${matchStatus.textContent}`);
}

console.log('✅ v4.3.2 role identity, puck smoothing and network patches passed');
