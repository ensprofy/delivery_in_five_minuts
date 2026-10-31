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
  G: '#333c57', // shoes
  Y: '#e2a95c', // pizza box
  y: '#a8703c', // pizza box shade
  P: '#f7d51d', // box logo
};

// Upper body, 16x16, holding the pizza box.
const TOP = [
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
  '....KRRRRKKKKKKK',
  '...KRRRRRKYYPYYK',
  '...KRRRRSKyyyyyK',
  '...KrRRRRKKKKKKK',
  '...KrRRRRRK.....',
];

// Same, with the eye closed.
const TOP_BLINK = TOP.map((row, i) => (i === 7 ? '...KHSSSsSSK....' : row));

// Same, leaning back while braking.
const TOP_SKID = TOP.map((row) => '.' + row.slice(0, 15));

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
  c.width = 16;
  c.height = 24;
  const g = c.getContext('2d');
  paint(g, legs, 16);
  paint(g, top, bob);
  return c;
}

const COURIER = {
  idle: frame(TOP, LEGS.stand),
  breathe: frame(TOP, LEGS.stand, 1),
  blink: frame(TOP_BLINK, LEGS.stand),
  // Body dips on the wide steps and rises as the legs pass.
  walk: [
    frame(TOP, LEGS.contactA, 1),
    frame(TOP, LEGS.passA),
    frame(TOP, LEGS.contactB, 1),
    frame(TOP, LEGS.passB),
  ],
  rise: frame(TOP, LEGS.rise),
  fall: frame(TOP, LEGS.fall),
  land: frame(TOP, LEGS.crouch, 2),
  skid: frame(TOP_SKID, LEGS.skid),
};
