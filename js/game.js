// Delivery in Five Minutes — stage 1: a pizza courier who walks and jumps.

const VIEW_W = 320;
const VIEW_H = 180;
const WORLD_W = 1280;
const GROUND_Y = 152;
const STEP = 1 / 60;

// Movement tuning, in pixels and seconds.
const PHYS = {
  accel: 900,
  airAccel: 650,
  friction: 1100,
  maxSpeed: 100,
  gravity: 900,
  jumpSpeed: 290,
  jumpCut: 0.45,   // upward speed kept when the jump key is released early
  maxFall: 320,
  coyote: 0.08,    // still allowed to jump this long after leaving a ledge
  buffer: 0.1,     // a jump pressed this early before landing still counts
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ---------- Level ----------

const solids = [{ x: -16, y: GROUND_Y, w: WORLD_W + 32, h: 64 }];
const crates = [
  [200, 136], [216, 136], [216, 120],
  [420, 136],
  [600, 136], [616, 136], [632, 136], [616, 120], [632, 120], [632, 104],
  [980, 136], [996, 136],
  [1140, 136], [1140, 120],
].map(([x, y]) => ({ x, y, w: 16, h: 16 }));
solids.push(...crates);
// World edges
solids.push({ x: -16, y: -200, w: 16, h: 400 }, { x: WORLD_W, y: -200, w: 16, h: 400 });

// Awnings: you can jump up through them and land on top.
const awnings = [
  [296, 108, 48], [480, 100, 64], [700, 92, 48], [770, 66, 48],
  [880, 108, 64], [1050, 92, 48],
].map(([x, y, w]) => ({ x, y, w, h: 4 }));

// ---------- Art ----------

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function layer(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g);
  return c;
}

const SKY = ['#3d6fb6', '#4a7fc2', '#5b92cf', '#70a7dc', '#8bbde6', '#a9d2ef'];

const clouds = layer(640, 90, (g) => {
  const r = rng(7);
  for (let i = 0; i < 7; i++) {
    const cx = Math.floor(r() * 600) + 20;
    const cy = Math.floor(r() * 50) + 10;
    const n = 3 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) {
      const bx = cx + j * 9 - n * 4;
      const by = cy - (j % 2 ? 4 : 0);
      g.fillStyle = '#ffffff';
      g.fillRect(bx, by, 14, 8);
      g.fillStyle = '#dbe9f6';
      g.fillRect(bx, by + 6, 14, 2);
    }
  }
});

function skyline(seed, color, windowColor, minH, maxH, w) {
  return layer(w, VIEW_H, (g) => {
    const r = rng(seed);
    let x = 0;
    while (x < w) {
      const bw = 20 + Math.floor(r() * 30);
      const bh = minH + Math.floor(r() * (maxH - minH));
      const top = GROUND_Y - bh;
      g.fillStyle = color;
      g.fillRect(x, top, bw, bh);
      if (r() < 0.3) g.fillRect(x + 4, top - 6, 3, 6); // antenna
      if (windowColor) {
        for (let wy = top + 5; wy < GROUND_Y - 6; wy += 7) {
          for (let wx = x + 3; wx < x + bw - 4; wx += 5) {
            if (r() < 0.55) {
              g.fillStyle = windowColor;
              g.fillRect(wx, wy, 2, 3);
            }
          }
        }
      }
      x += bw + Math.floor(r() * 4);
    }
  });
}

const farCity = skyline(3, '#7c9cc4', null, 50, 110, 640);
const midCity = skyline(11, '#4e5f86', '#8fa7c9', 40, 90, 640);

// Tiny 3x5 pixel font for shop signs.
const GLYPHS = {
  P: '111101111100100', I: '111010010010111', Z: '111001010100111',
  A: '010101111101101', C: '111100100100111', F: '111100110100100',
  E: '111100110100111', S: '111100111001111', H: '101101111101101',
  O: '111101101101111', '2': '111001111100111', '4': '101101111001001',
  B: '110101110101110', K: '101101110101101', R: '110101110101101',
  T: '111010010010010', M: '101111111101101', Y: '101101010010010',
  N: '110101101101101', D: '110101101101110', L: '100100100100111',
  U: '101101101101111', ' ': '000000000000000',
};

function pixelText(g, text, x, y, color, size = 1) {
  g.fillStyle = color;
  [...text].forEach((ch, i) => {
    const bits = GLYPHS[ch] || GLYPHS[' '];
    for (let p = 0; p < 15; p++) {
      if (bits[p] === '1') g.fillRect(x + (i * 4 + (p % 3)) * size, y + Math.floor(p / 3) * size, size, size);
    }
  });
}

// The one pizzeria: the courier's base and the checkpoint.
const PIZZERIA = { x: 0, w: 136 };
const CHECKPOINT = { x: 104, flagX: 84 }; // respawn spot and the flagpole

function drawPizzeria(g) {
  const { x, w } = PIZZERIA;
  const top = 44;
  // Cream plaster with a red-brick base
  g.fillStyle = '#efe0bd';
  g.fillRect(x, top, w, GROUND_Y - top);
  g.fillStyle = '#d6c399';
  g.fillRect(x, top, w, 3);
  g.fillRect(x + w - 3, top, 3, GROUND_Y - top);
  g.fillStyle = '#a8432f';
  g.fillRect(x, 140, w, 12);
  g.fillStyle = '#7f3022';
  for (let bx = x; bx < x + w; bx += 8) g.fillRect(bx + ((bx / 8) % 2) * 4, 145, 1, 7);
  g.fillRect(x, 145, w, 1);
  // Rooftop sign
  g.fillStyle = '#1a1c2c';
  g.fillRect(x + 22, top - 22, 2, 22);
  g.fillRect(x + w - 26, top - 22, 2, 22);
  g.fillRect(x + 14, top - 26, w - 30, 18);
  g.fillStyle = '#d23c3c';
  g.fillRect(x + 15, top - 25, w - 32, 16);
  pixelText(g, 'PIZZA', x + 31, top - 22, '#1a1c2c', 2);
  pixelText(g, 'PIZZA', x + 30, top - 23, '#f7d51d', 2);
  // Italian stripe under the roof
  [['#3e9b4f', 0], ['#f4f4f4', 1], ['#d23c3c', 2]].forEach(([c, i]) => {
    g.fillStyle = c;
    g.fillRect(x, top + 3 + i * 2, w - 3, 2);
  });
  // Upper windows with flower boxes
  for (let wx = x + 12; wx < x + w - 20; wx += 30) {
    g.fillStyle = '#1a1c2c';
    g.fillRect(wx - 1, 61, 18, 22);
    g.fillStyle = '#5e7fb3';
    g.fillRect(wx, 62, 16, 20);
    g.fillStyle = '#3e9b4f';
    g.fillRect(wx - 2, 83, 20, 3);
    g.fillStyle = '#d23c3c';
    for (let f = 0; f < 5; f++) g.fillRect(wx + f * 4, 81, 2, 2);
  }
  // Shop window glowing from the pizza oven
  g.fillStyle = '#1a1c2c';
  g.fillRect(x + 8, 101, 60, 40);
  g.fillStyle = '#f2a65a';
  g.fillRect(x + 9, 102, 58, 38);
  g.fillStyle = '#e8743b';
  g.fillRect(x + 30, 116, 22, 24);
  g.fillStyle = '#5a3a22';
  g.fillRect(x + 28, 112, 26, 5);
  g.fillStyle = '#f7d51d';
  g.fillRect(x + 35, 126, 12, 8);
  // Pizza drawn on the glass
  g.fillStyle = '#1a1c2c';
  g.fillRect(x + 13, 106, 12, 12);
  g.fillStyle = '#e2a95c';
  g.fillRect(x + 14, 107, 10, 10);
  g.fillStyle = '#f7d51d';
  g.fillRect(x + 15, 108, 8, 8);
  g.fillStyle = '#d23c3c';
  [[16, 109], [20, 110], [17, 113], [21, 114]].forEach(([px, py]) => g.fillRect(x + px, py, 2, 2));
  g.fillStyle = '#f2a65a';
  g.fillRect(x + 19, 112, 5, 5); // missing slice
  // Door with an OPEN plate
  g.fillStyle = '#1a1c2c';
  g.fillRect(x + 96, 112, 24, 40);
  g.fillStyle = '#3e9b4f';
  g.fillRect(x + 97, 113, 22, 39);
  g.fillStyle = '#f7d57a';
  g.fillRect(x + 100, 117, 16, 14);
  g.fillStyle = '#d23c3c';
  g.fillRect(x + 101, 121, 14, 6);
  pixelText(g, 'OPEN', x + 101, 122, '#f4f4f4');
  g.fillStyle = '#f7d51d';
  g.fillRect(x + 115, 136, 2, 2);
}

// Street facades, drawn at full scroll speed behind the courier.
const street = layer(WORLD_W, VIEW_H, (g) => {
  const r = rng(42);
  const colors = [
    ['#b0533c', '#8a3d2c'], ['#c9a86a', '#a3854f'], ['#6b8f71', '#4f6e55'],
    ['#9a6fa5', '#77517f'], ['#c77d4e', '#9e5e37'],
  ];
  const signs = [
    ['CAFE', '#29366f'], ['BOOKS', '#4f6e55'], ['MARKET', '#c06f12'],
    ['SHOP', '#29366f'], ['BAKERY', '#77517f'], ['24', '#1a1c2c'],
  ];
  drawPizzeria(g);
  let x = PIZZERIA.x + PIZZERIA.w;
  let n = 0;
  while (x < WORLD_W) {
    const bw = 96 + Math.floor(r() * 48);
    const top = 20 + Math.floor(r() * 40);
    const [wall, shade] = colors[n % colors.length];
    g.fillStyle = wall;
    g.fillRect(x, top, bw, GROUND_Y - top);
    g.fillStyle = shade;
    g.fillRect(x, top, bw, 3);
    g.fillRect(x + bw - 3, top, 3, GROUND_Y - top);
    // Brick specks
    g.fillStyle = shade;
    for (let i = 0; i < bw * 1.2; i++) {
      g.fillRect(x + Math.floor(r() * (bw - 4)), top + 4 + Math.floor(r() * (GROUND_Y - top - 6)), 3, 1);
    }
    // Upper windows
    for (let wy = top + 10; wy < 100; wy += 22) {
      for (let wx = x + 10; wx < x + bw - 20; wx += 22) {
        g.fillStyle = '#1a1c2c';
        g.fillRect(wx - 1, wy - 1, 12, 14);
        g.fillStyle = r() < 0.4 ? '#f7d57a' : '#5e7fb3';
        g.fillRect(wx, wy, 10, 12);
        g.fillStyle = '#1a1c2c';
        g.fillRect(wx + 5, wy, 1, 12);
        g.fillRect(wx, wy + 6, 10, 1);
      }
    }
    // Shop window and door at street level
    g.fillStyle = '#1a1c2c';
    g.fillRect(x + 8, 115, bw - 44, 37);
    g.fillStyle = '#8fc5e8';
    g.fillRect(x + 9, 116, bw - 46, 36);
    g.fillStyle = '#c4e3f5';
    g.fillRect(x + 12, 119, 3, 10);
    g.fillStyle = '#1a1c2c';
    g.fillRect(x + bw - 30, 120, 18, 32);
    g.fillStyle = '#5a3a22';
    g.fillRect(x + bw - 29, 121, 16, 31);
    g.fillStyle = '#f7d51d';
    g.fillRect(x + bw - 16, 136, 2, 2);
    // Sign
    const [label, signColor] = signs[n % signs.length];
    const sw = label.length * 4 + 5;
    g.fillStyle = '#1a1c2c';
    g.fillRect(x + 10, 103, sw + 2, 11);
    g.fillStyle = signColor;
    g.fillRect(x + 11, 104, sw, 9);
    pixelText(g, label, x + 14, 106, '#f4f4f4');
    x += bw;
    n++;
  }
  // Sidewalk
  g.fillStyle = '#9aa3b5';
  g.fillRect(0, GROUND_Y, WORLD_W, 10);
  g.fillStyle = '#c1c7d4';
  g.fillRect(0, GROUND_Y, WORLD_W, 2);
  g.fillStyle = '#7a8398';
  for (let sx = 0; sx < WORLD_W; sx += 16) g.fillRect(sx, GROUND_Y + 2, 1, 8);
  // Curb and road
  g.fillStyle = '#5d6478';
  g.fillRect(0, GROUND_Y + 10, WORLD_W, 3);
  g.fillStyle = '#333c57';
  g.fillRect(0, GROUND_Y + 13, WORLD_W, VIEW_H - GROUND_Y - 13);
  g.fillStyle = '#f7d51d';
  for (let lx = 8; lx < WORLD_W; lx += 32) g.fillRect(lx, GROUND_Y + 21, 14, 2);
});

const crateImg = layer(16, 16, (g) => {
  g.fillStyle = '#1a1c2c'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#b07a45'; g.fillRect(1, 1, 14, 14);
  g.fillStyle = '#8a5a30';
  g.fillRect(1, 5, 14, 1); g.fillRect(1, 10, 14, 1);
  g.fillStyle = '#d29a5c'; g.fillRect(1, 1, 14, 1);
  g.fillStyle = '#6e4626';
  for (let i = 0; i < 12; i++) g.fillRect(2 + i, 13 - i, 1, 1);
});

function drawAwning(a, camX) {
  const x = Math.round(a.x - camX);
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(x - 1, a.y - 1, a.w + 2, 7);
  for (let i = 0; i < a.w; i += 8) {
    ctx.fillStyle = (i / 8) % 2 ? '#f4f4f4' : '#d23c3c';
    ctx.fillRect(x + i, a.y, 8, 4);
    ctx.fillRect(x + i + 1, a.y + 4, 6, 1); // scalloped edge
  }
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(x + 1, a.y + 5, 1, 6);
  ctx.fillRect(x + a.w - 2, a.y + 5, 1, 6);
}

// ---------- Input ----------

const keys = { left: false, right: false, jump: false };
let jumpPressedAt = -1;
let started = false;

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump',
};

function press(action) {
  if (!started) { start(); return; }
  if (action === 'jump' && !keys.jump) jumpPressedAt = clock;
  keys[action] = true;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') { toast(Sound.toggleMute() ? 'ЗВУК ВКЛ' : 'ЗВУК ВЫКЛ'); return; }
  if (e.code === 'KeyN') { toast(Sound.toggleMusic() ? 'МУЗЫКА ВКЛ' : 'МУЗЫКА ВЫКЛ'); return; }
  if (e.code === 'KeyR' && started) { respawn(); return; }
  const action = KEYMAP[e.code];
  if (!action) { if (!started) start(); return; }
  e.preventDefault();
  if (!e.repeat) press(action);
});
window.addEventListener('keyup', (e) => {
  const action = KEYMAP[e.code];
  if (action) keys[action] = false;
});
window.addEventListener('blur', () => { keys.left = keys.right = keys.jump = false; });

document.querySelectorAll('[data-action]').forEach((btn) => {
  const action = btn.dataset.action;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('down');
    press(action);
  });
  const release = () => { btn.classList.remove('down'); keys[action] = false; };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
});
canvas.addEventListener('pointerdown', () => { if (!started) start(); });
document.querySelector('[data-music]').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const on = Sound.toggleMusic();
  e.currentTarget.classList.toggle('off', !on);
  toast(on ? 'МУЗЫКА ВКЛ' : 'МУЗЫКА ВЫКЛ');
});
document.querySelector('[data-base]').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (started) respawn(); else start();
});

function start() {
  started = true;
  document.getElementById('title').hidden = true;
  beep(440, 880, 0.12);
  Sound.startMusic();
}

// ---------- Courier ----------

const player = {
  x: CHECKPOINT.x, y: GROUND_Y - 24,
  vx: 0, vy: 0,
  w: 10, h: 22, ox: 4, oy: 2, // hitbox inside the 18x24 sprite, centred on the body
  facing: 1,
  grounded: true,
  sinceGround: 0,
  animTime: 0,
  landTime: 0,   // seconds left on the landing crouch
  skidding: false,
  skidTime: 0,   // seconds left on the braking pose
  lastPose: -1,  // walk pose on the previous step, for footstep timing
};

let clock = 0;
const dust = [];
const steam = [];

function hits(px, py, b) {
  return px + player.ox < b.x + b.w && px + player.ox + player.w > b.x &&
         py + player.oy < b.y + b.h && py + player.oy + player.h > b.y;
}

function puff(x, y, n) {
  for (let i = 0; i < n; i++) {
    dust.push({ x: x + (Math.random() * 8 - 4), y, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 20, life: 0.3 + Math.random() * 0.2 });
  }
}

function update(dt) {
  clock += dt;
  const p = player;
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

  // Braking hard against your own momentum
  if (p.grounded && dir !== 0 && Math.sign(p.vx) === -dir && Math.abs(p.vx) > 60 && p.skidTime <= 0) {
    p.skidTime = 0.2;
    beep(500, 250, 0.1, 'sawtooth', 0.03);
  }
  p.skidTime = p.grounded ? Math.max(0, p.skidTime - dt) : 0;
  p.skidding = p.skidTime > 0;
  if (p.skidding && Math.random() < 0.6) puff(p.x + 9 + p.facing * 5, p.y + 24, 1);

  // Horizontal speed
  if (dir) {
    p.vx += dir * (p.grounded ? PHYS.accel : PHYS.airAccel) * dt;
    p.vx = Math.max(-PHYS.maxSpeed, Math.min(PHYS.maxSpeed, p.vx));
    p.facing = dir;
  } else if (p.grounded) {
    const f = PHYS.friction * dt;
    p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
  }

  // Jump with coyote time and input buffering
  p.sinceGround = p.grounded ? 0 : p.sinceGround + dt;
  const wantsJump = jumpPressedAt >= 0 && clock - jumpPressedAt <= PHYS.buffer;
  if (wantsJump && p.sinceGround <= PHYS.coyote) {
    p.vy = -PHYS.jumpSpeed;
    p.grounded = false;
    p.sinceGround = PHYS.coyote + 1;
    jumpPressedAt = -1;
    puff(p.x + 9, p.y + 24, 4);
    Sound.jump();
  }
  if (!keys.jump && p.vy < -PHYS.jumpSpeed * PHYS.jumpCut) p.vy = -PHYS.jumpSpeed * PHYS.jumpCut;

  p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.gravity * dt);

  // Move X, then Y, resolving collisions on each axis
  let nx = p.x + p.vx * dt;
  for (const b of solids) {
    if (hits(nx, p.y, b)) {
      nx = p.vx > 0 ? b.x - p.ox - p.w : b.x + b.w - p.ox;
      p.vx = 0;
    }
  }
  p.x = nx;

  const wasGrounded = p.grounded;
  const fallSpeed = p.vy;
  let ny = p.y + p.vy * dt;
  p.grounded = false;
  for (const b of solids) {
    if (hits(p.x, ny, b)) {
      if (p.vy > 0) { ny = b.y - p.oy - p.h; p.grounded = true; } else { ny = b.y + b.h - p.oy; }
      p.vy = 0;
    }
  }
  if (p.vy >= 0) {
    const feetBefore = p.y + p.oy + p.h;
    for (const a of awnings) {
      const feetAfter = ny + p.oy + p.h;
      const overlapX = p.x + p.ox < a.x + a.w && p.x + p.ox + p.w > a.x;
      if (overlapX && feetBefore <= a.y + 0.01 && feetAfter >= a.y) {
        ny = a.y - p.oy - p.h;
        p.vy = 0;
        p.grounded = true;
      }
    }
  }
  p.y = ny;

  if (p.grounded && !wasGrounded && fallSpeed > 120) {
    puff(p.x + 9, p.y + 24, 6);
    Sound.land(fallSpeed > 250);
    p.landTime = fallSpeed > 250 ? 0.14 : 0.09;
  }
  p.landTime = Math.max(0, p.landTime - dt);

  // Walk cycle advances with distance, so faster steps at full speed
  p.animTime = p.grounded && Math.abs(p.vx) > 5 ? p.animTime + Math.abs(p.vx) * dt : 0;

  // A footstep each time a foot touches down in the walk cycle (poses 0 and 2)
  const pose = p.animTime > 0 ? Math.floor(p.animTime / 7) % 4 : -1;
  if (pose !== p.lastPose && pose % 2 === 0 && !p.skidding) Sound.step();
  p.lastPose = pose;

  // Steam from the hot pizza in the backpack
  if (Math.random() < dt * 3) {
    const bagX = p.facing > 0 ? p.x + 2 : p.x + 13;
    steam.push({ x: bagX + Math.random() * 3, y: p.y + 6, life: 0.8 + Math.random() * 0.4 });
  }
  for (let i = steam.length - 1; i >= 0; i--) {
    const s = steam[i];
    s.life -= dt;
    s.y -= 12 * dt;
    s.x += Math.sin((s.life + i) * 8) * 6 * dt;
    if (s.life <= 0) steam.splice(i, 1);
  }

  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.life -= dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.life <= 0) dust.splice(i, 1);
  }
}

// ---------- Checkpoint ----------

let awayFromBase = false; // set once the courier has walked off, so returning can be announced
let flagCheer = 0;        // seconds left on the flag's celebration

function respawn() {
  puff(player.x + 9, player.y + 24, 8);
  Object.assign(player, { x: CHECKPOINT.x, y: GROUND_Y - 24, vx: 0, vy: 0, facing: 1, landTime: 0, skidTime: 0 });
  awayFromBase = false;
  puff(player.x + 9, player.y + 24, 8);
  Sound.resetTempo();
  beep(880, 220, 0.25, 'square', 0.05);
}

function updateCheckpoint(dt) {
  const d = Math.abs(player.x + 9 - CHECKPOINT.flagX);
  if (d > 160) awayFromBase = true;
  if (awayFromBase && d < 20) {
    awayFromBase = false;
    flagCheer = 1.2;
    toast('КОНТРОЛЬНАЯ ТОЧКА');
    beep(523, 784, 0.12);
    setTimeout(() => beep(784, 1046, 0.18), 120);
  }
  flagCheer = Math.max(0, flagCheer - dt);
}

let toastTimer = 0;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth; // restart the animation
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function drawFlag(cx) {
  const x = CHECKPOINT.flagX - cx;
  const wave = Math.floor(clock * (flagCheer > 0 ? 12 : 4)) % 2;
  const lift = flagCheer > 0 ? Math.round(Math.abs(Math.sin(clock * 14)) * 3) : 0;
  // Pole and base
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(x - 1, 108, 3, 44);
  ctx.fillRect(x - 3, 149, 7, 3);
  ctx.fillStyle = '#c1c7d4';
  ctx.fillRect(x, 109, 1, 42);
  ctx.fillStyle = '#f7d51d';
  ctx.fillRect(x - 1, 105, 3, 3);
  // Pennant: a pizza slice on red
  const fy = 110 - lift;
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(x + 2, fy - 1, 15 + wave, 12);
  ctx.fillStyle = '#d23c3c';
  ctx.fillRect(x + 2, fy, 14 + wave, 10);
  ctx.fillStyle = '#b02f30';
  ctx.fillRect(x + 2 + 7 + wave, fy + (wave ? 0 : 1), 7, 9 - (wave ? 0 : 1));
  ctx.fillStyle = '#f7d51d';
  ctx.fillRect(x + 5, fy + 2, 6, 2);
  ctx.fillRect(x + 6, fy + 4, 4, 2);
  ctx.fillRect(x + 7, fy + 6, 2, 2);
  ctx.fillStyle = '#d23c3c';
  ctx.fillRect(x + 7, fy + 2, 1, 1);
  ctx.fillStyle = '#e2a95c';
  ctx.fillRect(x + 5, fy + 1, 6, 1);
  if (flagCheer > 0) {
    ctx.fillStyle = '#f7d51d';
    for (let i = 0; i < 4; i++) {
      const a = clock * 6 + i * 1.57;
      ctx.fillRect(Math.round(x + 9 + Math.cos(a) * 14), Math.round(fy + 5 + Math.sin(a) * 9), 1, 1);
    }
  }
}

// ---------- Render ----------

let camX = 0;

function courierFrame() {
  const p = player;
  if (!p.grounded) return p.vy < -40 ? COURIER.rise : COURIER.fall;
  if (p.landTime > 0) return COURIER.land;
  if (p.skidding) return COURIER.skid;
  if (p.animTime > 0) return COURIER.walk[Math.floor(p.animTime / 7) % 4]; // a new pose every 7 px
  if (clock % 3.2 < 0.12) return COURIER.blink;
  return clock % 1.6 < 0.8 ? COURIER.idle : COURIER.breathe;
}

function tiled(img, speed, y = 0) {
  const off = -Math.round(camX * speed) % img.width;
  for (let x = off; x < VIEW_W; x += img.width) ctx.drawImage(img, x, y);
}

function render() {
  const target = player.x + 9 - VIEW_W / 2 + player.facing * 24;
  camX += (target - camX) * 0.1;
  camX = Math.max(0, Math.min(WORLD_W - VIEW_W, camX));
  const cx = Math.round(camX);

  const band = Math.ceil(GROUND_Y / SKY.length);
  SKY.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * band, VIEW_W, band); });
  const cloudOff = -Math.round(camX * 0.1 + clock * 4) % clouds.width;
  for (let x = cloudOff; x < VIEW_W; x += clouds.width) ctx.drawImage(clouds, x, 0);
  tiled(farCity, 0.2);
  tiled(midCity, 0.5);
  ctx.drawImage(street, cx, 0, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

  for (const a of awnings) drawAwning(a, cx);
  for (const c of crates) ctx.drawImage(crateImg, c.x - cx, c.y);
  drawFlag(cx);

  ctx.fillStyle = '#d6dbe4';
  for (const d of dust) ctx.fillRect(Math.round(d.x - cx), Math.round(d.y), 2, 2);

  // Shadow on the ground under the courier
  ctx.fillStyle = 'rgba(26,28,44,0.35)';
  ctx.fillRect(Math.round(player.x - cx) + 4, GROUND_Y, 10, 2);

  const img = courierFrame();
  const px = Math.round(player.x) - cx;
  const py = Math.round(player.y);
  if (player.facing < 0) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(img, -px - img.width, py);
    ctx.restore();
  } else {
    ctx.drawImage(img, px, py);
  }

  for (const s of steam) {
    ctx.fillStyle = s.life > 0.5 ? 'rgba(244,244,244,0.8)' : 'rgba(244,244,244,0.4)';
    ctx.fillRect(Math.round(s.x - cx), Math.round(s.y), 1, 1);
  }
}

// ---------- Loop and scaling ----------

let last = performance.now();
let acc = 0;

function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    if (started) { update(STEP); updateCheckpoint(STEP); }
    else clock += STEP;
    acc -= STEP;
  }
  render();
  requestAnimationFrame(frame);
}

function fit() {
  const stage = document.getElementById('stage');
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  const raw = Math.min(sw / VIEW_W, sh / VIEW_H);
  const scale = raw >= 2 ? Math.floor(raw) : raw; // whole-number scaling keeps pixels sharp
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
  canvas.parentElement.style.setProperty('--px', `${scale}px`); // one game pixel, for the HUD
}

window.addEventListener('resize', fit);
fit();
requestAnimationFrame(frame);
