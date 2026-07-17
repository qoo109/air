(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const authScreen=$('auth-screen');
  const menu=$('menu');
  const matchScreen=$('match-screen');
  const guestBtn=$('guest-login-btn');
  const nameInput=$('guest-name-input');
  const logoutBtn=$('logout-btn');
  const authMessage=$('auth-message');
  const playerName=$('player-name');
  const playerAvatar=$('player-avatar');
  const normalizeName=value=>value.replace(/\s+/g,' ').trim();

  function createGuest(name){
    return {id:crypto.randomUUID?.()||`guest-${Date.now()}-${Math.floor(Math.random()*10000)}`,name,avatar:'🐢',provider:'guest'};
  }
  function showMenu(user){
    localStorage.setItem('bubble_island_user',JSON.stringify(user));
    if(playerName) playerName.textContent=user.name||'玩家';
    if(playerAvatar) playerAvatar.textContent='🐢';
    authScreen?.classList.remove('active');
    matchScreen?.classList.remove('active');
    menu?.classList.add('active');
    window.BubbleRanking?.ensurePlayer(user.name);
    window.BubbleRanking?.sync?.();
    dispatchEvent(new CustomEvent('bubble-player-updated',{detail:user}));
  }
  function submitName(){
    const name=normalizeName(nameInput?.value||'');
    if(name.length<2){if(authMessage) authMessage.textContent='名字至少需要 2 個字元喔！';nameInput?.focus();return;}
    if(name.length>12){if(authMessage) authMessage.textContent='名字最多只能有 12 個字元。';nameInput?.focus();return;}
    const previous=localStorage.getItem('bubble_island_user');
    let user=createGuest(name);
    if(previous){try{const old=JSON.parse(previous);if(old?.id) user={...user,id:old.id};}catch(_){}}
    showMenu(user);
  }
  function changeName(){
    window.BubbleMultiplayer?.leave?.('change-name');
    menu?.classList.remove('active');
    matchScreen?.classList.remove('active');
    authScreen?.classList.add('active');
    if(nameInput) nameInput.value='';
    if(authMessage) authMessage.textContent='輸入新名字後再進入泡泡島';
    setTimeout(()=>nameInput?.focus(),50);
  }
  guestBtn?.addEventListener('click',submitName);
  nameInput?.addEventListener('keydown',event=>{if(event.key==='Enter') submitName();});
  logoutBtn?.addEventListener('click',changeName);

  function boot(){
    const saved=localStorage.getItem('bubble_island_user');
    if(saved){try{const user=JSON.parse(saved);if(user?.name){user.id ||= crypto.randomUUID?.()||`guest-${Date.now()}`;user.avatar='🐢';showMenu(user);return;}}catch(_){}}
    authScreen?.classList.add('active');
    setTimeout(()=>nameInput?.focus(),150);
  }
  boot();
})();