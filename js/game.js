// Delivery in Five Minutes — stage 1: a pizza courier who walks and jumps.

const VIEW_W = 320;
const VIEW_H = 180;
const WORLD_W = 28000;     // 1.75 km of street
const PX_PER_METRE = 16;
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

// Skateboard tuning: faster, rolls further, takes a moment to push up to speed.
const BOARD = { time: 12, maxSpeed: 175, accel: 520, friction: 240 };

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ---------- Level ----------

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}


// The recipient's house at the far end of the street.
const DEST = { x: WORLD_W - 300, w: 176 };
DEST.doorX = DEST.x + 120; // centre of the front door: the delivery spot

// The first stretch is hand-made; after that obstacles are generated anew
// for every run (see buildLevel).
const HAND_CRATES = [
  [200, 136], [216, 136], [216, 120],
  [420, 136],
  [600, 136], [616, 136], [632, 136], [616, 120], [632, 120], [632, 104],
  [980, 136], [996, 136],
  [1140, 136], [1140, 120],
];
const HAND_AWNINGS = [
  [296, 108, 48], [480, 100, 64], [700, 92, 48], [770, 66, 48],
  [880, 108, 64], [1050, 92, 48],
];

const crateList = [];   // [x, y]
const awningList = [];  // [x, y, w]

// Holes in the street, people walking about, puddles that slow you down.
const pits = [];        // { x, w }
const pedestrians = []; // { x, min, max, dir, speed, look, anim, floor, still }: on the street or on balconies
const puddles = [];     // { x, w }
const clockSpots = [];  // { x, y, gold }: where the bonus clocks hang
const balconyList = []; // [x, y, w]
const boardSpots = [];  // x of skateboards lying on the pavement

function generateObstacles(r) {
  const pick = (list) => list[Math.floor(r() * list.length)];
  // Crate patterns as [dx, height in crates]. Taller ones always have steps.
  const EASY = [
    [[0, 1]], [[0, 1], [16, 1]], [[0, 2]], [[0, 1], [16, 2]], [[0, 2], [16, 1]],
  ];
  const HARD = [
    [[0, 1], [16, 2], [32, 3]],
    [[0, 1], [16, 2], [32, 3], [48, 2], [64, 1]],
    [[0, 2], [16, 2], [32, 2]],
    [[0, 1], [16, 2], [32, 3], [48, 4]],      // tall wall with a staircase
    [[0, 2], [16, 3], [32, 1]],
  ];
  const START = 1300;
  const END = DEST.x - 520; // a clear run-up to the recipient's door

  // A column of crates standing on the pavement; `sunk` adds crates below
  // street level so a pillar looks like it rises out of a pit.
  function column(x, h, sunk = 0) {
    for (let k = -sunk; k < h; k++) crateList.push([x, 136 - k * 16]);
  }
  const step4 = (lo, hi) => lo + Math.floor(r() * ((hi - lo) / 4 + 1)) * 4; // random multiple of 4
  const clock = (x, y, gold = false) => clockSpots.push({ x, y, gold });
  // Someone on a balcony: pacing along it, or leaning on the railing
  const resident = (bx, w, floor, d, still = false) => pedestrians.push({
    x: bx + r() * (w - 12), min: bx, max: bx + w - 12, dir: r() < 0.5 ? -1 : 1,
    speed: 16 + r() * (10 + d * 14), look: Math.floor(r() * 4), anim: 0, floor, still,
  });

  // ----- Parkour pieces. Each returns its width. Jump sizes are kept inside
  // what the courier can do: about 64 px across on the level, ~50 px when
  // jumping up two crates.

  // Two-crate-wide pillars rising out of a long pit: hop from one to the next.
  // Wide enough that a full jump from the edge still lands on the next one.
  function pillars(x, d) {
    const n = 3 + Math.floor(r() * (2 + d * 2));
    const h = 1 + Math.floor(r() * 2); // one height per section: stepping down overshoots
    // Stride ≥ a full jump, so landings never drift past the edge; tall pillars
    // get shorter gaps because the first hop has to climb two crates.
    const gap = step4(32, h === 2 ? 40 : 36 + Math.round(d * 12));
    const w = gap + n * (32 + gap);
    pits.push({ x, w });
    for (let i = 0; i < n; i++) {
      const px = x + gap + i * (32 + gap);
      column(px, h, 2);
      column(px + 16, h, 2);
    }
    if (r() < 0.3) clock(x + gap + 32 + gap / 2, 104); // mid-air, between the first two pillars
    return w;
  }

  // A bridge of awnings over a pit, reached from a two-crate step.
  function bridge(x, d) {
    column(x, 1);
    column(x + 16, 2);
    const n = 3 + Math.floor(r() * (2 + d * 2));
    let ax = x + 32;
    const pitX = ax;
    for (let i = 0; i < n; i++) {
      ax += step4(32, 36 + Math.round(d * 8));
      const aw = 32 + Math.floor(r() * 2) * 16;
      awningList.push([ax, 120, aw]);
      if (i === 1 && r() < 0.3) clock(ax + aw / 2, 104);
      // An upper route: a balcony right above a wide awning, reached by jumping
      // straight up from it, often with a clock. It stops short of the awning's
      // end so that dropping off it still reaches the next awning.
      if (i >= 1 && aw === 48 && r() < 0.8) {
        balconyList.push([ax + 4, 88, 40]);
        if (r() < 0.6) clock(ax + 24, 74);
      }
      ax += aw;
    }
    ax += step4(24, 32);
    pits.push({ x: pitX, w: ax - pitX });
    return ax - x;
  }

  // Awnings stepping up and back down over a pit.
  function stairs(x) {
    const ys = [128, 112, 96, 112, 128];
    let ax = x + 24;
    ys.forEach((y, i) => {
      awningList.push([ax, y, 48]);
      if (i === 2 && r() < 0.4) clock(ax + 24, y - 14);
      ax += 48 + (i < 2 ? step4(20, 28) : step4(24, 32)); // going down you fly further
    });
    pits.push({ x, w: ax - x });
    return ax - x;
  }

  // Climb a four-crate tower and leap off it over a pit (at most 56 px).
  function tower(x, d) {
    column(x, 1);
    column(x + 16, 2);
    column(x + 32, 3);
    column(x + 48, 4);
    column(x + 64, 4); // a two-crate-wide top, so a full jump from the step lands on it
    if (r() < 0.4) clock(x + 64, 74);
    const pw = step4(40, 48 + Math.round(d * 8));
    pits.push({ x: x + 80, w: pw });
    return 80 + pw;
  }

  // Climb up the front of a building: a crate, an awning, a balcony with boxes
  // on it, and sometimes a second balcony higher up with a golden clock.
  function balconies(x) {
    column(x, 1);
    awningList.push([x + 24, 112, 64]);
    const bx = x + 48;
    balconyList.push([bx, 80, 64]);
    crateList.push([bx + 16, 64]);
    if (r() < 0.5) crateList.push([bx + 32, 64]);
    else if (r() < 0.6) resident(bx + 36, 28, 80, 0.5, true);
    if (r() < 0.7) clock(bx + 56, 66);
    let end = bx + 64;
    if (r() < 0.5) {
      // A second balcony above and ahead, reached from the first
      balconyList.push([bx + 40, 48, 48]);
      clock(bx + 64, 34, true);
      end = bx + 88;
    }
    return end - x + 72; // room to land after dropping off the top
  }

  // The core piece: a chain of balconies along the house fronts at changing
  // heights. Over a pit it is the only way across; over a stretch of pavement
  // with people and puddles it is the safer upper route, with boxes to hop and
  // clocks to grab. Balconies are 56 px wide and the gaps 24–32 px, so a full
  // jump from the edge lands on the next one going up, level or down.
  function balconyRun(x, d) {
    const overPit = r() < 0.55 + d * 0.3;
    const n = 3 + Math.floor(r() * (2 + d * 2));
    const W = 56;
    let y = 112; // the first one can be reached from the pavement
    let bx = x + 24;
    const spots = [];
    const withBox = new Set();
    for (let i = 0; i < n; i++) {
      balconyList.push([bx, y, W]);
      spots.push([bx, y]);
      // Over a pit, boxes stand flush with the far edge: hopping one is the same
      // as jumping a little early to the next balcony, and that gap is kept at
      // its shortest so the early jump still makes it.
      const box = overPit && i > 0 && r() < 0.3 + d * 0.2;
      if (box) { crateList.push([bx + W - 16, y - 16]); withBox.add(i); }
      if (i === n - 1) break;
      const dy = i === 0 ? pick([0, -16, -16]) : pick([-16, 0, 16, 32]);
      const ny = Math.max(80, Math.min(112, y + dy));
      bx += W + (box ? 24 : ny < y ? step4(24, 28) : step4(24, 32));
      y = ny;
    }
    const end = bx + W + 28;
    if (overPit) pits.push({ x, w: end - x });
    // A clock on one of the balconies, at its far end (above the box if there is one)
    if (r() < 0.45) {
      const i = 1 + Math.floor(r() * (spots.length - 1));
      const [cx, cy] = spots[i];
      clock(cx + W - 10, withBox.has(i) ? cy - 30 : cy - 14);
    }
    if (!overPit) {
      // Down on the pavement: people and puddles; up top: a box or two in the way
      if (r() < 0.7) {
        pedestrians.push({
          x: x + r() * (end - x), min: x, max: end, dir: r() < 0.5 ? -1 : 1,
          speed: 26 + r() * (16 + d * 20), look: Math.floor(r() * 4), anim: 0,
        });
      }
      if (r() < 0.5) puddles.push({ x: x + 40 + Math.floor(r() * 40), w: 48 + Math.floor(r() * 3) * 8 });
      // Up top: boxes and people to hop over; bump into someone and you drop to the street
      for (const [sx, sy] of spots.slice(1)) {
        const what = r();
        if (what < 0.35) crateList.push([sx + W / 2 - 8, sy - 16]);
        else if (what < 0.7) resident(sx, W, sy, d);
      }
    }
    return end - x;
  }

  let x = START;
  let nextBoard = START + 200 + Math.floor(r() * 600);
  while (x < END) {
    const d = (x - START) / (END - START); // difficulty 0 → 1 along the street
    const roll = r();
    let width;
    if (x >= nextBoard && x < END - 600) {
      // A clear stretch of pavement with a skateboard at the start: room to get going
      boardSpots.push(x + 16);
      width = 360;
      nextBoard = x + 2000 + Math.floor(r() * 1200);
    } else if (roll < 0.24 + d * 0.22) {
      // Parkour section
      // plus room to land: dropping off the last platform carries you ~80 px
      // Balconies are the backbone: chains of them come up most often
      width = pick([balconyRun, balconyRun, balconyRun, balconies, bridge, pillars, stairs, tower])(x, d) + 56;
    } else if (roll < 0.47 + d * 0.18) {
      // Pit: 32 px early on, up to 48 px later (a full-speed jump clears about 54)
      width = 32 + Math.floor(r() * (1 + d * 1.99)) * 8;
      pits.push({ x, w: width });
      if (r() < 0.35) awningList.push([x - 8, 96 + Math.floor(r() * 2) * 10, width + 16]);
      else if (r() < 0.15) clock(x + width / 2, 100); // grab it mid-jump
    } else if (roll < 0.58 + d * 0.16) {
      // Pedestrian strolling back and forth
      width = 90 + Math.floor(r() * 60);
      pedestrians.push({
        x: x + r() * width, min: x, max: x + width, dir: r() < 0.5 ? -1 : 1,
        speed: 22 + r() * (14 + d * 22), look: Math.floor(r() * 4), anim: 0,
      });
    } else if (roll < 0.64 + d * 0.12) {
      // Puddle, often with a crate in the middle of it
      width = 48 + Math.floor(r() * 4) * 8;
      puddles.push({ x, w: width });
      if (r() < 0.5) column(x + width / 2 - 8, 1);
    } else {
      // Crates, harder patterns more likely later on
      const pattern = r() < 0.2 + d * 0.6 ? pick(HARD) : pick(EASY);
      for (const [dx, h] of pattern) column(x + dx, h);
      width = pattern[pattern.length - 1][0] + 16;
      const peak = pattern.reduce((a, b) => (b[1] > a[1] ? b : a));
      if (r() < 0.1) clock(x + peak[0] + 8, 136 - (peak[1] - 1) * 16 - 14);
      let reach = width; // how far this piece extends, awning included
      if (r() < 0.35) {
        const aw = 48 + Math.floor(r() * 3) * 16;
        const ax = x + width + 24 + Math.floor(r() * 40);
        awningList.push([ax, 88 + Math.floor(r() * 3) * 10, aw]);
        reach = ax + aw - x;
      }
      // Later on, a pit often follows a crate pile
      const lastH = pattern[pattern.length - 1][1];
      const tallest = Math.max(...pattern.map(([, h]) => h));
      if (r() < 0.2 + d * 0.6) {
        const pw = 32 + Math.floor(r() * 2) * 8;
        // Right behind a pile too tall to hop over from the ground, so the only way
        // across is a leap from its top; otherwise leave room to land before the pit.
        const gap = lastH === tallest && tallest >= 3 ? 0 : 88;
        pits.push({ x: x + Math.max(width + gap, reach), w: pw });
        width = Math.max(width + gap, reach) + pw + 56;
      } else {
        // Leaping off a tall pile carries you ~75 px: keep the next obstacle beyond that
        width = Math.max(width + (tallest >= 2 ? 56 : 0), reach);
      }
    }
    // Less breathing room between obstacles the further you get
    x += width + Math.max(40, 100 - d * 50) + Math.floor(r() * 70);
  }

  // Balconies on the upper floors of nearly every house: a free route along the
  // facades with boxes, people and the odd clock. They keep clear of other
  // platforms, of tall crate piles, and of the 130 px before a pit, so dropping
  // off one never lands you in a hole.
  const clear = (x0, x1) =>
    !awningList.some(([ax, , aw]) => ax < x1 + 24 && ax + aw > x0 - 24) &&
    !balconyList.some(([ax, , aw]) => ax < x1 + 24 && ax + aw > x0 - 24) &&
    !pits.some((pt) => x0 - 8 < pt.x + pt.w + 10 && x1 + 8 > pt.x - 130);
  for (let fx = 330; fx < DEST.x - 260; fx += 96 + Math.floor(r() * 64)) {
    const w = pick([48, 56, 64]);
    const y = pick([64, 80, 80]);
    if (!clear(fx, fx + w)) continue;
    if (crateList.some(([cx, cy]) => cx < fx + w && cx + 16 > fx && cy < y + 48)) continue;
    balconyList.push([fx, y, w]);
    const d = Math.max(0, (fx - START) / (END - START));
    const what = r();
    if (what < 0.4) {
      crateList.push([fx + 8 + Math.floor(r() * (w - 32)), y - 16]);
    } else if (what < 0.7) {
      resident(fx, w, y, d);
    } else if (what < 0.76) {
      clock(fx + w - 10, y - 14);
    }
  }
}

const solids = [];
const crates = [];
const awnings = [];
let levelSeed = 0;

// Lay out a fresh street from a seed: hand-made start, generated rest.
function buildLevel(seed) {
  levelSeed = seed;
  for (const list of [crateList, awningList, pits, pedestrians, puddles, clockSpots, balconyList, boardSpots, solids, crates, awnings]) {
    list.length = 0;
  }
  crateList.push(...HAND_CRATES.map((c) => [...c]));
  awningList.push(...HAND_AWNINGS.map((a) => [...a]));
  generateObstacles(rng(seed));

  // The ground is split into pieces around the pits.
  let gx = -16;
  for (const pit of pits) {
    solids.push({ x: gx, y: GROUND_Y, w: pit.x - gx, h: 64 });
    gx = pit.x + pit.w;
  }
  solids.push({ x: gx, y: GROUND_Y, w: WORLD_W + 16 - gx, h: 64 });
  // About a third of the boxes are cardboard, the rest wooden crates.
  const shuffle = rng(seed ^ 0x5bd1e995);
  for (const [x, y] of crateList) crates.push({ x, y, w: 16, h: 16, card: shuffle() < 0.35 });
  solids.push(...crates);
  // World edges
  solids.push({ x: -16, y: -200, w: 16, h: 400 }, { x: WORLD_W, y: -200, w: 16, h: 400 });

  // Awnings: you can jump up through them and land on top.
  for (const [x, y, w] of awningList) awnings.push({ x, y, w, h: 4 });
  // Balconies work the same way (land on top, jump up through), they only look different.
  for (const [x, y, w] of balconyList) awnings.push({ x, y, w, h: 4, balcony: true });
}

const newSeed = () => Math.floor(Math.random() * 2 ** 31);
buildLevel(newSeed());

// ---------- Art ----------

function layer(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g);
  return c;
}

// A very wide picture split into 4096 px strips, because browsers refuse
// canvases much wider than that. `draw` paints the whole thing in world
// coordinates; each strip keeps its own slice.
const CHUNK = 4096;
function chunkedLayer(w, h, draw) {
  const chunks = [];
  for (let x0 = 0; x0 < w; x0 += CHUNK) {
    const c = document.createElement('canvas');
    c.width = Math.min(CHUNK, w - x0);
    c.height = h;
    const g = c.getContext('2d');
    g.translate(-x0, 0);
    draw(g);
    chunks.push({ x0, c });
  }
  return chunks;
}

function drawChunked(chunks, cx) {
  for (const { x0, c } of chunks) {
    const from = Math.max(cx, x0);
    const to = Math.min(cx + VIEW_W, x0 + c.width);
    if (to > from) ctx.drawImage(c, from - x0, 0, to - from, VIEW_H, from - cx, 0, to - from, VIEW_H);
  }
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
  '0': '111101101101111', '1': '010110010010111', '3': '111001111001111',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111', '+': '000010111010000',
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

// The house the pizza is going to.
function drawDestination(g) {
  const { x, w } = DEST;
  const top = 64;
  // Stepped roof
  g.fillStyle = '#1a1c2c';
  for (let i = 0; i < 6; i++) g.fillRect(x - 6 + i * 8, top - 6 - i * 4, w + 12 - i * 16, 6);
  g.fillStyle = '#8e2434';
  for (let i = 0; i < 6; i++) g.fillRect(x - 5 + i * 8, top - 5 - i * 4, w + 10 - i * 16, 4);
  // Walls
  g.fillStyle = '#7cc0c8';
  g.fillRect(x, top, w, GROUND_Y - top);
  g.fillStyle = '#5e9ea6';
  g.fillRect(x, top, w, 2);
  g.fillRect(x + w - 3, top, 3, GROUND_Y - top);
  for (let wy = top + 6; wy < GROUND_Y; wy += 6) g.fillRect(x, wy, w - 3, 1); // siding
  // Windows with curtains; someone is waiting in the left one
  [[x + 14, 78], [x + 60, 78], [x + 14, 112], [x + 60, 112]].forEach(([wx, wy], i) => {
    g.fillStyle = '#1a1c2c';
    g.fillRect(wx - 1, wy - 1, 26, 24);
    g.fillStyle = '#f7d57a';
    g.fillRect(wx, wy, 24, 22);
    g.fillStyle = '#d23c3c';
    g.fillRect(wx, wy, 5, 22);
    g.fillRect(wx + 19, wy, 5, 22);
    if (i === 2) {
      g.fillStyle = '#1a1c2c';
      g.fillRect(wx + 9, wy + 6, 6, 6);
      g.fillRect(wx + 7, wy + 12, 10, 10);
    }
    g.fillStyle = '#5e9ea6';
    g.fillRect(wx - 2, wy + 22, 28, 2);
  });
  // Front door with the house number
  const dx = DEST.doorX - 11;
  g.fillStyle = '#1a1c2c';
  g.fillRect(dx - 3, 104, 28, 48);
  g.fillStyle = '#f4f4f4';
  g.fillRect(dx - 2, 105, 26, 47);
  g.fillStyle = '#1a1c2c';
  g.fillRect(dx, 108, 22, 44);
  g.fillStyle = '#3b5dc9';
  g.fillRect(dx + 1, 109, 20, 43);
  g.fillStyle = '#29366f';
  g.fillRect(dx + 4, 113, 14, 14);
  g.fillRect(dx + 4, 131, 14, 16);
  g.fillStyle = '#f7d51d';
  g.fillRect(dx + 16, 132, 2, 2);
  g.fillStyle = '#1a1c2c';
  g.fillRect(dx + 3, 92, 17, 10);
  g.fillStyle = '#f4f4f4';
  g.fillRect(dx + 4, 93, 15, 8);
  pixelText(g, '42', dx + 8, 95, '#1a1c2c');
  // Lamp by the door
  g.fillStyle = '#1a1c2c';
  g.fillRect(dx + 27, 110, 6, 8);
  g.fillStyle = '#f7d51d';
  g.fillRect(dx + 28, 111, 4, 6);
  // Mailbox
  g.fillStyle = '#1a1c2c';
  g.fillRect(x + w - 22, 128, 3, 24);
  g.fillRect(x + w - 27, 120, 13, 9);
  g.fillStyle = '#d23c3c';
  g.fillRect(x + w - 26, 121, 11, 7);
}

// Street facades, sidewalk, pits and puddles for the current level, drawn at
// full scroll speed behind the courier.
function paintStreet(g) {
  const r = rng(levelSeed ^ 0x2545f491);
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
  let n = Math.floor(r() * 30); // shops and colours start at a different point every run
  while (x < DEST.x) {
    let bw = 96 + Math.floor(r() * 48);
    if (DEST.x - x - bw < 96) bw = DEST.x - x; // last shop stretches to meet the house
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
  drawDestination(g);
  // A plain wall after the house, to the end of the street
  g.fillStyle = '#6b6f86';
  g.fillRect(DEST.x + DEST.w, 70, WORLD_W - DEST.x - DEST.w, GROUND_Y - 70);
  g.fillStyle = '#585b70';
  g.fillRect(DEST.x + DEST.w, 70, WORLD_W - DEST.x - DEST.w, 3);
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

  // Pits: an open hole through the pavement, with striped barriers at the edges
  for (const pit of pits) {
    g.fillStyle = '#12131f';
    g.fillRect(pit.x, GROUND_Y, pit.w, VIEW_H - GROUND_Y);
    g.fillStyle = '#3a2a22';
    g.fillRect(pit.x, GROUND_Y, 2, VIEW_H - GROUND_Y);
    g.fillRect(pit.x + pit.w - 2, GROUND_Y, 2, VIEW_H - GROUND_Y);
    g.fillStyle = '#5a3a22';
    g.fillRect(pit.x, GROUND_Y, pit.w, 3);
    for (const bx of [pit.x - 7, pit.x + pit.w + 1]) {
      g.fillStyle = '#1a1c2c';
      g.fillRect(bx - 1, GROUND_Y - 13, 8, 13);
      g.fillStyle = '#f47b20';
      g.fillRect(bx, GROUND_Y - 12, 6, 12);
      g.fillStyle = '#f4f4f4';
      g.fillRect(bx, GROUND_Y - 9, 6, 2);
      g.fillRect(bx, GROUND_Y - 4, 6, 2);
    }
  }

  // Puddles on the pavement
  for (const pd of puddles) {
    g.fillStyle = '#1a1c2c';
    g.fillRect(pd.x + 2, GROUND_Y - 1, pd.w - 4, 1);
    g.fillRect(pd.x, GROUND_Y, pd.w, 4);
    g.fillStyle = '#4f86c6';
    g.fillRect(pd.x + 1, GROUND_Y, pd.w - 2, 3);
    g.fillStyle = '#a9d2ef';
    for (let i = pd.x + 4; i < pd.x + pd.w - 6; i += 11) g.fillRect(i, GROUND_Y + 1, 4, 1);
  }
}
let street = chunkedLayer(WORLD_W, VIEW_H, paintStreet);

// Box textures, drawn pixel by pixel from a 16x16 grid of colour letters.
function gridImage(rows, colors) {
  return layer(rows[0].length, rows.length, (g) => {
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = colors[ch];
      g.fillRect(x, y, 1, 1);
    }));
  });
}

// Wooden crate: two-tone frame, planks, a diagonal brace and corner nails.
const woodCrate = (() => {
  const rows = [];
  for (let y = 0; y < 16; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      let ch;
      if (x === 0 || y === 0 || x === 15 || y === 15) ch = 'K';
      else if ((x === 2 || x === 13) && (y === 2 || y === 13)) ch = 'n';
      else if (y === 1 || x === 1) ch = 'L';
      else if (y === 14 || x === 14) ch = 'D';
      else if (y === 2 || x === 2 || y === 13 || x === 13) ch = 'M';
      else if (x - 3 === 12 - y) ch = 'x';                 // brace
      else if (x - 4 === 12 - y) ch = 'y';                 // brace shadow
      else if (y === 6 || y === 9) ch = 'q';               // gaps between planks
      else if ((x * 5 + y * 3) % 11 === 0) ch = 'q';       // wood grain
      else ch = 'p';
      row += ch;
    }
    rows.push(row);
  }
  return gridImage(rows, {
    K: '#1a1c2c', L: '#e0aa6a', M: '#b8803f', D: '#7a4a24', n: '#d6dbe4',
    p: '#c48c4e', q: '#94612f', x: '#ebbd80', y: '#6e4626',
  });
})();

// Cardboard box: flaps, packing tape, a shipping label and "this way up" arrows.
const cardBox = gridImage([
  'KKKKKKKKKKKKKKKK',
  'KllllltTTtllllbK',
  'KBBBBBtTTtBBBBbK',
  'KBBBBBtTTtBBBBbK',
  'KbbbbbtTTtbbbbbK',
  'KBBBBBtTTtBBBBbK',
  'KBBBBBBttBBBBBbK',
  'KBBBBBBBBBBBBBbK',
  'KBBrBBrBBBBBBBbK',
  'KBrrrrrrBWWWWBbK',
  'KBBrBBrBBWkkWBbK',
  'KBBrBBrBBWWWWBbK',
  'KBBrBBrBBWkkWBbK',
  'KBBBBBBBBWWWWBbK',
  'KbbbbbbbbbbbbbbK',
  'KKKKKKKKKKKKKKKK',
], {
  K: '#1a1c2c', B: '#c9a26b', b: '#9e7744', l: '#e3c08a',
  T: '#efe4bf', t: '#c7b78a', r: '#d23c3c', W: '#f4f4f4', k: '#8e8e9a',
});

// Bonus alarm clocks: red ones give +5 s, golden ones +15 s.
const CLOCK_ROWS = [
  '.KK...KK.',
  'KRRKKKRRK',
  '.KKWWWKK.',
  'KRWWKWWRK',
  'KRWWKWWRK',
  'KRWWKKWRK',
  'KRWWWWWRK',
  '.KRWWWRK.',
  '..KKKKK..',
  '.KK...KK.',
];
const clockRed = gridImage(CLOCK_ROWS, { K: '#1a1c2c', R: '#d23c3c', W: '#f4f4f4' });
const clockGold = gridImage(CLOCK_ROWS, { K: '#1a1c2c', R: '#f7d51d', W: '#fff6d5' });

function boxImage(c) {
  return c.card ? cardBox : woodCrate;
}

// Stone balcony: a doorway in the wall behind, a slab to stand on, an iron
// railing and two brackets underneath.
function drawBalcony(a, x) {
  const y = a.y;
  // Doorway behind
  const dx = x + Math.round(a.w / 2) - 7;
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(dx - 1, y - 23, 16, 23);
  ctx.fillStyle = '#3b3f5c';
  ctx.fillRect(dx, y - 22, 14, 22);
  ctx.fillStyle = '#f7d57a';
  ctx.fillRect(dx + 2, y - 20, 4, 8);
  ctx.fillRect(dx + 8, y - 20, 4, 8);
  // Railing
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(x, y - 11, a.w, 2);
  for (let i = 1; i < a.w - 1; i += 4) ctx.fillRect(x + i, y - 9, 1, 9);
  ctx.fillRect(x, y - 11, 2, 11);
  ctx.fillRect(x + a.w - 2, y - 11, 2, 11);
  // Slab
  ctx.fillRect(x - 2, y - 1, a.w + 4, 7);
  ctx.fillStyle = '#b7b9cc';
  ctx.fillRect(x - 1, y, a.w + 2, 2);
  ctx.fillStyle = '#8d8fa6';
  ctx.fillRect(x - 1, y + 2, a.w + 2, 3);
  // Brackets
  ctx.fillStyle = '#1a1c2c';
  for (const bx of [x + 4, x + a.w - 9]) {
    ctx.fillRect(bx, y + 6, 5, 2);
    ctx.fillRect(bx + 1, y + 8, 3, 2);
    ctx.fillRect(bx + 2, y + 10, 1, 2);
  }
}

function drawAwning(a, camX) {
  const x = Math.round(a.x - camX);
  if (a.balcony) { drawBalcony(a, x); return; }
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
  if (finished) {
    if (action === 'jump' && !document.getElementById('result').hidden) restart();
    return;
  }
  if (action === 'jump' && !keys.jump) jumpPressedAt = clock;
  keys[action] = true;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') { toast(Sound.toggleMute() ? 'ЗВУК ВКЛ' : 'ЗВУК ВЫКЛ'); return; }
  if (e.code === 'KeyN') { toast(Sound.toggleMusic() ? 'МУЗЫКА ВКЛ' : 'МУЗЫКА ВЫКЛ'); return; }
  if (e.code === 'KeyR' && started && !finished) { respawn(); return; }
  if ((e.code === 'ArrowDown' || e.code === 'KeyS') && started && !finished) {
    e.preventDefault();
    if (player.board > 0) loseBoard('off');
    return;
  }
  if (e.code === 'Enter' && finished && !document.getElementById('result').hidden) { restart(); return; }
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
  if (!started) start(); else if (!finished) respawn();
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
  stun: 0,       // seconds without control after bumping into someone
  invuln: 0,     // seconds of blinking safety after a bump or fall
  board: 0,      // seconds of skateboard left (0 = on foot)
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
  p.stun = Math.max(0, p.stun - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  const dir = p.stun > 0 ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

  // Puddles: slippery and slow
  const feetX = p.x + 9;
  const inPuddle = p.grounded && puddles.some((pd) => feetX > pd.x && feetX < pd.x + pd.w);
  const onBoard = p.board > 0;
  const top = onBoard ? BOARD.maxSpeed : PHYS.maxSpeed;
  const maxSpeed = inPuddle ? top * (onBoard ? 0.7 : 0.5) : top;
  if (onBoard) {
    p.board -= dt;
    if (p.board <= 0) loseBoard('time');
  }
  if (inPuddle && Math.abs(p.vx) > 20 && Math.random() < 0.5) splash(feetX, GROUND_Y);

  // Braking hard against your own momentum
  if (!onBoard && p.grounded && dir !== 0 && Math.sign(p.vx) === -dir && Math.abs(p.vx) > 60 && p.skidTime <= 0) {
    p.skidTime = 0.2;
    beep(500, 250, 0.1, 'sawtooth', 0.03);
  }
  p.skidTime = p.grounded ? Math.max(0, p.skidTime - dt) : 0;
  p.skidding = p.skidTime > 0;
  if (p.skidding && Math.random() < 0.6) puff(p.x + 9 + p.facing * 5, p.y + 24, 1);

  // Horizontal speed
  if (dir) {
    const before = Math.abs(p.vx);
    p.vx += dir * (p.grounded ? (onBoard ? BOARD.accel : PHYS.accel) : PHYS.airAccel) * dt;
    // Over the limit: if you were already faster (rolling into a puddle, or just
    // off the board) ease down, otherwise just cap it
    if (Math.abs(p.vx) > maxSpeed) p.vx = Math.sign(p.vx) * Math.max(maxSpeed, Math.min(Math.abs(p.vx), before - 400 * dt));
    p.facing = dir;
  } else if (p.grounded) {
    const f = (p.board > 0 ? BOARD.friction : PHYS.friction) * dt;
    p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
  }

  // Jump with coyote time and input buffering
  p.sinceGround = p.grounded ? 0 : p.sinceGround + dt;
  const wantsJump = jumpPressedAt >= 0 && clock - jumpPressedAt <= PHYS.buffer;
  if (wantsJump && p.sinceGround <= PHYS.coyote && p.stun <= 0) {
    p.vy = -PHYS.jumpSpeed;
    p.grounded = false;
    p.sinceGround = PHYS.coyote + 1;
    jumpPressedAt = -1;
    puff(p.x + 9, p.y + 24, 4);
    if (p.board > 0) Sound.ollie(); else Sound.jump();
  }
  if (p.vy >= 0) p.bounced = false;
  if (!keys.jump && !p.bounced && p.vy < -PHYS.jumpSpeed * PHYS.jumpCut) p.vy = -PHYS.jumpSpeed * PHYS.jumpCut;

  p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.gravity * dt);

  // Move X, then Y, resolving collisions on each axis
  let nx = p.x + p.vx * dt;
  let crashed = false;
  for (const b of solids) {
    if (hits(nx, p.y, b)) {
      nx = p.vx > 0 ? b.x - p.ox - p.w : b.x + b.w - p.ox;
      // Slamming into a box on the skateboard sends the board flying
      if (p.board > 0 && b.h === 16 && Math.abs(p.vx) > 120) crashed = Math.sign(p.vx);
      p.vx = 0;
    }
  }
  p.x = nx;
  if (crashed) {
    loseBoard('crash');
    p.vx = -crashed * 70;
    p.vy = -120;
    p.stun = 0.35;
  }

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
    if (p.board > 0) Sound.boardLand(); else Sound.land(fallSpeed > 250);
    p.landTime = p.board > 0 ? 0 : fallSpeed > 250 ? 0.14 : 0.09;
  }
  // The board only rolls on the street: land on boxes, an awning or a balcony
  // and you step off it there.
  if (p.board > 0 && p.grounded && !wasGrounded && p.y + p.oy + p.h < GROUND_Y - 1) loseBoard('step');
  updateBoards(dt);
  p.landTime = Math.max(0, p.landTime - dt);

  updatePedestrians(dt);
  if (p.y > VIEW_H + 16) fellInPit();

  // Walk cycle advances with distance, so faster steps at full speed
  p.animTime = p.grounded && Math.abs(p.vx) > 5 ? p.animTime + Math.abs(p.vx) * dt : 0;

  // A footstep each time a foot touches down in the walk cycle (poses 0 and 2)
  const pose = p.animTime > 0 ? Math.floor(p.animTime / 7) % 4 : -1;
  if (pose !== p.lastPose && pose % 2 === 0 && !p.skidding && p.board <= 0) Sound.step();
  p.lastPose = pose;

  // Steam from the hot pizza in the backpack
  if (timeLeft > 0 && Math.random() < dt * 3) {
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

// ---------- Hazards ----------

function splash(x, y) {
  dust.push({ x: x + (Math.random() * 6 - 3), y, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 40, life: 0.35, color: '#a9d2ef' });
}

function updatePedestrians(dt) {
  const p = player;
  for (const ped of pedestrians) {
    const floor = ped.floor || GROUND_Y;
    if (!ped.still) {
      ped.x += ped.dir * ped.speed * dt;
      if (ped.x < ped.min) { ped.x = ped.min; ped.dir = 1; }
      if (ped.x > ped.max) { ped.x = ped.max; ped.dir = -1; }
      ped.anim += ped.speed * dt;
    }

    // Body box: 8 wide, 22 tall, standing on the pavement or a balcony
    const bx = ped.x + 2;
    const by = floor - 22;
    const px0 = p.x + p.ox;
    const py1 = p.y + p.oy + p.h;
    // People up on a balcony only count when you are on that balcony (or come down
    // on their head); jumping up through the balcony from below passes them by.
    const fromBelow = floor < GROUND_Y && py1 > floor + 2;
    if (!fromBelow && px0 < bx + 8 && px0 + p.w > bx && py1 > by && p.y + p.oy < floor) {
      if (p.vy > 0 && py1 - p.vy / 60 <= by + 4) {
        // Landed on their head: bounce off
        p.vy = -PHYS.jumpSpeed * 0.8;
        p.bounced = true; // a full bounce, even without holding jump
        p.y = by - p.oy - p.h;
        ped.dir *= -1;
        beep(600, 900, 0.08, 'square', 0.06);
      } else if (p.invuln <= 0) {
        // Bumped into them: knocked back and dazed for a moment
        const away = Math.sign(p.x + 9 - (bx + 4)) || -p.facing;
        p.vx = away * 160;
        p.vy = -150;
        p.grounded = false;
        p.stun = 0.45;
        p.invuln = 1.2;
        beep(220, 110, 0.18, 'square', 0.07);
        toast('ОЙ!');
        if (p.board > 0) loseBoard('crash');
      }
    }
  }
}

// Fell into a hole: back on the pavement just before it, five seconds lost.
function fellInPit() {
  const p = player;
  const pit = pits.find((pt) => p.x + 9 > pt.x - 20 && p.x + 9 < pt.x + pt.w + 20) || pits[0];
  const x = pit.x - 72; // enough run-up to jump it
  // If crates stand there, put the courier on top of them
  const under = crates.filter((c) => x + p.ox < c.x + c.w && x + p.ox + p.w > c.x);
  const groundTop = under.length ? Math.min(...under.map((c) => c.y)) : GROUND_Y;
  Object.assign(p, { x, y: groundTop - 24, vx: 0, vy: 0, facing: 1, landTime: 0, skidTime: 0, stun: 0.3, invuln: 1.2 });
  timeLeft = Math.max(0, timeLeft - 5);
  p.board = 0;
  puff(p.x + 9, p.y + 24, 8);
  beep(500, 120, 0.35, 'square', 0.06);
  toast('−5 СЕКУНД');
}

// ---------- Skateboard ----------

const boards = [];        // pickups: { x, taken }
const flyingBoards = [];  // boards tumbling away after a crash or at the end
function resetBoards() {
  boards.length = 0;
  for (const x of boardSpots) boards.push({ x, taken: false });
  flyingBoards.length = 0;
  player.board = 0;
}

function loseBoard(reason) {
  const p = player;
  if (p.board <= 0 && reason !== 'time') return;
  p.board = 0;
  // Back to walking pace
  p.vx = Math.max(-PHYS.maxSpeed, Math.min(PHYS.maxSpeed, p.vx));
  flyingBoards.push({
    x: p.x + 1, y: p.y + 21, vx: (reason === 'crash' ? -1 : 1) * p.facing * (40 + Math.random() * 40),
    vy: -90 - Math.random() * 60, spin: 0, life: 1.2,
  });
  Sound.boardLose(reason === 'crash');
  if (reason === 'crash') toast('БАХ!');
}

function updateBoards(dt) {
  const p = player;
  if (p.board <= 0 && !finished) {
    for (const b of boards) {
      if (b.taken) continue;
      if (p.x + p.ox < b.x + 16 && p.x + p.ox + p.w > b.x && p.y + p.oy + p.h > GROUND_Y - 8 && p.y + p.oy + p.h <= GROUND_Y + 1) {
        b.taken = true;
        p.board = BOARD.time;
        toast('СКЕЙТ!');
        Sound.boardGet();
        break;
      }
    }
  }
  for (let i = flyingBoards.length - 1; i >= 0; i--) {
    const f = flyingBoards[i];
    f.life -= dt;
    f.vy += 600 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.spin += dt * 14;
    if (f.life <= 0) flyingBoards.splice(i, 1);
  }
  Sound.roll(p.board > 0 && p.grounded ? Math.abs(p.vx) / BOARD.maxSpeed : 0);
}

function drawBoards(cx) {
  for (const b of boards) {
    if (b.taken || b.x < cx - 20 || b.x > cx + VIEW_W + 4) continue;
    const x = Math.round(b.x - cx);
    ctx.drawImage(SKATEBOARD, x, GROUND_Y - 4);
    // A bouncing arrow and a glint so it is easy to spot
    const y = GROUND_Y - 16 - Math.round(Math.abs(Math.sin(clock * 5)) * 3);
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(x + 4, y - 1, 9, 4);
    ctx.fillRect(x + 6, y + 3, 5, 2);
    ctx.fillStyle = '#7dff8a';
    ctx.fillRect(x + 5, y, 7, 2);
    ctx.fillRect(x + 7, y + 2, 3, 2);
    if (Math.floor(clock * 4 + b.x) % 3 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 12, GROUND_Y - 6, 1, 1);
    }
  }
  for (const f of flyingBoards) {
    ctx.save();
    ctx.translate(Math.round(f.x - cx) + 8, Math.round(f.y) + 2);
    ctx.rotate(Math.round(f.spin * 4 / Math.PI) * Math.PI / 4); // in 45° steps, keeps the pixel look
    ctx.drawImage(SKATEBOARD, -8, -2);
    ctx.restore();
  }
}

// Skateboard time left: a little board and a bar under the stage name
function drawBoardTimer() {
  const t = player.board;
  if (t <= 0) return;
  const low = t < 3;
  if (low && Math.floor(clock * 8) % 2) return;
  ctx.fillStyle = 'rgba(26,28,44,0.6)';
  ctx.fillRect(2, 15, 60, 10);
  ctx.drawImage(SKATEBOARD, 4, 18);
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(22, 18, 38, 5);
  ctx.fillStyle = low ? '#ff5a4a' : '#7dff8a';
  ctx.fillRect(23, 19, Math.round(36 * t / BOARD.time), 3);
}

// ---------- Checkpoint ----------

let awayFromBase = false; // set once the courier has walked off, so returning can be announced
let flagCheer = 0;        // seconds left on the flag's celebration

function respawn() {
  puff(player.x + 9, player.y + 24, 8);
  Object.assign(player, { x: CHECKPOINT.x, y: GROUND_Y - 24, vx: 0, vy: 0, facing: 1, landTime: 0, skidTime: 0 });
  awayFromBase = false;
  player.board = 0;
  puff(player.x + 9, player.y + 24, 8);
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

// ---------- Delivery run ----------

const TIME_LIMIT = 300; // five minutes
const RUN_START = CHECKPOINT.x + 9;
let timeLeft = TIME_LIMIT;
let finished = false;
let lastWholeSecond = TIME_LIMIT;
const confetti = [];

const clocks = [];
function resetClocks() {
  clocks.length = 0;
  for (const c of clockSpots) clocks.push({ ...c, taken: false });
}
resetClocks();
resetBoards();
const floaters = []; // little "+5" texts that drift up
let clocksTaken = 0;
let bonusFlash = 0;

function updateClocks(dt) {
  const p = player;
  for (const c of clocks) {
    if (c.taken) continue;
    if (p.x + p.ox < c.x + 5 && p.x + p.ox + p.w > c.x - 5 && p.y + p.oy < c.y + 5 && p.y + p.oy + p.h > c.y - 5) {
      c.taken = true;
      clocksTaken++;
      const bonus = c.gold ? 15 : 5;
      timeLeft += bonus;
      bonusFlash = 0.7;
      floaters.push({ x: c.x, y: c.y - 8, text: `+${bonus}`, life: 0.9, color: c.gold ? '#f7d51d' : '#7dff8a' });
      for (let i = 0; i < 8; i++) {
        dust.push({ x: c.x, y: c.y, vx: Math.cos(i * 0.785) * 50, vy: Math.sin(i * 0.785) * 50, life: 0.3, color: c.gold ? '#f7d51d' : '#f4f4f4' });
      }
      Sound.pickup(c.gold);
    }
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt;
    f.y -= 18 * dt;
    if (f.life <= 0) floaters.splice(i, 1);
  }
  bonusFlash = Math.max(0, bonusFlash - dt);
}

function drawClocks(cx) {
  for (const c of clocks) {
    if (c.taken || c.x < cx - 10 || c.x > cx + VIEW_W + 10) continue;
    const bob = Math.round(Math.sin(clock * 4 + c.x) * 1.5);
    const shake = Math.floor(clock * 20 + c.x) % 8 === 0 ? 1 : 0; // the alarm rattles now and then
    ctx.drawImage(c.gold ? clockGold : clockRed, Math.round(c.x - 4 - cx) + shake, Math.round(c.y - 5) + bob);
    if (Math.floor(clock * 3 + c.x) % 4 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(c.x + 5 - cx), Math.round(c.y - 7) + bob, 1, 1);
    }
  }
  for (const f of floaters) {
    pixelText(ctx, f.text, Math.round(f.x - cx - 4) + 1, Math.round(f.y) + 1, '#1a1c2c');
    pixelText(ctx, f.text, Math.round(f.x - cx - 4), Math.round(f.y), f.color);
  }
}

const timerEl = document.getElementById('timer');
const distEl = document.getElementById('dist');

function distanceLeft() {
  return Math.max(0, DEST.doorX - (player.x + 9));
}

function progress() {
  return Math.max(0, Math.min(1, (player.x + 9 - RUN_START) / (DEST.doorX - RUN_START)));
}

function formatTime(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateRun(dt) {
  if (finished) return;
  timeLeft = Math.max(0, timeLeft - dt);
  Sound.setUrgency(1 - timeLeft / TIME_LIMIT);

  // Clock ticks through the last ten seconds
  const whole = Math.ceil(timeLeft);
  if (whole !== lastWholeSecond) {
    lastWholeSecond = whole;
    if (whole <= 10 && whole > 0) Sound.tick(whole <= 5);
  }

  if (Math.abs(player.x + 9 - DEST.doorX) < 12 && player.y + 24 > GROUND_Y - 40) finish(true);
  else if (timeLeft <= 0) finish(false);
}

function finish(delivered) {
  finished = true;
  player.board = 0;
  keys.left = keys.right = keys.jump = false;
  player.vx = 0;
  Sound.stopMusic();
  const box = document.getElementById('result');
  box.classList.toggle('fail', !delivered);
  if (delivered) {
    Sound.fanfare();
    document.getElementById('result-title').textContent = 'ДОСТАВЛЕНО!';
    document.getElementById('result-text').textContent =
      `Осталось ${formatTime(timeLeft)}. Часиков: ${clocksTaken} из ${clocks.length}. Пицца ещё горячая!`;
    for (let i = 0; i < 40; i++) {
      confetti.push({
        x: DEST.doorX, y: 100, vx: (Math.random() - 0.5) * 160, vy: -80 - Math.random() * 120,
        life: 1.5 + Math.random(), color: ['#f7d51d', '#d23c3c', '#3e9b4f', '#3b5dc9', '#f4f4f4'][i % 5],
      });
    }
  } else {
    Sound.fail();
    document.getElementById('result-title').textContent = 'ВРЕМЯ ВЫШЛО';
    document.getElementById('result-text').textContent =
      `До дома оставалось ${Math.ceil(distanceLeft() / PX_PER_METRE)} м. Часиков: ${clocksTaken} из ${clocks.length}.`;
  }
  setTimeout(() => { if (finished) box.hidden = false; }, delivered ? 900 : 600);
}

function restart() {
  finished = false;
  document.getElementById('result').hidden = true;
  timeLeft = TIME_LIMIT;
  lastWholeSecond = TIME_LIMIT;
  confetti.length = 0;
  // A brand-new street every run
  buildLevel(newSeed());
  street = chunkedLayer(WORLD_W, VIEW_H, paintStreet);
  resetClocks();
  resetBoards();
  clocksTaken = 0;
  floaters.length = 0;
  Object.assign(player, { x: CHECKPOINT.x, y: GROUND_Y - 24, vx: 0, vy: 0, facing: 1, landTime: 0, skidTime: 0 });
  awayFromBase = false;
  camX = 0;
  Sound.startMusic();
  beep(440, 880, 0.12);
}

function updateConfetti(dt) {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.life -= dt;
    c.vy += 220 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (c.life <= 0 || c.y > GROUND_Y) confetti.splice(i, 1);
  }
}

function updateHud() {
  timerEl.textContent = formatTime(timeLeft);
  timerEl.classList.toggle('hurry', timeLeft <= 60 && timeLeft > 30);
  timerEl.classList.toggle('panic', timeLeft <= 30 && !finished);
  timerEl.classList.toggle('bonus', bonusFlash > 0);
  distEl.textContent = `${Math.ceil(distanceLeft() / PX_PER_METRE)} м`;
}

// Fill colour: cold blue far away, through yellow, to hot red at the door.
function heat(p) {
  const stops = [[59, 93, 201], [247, 213, 29], [255, 90, 74]];
  const k = p < 0.5 ? p * 2 : (p - 0.5) * 2;
  const [a, b] = p < 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
}

// Progress line along the bottom: the courier's face rides on it with a smooth
// trail behind him (cold blue → hot red), a dotted path ahead, the house at the end.
const BAR = { x: 10, y: 172, w: 278 };

function drawProgressBar() {
  const p = progress();
  const { x, y, w } = BAR;
  const headW = COURIER_FACE.width;
  const headH = COURIER_FACE.height;
  // Face centre travels from the start to the end of the line
  const fx = x + headW / 2 + p * (w - headW);
  const tail = Math.round(fx - headW / 2 + 3); // the trail stops just inside the back of the head

  // Backing strip
  ctx.fillStyle = 'rgba(26,28,44,0.75)';
  ctx.fillRect(x - 6, y - 8, w + 30, 16);

  // Path still to go: a dotted line
  ctx.fillStyle = '#5d6478';
  for (let px = tail; px < x + w; px += 4) ctx.fillRect(px, y, 2, 1);

  // Trail behind the head, one pixel column at a time so it grows smoothly
  if (tail > x) {
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(x - 1, y - 2, tail - x + 2, 5);
    for (let px = x; px < tail; px++) {
      ctx.fillStyle = heat((px - x) / w);
      ctx.fillRect(px, y - 1, 1, 3);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x, y - 1, tail - x, 1);
  }
  // Start cap: a little pizza slice at the pizzeria end
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(x - 5, y - 3, 5, 7);
  ctx.fillStyle = '#f7d51d';
  ctx.fillRect(x - 4, y - 2, 3, 5);
  ctx.fillStyle = '#d23c3c';
  ctx.fillRect(x - 3, y - 1, 1, 1);

  // House at the end
  const hx = x + w + 5;
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(hx - 1, y - 2, 13, 9);
  ctx.fillRect(hx + 1, y - 6, 9, 4);
  ctx.fillRect(hx + 3, y - 8, 5, 2);
  ctx.fillStyle = '#8e2434';
  ctx.fillRect(hx, y - 2, 11, 2);
  ctx.fillRect(hx + 2, y - 5, 7, 3);
  ctx.fillStyle = '#7cc0c8';
  ctx.fillRect(hx, y, 11, 6);
  ctx.fillStyle = '#3b5dc9';
  ctx.fillRect(hx + 4, y + 2, 3, 4);

  // The head sits on the line, bobbing a pixel while he runs
  const bob = Math.abs(player.vx) > 5 && player.grounded ? Math.floor(clock * 10) % 2 : 0;
  ctx.drawImage(COURIER_FACE, Math.round(fx - headW / 2), Math.round(y - headH / 2) - bob);
}

// Bouncing arrow over the recipient's door
function drawDoorArrow(cx) {
  const x = DEST.doorX - cx;
  if (x < -10 || x > VIEW_W + 10) return;
  const y = 74 + Math.round(Math.abs(Math.sin(clock * 5)) * 4);
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(x - 3, y - 1, 7, 7);
  ctx.fillRect(x - 6, y + 5, 13, 2);
  ctx.fillRect(x - 5, y + 7, 11, 2);
  ctx.fillRect(x - 3, y + 9, 7, 2);
  ctx.fillRect(x - 1, y + 11, 3, 2);
  ctx.fillStyle = '#f7d51d';
  ctx.fillRect(x - 2, y, 5, 6);
  ctx.fillRect(x - 5, y + 6, 11, 1);
  ctx.fillRect(x - 4, y + 7, 9, 2);
  ctx.fillRect(x - 2, y + 9, 5, 2);
  ctx.fillRect(x, y + 11, 1, 1);
}

// ---------- Render ----------

let camX = 0;

function courierFrame() {
  const p = player;
  if (p.board > 0) {
    if (!p.grounded) return COURIER.rideAir;
    const pushing = (keys.left || keys.right) && Math.abs(p.vx) < BOARD.maxSpeed - 10;
    return pushing && Math.floor(clock * 5) % 2 ? COURIER.push : COURIER.ride;
  }
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
  const target = player.x + 9 - VIEW_W / 2 + player.facing * (player.board > 0 ? 64 : 24);
  camX += (target - camX) * 0.1;
  camX = Math.max(0, Math.min(WORLD_W - VIEW_W, camX));
  const cx = Math.round(camX);

  const band = Math.ceil(GROUND_Y / SKY.length);
  SKY.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * band, VIEW_W, band); });
  const cloudOff = -Math.round(camX * 0.1 + clock * 4) % clouds.width;
  for (let x = cloudOff; x < VIEW_W; x += clouds.width) ctx.drawImage(clouds, x, 0);
  tiled(farCity, 0.2);
  tiled(midCity, 0.5);
  drawChunked(street, cx);

  for (const a of awnings) if (a.x + a.w > cx && a.x < cx + VIEW_W) drawAwning(a, cx);
  for (const c of crates) if (c.x + 16 > cx && c.x < cx + VIEW_W) ctx.drawImage(boxImage(c), Math.round(c.x) - cx, c.y);
  drawFlag(cx);
  if (!finished) drawDoorArrow(cx);
  drawClocks(cx);
  drawBoards(cx);

  for (const d of dust) {
    ctx.fillStyle = d.color || '#d6dbe4';
    ctx.fillRect(Math.round(d.x - cx), Math.round(d.y), 2, 2);
  }

  for (const ped of pedestrians) {
    const x = Math.round(ped.x) - cx;
    if (x < -14 || x > VIEW_W + 2) continue;
    const img = PEDESTRIAN[ped.look][ped.still ? 0 : Math.floor(ped.anim / 6) % 2];
    const top = (ped.floor || GROUND_Y) - 22;
    if (ped.dir < 0) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(img, -x - 12, top);
      ctx.restore();
    } else {
      ctx.drawImage(img, x, top);
    }
  }

  // Shadow on the ground under the courier
  ctx.fillStyle = 'rgba(26,28,44,0.35)';
  ctx.fillRect(Math.round(player.x - cx) + 4, GROUND_Y, 10, 2);

  const blinkOut = player.invuln > 0 && Math.floor(clock * 16) % 2;
  const riding = player.board > 0;
  const img = courierFrame();
  const px = Math.round(player.x) - cx;
  const py = Math.round(player.y) - (riding ? 3 : 0);
  if (blinkOut) {
    // skip a frame: blinking after a bump
  } else if (player.facing < 0) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(img, -px - img.width, py);
    ctx.restore();
  } else {
    ctx.drawImage(img, px, py);
  }
  if (riding && !blinkOut) ctx.drawImage(SKATEBOARD, px + 1, py + 23);

  for (const s of steam) {
    ctx.fillStyle = s.life > 0.5 ? 'rgba(244,244,244,0.8)' : 'rgba(244,244,244,0.4)';
    ctx.fillRect(Math.round(s.x - cx), Math.round(s.y), 1, 1);
  }

  for (const c of confetti) {
    ctx.fillStyle = c.color;
    ctx.fillRect(Math.round(c.x - cx), Math.round(c.y), 2, 2);
  }

  drawProgressBar();
  drawBoardTimer();
}

// ---------- Loop and scaling ----------

let last = performance.now();
let acc = 0;

function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    if (started) { update(STEP); updateCheckpoint(STEP); updateRun(STEP); if (!finished) updateClocks(STEP); updateConfetti(STEP); }
    else clock += STEP;
    acc -= STEP;
  }
  render();
  updateHud();
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
