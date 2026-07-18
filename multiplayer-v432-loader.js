(() => {
  'use strict';

  const quick = document.getElementById('quick-match-btn');
  const status = document.getElementById('match-status');

  const injectBefore = (source, marker, addition, label) => {
    if (!source.includes(marker)) throw new Error(`v4.3.2 loader patch missing: ${label}`);
    return source.replace(marker, `${addition}\n\n${marker}`);
  };

  async function boot() {
    if (quick) {
      quick.disabled = true;
      quick.textContent = '🌐 雙角色引擎載入中…';
    }

    let loader = await fetch(`multiplayer-v431-loader.js?v=4.3.2-${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });

    const afterBallInjectionMarker = `    loader = loader\n      .replaceAll('v4.3.0', 'v4.3.1')`;

    const roleIdentityLayer = `    const roleIdentityPatches = \`    source = required(source,
      \\\`hud?.classList.add('multiplayer-hud');\\n    if (comboLabel) comboLabel.textContent = '真人對戰';\\\`,
      \\\`hud?.classList.add('multiplayer-hud');\\n    const localAvatar = playerScore?.closest('.hud-player')?.querySelector('.hud-avatar');\\n    const rivalAvatar = aiScore?.closest('.hud-player')?.querySelector('.hud-avatar');\\n    if (localAvatar) localAvatar.textContent = role === 'host' ? '🐢' : '🌀';\\n    if (rivalAvatar) rivalAvatar.textContent = role === 'host' ? '🌀' : '🐢';\\n    if (comboLabel) comboLabel.textContent = '真人對戰';\\\`,
      'role-aware HUD avatars');

    source = required(source,
      \\\`const opponent = remotePaddle;\\n    drawSprite(render.shellSprite, opponent.x, opponent.y, 210);\\n    drawSprite(render.turtleSprite, localPaddle.x, localPaddle.y, 210);\\n    drawSprite(render.puckSprite, ballX, ballY, 90);\\\`,
      \\\`const opponent = remotePaddle;\\n    const localSprite = role === 'host' ? render.turtleSprite : render.shellSprite;\\n    const opponentSprite = role === 'host' ? render.shellSprite : render.turtleSprite;\\n    drawSprite(opponentSprite, opponent.x, opponent.y, 210);\\n    drawSprite(localSprite, localPaddle.x, localPaddle.y, 210);\\n    drawSprite(render.puckSprite, ballX, ballY, 90);\\\`,
      'stable host and guest sprites');

    source = required(source,
      \\\`if (streakHud) streakHud.textContent = role === 'host' ? '主場' : '客場';\\\`,
      \\\`if (streakHud) streakHud.textContent = role === 'host' ? '主場・龜殼' : '客場・旋渦殼';\\\`,
      'role identity label');\`;

    loader = injectAfter(loader, eventMarker, roleIdentityPatches, 'role identity injection');`;

    loader = injectBefore(loader, afterBallInjectionMarker, roleIdentityLayer, 'role identity layer');
    loader = loader
      .replaceAll('v4.3.1', 'v4.3.2')
      .replaceAll('v431', 'v432')
      .replace('⚡ 超順球體配對', '⚡ 雙角色低延遲配對')
      .replace('🌐 球體平滑引擎載入中…', '🌐 雙角色引擎載入中…');

    Function(`${loader}\n//# sourceURL=multiplayer-v432-bootstrap.js`)();
  }

  boot().catch((error) => {
    console.error('Bubble multiplayer v4.3.2 bootstrap failed', error);
    if (quick) {
      quick.disabled = true;
      quick.textContent = '⚠ 雙角色引擎載入失敗';
    }
    if (status) status.textContent = `雙角色引擎載入失敗：${error.message}`;
  });
})();
