import fs from 'node:fs/promises';
import vm from 'node:vm';

const baseSource = await fs.readFile(new URL('../multiplayer-v408.js', import.meta.url), 'utf8');
const loaderSource = await fs.readFile(new URL('../multiplayer-v430-loader.js', import.meta.url), 'utf8');

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
    if (!String(url).includes('multiplayer-v408.js')) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return {
      ok: true,
      status: 200,
      text: async () => baseSource,
    };
  },
};
context.window = context;
context.globalThis = context;

vm.createContext(context);
vm.runInContext(loaderSource, context, { filename: 'multiplayer-v430-loader.js' });

await new Promise((resolve) => setTimeout(resolve, 80));

if (quickButton.disabled) {
  throw new Error(`v4.3.0 loader stayed disabled: ${quickButton.textContent}; ${matchStatus.textContent}`);
}

if (quickButton.textContent !== '⚡ 智慧低延遲配對') {
  throw new Error(`Unexpected quick-match label: ${quickButton.textContent}`);
}

if (matchStatus.textContent.includes('失敗')) {
  throw new Error(`Loader reported failure: ${matchStatus.textContent}`);
}

console.log('✅ v4.3.0 loader patch validation passed');
