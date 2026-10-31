// Pixel sprites drawn as text grids. Each character is one pixel; see PALETTE.
// The courier faces right; the game mirrors him for left.

const PALETTE = {
  K: '#1a1c2c', // outline
  R: '#d23c3c', // red cap and shirt
  r: '#8e2434', // red shade
  S: '#f4b48c', // skin
  s: '#c78462', // skin shade
  H: '#5a3a22', // hair
  W: '#f4f4f4', // white (cap logo)
  B: '#3b5dc9', // near leg
  b: '#29366f', // far leg, darker so the two legs read apart
  G: '#333c57', // shoes and backpack strap
  Y: '#f7a41d', // pizza backpack
  y: '#c06f12', // backpack shade
  P: '#d23c3c', // backpack logo
};

// Frames are 18 px wide: 2 px on the left for the backpack.
const SPRITE_W = 18;

// Head, rows 0-10.
const HEAD = [
  '................',
  '.....KKKKK......',
  '....KRRRRRK.....',
  '...KRRWRRRRK....',
  '...KRRRRRRRRKK..',
  '...KHrrrrrrrrrK.',
  '...KHSSSSKKKKK..',
  '...KHSSSKSSK....',
  '...KSSSSSSSSK...',
  '....KSSSSSsK....',
  '.....KKsSKK.....',
];
const HEAD_BLINK = HEAD.map((row, i) => (i === 7 ? '...KHSSSsSSK....' : row));

// Torso, rows 11-15, with the backpack strap across the chest and the free arm.
const ARMS = {
  mid: [
    '....KGRRRRK.....',
    '...KRRGRRrK.....',
    '...KRRRGRrK.....',
    '...KRRRRRSK.....',
    '...KrRRRRRK.....',
  ],
  forward: [
    '....KGRRRRK.....',
    '...KRRGRRrK.....',
    '...KRRRGRRrK....',
    '...KRRRRRKSK....',
    '...KrRRRRRK.....',
  ],
  back: [
    '....KGRRRRK.....',
    '...KRRGrRRK.....',
    '...KRRrGRRK.....',
    '...KRSRRRRK.....',
    '...KrRRRRRK.....',
  ],
};

// Insulated pizza backpack, columns 0-5 of rows 7-15. It sits behind the courier.
const BAG = [
  'KKKKKK',
  'KYYYYK',
  'KYPPYK',
  'KYPPYK',
  'KYYYYK',
  'KYYYYK',
  'KyyyyK',
  'KyyyyK',
  'KKKKKK',
];

function buildTop(head, arms, lean = 0) {
  const rows = [...head, ...arms].map((row) => '..' + row);
  BAG.forEach((bagRow, i) => {
    const r = rows[i + 7];
    let out = '';
    for (let x = 0; x < SPRITE_W; x++) {
      const behind = x < bagRow.length ? bagRow[x] : '.';
      out += r[x] !== '.' && x >= 5 ? r[x] : behind !== '.' ? behind : r[x];
    }
    rows[i + 7] = out;
  });
  return lean ? rows.map((row) => '.'.repeat(lean) + row.slice(0, SPRITE_W - lean)) : rows;
}

const TOP = buildTop(HEAD, ARMS.mid);

// Legs, 16x8, drawn under the upper body.
const LEGS = {
  stand: [
    '....KBBBBBK.....',
    '....KbbBBBK.....',
    '....KbbKBBK.....',
    '....KbbKBBK.....',
    '....KbbKBBK.....',
    '....KbbKBBK.....',
    '...KGGGKGGGK....',
    '...KKKKKKKKK....',
  ],
  // Walk cycle: near leg forward, near leg planted, far leg forward, far leg planted.
  contactA: [
    '....KBBBBBK.....',
    '...KbbBBBBBK....',
    '...KbbKKBBBK....',
    '..KbbK..KBBBK...',
    '..KbbK...KBBK...',
    '.KbbK.....KBBK..',
    '.KGGK.....KGGGK.',
    '.KKKK.....KKKKK.',
  ],
  passA: [
    '....KBBBBBK.....',
    '....KbbBBBK.....',
    '....KbbbBBK.....',
    '.....KbbKBBK....',
    '....KGGKKBBK....',
    '....KKK.KBBK....',
    '.......KGGGK....',
    '.......KKKKK....',
  ],
  contactB: [
    '....KBBBBBK.....',
    '...KBBBBbbbK....',
    '...KBBBKKbbK....',
    '..KBBBK..KbbK...',
    '..KBBK....KbbK..',
    '.KBBK.....KbbK..',
    '.KGGK.....KGGGK.',
    '.KKKK.....KKKKK.',
  ],
  passB: [
    '....KBBBBBK.....',
    '....KBBBbbK.....',
    '....KBBBbbK.....',
    '.....KBBKbbK....',
    '....KGGKKbbK....',
    '....KKK.KbbK....',
    '.......KGGGK....',
    '.......KKKKK....',
  ],
  rise: [
    '....KBBBBBK.....',
    '...KbbBBBBBK....',
    '..KbbbKKKBBBK...',
    '..KbbK...KBBK...',
    '..KbbK....KBBK..',
    '..KGGGK...KGGGK.',
    '..KKKKK...KKKKK.',
    '................',
  ],
  fall: [
    '....KBBBBBK.....',
    '....KbbBBBK.....',
    '...KbbKKBBK.....',
    '...KbbK.KBBK....',
    '...KbbK..KBBK...',
    '...KGGK..KGGGK..',
    '...KKKK..KKKKK..',
    '................',
  ],
  // On the skateboard: knees bent, both feet on the deck
  ride: [
    '....KBBBBBK.....',
    '...KbbBBBBBK....',
    '..KbbbKKKBBBK...',
    '..KbbK...KBBK...',
    '..KbbK...KBBK...',
    '.KGGGK...KGGGK..',
    '.KKKKK...KKKKK..',
    '................',
  ],
  // Pushing off: the back foot kicks the ground behind the board
  push: [
    '....KBBBBBK.....',
    '...KbbBBBBK.....',
    '..KbbKKBBBK.....',
    '.KbbK..KBBK.....',
    '.KbbK..KBBK.....',
    'KbbK..KGGGK.....',
    'KGGK..KKKKK.....',
    'KKKK............',
  ],
  crouch: [
    '................',
    '................',
    '...KbBBBBBBK....',
    '..KbbBKKKBBBK...',
    '..KbbK...KBBK...',
    '..KbbK...KBBK...',
    '.KGGGK...KGGGK..',
    '.KKKKK...KKKKK..',
  ],
  skid: [
    '....KBBBBBK.....',
    '....KbbBBBBK....',
    '....KbbKKBBBK...',
    '...KbbK..KBBK...',
    '...KbbK...KBBK..',
    '..KbbK.....KBBK.',
    '.KGGGK.....KGGGK',
    '.KKKKK.....KKKKK',
  ],
};

function paint(g, rows, oy) {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = PALETTE[ch];
      g.fillRect(x, y + oy, 1, 1);
    });
  });
}

// One 16x24 frame: legs at the bottom, upper body lowered by `bob` pixels.
function frame(top, legs, bob = 0) {
  const c = document.createElement('canvas');
  c.width = SPRITE_W;
  c.height = 24;
  const g = c.getContext('2d');
  paint(g, legs.map((row) => '..' + row), 16);
  paint(g, top, bob);
  return c;
}

const COURIER = {
  idle: frame(TOP, LEGS.stand),
  breathe: frame(TOP, LEGS.stand, 1),
  blink: frame(buildTop(HEAD_BLINK, ARMS.mid), LEGS.stand),
  // Body dips on the wide steps and rises as the legs pass; the arm swings
  // opposite to the near leg.
  walk: [
    frame(buildTop(HEAD, ARMS.back), LEGS.contactA, 1),
    frame(TOP, LEGS.passA),
    frame(buildTop(HEAD, ARMS.forward), LEGS.contactB, 1),
    frame(TOP, LEGS.passB),
  ],
  rise: frame(buildTop(HEAD, ARMS.forward), LEGS.rise),
  fall: frame(buildTop(HEAD, ARMS.back), LEGS.fall),
  land: frame(TOP, LEGS.crouch, 2),
  skid: frame(buildTop(HEAD, ARMS.forward, 1), LEGS.skid),
  ride: frame(buildTop(HEAD, ARMS.back), LEGS.ride, 1),
  rideAir: frame(buildTop(HEAD, ARMS.forward), LEGS.ride),
  push: frame(buildTop(HEAD, ARMS.forward), LEGS.push),
};

// Skateboard, 16x4: red deck, black grip edge, yellow wheels.
const SKATEBOARD = (() => {
  const rows = [
    '.KKKKKKKKKKKKKK.',
    'KRRRRRRRRRRRRRRK',
    '.KKKKKKKKKKKKKK.',
    '..KYK......KYK..',
  ];
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 4;
  const g = c.getContext('2d');
  const colors = { K: '#1a1c2c', R: '#d23c3c', Y: '#f7d51d' };
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = colors[ch];
    g.fillRect(x, y, 1, 1);
  }));
  return c;
})();
// ---------- Pedestrians ----------
// 12x22, facing right. Letters: K outline, S skin, H hair, C coat, c coat shade,
// L legs, F shoes. Each look swaps the colours.
const PED_TOP = [
  '....KKKK....',
  '...KHHHHK...',
  '..KHHHHHHK..',
  '..KHSSSSSK..',
  '..KHSKSSSK..',
  '..KSSSSSSK..',
  '...KSSSSK...',
  '...KKSSKK...',
  '..KCCCCCCK..',
  '.KCCCCCCCCK.',
  '.KCcCCCCCcK.',
  '.KCcCCCCCcK.',
  '.KScCCCCCSK.',
  '..KCCCCCCK..',
];
const PED_LEGS = [
  [
    '...KLLLLK...',
    '...KLLKLK...',
    '...KLLKLK...',
    '...KLLKLK...',
    '...KLLKLK...',
    '...KLLKLK...',
    '..KFFKKFFK..',
    '..KKKK.KKK..',
  ],
  [
    '...KLLLLK...',
    '..KLLKKLLK..',
    '..KLK..KLK..',
    '.KLLK..KLLK.',
    '.KLK....KLK.',
    '.KLK....KLK.',
    'KFFK....KFFK',
    'KKKK....KKKK',
  ],
];
const PED_LOOKS = [
  { H: '#2b1d14', C: '#3e9b4f', c: '#2c7039', L: '#333c57', F: '#1a1c2c' },
  { H: '#d9a441', C: '#9a6fa5', c: '#77517f', L: '#5d6478', F: '#5a3a22' },
  { H: '#8e8e9a', C: '#c77d4e', c: '#9e5e37', L: '#29366f', F: '#1a1c2c' },
  { H: '#5a3a22', C: '#f4f4f4', c: '#c1c7d4', L: '#1a1c2c', F: '#d23c3c' },
];

function pedFrame(legs, look) {
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = 22;
  const g = c.getContext('2d');
  [...PED_TOP, ...legs].forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = look[ch] || PALETTE[ch];
      g.fillRect(x, y, 1, 1);
    });
  });
  return c;
}

// PEDESTRIAN[look][frame]
const PEDESTRIAN = PED_LOOKS.map((look) => PED_LEGS.map((legs) => pedFrame(legs, look)));

// The courier's face for the progress bar: the head, cropped.
const COURIER_FACE = (() => {
  const rows = HEAD.slice(1).map((r) => r.slice(2, 16));
  const c = document.createElement('canvas');
  c.width = 14;
  c.height = rows.length;
  paint(c.getContext('2d'), rows, 0);
  return c;
})();
