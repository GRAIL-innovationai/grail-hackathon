/* ============================================================
   Mathub — focus sounds and personal music
   A floating bubble in the bottom-right corner that opens into a
   panel with two tabs.
   Focus sounds: background soundscapes synthesised with the Web
   Audio API (no audio files): rain, thunderstorm, ocean, wind,
   fireplace, forest, summer night, coffee shop, lo-fi beats, soft
   piano, ambient drone and white/pink/brown noise. Each has its own
   volume, sounds layer, there is a master volume, a sleep timer and
   a convolution reverb; the mix is remembered.
   My music: up to 10 MP3s (8 minutes each) that the student adds
   from their own device. Files are stored in the browser's
   IndexedDB, never uploaded, and keep playing while moving around
   Mathub. Play/pause, previous/next, shuffle, repeat, seek, volume,
   reorder and remove, with Media Session keys on phones.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, settings, setSetting, toast } = App;

  /* ---------- catalog ---------- */
  const SOUNDS = [
    { id: 'rain', name: 'Rain', ic: 'rain', desc: 'Steady rain with drops on the window' },
    { id: 'storm', name: 'Thunderstorm', ic: 'zap', desc: 'Rain with rolling thunder' },
    { id: 'ocean', name: 'Ocean waves', ic: 'wave', desc: 'Slow waves building and washing out' },
    { id: 'wind', name: 'Wind', ic: 'wind', desc: 'Gusts across an open field' },
    { id: 'fire', name: 'Fireplace', ic: 'fire', desc: 'Crackle, pops and a warm roar' },
    { id: 'forest', name: 'Forest', ic: 'leaf', desc: 'Birdsong and rustling leaves' },
    { id: 'night', name: 'Summer night', ic: 'moon', desc: 'Crickets, an owl, still air' },
    { id: 'cafe', name: 'Coffee shop', ic: 'cup', desc: 'Murmur, cups and a keyboard' },
    { id: 'lofi', name: 'Lo-fi beats', ic: 'music', desc: 'Warm chords over a dusty beat' },
    { id: 'piano', name: 'Soft piano', ic: 'piano', desc: 'Slow generative piano' },
    { id: 'drone', name: 'Ambient drone', ic: 'wave', desc: 'A slowly shifting pad' },
    { id: 'brown', name: 'Brown noise', ic: 'sliders', desc: 'Deep, smooth hush' },
    { id: 'pink', name: 'Pink noise', ic: 'sliders', desc: 'Balanced hush' },
    { id: 'white', name: 'White noise', ic: 'sliders', desc: 'Bright hush' }
  ];
  const EXTRA_ICONS = {
    rain: '<path d="M7 16a4 4 0 0 1-.5-8 6 6 0 0 1 11.3 1.5A3.5 3.5 0 0 1 17 16"/><path d="M8 19v2M12 18v3M16 19v2"/>',
    wave: '<path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h8a2 2 0 1 1-2 2"/>',
    leaf: '<path d="M4 20c0-9 6-15 16-16-1 10-7 16-16 16z"/><path d="M4 20c4-6 8-9 12-11"/>',
    cup: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2M7 3v2M11 3v2"/>',
    music: '<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    piano: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v10M12 4v10M16 4v10M3 14h18"/>',
    headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
    repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    prev: '<path d="M19 20 9 12l10-8z"/><path d="M5 19V5"/>',
    next: '<path d="M5 4l10 8-10 8z"/><path d="M19 5v14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  const ic = (name, size = 18) => EXTRA_ICONS[name] ? `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EXTRA_ICONS[name]}</svg>` : icon(name, size);

  /* ---------- state ---------- */
  const A = { ctx: null, master: null, reverbIn: null, bufs: {}, nodes: {}, timers: {}, open: false, tab: null, sleepAt: 0, sleepTimer: 0, el: null };
  const saved = () => Object.assign({ mix: {}, master: 0.7, tab: 'sounds', music: {} }, settings().ambient || {});
  const persist = patch => setSetting('ambient', Object.assign(saved(), patch));
  const activeIds = () => Object.keys(A.nodes);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const midi = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- audio helpers ---------- */
  function ctx() {
    if (!A.ctx) {
      const C = global.AudioContext || global.webkitAudioContext; if (!C) return null; A.ctx = new C(); const c = A.ctx;
      A.master = c.createGain(); A.master.gain.value = saved().master; const lim = c.createDynamicsCompressor(); lim.threshold.value = -10; lim.knee.value = 12; lim.ratio.value = 6; lim.attack.value = 0.005; lim.release.value = 0.25; A.master.connect(lim).connect(c.destination);
      A.reverbIn = c.createGain(); const conv = c.createConvolver(); conv.buffer = impulse(c, 2.4); A.reverbIn.connect(conv).connect(A.master);
    }
    if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
    return A.ctx;
  }
  function impulse(c, secs) { const len = Math.floor(c.sampleRate * secs); const buf = c.createBuffer(2, len, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * Math.min(1, i / 300); } return buf; }
  function noiseBuffer(c, kind) {
    if (A.bufs[kind]) return A.bufs[kind];
    const len = c.sampleRate * 4; const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (kind === 'white') d[i] = w * 0.5; else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } } }
    A.bufs[kind] = buf; return buf;
  }
  function noise(c, kind) { const s = c.createBufferSource(); s.buffer = noiseBuffer(c, kind); s.loop = true; s.start(0, Math.random() * 3); return s; }
  function filt(c, type, f, q) { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q) n.Q.value = q; return n; }
  function gain(c, v) { const g = c.createGain(); g.gain.value = v; return g; }
  function pan(c, x) { if (!c.createStereoPanner) return gain(c, 1); const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, x)); return p; }
  function lfo(c, hz, depth, target, base, type = 'sine') { const o = c.createOscillator(); o.type = type; o.frequency.value = hz; const g = c.createGain(); g.gain.value = depth; o.connect(g).connect(target); if (base !== undefined) target.value = base; o.start(); return o; }
  function shaper(c, k = 1.5) { const ws = c.createWaveShaper(); const n = 512; const curve = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); } ws.curve = curve; ws.oversample = '2x'; return ws; }
  function later(id, ms, fn) { const set = A.timers[id] || (A.timers[id] = new Set()); const h = setTimeout(() => { set.delete(h); if (A.nodes[id]) fn(); }, ms); set.add(h); return h; }
  function every(id, minMs, maxMs, fn) { const tick = () => { if (!A.nodes[id]) return; fn(); later(id, rnd(minMs, maxMs), tick); }; later(id, rnd(minMs, maxMs), tick); }
  function clearTimers(id) { const set = A.timers[id]; if (set) { set.forEach(clearTimeout); set.clear(); } delete A.timers[id]; }
  /* short event: filtered noise or tone with an envelope, optional pan, pitch glide and reverb send */
  function burst(c, out, o) {
    const t = o.at || c.currentTime; const g = c.createGain(); const a = o.attack || 0.008; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain, t + a); if (o.hold) g.gain.setValueAtTime(o.gain, t + a + o.hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + (o.hold || 0) + o.decay);
    let src; if (o.tone) { src = c.createOscillator(); src.type = o.type || 'sine'; src.frequency.setValueAtTime(o.tone, t); if (o.tone2) src.frequency.exponentialRampToValueAtTime(o.tone2, t + (o.glide || o.decay)); } else { src = c.createBufferSource(); src.buffer = noiseBuffer(c, o.noise || 'white'); src.loop = true; }
    let chain = src; if (o.hp) { const h = filt(c, 'highpass', o.hp); chain.connect(h); chain = h; } if (o.lp) { const l = filt(c, 'lowpass', o.lp); chain.connect(l); chain = l; } if (o.bp) { const b = filt(c, 'bandpass', o.bp, o.q || 1); chain.connect(b); chain = b; }
    chain.connect(g); const p = pan(c, o.pan === undefined ? 0 : o.pan); g.connect(p).connect(out); if (o.send) { const s = gain(c, o.send); g.connect(s).connect(A.reverbIn); }
    const end = t + a + (o.hold || 0) + o.decay + 0.05; if (o.tone) src.start(t); else src.start(t, Math.random() * 3); src.stop(end);
  }
  /* a sustained noise layer: source -> filter -> gain -> pan; returns { s, f, g, stop } */
  function layer(c, out, kind, type, f, q, v, p = 0) { const s = noise(c, kind); const fl = filt(c, type, f, q); const g = gain(c, v); const pn = pan(c, p); s.connect(fl).connect(g).connect(pn).connect(out); return { s, f: fl, g, stop: () => s.stop() }; }
  /* one musical note built from partials with an envelope; returns the oscillators */
  function note(c, out, o) {
    const t = o.at; const f = o.freq; const parts = o.partials || [[1, 1]]; const g = c.createGain(); const atk = o.attack || 0.01; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain, t + atk); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, o.gain * (o.sustain === undefined ? 0.5 : o.sustain)), t + atk + (o.decay || 0.3)); g.gain.setTargetAtTime(0.0001, t + o.dur, (o.release || 0.3) / 3);
    const oscs = parts.map(([mult, amp], i) => { const osc = c.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.value = f * mult; osc.detune.value = (o.detune || 0) + (i ? rnd(-4, 4) : 0); const pg = gain(c, amp); osc.connect(pg).connect(g); if (o.vib) o.vib.connect(osc.detune); osc.start(t); osc.stop(t + o.dur + (o.release || 0.3) * 3 + 0.1); return osc; });
    let chain = g; if (o.lp) { const l = filt(c, 'lowpass', o.lp, 0.6); g.connect(l); chain = l; } const p = pan(c, o.pan || 0); chain.connect(p).connect(out); if (o.send) { const s = gain(c, o.send); chain.connect(s).connect(A.reverbIn); } return oscs;
  }

  /* ---------- generators: each returns { out (GainNode), stop() } ---------- */
  const GEN = {
    white(c) { const out = gain(c, 1); const L = layer(c, out, 'white', 'lowpass', 11000, 0.5, 0.22, -0.4); const R = layer(c, out, 'white', 'lowpass', 11000, 0.5, 0.22, 0.4); return { out, stop: () => { L.stop(); R.stop(); } }; },
    pink(c) { const out = gain(c, 1); const L = layer(c, out, 'pink', 'lowpass', 16000, 0.5, 0.45, -0.4); const R = layer(c, out, 'pink', 'lowpass', 16000, 0.5, 0.45, 0.4); return { out, stop: () => { L.stop(); R.stop(); } }; },
    brown(c) { const out = gain(c, 1); const L = layer(c, out, 'brown', 'lowpass', 700, 0.5, 0.5, -0.4); const R = layer(c, out, 'brown', 'lowpass', 700, 0.5, 0.5, 0.4); return { out, stop: () => { L.stop(); R.stop(); } }; },
    rain(c, id) {
      const out = gain(c, 1); const shelf = filt(c, 'highshelf', 6500); shelf.gain.value = -6; const bus = gain(c, 1); bus.connect(shelf).connect(out);
      const body = layer(c, bus, 'pink', 'bandpass', 1300, 0.45, 0.32, 0); const hiss = layer(c, bus, 'white', 'highpass', 2800, 0.7, 0.05, 0); const low = layer(c, bus, 'brown', 'lowpass', 140, 0.7, 0.14, 0);
      const l1 = lfo(c, 0.061, 0.07, body.g.gain, 0.32); const l2 = lfo(c, 0.023, 0.03, hiss.g.gain, 0.05); const l3 = lfo(c, 0.09, 220, body.f.frequency, 1300);
      every(id, 28, 110, () => { if (Math.random() < 0.1) burst(c, bus, { tone: rnd(1600, 4200), tone2: rnd(900, 2000), gain: rnd(0.012, 0.035), decay: rnd(0.03, 0.06), pan: rnd(-0.8, 0.8), send: 0.4 }); else burst(c, bus, { gain: rnd(0.04, 0.14), decay: rnd(0.012, 0.04), bp: rnd(2200, 7500), q: rnd(2.5, 7), pan: rnd(-0.9, 0.9) }); });
      every(id, 9000, 26000, () => { const t = c.currentTime; body.g.gain.cancelScheduledValues(t); body.g.gain.setTargetAtTime(0.42, t, 1.2); body.g.gain.setTargetAtTime(0.32, t + 3.5, 2.5); });
      return { out, gust: () => { const t = c.currentTime; body.g.gain.setTargetAtTime(0.46, t, 0.8); body.g.gain.setTargetAtTime(0.32, t + 3, 2); }, stop: () => { body.stop(); hiss.stop(); low.stop(); l1.stop(); l2.stop(); l3.stop(); } };
    },
    storm(c, id) {
      const r = GEN.rain(c, id); const out = gain(c, 1); r.out.connect(out);
      const rumble = () => {
        const t = c.currentTime + rnd(0, 0.3); const close = Math.random() < 0.3; const dur = rnd(3.5, 7.5); const s = noise(c, 'brown'); const lp = filt(c, 'lowpass', close ? 160 : 90, 0.9); const g = c.createGain(); const p = pan(c, rnd(-0.6, 0.6)); s.connect(lp).connect(g).connect(p).connect(out); const sg = gain(c, 0.5); g.connect(sg).connect(A.reverbIn);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(close ? 1.6 : 0.9, t + rnd(0.15, 0.7)); let tt = t + 0.8; while (tt < t + dur - 1) { g.gain.exponentialRampToValueAtTime(rnd(0.3, close ? 1.5 : 0.9), tt); tt += rnd(0.4, 1.1); } g.gain.exponentialRampToValueAtTime(0.0001, t + dur); lp.frequency.setValueAtTime(close ? 220 : 120, t); lp.frequency.exponentialRampToValueAtTime(50, t + dur); s.stop(t + dur + 0.1);
        if (close) { burst(c, out, { at: t, gain: 0.7, attack: 0.004, decay: 0.35, bp: 900, q: 0.4, pan: rnd(-0.5, 0.5), send: 0.6 }); r.gust(); }
      };
      every(id, 7000, 24000, rumble); later(id, 1500, rumble);
      return { out, stop: () => r.stop() };
    },
    ocean(c, id) {
      const out = gain(c, 1); const bed = layer(c, out, 'brown', 'lowpass', 260, 0.6, 0.09, 0); const air = layer(c, out, 'pink', 'highpass', 1200, 0.5, 0.012, 0);
      const wave = () => {
        const t = c.currentTime + 0.05; const rise = rnd(2.4, 4.2); const fall = rnd(4, 6.5); const dur = rise + fall + 1; const side = rnd(-0.5, 0.5);
        const s = noise(c, 'brown'); const lp = filt(c, 'lowpass', 250, 0.7); const g = c.createGain(); const p = pan(c, side); s.connect(lp).connect(g).connect(p).connect(out);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(rnd(0.45, 0.7), t + rise); g.gain.exponentialRampToValueAtTime(0.0001, t + rise + fall); lp.frequency.setValueAtTime(220, t); lp.frequency.exponentialRampToValueAtTime(1100, t + rise); lp.frequency.exponentialRampToValueAtTime(180, t + rise + fall); s.stop(t + dur);
        const f = noise(c, 'pink'); const hp = filt(c, 'highpass', 1500, 0.4); const fg = c.createGain(); const fp = pan(c, side * 0.6); f.connect(hp).connect(fg).connect(fp).connect(out); const sg = gain(c, 0.25); fg.connect(sg).connect(A.reverbIn);
        fg.gain.setValueAtTime(0.0001, t); fg.gain.setValueAtTime(0.0001, t + rise * 0.55); fg.gain.exponentialRampToValueAtTime(rnd(0.1, 0.17), t + rise + 0.5); fg.gain.exponentialRampToValueAtTime(0.0001, t + rise + fall + 0.8); hp.frequency.setValueAtTime(1500, t); hp.frequency.exponentialRampToValueAtTime(3200, t + rise + fall); f.stop(t + dur + 0.5);
        later(id, (rise + fall * 0.55 + rnd(-0.5, 1.2)) * 1000, wave);
      };
      wave(); later(id, 4200, wave);
      return { out, stop: () => { bed.stop(); air.stop(); } };
    },
    wind(c, id) {
      const out = gain(c, 1); const low = layer(c, out, 'pink', 'bandpass', 420, 0.6, 0.3, 0); const whistle = layer(c, out, 'pink', 'bandpass', 1700, 6, 0.0001, 0); const rum = layer(c, out, 'brown', 'lowpass', 110, 0.7, 0.12, 0);
      const l1 = lfo(c, 0.043, 140, low.f.frequency, 420); const l2 = lfo(c, 0.017, 90, low.f.frequency); const l3 = lfo(c, 0.031, 500, whistle.f.frequency, 1700); const l4 = lfo(c, 0.05, 0.03, rum.g.gain, 0.12);
      let l5 = null; if (c.createStereoPanner) { const pn = c.createStereoPanner(); low.g.disconnect(); low.g.connect(pn).connect(out); l5 = lfo(c, 0.027, 0.5, pn.pan, 0); }
      const gust = () => { const t = c.currentTime; const up = rnd(1.4, 3.2), down = rnd(2.5, 5.5); const peak = rnd(0.42, 0.62); low.g.gain.cancelScheduledValues(t); low.g.gain.setTargetAtTime(peak, t, up / 3); low.g.gain.setTargetAtTime(0.28, t + up, down / 3); whistle.g.gain.cancelScheduledValues(t); whistle.g.gain.setTargetAtTime(rnd(0.02, 0.06), t + up * 0.4, up / 3); whistle.g.gain.setTargetAtTime(0.0001, t + up + 0.5, down / 3); low.f.frequency.setTargetAtTime(rnd(600, 900), t, up / 2); low.f.frequency.setTargetAtTime(420, t + up, down / 2); };
      every(id, 3500, 11000, gust); later(id, 800, gust);
      return { out, stop: () => { low.stop(); whistle.stop(); rum.stop(); l1.stop(); l2.stop(); l3.stop(); l4.stop(); if (l5) l5.stop(); } };
    },
    fire(c, id) {
      const out = gain(c, 1); const bed = layer(c, out, 'brown', 'lowpass', 230, 0.8, 0.24, 0); const mid = layer(c, out, 'pink', 'bandpass', 900, 0.5, 0.045, 0);
      const l1 = lfo(c, 0.31, 0.05, bed.g.gain, 0.24); const l2 = lfo(c, 2.3, 0.02, bed.g.gain); const l3 = lfo(c, 0.7, 0.015, mid.g.gain, 0.045); const l4 = lfo(c, 0.13, 60, bed.f.frequency, 230);
      const crack = () => { const r = Math.random(); const p = rnd(-0.7, 0.7); if (r < 0.62) burst(c, out, { gain: rnd(0.08, 0.36), attack: 0.002, decay: rnd(0.006, 0.022), bp: rnd(2600, 6500), q: rnd(1.5, 4), pan: p, send: 0.12 }); else if (r < 0.8) burst(c, out, { tone: rnd(320, 780), tone2: rnd(90, 200), gain: rnd(0.12, 0.4), attack: 0.003, decay: rnd(0.04, 0.1), type: 'triangle', pan: p, send: 0.2 }); else if (r < 0.92) burst(c, out, { gain: rnd(0.03, 0.06), attack: 0.03, decay: rnd(0.08, 0.25), hp: 5000, pan: p }); else burst(c, out, { gain: rnd(0.15, 0.3), attack: 0.002, decay: rnd(0.02, 0.05), lp: 900, noise: 'pink', pan: p, send: 0.25 }); };
      every(id, 35, 420, () => { crack(); if (Math.random() < 0.22) { const n = 2 + Math.floor(rnd(0, 5)); for (let k = 1; k <= n; k++) later(id, k * rnd(18, 55), crack); } });
      return { out, stop: () => { bed.stop(); mid.stop(); l1.stop(); l2.stop(); l3.stop(); l4.stop(); } };
    },
    forest(c, id) {
      const out = gain(c, 1); const breeze = layer(c, out, 'pink', 'bandpass', 650, 0.5, 0.09, 0); const leaves = layer(c, out, 'white', 'bandpass', 4200, 1.1, 0.02, 0.2); const far = layer(c, out, 'brown', 'lowpass', 200, 0.7, 0.06, -0.2);
      const l1 = lfo(c, 0.05, 0.04, breeze.g.gain, 0.09); const l2 = lfo(c, 0.037, 200, breeze.f.frequency, 650);
      every(id, 5000, 14000, () => { const t = c.currentTime; leaves.g.gain.cancelScheduledValues(t); leaves.g.gain.setTargetAtTime(rnd(0.05, 0.09), t, 0.9); leaves.g.gain.setTargetAtTime(0.02, t + 2.2, 1.6); });
      const bird = () => {
        const kind = Math.random(); const dist = Math.random(); const g = 0.03 + 0.07 * (1 - dist); const p = rnd(-0.9, 0.9); const lp = dist > 0.6 ? 3200 : undefined; const send = 0.2 + dist * 0.4; const t0 = c.currentTime + 0.05;
        if (kind < 0.3) { const n = 2 + Math.floor(rnd(0, 4)); for (let k = 0; k < n; k++) burst(c, out, { at: t0 + k * rnd(0.16, 0.26), tone: rnd(2300, 3300), tone2: rnd(3600, 4600), gain: g, attack: 0.012, decay: rnd(0.07, 0.12), glide: 0.06, pan: p, lp, send }); }
        else if (kind < 0.55) { const n = 4 + Math.floor(rnd(0, 6)); const f = rnd(3000, 4500); for (let k = 0; k < n; k++) burst(c, out, { at: t0 + k * 0.048, tone: f * rnd(0.97, 1.03), tone2: f * 1.08, gain: g * 0.9, attack: 0.006, decay: 0.03, pan: p, lp, send }); }
        else if (kind < 0.8) { const f = rnd(1800, 2700); burst(c, out, { at: t0, tone: f, tone2: f * rnd(0.85, 1.2), gain: g, attack: 0.05, hold: rnd(0.15, 0.35), decay: 0.12, glide: 0.5, pan: p, lp, send }); }
        else { const f = rnd(1500, 2400); burst(c, out, { at: t0, tone: f, gain: g, attack: 0.02, hold: 0.14, decay: 0.08, pan: p, lp, send }); burst(c, out, { at: t0 + 0.26, tone: f * pick([1.25, 1.5, 0.8]), gain: g, attack: 0.02, hold: 0.2, decay: 0.1, pan: p, lp, send }); }
      };
      every(id, 900, 4200, bird); later(id, 600, bird);
      return { out, stop: () => { breeze.stop(); leaves.stop(); far.stop(); l1.stop(); l2.stop(); } };
    },
    night(c, id) {
      const out = gain(c, 1); const bed = layer(c, out, 'brown', 'lowpass', 150, 0.7, 0.09, 0); const air = layer(c, out, 'pink', 'bandpass', 800, 0.4, 0.02, 0); const l1 = lfo(c, 0.04, 0.008, air.g.gain, 0.02);
      const crickets = [{ f: rnd(3900, 4200), p: -0.6, g: 0.05, gap: rnd(480, 620) }, { f: rnd(4300, 4700), p: 0.55, g: 0.035, gap: rnd(700, 900) }, { f: rnd(4000, 4400), p: 0.1, g: 0.022, gap: rnd(900, 1300) }];
      crickets.forEach(cr => { const chirp = () => { const t = c.currentTime + 0.02; const n = 3 + Math.floor(rnd(0, 3)); const o = c.createOscillator(); o.frequency.value = cr.f * rnd(0.995, 1.005); const bp = filt(c, 'bandpass', cr.f, 9); const g = c.createGain(); const p = pan(c, cr.p); o.connect(bp).connect(g).connect(p).connect(out); g.gain.setValueAtTime(0.0001, t); for (let k = 0; k < n; k++) { const tk = t + k * 0.036; g.gain.setValueAtTime(0.0001, tk); g.gain.exponentialRampToValueAtTime(cr.g, tk + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, tk + 0.03); } o.start(t); o.stop(t + n * 0.036 + 0.05); later(id, cr.gap * rnd(0.92, 1.08) + (Math.random() < 0.06 ? rnd(1500, 4000) : 0), chirp); }; later(id, rnd(100, 900), chirp); });
      every(id, 6000, 16000, () => { const t = c.currentTime; for (let k = 0; k < 3; k++) burst(c, out, { at: t + k * 0.09, gain: 0.02, attack: 0.01, decay: 0.05, bp: 6200, q: 4, pan: rnd(-0.8, 0.8) }); });
      every(id, 18000, 48000, () => { const t = c.currentTime; const p = rnd(-0.7, 0.7); burst(c, out, { at: t, tone: 390, tone2: 370, gain: 0.05, attack: 0.08, hold: 0.25, decay: 0.15, glide: 0.4, lp: 1200, pan: p, send: 0.6 }); burst(c, out, { at: t + 0.55, tone: 340, tone2: 320, gain: 0.045, attack: 0.08, hold: 0.35, decay: 0.2, glide: 0.5, lp: 1200, pan: p, send: 0.6 }); });
      return { out, stop: () => { bed.stop(); air.stop(); l1.stop(); } };
    },
    cafe(c, id) {
      const out = gain(c, 1); const room = layer(c, out, 'brown', 'lowpass', 380, 0.6, 0.11, 0); const hvac = layer(c, out, 'pink', 'bandpass', 1400, 0.3, 0.03, 0);
      const voices = [{ lo: 190, hi: 420, p: -0.7, lvl: 0.07 }, { lo: 260, hi: 560, p: 0.65, lvl: 0.06 }, { lo: 150, hi: 330, p: -0.2, lvl: 0.05 }, { lo: 300, hi: 700, p: 0.3, lvl: 0.045 }].map(v => { const s = noise(c, 'pink'); const bp = filt(c, 'bandpass', rnd(v.lo, v.hi), 2.2); const bp2 = filt(c, 'bandpass', rnd(v.lo, v.hi) * 2.6, 3); const g = c.createGain(); g.gain.value = 0.0001; const pn = pan(c, v.p); s.connect(bp).connect(g); s.connect(bp2).connect(g); g.connect(pn).connect(out); const sg = gain(c, 0.18); g.connect(sg).connect(A.reverbIn); return Object.assign({ s, bp, bp2, g }, v); });
      voices.forEach(v => { const talk = () => { const t = c.currentTime; const phrase = 4 + Math.floor(rnd(0, 10)); let tt = t; for (let k = 0; k < phrase; k++) { const len = rnd(0.11, 0.24); v.g.gain.setValueAtTime(0.0001, tt); v.g.gain.exponentialRampToValueAtTime(v.lvl * rnd(0.4, 1), tt + 0.03); v.g.gain.exponentialRampToValueAtTime(0.0001, tt + len); v.bp.frequency.setValueAtTime(rnd(v.lo, v.hi), tt); v.bp2.frequency.setValueAtTime(rnd(v.lo, v.hi) * 2.6, tt); tt += len + rnd(0.01, 0.06); } later(id, (tt - t) * 1000 + rnd(500, 2600), talk); }; later(id, rnd(200, 2500), talk); });
      every(id, 2500, 9000, () => { const p = rnd(-0.8, 0.8); if (Math.random() < 0.7) { const f = rnd(2400, 3600); burst(c, out, { tone: f, gain: rnd(0.03, 0.07), attack: 0.002, decay: rnd(0.15, 0.35), pan: p, send: 0.35 }); burst(c, out, { tone: f * 2.71, gain: rnd(0.015, 0.03), attack: 0.002, decay: rnd(0.08, 0.15), pan: p, send: 0.3 }); } else burst(c, out, { gain: rnd(0.08, 0.16), attack: 0.003, decay: rnd(0.05, 0.09), bp: 520, q: 1.2, noise: 'pink', pan: p, send: 0.3 }); });
      every(id, 5000, 15000, () => { const n = 4 + Math.floor(rnd(0, 10)); let t = c.currentTime + 0.05; const p = rnd(-0.5, 0.5); for (let k = 0; k < n; k++) { burst(c, out, { at: t, gain: rnd(0.02, 0.04), attack: 0.002, decay: 0.012, bp: rnd(2000, 3200), q: 1, pan: p }); t += rnd(0.06, 0.15); } });
      every(id, 25000, 65000, () => burst(c, out, { gain: rnd(0.05, 0.09), attack: 0.4, hold: rnd(0.6, 1.6), decay: 0.6, hp: 3200, pan: rnd(-0.6, 0.6), send: 0.2 }));
      return { out, stop: () => { room.stop(); hvac.stop(); voices.forEach(v => v.s.stop()); } };
    },
    lofi(c, id) {
      const out = gain(c, 0.9); const warm = filt(c, 'lowpass', 6800, 0.7); const sat = shaper(c, 1.4); const bus = gain(c, 1); bus.connect(sat).connect(warm).connect(out);
      const bpm = pick([70, 72, 74, 76, 78]); const beat = 60 / bpm; const swing = 0.6;
      const PROGS = [[[62, 65, 69, 72, 76], [67, 71, 74, 77, 81], [60, 64, 67, 71, 74], [69, 72, 76, 79, 83]], [[65, 69, 72, 76, 79], [63, 67, 70, 74, 77], [58, 62, 65, 69, 72], [60, 64, 67, 71, 74]], [[64, 67, 71, 74, 78], [69, 72, 76, 79, 83], [62, 66, 69, 73, 76], [67, 71, 74, 78, 81]]];
      const prog = pick(PROGS); const roots = prog.map(ch => ch[0] - 24); const scale = prog.flat().map(m => m % 12).filter((v, i, a) => a.indexOf(v) === i);
      const vib = c.createOscillator(); vib.frequency.value = 5.2; const vibG = gain(c, 3); vib.connect(vibG); vib.start(); const wow = c.createOscillator(); wow.frequency.value = 0.45; const wowG = gain(c, 5); wow.connect(wowG); wow.start();
      const padLp = filt(c, 'lowpass', 2100, 0.6); const padG = gain(c, 0.22); padLp.connect(padG).connect(bus); const padSend = gain(c, 0.25); padG.connect(padSend).connect(A.reverbIn);
      const drumG = gain(c, 0.5); const drumLp = filt(c, 'lowpass', 5200, 0.7); drumG.connect(drumLp).connect(bus); const snareSend = gain(c, 0.12); drumG.connect(snareSend).connect(A.reverbIn);
      const melG = gain(c, 0.16); melG.connect(bus); const melSend = gain(c, 0.45); melG.connect(melSend).connect(A.reverbIn);
      const hiss = layer(c, bus, 'pink', 'highpass', 2500, 0.5, 0.006, 0); every(id, 40, 320, () => burst(c, bus, { gain: rnd(0.006, 0.03), attack: 0.001, decay: rnd(0.003, 0.012), lp: 4500, pan: rnd(-0.3, 0.3) }));
      const kick = t => { const o = c.createOscillator(); const g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.1); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g).connect(drumG); o.start(t); o.stop(t + 0.32); burst(c, drumG, { at: t, gain: 0.25, attack: 0.001, decay: 0.008, hp: 1800 }); };
      const snare = (t, soft) => { burst(c, drumG, { at: t, gain: soft ? 0.14 : 0.32, attack: 0.002, decay: 0.16, bp: 1900, q: 0.7 }); burst(c, drumG, { at: t, tone: 185, tone2: 150, gain: soft ? 0.1 : 0.22, attack: 0.002, decay: 0.08, type: 'triangle' }); };
      const hat = (t, open) => burst(c, drumG, { at: t, gain: open ? 0.1 : 0.06, attack: 0.001, decay: open ? 0.2 : 0.04, hp: 8000, pan: 0.25 });
      const chord = (t, notes) => notes.forEach((m, i) => { const oscs = note(c, padLp, { at: t, freq: midi(m), partials: [[1, 1], [4, 0.12], [7, 0.03]], gain: i === 0 ? 0.32 : 0.2, attack: 0.012, decay: 0.6, sustain: 0.55, dur: beat * 3.6, release: 0.7, detune: rnd(-3, 3), pan: (i - 2) * 0.18, vib: vibG }); oscs.forEach(o => wowG.connect(o.detune)); });
      const bass = (t, m, dur) => note(c, bus, { at: t, freq: midi(m), partials: [[1, 1], [2, 0.25]], type: 'sine', gain: 0.4, attack: 0.01, decay: 0.2, sustain: 0.7, dur, release: 0.15, lp: 420 });
      const melody = (t, ch) => { let m = pick(ch.slice(1)) + 12; const n = 2 + Math.floor(rnd(0, 4)); let tt = t + beat * pick([0, 0.5, 1]); for (let k = 0; k < n; k++) { note(c, melG, { at: tt, freq: midi(m), partials: [[1, 1], [2, 0.15]], type: 'triangle', gain: 0.5, attack: 0.02, decay: 0.3, sustain: 0.4, dur: beat * rnd(0.5, 1.2), release: 0.4, pan: rnd(-0.3, 0.3) }); tt += beat * pick([0.5, 1, 1, 1.5]); const step = pick([-2, -1, 1, 2, 3]); let cand = m + step; let tries = 0; while (!scale.includes(((cand % 12) + 12) % 12) && tries++ < 6) cand += step > 0 ? 1 : -1; m = Math.max(72, Math.min(88, cand)); } };
      let bar = 0; let next = c.currentTime + 0.15;
      const schedule = () => { while (next < c.currentTime + 0.6) { const t = next; const ch = prog[bar % prog.length]; chord(t, ch); const root = roots[bar % roots.length]; bass(t, root, beat * 1.6); if (Math.random() < 0.7) bass(t + beat * 2.5, root + pick([0, 7, 12]), beat * 0.9);
          for (let b = 0; b < 4; b++) { const tb = t + b * beat + rnd(-0.008, 0.008); if (b === 0 || (b === 2 && Math.random() < 0.8)) kick(tb); if (b === 1 || b === 3) snare(tb + rnd(0, 0.014)); if (b === 2 && Math.random() < 0.3) kick(tb + beat * 0.75); if (b === 0 && Math.random() < 0.15) snare(tb + beat * 0.75, true); hat(tb, false); hat(tb + beat * swing, b === 3 && Math.random() < 0.5); }
          if (Math.random() < 0.35 && bar > 1) melody(t, ch); next += beat * 4; bar++; } later(id, 180, schedule); };
      schedule();
      return { out, stop: () => { hiss.stop(); vib.stop(); wow.stop(); } };
    },
    piano(c, id) {
      const out = gain(c, 0.9); const bus = gain(c, 1); const lp = filt(c, 'lowpass', 5200, 0.5); bus.connect(lp).connect(out); const send = gain(c, 0.55); lp.connect(send).connect(A.reverbIn);
      const minor = Math.random() < 0.5; const key = 48 + Math.floor(rnd(0, 12)); const scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
      const degrees = minor ? [[0, 2, 4], [5, 0, 2], [2, 4, 6], [6, 1, 3], [3, 5, 0], [4, 6, 1]] : [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1], [1, 3, 5], [2, 4, 6]];
      const chordNotes = deg => deg.map((d, i) => key + (i === 0 ? 0 : 12) + scale[d % 7]);
      const play = (m, t, g, dur) => note(c, bus, { at: t, freq: midi(m), partials: [[1, 1], [2, 0.32], [3, 0.12], [4, 0.05], [5, 0.025]], gain: g, attack: 0.006, decay: rnd(1.4, 2.6), sustain: 0.12, dur, release: 0.9, detune: rnd(-2, 2), pan: (m - 64) / 40 });
      let chordI = 0; let step = 0; let next = c.currentTime + 0.2; let cur = chordNotes(degrees[0]);
      const tick = () => { while (next < c.currentTime + 0.5) { const t = next; if (step % 4 === 0) { chordI = Math.random() < 0.7 ? (chordI + pick([1, 1, 2, 3])) % degrees.length : chordI; cur = chordNotes(degrees[chordI]); play(cur[0] - 12, t, 0.22, 3.2); if (Math.random() < 0.5) play(cur[0] - 5, t + rnd(0.05, 0.12), 0.12, 2.5); }
          const tone = pick(cur) + pick([0, 0, 12, 12, 24]); play(tone, t + rnd(0, 0.03), rnd(0.12, 0.22), rnd(1.2, 2.4)); if (Math.random() < 0.3) play(pick(cur) + 12, t + rnd(0.08, 0.2), rnd(0.08, 0.14), 1.8);
          step++; next += rnd(0.75, 1.5) * (step % 8 === 0 ? 1.8 : 1); } later(id, 150, tick); };
      tick();
      return { out, stop: () => {} };
    },
    drone(c, id) {
      const out = gain(c, 0.8); const lp = filt(c, 'lowpass', 520, 0.9); const bus = gain(c, 1); bus.connect(lp).connect(out); const send = gain(c, 0.6); lp.connect(send).connect(A.reverbIn); const l0 = lfo(c, 0.023, 220, lp.frequency, 520);
      const root = 36 + Math.floor(rnd(0, 8)); const voices = [[0, 'sawtooth', 0.12, -0.5], [7, 'sawtooth', 0.09, 0.5], [12, 'triangle', 0.1, -0.2], [19, 'sine', 0.06, 0.2], [-12, 'sine', 0.2, 0]].map(([iv, type, g, p]) => { const o = c.createOscillator(); o.type = type; o.frequency.value = midi(root + iv); o.detune.value = rnd(-6, 6); const vg = c.createGain(); vg.gain.value = g; const pn = pan(c, p); o.connect(vg).connect(pn).connect(bus); const l = lfo(c, rnd(0.04, 0.12), g * 0.5, vg.gain, g); o.start(); return { o, vg, l, iv }; });
      const shimmer = c.createOscillator(); shimmer.type = 'sine'; shimmer.frequency.value = midi(root + 31); const sg = gain(c, 0.015); const sl = lfo(c, 0.31, 0.012, sg.gain, 0.015); shimmer.connect(sg).connect(A.reverbIn); shimmer.start();
      const move = () => { const t = c.currentTime; const shift = pick([-2, 3, 5, -4, 7]); voices.forEach(v => v.o.frequency.setTargetAtTime(midi(root + v.iv + shift), t, 3.5)); shimmer.frequency.setTargetAtTime(midi(root + 31 + shift), t, 3.5); later(id, rnd(22000, 45000), () => { const t2 = c.currentTime; voices.forEach(v => v.o.frequency.setTargetAtTime(midi(root + v.iv), t2, 4)); shimmer.frequency.setTargetAtTime(midi(root + 31), t2, 4); later(id, rnd(20000, 40000), move); }); };
      later(id, rnd(18000, 30000), move);
      return { out, stop: () => { voices.forEach(v => { v.o.stop(); v.l.stop(); }); shimmer.stop(); sl.stop(); l0.stop(); } };
    }
  };

  /* ---------- control ---------- */
  function start(id, vol) {
    const c = ctx(); if (!c) { toast('This browser cannot play generated sound.'); return false; }
    if (A.nodes[id]) return true; const gen = GEN[id]; if (!gen) return false;
    A.nodes[id] = { pending: true }; let node; try { node = gen(c, id); } catch (e) { delete A.nodes[id]; clearTimers(id); toast('That sound could not start.'); return false; }
    const v = gain(c, 0.0001); node.out.connect(v).connect(A.master); v.gain.setTargetAtTime(vol === undefined ? 0.7 : Math.max(0.0001, vol), c.currentTime, 0.4);
    A.nodes[id] = { out: node.out, stop: node.stop, vol: v }; return true;
  }
  function stop(id) { const n = A.nodes[id]; if (!n) return; clearTimers(id); delete A.nodes[id]; try { if (n.vol && A.ctx) n.vol.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.15); } catch {} setTimeout(() => { try { n.stop && n.stop(); } catch {} try { n.vol && n.vol.disconnect(); n.out && n.out.disconnect(); } catch {} }, 700); }
  function stopAll() { activeIds().forEach(stop); }
  function setVol(id, v) { const n = A.nodes[id]; if (n && n.vol) n.vol.gain.setTargetAtTime(Math.max(0.0001, v), A.ctx.currentTime, 0.05); const s = saved(); s.mix[id] = v; persist({ mix: s.mix }); }
  function toggle(id) {
    const s = saved(); if (A.nodes[id]) { stop(id); delete s.mix[id]; persist({ mix: s.mix }); }
    else { const v = s.mix[id] !== undefined ? s.mix[id] : 0.7; if (start(id, v)) { s.mix[id] = v; persist({ mix: s.mix }); } }
    paint();
  }
  function resumeMix() { const s = saved(); const ids = Object.keys(s.mix).filter(id => GEN[id]); if (!ids.length) return false; ids.forEach(id => start(id, s.mix[id])); paint(); return true; }
  function setSleep(min) { clearTimeout(A.sleepTimer); A.sleepAt = min ? Date.now() + min * 60000 : 0; if (min) A.sleepTimer = setTimeout(() => { fadeOut(); }, min * 60000); paint(); }
  function fadeOut() {
    if (A.ctx) A.master.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 4);
    const a = audio(); const v0 = a.volume; const steps = 28; let k = 0; const iv = setInterval(() => { k++; a.volume = Math.max(0, v0 * (1 - k / steps)); if (k >= steps) clearInterval(iv); }, 500);
    setTimeout(() => { stopAll(); if (A.ctx) A.master.gain.setValueAtTime(saved().master, A.ctx.currentTime); pause(); a.volume = v0; A.sleepAt = 0; paint(); }, 15000); toast('Sounds fading out. Good night.', 4000);
  }
  const playing = () => activeIds().filter(id => A.nodes[id] && !A.nodes[id].hidden);

  /* ---------- personal music: IndexedDB library + <audio> player ---------- */
  const MAX_TRACKS = 10, MAX_SECS = 8 * 60, MAX_BYTES = 30 * 1024 * 1024;
  const M = { tracks: [], cur: null, ready: false, loading: false, url: null, seeking: false, a: null };
  const mset = () => Object.assign({ order: [], current: null, shuffle: false, repeat: 'all', vol: 0.8 }, saved().music || {});
  const mpersist = patch => persist({ music: Object.assign(mset(), patch) });
  function db() { return new Promise((res, rej) => { if (!global.indexedDB) return rej(new Error('no idb')); const r = indexedDB.open('mathub-music', 1); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  const tx = (mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction('tracks', mode); const st = t.objectStore('tracks'); const req = fn(st); t.oncomplete = () => { d.close(); res(req && req.result); }; t.onerror = () => { d.close(); rej(t.error); }; t.onabort = () => { d.close(); rej(t.error); }; }));
  const dbAll = () => tx('readonly', st => st.getAll());
  const dbPut = t => tx('readwrite', st => st.put(t));
  const dbDel = id => tx('readwrite', st => st.delete(id));
  async function loadLibrary() { if (M.ready || M.loading) return; M.loading = true; try { const all = (await dbAll()) || []; const order = mset().order; all.sort((a, b) => { const ia = order.indexOf(a.id), ib = order.indexOf(b.id); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.added - b.added; }); M.tracks = all; const cur = mset().current; if (cur && all.some(t => t.id === cur)) M.cur = cur; } catch { M.tracks = []; } M.ready = true; M.loading = false; paint(); }
  function audio() { if (M.a) return M.a; const a = document.createElement('audio'); a.id = 'amb-audio'; a.preload = 'metadata'; a.volume = mset().vol; a.addEventListener('ended', () => next(true)); a.addEventListener('timeupdate', paintTime); a.addEventListener('play', () => { paint(); mediaSession(); }); a.addEventListener('pause', () => paint()); a.addEventListener('error', () => { if (M.cur && a.src) toast('That file could not be played.'); }); (A.el || document.body).appendChild(a); M.a = a; return a; }
  const fmt = s => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function probe(file) { return new Promise(res => { const url = URL.createObjectURL(file); const a = new Audio(); a.preload = 'metadata'; let done = false; const fin = d => { if (done) return; done = true; URL.revokeObjectURL(url); a.removeAttribute('src'); res(d); }; a.onloadedmetadata = () => fin(a.duration); a.onerror = () => fin(NaN); a.src = url; setTimeout(() => fin(NaN), 15000); }); }
  async function addFiles(files) {
    await loadLibrary(); const list = Array.from(files || []); if (!list.length) return; let added = 0; const notes = [];
    for (const f of list) {
      if (M.tracks.length >= MAX_TRACKS) { notes.push(`Only ${MAX_TRACKS} tracks fit; remove one to add more.`); break; }
      const isMp3 = /audio\/mpeg|audio\/mp3/i.test(f.type) || /\.mp3$/i.test(f.name); if (!isMp3) { notes.push(`${f.name}: only MP3 files.`); continue; }
      if (f.size > MAX_BYTES) { notes.push(`${f.name}: too large (max 30 MB).`); continue; }
      const d = await probe(f); if (!isFinite(d) || d <= 0) { notes.push(`${f.name}: could not read this file.`); continue; }
      if (d > MAX_SECS + 1) { notes.push(`${f.name}: ${fmt(d)} is longer than 8 minutes.`); continue; }
      const t = { id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: f.name.replace(/\.mp3$/i, ''), size: f.size, duration: d, added: Date.now(), blob: f };
      try { await dbPut(t); M.tracks.push(t); added++; } catch { notes.push(`${f.name}: could not be saved (storage full?).`); }
    }
    mpersist({ order: M.tracks.map(t => t.id) });
    if (added && !M.cur) { M.cur = M.tracks[0].id; mpersist({ current: M.cur }); }
    paint(); if (added) toast(`${icon('check', 14)} Added ${added} track${added === 1 ? '' : 's'}`); notes.slice(0, 3).forEach(n => toast(n, 4200));
    if (added && audio().paused && !playing().length) play(M.cur);
  }
  async function removeTrack(id) { const i = M.tracks.findIndex(t => t.id === id); if (i < 0) return; const wasCur = M.cur === id; try { await dbDel(id); } catch {} M.tracks.splice(i, 1); if (wasCur) { pause(); if (M.url) { URL.revokeObjectURL(M.url); M.url = null; } const a = audio(); a.removeAttribute('src'); delete a.dataset.id; M.cur = M.tracks[i] ? M.tracks[i].id : M.tracks[0] ? M.tracks[0].id : null; } mpersist({ order: M.tracks.map(t => t.id), current: M.cur }); paint(); }
  function move(id, dir) { const i = M.tracks.findIndex(t => t.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= M.tracks.length) return; const [t] = M.tracks.splice(i, 1); M.tracks.splice(j, 0, t); mpersist({ order: M.tracks.map(x => x.id) }); paint(); }
  function load(id) { const t = M.tracks.find(x => x.id === id); if (!t) return false; const a = audio(); if (a.dataset.id === id && a.src) { M.cur = id; return true; } if (M.url) URL.revokeObjectURL(M.url); M.url = URL.createObjectURL(t.blob); a.src = M.url; a.dataset.id = id; M.cur = id; mpersist({ current: id }); return true; }
  function play(id) { const a = audio(); if (id && !load(id)) return; if (!a.src) { if (!M.tracks.length) { toast('Add an MP3 first.'); return; } load(M.cur || M.tracks[0].id); } a.play().catch(() => toast('Tap play again to start the music.')); paint(); }
  function pause() { const a = audio(); if (!a.paused) a.pause(); paint(); }
  function next(auto) { if (!M.tracks.length) return; const s = mset(); const i = M.tracks.findIndex(t => t.id === M.cur); if (auto && s.repeat === 'one') { const a = audio(); a.currentTime = 0; a.play().catch(() => {}); return; } let j; if (s.shuffle && M.tracks.length > 1) { do { j = Math.floor(Math.random() * M.tracks.length); } while (j === i); } else { j = i + 1; if (j >= M.tracks.length) { if (auto && s.repeat === 'off') { pause(); audio().currentTime = 0; return; } j = 0; } } play(M.tracks[j].id); }
  function prev() { if (!M.tracks.length) return; const a = audio(); if (a.currentTime > 4) { a.currentTime = 0; return; } const i = M.tracks.findIndex(t => t.id === M.cur); play(M.tracks[(i - 1 + M.tracks.length) % M.tracks.length].id); }
  function mediaSession() { if (!('mediaSession' in navigator)) return; const t = M.tracks.find(x => x.id === M.cur); try { navigator.mediaSession.metadata = new MediaMetadata({ title: t ? t.name : 'Mathub music', artist: 'My music · Mathub' }); navigator.mediaSession.setActionHandler('play', () => play()); navigator.mediaSession.setActionHandler('pause', () => pause()); navigator.mediaSession.setActionHandler('nexttrack', () => next(false)); navigator.mediaSession.setActionHandler('previoustrack', () => prev()); } catch {} }
  function paintTime() { if (!A.el || !A.open || M.seeking) return; const a = audio(); const bar = $('#amb-seek', A.el); const cur = $('#amb-cur', A.el); if (bar && isFinite(a.duration) && a.duration > 0) bar.value = Math.round(1000 * a.currentTime / a.duration); if (cur) cur.textContent = fmt(a.currentTime); }
  const musicOn = () => !!(M.a && !M.a.paused && M.a.src);

  /* ---------- UI ---------- */
  function ensure() {
    if (A.el) return A.el; const el = document.createElement('div'); el.id = 'ambient'; el.innerHTML = `<div class="amb-panel" id="amb-panel" hidden></div><button class="amb-bubble" data-action="amb-toggle" aria-label="Focus sounds and music" title="Focus sounds and music">${ic('headphones', 22)}<span class="amb-eq" aria-hidden="true"><i></i><i></i><i></i></span></button><input type="file" id="amb-file" accept="audio/mpeg,.mp3" multiple hidden>`;
    document.body.appendChild(el); A.el = el;
    bind(el, {
      'amb-toggle': () => { A.open = !A.open; if (A.open) loadLibrary(); paint(); },
      'amb-close': () => { A.open = false; paint(); },
      'amb-tab': b => { A.tab = b.dataset.tab; persist({ tab: A.tab }); if (A.tab === 'music') loadLibrary(); paint(); },
      'amb-sound': b => toggle(b.dataset.id),
      'amb-stop': () => { stopAll(); persist({ mix: {} }); paint(); },
      'amb-resume': () => { if (!resumeMix()) toast('Pick a sound first.'); },
      'amb-sleep': b => { const m = +b.dataset.min; setSleep(A.sleepAt && !m ? 0 : m); toast(m ? `Everything stops in ${m} minutes` : 'Timer off'); },
      'amb-add': () => { if (M.tracks.length >= MAX_TRACKS) { toast(`You already have ${MAX_TRACKS} tracks. Remove one first.`); return; } $('#amb-file', el).click(); },
      'amb-play': () => { if (musicOn()) pause(); else play(); },
      'amb-track': b => { if (M.cur === b.dataset.id && musicOn()) pause(); else play(b.dataset.id); },
      'amb-next': () => next(false), 'amb-prev': () => prev(),
      'amb-shuffle': () => { mpersist({ shuffle: !mset().shuffle }); paint(); },
      'amb-repeat': () => { const r = mset().repeat; mpersist({ repeat: r === 'all' ? 'one' : r === 'one' ? 'off' : 'all' }); paint(); },
      'amb-remove': b => { const t = M.tracks.find(x => x.id === b.dataset.id); if (t && confirm(`Remove “${t.name}” from your music?`)) removeTrack(b.dataset.id); },
      'amb-up': b => move(b.dataset.id, -1), 'amb-down': b => move(b.dataset.id, 1)
    });
    el.addEventListener('change', e => { if (e.target.id === 'amb-file') { const files = Array.from(e.target.files || []); e.target.value = ''; addFiles(files); } else if (e.target.id === 'amb-seek') { const a = audio(); if (isFinite(a.duration)) a.currentTime = a.duration * e.target.value / 1000; M.seeking = false; } });
    el.addEventListener('input', e => {
      const t = e.target; if (t.id === 'amb-master') { const v = +t.value; persist({ master: v }); if (A.master) A.master.gain.setTargetAtTime(Math.max(0.0001, v), A.ctx.currentTime, 0.05); }
      else if (t.id === 'amb-mvol') { const v = +t.value; mpersist({ vol: v }); audio().volume = v; }
      else if (t.id === 'amb-seek') { M.seeking = true; const a = audio(); if (isFinite(a.duration)) { const cur = $('#amb-cur', el); if (cur) cur.textContent = fmt(a.duration * t.value / 1000); } }
      else if (t.dataset && t.dataset.vol) setVol(t.dataset.vol, +t.value);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && A.open) { A.open = false; paint(); } });
    // on phones the floating bubble covered page controls, so the same toggle also lives in the top bar (.amb-top)
    document.addEventListener('click', e => {
      if (e.target.closest('.amb-top')) { A.open = !A.open; if (A.open) loadLibrary(); paint(); return; }
      if (A.open && !e.composedPath().includes(el)) { A.open = false; paint(); }
    });
    return el;
  }
  function paint() {
    const el = ensure(); const s = saved(); const on = playing(); const panel = $('#amb-panel', el); const bubble = $('.amb-bubble', el); const anyOn = on.length > 0 || musicOn();
    [bubble, ...$$('.amb-top')].forEach(b => { b.classList.toggle('on', anyOn); b.classList.toggle('open', A.open); b.setAttribute('aria-expanded', String(A.open)); });
    panel.hidden = !A.open; if (!A.open) return;
    const tab = A.tab || s.tab || 'sounds'; const sleepLeft = A.sleepAt ? Math.max(1, Math.ceil((A.sleepAt - Date.now()) / 60000)) : 0;
    const soundsTab = `<div class="amb-grid">${SOUNDS.map(x => { const act = !!A.nodes[x.id]; const v = s.mix[x.id] !== undefined ? s.mix[x.id] : 0.7; return `<div class="amb-tile${act ? ' on' : ''}"><button class="amb-tbtn" data-action="amb-sound" data-id="${x.id}" title="${esc(x.desc)}"><span class="amb-ic">${ic(x.ic, 20)}</span><span class="amb-name">${esc(x.name)}</span></button>${act ? `<input type="range" class="amb-vol" min="0" max="1" step="0.02" value="${v}" data-vol="${x.id}" aria-label="${esc(x.name)} volume">` : ''}</div>`; }).join('')}</div>
      <div class="amb-foot"><label class="amb-master">${ic('sliders', 14)}<input type="range" id="amb-master" min="0" max="1" step="0.02" value="${s.master}" aria-label="Master volume"></label>
        ${on.length ? `<button class="btn xs" data-action="amb-stop">Stop all</button>` : Object.keys(s.mix).length ? `<button class="btn xs primary" data-action="amb-resume">${ic('play', 12)} Resume mix</button>` : ''}</div>
      <p class="amb-note">Generated on your device as you listen, nothing streams. Layer as many as you like; each keeps its own volume.</p>`;
    const ms = mset(); const cur = M.tracks.find(t => t.id === M.cur); const a = M.a; const dur = cur ? cur.duration : 0; const total = M.tracks.reduce((n, t) => n + t.duration, 0); const loaded = a && a.dataset.id === M.cur && a.src;
    const musicTab = `<div class="amb-now">${cur ? `<div class="amb-now-title" title="${esc(cur.name)}">${esc(cur.name)}</div>` : `<div class="amb-now-title muted">${M.ready ? (M.tracks.length ? 'Pick a track' : 'No music yet') : 'Loading your music…'}</div>`}
        <div class="amb-seek-row"><span class="mono" id="amb-cur">${fmt(loaded ? a.currentTime : 0)}</span><input type="range" id="amb-seek" min="0" max="1000" value="${loaded && dur ? Math.round(1000 * a.currentTime / dur) : 0}" aria-label="Seek"${cur ? '' : ' disabled'}><span class="mono">${fmt(dur)}</span></div>
        <div class="amb-transport"><button class="icon-btn${ms.shuffle ? ' on' : ''}" data-action="amb-shuffle" title="Shuffle" aria-pressed="${ms.shuffle}">${ic('shuffle', 15)}</button><button class="icon-btn" data-action="amb-prev" title="Previous">${ic('prev', 16)}</button><button class="amb-playbtn" data-action="amb-play" title="${musicOn() ? 'Pause' : 'Play'}">${ic(musicOn() ? 'pause' : 'play', 20)}</button><button class="icon-btn" data-action="amb-next" title="Next">${ic('next', 16)}</button><button class="icon-btn${ms.repeat !== 'off' ? ' on' : ''}" data-action="amb-repeat" title="Repeat: ${ms.repeat}">${ic('repeat', 15)}${ms.repeat === 'one' ? '<b class="amb-one">1</b>' : ''}</button></div>
        <label class="amb-master">${ic('sliders', 14)}<input type="range" id="amb-mvol" min="0" max="1" step="0.02" value="${ms.vol}" aria-label="Music volume"></label></div>
      <div class="amb-list">${M.tracks.map((t, i) => `<div class="amb-track${t.id === M.cur ? ' cur' : ''}${t.id === M.cur && musicOn() ? ' playing' : ''}"><button class="amb-tplay" data-action="amb-track" data-id="${t.id}" title="${t.id === M.cur && musicOn() ? 'Pause' : 'Play'}"><span class="amb-tnum">${i + 1}</span><span class="amb-teq"><i></i><i></i><i></i></span>${ic(t.id === M.cur && musicOn() ? 'pause' : 'play', 12)}</button><span class="amb-tname" title="${esc(t.name)}">${esc(t.name)}</span><span class="mono small muted">${fmt(t.duration)}</span><span class="amb-tacts"><button class="icon-btn" data-action="amb-up" data-id="${t.id}" title="Move up"${i === 0 ? ' disabled' : ''}>${icon('up', 12)}</button><button class="icon-btn" data-action="amb-down" data-id="${t.id}" title="Move down"${i === M.tracks.length - 1 ? ' disabled' : ''}>${icon('down', 12)}</button><button class="icon-btn" data-action="amb-remove" data-id="${t.id}" title="Remove">${icon('trash', 12)}</button></span></div>`).join('')}${M.ready && !M.tracks.length ? `<div class="amb-empty">${ic('music', 26)}<p>Bring your own playlist: up to <b>${MAX_TRACKS} MP3s</b>, each up to <b>8 minutes</b>. They stay in this browser only and keep playing while you move around Mathub.</p></div>` : ''}</div>
      <div class="amb-foot"><button class="btn sm primary" data-action="amb-add"${M.tracks.length >= MAX_TRACKS ? ' disabled' : ''}>${ic('plus', 13)} Add MP3s</button><span class="small muted">${M.tracks.length} of ${MAX_TRACKS}${total ? ` · ${fmt(total)} total` : ''}</span></div>
      <p class="amb-note">Files are saved on this device only (never uploaded), so your music is private and stays after a reload. Clearing site data removes it.</p>`;
    panel.innerHTML = `<div class="amb-head"><div class="amb-tabs"><button class="amb-tab${tab === 'sounds' ? ' on' : ''}" data-action="amb-tab" data-tab="sounds">${ic('headphones', 14)} Focus sounds${on.length ? '<i class="amb-dot"></i>' : ''}</button><button class="amb-tab${tab === 'music' ? ' on' : ''}" data-action="amb-tab" data-tab="music">${ic('music', 14)} My music${musicOn() ? '<i class="amb-dot"></i>' : ''}</button></div><span class="amb-sleep">${ic('clock', 13)}${[15, 30, 60].map(m => `<button class="amb-chip${A.sleepAt && sleepLeft <= m && sleepLeft > (m === 15 ? 0 : m === 30 ? 15 : 30) ? ' on' : ''}" data-action="amb-sleep" data-min="${m}" title="Fade everything out after ${m} minutes">${m}m</button>`).join('')}${A.sleepAt ? `<small>${sleepLeft} min</small>` : ''}</span><button class="icon-btn" data-action="amb-close" aria-label="Close">${icon('x', 14)}</button></div>${tab === 'sounds' ? soundsTab : musicTab}`;
  }
  App.ambient = { toggle, stop, stopAll, start, playing, open: () => { A.open = true; loadLibrary(); paint(); }, paint, music: { play, pause, next, prev, addFiles, tracks: () => M.tracks.slice(), removeTrack } };
  document.addEventListener('DOMContentLoaded', () => { ensure(); paint(); });
  setInterval(() => { if (A.open && A.sleepAt) paint(); }, 30000);
})(window);
