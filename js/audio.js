// Chiptune sound: sound effects and a looping background tune, all synthesised
// with Web Audio, so there are no sound files to load.

const Sound = (() => {
  let ctx = null;
  let master, sfxBus, musicBus;
  let noise = null;
  let pulse25 = null;
  let muted = false;
  let musicOn = true;
  const MUSIC_VOL = 0.9;

  function init() {
    if (ctx) return true;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
    if (ctx.state === 'suspended') ctx.resume();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? MUSIC_VOL : 0;
    musicBus.connect(master);

    // One second of white noise, reused for steps and drums
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // 25% pulse wave: the thin, classic NES lead sound
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    pulse25 = ctx.createPeriodicWave(real, imag);
    return true;
  }

  function osc(type, freq, t, dur, vol, bus, slideTo) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (type === 'pulse') o.setPeriodicWave(pulse25); else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function hiss(t, dur, vol, bus, filterType, freq) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t, Math.random() * 0.8);
    s.stop(t + dur + 0.02);
  }

  // ---------- Sound effects ----------

  function beep(from, to, dur, type = 'square', vol = 0.06) {
    if (!init() || muted) return;
    osc(type, from, ctx.currentTime, dur, vol, sfxBus, to);
  }

  let stepFoot = 0;
  function step() {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    stepFoot ^= 1;
    // A soft scuff of noise plus a tiny low knock; the two feet differ slightly.
    hiss(t, 0.06, 0.6, sfxBus, 'bandpass', stepFoot ? 2600 : 2100);
    osc('square', stepFoot ? 420 : 360, t, 0.035, 0.08, sfxBus, 180);
  }

  function jump() {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    const base = 240 + Math.random() * 20;
    osc('pulse', base, t, 0.18, 0.07, sfxBus, base * 3);
    osc('triangle', base / 2, t, 0.12, 0.08, sfxBus, base * 1.5);
    hiss(t, 0.04, 0.06, sfxBus, 'highpass', 2500);
  }

  function land(hard) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    osc('square', hard ? 300 : 260, t, 0.08, 0.06, sfxBus, 90);
    hiss(t, hard ? 0.1 : 0.07, hard ? 0.4 : 0.28, sfxBus, 'bandpass', 1600);
  }

  // ---------- Music ----------

  // A tense chase in A minor. The tempo follows the delivery timer: it starts
  // at START_BPM and climbs to MAX_BPM as the five minutes run out.
  const START_BPM = 160;
  const MAX_BPM = 196;
  let bpm = START_BPM;
  const sixteenth = () => 60 / bpm / 4;

  // Melody in eighth notes: a note name starts a note, '-' holds it, '.' is a rest.
  // Repeated stabs, G# leading notes, and a chromatic run that throws you back to the top.
  const LEAD = [
    'E5 E5 . E5 F5 E5 D5 C5', 'B4 C5 D5 E5 - . A4 .',
    'F5 F5 . F5 G5 F5 E5 D5', 'E5 - G#4 B4 E5 - D5 B4',
    'E5 E5 . E5 F5 E5 D5 C5', 'A5 G#5 A5 B5 C6 - B5 A5',
    'F5 E5 D5 F5 A5 - F5 D5', 'G#5 - E5 - B4 - G#4 B4',
    'D5 . F5 . A5 G#5 A5 .', 'C6 . B5 . A5 E5 C5 .',
    'D5 . F5 . A5 G#5 A5 B5', 'C6 B5 A5 G#5 F5 E5 D5 B4',
    'A4 C5 F5 A5 G5 F5 E5 F5', 'G5 F5 E5 D5 B4 D5 G5 B5',
    'G#5 B5 E6 - D6 B5 G#5 E5', 'E5 F5 F#5 G5 G#5 A5 A#5 B5',
  ].join(' ').split(' ');

  // Chord per bar: root note and whether it is minor.
  const CHORDS = [
    ['A2', 1], ['A2', 1], ['F2', 0], ['E2', 0], ['A2', 1], ['A2', 1], ['D2', 1], ['E2', 0],
    ['D2', 1], ['A2', 1], ['D2', 1], ['E2', 0], ['F2', 0], ['G2', 0], ['E2', 0], ['E2', 0],
  ];
  const STEPS = CHORDS.length * 16; // sixteenth notes in the loop

  const BASS = [0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 0, 12, 0, 12]; // pumping octaves

  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(name) {
    const m = /^([A-G])(#?)(\d)$/.exec(name);
    const midi = 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] ? 1 : 0);
    return 440 * 2 ** ((midi - 69) / 12);
  }
  const shift = (f, semis) => f * 2 ** (semis / 12);

  // Length of each lead note in eighths, counting the holds after it
  function noteLength(i) {
    let n = 1;
    while (LEAD[(i + n) % LEAD.length] === '-') n++;
    return n;
  }

  let musicTimer = null;
  let nextTime = 0;
  let stepIndex = 0;

  function playStep(s, t) {
    const sx = sixteenth();
    const bar = Math.floor(s / 16);
    const pos = s % 16;
    const [rootName, minor] = CHORDS[bar];
    const root = freq(rootName) * 2; // up an octave so small speakers can play it

    // Lead, one token per eighth
    if (pos % 2 === 0) {
      const i = s / 2;
      const lead = LEAD[i];
      if (lead !== '.' && lead !== '-') {
        osc('pulse', freq(lead), t, noteLength(i) * sx * 2 * 0.9, 0.085, musicBus);
      }
    }

    // Bass: short pumping sixteenths
    osc('triangle', shift(root, BASS[pos]), t, sx * 0.8, 0.2, musicBus);

    // Quiet fast arpeggio of the chord, two octaves up: busy, restless
    const arp = [0, minor ? 3 : 4, 7, 12][pos % 4];
    osc('square', shift(root * 4, arp), t, sx * 0.6, 0.018, musicBus);

    // Drums: kick on every beat, snare on 2 and 4, hi-hat on every sixteenth
    if (pos % 4 === 0) osc('square', 220, t, 0.07, 0.09, musicBus, 55);
    if (pos === 4 || pos === 12) hiss(t, 0.09, 0.32, musicBus, 'bandpass', 2300);
    hiss(t, 0.02, pos % 2 ? 0.07 : 0.12, musicBus, 'highpass', 7000);

    // Clock ticking on the off-beats: tick ... tock ...
    if (pos % 4 === 2) osc('triangle', pos % 8 === 2 ? 2600 : 2000, t, 0.025, 0.06, musicBus);

    // Last bar: a rising siren into the next loop
    if (bar === CHORDS.length - 1 && pos === 0) {
      osc('square', 440, t, sx * 15, 0.025, musicBus, 1760);
    }
  }

  // Schedules notes a little ahead of time, so the beat stays steady even if a frame is slow.
  function schedule() {
    while (nextTime < ctx.currentTime + 0.15) {
      playStep(stepIndex, nextTime);
      nextTime += sixteenth();
      stepIndex++;
      if (stepIndex === STEPS) stepIndex = 0;
    }
  }

  function startMusic() {
    if (!init() || musicTimer) return;
    if (ctx.state === 'suspended') ctx.resume();
    nextTime = ctx.currentTime + 0.1;
    stepIndex = 0;
    bpm = START_BPM;
    musicTimer = setInterval(schedule, 25);
  }

  function stopMusic() {
    clearInterval(musicTimer);
    musicTimer = null;
  }

  // 0 = plenty of time, 1 = time is up
  function setUrgency(f) {
    bpm = START_BPM + (MAX_BPM - START_BPM) * Math.max(0, Math.min(1, f));
  }

  // ---------- Jingles ----------

  // A loud clock tick for the last seconds; higher for the final five.
  function tick(final) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    osc('square', final ? 1760 : 1320, t, 0.06, 0.07, sfxBus);
    hiss(t, 0.03, 0.2, sfxBus, 'highpass', 5000);
  }

  function playNotes(notes, gap, type, vol) {
    if (!init() || muted) return;
    const t = ctx.currentTime + 0.05;
    notes.forEach((n, i) => {
      if (n === '.') return;
      osc(type, freq(n), t + i * gap, gap * 1.6, vol, sfxBus);
    });
  }

  // Picking up a clock: a quick bright arpeggio, longer for a golden one.
  function pickup(gold) {
    playNotes(gold ? ['E6', 'G6', 'C7', 'E7'] : ['A5', 'C#6', 'E6'], 0.05, 'pulse', 0.07);
  }

  // ---------- Skateboard ----------

  // Wheels on the pavement: looping noise whose loudness follows the speed.
  let rollGain = null;
  function roll(level) {
    if (!ctx || (level <= 0 && !rollGain)) return;
    if (!rollGain) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 700;
      band.Q.value = 0.8;
      rollGain = ctx.createGain();
      rollGain.gain.value = 0;
      src.connect(band).connect(rollGain).connect(sfxBus);
      src.start();
    }
    rollGain.gain.setTargetAtTime(muted ? 0 : Math.min(1, level) * 0.22, ctx.currentTime, 0.05);
  }

  // Ollie: the tail snaps the pavement, then the board pops up.
  function ollie() {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    hiss(t, 0.03, 0.5, sfxBus, 'highpass', 3000);
    osc('square', 180, t, 0.05, 0.08, sfxBus, 90);
    osc('pulse', 300, t + 0.02, 0.14, 0.05, sfxBus, 800);
  }

  function boardLand() {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    hiss(t, 0.06, 0.45, sfxBus, 'bandpass', 1800);
    osc('square', 140, t, 0.06, 0.07, sfxBus, 70);
  }

  function boardGet() {
    playNotes(['C5', 'E5', 'G5', 'B5', 'D6'], 0.045, 'pulse', 0.07);
  }

  // The board clatters away; a crash sounds harsher.
  function boardLose(crash) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) hiss(t + i * 0.07, 0.05, crash ? 0.5 : 0.3, sfxBus, 'bandpass', 1500 - i * 300);
    osc('square', crash ? 260 : 400, t, 0.2, 0.06, sfxBus, crash ? 80 : 200);
  }

  function fanfare() {
    playNotes(['C5', 'E5', 'G5', 'C6', '.', 'G5', 'C6', '.', '.', 'E6'], 0.11, 'pulse', 0.09);
    playNotes(['C4', '.', 'G4', '.', 'C5', '.', 'E4', '.', 'C4'], 0.11, 'triangle', 0.18);
  }

  function fail() {
    playNotes(['E5', 'D#5', 'D5', 'C#5', '.', 'C5'], 0.22, 'pulse', 0.08);
    playNotes(['A3', '.', 'G#3', '.', 'G3', '.', 'F#3'], 0.22, 'triangle', 0.16);
  }

  // ---------- Switches ----------

  function setMuted(m) {
    muted = m;
    if (ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
  }

  function setMusic(on) {
    musicOn = on;
    if (ctx) musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ctx.currentTime, 0.05);
  }

  // Pause everything while the tab is in the background
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  return {
    beep, step, jump, land, startMusic, stopMusic, setUrgency, tick, pickup, fanfare, fail,
    roll, ollie, boardLand, boardGet, boardLose,
    toggleMute() { setMuted(!muted); return !muted; },
    toggleMusic() { setMusic(!musicOn); return musicOn; },
  };
})();

const beep = Sound.beep;
