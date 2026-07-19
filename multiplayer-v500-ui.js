(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const roomInput = $('friend-room-code');
  const createButton = $('create-room-btn');
  const joinButton = $('join-room-btn');
  const copyButton = $('copy-room-btn');
  const roomHint = $('friend-room-hint');
  const roomWait = $('room-wait-code');
  const connectionDetails = $('connection-details');
  const networkHud = $('network-quality-hud');

  const normalize = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const generateCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
  };
  const roomUrl = code => {
    const url = new URL(location.href);
    url.searchParams.set('room', code);
    url.searchParams.delete('forceTurn');
    url.hash = '';
    return url.toString();
  };
  const setHint = (text, kind = '') => {
    if (!roomHint) return;
    roomHint.textContent = text;
    roomHint.dataset.kind = kind;
  };
  const engine = () => window.BubbleMultiplayer;
  const waitForEngine = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (engine()?.startRoom) return engine();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('多人連線引擎尚未完成載入。');
  };
  const copyInvite = async code => {
    const link = roomUrl(code);
    try {
      await navigator.clipboard.writeText(link);
      setHint(`邀請連結已複製｜房號 ${code}`, 'success');
      return true;
    } catch (_) {
      setHint(`房號 ${code}｜請把房號傳給好友`, 'success');
      return false;
    }
  };

  roomInput?.addEventListener('input', () => {
    roomInput.value = normalize(roomInput.value);
    setHint(roomInput.value.length === 6 ? '房號格式正確，可以加入。' : '輸入 6 碼房號。');
  });

  createButton?.addEventListener('click', async event => {
    event.preventDefault();
    const code = generateCode();
    if (roomInput) roomInput.value = code;
    createButton.disabled = true;
    joinButton && (joinButton.disabled = true);
    try {
      await copyInvite(code);
      const multiplayer = await waitForEngine();
      await multiplayer.startRoom(code, 'host');
    } catch (error) {
      setHint(error?.message || '建立好友房失敗。', 'error');
    } finally {
      createButton.disabled = false;
      joinButton && (joinButton.disabled = false);
    }
  });

  joinButton?.addEventListener('click', async event => {
    event.preventDefault();
    const code = normalize(roomInput?.value);
    if (code.length !== 6) {
      setHint('請先輸入完整的 6 碼房號。', 'error');
      roomInput?.focus();
      return;
    }
    createButton && (createButton.disabled = true);
    joinButton.disabled = true;
    setHint(`正在加入房號 ${code}…`);
    try {
      const multiplayer = await waitForEngine();
      await multiplayer.startRoom(code, 'guest');
    } catch (error) {
      setHint(error?.message || '加入好友房失敗。', 'error');
    } finally {
      createButton && (createButton.disabled = false);
      joinButton.disabled = false;
    }
  });

  copyButton?.addEventListener('click', async event => {
    event.preventDefault();
    const code = engine()?.diagnostics?.()?.roomCode || normalize(roomInput?.value);
    if (code) await copyInvite(code);
  });

  const incomingRoom = normalize(new URLSearchParams(location.search).get('room'));
  if (incomingRoom.length === 6 && roomInput) {
    roomInput.value = incomingRoom;
    setHint(`收到好友邀請｜房號 ${incomingRoom}，按「加入房間」。`, 'success');
  }

  function qualityOf(diagnostics) {
    const latency = Number(diagnostics?.latency || 0);
    const jitter = Number(diagnostics?.jitter || 0);
    const isRelay = diagnostics?.transport === 'relay' || diagnostics?.route === 'REALTIME';
    if (diagnostics?.peerState === 'disconnected' || diagnostics?.peerState === 'failed') {
      return { key: 'recovering', label: '正在恢復', icon: '🔄' };
    }
    if (isRelay) return { key: 'relay', label: latency > 130 ? '備援較慢' : '備援連線', icon: '🛟' };
    if (!latency) return { key: 'pending', label: '測量中', icon: '◌' };
    if (latency <= 45 && jitter <= 14) return { key: 'excellent', label: '極佳', icon: '●' };
    if (latency <= 80 && jitter <= 28) return { key: 'good', label: '穩定', icon: '●' };
    if (latency <= 130) return { key: 'fair', label: '普通', icon: '▲' };
    return { key: 'slow', label: '較慢', icon: '⚠' };
  }

  function routeLabel(diagnostics) {
    if (diagnostics?.transport === 'relay' || diagnostics?.route === 'REALTIME') return 'Realtime 備援';
    if (diagnostics?.route === 'METERED') return 'Metered TURN';
    if (diagnostics?.route === 'P2P') return 'P2P 直連';
    return '連線準備';
  }

  function updateNetworkUi() {
    const diagnostics = engine()?.diagnostics?.();
    if (!diagnostics) return;
    const quality = qualityOf(diagnostics);
    const route = routeLabel(diagnostics);
    const latency = Number(diagnostics.latency || 0);
    const jitter = Number(diagnostics.jitter || 0);
    const metrics = latency ? `${latency}ms｜抖動 ${jitter}ms` : '正在測量延遲';
    const text = `${quality.icon} ${route}｜${quality.label}｜${metrics}`;
    if (connectionDetails) {
      connectionDetails.textContent = text;
      connectionDetails.dataset.quality = quality.key;
    }
    if (networkHud) {
      networkHud.textContent = latency ? `${route} ${latency}ms・${quality.label}` : `${route}・${quality.label}`;
      networkHud.dataset.quality = quality.key;
    }
    if (roomWait) {
      roomWait.hidden = diagnostics.matchKind !== 'room' || !diagnostics.roomCode;
      if (!roomWait.hidden) roomWait.textContent = `好友房 ${diagnostics.roomCode}`;
    }
    if (copyButton) copyButton.hidden = diagnostics.matchKind !== 'room' || !diagnostics.roomCode;
    document.body.dataset.networkQuality = quality.key;
  }

  setInterval(updateNetworkUi, 400);
  addEventListener('bubble-multiplayer-ready', updateNetworkUi);
  updateNetworkUi();
})();
