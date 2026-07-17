(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const authScreen=$('auth-screen');
  const menu=$('menu');
  const matchScreen=$('match-screen');
  const guestBtn=$('guest-login-btn');
  const nameInput=$('guest-name-input');
  const logoutBtn=$('logout-btn');
  const quickMatchBtn=$('quick-match-btn');
  const cancelMatchBtn=$('cancel-match-btn');
  const authMessage=$('auth-message');
  const playerName=$('player-name');
  const playerAvatar=$('player-avatar');
  const queueTime=$('queue-time');
  const matchStatus=$('match-status');

  let queueTimer=null;
  let queueSeconds=0;

  const normalizeName=value=>value.replace(/\s+/g,' ').trim();

  function createGuest(name) {
    return {
      id:`guest-${Date.now()}-${Math.floor(Math.random()*10000)}`,
      name,
      avatar:'🐢',
      provider:'guest'
    };
  }

  function showMenu(user) {
    localStorage.setItem('bubble_island_user',JSON.stringify(user));
    if (playerName) playerName.textContent=user.name || '玩家';
    if (playerAvatar) playerAvatar.textContent='🐢';
    authScreen?.classList.remove('active');
    matchScreen?.classList.remove('active');
    menu?.classList.add('active');
    dispatchEvent(new CustomEvent('bubble-player-updated',{detail:user}));
  }

  function submitName() {
    const name=normalizeName(nameInput?.value || '');
    if (name.length<2) {
      if (authMessage) authMessage.textContent='名字至少需要 2 個字元喔！';
      nameInput?.focus();
      return;
    }
    if (name.length>12) {
      if (authMessage) authMessage.textContent='名字最多只能有 12 個字元。';
      nameInput?.focus();
      return;
    }
    showMenu(createGuest(name));
  }

  function changeName() {
    clearInterval(queueTimer);
    localStorage.removeItem('bubble_island_user');
    menu?.classList.remove('active');
    matchScreen?.classList.remove('active');
    authScreen?.classList.add('active');
    if (nameInput) nameInput.value='';
    if (authMessage) authMessage.textContent='輸入新名字後再進入泡泡島';
    setTimeout(()=>nameInput?.focus(),50);
  }

  guestBtn?.addEventListener('click',submitName);
  nameInput?.addEventListener('keydown',event=>{
    if (event.key==='Enter') submitName();
  });
  logoutBtn?.addEventListener('click',changeName);

  quickMatchBtn?.addEventListener('click',()=>{
    menu?.classList.remove('active');
    matchScreen?.classList.add('active');
    queueSeconds=0;
    if (queueTime) queueTime.textContent='00:00';
    if (matchStatus) matchStatus.textContent='快速配對介面已就緒，等待真人配對功能上線…';
    clearInterval(queueTimer);
    queueTimer=setInterval(()=>{
      queueSeconds++;
      const mm=String(Math.floor(queueSeconds/60)).padStart(2,'0');
      const ss=String(queueSeconds%60).padStart(2,'0');
      if (queueTime) queueTime.textContent=`${mm}:${ss}`;
    },1000);
  });

  cancelMatchBtn?.addEventListener('click',()=>{
    clearInterval(queueTimer);
    matchScreen?.classList.remove('active');
    menu?.classList.add('active');
  });

  function boot() {
    const saved=localStorage.getItem('bubble_island_user');
    if (saved) {
      try {
        const user=JSON.parse(saved);
        if (user?.name) {
          user.avatar='🐢';
          showMenu(user);
          return;
        }
      } catch (_) {}
    }
    authScreen?.classList.add('active');
    setTimeout(()=>nameInput?.focus(),150);
  }

  boot();
})();