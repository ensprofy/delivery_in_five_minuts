// Pixel sprites drawn as text grids. Each character is one pixel; see PALETTE.
// Sprites face right; the game mirrors them for left.

const PALETTE = {
  K: '#1a1c2c', // outline
  R: '#d23c3c', // red cap and shirt
  r: '#8e2434', // red shade
  S: '#f4b48c', // skin
  s: '#c78462', // skin shade
  H: '#5a3a22', // hair
  W: '#f4f4f4', // white (cap logo, eye shine)
  B: '#3b5dc9', // jeans
  b: '#29366f', // jeans shade
  G: '#333c57', // shoes
  Y: '#e2a95c', // pizza box
  y: '#a8703c', // pizza box shade
  P: '#f7d51d', // box logo
};

// Upper body: rows 0-15 of a 16x24 courier, holding a pizza box.
const COURIER_TOP = [
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

// Legs: rows 16-23, one set per pose.
const LEGS = {
  stand: [
    '....KBBBBBK.....',
    '....KBBBBBK.....',
    '....KBBKBBK.....',
    '....KBBKBBK.....',
    '....KBBKBBK.....',
    '....KbbKbbK.....',
    '...KGGGKGGGK....',
    '...KKKKKKKKK....',
  ],
  stride: [
    '....KBBBBBK.....',
    '....KBBBBBBK....',
    '...KBBBKKBBBK...',
    '...KBBK..KBBK...',
    '..KBBK....KBBK..',
    '..KbbK....KbbK..',
    '.KGGGK....KGGGK.',
    '.KKKKK....KKKKK.',
  ],
  pass: [
    '....KBBBBBK.....',
    '....KBBBBBK.....',
    '....KBBBBK......',
    '....KBBBBK......',
    '....KBBKBBK.....',
    '....KbbKbbK.....',
    '....KGGKGGGK....',
    '....KKKKKKKK....',
  ],
  jump: [
    '....KBBBBBK.....',
    '...KBBBBBBBK....',
    '..KBBBKKKBBBK...',
    '..KBBK...KBBK...',
    '..KbbK....KbbK..',
    '..KGGGK...KGGGK.',
    '..KKKKK...KKKKK.',
    '................',
  ],
};

function makeSprite(rows) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = PALETTE[ch];
      g.fillRect(x, y, 1, 1);
    });
  });
  return c;
}

// Frames by name. "walk" cycles stride → pass → stride → pass with a bob.
const COURIER = {
  idle: makeSprite([...COURIER_TOP, ...LEGS.stand]),
  stride: makeSprite([...COURIER_TOP, ...LEGS.stride]),
  pass: makeSprite([...COURIER_TOP, ...LEGS.pass]),
  jump: makeSprite([...COURIER_TOP, ...LEGS.jump]),
};
