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

  const BPM = 140;
  const EIGHTH = 60 / BPM / 2;

  // Melody in eighth notes: a note name starts a note, '-' holds it, '.' is a rest.
  const LEAD = [
    'E5 . G5 E5 C5 . D5 E5', 'A4 . C5 E5 D5 C5 A4 .',
    'F4 A4 C5 F5 E5 - C5 .', 'D5 - B4 G4 B4 D5 G5 -',
    'E5 . G5 E5 C5 . D5 E5', 'A5 - G5 E5 C5 D5 E5 .',
    'F5 E5 D5 C5 A4 C5 D5 .', 'B4 - D5 - G5 - - .',
    'A4 C5 F5 . A5 G5 F5 .', 'G5 F5 D5 . B4 D5 G5 .',
    'G5 - E5 - B4 - E5 G5', 'A5 - E5 C5 A4 . C5 E5',
    'F5 . A5 . G5 F5 E5 D5', 'D5 E5 F5 G5 - . B4 D5',
    'C6 - G5 E5 G5 - E5 C5', 'C5 . G4 . C5 - - .',
  ].join(' ').split(' ');

  // One chord root per bar; the bass bounces between root and octave.
  const ROOTS = ['C3', 'A2', 'F2', 'G2', 'C3', 'A2', 'F2', 'G2',
                 'F2', 'G2', 'E2', 'A2', 'F2', 'G2', 'C3', 'C3'];

  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(name) {
    const m = /^([A-G])(#?)(\d)$/.exec(name);
    const midi = 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] ? 1 : 0);
    return 440 * 2 ** ((midi - 69) / 12);
  }

  // Length of each lead note in eighths, counting the holds after it
  function noteLength(i) {
    let n = 1;
    while (LEAD[(i + n) % LEAD.length] === '-') n++;
    return n;
  }

  let musicTimer = null;
  let nextTime = 0;
  let stepIndex = 0;

  function playStep(i, t) {
    const lead = LEAD[i];
    if (lead !== '.' && lead !== '-') {
      osc('pulse', freq(lead), t, noteLength(i) * EIGHTH * 0.95, 0.09, musicBus);
    }
    const bar = Math.floor(i / 8);
    const beat = i % 8;
    const root = freq(ROOTS[bar]) * 2; // up an octave so small speakers can play it
    osc('triangle', beat % 2 ? root * 2 : root, t, EIGHTH * 0.9, 0.2, musicBus);

    if (beat === 0 || beat === 4) osc('square', 220, t, 0.08, 0.08, musicBus, 60);     // kick
    if (beat === 2 || beat === 6) hiss(t, 0.1, 0.3, musicBus, 'bandpass', 2200);     // snare
    hiss(t + EIGHTH / 2, 0.03, 0.12, musicBus, 'highpass', 6000);                    // hi-hat
  }

  // Schedules notes a little ahead of time, so the beat stays steady even if a frame is slow.
  function schedule() {
    while (nextTime < ctx.currentTime + 0.15) {
      playStep(stepIndex, nextTime);
      stepIndex = (stepIndex + 1) % LEAD.length;
      nextTime += EIGHTH;
    }
  }

  function startMusic() {
    if (!init() || musicTimer) return;
    if (ctx.state === 'suspended') ctx.resume();
    nextTime = ctx.currentTime + 0.1;
    stepIndex = 0;
    musicTimer = setInterval(schedule, 25);
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
    beep, step, jump, land, startMusic,
    toggleMute() { setMuted(!muted); return !muted; },
    toggleMusic() { setMusic(!musicOn); return musicOn; },
  };
})();

const beep = Sound.beep;
