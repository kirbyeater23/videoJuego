'use strict';

// ─── CANVAS ──────────────────────────────────────────────────────────────────
const W = 1920, H = 1080;
const GROUND = H - 165;
const START_X = 300;
const EDGE_EXIT = 70;
const HOTSPOT_COORD_W = 1280;
const PLAYER_H = 560;
const WALK_ANIM_FPS = 8;
const WALK_FRAMES = ['madre_walk_1', 'madre_side', 'madre_walk_2', 'madre_side'];

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
canvas.width = W; canvas.height = H;

function resize() {
  const isPortraitMobile = window.matchMedia('(max-width: 720px) and (orientation: portrait)').matches;
  const verticalMargin = Math.max(96, window.innerHeight * 0.16);
  const availableHeight = isPortraitMobile
    ? Math.max(240, window.innerHeight * 0.5)
    : Math.max(240, window.innerHeight - verticalMargin);
  const s = Math.min(window.innerWidth / W, availableHeight / H);
  const canvasW = W * s;
  const canvasH = H * s;
  canvas.style.width  = canvasW + 'px';
  canvas.style.height = canvasH + 'px';
  const canvasLeft = (window.innerWidth - canvasW) / 2;
  const canvasTop = (window.innerHeight - canvasH) / 2;
  document.documentElement.style.setProperty('--game-canvas-left', canvasLeft + 'px');
  document.documentElement.style.setProperty('--game-canvas-right', (canvasLeft + canvasW) + 'px');
  document.documentElement.style.setProperty('--game-canvas-top', canvasTop + 'px');
  document.documentElement.style.setProperty('--game-canvas-bottom', (canvasTop + canvasH) + 'px');
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

function updateCanvasSaturation() {
  const dayStart = 420;
  const dayEnd = 1380;
  const isTitle = currentScene === 0;
  const isFinalScene = scenes[currentScene]?.name?.startsWith('Dormitorio') && gameMin >= 1320;
  if (isTitle) {
    canvas.style.filter = 'saturate(1)';
    return;
  }
  const dayProgress = Math.max(0, Math.min(1, (gameMin - dayStart) / (dayEnd - dayStart)));
  const saturation = isFinalScene ? 0 : Math.max(0, 1 - dayProgress);
  canvas.style.filter = `saturate(${saturation})`;
}

// ─── INPUT ───────────────────────────────────────────────────────────────────
const K = {}, P = {};
const pointer = { x: 0, y: 0, pressed: false, clicked: false };
window.addEventListener('keydown', e => {
  if (e.code !== 'KeyA' && e.code !== 'KeyD') return;
  if (!K[e.code]) P[e.code] = true;
  K[e.code] = true;
  e.preventDefault();
});
window.addEventListener('keyup', e => { delete K[e.code]; });
function clearPressed() { for (const k in P) delete P[k]; }

function setTouchMove(code, active) {
  if (active) {
    if (!K[code]) P[code] = true;
    K[code] = true;
  } else {
    delete K[code];
  }
}

function bindTouchControls() {
  document.querySelectorAll('[data-move-key]').forEach(btn => {
    const code = btn.dataset.moveKey === 'left' ? 'KeyA' : 'KeyD';
    const start = e => {
      e.preventDefault();
      setTouchMove(code, true);
    };
    const stop = e => {
      e.preventDefault();
      setTouchMove(code, false);
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
  });
}

canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * W;
  pointer.y = ((e.clientY - r.top) / r.height) * H;
  pointer.pressed = true;
  pointer.clicked = true;
});

canvas.addEventListener('pointerup', () => { pointer.pressed = false; });
bindTouchControls();

// ─── ASSETS ──────────────────────────────────────────────────────────────────
const IMG = {};
function loadImg(id, src) {
  return new Promise(res => {
    const img = new Image();
    img.onload  = () => { IMG[id] = img; res(); };
    img.onerror = () => { IMG[id] = null; res(); };
    img.src = src;
  });
}

// ─── AUDIO ───────────────────────────────────────────────────────────────────
const SFX = {
  fondo:  new Audio('assets/musica/sonidoFondo.wav'),
  reloj:  new Audio('assets/musica/sonidoReloj.wav'),
  escena: new Audio('assets/musica/salidaEntradaEscena.wav'),
};
SFX.fondo.loop = true;
SFX.reloj.loop = true;

let soundMuted = false;

function playSfx(key) {
  const a = SFX[key];
  a.currentTime = 0;
  a.play().catch(() => {});
}

function stopSfx(key) {
  SFX[key].pause();
  SFX[key].currentTime = 0;
}

window.GameAudio = {
  toggle() {
    soundMuted = !soundMuted;
    for (const a of Object.values(SFX)) a.muted = soundMuted;
    return soundMuted;
  },
  isMuted() { return soundMuted; },
};

// ─── STATE ───────────────────────────────────────────────────────────────────
const SPEED_TBL = [340, 280, 220, 160];
const FADE_SPEED = 3.8;
const LOADING_BLACK_TIME = 0.25;
let gameMin    = 420;
let exhaustion = 0;
let missedTasks     = [];
let completedTasks  = [];
let notif      = null;   // { text, timer }
let currentScene = 0;
let nextScene    = 0;
let nextPlayerX  = START_X;
let fadeAlpha    = 0;
let fadeDir      = 0;    // -1 fade to black, 2 loading, 1 fade from black, 0 done
let loadingTimer = 0;

const player = {
  x: START_X, y: GROUND,
  targetX: null,
  pendingHotspot: null,
  dir: 1, walkT: 0, moving: false,
  get speed() { return SPEED_TBL[exhaustion]; }
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmtTime(m) {
  const h = Math.floor(m / 60);
  const mn = Math.floor(m % 60);
  return String(h).padStart(2,'0') + ':' + String(mn).padStart(2,'0');
}

function sceneTaskLabels(scene) {
  if (!scene || !Array.isArray(scene.hotspots)) return [];
  return scene.hotspots
    .filter(hs => !hs.isExit && !hs.done && !hs.missed)
    .map(hs => hs.label);
}

function syncUI(sceneName) {
  if (!window.GameUI) return;
  const scene = scenes[currentScene];
  window.GameUI.setTitleActive(currentScene === 0);
  window.GameUI.setScene(sceneName);
  window.GameUI.setClock(fmtTime(gameMin));
  window.GameUI.setTasks({
    current: sceneTaskLabels(scene),
    completed: completedTasks.map(t => t.label),
    missed: missedTasks.map(t => t.label),
  });
}

function showNotif(text) {
  notif = { text, timer: 4 };
  if (window.GameUI) window.GameUI.setNotification(text);
}

function gotoScene(idx, startX = START_X) {
  if (fadeDir !== 0) return;
  playSfx('escena');
  nextScene = idx;
  nextPlayerX = startX;
  fadeDir   = -1;
  fadeAlpha = 0;
}

function addMissed(label, scene) {
  if (missedTasks.some(t => t.label === label && t.scene === scene)) return false;
  missedTasks.push({ label, scene });
  return true;
}

function addDone(label, scene) {
  if (completedTasks.some(t => t.label === label && t.scene === scene)) return false;
  completedTasks.push({ label, scene });
  return true;
}

// ─── DRAW BACKGROUNDS ────────────────────────────────────────────────────────
function bgDrawSize(img) {
  return {
    w: img.width,
    h: img.height,
    x: Math.floor((W - img.width) / 2),
    y: Math.floor((H - img.height) / 2),
  };
}

function drawBgImage(key, scrollX) {
  const img = IMG[key];
  if (!img) return false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (key === 'habitacion') {
    const s = Math.max(W / img.width, H / img.height);
    const w = img.width * s;
    const h = img.height * s;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    return true;
  }
  const bg = bgDrawSize(img);
  if (scrollX !== undefined) {
    ctx.drawImage(img, -scrollX, bg.y, bg.w, bg.h);
  } else {
    ctx.drawImage(img, bg.x, bg.y, bg.w, bg.h);
  }
  return true;
}

function drawBgCover(key) {
  const img = IMG[key];
  if (!img) return false;
  const s = Math.max(W / img.width, H / img.height);
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  return true;
}

function drawSleepingRoom(frameKeys, t) {
  const frame = Math.floor(t * 2) % frameKeys.length;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.filter = 'brightness(48%)';
  drawBgCover(frameKeys[frame]);
  ctx.restore();
  return true;
}

function drawImageCentered(key, x, y, maxW, maxH) {
  const img = IMG[key];
  if (!img) return false;
  const s = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
  return true;
}

function drawImageCrop(key, sx, sy, sw, sh, x, y, w, h) {
  const img = IMG[key];
  if (!img) return false;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  return true;
}

function drawSpriteGrounded(key, x, groundY, maxH) {
  const img = IMG[key];
  if (!img) return false;
  const h = maxH;
  const w = img.width * (h / img.height);
  ctx.drawImage(img, x - w / 2, groundY - h, w, h);
  return true;
}

function drawSceneObjects(objects = []) {
  objects.forEach(obj => {
    if (obj.crop) {
      drawImageCrop(obj.key, obj.crop.x, obj.crop.y, obj.crop.w, obj.crop.h, obj.x, obj.y, obj.w, obj.h);
    } else {
      drawImageCentered(obj.key, obj.x, obj.y, obj.w, obj.h);
    }
  });
}

function drawCar(x, y, w, key = 'coche') {
  if (key === 'car_with_children' || key === 'car_solo' || key === 'car_grandma') {
    const h = w * 0.7;
    return drawImageCrop(key, 1432, 548, 3672, 2576, x, y, w, h);
  }
  const h = w * 0.58;
  return drawImageCrop(key, 420, 160, 1080, 760, x, y, w, h);
}

function drawRoomBg(wallCol, floorCol, baseboardCol) {
  ctx.fillStyle = floorCol || '#7a6050';
  ctx.fillRect(0, GROUND - 10, W, H - GROUND + 10);
  ctx.fillStyle = wallCol || '#c8b4a0';
  ctx.fillRect(0, 0, W, GROUND - 10);
  ctx.fillStyle = baseboardCol || '#a08870';
  ctx.fillRect(0, GROUND - 18, W, 10);
}

// ─── PLAYER DRAWING ──────────────────────────────────────────────────────────
function drawPlayer(px, py, dir, wt, exh, moving, maxH = PLAYER_H) {
  const spriteKey = moving
    ? WALK_FRAMES[Math.floor(wt * WALK_ANIM_FPS) % WALK_FRAMES.length]
    : 'madre_side';
  const sprite = IMG[spriteKey] || IMG['madre_side'];
  if (sprite) {
    const h = maxH;
    const w = sprite.width * (h / sprite.height);
    ctx.save();
    ctx.translate(px, py);
    if (dir < 0) ctx.scale(-1, 1);
    ctx.globalAlpha = 1 - Math.min(0.18, exh * 0.04);
    ctx.drawImage(sprite, -w / 2, -h, w, h);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(px, py);
  if (dir < 0) ctx.scale(-1, 1);

  const bob  = moving ? Math.sin(wt * 9) * 3 : 0;
  const leg  = moving ? Math.sin(wt * 9) * 20 : 0;
  const skin = `rgb(${230 - exh * 8},${200 - exh * 8},178)`;
  const cloth = ['#5b7fa6','#7a6fa6','#a67a6f','#6a5a6a'][Math.min(exh, 3)];

  // legs
  ctx.strokeStyle = '#3a2820'; ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-8, -18 + bob); ctx.lineTo(-16 + leg * 0.5, 32 + bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( 8, -18 + bob); ctx.lineTo( 16 - leg * 0.5, 32 + bob); ctx.stroke();

  // body
  ctx.fillStyle = cloth;
  ctx.beginPath(); ctx.ellipse(0, -46 + bob, 22, 30, 0, 0, Math.PI * 2); ctx.fill();

  // arms
  ctx.strokeStyle = skin; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(-18, -64 + bob); ctx.lineTo(-30, -30 + bob + leg * 0.25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( 18, -64 + bob); ctx.lineTo( 30, -30 + bob - leg * 0.25); ctx.stroke();

  // head
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, -88 + bob, 21, 0, Math.PI * 2); ctx.fill();

  // hair
  ctx.fillStyle = '#3a2010';
  ctx.beginPath(); ctx.ellipse(0, -102 + bob, 21, 13, 0, 0, Math.PI); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-17, -96 + bob, 8, 15, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( 17, -96 + bob, 8, 15,-0.3, 0, Math.PI * 2); ctx.fill();

  // eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(-8, -90 + bob, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( 8, -90 + bob, 3.2, 0, Math.PI * 2); ctx.fill();

  // eye bags at high exhaustion
  if (exh >= 2) {
    ctx.strokeStyle = `rgba(120,70,70,${(exh - 1) * 0.45})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(-8, -86 + bob, 4, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.beginPath(); ctx.arc( 8, -86 + bob, 4, 0.2, Math.PI - 0.2); ctx.stroke();
  }

  // mouth
  ctx.strokeStyle = '#5a2010'; ctx.lineWidth = 2.2;
  ctx.beginPath();
  const my = -77 + bob;
  if      (exh === 0) { ctx.arc( 0, my - 3,  6, 0.1, Math.PI - 0.1); }
  else if (exh === 1) { ctx.moveTo(-6, my); ctx.lineTo(6, my); }
  else if (exh === 2) { ctx.arc( 0, my + 5,  8, Math.PI + 0.3, -0.3); }
  else                { ctx.arc( 0, my + 9, 10, Math.PI + 0.5, -0.5); }
  ctx.stroke();

  ctx.restore();
}

function drawGrandma(px, py, dir, wt, moving, maxH = 470) {
  const spriteKey = moving
    ? (Math.floor(wt * WALK_ANIM_FPS) % 2 === 0 ? 'abuela_walk_1' : 'abuela_walk_2')
    : 'abuela_side';
  const sprite = IMG[spriteKey] || IMG['abuela_side'] || IMG['abuela_front'];
  if (!sprite) return;
  const h = maxH;
  const w = sprite.width * (h / sprite.height);
  ctx.save();
  ctx.translate(px, py);
  if (dir < 0) ctx.scale(-1, 1);
  ctx.drawImage(sprite, -w / 2, -h, w, h);
  ctx.restore();
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function drawHUD(sceneName) {
  if (window.GameUI) return;

  // Clock — top right
  if (IMG['clock']) {
    ctx.drawImage(IMG['clock'], W - 185, 8, 178, 58);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(W - 180, 8, 172, 50);
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 26px Inter'; ctx.textAlign = 'right';
  ctx.fillText(fmtTime(gameMin), W - 14, 48);

  // Scene label — top left
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, 320, 40);
  ctx.fillStyle = '#eee'; ctx.font = '15px Inter'; ctx.textAlign = 'left';
  ctx.fillText(sceneName, 10, 26);

  // Exhaustion dots — top center
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(W / 2 - 30 + i * 32, 22, 10, 0, Math.PI * 2);
    ctx.fillStyle = i < exhaustion ? '#c0392b' : 'rgba(255,255,255,0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  }

  // Notification — top center below dots
  if (notif) {
    const a = Math.min(1, notif.timer / 0.6);
    ctx.globalAlpha = a;
    if (IMG['notif']) {
      ctx.drawImage(IMG['notif'], W / 2 - 260, 44, 520, 58);
    } else {
      ctx.fillStyle = '#1abc9c';
      ctx.fillRect(W / 2 - 260, 44, 520, 52);
    }
    ctx.fillStyle = '#fff'; ctx.font = '17px Inter'; ctx.textAlign = 'center';
    ctx.fillText(notif.text, W / 2, 77);
    ctx.globalAlpha = 1;
  }

  // Task tally — bottom right
  if (IMG['tareas']) {
    ctx.drawImage(IMG['tareas'], W - 205, H - 185, 198, 178);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(W - 205, H - 180, 198, 172);
  }
  ctx.fillStyle = '#fff'; ctx.font = '13px Inter'; ctx.textAlign = 'left';
  ctx.fillText('✓ ' + completedTasks.length + ' hechas', W - 198, H - 158);

  // Missed tasks panel — bottom left (grows with misses)
  if (missedTasks.length > 0) {
    const ph = 28 + missedTasks.length * 20;
    ctx.fillStyle = 'rgba(180,30,30,0.88)';
    ctx.fillRect(6, H - ph - 6, 270, ph);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Inter'; ctx.textAlign = 'left';
    ctx.fillText('Pendiente:', 14, H - ph + 14);
    ctx.font = '12px Inter';
    missedTasks.forEach((t, i) => ctx.fillText('• ' + t.label, 14, H - ph + 28 + i * 20));
  }

  // Controls hint — top center
  const hintText = 'A / D para moverte · clic para interactuar';
  ctx.font = '700 18px Inter';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pad = 4;
  const hintW = ctx.measureText(hintText).width + pad * 2;
  const hintH = 30;
  const hintX = W / 2 - hintW / 2;
  const hintY = 72;
  ctx.fillStyle = 'rgba(90,90,90,0.88)';
  ctx.fillRect(hintX, hintY, hintW, hintH);
  ctx.fillStyle = '#e6e6e6';
  ctx.fillText(hintText, W / 2, hintY + hintH / 2);
  ctx.textBaseline = 'alphabetic';
}

// ─── HOTSPOT ─────────────────────────────────────────────────────────────────
class Hotspot {
  constructor({ x, y, label, maxPresses = 1, depends = null, isExit = false, imgKey = null, hitbox = null, hitboxes = null }) {
    this.x = x * (W / HOTSPOT_COORD_W); this.y = y; this.label = label;
    this.maxPresses = maxPresses; this.progress = 0; this.done = false;
    this.depends = depends; this.isExit = isExit;
    this.imgKey = imgKey;
    this.hitbox = hitbox;
    this.hitboxes = hitboxes;
    this.missed = false;
    this.r = 38;
  }
  isNear(px, py) { return Math.abs(px - this.x) < 85 && Math.abs(py - this.y) < 80; }
  isClicked(x, y) {
    if (this.hitboxes) {
      return this.hitboxes.some(box => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
    }
    if (this.hitbox) {
      return x >= this.hitbox.x && x <= this.hitbox.x + this.hitbox.w
        && y >= this.hitbox.y && y <= this.hitbox.y + this.hitbox.h;
    }
    return Math.hypot(x - this.x, y - this.y) <= this.r + 24;
  }
  interact(all) {
    if (this.done) return false;
    if (this.depends) {
      for (const i of this.depends) { if (!all[i].done) return false; }
    }
    this.progress++;
    if (this.progress >= this.maxPresses) this.done = true;
    return true;
  }
}

function drawHotspots(hotspots, px, py) {
  const nearHotspots = [];
  hotspots.forEach(hs => {
    if (hs.done) return;
    if (hs.isExit) return;
    const near = hs.isNear(px, py);
    if (hs.imgKey && !hs.hitbox) {
      drawImageCentered(hs.imgKey, hs.x, hs.y - 62, 120, 120);
    }
    if (near && hs.maxPresses > 1) {
      ctx.fillStyle = '#f1c40f'; ctx.font = '13px Inter'; ctx.textAlign = 'center';
      ctx.fillText(hs.progress + '/' + hs.maxPresses, hs.x, hs.y + hs.r + 18);
    }
    if (near) nearHotspots.push(hs);
  });
  const bubbleW = 280;
  const bubbleH = 76;
  const gap = 14;
  const rowW = nearHotspots.length * bubbleW + Math.max(0, nearHotspots.length - 1) * gap;
  const startX = Math.max(12, Math.min(W - rowW - 12, px - rowW / 2));
  const bubbleY = Math.max(18, py - PLAYER_H - 74);
  const radius = bubbleH / 2;

  nearHotspots.forEach((hs, i) => {
    const bubbleX = startX + i * (bubbleW + gap);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, radius);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '700 1rem Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hs.label, bubbleX + bubbleW / 2, bubbleY + 22);

    ctx.fillStyle = '#f1c40f';
    ctx.font = '600 1rem Inter';
    ctx.fillText('Clic para interactuar', bubbleX + bubbleW / 2, bubbleY + 43);
    if (hs.maxPresses > 1) {
      const remaining = Math.max(1, hs.maxPresses - hs.progress);
      ctx.fillStyle = '#fff';
      ctx.font = '600 1rem Inter';
      ctx.fillText(`${remaining} clics`, bubbleX + bubbleW / 2, bubbleY + 62);
    }
  });
  ctx.textBaseline = 'alphabetic';
}

// ─── COMMON UPDATE LOGIC ─────────────────────────────────────────────────────
function movePlayer(dt, opts = {}) {
  const sp = player.speed;
  player.moving = false;
  const keyboardMoving = K['KeyA'] || K['KeyD'];
  if (keyboardMoving) {
    player.targetX = null;
    player.pendingHotspot = null;
  }

  if (K['KeyA']) {
    player.x -= sp * dt;
    player.dir = -1; player.moving = true;
  }
  if (K['KeyD']) {
    player.x += sp * dt;
    player.dir = 1; player.moving = true;
  }
  if (!keyboardMoving && player.targetX !== null) {
    const dx = player.targetX - player.x;
    if (Math.abs(dx) <= sp * dt) {
      player.x = player.targetX;
      player.targetX = null;
    } else {
      player.x += Math.sign(dx) * sp * dt;
      player.dir = Math.sign(dx);
      player.moving = true;
    }
  }
  const minX = opts.minX ?? 40;
  const maxX = opts.maxX ?? (W - 40);
  if (!opts.allowExit) player.x = Math.max(minX, Math.min(maxX, player.x));
  if (player.moving) player.walkT += dt;
}

function interactHotspots(hotspots, sceneName, onExit, onDone) {
  const clickedHotspot = pointer.clicked
    ? hotspots.find(hs => !hs.done && !hs.isExit && hs.isClicked(pointer.x, pointer.y))
    : null;
  if (clickedHotspot && !clickedHotspot.isNear(player.x, player.y)) {
    player.targetX = Math.max(40, Math.min(W - 40, clickedHotspot.x));
    player.pendingHotspot = clickedHotspot;
    return;
  }
  const activeHotspot = clickedHotspot
    || (player.pendingHotspot && !player.pendingHotspot.done && player.pendingHotspot.isNear(player.x, player.y)
      ? player.pendingHotspot
      : null);
  if (!activeHotspot) return;

  for (const hs of hotspots) {
    if (hs.done) continue;
    const selected = activeHotspot === hs;
    if (!selected) continue;
    if (!selected && !hs.isNear(player.x, player.y)) continue;
    const ok = hs.interact(hotspots);
    if (ok && hs.done) {
      if (!hs.isExit) addDone(hs.label, sceneName);
      if (onDone) onDone(hs);
      if (hs.isExit && onExit) onExit();
    }
    player.pendingHotspot = null;
    break;
  }
}

function fireNotifs(notifs, fired) {
  notifs.forEach((n, i) => {
    if (!fired[i] && gameMin >= n.time) { fired[i] = true; showNotif(n.text); }
  });
}

function missUndone(hotspots = [], sceneName) {
  let any = false;
  hotspots.forEach(hs => {
    if (!hs.done && !hs.isExit && !hs.missed) {
      hs.missed = true;
      if (addMissed(hs.label, sceneName)) any = true;
    }
  });
  if (any) exhaustion = Math.min(3, exhaustion + 1);
  return any;
}

// ─── SCENE FACTORIES ─────────────────────────────────────────────────────────
function tasksDone(hotspots = []) {
  const required = hotspots.filter(hs => !hs.isExit);
  return required.length === 0 || required.every(hs => hs.done);
}

function canLeaveForward(scene) {
  return tasksDone(scene.hotspots) || scene.deadlineFired;
}

function tryLeaveForward(scene) {
  if (scene.requireTasksBeforeExit && !canLeaveForward(scene)) {
    showNotif('Antes de salir tienes que vestirte.');
    player.x = W - EDGE_EXIT;
    player.targetX = null;
    return false;
  }
  const hadPending = missUndone(scene.hotspots, scene.name);
  scene.deadlineFired = true;
  if (hadPending) showNotif('Sales corriendo. Lo pendiente se acumula.');
  advance(scene);
  return true;
}

function goBack(scene) {
  const i = scenes.indexOf(scene);
  if (i <= 0) return false;
  gotoScene(i - 1, W - START_X);
  return true;
}

function makeStaticScene(cfg) {
  // cfg: { name, bgKey, wallCol, floorCol, hotspots[], deadline, notifs[], onEnter }
  const s = {
    name: cfg.name,
    bgKey: cfg.bgKey || null,
    wallCol:  cfg.wallCol  || '#c8b4a0',
    floorCol: cfg.floorCol || '#7a6050',
    hotspots: cfg.hotspots.map(h => new Hotspot(h)),
    deadline: cfg.deadline || null,
    deadlineFired: false,
    requireTasksBeforeExit: !!cfg.requireTasksBeforeExit,
    notifs: cfg.notifs || [],
    notifFired: [],
    entered: false,
    sleeping: !!cfg.sleepFrames,
    sleepT: 0,

    update(dt) {
      if (!this.entered) {
        this.entered = true;
        if (cfg.sleepFrames) playSfx('reloj');
        if (cfg.onEnter) cfg.onEnter(this);
      }
      if (this.sleeping) {
        this.sleepT += dt / (cfg.sleepDuration || 2.4);
        const alarm = this.hotspots[0];
        if (pointer.clicked && alarm && alarm.isClicked(pointer.x, pointer.y)) {
          alarm.done = true;
          addDone(alarm.label, this.name);
          this.sleeping = false;
          if (cfg.sleepFrames) stopSfx('reloj');
          showNotif('Alarma apagada.');
        }
        return;
      }
      movePlayer(dt, { allowExit: true });
      interactHotspots(
        this.hotspots,
        this.name,
        () => tryLeaveForward(this),
        hs => { if (cfg.onHotspotDone) cfg.onHotspotDone(this, hs); }
      );
      fireNotifs(this.notifs, this.notifFired);
      if (player.x < -EDGE_EXIT) {
        goBack(this);
        return;
      }
      if (player.x > W + EDGE_EXIT) {
        tryLeaveForward(this);
        return;
      }

      // Deadline
      if (this.deadline && !this.deadlineFired && gameMin >= this.deadline) {
        this.deadlineFired = true;
        const had = missUndone(this.hotspots, this.name);
        if (had) showNotif('¡Tiempo! No has podido terminar todo.');
        advance(this);
      }
    },

    draw() {
      if (this.sleeping && cfg.sleepFrames) {
        drawSleepingRoom(cfg.sleepFrames, this.sleepT);
      } else {
        if (!drawBgImage(this.bgKey)) drawRoomBg(this.wallCol, this.floorCol);
        drawSceneObjects(cfg.objects);
        drawHotspots(this.hotspots, player.x, player.y);
        drawPlayer(player.x, player.y, player.dir, player.walkT, exhaustion, player.moving);
      }
      drawHUD(this.name);
    }
  };
  return s;
}

function makeScrollScene(cfg) {
  // cfg: { name, bgKey, endX, deadline, deadlineLabel, notifs[], onEnter }
  const s = {
    name: cfg.name,
    bgKey: cfg.bgKey || null,
    endX: cfg.endX || 2000,
    deadline: cfg.deadline || null,
    deadlineLabel: cfg.deadlineLabel || cfg.name,
    deadlineFired: false,
    notifs: cfg.notifs || [],
    notifFired: [],
    entered: false,
    scrollX: 0,
    maxScroll: 0,
    carT: 0,
    carX: START_X,

    update(dt) {
      if (!this.entered) {
        this.entered = true;
        this.scrollX = 0;
        this.carT = 0;
        this.maxScroll = Math.max(0, (IMG[this.bgKey]?.width || W) - W);
        this.carX = START_X;
        player.x = START_X;
        player.targetX = null;
        player.pendingHotspot = null;
        if (cfg.onEnter) cfg.onEnter(this);
      }
      if (cfg.vehicle === 'car') {
        const carSpeed = 520;
        const keyboardMoving = K['KeyA'] || K['KeyD'];
        if (K['KeyA']) {
          if (this.scrollX > 0) this.scrollX = Math.max(0, this.scrollX - carSpeed * dt);
          else this.carX -= carSpeed * dt;
        }
        if (K['KeyD']) {
          if (this.carX < W * 0.52) this.carX = Math.min(W * 0.52, this.carX + carSpeed * dt);
          else if (this.scrollX < this.maxScroll) this.scrollX = Math.min(this.maxScroll, this.scrollX + carSpeed * dt);
          else this.carX += carSpeed * dt;
        }
        this.carX = Math.max(40, Math.min(W + EDGE_EXIT + 20, this.carX));

        if (this.carX < -EDGE_EXIT && this.scrollX <= 0) {
          goBack(this);
          return;
        }
        if (this.maxScroll > 0 && this.scrollX >= this.maxScroll && this.carX > W - 260) {
          tryLeaveForward(this);
          return;
        }

        if (this.deadline && !this.deadlineFired && gameMin >= this.deadline) {
          this.deadlineFired = true;
          if (addMissed(this.deadlineLabel, this.name)) exhaustion = Math.min(3, exhaustion + 1);
          showNotif('¡Llegas tarde!');
          advance(this);
        }
        fireNotifs(this.notifs, this.notifFired);
        return;
      }
      if (this.bgKey === 'colegio') this.carT = Math.min(1, this.carT + dt * 0.55);
      const sp = player.speed;
      player.moving = false;
      const keyboardMoving = K['KeyA'] || K['KeyD'];
      if (keyboardMoving) {
        player.targetX = null;
        player.pendingHotspot = null;
      }
      if (K['KeyA']) {
        if (this.scrollX > 0) this.scrollX = Math.max(0, this.scrollX - sp * dt);
        else player.x -= sp * dt;
        player.dir = -1; player.moving = true;
      }
      if (K['KeyD']) {
        if (player.x < W * 0.58) player.x = Math.min(W * 0.58, player.x + sp * dt);
        else if (this.scrollX < this.maxScroll) this.scrollX = Math.min(this.maxScroll, this.scrollX + sp * dt);
        else player.x += sp * dt;
        player.dir = 1; player.moving = true;
      }
      if (!keyboardMoving && player.targetX !== null) {
        const dx = player.targetX - player.x;
        if (Math.abs(dx) <= sp * dt) {
          player.x = player.targetX;
          player.targetX = null;
        } else {
          const dir = Math.sign(dx);
          if (dir > 0 && player.x >= W * 0.58 && this.scrollX < this.maxScroll) {
            this.scrollX = Math.min(this.maxScroll, this.scrollX + sp * dt);
          } else {
            player.x += dir * sp * dt;
          }
          player.dir = dir;
          player.moving = true;
        }
      }
      if (player.moving) player.walkT += dt;

      if (player.x < -EDGE_EXIT && this.scrollX <= 0) {
        goBack(this);
        return;
      }
      if (player.x > W + EDGE_EXIT || (this.maxScroll > 0 && this.scrollX >= this.maxScroll && player.x > W - 60)) {
        tryLeaveForward(this);
        return;
      }

      if (this.deadline && !this.deadlineFired && gameMin >= this.deadline) {
        this.deadlineFired = true;
        if (addMissed(this.deadlineLabel, this.name)) exhaustion = Math.min(3, exhaustion + 1);
        showNotif('¡Llegas tarde!');
        advance(this);
      }
      fireNotifs(this.notifs, this.notifFired);
    },

    draw() {
      if (!drawBgImage(this.bgKey, this.scrollX)) {
        ctx.fillStyle = '#87CEEB'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#7a8c5a'; ctx.fillRect(0, GROUND - 10, W, H);
      }
      // destination arrow
      const travel = Math.max(1, this.maxScroll);
      const destX = this.maxScroll > 0 ? W - (this.scrollX / travel) * (W * 0.16) : W - 90;
      if (destX < W - 20) {
        ctx.fillStyle = 'rgba(46,204,113,0.7)';
        ctx.fillRect(destX - 18, GROUND - 90, 36, 90);
        ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 22px Inter'; ctx.textAlign = 'center';
        ctx.fillText('★', destX, GROUND - 55);
      }
      // progress bar
      const prog = this.maxScroll > 0 ? Math.min(1, this.scrollX / travel) : Math.min(1, player.x / W);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(W / 2 - 160, H - 22, 320, 12);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(W / 2 - 160, H - 22, 320 * prog, 12);

      if (cfg.vehicle === 'car') {
        drawCar(this.carX, H - 340, 470, cfg.carKey || 'coche');
      } else if (this.bgKey === 'colegio') {
        const carW = 470;
        const carX = W - 470 + (1 - this.carT) * 480;
        drawCar(carX, H - 365, carW, cfg.carKey || 'coche');
      }

      if (cfg.vehicle !== 'car') drawPlayer(player.x, player.y, player.dir, player.walkT, exhaustion, player.moving);
      drawHUD(this.name);
    }
  };
  return s;
}

function makeSchoolDoorScene(cfg) {
  const door = new Hotspot({
    x: 640,
    y: GROUND,
    label: cfg.doorLabel || 'Entrar al colegio',
    hitbox: { x: 845, y: 755, w: 280, h: 250 },
  });

  return {
    name: cfg.name,
    bgKey: cfg.bgBeforeKey || 'colegio',
    deadline: cfg.deadline || null,
    deadlineLabel: cfg.deadlineLabel || cfg.name,
    notifs: cfg.notifs || [],
    notifFired: [],
    entered: false,
    carX: 80,
    carStopX: 650,
    done: false,
    door,

    update(dt) {
      if (!this.entered) {
        this.entered = true;
        this.bgKey = cfg.bgBeforeKey || 'colegio';
        this.carX = 80;
        this.done = false;
        player.x = START_X;
        player.targetX = null;
        player.pendingHotspot = null;
      }

      if (!this.done) {
        const carSpeed = 470;
        if (K['KeyA']) this.carX -= carSpeed * dt;
        if (K['KeyD']) this.carX += carSpeed * dt;
        this.carX = Math.max(40, Math.min(W - 600, this.carX));

        const carAtDoor = Math.abs(this.carX - this.carStopX) < 180;
        if (carAtDoor && pointer.clicked && this.door.isClicked(pointer.x, pointer.y)) {
          this.done = true;
          this.bgKey = cfg.bgAfterKey || 'colegio_puerta';
          addDone(this.door.label, this.name);
          showNotif(cfg.doneText || 'Los niños entran al colegio.');
        }
      } else {
        const carSpeed = 470;
        if (K['KeyA']) this.carX -= carSpeed * dt;
        if (K['KeyD']) this.carX += carSpeed * dt;
        this.carX = Math.max(40, this.carX);
        if (this.carX > W + EDGE_EXIT) advance(this);
      }

      if (this.deadline && !this.done && gameMin >= this.deadline) {
        if (addMissed(this.deadlineLabel, this.name)) exhaustion = Math.min(3, exhaustion + 1);
        showNotif('¡Llegas tarde!');
        advance(this);
      }
      fireNotifs(this.notifs, this.notifFired);
    },

    draw() {
      if (!drawBgImage(this.bgKey)) {
        ctx.fillStyle = '#87CEEB'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#7a8c5a'; ctx.fillRect(0, GROUND - 10, W, H);
      }
      drawCar(this.carX, H - 340, 470, this.done ? (cfg.carAfterKey || 'car_solo') : (cfg.carBeforeKey || 'car_with_children'));
      if (!this.done) {
        if (Math.abs(this.carX - this.carStopX) < 180) drawHotspots([this.door], this.door.x, this.door.y);
      }
      drawHUD(this.name);
    }
  };
}

function makeOfficeScene() {
  const desk = new Hotspot({
    x: 940,
    y: GROUND,
    label: 'Trabajar en el escritorio',
    maxPresses: 1,
    hitbox: { x: 1110, y: 455, w: 680, h: 400 },
  });

  return {
    name: 'Oficina — 09:00',
    bgKey: 'oficina_vacia',
    entered: false,
    deadline: 840,
    deadlineFired: false,
    notifs: [
      { time: 600, text: 'Tu madre llama. No puedes coger el teléfono.' },
      { time: 660, text: 'Mensaje del colegio: "Tus hijos no se encuentran bien."' },
      { time: 720, text: 'Tu madre vuelve a llamar. Tercera vez hoy.' },
      { time: 790, text: 'Jefa: "¿Tienes listo el informe?"' },
      { time: 820, text: 'Son las 13:40. Debes salir en 20 minutos para recoger a los niños.' },
    ],
    notifFired: [],
    hotspots: [desk],
    seatedTimer: 0,
    timelapseActive: false,
    timelapseTimer: 0,
    timelapseDuration: 30,
    timelapseStart: 0,

    update(dt) {
      if (!this.entered) {
        this.entered = true;
        this.bgKey = 'oficina_vacia';
        player.x = W - 260;
        player.targetX = null;
        player.pendingHotspot = null;
        showNotif('Llegas a la oficina.');
      }

      if (this.timelapseActive) {
        this.timelapseTimer += dt;
        const p = Math.min(1, this.timelapseTimer / this.timelapseDuration);
        gameMin = Math.min(this.deadline, this.timelapseStart + (this.deadline - this.timelapseStart) * p);
        fireNotifs(this.notifs, this.notifFired);
        if (p >= 1) {
          this.deadlineFired = true;
          stopSfx('reloj');
          advance(this);
        }
        return;
      } else {
        movePlayer(dt, { minX: W * 0.66, maxX: W - 40 });
        if (pointer.clicked && !desk.done && desk.isClicked(pointer.x, pointer.y) && !desk.isNear(player.x, player.y)) {
          player.targetX = Math.max(W * 0.66, Math.min(W - 40, desk.x));
          player.pendingHotspot = desk;
        }
        const deskReady = !desk.done && (
          (pointer.clicked && desk.isClicked(pointer.x, pointer.y) && desk.isNear(player.x, player.y))
          || (player.pendingHotspot === desk && desk.isNear(player.x, player.y))
        );
        if (deskReady) {
          const ok = desk.interact(this.hotspots);
          if (ok) {
            this.bgKey = 'oficina_sentada';
            this.timelapseActive = true;
            this.timelapseTimer = 0;
            this.timelapseStart = gameMin;
            player.pendingHotspot = null;
            if (desk.done) addDone(desk.label, this.name);
            showNotif('Te sientas a trabajar. Las horas pasan.');
            
          }
        }
      }

      fireNotifs(this.notifs, this.notifFired);

      if (this.deadline && !this.deadlineFired && gameMin >= this.deadline) {
        this.deadlineFired = true;
        if (!desk.done) {
          if (addMissed(desk.label, this.name)) exhaustion = Math.min(3, exhaustion + 1);
        }
        advance(this);
      }
    },

    draw() {
      if (!drawBgImage(this.bgKey)) drawRoomBg('#cfd8dc', '#6a808c');
      if (!this.timelapseActive) {
        drawHotspots(this.hotspots, player.x, player.y);
        drawPlayer(player.x, player.y * 2, player.dir, player.walkT, exhaustion, player.moving, 1500);
      } else {
        
        const p = Math.min(1, this.timelapseTimer / this.timelapseDuration);
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect(W / 2 - 220, H - 60, 440, 16);
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(W / 2 - 220, H - 60, 440 * p, 16);
      }
      drawHUD(this.name);
    }
  };
}

function moveSceneCar(scene, dt, opts = {}) {
  const speed = opts.speed || 520;
  const minX = opts.minX ?? -EDGE_EXIT;
  const maxX = opts.maxX ?? (W + EDGE_EXIT + 260);
  if (K['KeyA']) scene.carX -= speed * dt;
  if (K['KeyD']) scene.carX += speed * dt;
  scene.carX = Math.max(minX, Math.min(maxX, scene.carX));
}

function drawWalkingPair() {
  const grandmaX = player.x - player.dir * 120;
  drawGrandma(grandmaX, player.y, player.dir, player.walkT, player.moving);
  drawPlayer(player.x, player.y, player.dir, player.walkT, exhaustion, player.moving);
}

function makeGrandmaPickupScene() {
  const door = new Hotspot({ x: 690, y: GROUND, label: 'Llamar a la puerta', hitbox: { x: 965, y: 800, w: 150, h: 145 } });
  const grandma = new Hotspot({ x: 840, y: GROUND, label: 'Recoger a mamá', hitbox: { x: 1140, y: 520, w: 210, h: 380 } });
  return {
    name: 'Casa de la abuela — 16:00',
    bgKey: 'casa_abuela',
    entered: false,
    phase: 'door',
    carX: 150,
    update(dt) {
      if (!this.entered) {
        this.entered = true;
        this.phase = 'door';
        this.bgKey = 'casa_abuela';
        this.carX = 150;
        showNotif('Llega a casa de tu madre.');
      }
      if (this.phase === 'drive') {
        moveSceneCar(this, dt, { minX: 40 });
        if (this.carX > W + EDGE_EXIT) advance(this);
        return;
      }
      if (this.phase === 'door') {
        moveSceneCar(this, dt, { minX: 40, maxX: W - 540 });
      }
      const active = this.phase === 'door' ? door : grandma;
      const canUseDoor = this.phase !== 'door' || Math.abs(this.carX - 690) < 260;
      if (canUseDoor && pointer.clicked && active.isClicked(pointer.x, pointer.y)) {
        if (this.phase === 'door') {
          this.phase = 'grandma';
          this.bgKey = 'casa_abuela_con_abuela';
          addDone(active.label, this.name);
          showNotif('Tu madre sale a la puerta.');
        } else {
          this.phase = 'drive';
          this.bgKey = 'casa_abuela';
          this.carX = 130;
          addDone(active.label, this.name);
          showNotif('Subís al coche para ir al hospital.');
        }
      }
    },
    draw() {
      drawBgImage(this.bgKey);
      if (this.phase === 'drive') {
        drawCar(this.carX, H - 340, 470, 'car_grandma');
      } else if (this.phase === 'door') {
        drawCar(this.carX, H - 340, 470, 'car_solo');
        if (Math.abs(this.carX - 690) < 260) drawHotspots([door], door.x, door.y);
      } else {
        drawCar(this.carX, H - 340, 470, 'car_solo');
        drawHotspots([grandma], grandma.x, grandma.y);
      }
      drawHUD(this.name);
    }
  };
}

function makeHospitalArrivalScene() {
  const door = new Hotspot({ x: 780, y: GROUND, label: 'Entrar al hospital', hitbox: { x: 1080, y: 690, w: 210, h: 250 } });
  return {
    name: 'Hospital — 16:30',
    bgKey: 'hospital',
    entered: false,
    carX: 80,
    phase: 'arrive',
    entryTimer: 0,
    update(dt) {
      if (!this.entered) {
        this.entered = true;
        this.phase = 'arrive';
        this.entryTimer = 0;
        this.carX = 80;
        showNotif('Llegáis al hospital.');
      }
      if (this.phase === 'entry') {
        this.entryTimer += dt;
        if (this.entryTimer >= 3) advance(this);
        return;
      }
      moveSceneCar(this, dt, { minX: 40, maxX: W - 540 });
      if (Math.abs(this.carX - 690) < 240 && pointer.clicked && door.isClicked(pointer.x, pointer.y)) {
        this.phase = 'entry';
        this.bgKey = 'hospital_entrada_abuela_madre';
        this.entryTimer = 0;
        addDone(door.label, this.name);
        showNotif('Entráis al hospital.');
      }
    },
    draw() {
      drawBgImage(this.bgKey);
      if (this.phase === 'arrive') {
        drawCar(this.carX, H - 340, 470, 'car_grandma');
        if (Math.abs(this.carX - 690) < 240) drawHotspots([door], door.x, door.y);
      } else {
        const a = Math.max(0, (this.entryTimer - 2) / 1);
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`;
        ctx.fillRect(0, 0, W, H);
      }
      drawHUD(this.name);
    }
  };
}

function makeHospitalInteriorEntryScene() {
  const door = new Hotspot({ x: 760, y: GROUND, label: 'Entrar a consulta', hitbox: { x: 1045, y: 230, w: 210, h: 460 } });
  return {
    name: 'Interior hospital — 16:35',
    bgKey: 'hospital_interior',
    entered: false,
    update(dt) {
      if (!this.entered) {
        this.entered = true;
        player.x = 260;
        player.targetX = null;
        player.pendingHotspot = null;
        showNotif('Acompaña a tu madre hasta la consulta.');
      }
      movePlayer(dt);
      if (!door.done && pointer.clicked && door.isClicked(pointer.x, pointer.y)) {
        door.done = true;
        addDone(door.label, this.name);
        advance(this);
      }
    },
    draw() {
      drawBgImage(this.bgKey);
      if (!door.done) drawHotspots([door], player.x, player.y);
      drawWalkingPair();
      drawHUD(this.name);
    }
  };
}

function makeHospitalConsultScene() {
  return {
    name: 'Consulta — 16:40',
    bgKey: 'hospital_madre_sentada',
    entered: false,
    waitUntil: 1065,
    timelapseTimer: 0,
    timelapseDuration: 9,
    timelapseStart: 0,
    notifs: [
      { time: 1005, text: 'Lleváis media hora esperando.' },
      { time: 1042, text: 'Tu jefa manda un correo urgente. Tus hijos mandan un audio.' },
      { time: 1058, text: 'La extraescolar termina en 7 minutos.' },
    ],
    notifFired: [],
    _lateMissed: false,
    _done: false,
    update(dt) {
      if (!this.entered) {
        this.entered = true;
        this.timelapseTimer = 0;
        this.timelapseStart = gameMin;
        this._done = false;
        showNotif('Ahora toca esperar la consulta.');
       
      }
      if (this._done) return;
      this.timelapseTimer += dt;
      const p = Math.min(1, this.timelapseTimer / this.timelapseDuration);
      gameMin = Math.min(this.waitUntil, this.timelapseStart + (this.waitUntil - this.timelapseStart) * p);
      fireNotifs(this.notifs, this.notifFired);
      if (p >= 1) {
        this._done = true;
        stopSfx('reloj');
        if (!this._lateMissed) {
          this._lateMissed = true;
          if (addMissed('Recoger a los niños de extraescolares', this.name)) exhaustion = Math.min(3, exhaustion + 1);
        }
        advance(this);
      }
    },
    draw() {
      drawBgImage(this.bgKey);
      const p = Math.min(1, this.timelapseTimer / this.timelapseDuration);
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(W / 2 - 230, H - 64, 460, 16);
      ctx.fillStyle = '#3498db';
      ctx.fillRect(W / 2 - 230, H - 64, 460 * p, 16);
      ctx.fillStyle = '#fff';
      ctx.font = '18px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Esperando en consulta...', W / 2, H - 78);
      drawHUD(this.name);
    }
  };
}

function makeHospitalInteriorExitScene() {
  return {
    name: 'Salida del hospital — 17:45',
    bgKey: 'hospital_interior',
    entered: false,
    update(dt) {
      if (!this.entered) {
        this.entered = true;
        player.x = 300;
        player.targetX = null;
        player.pendingHotspot = null;
        showNotif('Salid del hospital.');
      }
      movePlayer(dt, { allowExit: true });
      if (player.x > W + EDGE_EXIT) advance(this);
    },
    draw() {
      drawBgImage(this.bgKey);
      drawWalkingPair();
      drawHUD(this.name);
    }
  };
}

function makeHospitalCarExitScene() {
  return {
    name: 'Parking hospital — 17:50',
    bgKey: 'hospital',
    entered: false,
    carX: 120,
    update(dt) {
      if (!this.entered) {
        this.entered = true;
        this.carX = 120;
        showNotif('Volvéis al coche.');
      }
      moveSceneCar(this, dt, { minX: 40 });
      if (this.carX > W + EDGE_EXIT) advance(this);
    },
    draw() {
      drawBgImage(this.bgKey);
      drawCar(this.carX, H - 340, 470, 'car_grandma');
      drawHUD(this.name);
    }
  };
}

function makeGrandmaDropoffScene() {
  const door = new Hotspot({ x: 690, y: GROUND, label: 'Dejar a mamá en casa', hitbox: { x: 965, y: 800, w: 150, h: 145 } });
  return {
    name: 'Casa de la abuela — 18:05',
    bgKey: 'casa_abuela',
    entered: false,
    carX: 150,
    dropped: false,
    update(dt) {
      if (!this.entered) {
        this.entered = true;
        this.carX = 150;
        this.dropped = false;
        showNotif('Deja a tu madre en casa.');
      }
      moveSceneCar(this, dt, { minX: 40, maxX: this.dropped ? W + EDGE_EXIT + 260 : W - 540 });
      if (!this.dropped && pointer.clicked && door.isClicked(pointer.x, pointer.y)) {
        this.dropped = true;
        addDone(door.label, this.name);
        showNotif('Tu madre ya está en casa. Sigues sola.');
      }
      if (this.dropped && this.carX > W + EDGE_EXIT) advance(this);
    },
    draw() {
      drawBgImage(this.bgKey);
      drawCar(this.carX, H - 340, 470, this.dropped ? 'car_solo' : 'car_grandma');
      if (!this.dropped) drawHotspots([door], door.x, door.y);
      drawHUD(this.name);
    }
  };
}

function advance(scene) {
  const i = scenes.indexOf(scene);
  gotoScene(i + 1);
}

// ─── TITLE SCREEN ────────────────────────────────────────────────────────────
const titleScreen = {
  name: 'título',
  timer: 0,
  update(dt) {
    this.timer += dt;
    if (pointer.clicked) gotoScene(1);
  },
  draw() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    const titleImg = IMG['titulo'];
    const shakeY = Math.sin(this.timer * 18) * 3.2 + Math.sin(this.timer * 31) * 1.1;
    let titleBottom = H * 0.22;
    if (titleImg) {
      const titleW = Math.min(880, W * 0.58);
      const titleH = titleImg.height * (titleW / titleImg.width);
      const titleX = (W - titleW) / 2;
      const titleY = Math.max(24, H * 0.06);
      ctx.drawImage(titleImg, titleX, titleY, titleW, titleH);
      titleBottom = titleY + titleH;
    }

    const carW = Math.min(760, Math.max(560, W * 0.5));
    const carX = (W - carW) / 2;
    const carY = titleBottom + 72 + shakeY;
    drawCar(carX, carY, carW);

    if (Math.floor(this.timer * 2) % 2 === 0) {
      ctx.fillStyle = '#1f1f1f';
      ctx.font = '600 24px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('haz clic para empezar', W / 2, H - 58);
    }

    ctx.fillStyle = 'rgba(31,31,31,0.38)'; ctx.font = '13px Inter'; ctx.textAlign = 'center';
    ctx.fillText('Diseñado por Sandra Martínez y Beatriz Montes · ESD Madrid', W / 2, H - 24);
  }
};

// ─── SUMMARY SCREEN ──────────────────────────────────────────────────────────
const summaryScreen = {
  name: 'fin',
  timer: 0,
  update(dt) {
    this.timer += dt;
    if (pointer.clicked) resetGame();
  },
  draw() {
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#c0392b'; ctx.font = 'bold 52px Inter'; ctx.textAlign = 'center';
    ctx.fillText('Fin del día', W / 2, 75);

    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '18px Inter';
    ctx.fillText('Mañana, todo vuelve a empezar.', W / 2, 115);

    // exhaustion bar
    ctx.fillStyle = '#c0392b'; ctx.font = 'bold 18px Inter';
    ctx.fillText('Agotamiento final: ' + exhaustion + '/3', W / 2, 155);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(W / 2 - 34 + i * 34, 178, 13, 0, Math.PI * 2);
      ctx.fillStyle = i < exhaustion ? '#c0392b' : 'rgba(255,255,255,0.2)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    }

    // completed column
    ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 17px Inter'; ctx.textAlign = 'left';
    ctx.fillText('✓ Completadas (' + completedTasks.length + ')', 40, 218);
    ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.font = '14px Inter';
    completedTasks.slice(0, 14).forEach((t, i) => ctx.fillText('• ' + t.label, 50, 240 + i * 22));

    // missed column
    ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 17px Inter';
    ctx.fillText('✗ Perdidas (' + missedTasks.length + ')', W / 2 + 20, 218);
    ctx.fillStyle = 'rgba(255,190,170,0.85)'; ctx.font = '14px Inter';
    missedTasks.forEach((t, i) => ctx.fillText('• ' + t.label, W / 2 + 30, 240 + i * 22));

    // emotional quote
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = 'italic 17px Inter';
    const quote = exhaustion >= 3
      ? '"El cuidado invisible agota en silencio."'
      : exhaustion >= 2
      ? '"Cuidar de todos deja poco espacio para una misma."'
      : '"Cada día es una maratón sin línea de meta."';
    ctx.fillText(quote, W / 2, H - 64);

    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '17px Inter';
    ctx.fillText('Haz clic para volver al inicio', W / 2, H - 30);
  }
};

// ─── ALL SCENES ───────────────────────────────────────────────────────────────
let scenes = [];

function buildScenes() {
  scenes = [

    // ── E0: Título ────────────────────────────────────────────────────────────
    titleScreen,

    // ── E1: Dormitorio 07:00 → deadline 07:17 ────────────────────────────────
    makeStaticScene({
      name: 'Dormitorio — 07:00',
      bgKey: 'habitacion',
      sleepFrames: ['madre_durmiendo_1', 'madre_durmiendo_2'],
      sleepDuration: 2.6,
      requireTasksBeforeExit: true,
      wallCol: '#c0a898', floorCol: '#6a5040',
      objects: [],
      hotspots: [
        { x: 600, y: GROUND, label: 'Apagar la alarma', hitbox: { x: 835, y: 360, w: 240, h: 155 } },
        { x: 1110, y: GROUND, label: 'Vestirse', maxPresses: 2, hitbox: { x: 1480, y: 145, w: 360, h: 650 } },
      ],
      deadline: 437,
      notifs: [{ time: 421, text: 'La alarma suena. Otro día comienza.' }],
      onEnter() { showNotif('07:00 — Empieza el día.'); }
    }),

    // ── E2: Cocina 07:15 → deadline 08:15 ────────────────────────────────────
    makeStaticScene({
      name: 'Cocina — 07:15',
      bgKey: 'cocina_desayuno_1',
      hotspots: [
        { x: 600, y: GROUND, label: 'Desayunar', maxPresses: 1, hitboxes: [{ x: 575, y: 555, w: 245, h: 250 }, { x: 1010, y: 555, w: 245, h: 250 }] },
        { x: 1140, y: GROUND, label: 'Salir', isExit: true },
      ],
      deadline: 495,
      notifs: [
        { time: 432, text: 'Los niños no quieren comer. "¡Comed algo!"' },
        { time: 460, text: 'Mensaje de tu madre: "¿Cuándo vienes hoy?"' },
        { time: 480, text: 'Tu jefa: "¿Puedes revisar el informe antes de las 9?"' },
      ],
      onHotspotDone(scene, hs) {
        if (!hs.isExit) scene.bgKey = 'cocina_desayuno_2';
      }
    }),

    // ── E3: Camino al colegio scroll 08:15 → deadline 08:30 ──────────────────
    makeSchoolDoorScene({
      name: 'Camino al colegio — 08:15',
      doorLabel: 'Entrar al colegio',
      doneText: 'Los niños entran al colegio.',
      carBeforeKey: 'car_with_children',
      carAfterKey: 'car_solo',
      deadline: 510, deadlineLabel: 'Llegar al colegio a tiempo',
      notifs: [{ time: 500, text: 'Los niños caminan despacio. Llegaréis tarde.' }]
    }),

    // ── E4: Camino al trabajo scroll 08:30 → deadline 09:00 ──────────────────
    makeScrollScene({
      name: 'Camino al trabajo — 08:30',
      bgKey: 'calle', endX: 2200,
      vehicle: 'car',
      carKey: 'car_solo',
      deadline: 540, deadlineLabel: 'Llegar al trabajo a tiempo',
      notifs: [{ time: 518, text: 'El bus sale en 2 minutos.' }]
    }),

    // ── E5: Oficina 09:00 → forzado a las 14:00 ──────────────────────────────
    makeOfficeScene(),

    // ── E6: Recoger a los niños scroll 14:00 → deadline 14:30 ──────────────────
    makeSchoolDoorScene({
      name: 'Recoger a los niños — 14:00',
      doorLabel: 'Recoger a los niños',
      doneText: 'Los niños te esperan en la puerta.',
      carBeforeKey: 'car_solo',
      carAfterKey: 'car_with_children',
      bgBeforeKey: 'colegio_puerta',
      bgAfterKey: 'colegio',
      deadline: 870, deadlineLabel: 'Recoger a los niños a tiempo',
      notifs: [{ time: 848, text: 'Las 14:08. Las otras madres ya se han ido.' }]
    }),

    // ── E7: Cocina comida 14:30 → deadline 15:30 ─────────────────────────────
    makeStaticScene({
      name: 'Cocina — 14:30',
      bgKey: 'cocina_desayuno_1',
      hotspots: [
        { x: 430, y: GROUND, label: 'Preparar la comida', maxPresses: 3, hitbox: { x: 575, y: 555, w: 680, h: 250 } },
        { x: 610, y: GROUND, label: 'Comer con los niños', maxPresses: 1, hitbox: { x: 575, y: 555, w: 680, h: 250 } },
        { x: 980, y: GROUND, label: 'Recoger la cocina', maxPresses: 2, hitbox: { x: 1435, y: 510, w: 235, h: 230 } },
        { x: 1120, y: GROUND, label: 'Buscar pastillas de mamá', maxPresses: 1, hitbox: { x: 1600, y: 90, w: 305, h: 660 } },
        { x: 1160, y: GROUND, label: 'Salir', isExit: true },
      ],
      deadline: 930,
      notifs: [
        { time: 878, text: 'Los niños: "No nos gusta esto."' },
        { time: 908, text: 'Tu madre: "¿Cuándo traes las pastillas?"' },
      ],
      onHotspotDone(scene, hs) {
        if (!hs.isExit) scene.bgKey = 'cocina_comida_2';
      }
    }),



    // ── E9-E16: Casa de la abuela y hospital ─────────────────────────────────
    makeGrandmaPickupScene(),
    makeHospitalArrivalScene(),
    makeHospitalInteriorEntryScene(),
    makeHospitalConsultScene(),
    makeHospitalInteriorExitScene(),
    makeHospitalCarExitScene(),
    makeScrollScene({
      name: 'Camino a casa de la abuela — 17:55',
      bgKey: 'calle', endX: 1200,
      vehicle: 'car',
      carKey: 'car_grandma',
      notifs: [{ time: 1066, text: 'Tus hijos llevan más de una hora esperando solos.' }]
    }),
    makeGrandmaDropoffScene(),

    // ── E17: Extraescolares tarde (auto-fallo) 18:15 ──────────────────────────
    {
      name: 'Extraescolares — 18:15 (tarde)',
      bgKey: 'calle',
      entered: false,
      _t: 0,
      update(dt) {
        if (!this.entered) {
          this.entered = true;
          this._t = 0;
          showNotif('Llegas tarde. Tus hijos llevan esperando mucho tiempo solos.');
          exhaustion = Math.min(3, exhaustion + 1);
        }
        movePlayer(dt);
        this._t += dt;
        if (this._t > 7 || player.x > W - 80) gotoScene(scenes.indexOf(this) + 1);
      },
      draw() {
        const calleMaxScroll = Math.max(0, (IMG['calle']?.width || W) - W);
        if (!drawBgImage('calle', Math.min(calleMaxScroll, this._t * 70))) {
          ctx.fillStyle = '#87CEEB'; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = '#7a8c5a'; ctx.fillRect(0, GROUND - 10, W, H);
        }
        ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 17px Inter'; ctx.textAlign = 'center';
        ctx.fillText('Tus hijos te esperan… llevan mucho tiempo solos.', W / 2, 90);
        drawPlayer(player.x, player.y, player.dir, player.walkT, exhaustion, player.moving);
        drawHUD(this.name);
      }
    },

    // ── E18: Comedor 21:00 ───────────────────────────────────────────────────
    {
      name: 'Comedor — 21:00',
      bgKey: 'cocina_cena_1',
      entered: false,
      hotspots: [
        new Hotspot({ x: 520, y: GROUND, label: 'Cenar', maxPresses: 1 }),
      ],
      update(dt) {
        if (!this.entered) {
          this.entered = true;
          this.bgKey = 'cocina_cena_1';
          player.x = START_X;
          player.targetX = null;
          player.pendingHotspot = null;
          showNotif('Por fin, la cena.');
        }
        movePlayer(dt);
        interactHotspots(this.hotspots, this.name, null, () => {
          this.bgKey = 'cocina_cena_2';
          showNotif('Después de cenar, a dormir.');
          gotoScene(scenes.indexOf(this) + 1);
        });
      },
      draw() {
        if (!drawBgImage(this.bgKey)) drawRoomBg('#2c1a10', '#180e08');
        drawHotspots(this.hotspots, player.x, player.y);
        drawPlayer(player.x, player.y, player.dir, player.walkT, exhaustion, player.moving);
        drawHUD(this.name);
      }
    },
    // ── E17: Dormitorio 23:00 — fundido final ─────────────────────────────────
    {
      name: 'Dormitorio — 23:00',
      entered: false,
      _t: 0,

      update(dt) {
        if (!this.entered) {
          this.entered = true;
          this._t = 0;
          showNotif('Por fin la cama. Mañana, todo empieza de nuevo.');
        }
        movePlayer(dt);
        this._t += dt;
        if (this._t > 7) gotoScene(scenes.indexOf(this) + 1);
      },

      draw() {
        const dark = Math.min(1, this._t / 5);
        if (!drawBgImage('habitacion')) {
          const r = Math.floor(40 - dark * 30), gv = Math.floor(28 - dark * 20), b = Math.floor(55 - dark * 42);
          drawRoomBg(`rgb(${r},${gv},${b})`, '#14101e', '#1a1428');
        }
        ctx.fillStyle = `rgba(0,0,0,${dark * 0.45})`;
        ctx.fillRect(0, 0, W, H);

        if (this._t < 4) {
          drawPlayer(player.x, player.y, player.dir, player.walkT, exhaustion, player.moving);
        }

        if (this._t > 3) {
          const fa = Math.min(1, (this._t - 3) / 2.5);
          ctx.fillStyle = `rgba(0,0,0,${fa})`; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (this._t - 3.5) / 2)})`;
          ctx.font = 'italic 26px Inter'; ctx.textAlign = 'center';
          ctx.fillText('Mañana es otro día.', W / 2, H / 2 - 16);
          ctx.fillStyle = `rgba(200,200,200,${Math.min(1, (this._t - 4.5) / 2)})`;
          ctx.font = '18px Inter';
          ctx.fillText('(Y empieza igual que hoy.)', W / 2, H / 2 + 22);
        }

        drawHUD(this.name);
      }
    },

    // ── Pantalla resumen ──────────────────────────────────────────────────────
    summaryScreen
  ];
}

// ─── RESET ───────────────────────────────────────────────────────────────────
function resetGame() {
  stopSfx('reloj');
  gameMin = 420; exhaustion = 0;
  missedTasks = []; completedTasks = [];
  notif = null;
  player.x = START_X; player.targetX = null; player.pendingHotspot = null; player.dir = 1; player.walkT = 0; player.moving = false;
  nextPlayerX = START_X;
  fadeAlpha = 0; fadeDir = 0; loadingTimer = 0;
  titleScreen.timer = 0;
  summaryScreen.timer = 0;
  buildScenes();
  currentScene = 0;
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
let lastT = 0;

function loop(t) {
  const dt = Math.min((t - lastT) / 1000, 0.12);
  lastT = t;

  // Game clock (not during title or summary)
  if (currentScene > 0 && currentScene < scenes.length - 1) {
    gameMin += dt;  // TIME_RATE = 1 game-min / real-sec
  }

  // Notification countdown
  if (notif) {
    notif.timer -= dt;
    if (notif.timer <= 0) {
      notif = null;
      if (window.GameUI) window.GameUI.clearNotification();
    }
  }

  // Loading transition
  if (fadeDir === -1) {
    fadeAlpha += FADE_SPEED * dt;
    if (fadeAlpha >= 1) {
      fadeAlpha = 1;
      currentScene = nextScene;
      if (currentScene >= 1 && currentScene < scenes.length - 1) {
        if (SFX.fondo.paused) SFX.fondo.play().catch(() => {});
      } else {
        stopSfx('fondo');
      }
      player.x = nextPlayerX; player.targetX = null; player.pendingHotspot = null; player.dir = 1; player.walkT = 0; player.moving = false;
      loadingTimer = LOADING_BLACK_TIME;
      fadeDir = 2;
    }
  } else if (fadeDir === 2) {
    fadeAlpha = 1;
    loadingTimer -= dt;
    if (loadingTimer <= 0) fadeDir = 1;
  } else if (fadeDir === 1) {
    fadeAlpha -= FADE_SPEED * dt;
    if (fadeAlpha <= 0) { fadeAlpha = 0; fadeDir = 0; }
  }

  // Update + draw
  ctx.clearRect(0, 0, W, H);
  updateCanvasSaturation();
  const sc = scenes[currentScene];
  if (sc) {
    syncUI(sc.name);
    if (fadeDir === 0) sc.update(dt);
    sc.draw();
  }

  if (fadeAlpha > 0) {
    ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  clearPressed();
  pointer.clicked = false;
  requestAnimationFrame(loop);
}

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init() {
  await Promise.all([
    loadImg('cocina',            'assets/img/fondos/cocina.png'),
    loadImg('cocina_desayuno_1', 'assets/img/fondos/cocinaDesayuno1.png'),
    loadImg('cocina_desayuno_2', 'assets/img/fondos/cocinaDesayuno2.png'),
    loadImg('cocina_comida_2',   'assets/img/fondos/cocinaComida2.png'),
    loadImg('calle',             'assets/img/fondos/calle.png'),
    loadImg('colegio',           'assets/img/fondos/colegio.png'),
    loadImg('colegio_puerta',    'assets/img/fondos/colegioNinosPuerta.png'),
    loadImg('casa_abuela',       'assets/img/fondos/casa abuela.png'),
    loadImg('casa_abuela_con_abuela', 'assets/img/fondos/casaAbuelaConAbuela.png'),
    loadImg('hospital',          'assets/img/fondos/hospital.png'),
    loadImg('hospital_entrada_abuela_madre', 'assets/img/fondos/hospitalEntradaAbuelaYMadre.png'),
    loadImg('habitacion',        'assets/img/fondos/habitacionDespertadorApagado.png'),
    loadImg('madre_durmiendo_1', 'assets/img/fondos/madreDurmiendoHabitacion1.png'),
    loadImg('madre_durmiendo_2', 'assets/img/fondos/madreDurmiendoHabitacion2.png'),
    loadImg('hospital_interior', 'assets/img/fondos/interior hospital.png'),
    loadImg('hospital_madre_sentada', 'assets/img/fondos/hospitalMadreSentada.png'),
    loadImg('oficina_vacia',     'assets/img/fondos/oficinaVacia.png'),
    loadImg('oficina_sentada',   'assets/img/fondos/oficinaMadreSentada.png'),
    loadImg('madre_side',        'assets/img/personajes/madreLado.png'),
    loadImg('madre_walk_1',      'assets/img/personajes/madreAndando1.png'),
    loadImg('madre_walk_2',      'assets/img/personajes/madreAndando2.png'),
    loadImg('madre_front',       'assets/img/personajes/madreFrente.png'),
    loadImg('madre_back',        'assets/img/personajes/madreEspaldas.png'),
    loadImg('madre_sitting',     'assets/img/personajes/madreSentada.png'),
    loadImg('abuela_side',       'assets/img/personajes/abuelaLado.png'),
    loadImg('abuela_walk_1',     'assets/img/personajes/abuelaAndando1.png'),
    loadImg('abuela_walk_2',     'assets/img/personajes/abuelaAndando2.png'),
    loadImg('abuela_front',      'assets/img/personajes/abuelaFrente.png'),
    loadImg('taza_1',            'assets/img/objetos/tazaDesayuno1.png'),
    loadImg('taza_2',            'assets/img/objetos/tazaDesayuno2.png'),
    loadImg('comida',            'assets/img/objetos/comida.png'),
    loadImg('cena',              'assets/img/objetos/cena.png'),
    loadImg('cocina_cena_1',     'assets/img/fondos/cocinaCena1.png'),
    loadImg('cocina_cena_2',     'assets/img/fondos/cocinaCena2.png'),
    loadImg('coche',             'assets/img/objetos/coche bueno.png'),
    loadImg('car_with_children', 'assets/img/personajes/madreCocheNinos.png'),
    loadImg('car_solo',          'assets/img/personajes/madreCocheSola.png'),
    loadImg('car_grandma',       'assets/img/personajes/mamaConduciendoAbuela.png'),
    loadImg('notif',             'assets/img/objetos/notificacion.png'),
    loadImg('clock',             'assets/img/objetos/relojVacioContador.png'),
    loadImg('tareas',            'assets/img/objetos/tareas.png'),
    loadImg('titulo',            'assets/img/objetos/Titulo.png'),
  ]);

  buildScenes();
  currentScene = 0;
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(loop); });
}

init();
