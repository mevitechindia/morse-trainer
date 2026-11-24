// Core Morse tables, tokenising, timing and text alignment.
(function () {
  'use strict';
  const MT = (window.MT = window.MT || {});

  const CHARS = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..',
    J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
    S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....',
    7: '--...', 8: '---..', 9: '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.',
    '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
    '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
  };

  // Prosigns are written as <XX> and sent as one character (no inter-letter gap).
  const PROSIGNS = {
    '<AR>': '.-.-.', '<AS>': '.-...', '<BT>': '-...-', '<KN>': '-.--.', '<SK>': '...-.-',
    '<BK>': '-...-.-', '<CT>': '-.-.-', '<VE>': '...-.', '<SOS>': '...---...', '<HH>': '........',
  };

  const PAT_TO_CHAR = {};
  for (const [k, v] of Object.entries(CHARS)) PAT_TO_CHAR[v] = k;
  const PAT_TO_PROSIGN = {};
  for (const [k, v] of Object.entries(PROSIGNS)) PAT_TO_PROSIGN[v] = k;

  function patternOf(tok) {
    return CHARS[tok] || PROSIGNS[tok] || null;
  }

  function decode(pattern, preferProsign) {
    if (preferProsign && PAT_TO_PROSIGN[pattern]) return PAT_TO_PROSIGN[pattern];
    return PAT_TO_CHAR[pattern] || PAT_TO_PROSIGN[pattern] || null;
  }

  // Text -> tokens (single chars, prosigns like <AR>, and ' ' for word breaks).
  function tokenize(text) {
    const out = [];
    const re = /<[A-Z]{2,3}>|\s+|\S/g;
    const up = String(text || '').toUpperCase();
    let m;
    while ((m = re.exec(up))) {
      const t = m[0];
      if (/^\s+$/.test(t)) {
        if (out.length && out[out.length - 1] !== ' ') out.push(' ');
      } else if (patternOf(t)) {
        out.push(t);
      } else if (t.startsWith('<')) {
        for (const c of t.slice(1, -1)) if (patternOf(c)) out.push(c);
      }
    }
    while (out.length && out[out.length - 1] === ' ') out.pop();
    return out;
  }

  function sameToken(a, b) {
    if (a === b) return true;
    const pa = patternOf(a);
    return !!pa && pa === patternOf(b);
  }

  const pretty = (p) => (p || '').replace(/\./g, '·').replace(/-/g, '−');

  // Timing in ms. Standard PARIS timing, optionally Farnsworth-stretched gaps.
  function timing(s) {
    const u = 1200 / s.wpm;
    let cg = 3 * u;
    let wg = 7 * u;
    if (s.farnsworth && s.effWpm < s.wpm) {
      const c = s.wpm;
      const e = s.effWpm;
      const ta = ((60 * c - 37.2 * e) / (e * c)) * 1000;
      cg = (3 * ta) / 19;
      wg = (7 * ta) / 19;
    }
    return { u, dot: u, dash: 3 * u, intra: u, cg, wg };
  }

  function standardTiming(wpm) {
    return timing({ wpm, farnsworth: false });
  }

  // tokens -> { tones:[{start,dur,el,i}], marks:[{i,time,pat|space}], total }
  function buildSchedule(tokens, t) {
    const tones = [];
    const marks = [];
    let time = 0;
    let lastGap = 0;
    tokens.forEach((tok, i) => {
      if (tok === ' ') {
        if (tones.length) {
          time += t.wg - lastGap;
          lastGap = t.wg;
        }
        marks.push({ i, time, space: true });
        return;
      }
      const pat = patternOf(tok);
      if (!pat) return;
      marks.push({ i, time, pat });
      for (let j = 0; j < pat.length; j++) {
        const el = pat[j];
        const d = el === '.' ? t.dot : t.dash;
        tones.push({ start: time, dur: d, el, i });
        time += d;
        if (j < pat.length - 1) time += t.intra;
      }
      time += t.cg;
      lastGap = t.cg;
    });
    // Do not count the trailing gap in the total length.
    const total = tones.length ? tones[tones.length - 1].start + tones[tones.length - 1].dur : 0;
    return { tones, marks, total };
  }

  // Levenshtein alignment of expected vs typed token arrays.
  function align(exp, got) {
    const n = exp.length;
    const m = got.length;
    const D = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = 0; i <= n; i++) D[i][0] = i;
    for (let j = 0; j <= m; j++) D[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const c = sameToken(exp[i - 1], got[j - 1]) ? 0 : 1;
        D[i][j] = Math.min(D[i - 1][j - 1] + c, D[i - 1][j] + 1, D[i][j - 1] + 1);
      }
    }
    const ops = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (sameToken(exp[i - 1], got[j - 1]) ? 0 : 1)) {
        ops.push({ type: sameToken(exp[i - 1], got[j - 1]) ? 'match' : 'sub', e: exp[i - 1], t: got[j - 1] });
        i--; j--;
      } else if (i > 0 && D[i][j] === D[i - 1][j] + 1) {
        ops.push({ type: 'del', e: exp[i - 1] });
        i--;
      } else {
        ops.push({ type: 'ins', t: got[j - 1] });
        j--;
      }
    }
    return ops.reverse();
  }

  // Speed from keyed elements: median unit length -> WPM.
  function estimateWpm(marks) {
    const units = [];
    for (const m of marks) {
      const d = m.end - m.start;
      units.push(m.el === '.' ? d : d / 3);
    }
    if (units.length < 3) return null;
    units.sort((a, b) => a - b);
    const med = units[Math.floor(units.length / 2)];
    return med > 0 ? 1200 / med : null;
  }

  Object.assign(MT, {
    CHARS, PROSIGNS, patternOf, decode, tokenize, sameToken, pretty,
    timing, standardTiming, buildSchedule, align, estimateWpm,
  });
})();
