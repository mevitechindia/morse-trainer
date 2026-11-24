// Persisted settings and per-character stats (localStorage).
(function () {
  'use strict';
  const MT = (window.MT = window.MT || {});
  const KEY = 'morse-trainer.settings.v1';
  const STATS_KEY = 'morse-trainer.stats.v1';

  const DEFAULTS = {
    wpm: 8,
    farnsworth: false,
    effWpm: 5,
    freq: 600,
    volume: 0.5,
    sidetone: true,
    keepAwake: true,
    keyMode: 'straight', // straight | iambicA | iambicB
    keys: { straight: 'Space', dit: 'BracketLeft', dah: 'BracketRight' },
    swapPaddles: false,
    adaptive: true,
    prosignDecode: true,
    errorBackspace: true,
    content: {
      letters: true, numbers: false, punctuation: false, words: true, qcodes: false,
      abbr: false, callsigns: false, prosigns: false, qso: false,
    },
    count: 8,
    groupSize: 5,
    customChars: '',
    rhythmUnit: 'word',
    exam: { style: 'plain', length: 300, spacing: true },
    hints: {
      rxShowText: false, rxShowMorse: false, rxGlossary: true,
      txShowNext: true, txShowAll: false, txListenFirst: false,
      rhShowIdeal: true,
      frShowPlayed: false,
    },
  };

  function merge(base, over) {
    const out = Array.isArray(base) ? base.slice() : { ...base };
    if (!over || typeof over !== 'object') return out;
    for (const k of Object.keys(base)) {
      if (!(k in over)) continue;
      const b = base[k];
      const o = over[k];
      if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = merge(b, o);
      else if (typeof o === typeof b) out[k] = o;
    }
    return out;
  }

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function write(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) { /* ignore */ }
  }

  MT.DEFAULTS = DEFAULTS;
  MT.loadSettings = () => merge(DEFAULTS, read(KEY));
  MT.saveSettings = (s) => write(KEY, s);
  MT.loadStats = () => {
    const s = read(STATS_KEY) || {};
    return { rx: s.rx || {}, tx: s.tx || {} };
  };
  MT.saveStats = (s) => write(STATS_KEY, s);
})();
