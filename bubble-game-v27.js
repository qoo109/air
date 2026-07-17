(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas?.getContext('2d');
  const $ = id => document.getElementById(id);
  if (!canvas || !ctx) return;

  const ui = {
    aiScore:$('ai-score'), playerScore:$('player-score'), speed:$('speed-label'), combo:$('combo-label'),
    pauseBtn:$('pause-btn'), menu:$('menu'), pause:$('pause'), gameOver:$('game-over'), countdown:$('countdown'),
    countdownText:$('countdown-text'), start:$('start-button'), resume:$('resume-button'), restart:$('restart-button'),
    home:$('home-button'), back:$('back-menu-button'), difficulty:$('difficulty-select'), theme:$('theme-select'),
    sound:$('sound-toggle'), vibration:$('vibration-toggle'), winner:$('winner-text'), finalScore:$('final-score'),
    bestWin:$('best-win'), bestCombo:$('best-combo')
  };

  const WORLDS = {
    ocean:  {top:'#82d8f4',bot:'#e5fbff',rink:'#ccefe9',rink2:'#8fd7ca',edge:'#3c6175',line:'#fff',player:'#5dc590',ai:'#ff9f8c',puck:'#fff4c7',accent:'#ffd05c',kind:'ocean',drag:.99815},
    desert: {top:'#9edff5',bot:'#ffe3a7',rink:'#ffd99a',rink2:'#efb267',edge:'#725268',line:'#fff6dc',player:'#5fbd83',ai:'#ee967f',puck:'#fff2c1',accent:'#a685e4',kind:'desert',drag:.99785},
    village:{top:'#a9e5f8',bot:'#effcff',rink:'#dcedb6',rink2:'#99cf79',edge:'#50697a',line:'#fff',player:'#62bd83',ai:'#f29b8d',puck:'#fff2c0',accent:'#efa0ca',kind:'village',drag:.99825},
    night:  {top:'#263b72',bot:'#6b579a',rink:'#566ba2',rink2:'#3f5282',edge:'#e7ecff',line:'#d8efff',player:'#62c79a',ai:'#ff91a9',puck:'#fff0a5',accent:'#ffd55a',kind:'night',drag:.99805}
  };

  const DIFFICULTY = {
    easy:   {maxSpeed:245,response:.070,predict:.16,error:38,attack:.05},
    normal: {maxSpeed:335,response:.105,predict:.40,error:20,attack:.12},
    hard:   {maxSpeed:430,response:.145,predict:.66,error:9,attack:.21},
    boss:   {maxSpeed:520,response:.185,predict:.86,error:3,attack:.30}
  };

  let world = WORLDS.ocean;
  let aiConfig = DIFFICULTY.normal;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let audioContext = null;
  let playerName = 'YOU';
  let coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;

  const state = {
    mode:'menu', playerScore:0, aiScore:0, winScore:7,
    combo:0, comboTimer:0, rally:0,
    bestWin:Number(localStorage.getItem('nah_best_win') || 0),
    bestCombo:Number(localStorage.getItem('bubble_best_combo') || 0),
    sound:localStorage.getItem('nah_sound') !== 'off',
    vibration:localStorage.getItem('nah_vibration') !== 'off',
    pointerId:null, shake:0, flash:0,
    message:'', messageTimer:0,
    serveLock:0, roundPause:0, nextServeDirection:1,
    stuckTimer:0, controlHintTimer:4.5,
    wallSoundCooldown:0, starting:false
  };

  const pointer = {x:0,y:0,down:false};
  const ball = {x:0,y:0,vx:0,vy:0,r:13,trail:[]};
  const player = {x:0,y:0,previousX:0,previousY:0,vx:0,vy:0,r:31,hitCooldown:0};
  const ai = {x:0,y:0,previousX:0,previousY:0,vx:0,vy:0,r:31,hitCooldown:0,errorSeed:0};
  const effects = [];

  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

  function arenaBounds() {
    const width=innerWidth, height=innerHeight;
    const left=clamp(width*.04,12,20);
    const top=clamp(height*.105,76,96);
    const bottom=height-clamp(height*.035,18,30);
    const goalWidth=Math.min(width*.44,250);
    return {
      left,right:width-left,top,bottom,
      width:width-left*2,height:bottom-top,
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
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch (_) {}
  }

  function beep(type='hit') {
    if (!state.sound) return;
    try {
      ensureAudio();
      if (!audioContext) return;
      const now=audioContext.currentTime;
      const config={
        hit:[470,.055,'sine',.045], wall:[210,.035,'triangle',.022], goal:[720,.23,'sine',.065],
        start:[610,.075,'sine',.038], boost:[900,.15,'triangle',.052], win:[1040,.34,'sine',.07],
        reset:[360,.11,'sine',.032], record:[1180,.18,'triangle',.055]
      }[type] || [470,.05,'sine',.04];
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

  function readPlayerName() {
    try {
      playerName=String(JSON.parse(localStorage.getItem('bubble_island_user') || '{}').name || 'YOU').slice(0,10);
    } catch (_) {
      playerName='YOU';
    }
  }

  function updateRecords() {
    if (ui.bestWin) ui.bestWin.textContent=state.bestWin;
    if (ui.bestCombo) ui.bestCombo.textContent=state.bestCombo;
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
    updateRecords();
  }

  function saveBestCombo() {
    if (state.combo <= state.bestCombo) return false;
    state.bestCombo=state.combo;
    localStorage.setItem('bubble_best_combo',String(state.bestCombo));
    updateRecords();
    return true;
  }

  function placeBall() {
    const bounds=arenaBounds();
    ball.x=innerWidth/2;
    ball.y=bounds.middle;
    ball.vx=0;
    ball.vy=0;
    ball.trail.length=0;
  }

  function resize() {
    const dpr=Math.min(devicePixelRatio || 1,2);
    const bounds=arenaBounds();
    const minimum=Math.min(innerWidth,innerHeight);
    canvas.width=Math.floor(innerWidth*dpr);
    canvas.height=Math.floor(innerHeight*dpr);
    canvas.style.width=`${innerWidth}px`;
    canvas.style.height=`${innerHeight}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);

    ball.r=clamp(minimum*.027,11,17);
    player.r=ai.r=clamp(minimum*.066,27,39);

    player.x=clamp(player.x || innerWidth/2,bounds.left+player.r,bounds.right-player.r);
    player.y=clamp(player.y || bounds.bottom-player.r-28,bounds.middle+player.r*.56,bounds.bottom-player.r-8);
    ai.x=clamp(ai.x || innerWidth/2,bounds.left+ai.r,bounds.right-ai.r);
    ai.y=clamp(ai.y || bounds.top+ai.r+28,bounds.top+ai.r+8,bounds.middle-ai.r*.56);
    pointer.x=player.x;
    pointer.y=player.y;

    if (state.mode !== 'playing' && state.mode !== 'paused') placeBall();
    draw();
  }

  function serve(direction=1,lock=.38) {
    const bounds=arenaBounds();
    const speed=clamp(Math.min(innerWidth,innerHeight)*.78,310,470);
    const angle=Math.random()*.62-.31;
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
  }

  function resetGame() {
    state.playerScore=0;
    state.aiScore=0;
    state.combo=0;
    state.comboTimer=0;
    state.rally=0;
    state.message='';
    state.messageTimer=0;
    state.roundPause=0;
    state.serveLock=0;
    state.controlHintTimer=4.5;
    effects.length=0;
    readPlayerName();
    placeBall();
    resize();
    updateHud();
    updateRecords();
  }

  function updateHud() {
    if (ui.aiScore) ui.aiScore.textContent=`AI ${state.aiScore}`;
    if (ui.playerScore) ui.playerScore.textContent=`${playerName} ${state.playerScore}`;
    if (ui.combo) {
      if (state.combo >= 3) ui.combo.textContent=`BOOST x${state.combo}`;
      else if (state.rally >= 8) ui.combo.textContent=`RALLY ${state.rally}`;
      else ui.combo.textContent=`COMBO x${state.combo}`;
    }
    if (ui.speed) ui.speed.textContent=`${Math.round(Math.hypot(ball.vx,ball.vy)/7)} km/h`;
  }

  function movePaddle(object,targetX,targetY,response,maxSpeed,dt) {
    object.previousX=object.x;
    object.previousY=object.y;
    const factor=1-Math.pow(1-response,dt*60);
    let dx=(targetX-object.x)*factor;
    let dy=(targetY-object.y)*factor;
    const distance=Math.hypot(dx,dy);
    const maxDistance=maxSpeed*dt;
    if (distance > maxDistance && distance > 0) {
      dx*=maxDistance/distance;
      dy*=maxDistance/distance;
    }
    object.x+=dx;
    object.y+=dy;
    object.vx=clamp((object.x-object.previousX)/Math.max(dt,.001),-1500,1500);
    object.vy=clamp((object.y-object.previousY)/Math.max(dt,.001),-1500,1500);
  }

  function burst(x,y,color,count=16,forceStars=false) {
    for (let i=0;i<count;i++) {
      const angle=Math.random()*Math.PI*2;
      const speed=55+Math.random()*250;
      effects.push({
        x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
        life:.35+Math.random()*.5,max:.85,size:3+Math.random()*8,
        color,star:forceStars || Math.random()<.18,rotation:Math.random()*6
      });
    }
  }

  function showMessage(text,duration=.9) {
    state.message=text;
    state.messageTimer=duration;
  }

  function normalizeBallSpeed(minimum=285,maximum=1260) {
    const speed=Math.hypot(ball.vx,ball.vy);
    if (!speed) return;
    if (speed < minimum) {
      ball.vx*=minimum/speed;
      ball.vy*=minimum/speed;
    } else if (speed > maximum) {
      ball.vx*=maximum/speed;
      ball.vy*=maximum/speed;
    }
  }

  function collidePaddle(object,isPlayer) {
    const dx=ball.x-object.x;
    const dy=ball.y-object.y;
    const distance=Math.hypot(dx,dy);
    const minimumDistance=ball.r+object.r*.84;
    if (distance >= minimumDistance || !distance) return;

    const nx=dx/distance;
    const ny=dy/distance;
    ball.x=object.x+nx*minimumDistance;
    ball.y=object.y+ny*minimumDistance;

    if (object.hitCooldown > 0) return;
    const relative=(ball.vx-object.vx)*nx+(ball.vy-object.vy)*ny;
    if (relative >= -18) return;

    ball.vx-=1.92*relative*nx;
    ball.vy-=1.92*relative*ny;
    ball.vx+=object.vx*.34;
    ball.vy+=object.vy*.34;
    object.hitCooldown=.065;
    state.rally++;

    if (isPlayer) {
      state.combo++;
      state.comboTimer=4.6;
      const isRecord=saveBestCombo();
      if (isRecord && state.combo >= 2) {
        showMessage(`新紀錄 x${state.combo}！`,.8);
        beep('record');
        burst(ball.x,ball.y,world.accent,24,true);
      } else if (state.combo % 3 === 0) {
        ball.vx*=1.09;
        ball.vy*=1.09;
        burst(ball.x,ball.y,world.accent,28,true);
        showMessage('龜殼衝刺！');
        beep('boost');
        vibrate([16,16,30]);
      } else {
        burst(ball.x,ball.y,world.player,15);
        beep('hit');
        vibrate(13);
      }
    } else {
      burst(ball.x,ball.y,world.ai,15);
      beep('hit');
      vibrate(9);
    }

    const rallyAcceleration=Math.min(1.035,1.008+state.rally*.0012);
    ball.vx*=rallyAcceleration;
    ball.vy*=rallyAcceleration;
    normalizeBallSpeed(295,1260);
    state.shake=Math.min(6,3.5+state.rally*.08);
    updateHud();
  }

  function scoreGoal(playerScored) {
    const bounds=arenaBounds();
    if (state.roundPause > 0) return;

    if (playerScored) {
      state.playerScore++;
      showMessage(state.combo >= 3 ? `漂亮連擊 x${state.combo}！` : '好球！',1.0);
    } else {
      state.aiScore++;
      showMessage('守住下一球！',1.0);
    }

    burst(innerWidth/2,playerScored?bounds.top+8:bounds.bottom-8,playerScored?world.player:world.ai,50,true);
    state.flash=.22;
    state.shake=9;
    state.rally=0;
    state.roundPause=1.0;
    state.nextServeDirection=playerScored?1:-1;
    ball.vx=0;
    ball.vy=0;
    placeBall();
    beep('goal');
    vibrate([28,22,60]);
    updateHud();

    if (state.playerScore >= state.winScore || state.aiScore >= state.winScore) {
      state.roundPause=0;
      endGame();
    }
  }

  function updatePaddles(dt,bounds) {
    const fingerLift=coarsePointer?clamp(player.r*1.25,38,58):0;
    const targetX=pointer.down?clamp(pointer.x,bounds.left+player.r,bounds.right-player.r):player.x;
    const targetY=pointer.down
      ?clamp(pointer.y-fingerLift,bounds.middle+player.r*.56,bounds.bottom-player.r-8)
      :player.y;
    movePaddle(player,targetX,targetY,pointer.down?.48:.14,1500,dt);

    let aiTargetX=innerWidth/2;
    let aiTargetY=bounds.top+ai.r+28;
    if (ball.vy < 0 && state.serveLock <= 0 && state.roundPause <= 0) {
      const travelTime=(ball.y-aiTargetY)/Math.max(90,Math.abs(ball.vy));
      const predictionError=Math.sin(elapsed*1.7+ai.errorSeed)*aiConfig.error;
      aiTargetX=ball.x+ball.vx*travelTime*aiConfig.predict+predictionError;
      const low=bounds.left+ai.r;
      const high=bounds.right-ai.r;
      let guard=0;
      while ((aiTargetX<low || aiTargetX>high) && guard++<6) {
        aiTargetX=aiTargetX<low?low+(low-aiTargetX):high-(aiTargetX-high);
      }
      aiTargetX=clamp(aiTargetX,low,high);
      aiTargetY=bounds.top+ai.r+bounds.height*(.11+aiConfig.attack);
    } else if (Math.abs(ball.y-bounds.middle)<bounds.height*.15) {
      aiTargetX+=(ball.x-innerWidth/2)*aiConfig.attack*.35;
    }
    aiTargetY=clamp(aiTargetY,bounds.top+ai.r+8,bounds.middle-ai.r*.58);
    movePaddle(ai,aiTargetX,aiTargetY,aiConfig.response,aiConfig.maxSpeed,dt);
  }

  function updateEffects(dt) {
    for (const effect of effects) {
      effect.x+=effect.vx*dt;
      effect.y+=effect.vy*dt;
      effect.vx*=.94;
      effect.vy*=.94;
      if (!effect.star) effect.vy-=16*dt;
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
      state.wallSoundCooldown=.045;
    }
  }

  function simulateBall(dt,bounds) {
    const speed=Math.hypot(ball.vx,ball.vy);
    const steps=clamp(Math.ceil(speed*dt/Math.max(8,ball.r*.62)),1,6);
    const step=dt/steps;

    for (let i=0;i<steps;i++) {
      ball.x+=ball.vx*step;
      ball.y+=ball.vy*step;

      if (ball.x-ball.r<bounds.left) {
        ball.x=bounds.left+ball.r;
        wallBounce('x',true);
        burst(ball.x,ball.y,world.line,4);
      } else if (ball.x+ball.r>bounds.right) {
        ball.x=bounds.right-ball.r;
        wallBounce('x',false);
        burst(ball.x,ball.y,world.line,4);
      }

      const inGoal=ball.x>bounds.goalLeft+ball.r*.15 && ball.x<bounds.goalRight-ball.r*.15;
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
    normalizeBallSpeed(0,1260);
  }

  function update(dt) {
    elapsed+=dt;
    const bounds=arenaBounds();

    if (state.comboTimer>0 && (state.comboTimer-=dt)<=0) {
      state.combo=0;
      updateHud();
    }
    state.messageTimer=Math.max(0,state.messageTimer-dt);
    state.serveLock=Math.max(0,state.serveLock-dt);
    state.shake=Math.max(0,state.shake-dt*28);
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
        showMessage('準備！',.55);
        beep('reset');
      }
      updateEffects(dt);
      updateHud();
      return;
    }

    if (state.serveLock<=0) simulateBall(dt,bounds);

    ball.trail.unshift({x:ball.x,y:ball.y});
    if (ball.trail.length>16) ball.trail.pop();

    const ballSpeed=Math.hypot(ball.vx,ball.vy);
    if (state.serveLock<=0 && ballSpeed<165) state.stuckTimer+=dt;
    else state.stuckTimer=0;
    if (state.stuckTimer>1.15) {
      if (ballSpeed<1) {
        const direction=Math.random()<.5?-1:1;
        ball.vx=(Math.random()-.5)*180;
        ball.vy=direction*300;
      } else {
        normalizeBallSpeed(300,1260);
      }
      state.stuckTimer=0;
      showMessage('珍珠重新加速！',.75);
      beep('reset');
    }

    updateEffects(dt);
    updateHud();
  }

  function drawFish(xPos,yPos,scale,color,flip=1,alpha=.45) {
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.translate(xPos,yPos);
    ctx.scale(flip*scale,scale);
    ctx.fillStyle=color;
    ctx.strokeStyle='rgba(52,73,94,.45)';
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(0,0,18,11,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-16,0); ctx.lineTo(-29,-10); ctx.lineTo(-29,10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#34495e'; ctx.beginPath(); ctx.arc(8,-2,2,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawCloud(xPos,yPos,scale,alpha=.5) {
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.fillStyle='#fff';
    ctx.beginPath();
    ctx.arc(xPos,yPos,18*scale,0,Math.PI*2);
    ctx.arc(xPos+20*scale,yPos-9*scale,23*scale,0,Math.PI*2);
    ctx.arc(xPos+46*scale,yPos,19*scale,0,Math.PI*2);
    ctx.fill();
    roundedRect(xPos-17*scale,yPos,80*scale,25*scale,12*scale); ctx.fill();
    ctx.restore();
  }

  function drawStar(xPos,yPos,radius,alpha=.7) {
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.translate(xPos,yPos);
    ctx.rotate(elapsed*.15);
    ctx.fillStyle='#fff3a4';
    ctx.beginPath();
    for (let i=0;i<10;i++) {
      const size=i%2?radius:radius*.42;
      const angle=-Math.PI/2+i*Math.PI/5;
      ctx.lineTo(Math.cos(angle)*size,Math.sin(angle)*size);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function drawCactus(xPos,yPos,scale) {
    ctx.save();
    ctx.globalAlpha=.32;
    ctx.strokeStyle='#2d9b68';
    ctx.lineWidth=8*scale;
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(xPos,yPos+20*scale); ctx.lineTo(xPos,yPos-17*scale);
    ctx.moveTo(xPos,yPos-2*scale); ctx.lineTo(xPos-13*scale,yPos-10*scale); ctx.lineTo(xPos-13*scale,yPos-18*scale);
    ctx.moveTo(xPos,yPos+2*scale); ctx.lineTo(xPos+13*scale,yPos-7*scale); ctx.lineTo(xPos+13*scale,yPos-14*scale);
    ctx.stroke(); ctx.restore();
  }

  function drawBackground() {
    const gradient=ctx.createLinearGradient(0,0,0,innerHeight);
    gradient.addColorStop(0,world.top);
    gradient.addColorStop(1,world.bot);
    ctx.fillStyle=gradient;
    ctx.fillRect(0,0,innerWidth,innerHeight);

    const usableHeight=Math.max(180,innerHeight-150);
    for (let i=0;i<10;i++) {
      const xPos=(i*97+elapsed*(8+i%3)*((i%2)*2-1)+innerWidth*3)%(innerWidth+100)-50;
      const yPos=110+(i*83)%usableHeight;
      const scale=.55+(i%4)*.15;
      if (world.kind==='ocean') drawFish(xPos,yPos+Math.sin(elapsed+i)*5,scale,['#399bd6','#f5a23a','#4fbe8b'][i%3],i%2?1:-1,.28);
      else if (world.kind==='night') drawStar((i*127)%innerWidth,(i*79)%innerHeight,3+scale*3,.55);
      else if (world.kind==='desert') i%2?drawCloud((i*101)%innerWidth,yPos,scale*.7,.28):drawCactus((i*111)%innerWidth,yPos,scale*.7);
      else drawCloud((i*103)%innerWidth,yPos,scale*.7,.32);
    }
  }

  function drawCenterShell(xPos,yPos,color,scale=1) {
    ctx.save();
    ctx.translate(xPos,yPos);
    ctx.scale(scale,scale);
    ctx.strokeStyle=color;
    ctx.lineWidth=4;
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.arc(0,2,12,Math.PI,Math.PI*2);
    ctx.moveTo(-10,2); ctx.lineTo(-8,10);
    ctx.moveTo(-4,-8); ctx.lineTo(-3,10);
    ctx.moveTo(4,-8); ctx.lineTo(3,10);
    ctx.moveTo(10,2); ctx.lineTo(8,10);
    ctx.stroke();
    ctx.restore();
  }

  function drawGoal(bounds,top) {
    const y=top?bounds.top:bounds.bottom;
    ctx.fillStyle=top?world.ai:world.player;
    ctx.strokeStyle=world.edge;
    ctx.lineWidth=4;
    roundedRect(bounds.goalLeft,y-10,bounds.goalWidth,20,10); ctx.fill(); ctx.stroke();
    ctx.fillStyle='rgba(27,53,68,.25)';
    roundedRect(bounds.goalLeft+10,y-5,bounds.goalWidth-20,10,5); ctx.fill();
  }

  function drawArena() {
    const bounds=arenaBounds();
    ctx.fillStyle='rgba(35,62,78,.2)';
    roundedRect(bounds.left+5,bounds.top+7,bounds.width,bounds.height,34); ctx.fill();

    const gradient=ctx.createLinearGradient(0,bounds.top,0,bounds.bottom);
    gradient.addColorStop(0,world.rink);
    gradient.addColorStop(1,world.rink2);
    ctx.fillStyle=gradient;
    ctx.strokeStyle=world.edge;
    ctx.lineWidth=5;
    roundedRect(bounds.left,bounds.top,bounds.width,bounds.height,34); ctx.fill(); ctx.stroke();

    ctx.strokeStyle=world.line;
    ctx.lineWidth=4;
    ctx.setLineDash([12,12]);
    ctx.beginPath(); ctx.moveTo(bounds.left+20,bounds.middle); ctx.lineTo(bounds.right-20,bounds.middle); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle='rgba(255,255,255,.14)';
    ctx.beginPath(); ctx.arc(innerWidth/2,bounds.middle,clamp(Math.min(bounds.width,bounds.height)*.12,42,72),0,Math.PI*2); ctx.fill(); ctx.stroke();
    drawCenterShell(innerWidth/2,bounds.middle,world.accent);
    drawGoal(bounds,true);
    drawGoal(bounds,false);

    [[bounds.left+20,bounds.top+25],[bounds.right-20,bounds.top+25],[bounds.left+20,bounds.bottom-25],[bounds.right-20,bounds.bottom-25]].forEach((position,index)=>{
      ctx.fillStyle=index%2?world.accent:world.player;
      ctx.strokeStyle=world.edge;
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(position[0],position[1],6,0,Math.PI*2); ctx.fill(); ctx.stroke();
    });
  }

  function drawTrail() {
    ball.trail.forEach((point,index)=>{
      ctx.save();
      ctx.globalAlpha=(ball.trail.length-index)/ball.trail.length*.14;
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

    ctx.fillStyle='rgba(35,62,78,.20)';
    ctx.beginPath(); ctx.ellipse(4,6,r*.94,r*.78,0,0,Math.PI*2); ctx.fill();

    const gradient=ctx.createRadialGradient(-r*.25,-r*.32,r*.08,0,0,r);
    gradient.addColorStop(0,'#d9f3a8');
    gradient.addColorStop(.42,color);
    gradient.addColorStop(1,'#37876a');
    ctx.fillStyle=gradient;
    ctx.strokeStyle=world.edge;
    ctx.lineWidth=4;
    ctx.beginPath(); ctx.ellipse(0,0,r*.92,r*.78,0,0,Math.PI*2); ctx.fill(); ctx.stroke();

    ctx.strokeStyle='rgba(52,73,94,.55)';
    ctx.lineWidth=Math.max(2,r*.07);
    ctx.beginPath();
    ctx.moveTo(-r*.48,-r*.35); ctx.lineTo(-r*.18,-r*.05); ctx.lineTo(-r*.34,r*.34);
    ctx.moveTo(r*.48,-r*.35); ctx.lineTo(r*.18,-r*.05); ctx.lineTo(r*.34,r*.34);
    ctx.moveTo(-r*.18,-r*.05); ctx.lineTo(0,-r*.42); ctx.lineTo(r*.18,-r*.05);
    ctx.moveTo(-r*.18,-r*.05); ctx.lineTo(0,r*.35); ctx.lineTo(r*.18,-r*.05);
    ctx.stroke();

    ctx.fillStyle='rgba(255,255,255,.38)';
    ctx.beginPath(); ctx.ellipse(-r*.28,-r*.34,r*.24,r*.12,-.35,0,Math.PI*2); ctx.fill();

    ctx.restore();
  }

  function drawScallopShell(object,color) {
    const r=object.r;
    ctx.save();
    ctx.translate(object.x,object.y);

    ctx.fillStyle='rgba(35,62,78,.20)';
    ctx.beginPath(); ctx.ellipse(4,7,r*.92,r*.78,0,0,Math.PI*2); ctx.fill();

    const gradient=ctx.createLinearGradient(0,-r*.8,0,r*.8);
    gradient.addColorStop(0,'#ffd7c9');
    gradient.addColorStop(.48,color);
    gradient.addColorStop(1,'#d86f75');
    ctx.fillStyle=gradient;
    ctx.strokeStyle=world.edge;
    ctx.lineWidth=4;
    ctx.beginPath();
    ctx.moveTo(0,r*.72);
    ctx.bezierCurveTo(-r*.18,r*.6,-r*.78,r*.48,-r*.84,-r*.08);
    ctx.bezierCurveTo(-r*.88,-r*.64,-r*.42,-r*.84,0,-r*.72);
    ctx.bezierCurveTo(r*.42,-r*.84,r*.88,-r*.64,r*.84,-r*.08);
    ctx.bezierCurveTo(r*.78,r*.48,r*.18,r*.6,0,r*.72);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.strokeStyle='rgba(52,73,94,.48)';
    ctx.lineWidth=Math.max(2,r*.065);
    for (let i=-3;i<=3;i++) {
      ctx.beginPath();
      ctx.moveTo(0,r*.62);
      ctx.quadraticCurveTo(i*r*.14,-r*.02,i*r*.24,-r*.61);
      ctx.stroke();
    }

    ctx.fillStyle='rgba(255,255,255,.40)';
    ctx.beginPath(); ctx.ellipse(-r*.22,-r*.4,r*.24,r*.11,-.4,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawPuck() {
    const r=ball.r;
    const gradient=ctx.createRadialGradient(ball.x-r*.35,ball.y-r*.4,1,ball.x,ball.y,r);
    gradient.addColorStop(0,'#fff');
    gradient.addColorStop(.45,world.puck);
    gradient.addColorStop(1,world.accent);
    ctx.fillStyle=gradient;
    ctx.strokeStyle=world.edge;
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(ball.x,ball.y,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.arc(ball.x-r*.35,ball.y-r*.38,r*.24,0,Math.PI*2); ctx.fill();
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
        ctx.closePath(); ctx.fill();
      } else {
        ctx.strokeStyle=effect.color;
        ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(0,0,effect.size,0,Math.PI*2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawMessage() {
    if (!state.messageTimer) return;
    const bounds=arenaBounds();
    const width=Math.min(270,innerWidth*.66);
    ctx.save();
    ctx.translate(innerWidth/2,bounds.middle-10);
    ctx.fillStyle='rgba(255,253,246,.94)';
    ctx.strokeStyle=world.edge;
    ctx.lineWidth=4;
    roundedRect(-width/2,-32,width,64,28); ctx.fill(); ctx.stroke();
    ctx.fillStyle=world.edge;
    ctx.font=`900 ${clamp(innerWidth*.06,24,38)}px Trebuchet MS`;
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(state.message,0,1);
    ctx.restore();
  }

  function drawControlHint() {
    if (state.mode!=='playing' || pointer.down || state.controlHintTimer<=0) return;
    const lift=coarsePointer?clamp(player.r*1.25,38,58):0;
    ctx.save();
    ctx.globalAlpha=clamp(state.controlHintTimer/1.2,0,.72);
    ctx.strokeStyle='#fff';
    ctx.lineWidth=3;
    ctx.setLineDash([7,7]);
    ctx.beginPath(); ctx.arc(player.x,player.y+lift,player.r*1.25,0,Math.PI*2); ctx.stroke();
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
    drawScallopShell(ai,world.ai);
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
    const dt=Math.min((now-lastTime)/1000 || .016,.033);
    lastTime=now;
    update(dt);
    draw();
    frame=requestAnimationFrame(loop);
  }

  async function countdown() {
    ui.countdown?.classList.add('active');
    for (const value of ['3','2','1','GO']) {
      if (state.mode!=='countdown') return;
      if (ui.countdownText) ui.countdownText.textContent=value;
      beep('start');
      vibrate(value==='GO'?[18,18,28]:12);
      await new Promise(resolve=>setTimeout(resolve,value==='GO'?300:460));
    }
    ui.countdown?.classList.remove('active');
  }

  async function startGame() {
    if (state.starting || state.mode==='countdown') return;
    state.starting=true;
    ensureAudio();
    cancelAnimationFrame(frame);
    world=WORLDS[ui.theme?.value] || WORLDS.ocean;
    aiConfig=DIFFICULTY[ui.difficulty?.value] || DIFFICULTY.normal;
    ai.errorSeed=Math.random()*10;
    resetGame();
    ui.menu?.classList.remove('active');
    ui.pause?.classList.remove('active');
    ui.gameOver?.classList.remove('active');
    state.mode='countdown';
    draw();
    await countdown();
    if (state.mode!=='countdown') {
      state.starting=false;
      return;
    }
    state.mode='playing';
    serve(Math.random()<.5?1:-1,.18);
    showMessage('開始！',.5);
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
    vibrate(10);
  }

  function resumeGame() {
    if (state.mode!=='paused') return;
    ensureAudio();
    ui.pause?.classList.remove('active');
    state.mode='playing';
    showMessage('繼續！',.5);
    state.serveLock=Math.max(state.serveLock,.28);
    lastTime=performance.now();
    frame=requestAnimationFrame(loop);
  }

  function goHome() {
    cancelAnimationFrame(frame);
    state.mode='menu';
    state.starting=false;
    pointer.down=false;
    state.pointerId=null;
    ui.pause?.classList.remove('active');
    ui.gameOver?.classList.remove('active');
    ui.countdown?.classList.remove('active');
    ui.menu?.classList.add('active');
    placeBall();
    draw();
  }

  function endGame() {
    cancelAnimationFrame(frame);
    state.mode='gameover';
    const won=state.playerScore>state.aiScore;
    if (ui.winner) ui.winner.textContent=won?'泡泡島冠軍！':'差一點，再來一次！';
    if (ui.finalScore) ui.finalScore.textContent=`最終比分：${playerName} ${state.playerScore}：${state.aiScore} AI｜最高連擊 x${state.bestCombo}`;
    if (won) {
      state.bestWin++;
      localStorage.setItem('nah_best_win',String(state.bestWin));
      updateRecords();
      beep('win');
      vibrate([40,30,80]);
    }
    ui.gameOver?.classList.add('active');
  }

  function updatePointer(event) {
    const rect=canvas.getBoundingClientRect();
    pointer.x=event.clientX-rect.left;
    pointer.y=event.clientY-rect.top;
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
  });
  canvas.addEventListener('pointermove',event=>{
    if (state.pointerId===event.pointerId) updatePointer(event);
  });
  function releasePointer(event) {
    if (state.pointerId===event.pointerId) {
      state.pointerId=null;
      pointer.down=false;
    }
  }
  canvas.addEventListener('pointerup',releasePointer);
  canvas.addEventListener('pointercancel',releasePointer);
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
    vibrate(12);
  });
  ui.theme?.addEventListener('change',()=>{
    world=WORLDS[ui.theme.value] || WORLDS.ocean;
    draw();
  });

  addEventListener('resize',()=>{
    coarsePointer=window.matchMedia?.('(pointer: coarse)')?.matches ?? coarsePointer;
    resize();
  });
  addEventListener('orientationchange',()=>setTimeout(resize,120));
  addEventListener('bubble-player-updated',()=>{readPlayerName();updateHud();});
  addEventListener('keydown',event=>{
    if (event.key==='Escape') {
      if (state.mode==='playing') pauseGame();
      else if (state.mode==='paused') resumeGame();
    }
  });
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden && state.mode==='playing') pauseGame();
  });

  readPlayerName();
  updateToggleUI();
  resize();
  draw();
})();