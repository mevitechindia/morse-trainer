// Scoring for the exam mode practice tests: find the longest error-free stretch.
(function () {
  'use strict';
  const MT = (window.MT = window.MT || {});

  const EXAM_WPM = 8;
  const CLEAN_MS = 60000; // 1 continuous minute without error
  const MIN_SEND_WPM = EXAM_WPM; // no tolerance: the clean minute must be at least 8 WPM

  // Cut a token list so its transmission fits within durMs, ending on a word boundary.
  function fitTokens(tokens, durMs, t) {
    const sch = MT.buildSchedule(tokens, t);
    let cut = tokens.length;
    if (sch.total > durMs) {
      cut = 0;
      for (const m of sch.marks) if (m.space && m.time - t.wg <= durMs) cut = m.i;
    }
    const out = tokens.slice(0, cut);
    return { tokens: out, sch: MT.buildSchedule(out, t) };
  }

  // Time span of each token in a schedule: {i: {start, end}}
  function spans(sch) {
    const s = {};
    for (const m of sch.marks) if (!m.space) s[m.i] = { start: m.time, end: m.time };
    for (const tn of sch.tones) s[tn.i].end = tn.start + tn.dur;
    return s;
  }

  // Receiving: tokens/sch = what was sent, typed = what the candidate typed.
  // Word spaces are ignored; any wrong, missing or extra character is an error.
  function scoreReceive(tokens, sch, typed) {
    const sp = spans(sch);
    const exp = [];
    tokens.forEach((t, i) => { if (t !== ' ') exp.push(i); });
    const got = MT.tokenize(typed).filter((t) => t !== ' ');
    const ops = MT.align(exp.map((i) => tokens[i]), got);
    const ok = new Array(exp.length).fill(false);
    const insBefore = new Set();
    let k = 0;
    for (const op of ops) {
      if (op.type === 'ins') insBefore.add(k);
      else { ok[k] = op.type === 'match'; k++; }
    }
    const errors = [];
    const runs = [];
    let from = null;
    const close = (to) => {
      if (from !== null && to >= from) {
        const start = sp[exp[from]].start;
        const end = sp[exp[to]].end;
        runs.push({ start, end, dur: end - start, chars: to - from + 1 });
      }
      from = null;
    };
    for (let j = 0; j < exp.length; j++) {
      if (insBefore.has(j) && j > 0) {
        close(j - 1);
        errors.push(sp[exp[j]].start);
      }
      if (ok[j]) {
        if (from === null) from = j;
      } else {
        close(j - 1);
        errors.push(sp[exp[j]].start);
      }
    }
    close(exp.length - 1);
    if (insBefore.has(exp.length)) errors.push(sch.total);
    const best = runs.reduce((a, r) => (!a || r.dur > a.dur ? r : a), null);
    const correct = ok.filter(Boolean).length;
    return {
      best,
      pass: !!best && best.dur >= CLEAN_MS,
      errors,
      total: sch.total,
      correct,
      count: exp.length,
      extras: ops.filter((o) => o.type === 'ins').length,
      ops: MT.align(tokens, MT.tokenize(typed)),
    };
  }

  // Length of a character in standard Morse units (dit 1, dah 3, 1 between elements).
  function charUnits(pattern) {
    let u = pattern.length - 1;
    for (const el of pattern) u += el === '.' ? 1 : 3;
    return u;
  }

  // Speed (WPM) of a sequence of keyed characters, measured the standard (PARIS) way:
  // how many units the text should take vs. how long it actually took, first key-down
  // to last key-up. Sending with perfect 8 WPM timing measures exactly 8.0.
  // chars: [{pattern, start, end, wordStart}]
  function speedOf(chars) {
    if (!chars.length) return 0;
    let units = 0;
    chars.forEach((c, k) => {
      if (k > 0) units += c.wordStart ? 7 : 3;
      units += charUnits(c.pattern);
    });
    const dur = chars[chars.length - 1].end - chars[0].start;
    return dur > 0 ? (1200 * units) / dur : 0;
  }

  // Sending: events in order.
  //   {type:'char', ok, pattern, start, end, wordStart}  (wordStart: first char of a target word)
  //   {type:'error', t}
  // t0 = first key-down, t1 = end of test.
  // Pass = some stretch of at least 1 minute with no errors, sent at 8 WPM or faster.
  function scoreSend(events, t0, t1) {
    const runs = [];
    const errors = [];
    let cur = null;
    const close = () => { if (cur) runs.push(cur); cur = null; };
    for (const ev of events) {
      if (ev.type === 'char' && ev.ok) {
        if (!cur) cur = [];
        cur.push(ev);
      } else {
        close();
        errors.push((ev.type === 'char' ? ev.start : ev.t) - t0);
      }
    }
    close();

    // For every clean run, look at each 1-minute (or just over) window and keep the fastest.
    const out = runs.map((chars) => {
      const r = {
        start: chars[0].start - t0,
        end: chars[chars.length - 1].end - t0,
        dur: chars[chars.length - 1].end - chars[0].start,
        wpm: speedOf(chars),
        minute: null, // fastest window of >= 1 minute inside this run
      };
      let j = 0;
      for (let i = 0; i < chars.length; i++) {
        if (j < i) j = i;
        while (j < chars.length && chars[j].end - chars[i].start < CLEAN_MS) j++;
        if (j >= chars.length) break;
        const w = chars.slice(i, j + 1);
        const wpm = speedOf(w);
        if (!r.minute || wpm > r.minute.wpm) {
          r.minute = { start: w[0].start - t0, end: w[w.length - 1].end - t0, dur: w[w.length - 1].end - w[0].start, wpm };
        }
      }
      return r;
    });

    const qualifying = out.filter((r) => r.minute && r.minute.wpm >= MIN_SEND_WPM - 1e-9);
    const longest = out.slice().sort((a, b) => b.dur - a.dur)[0] || null;
    const best = qualifying.sort((a, b) => b.dur - a.dur)[0] || longest;
    const fastestMinute = out.filter((r) => r.minute).map((r) => r.minute).sort((a, b) => b.wpm - a.wpm)[0] || null;
    const chars = events.filter((e) => e.type === 'char');
    return {
      best,
      fastestMinute,
      pass: qualifying.length > 0,
      errors,
      total: t1 - t0,
      overallWpm: speedOf(chars),
      correct: chars.filter((e) => e.ok).length,
      count: chars.length,
    };
  }

  MT.exam = { EXAM_WPM, CLEAN_MS, MIN_SEND_WPM, fitTokens, scoreReceive, scoreSend, speedOf, charUnits };
})();
