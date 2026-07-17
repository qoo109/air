(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas?.getContext('2d');
  const $ = id => document.getElementById(id);
  if (!canvas || !ctx) return;

  const ui = {
    aiScore: $('ai-score'),
    playerScore: $('player-score'),
    speed: $('speed-label'),
    combo: $('combo-label'),
    bestComboHud: $('best-combo-hud'),
    streakHud: $('win-streak-hud'),
    pauseBtn: $('pause-btn'),
    menu: $('menu'),
    pause: $('pause'),
    gameOver: $('game-over'),
    countdown: $('countdown'),
    countdownText: $('countdown-text'),
    start: $('start-button'),
    resume: $('resume-button'),
    restart: $('restart-button'),
    home: $('home-button'),
    back: $('back-menu-button'),
    difficulty: $('difficulty-select'),
    theme: $('theme-select'),
    sound: $('sound-toggle'),
    vibration: $('vibration-toggle'),
    winner: $('winner-text'),
    finalScore: $('final-score'),
    totalWins: $('best-win'),
    bestStreak: $('best-streak'),
    currentStreak: $('current-streak'),
    bestCombo: $('best-combo')
  };

  const WORLDS = {
    ocean:  { top:'#82d8f4', bot:'#e5fbff', rink:'#ccefe9', rink2:'#8fd7ca', edge:'#3c6175', line:'#fff', player:'#5dc590', ai:'#f4a07e', puck:'#fff4c7', accent:'#ffd05c', kind:'ocean', drag:.99815 },
    desert: { top:'#9edff5', bot:'#ffe3a7', rink:'#ffd99a', rink2:'#efb267', edge:'#725268', line:'#fff6dc', player:'#5fbd83', ai:'#efa177', puck:'#fff2c1', accent:'#a685e4', kind:'desert', drag:.99785 },
    village:{ top:'#a9e5f8', bot:'#effcff', rink:'#dcedb6', rink2:'#99cf79', edge:'#50697a', line:'#fff', player:'#62bd83', ai:'#edaa83', puck:'#fff2c0', accent:'#efa0ca', kind:'village', drag:.99825 },
    night:  { top:'#263b72', bot:'#6b579a', rink:'#566ba2', rink2:'#3f5282', edge:'#e7ecff', line:'#d8efff', player:'#62c79a', ai:'#f19b8d', puck:'#fff0a5', accent:'#ffd55a', kind:'night', drag:.99805 }
  };

  const DIFFICULTY = {
    easy:   { maxSpeed:225, response:.064, predict:.12, error:48, attack:.025, think:.18, serveScale:.94 },
    normal: { maxSpeed:305, response:.094, predict:.34, error:28, attack:.08, think:.12, serveScale:1 },
    hard:   { maxSpeed:395, response:.132, predict:.58, error:14, attack:.165, think:.075, serveScale:1.04 },
    boss:   { maxSpeed:485, response:.17, predict:.80, error:6, attack:.25, think:.045, serveScale:1.08 }
  };

  let world = WORLDS.ocean;
  let aiConfig = DIFFICULTY.normal;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let audioContext = null;
  let playerName = 'YOU';
  let coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  let resumeToken = 0;

  const lowPower = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

  const state = {
    mode:'menu', playerScore:0, aiScore:0, winScore:7,
    combo:0, matchBestCombo:0, comboTimer:0, rally:0, bestRally:0,
    sound:localStorage.getItem('nah_sound') !== 'off',
    vibration:localStorage.getItem('nah_vibration') !== 'off',
    pointerId:null, shake:0, flash:0,
    message:'', messageTimer:0,
    serveLock:0, roundPause:0, nextServeDirection:1,
    stuckTimer:0, controlHintTimer:4,
    wallSoundCooldown:0, starting:false, resumePending:false,
    quality:lowPower ? .58 : 1, slowFrameTimer:0, smoothFrameTimer:0,
    lastHudSpeed:-1, lastHudCombo:-1,
    aiThinkTimer:0, aiTargetX:0, aiTargetY:0
  };

  const pointer = { x:0, y:0, filteredX:0, filteredY:0, down:false };
  const ball = { x:0, y:0, vx:0, vy:0, r:13, trail:[] };
  const player = { x:0, y:0, previousX:0, previousY:0, vx:0, vy:0, r:35, hitCooldown:0 };
  const ai = { x:0, y:0, previousX:0, previousY:0, vx:0, vy:0, r:35, hitCooldown:0, errorSeed:0 };
  const effects = [];

  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

  function arenaBounds() {
    const width = innerWidth;
    const height = innerHeight;
    const left = clamp(width*.04,12,20);
    const top = clamp(height*.105,76,96);
    const bottom = height-clamp(height*.035,18,30);
    const goalWidth = Math.min(width*.40,228);
    return {
      left, right:width-left, top, bottom,
      width:width-left*2, height:bottom-top,
      middle:(top+bottom)/2,
      goalLeft:(width-goalWidth)/2,
      goalRight:(width+goalWidth)/2,
      goalWidth
    };
  }

  function roundedRect(x,y,width,height,radius) {
    radius=Math.min(radius,width/2,height/2);
    ctx.beginPath();
    ctx.moveTo(x+radius,y);
    ctx.arcTo(x+width,y,x+width,y+height,radius);
    ctx.arcTo(x+width,y+height,x,y+height,radius);
    ctx.arcTo(x,y+height,x,y,radius);
    ctx.arcTo(x,y,x+width,y,radius);
    ctx.closePath();
  }

  function vibrate(pattern) {
    if (state.vibration && navigator.vibrate) navigator.vibrate(pattern);
  }

  function ensureAudio() {
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume().catch(()=>{});
    } catch (_) {}
  }

  function beep(type='hit') {
    if (!state.sound) return;
    try {
      ensureAudio();
      if (!audioContext) return;
      const now=audioContext.currentTime;
      const config={
        hit:[470,.05,'sine',.036], wall:[210,.03,'triangle',.017],
        goal:[720,.22,'sine',.055], start:[610,.07,'sine',.03],
        boost:[880,.13,'triangle',.041], win:[1040,.32,'sine',.06],
        reset:[360,.1,'sine',.026], point:[780,.12,'sine',.036]
      }[type] || [470,.05,'sine',.036];
      const oscillator=audioContext.createOscillator();
      const gain=audioContext.createGain();
      oscillator.type=config[2];
      oscillator.frequency.setValueAtTime(config[0],now);
      oscillator.frequency.exponentialRampToValueAtTime(config[0]*.72,now+config[1]);
      gain.gain.setValueAtTime(config[3],now);
      gain.gain.exponentialRampToValueAtTime(.001,now+config[1]);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now+config[1]);
    } catch (_) {}
  }

  function readPlayer() {
    try {
      playerName=String(JSON.parse(localStorage.getItem('bubble_island_user')||'{}').name||'YOU').slice(0,12);
    } catch (_) {
      playerName='YOU';
    }
    window.BubbleRanking?.ensurePlayer(playerName);
  }

  function stats() {
    return window.BubbleRanking?.getStats(playerName) || {wins:0,currentStreak:0,bestStreak:0,bestCombo:0};
  }

  function refreshStats() {
    const record=stats();
    if (ui.totalWins) ui.totalWins.textContent=record.wins||0;
    if (ui.bestStreak) ui.bestStreak.textContent=record.bestStreak||0;
    if (ui.currentStreak) ui.currentStreak.textContent=record.currentStreak||0;
    if (ui.bestCombo) ui.bestCombo.textContent=record.bestCombo||0;
    if (ui.bestComboHud) ui.bestComboHud.textContent=`最佳 x${record.bestCombo||0}`;
    if (ui.streakHud) ui.streakHud.textContent=`連勝 x${record.currentStreak||0}`;
  }

  function updateToggleUI() {
    if (ui.sound) {
      ui.sound.textContent=state.sound?'🔊 音效 ON':'🔇 音效 OFF';
      ui.sound.classList.toggle('active',state.sound);
    }
    if (ui.vibration) {
      ui.vibration.textContent=state.vibration?'📳 震動 ON':'震動 OFF';
      ui.vibration.classList.toggle('active',state.vibration);
    }
    refreshStats();
  }

  function pulse(element,className='score-pop') {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  function placeBall() {
    const bounds=arenaBounds();
    ball.x=innerWidth/2;
    ball.y=bounds.middle;
    ball.vx=0;
    ball.vy=0;
    ball.trail.length=0;
  }

  function setHomePositions(bounds=arenaBounds()) {
    player.x=innerWidth/2;
    player.y=bounds.bottom-player.r-24;
    ai.x=innerWidth/2;
    ai.y=bounds.top+ai.r+24;
    player.previousX=player.x;
    player.previousY=player.y;
    ai.previousX=ai.x;
    ai.previousY=ai.y;
    pointer.x=pointer.filteredX=player.x;
    pointer.y=pointer.filteredY=player.y;
    state.aiTargetX=ai.x;
    state.aiTargetY=ai.y;
  }

  function resize() {
    const dpr=Math.min(devicePixelRatio||1,2);
    const bounds=arenaBounds();
    const minimum=Math.min(innerWidth,innerHeight);
    canvas.width=Math.floor(innerWidth*dpr);
    canvas.height=Math.floor(innerHeight*dpr);
    canvas.style.width=`${innerWidth}px`;
    canvas.style.height=`${innerHeight}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);

    ball.r=clamp(minimum*.027,11,17);
    player.r=ai.r=clamp(minimum*.075,31,46);

    player.x=clamp(player.x||innerWidth/2,bounds.left+player.r,bounds.right-player.r);
    player.y=clamp(player.y||bounds.bottom-player.r-24,bounds.middle+player.r*.56,bounds.bottom-player.r-7);
    ai.x=clamp(ai.x||innerWidth/2,bounds.left+ai.r,bounds.right-ai.r);
    ai.y=clamp(ai.y||bounds.top+ai.r+24,bounds.top+ai.r+7,bounds.middle-ai.r*.56);
    pointer.x=pointer.filteredX=player.x;
    pointer.y=pointer.filteredY=player.y;
    state.aiTargetX=ai.x;
    state.aiTargetY=ai.y;

    if (state.mode!=='playing' && state.mode!=='paused') placeBall();
    draw();
  }

  function ensurePlayableAngle() {
    const speed=Math.hypot(ball.vx,ball.vy);
    if (!speed) return;
    const minVertical=speed*.19;
    if (Math.abs(ball.vy)<minVertical) {
      const direction=ball.vy===0?(Math.random()<.5?-1:1):Math.sign(ball.vy);
      ball.vy=direction*minVertical;
      const horizontal=Math.sqrt(Math.max(0,speed*speed-ball.vy*ball.vy));
      ball.vx=(ball.vx<0?-1:1)*horizontal;
    }
  }

  function serve(direction=1,lock=.38) {
    const bounds=arenaBounds();
    const base=clamp(Math.min(innerWidth,innerHeight)*.70,280,415);
    const speed=base*aiConfig.serveScale;
    const angle=Math.random()*.48-.24;
    ball.x=innerWidth/2;
    ball.y=bounds.middle;
    ball.vx=Math.sin(angle)*speed;
    ball.vy=Math.cos(angle)*speed*direction;
    ball.trail.length=0;
    state.serveLock=lock;
    state.stuckTimer=0;
    state.rally=0;
    state.combo=0;
    state.comboTimer=0;
    state.aiThinkTimer=0;
    updateHud(true);
  }

  function resetGame() {
    state.playerScore=0;
    state.aiScore=0;
    state.combo=0;
    state.matchBestCombo=0;
    state.comboTimer=0;
    state.rally=0;
    state.bestRally=0;
    state.message='';
    state.messageTimer=0;
    state.roundPause=0;
    state.serveLock=0;
    state.controlHintTimer=4;
    state.resumePending=false;
    effects.length=0;
    readPlayer();
    placeBall();
    setHomePositions();
    resize();
    updateHud(true);
    refreshStats();
  }

  function updateHud(force=false) {
    if (ui.aiScore) ui.aiScore.textContent=`AI ${state.aiScore}`;
    if (ui.playerScore) ui.playerScore.textContent=`${playerName} ${state.playerScore}`;
    if (force || state.lastHudCombo!==state.combo) {
      state.lastHudCombo=state.combo;
      if (ui.combo) ui.combo.textContent=`連擊 x${state.combo}${state.combo>0 && state.combo%3===0?' ⚡':''}`;
    }
    const shownSpeed=Math.round(Math.hypot(ball.vx,ball.vy)/7);
    if (force || state.lastHudSpeed!==shownSpeed) {
      state.lastHudSpeed=shownSpeed;
      if (ui.speed) ui.speed.textContent=`${shownSpeed} km/h`;
    }
    refreshStats();
  }

  function movePaddle(object,targetX,targetY,response,maxSpeed,dt) {
    object.previousX=object.x;
    object.previousY=object.y;
    const distanceToTarget=Math.hypot(targetX-object.x,targetY-object.y);
    const dynamicResponse=response*(distanceToTarget>80?1.16:distanceToTarget<8?.72:1);
    const factor=1-Math.pow(1-dynamicResponse,dt*60);
    let dx=(targetX-object.x)*factor;
    let dy=(targetY-object.y)*factor;
    const distance=Math.hypot(dx,dy);
    const maxDistance=maxSpeed*dt;
    if (distance>maxDistance && distance>0) {
      dx*=maxDistance/distance;
      dy*=maxDistance/distance;
    }
    if (Math.abs(dx)<.08) dx=0;
    if (Math.abs(dy)<.08) dy=0;
    object.x+=dx;
    object.y+=dy;
    object.vx=clamp((object.x-object.previousX)/Math.max(dt,.001),-1500,1500);
    object.vy=clamp((object.y-object.previousY)/Math.max(dt,.001),-1500,1500);
  }

  function burst(x,y,color,count=16,forceStars=false) {
    if (reducedMotion) return;
    const adjusted=Math.max(1,Math.ceil(count*state.quality));
    for (let i=0;i<adjusted;i++) {
      const angle=Math.random()*Math.PI*2;
      const speed=45+Math.random()*205;
      effects.push({
        x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
        life:.28+Math.random()*.38,max:.66,size:3+Math.random()*7,
        color,star:forceStars||Math.random()<.13,rotation:Math.random()*6
      });
    }
  }

  function showMessage(text,duration=.75) {
    state.message=text;
    state.messageTimer=duration;
  }

  function normalizeBallSpeed(minimum=270,maximum=1100) {
    const speed=Math.hypot(ball.vx,ball.vy);
    if (!speed) return;
    if (speed<minimum) {
      ball.vx*=minimum/speed;
      ball.vy*=minimum/speed;
    } else if (speed>maximum) {
      ball.vx*=maximum/speed;
      ball.vy*=maximum/speed;
    }
    ensurePlayableAngle();
  }

  function collidePaddle(object,isPlayer) {
    const dx=ball.x-object.x;
    const dy=ball.y-object.y;
    const distance=Math.hypot(dx,dy);
    const minimumDistance=ball.r+object.r*.9;
    if (distance>=minimumDistance || !distance) return;

    const nx=dx/distance;
    const ny=dy/distance;
    const tx=-ny;
    const ty=nx;
    ball.x=object.x+nx*minimumDistance;
    ball.y=object.y+ny*minimumDistance;

    if (object.hitCooldown>0) return;
    const relative=(ball.vx-object.vx)*nx+(ball.vy-object.vy)*ny;
    if (relative>=-14) return;

    const paddleNormalSpeed=object.vx*nx+object.vy*ny;
    const paddleTangentSpeed=object.vx*tx+object.vy*ty;
    const incomingTangent=ball.vx*tx+ball.vy*ty;
    const reflectedNormal=Math.max(235,-relative*1.78+paddleNormalSpeed*.62);
    const mixedTangent=incomingTangent*.84+paddleTangentSpeed*.26;

    ball.vx=nx*reflectedNormal+tx*mixedTangent;
    ball.vy=ny*reflectedNormal+ty*mixedTangent;
    object.hitCooldown=.075;
    state.rally++;
    state.bestRally=Math.max(state.bestRally,state.rally);

    if (isPlayer) {
      state.combo++;
      state.matchBestCombo=Math.max(state.matchBestCombo,state.combo);
      state.comboTimer=4.9;
      window.BubbleRanking?.updateCombo(playerName,state.combo);
      if (state.combo%3===0) {
        ball.vx*=1.05;
        ball.vy*=1.05;
        burst(ball.x,ball.y,world.accent,18,true);
        beep('boost');
        vibrate([11,11,20]);
        pulse(ui.combo,'combo-pulse');
      } else {
        burst(ball.x,ball.y,world.player,10);
        beep('hit');
        vibrate(8);
      }
    } else {
      burst(ball.x,ball.y,world.ai,10);
      beep('hit');
      vibrate(5);
    }

    const rallyAcceleration=Math.min(1.023,1.0048+state.rally*.00082);
    ball.vx*=rallyAcceleration;
    ball.vy*=rallyAcceleration;
    normalizeBallSpeed(275,1100);
    state.shake=reducedMotion?0:Math.min(3.8,2.1+state.rally*.045);
    updateHud();
  }

  function scoreGoal(playerScored) {
    const bounds=arenaBounds();
    if (state.roundPause>0) return;

    if (playerScored) {
      state.playerScore++;
      pulse(ui.playerScore);
      showMessage(state.combo>=3?`連擊 x${state.combo}`:'好球！',.76);
    } else {
      state.aiScore++;
      pulse(ui.aiScore);
      state.combo=0;
      state.comboTimer=0;
      showMessage('守住下一球！',.76);
    }

    burst(innerWidth/2,playerScored?bounds.top+8:bounds.bottom-8,playerScored?world.player:world.ai,34,true);
    state.flash=reducedMotion?0:.13;
    state.shake=reducedMotion?0:5;
    state.rally=0;
    state.roundPause=.88;
    state.nextServeDirection=playerScored?-1:1;
    ball.vx=0;
    ball.vy=0;
    placeBall();
    beep('goal');
    vibrate([18,15,38]);
    updateHud(true);

    if (state.playerScore>=state.winScore || state.aiScore>=state.winScore) {
      state.roundPause=0;
      endGame();
      return;
    }

    if (state.playerScore===state.winScore-1 || state.aiScore===state.winScore-1) {
      setTimeout(()=>{
        if (state.mode==='playing' && state.roundPause>0) {
          showMessage(state.playerScore===state.winScore-1?'你的賽點！':'對手賽點！',.7);
          beep('point');
        }
      },180);
    }
  }

  function thinkAI(bounds) {
    const homeX=innerWidth/2;
    const homeY=bounds.top+ai.r+24;
    let targetX=homeX;
    let targetY=homeY;

    if (ball.vy<0 && state.serveLock<=0 && state.roundPause<=0) {
      const travelTime=(ball.y-homeY)/Math.max(95,Math.abs(ball.vy));
      const periodicError=Math.sin(elapsed*1.55+ai.errorSeed)*aiConfig.error;
      const randomError=(Math.random()-.5)*aiConfig.error*.42;
      targetX=ball.x+ball.vx*travelTime*aiConfig.predict+periodicError+randomError;
      const low=bounds.left+ai.r;
      const high=bounds.right-ai.r;
      let guard=0;
      while ((targetX<low || targetX>high) && guard++<6) {
        targetX=targetX<low?low+(low-targetX):high-(targetX-high);
      }
      targetX=clamp(targetX,low,high);
      targetY=bounds.top+ai.r+bounds.height*(.09+aiConfig.attack);
    } else if (Math.abs(ball.y-bounds.middle)<bounds.height*.14) {
      targetX+=(ball.x-innerWidth/2)*aiConfig.attack*.25;
    }

    state.aiTargetX=targetX;
    state.aiTargetY=clamp(targetY,bounds.top+ai.r+7,bounds.middle-ai.r*.58);
    state.aiThinkTimer=aiConfig.think*(.88+Math.random()*.28);
  }

  function updatePaddles(dt,bounds) {
    const playerHomeX=innerWidth/2;
    const playerHomeY=bounds.bottom-player.r-24;
    const aiHomeX=innerWidth/2;
    const aiHomeY=bounds.top+ai.r+24;

    if (state.roundPause>0) {
      movePaddle(player,playerHomeX,playerHomeY,.12,680,dt);
      movePaddle(ai,aiHomeX,aiHomeY,.12,680,dt);
      return;
    }

    if (pointer.down) {
      const smoothing=1-Math.pow(.28,dt*60);
      pointer.filteredX+=(pointer.x-pointer.filteredX)*smoothing;
      pointer.filteredY+=(pointer.y-pointer.filteredY)*smoothing;
    }
    const fingerLift=coarsePointer?clamp(player.r*1.02,40,58):0;
    const targetX=pointer.down?clamp(pointer.filteredX,bounds.left+player.r,bounds.right-player.r):player.x;
    const targetY=pointer.down
      ?clamp(pointer.filteredY-fingerLift,bounds.middle+player.r*.55,bounds.bottom-player.r-7)
      :player.y;
    movePaddle(player,targetX,targetY,pointer.down?.56:.14,1600,dt);

    state.aiThinkTimer-=dt;
    if (state.aiThinkTimer<=0) thinkAI(bounds);
    movePaddle(ai,state.aiTargetX||aiHomeX,state.aiTargetY||aiHomeY,aiConfig.response,aiConfig.maxSpeed,dt);
  }

  function updateEffects(dt) {
    for (const effect of effects) {
      effect.x+=effect.vx*dt;
      effect.y+=effect.vy*dt;
      effect.vx*=.94;
      effect.vy*=.94;
      if (!effect.star) effect.vy-=12*dt;
      effect.life-=dt;
      effect.rotation+=dt*3;
    }
    for (let i=effects.length-1;i>=0;i--) {
      if (effects[i].life<=0) effects.splice(i,1);
    }
  }

  function wallBounce(axis,positive) {
    if (axis==='x') ball.vx=positive?Math.abs(ball.vx):-Math.abs(ball.vx);
    else ball.vy=positive?Math.abs(ball.vy):-Math.abs(ball.vy);
    if (state.wallSoundCooldown<=0) {
      beep('wall');
      state.wallSoundCooldown=.055;
    }
  }

  function collidePost(px,py) {
    const postRadius=Math.max(6.5,ball.r*.60);
    const dx=ball.x-px;
    const dy=ball.y-py;
    const distance=Math.hypot(dx,dy);
    const minDistance=ball.r+postRadius;
    if (!distance || distance>=minDistance) return;
    const nx=dx/distance;
    const ny=dy/distance;
    ball.x=px+nx*minDistance;
    ball.y=py+ny*minDistance;
    const dot=ball.vx*nx+ball.vy*ny;
    if (dot<0) {
      ball.vx-=1.78*dot*nx;
      ball.vy-=1.78*dot*ny;
      beep('wall');
    }
  }

  function simulateBall(dt,bounds) {
    const speed=Math.hypot(ball.vx,ball.vy);
    const steps=clamp(Math.ceil(speed*dt/Math.max(6,ball.r*.48)),1,10);
    const step=dt/steps;

    for (let i=0;i<steps;i++) {
      ball.x+=ball.vx*step;
      ball.y+=ball.vy*step;

      if (ball.x-ball.r<bounds.left) {
        ball.x=bounds.left+ball.r;
        wallBounce('x',true);
        burst(ball.x,ball.y,world.line,3);
      } else if (ball.x+ball.r>bounds.right) {
        ball.x=bounds.right-ball.r;
        wallBounce('x',false);
        burst(ball.x,ball.y,world.line,3);
      }

      collidePost(bounds.goalLeft,bounds.top);
      collidePost(bounds.goalRight,bounds.top);
      collidePost(bounds.goalLeft,bounds.bottom);
      collidePost(bounds.goalRight,bounds.bottom);

      const inGoal=ball.x>bounds.goalLeft+ball.r*.28 && ball.x<bounds.goalRight-ball.r*.28;
      if (ball.y-ball.r<bounds.top) {
        if (inGoal && ball.y+ball.r<bounds.top-3) {
          scoreGoal(true);
          return;
        }
        if (!inGoal) {
          ball.y=bounds.top+ball.r;
          wallBounce('y',true);
        }
      }
      if (ball.y+ball.r>bounds.bottom) {
        if (inGoal && ball.y-ball.r>bounds.bottom+3) {
          scoreGoal(false);
          return;
        }
        if (!inGoal) {
          ball.y=bounds.bottom-ball.r;
          wallBounce('y',false);
        }
      }

      collidePaddle(ai,false);
      collidePaddle(player,true);
    }

    const drag=Math.pow(world.drag,dt*60);
    ball.vx*=drag;
    ball.vy*=drag;
    normalizeBallSpeed(0,1100);
  }

  function updateQuality(dt) {
    if (lowPower || reducedMotion) return;
    if (dt>.024) {
      state.slowFrameTimer+=dt;
      state.smoothFrameTimer=0;
      if (state.slowFrameTimer>1.4) state.quality=.62;
    } else if (dt<.019) {
      state.smoothFrameTimer+=dt;
      state.slowFrameTimer=Math.max(0,state.slowFrameTimer-dt*2);
      if (state.smoothFrameTimer>3) state.quality=1;
    }
  }

  function update(dt) {
    elapsed+=dt;
    updateQuality(dt);
    const bounds=arenaBounds();

    if (state.comboTimer>0 && (state.comboTimer-=dt)<=0) {
      state.combo=0;
      updateHud(true);
    }
    state.messageTimer=Math.max(0,state.messageTimer-dt);
    state.serveLock=Math.max(0,state.serveLock-dt);
    state.shake=Math.max(0,state.shake-dt*25);
    state.flash=Math.max(0,state.flash-dt);
    state.wallSoundCooldown=Math.max(0,state.wallSoundCooldown-dt);
    state.controlHintTimer=Math.max(0,state.controlHintTimer-dt);
    player.hitCooldown=Math.max(0,player.hitCooldown-dt);
    ai.hitCooldown=Math.max(0,ai.hitCooldown-dt);

    updatePaddles(dt,bounds);

    if (state.roundPause>0) {
      state.roundPause-=dt;
      if (state.roundPause<=0 && state.mode==='playing') {
        serve(state.nextServeDirection,.48);
        showMessage('準備！',.46);
        beep('reset');
      }
      updateEffects(dt);
      updateHud();
      return;
    }

    if (state.serveLock<=0) simulateBall(dt,bounds);

    ball.trail.unshift({x:ball.x,y:ball.y});
    const maxTrail=Math.round((reducedMotion?5:13)*state.quality);
    if (ball.trail.length>maxTrail) ball.trail.length=maxTrail;

    const ballSpeed=Math.hypot(ball.vx,ball.vy);
    const nearRail=ball.x<bounds.left+ball.r*2.2 || ball.x>bounds.right-ball.r*2.2;
    if (state.serveLock<=0 && (ballSpeed<145 || (nearRail && Math.abs(ball.vy)<90))) state.stuckTimer+=dt;
    else state.stuckTimer=Math.max(0,state.stuckTimer-dt*.5);

    if (state.stuckTimer>1.05) {
      if (ballSpeed<1) {
        const direction=Math.random()<.5?-1:1;
        ball.vx=(Math.random()-.5)*160;
        ball.vy=direction*280;
      } else {
        const direction=ball.vy===0?(Math.random()<.5?-1:1):Math.sign(ball.vy);
        ball.vy=direction*Math.max(280,Math.abs(ball.vy));
        normalizeBallSpeed(282,1100);
      }
      state.stuckTimer=0;
      showMessage('重新發力！',.58);
      beep('reset');
    }

    updateEffects(dt);
    updateHud();
  }

  function drawFish(x,y,scale,color,flip=1,alpha=.45) {
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.translate(x,y);
    ctx.scale(flip*scale,scale);
    ctx.fillStyle=color;
    ctx.strokeStyle='rgba(52,73,94,.45)';
    ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(0,0,18,11,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(-16,0);ctx.lineTo(-29,-10);ctx.lineTo(-29,10);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#34495e';ctx.beginPath();ctx.arc(8,-2,2,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawCloud(x,y,scale,alpha=.5) {
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.fillStyle='#fff';
    ctx.beginPath();
    ctx.arc(x,y,18*scale,0,Math.PI*2);
    ctx.arc(x+20*scale,y-9*scale,23*scale,0,Math.PI*2);
    ctx.arc(x+46*scale,y,19*scale,0,Math.PI*2);
    ctx.fill();
    roundedRect(x-17*scale,y,80*scale,25*scale,12*scale);ctx.fill();
    ctx.restore();
  }

  function drawStar(x,y,radius,alpha=.7) {
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.translate(x,y);
    ctx.rotate(elapsed*.15);
    ctx.fillStyle='#fff3a4';
    ctx.beginPath();
    for (let i=0;i<10;i++) {
      const size=i%2?radius:radius*.42;
      const angle=-Math.PI/2+i*Math.PI/5;
      ctx.lineTo(Math.cos(angle)*size,Math.sin(angle)*size);
    }
    ctx.closePath();ctx.fill();ctx.restore();
  }

  function drawCactus(x,y,scale) {
    ctx.save();
    ctx.globalAlpha=.32;
    ctx.strokeStyle='#2d9b68';
    ctx.lineWidth=8*scale;
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(x,y+20*scale);ctx.lineTo(x,y-17*scale);
    ctx.moveTo(x,y-2*scale);ctx.lineTo(x-13*scale,y-10*scale);ctx.lineTo(x-13*scale,y-18*scale);
    ctx.moveTo(x,y+2*scale);ctx.lineTo(x+13*scale,y-7*scale);ctx.lineTo(x+13*scale,y-14*scale);
    ctx.stroke();ctx.restore();
  }

  function drawBackground() {
    const gradient=ctx.createLinearGradient(0,0,0,innerHeight);
    gradient.addColorStop(0,world.top);
    gradient.addColorStop(1,world.bot);
    ctx.fillStyle=gradient;
    ctx.fillRect(0,0,innerWidth,innerHeight);

    const count=Math.max(4,Math.round((reducedMotion?5:9)*state.quality));
    const usableHeight=Math.max(180,innerHeight-150);
    for (let i=0;i<count;i++) {
      const x=(i*97+elapsed*(8+i%3)*((i%2)*2-1)+innerWidth*3)%(innerWidth+100)-50;
      const y=110+(i*83)%usableHeight;
      const scale=.55+(i%4)*.15;
      if (world.kind==='ocean') drawFish(x,y+Math.sin(elapsed+i)*5,scale,['#399bd6','#f5a23a','#4fbe8b'][i%3],i%2?1:-1,.25);
      else if (world.kind==='night') drawStar((i*127)%innerWidth,(i*79)%innerHeight,3+scale*3,.48);
      else if (world.kind==='desert') i%2?drawCloud((i*101)%innerWidth,y,scale*.7,.25):drawCactus((i*111)%innerWidth,y,scale*.7);
      else drawCloud((i*103)%innerWidth,y,scale*.7,.28);
    }
  }

  function drawCenterSpiral(x,y,color) {
    ctx.save();
    ctx.translate(x,y);
    ctx.strokeStyle=color;
    ctx.lineWidth=4;
    ctx.beginPath();
    for (let angle=0;angle<Math.PI*4;angle+=.18) {
      const radius=2+angle*.65;
      const px=Math.cos(angle)*radius;
      const py=Math.sin(angle)*radius;
      if (angle===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawGoal(bounds,top) {
    const y=top?bounds.top:bounds.bottom;
    ctx.fillStyle=top?world.ai:world.player;
    ctx.strokeStyle=world.edge;
    ctx.lineWidth=4;
    roundedRect(bounds.goalLeft,y-10,bounds.goalWidth,20,10);ctx.fill();ctx.stroke();
    ctx.fillStyle='rgba(27,53,68,.25)';
    roundedRect(bounds.goalLeft+10,y-5,bounds.goalWidth-20,10,5);ctx.fill();
  }

  function drawArena() {
    const bounds=arenaBounds();
    ctx.fillStyle='rgba(35,62,78,.2)';
    roundedRect(bounds.left+5,bounds.top+7,bounds.width,bounds.height,34);ctx.fill();

    const gradient=ctx.createLinearGradient(0,bounds.top,0,bounds.bottom);
    gradient.addColorStop(0,world.rink);
    gradient.addColorStop(1,world.rink2);
    ctx.fillStyle=gradient;
    ctx.strokeStyle=world.edge;
    ctx.lineWidth=5;
    roundedRect(bounds.left,bounds.top,bounds.width,bounds.height,34);ctx.fill();ctx.stroke();

    ctx.strokeStyle=world.line;
    ctx.lineWidth=4;
    ctx.setLineDash([12,12]);
    ctx.beginPath();ctx.moveTo(bounds.left+20,bounds.middle);ctx.lineTo(bounds.right-20,bounds.middle);ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle='rgba(255,255,255,.14)';
    ctx.beginPath();ctx.arc(innerWidth/2,bounds.middle,clamp(Math.min(bounds.width,bounds.height)*.12,42,72),0,Math.PI*2);ctx.fill();ctx.stroke();
    drawCenterSpiral(innerWidth/2,bounds.middle,world.accent);
    drawGoal(bounds,true);
    drawGoal(bounds,false);

    [[bounds.goalLeft,bounds.top],[bounds.goalRight,bounds.top],[bounds.goalLeft,bounds.bottom],[bounds.goalRight,bounds.bottom]].forEach((position,index)=>{
      ctx.fillStyle=index<2?world.ai:world.player;
      ctx.strokeStyle=world.edge;
      ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(position[0],position[1],7.5,0,Math.PI*2);ctx.fill();ctx.stroke();
    });
  }

  function drawTrail() {
    ball.trail.forEach((point,index)=>{
      ctx.save();
      ctx.globalAlpha=(ball.trail.length-index)/Math.max(1,ball.trail.length)*.11;
      ctx.strokeStyle=world.puck;
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.arc(point.x,point.y,ball.r*(.24+(ball.trail.length-index)*.018),0,Math.PI*2);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawTurtleShell(object,color) {
    const r=object.r;
    ctx.save();
    ctx.translate(object.x,object.y);
    ctx.fillStyle='rgba(35,62,78,.2)';
    ctx.beginPath();ctx.ellipse(4,7,r*.98,r*.83,0,0,Math.PI*2);ctx.fill();
    const gradient=ctx.createRadialGradient(-r*.25,-r*.32,r*.08,0,0,r);
    gradient.addColorStop(0,'#e5f6af');
    gradient.addColorStop(.42,color);
    gradient.addColorStop(1,'#357e62');
    ctx.fillStyle=gradient;
    ctx.strokeStyle=world.edge;
    ctx.lineWidth=4;
    ctx.beginPath();ctx.ellipse(0,0,r*.96,r*.82,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(52,73,94,.55)';
    ctx.lineWidth=Math.max(2,r*.065);
    ctx.beginPath();
    ctx.moveTo(-r*.52,-r*.38);ctx.lineTo(-r*.2,-r*.06);ctx.lineTo(-r*.37,r*.37);
    ctx.moveTo(r*.52,-r*.38);ctx.lineTo(r*.2,-r*.06);ctx.lineTo(r*.37,r*.37);
    ctx.moveTo(-r*.2,-r*.06);ctx.lineTo(0,-r*.46);ctx.lineTo(r*.2,-r*.06);
    ctx.moveTo(-r*.2,-r*.06);ctx.lineTo(0,r*.39);ctx.lineTo(r*.2,-r*.06);
    ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.38)';
    ctx.beginPath();ctx.ellipse(-r*.3,-r*.37,r*.25,r*.12,-.35,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawSpiralShell(object,color) {
    const r=object.r;
    ctx.save();
    ctx.translate(object.x,object.y);
    ctx.fillStyle='rgba(35,62,78,.2)';
    ctx.beginPath();ctx.ellipse(5,7,r*.96,r*.86,0,0,Math.PI*2);ctx.fill();
    const gradient=ctx.createRadialGradient(-r*.28,-r*.3,r*.06,0,0,r);
    gradient.addColorStop(0,'#fff1c9');
    gradient.addColorStop(.36,'#ffc68e');
    gradient.addColorStop(.72,color);
    gradient.addColorStop(1,'#c96b62');
    ctx.fillStyle=gradient;
    ctx.strokeStyle=world.edge;
    ctx.lineWidth=4;
    ctx.beginPath();ctx.ellipse(0,0,r*.94,r*.84,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(84,70,78,.58)';
    ctx.lineWidth=Math.max(2.5,r*.07);
    ctx.lineCap='round';
    ctx.beginPath();
    for (let angle=0;angle<Math.PI*5.5;angle+=.12) {
      const radius=(r*.06)+(angle/(Math.PI*5.5))*r*.57;
      const px=Math.cos(angle)*radius;
      const py=Math.sin(angle)*radius*.84;
      if (angle===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.42)';
    ctx.beginPath();ctx.ellipse(-r*.31,-r*.38,r*.25,r*.12,-.35,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawPuck() {
    const r=ball.r;
    ctx.save();
    ctx.fillStyle='rgba(35,62,78,.16)';
    ctx.beginPath();ctx.ellipse(ball.x+3,ball.y+5,r*.92,r*.7,0,0,Math.PI*2);ctx.fill();
    const gradient=ctx.createRadialGradient(ball.x-r*.35,ball.y-r*.4,1,ball.x,ball.y,r);
    gradient.addColorStop(0,'#fff');
    gradient.addColorStop(.45,world.puck);
    gradient.addColorStop(1,world.accent);
    ctx.fillStyle=gradient;
    ctx.strokeStyle=world.edge;
    ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(ball.x,ball.y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.75)';
    ctx.beginPath();ctx.arc(ball.x-r*.35,ball.y-r*.38,r*.24,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawEffects() {
    for (const effect of effects) {
      ctx.save();
      ctx.globalAlpha=Math.max(0,effect.life/effect.max);
      ctx.translate(effect.x,effect.y);
      ctx.rotate(effect.rotation);
      if (effect.star) {
        ctx.fillStyle=effect.color;
        ctx.beginPath();
        for (let i=0;i<10;i++) {
          const size=i%2?effect.size*.42:effect.size;
          const angle=-Math.PI/2+i*Math.PI/5;
          ctx.lineTo(Math.cos(angle)*size,Math.sin(angle)*size);
        }
        ctx.closePath();ctx.fill();
      } else {
        ctx.strokeStyle=effect.color;
        ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(0,0,effect.size,0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawMessage() {
    if (!state.messageTimer) return;
    const bounds=arenaBounds();
    const width=Math.min(245,innerWidth*.6);
    ctx.save();
    ctx.translate(innerWidth/2,bounds.middle-10);
    ctx.fillStyle='rgba(255,253,246,.93)';
    ctx.strokeStyle=world.edge;
    ctx.lineWidth=4;
    roundedRect(-width/2,-28,width,56,25);ctx.fill();ctx.stroke();
    ctx.fillStyle=world.edge;
    ctx.font=`900 ${clamp(innerWidth*.052,21,32)}px Trebuchet MS`;
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(state.message,0,1);
    ctx.restore();
  }

  function drawControlHint() {
    if (state.mode!=='playing' || pointer.down || state.controlHintTimer<=0) return;
    const lift=coarsePointer?clamp(player.r*1.02,40,58):0;
    ctx.save();
    ctx.globalAlpha=clamp(state.controlHintTimer/1.2,0,.7);
    ctx.strokeStyle='#fff';
    ctx.lineWidth=3;
    ctx.setLineDash([7,7]);
    ctx.beginPath();ctx.arc(player.x,player.y+lift,player.r*1.2,0,Math.PI*2);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=world.edge;
    ctx.font=`900 ${clamp(innerWidth*.036,14,20)}px Trebuchet MS`;
    ctx.textAlign='center';
    ctx.fillText(coarsePointer?'手指放在龜殼下方拖曳':'拖曳龜殼',player.x,player.y-player.r-18);
    ctx.restore();
  }

  function draw() {
    ctx.save();
    if (state.shake>0) ctx.translate((Math.random()-.5)*state.shake,(Math.random()-.5)*state.shake);
    drawBackground();
    drawArena();
    drawTrail();
    drawEffects();
    drawPuck();
    drawSpiralShell(ai,world.ai);
    drawTurtleShell(player,world.player);
    drawControlHint();
    drawMessage();
    if (state.flash>0) {
      ctx.fillStyle=`rgba(255,255,255,${state.flash*2})`;
      ctx.fillRect(0,0,innerWidth,innerHeight);
    }
    ctx.restore();
  }

  function loop(now) {
    if (state.mode!=='playing') return;
    const dt=Math.min((now-lastTime)/1000||.016,.033);
    lastTime=now;
    update(dt);
    draw();
    frame=requestAnimationFrame(loop);
  }

  async function runCountdown(values,timings) {
    const token=++resumeToken;
    ui.countdown?.classList.add('active');
    for (let index=0;index<values.length;index++) {
      if (token!==resumeToken) return false;
      if (ui.countdownText) ui.countdownText.textContent=values[index];
      beep('start');
      vibrate(values[index]==='GO'?[13,13,20]:8);
      await new Promise(resolve=>setTimeout(resolve,timings[index]));
    }
    if (token!==resumeToken) return false;
    ui.countdown?.classList.remove('active');
    return true;
  }

  async function startGame() {
    if (state.starting || state.mode==='countdown') return;
    state.starting=true;
    ensureAudio();
    cancelAnimationFrame(frame);
    world=WORLDS[ui.theme?.value]||WORLDS.ocean;
    aiConfig=DIFFICULTY[ui.difficulty?.value]||DIFFICULTY.normal;
    ai.errorSeed=Math.random()*10;
    resetGame();
    ui.menu?.classList.remove('active');
    ui.pause?.classList.remove('active');
    ui.gameOver?.classList.remove('active');
    state.mode='countdown';
    draw();
    const completed=await runCountdown(['3','2','1','GO'],[420,420,420,260]);
    if (!completed || state.mode!=='countdown') {
      state.starting=false;
      return;
    }
    state.mode='playing';
    serve(Math.random()<.5?1:-1,.2);
    showMessage('開始！',.4);
    lastTime=performance.now();
    state.starting=false;
    frame=requestAnimationFrame(loop);
  }

  function pauseGame() {
    if (state.mode!=='playing') return;
    cancelAnimationFrame(frame);
    state.mode='paused';
    pointer.down=false;
    state.pointerId=null;
    ui.pause?.classList.add('active');
    vibrate(7);
  }

  async function resumeGame() {
    if (state.mode!=='paused' || state.resumePending) return;
    state.resumePending=true;
    ensureAudio();
    ui.pause?.classList.remove('active');
    state.mode='resume-countdown';
    const completed=await runCountdown(['2','1','GO'],[360,360,240]);
    if (!completed || state.mode!=='resume-countdown') {
      state.resumePending=false;
      return;
    }
    state.mode='playing';
    state.serveLock=Math.max(state.serveLock,.34);
    lastTime=performance.now();
    state.resumePending=false;
    frame=requestAnimationFrame(loop);
  }

  function goHome() {
    cancelAnimationFrame(frame);
    resumeToken++;
    state.mode='menu';
    state.starting=false;
    state.resumePending=false;
    pointer.down=false;
    state.pointerId=null;
    ui.pause?.classList.remove('active');
    ui.gameOver?.classList.remove('active');
    ui.countdown?.classList.remove('active');
    ui.menu?.classList.add('active');
    placeBall();
    setHomePositions();
    refreshStats();
    draw();
  }

  function endGame() {
    cancelAnimationFrame(frame);
    state.mode='gameover';
    const won=state.playerScore>state.aiScore;
    window.BubbleRanking?.recordGame(playerName,won);
    if (ui.winner) ui.winner.textContent=won?'泡泡島冠軍！':'差一點，再來一次！';
    if (ui.finalScore) {
      ui.finalScore.textContent=`最終比分：${playerName} ${state.playerScore}：${state.aiScore} AI｜本場最高連擊 x${state.matchBestCombo}｜最長來回 ${state.bestRally}`;
    }
    if (won) {
      beep('win');
      vibrate([30,22,58]);
    }
    refreshStats();
    window.BubbleRanking?.sync?.();
    ui.gameOver?.classList.add('active');
  }

  function updatePointer(event) {
    const rect=canvas.getBoundingClientRect();
    const samples=event.getCoalescedEvents?.() || [event];
    const sample=samples[samples.length-1] || event;
    pointer.x=sample.clientX-rect.left;
    pointer.y=sample.clientY-rect.top;
    if (!Number.isFinite(pointer.filteredX) || !pointer.down) pointer.filteredX=pointer.x;
    if (!Number.isFinite(pointer.filteredY) || !pointer.down) pointer.filteredY=pointer.y;
  }

  canvas.addEventListener('pointerdown',event=>{
    if (state.mode!=='playing' || state.pointerId!==null) return;
    const bounds=arenaBounds();
    if (event.clientY<bounds.middle-20) return;
    state.pointerId=event.pointerId;
    pointer.down=true;
    state.controlHintTimer=0;
    canvas.setPointerCapture?.(event.pointerId);
    updatePointer(event);
    pointer.filteredX=pointer.x;
    pointer.filteredY=pointer.y;
  },{passive:true});

  canvas.addEventListener('pointermove',event=>{
    if (state.pointerId===event.pointerId) updatePointer(event);
  },{passive:true});

  function releasePointer(event) {
    if (state.pointerId===event.pointerId) {
      state.pointerId=null;
      pointer.down=false;
    }
  }

  canvas.addEventListener('pointerup',releasePointer,{passive:true});
  canvas.addEventListener('pointercancel',releasePointer,{passive:true});
  canvas.addEventListener('lostpointercapture',releasePointer,{passive:true});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());

  ui.start?.addEventListener('click',startGame);
  ui.restart?.addEventListener('click',startGame);
  ui.resume?.addEventListener('click',resumeGame);
  ui.pauseBtn?.addEventListener('click',pauseGame);
  ui.home?.addEventListener('click',goHome);
  ui.back?.addEventListener('click',goHome);

  ui.sound?.addEventListener('click',()=>{
    state.sound=!state.sound;
    localStorage.setItem('nah_sound',state.sound?'on':'off');
    updateToggleUI();
    if (state.sound) beep('start');
  });

  ui.vibration?.addEventListener('click',()=>{
    state.vibration=!state.vibration;
    localStorage.setItem('nah_vibration',state.vibration?'on':'off');
    updateToggleUI();
    vibrate(8);
  });

  ui.theme?.addEventListener('change',()=>{
    world=WORLDS[ui.theme.value]||WORLDS.ocean;
    draw();
  });

  addEventListener('resize',()=>{
    coarsePointer=window.matchMedia?.('(pointer: coarse)')?.matches ?? coarsePointer;
    resize();
  });
  addEventListener('orientationchange',()=>setTimeout(resize,120));
  addEventListener('bubble-player-updated',()=>{readPlayer();updateHud(true);window.BubbleRanking?.sync?.();});
  addEventListener('bubble-ranking-updated',refreshStats);
  addEventListener('keydown',event=>{
    if (event.key==='Escape') {
      if (state.mode==='playing') pauseGame();
      else if (state.mode==='paused') resumeGame();
    }
  });
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden && state.mode==='playing') pauseGame();
  });

  readPlayer();
  updateToggleUI();
  resize();
  draw();
})();