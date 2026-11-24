// UI wiring for all panels.
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pretty = MT.pretty;

  let S = MT.loadSettings();
  let stats = MT.loadStats();
  const save = () => MT.saveSettings(S);
  const saveStats = () => MT.saveStats(stats);

  const tone = new MT.Tone();
  // During an exam the keyer runs at the exam speed regardless of the speed slider.
  let examOverride = null;
  const keyer = new MT.Keyer(tone, () => examOverride || S);
  function applyAudio() {
    tone.freq = S.freq;
    tone.setVolume(S.volume);
    tone.setKeepAwake(S.keepAwake);
  }
  applyAudio();

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  // ---------------- playback ----------------
  function stopPlayback() {
    tone.stopPlayback();
  }
  function play(text, cb = {}, t) {
    const tokens = MT.tokenize(text);
    const sch = MT.buildSchedule(tokens, t || MT.timing(S));
    const handle = tone.play(sch, cb);
    return { tokens, sch, handle };
  }

  // ---------------- tabs ----------------
  const panels = {};
  let active = null;
  const KEYING_TABS = new Set(['send', 'rhythm', 'free', 'exam']);

  function showTab(name) {
    if (active === name) return;
    stopPlayback();
    keyer.reset();
    if (active && panels[active] && panels[active].leave) panels[active].leave();
    active = name;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
    if (panels[name] && panels[name].enter) panels[name].enter();
  }
  $$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---------------- keyboard / keyer routing ----------------
  let capturing = null;
  const isTyping = (t) =>
    !!t && ((t.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(t.type)) ||
      t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

  function roleFor(code) {
    if (S.keyMode === 'straight') return code === S.keys.straight ? 'straight' : null;
    let r = code === S.keys.dit ? 'dit' : code === S.keys.dah ? 'dah' : null;
    if (r && S.swapPaddles) r = r === 'dit' ? 'dah' : 'dit';
    return r;
  }

  window.addEventListener('keydown', (e) => {
    if (capturing) {
      e.preventDefault();
      const cb = capturing;
      capturing = null;
      cb(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (e.ctrlKey && e.key === 'Enter' && active === 'receive') {
      e.preventDefault();
      panels.receive.check();
      return;
    }
    if (isTyping(e.target)) return;
    const role = roleFor(e.code);
    if (role && KEYING_TABS.has(active)) {
      e.preventDefault();
      if (!e.repeat) keyer.press(role, e.timeStamp);
      return;
    }
    if (e.code === 'Backspace' && panels[active] && panels[active].undo) {
      e.preventDefault();
      panels[active].undo();
    }
  });
  window.addEventListener('keyup', (e) => {
    const role = roleFor(e.code);
    if (!role) return;
    if (!isTyping(e.target)) e.preventDefault();
    keyer.release(role, e.timeStamp);
  });
  window.addEventListener('blur', () => keyer.releaseAll());

  keyer.on((type, d) => {
    const p = $('#panel-' + active);
    if (p) {
      $$('.lamp', p).forEach((l) => {
        if (type === 'down') l.classList.add('on');
        if (type === 'up') l.classList.remove('on');
      });
      $$('.live-el', p).forEach((l) => {
        if (type === 'element') l.textContent = pretty(d.buffer);
        if (type === 'char' || type === 'error') l.textContent = '';
      });
    }
    if (panels[active] && panels[active].onKeyer) panels[active].onKeyer(type, d);
  });

  // on-screen keys
  function padButton(label, role) {
    const b = document.createElement('button');
    b.className = 'pad-btn';
    b.textContent = label;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.classList.add('down');
      keyer.press(role, e.timeStamp);
    });
    const up = (e) => {
      b.classList.remove('down');
      keyer.release(role, e.timeStamp);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }
  function buildPads() {
    $$('.pad').forEach((pad) => {
      pad.innerHTML = '';
      if (S.keyMode === 'straight') pad.append(padButton('KEY', 'straight'));
      else pad.append(padButton('DIT', 'dit'), padButton('DAH', 'dah'));
    });
    const name = (c) => c.replace(/^Key/, '').replace(/^Digit/, '');
    const desc = S.keyMode === 'straight'
      ? `straight key (${name(S.keys.straight)})`
      : `paddles (dit ${name(S.keys.dit)}, dah ${name(S.keys.dah)})`;
    $$('.key-desc').forEach((s) => (s.textContent = desc));
    document.body.classList.toggle('mode-straight', S.keyMode === 'straight');
    document.body.classList.toggle('mode-paddle', S.keyMode !== 'straight');
  }

  // ---------------- shared widgets ----------------
  const CONTENT = [
    ['letters', 'Letters'], ['numbers', 'Numbers'], ['punctuation', 'Punctuation'], ['words', 'Words'],
    ['qcodes', 'Q codes'], ['abbr', 'Abbreviations'], ['callsigns', 'Call signs'], ['prosigns', 'Prosigns'],
    ['qso', 'QSO phrases'],
  ];
  function renderChips() {
    $$('.content-chips').forEach((c) => {
      c.innerHTML = '<span class="chips-label">Content</span>' +
        CONTENT.map(([k, l]) => `<button class="chip ${S.content[k] ? 'on' : ''}" data-k="${k}">${l}</button>`).join('');
    });
  }
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-k]');
    if (!chip) return;
    const k = chip.dataset.k;
    S.content[k] = !S.content[k];
    if (!Object.values(S.content).some(Boolean)) S.content.letters = true;
    save();
    renderChips();
    chip.blur();
  });

  $$('[data-hint]').forEach((cb) => {
    cb.checked = !!S.hints[cb.dataset.hint];
    cb.addEventListener('change', () => {
      S.hints[cb.dataset.hint] = cb.checked;
      save();
      cb.blur();
      if (panels[active] && panels[active].refresh) panels[active].refresh();
    });
  });

  // Blur buttons after a click so the space bar can be used as a key.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && KEYING_TABS.has(active)) b.blur();
  });

  function tokHtml(t, { text = true, morse = false, cls = '', extra = '' } = {}) {
    if (t === ' ') return '<span class="tok space"></span>';
    return `<span class="tok ${cls}"><b>${text ? esc(t) : '&nbsp;'}</b><i>${morse ? pretty(MT.patternOf(t)) : ''}</i>${extra}</span>`;
  }

  function renderDiff(ops) {
    let ok = 0;
    let total = 0;
    const cell = (v) => (v === undefined ? '' : v === ' ' ? '&nbsp;' : esc(v));
    const cols = ops.map((op) => {
      if (op.e !== undefined && op.e !== ' ') {
        total++;
        if (op.type === 'match') ok++;
      }
      return `<span class="col ${op.type}"><b>${cell(op.e)}</b><i>${cell(op.t)}</i></span>`;
    }).join('');
    const pct = total ? Math.round((100 * ok) / total) : 0;
    const cls = pct >= 90 ? 'good' : pct >= 70 ? 'ok' : 'bad';
    return `<div class="score ${cls}">${pct}%<small>${ok} / ${total} characters correct</small></div>
      <div class="diff-legend">Top row: what was sent · bottom row: what you typed. Red = wrong/missed, amber = extra.</div>
      <div class="diff">${cols}</div>`;
  }

  function recordStats(kind, pairs) {
    const st = stats[kind];
    for (const [expected, ok] of pairs) {
      if (!expected || expected === ' ') continue;
      const r = (st[expected] = st[expected] || { s: 0, e: 0 });
      r.s++;
      if (!ok) r.e++;
    }
    saveStats();
  }

  function weakHtml(kind) {
    const list = Object.entries(stats[kind])
      .filter(([, r]) => r.s >= 3 && r.e > 0)
      .map(([c, r]) => [c, r.e / r.s])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    if (!list.length) return '';
    return 'Weakest characters: ' + list.map(([c, p]) => `<b>${esc(c)}</b> ${Math.round(p * 100)}%`).join(' · ');
  }

  function glossaryHtml(text) {
    const g = MT.glossary(text);
    if (!g.length) return '';
    return g.map((x) => `<div class="gloss"><b>${esc(x.code)}${x.asked ? '?' : ''}</b>${esc(x.asked && x.question ? x.question : x.meaning)}<small>${x.kind}</small></div>`).join('');
  }

  // =====================================================================
  // RECEIVE
  // =====================================================================
  panels.receive = (() => {
    let text = '';
    let tokens = [];
    let revealed = -1;
    let revealAll = false;
    const hint = $('#rx-hint');
    const ans = $('#rx-answer');
    const res = $('#rx-result');
    const glos = $('#rx-glossary');

    function render() {
      if (!tokens.length) {
        hint.innerHTML = '<span class="muted">Press <b>New text</b> to start.</span>';
        return;
      }
      const showT = S.hints.rxShowText || revealAll;
      const showM = S.hints.rxShowMorse || revealAll;
      if (!showT && !showM) {
        const n = tokens.filter((t) => t !== ' ').length;
        const done = tokens.slice(0, revealed + 1).filter((t) => t !== ' ').length;
        hint.innerHTML = `<span class="muted">Hints are off — ${done} / ${n} characters played.</span>`;
        return;
      }
      hint.innerHTML = tokens
        .map((t, i) => (i > revealed && !revealAll ? '' : tokHtml(t, { text: showT, morse: showM, cls: i === revealed && !revealAll ? 'current' : '' })))
        .join('');
    }

    function replay() {
      if (!tokens.length) return newText();
      revealed = -1;
      render();
      play(text, {
        onMark: (m) => { revealed = m.i; render(); },
        onEnd: () => { revealed = tokens.length - 1; render(); },
      });
      ans.focus();
    }

    function newText() {
      text = MT.generate(S);
      tokens = MT.tokenize(text);
      revealAll = false;
      ans.value = '';
      res.innerHTML = '';
      glos.innerHTML = '';
      replay();
    }

    function check() {
      if (!tokens.length) return;
      const typed = MT.tokenize(ans.value);
      const ops = MT.align(tokens, typed);
      res.innerHTML = renderDiff(ops);
      recordStats('rx', ops.filter((o) => o.e !== undefined).map((o) => [o.e, o.type === 'match']));
      $('#rx-weak').innerHTML = weakHtml('rx');
      glos.innerHTML = S.hints.rxGlossary ? glossaryHtml(text) : '';
      revealAll = true;
      render();
    }

    $('#rx-new').addEventListener('click', newText);
    $('#rx-play').addEventListener('click', replay);
    $('#rx-stop').addEventListener('click', stopPlayback);
    $('#rx-reveal').addEventListener('click', () => { revealAll = true; render(); });
    $('#rx-check').addEventListener('click', check);

    return {
      check,
      refresh: render,
      enter() { render(); $('#rx-weak').innerHTML = weakHtml('rx'); },
    };
  })();

  // =====================================================================
  // SEND
  // =====================================================================
  panels.send = (() => {
    let tokens = [];
    let pos = 0;
    let results = [];
    let sawSpace = false;
    let spacing = 0;
    let marks = [];
    let t0 = null;
    let tEnd = null;
    let done = false;
    let transcript = [];
    const tgt = $('#tx-target');
    const copy = $('#tx-copy');
    const res = $('#tx-result');

    const nextIdx = (from) => {
      let i = from;
      while (i < tokens.length && tokens[i] === ' ') i++;
      return i < tokens.length ? i : -1;
    };

    function render() {
      if (!tokens.length) {
        tgt.innerHTML = '<span class="muted">Press <b>New text</b> to start.</span>';
        copy.textContent = '';
        return;
      }
      const cur = done ? -1 : nextIdx(pos);
      tgt.innerHTML = tokens.map((t, i) => {
        const r = results[i];
        let cls = r ? (r.ok ? 'ok' : 'bad') : i === cur ? 'current' : '';
        if (r && r.spaceMissing) cls += ' gap-miss';
        const morse = S.hints.txShowAll || (S.hints.txShowNext && i === cur) || (r && !r.ok);
        const extra = r && !r.ok ? `<u title="You sent">${esc(r.got)}</u>` : '';
        return tokHtml(t, { morse, cls, extra });
      }).join('');
      copy.textContent = transcript.join('');
    }

    function load(text) {
      tokens = MT.tokenize(text);
      restart();
      if (S.hints.txListenFirst) play(text);
    }

    function restart() {
      keyer.reset();
      pos = 0;
      results = [];
      sawSpace = false;
      spacing = 0;
      marks = [];
      t0 = null;
      tEnd = null;
      done = false;
      transcript = [];
      res.innerHTML = '';
      render();
    }

    function undo() {
      if (done) return;
      for (let i = pos - 1; i >= 0; i--) {
        if (results[i]) {
          if (results[i].spaceMissing) spacing = Math.max(0, spacing - 1);
          results[i] = undefined;
          pos = i;
          break;
        }
      }
      while (transcript.length && transcript[transcript.length - 1] === ' ') transcript.pop();
      transcript.pop();
      render();
    }

    function onKeyer(type, d) {
      if (!tokens.length || done) return;
      if (type === 'element') {
        if (t0 === null) t0 = d.start;
        tEnd = d.end;
        marks.push(d);
      } else if (type === 'char') {
        const idx = nextIdx(pos);
        if (idx < 0) return;
        const got = d.text || '?';
        const ok = d.pattern === MT.patternOf(tokens[idx]);
        const anySent = results.some(Boolean);
        const spaceMissing = idx > 0 && tokens[idx - 1] === ' ' && anySent && !sawSpace;
        if (spaceMissing) spacing++;
        results[idx] = { ok, got, spaceMissing };
        transcript.push(got);
        pos = idx + 1;
        sawSpace = false;
        render();
        if (nextIdx(pos) < 0) finish();
      } else if (type === 'space') {
        sawSpace = true;
        transcript.push(' ');
        const idx = nextIdx(pos);
        if (pos > 0 && idx > 0 && tokens[idx - 1] !== ' ') spacing++; // gap inside a word
        render();
      } else if (type === 'error') {
        undo();
      }
    }

    function finish() {
      done = true;
      const sent = results.filter(Boolean);
      const ok = sent.filter((r) => r.ok).length;
      const pct = sent.length ? Math.round((100 * ok) / sent.length) : 0;
      const minutes = t0 !== null && tEnd ? (tEnd - t0) / 60000 : 0;
      const charCount = tokens.length; // includes spaces, standard 5-char word
      const overall = minutes > 0 ? charCount / 5 / minutes : null;
      const elem = MT.estimateWpm(marks);
      recordStats('tx', tokens.map((t, i) => [t, results[i] ? results[i].ok : false]).filter(([t]) => t !== ' '));
      $('#tx-weak').innerHTML = weakHtml('tx');
      const cls = pct >= 90 ? 'good' : pct >= 70 ? 'ok' : 'bad';
      res.innerHTML = `
        <div class="score ${cls}">${pct}%<small>${ok} / ${sent.length} characters keyed correctly</small></div>
        <div class="summary">
          <div class="stat"><div class="v">${elem ? elem.toFixed(1) : '—'}</div><div class="l">Element speed (WPM, from your dits/dahs)</div></div>
          <div class="stat"><div class="v">${overall ? overall.toFixed(1) : '—'}</div><div class="l">Overall speed incl. gaps (WPM)</div></div>
          <div class="stat"><div class="v">${S.wpm}</div><div class="l">Target speed (WPM)</div></div>
          <div class="stat"><div class="v ${spacing ? 'v-warn' : 'v-good'}">${spacing}</div><div class="l">Word spacing errors (words run together or split)</div></div>
        </div>
        <p class="muted small">Press <b>New text</b> for another, or <b>Restart</b> to try the same text again. Spacing problems? Try the Rhythm tab.</p>`;
      render();
    }

    $('#tx-new').addEventListener('click', () => load(MT.generate(S)));
    $('#tx-listen').addEventListener('click', () => tokens.length && play(tokens.join('')));
    $('#tx-stop').addEventListener('click', stopPlayback);
    $('#tx-restart').addEventListener('click', restart);

    return {
      onKeyer,
      undo,
      refresh: render,
      enter() {
        if (!tokens.length) load(MT.generate(S));
        else render();
        $('#tx-weak').innerHTML = weakHtml('tx');
      },
    };
  })();

  // =====================================================================
  // RHYTHM
  // =====================================================================
  panels.rhythm = (() => {
    const canvas = $('#rh-canvas');
    const status = $('#rh-status');
    const res = $('#rh-result');
    const IDEAL = { dot: 1, dash: 3, intra: 1, char: 3, word: 7 };
    const LABEL = {
      dot: 'Dit', dash: 'Dah', intra: 'Gap inside a character', char: 'Gap between characters', word: 'Gap between words',
    };
    let text = '';
    let ideal = null; // { segs, total, tones }
    let marks = [];
    let analysis = null;
    let finishTimer = null;
    let cursor = null; // { startAt, total }

    function t() { return MT.standardTiming(S.wpm); }

    function legend() {
      const u = t().u;
      const items = [
        ['Dit', '1 unit', [[1, 0]]],
        ['Dah', '3 units', [[3, 0]]],
        ['Gap inside character', '1 unit', [[1, 0], [1, 1], [1, 0]]],
        ['Gap between characters', '3 units', [[1, 0], [3, 1], [1, 0]]],
        ['Gap between words', '7 units', [[1, 0], [7, 1], [1, 0]]],
      ];
      const ms = { Dit: 1, Dah: 3, 'Gap inside character': 1, 'Gap between characters': 3, 'Gap between words': 7 };
      $('#rh-legend').innerHTML = items.map(([n, unit, viz]) => `
        <div class="tl-item"><b>${n}</b>
          <div class="viz">${viz.map(([w, g]) => `<span class="${g ? 'gap' : ''}" style="width:${w * 9}px"></span>`).join('')}</div>
          <small>${unit} = ${Math.round(ms[n] * u)} ms @ ${S.wpm} WPM</small></div>`).join('') +
        `<div class="tl-item"><b>Sentences</b><small>End with a period (·−·−·−) or &lt;BT&gt; (−···−), then a normal 7-unit word gap.</small></div>`;
    }

    function buildIdeal() {
      const sch = MT.buildSchedule(MT.tokenize(text), t());
      const segs = [];
      const tones = sch.tones;
      tones.forEach((tn, k) => {
        if (k > 0) {
          const prev = tones[k - 1];
          const gs = prev.start + prev.dur;
          const gd = tn.start - gs;
          const kind = prev.i === tn.i ? 'intra' : gd > 4 * t().u ? 'word' : 'char';
          segs.push({ type: 'gap', kind, start: gs, dur: gd });
        }
        segs.push({ type: 'mark', kind: tn.el === '.' ? 'dot' : 'dash', start: tn.start, dur: tn.dur });
      });
      ideal = { segs, total: sch.total, tones };
    }

    function renderTarget() {
      const toks = MT.tokenize(text);
      const pat = toks.map((x) => (x === ' ' ? ' / ' : pretty(MT.patternOf(x)))).join(' ');
      $('#rh-target').innerHTML = `<span class="txt">${esc(toks.join(''))}</span>` +
        (S.hints.rhShowIdeal ? `<span class="pat">${pat}</span>` : '');
    }

    function newTarget() {
      text = MT.rhythmTarget(S.rhythmUnit, S);
      buildIdeal();
      reset();
    }

    function reset() {
      clearTimeout(finishTimer);
      keyer.reset();
      marks = [];
      analysis = null;
      res.innerHTML = '';
      status.textContent = 'Key the target when ready — timing starts at your first key-down.';
      renderTarget();
      draw();
    }

    function userSegs() {
      if (!marks.length) return [];
      const base = marks[0].start;
      const segs = [];
      marks.forEach((m, k) => {
        if (k > 0) {
          const pe = marks[k - 1].end;
          segs.push({ type: 'gap', start: pe - base, dur: m.start - pe, kind: null });
        }
        segs.push({ type: 'mark', kind: m.el === '.' ? 'dot' : 'dash', start: m.start - base, dur: m.end - m.start });
      });
      return segs;
    }

    function analyze() {
      clearTimeout(finishTimer);
      if (marks.length === 0) return;
      const segs = userSegs();
      const dots = segs.filter((s) => s.kind === 'dot').map((s) => s.dur);
      const dashes = segs.filter((s) => s.kind === 'dash').map((s) => s.dur);
      const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      let userUnit = dots.length ? mean(dots) : dashes.length ? mean(dashes) / 3 : t().u;
      if (dots.length && dashes.length) userUnit = (mean(dots) * dots.length + (mean(dashes) / 3) * dashes.length) / (dots.length + dashes.length);

      // Classify gaps: use ideal's sequence when element counts line up, else thresholds.
      const idealGaps = ideal.segs.filter((s) => s.type === 'gap');
      const userGaps = segs.filter((s) => s.type === 'gap');
      const aligned = ideal.tones.length === marks.length && marks.every((m, k) => m.el === ideal.tones[k].el);
      userGaps.forEach((g, k) => {
        if (aligned) g.kind = idealGaps[k].kind;
        else g.kind = g.dur < 2 * userUnit ? 'intra' : g.dur < 5 * userUnit ? 'char' : 'word';
      });

      let errSum = 0;
      for (const s of segs) {
        s.units = s.dur / userUnit;
        s.err = s.units / IDEAL[s.kind] - 1;
        errSum += Math.min(1, Math.abs(s.err));
      }
      const score = Math.max(0, Math.round(100 * (1 - errSum / segs.length)));
      const rows = Object.keys(IDEAL).map((k) => {
        const list = segs.filter((s) => s.kind === k);
        if (!list.length) return null;
        const avgUnits = mean(list.map((s) => s.units));
        const avgMs = mean(list.map((s) => s.dur));
        const sd = Math.sqrt(mean(list.map((s) => (s.units - avgUnits) ** 2)));
        return { k, n: list.length, avgUnits, avgMs, sd, err: avgUnits / IDEAL[k] - 1 };
      }).filter(Boolean);

      const decoded = []; // decode from user's own char gaps
      let buf = '';
      segs.forEach((s) => {
        if (s.type === 'mark') buf += s.kind === 'dot' ? '.' : '-';
        else if (s.kind !== 'intra') {
          decoded.push(MT.decode(buf, true) || '?');
          if (s.kind === 'word') decoded.push(' ');
          buf = '';
        }
      });
      if (buf) decoded.push(MT.decode(buf, true) || '?');

      analysis = { segs, userUnit, score, rows, decoded: decoded.join(''), aligned };
      draw();
      renderAnalysis();
    }

    function verdict(err) {
      const a = Math.abs(err);
      if (a <= 0.15) return ['v-good', 'Spot on'];
      if (a <= 0.35) return ['v-warn', err > 0 ? 'A bit long' : 'A bit short'];
      return ['v-bad', err > 0 ? 'Too long' : 'Too short'];
    }

    function renderAnalysis() {
      const a = analysis;
      const wpm = 1200 / a.userUnit;
      const cls = a.score >= 85 ? 'good' : a.score >= 65 ? 'ok' : 'bad';
      const tips = [];
      for (const r of a.rows) {
        if (Math.abs(r.err) <= 0.2) continue;
        const want = IDEAL[r.k];
        const dir = r.err > 0 ? 'too long' : 'too short';
        const advice = {
          dot: 'Keep dits crisp and even.',
          dash: r.err > 0 ? 'Release dahs sooner.' : 'Hold dahs longer — a full three dits.',
          intra: r.err > 0 ? 'Flow the elements of each letter together.' : 'Leave a full dit of silence between elements.',
          char: r.err > 0 ? 'Shorten the pause between letters.' : 'Pause a little longer between letters — count “one-two-three”.',
          word: r.err > 0 ? 'Shorten the pause between words.' : 'Pause longer between words — about seven dits.',
        }[r.k];
        tips.push(`<li><b>${LABEL[r.k]}</b> is ${dir}: ${r.avgUnits.toFixed(1)} units instead of ${want}. ${advice}</li>`);
      }
      const consistency = a.rows.filter((r) => r.sd > 0.35 && r.n > 1);
      for (const r of consistency) tips.push(`<li><b>${LABEL[r.k]}</b> varies a lot (±${r.sd.toFixed(1)} units). Aim for the same length every time.</li>`);
      if (S.keyMode !== 'straight') tips.push('<li class="muted">Paddle mode times dits, dahs and element gaps for you — focus on letter and word gaps.</li>');
      const target = MT.tokenize(text).join('');
      const decodedOk = a.decoded.replace(/\s+/g, ' ').trim() === target;
      res.innerHTML = `
        <div class="score ${cls}">${a.score}<small>rhythm score / 100 (proportions measured against your own dit length)</small></div>
        <div class="summary">
          <div class="stat"><div class="v">${wpm.toFixed(1)}</div><div class="l">Your speed (WPM, from dit length)</div></div>
          <div class="stat"><div class="v">${S.wpm}</div><div class="l">Target speed (WPM)</div></div>
          <div class="stat"><div class="v ${decodedOk ? 'v-good' : 'v-bad'}" style="font-family:var(--mono)">${esc(a.decoded) || '—'}</div><div class="l">How a listener would copy your spacing</div></div>
        </div>
        <table class="rh-table">
          <tr><th>Element</th><th>Count</th><th>Ideal</th><th>Yours (units)</th><th>Yours (ms)</th><th>Ideal ms @ ${S.wpm} WPM</th><th>Verdict</th></tr>
          ${a.rows.map((r) => {
            const [vc, vt] = verdict(r.err);
            return `<tr><td>${LABEL[r.k]}</td><td>${r.n}</td><td>${IDEAL[r.k]}</td><td>${r.avgUnits.toFixed(2)}${r.n > 1 ? ` <span class="muted small">±${r.sd.toFixed(2)}</span>` : ''}</td><td>${Math.round(r.avgMs)}</td><td>${Math.round(IDEAL[r.k] * t().u)}</td><td class="${vc}">${vt}</td></tr>`;
          }).join('')}
        </table>
        ${tips.length ? `<ul class="tips">${tips.join('')}</ul>` : '<p class="v-good">Beautiful rhythm — try a longer phrase or a faster speed.</p>'}`;
      status.textContent = 'Analysed. Press “Try again” or “New”.';
    }

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth || 900;
      const H = 190;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const css = getComputedStyle(document.documentElement);
      const C = (n) => css.getPropertyValue(n).trim();
      const left = 70;
      const right = 16;
      const u = t().u;
      const us = analysis ? analysis.segs : userSegs();
      const userTotal = us.length ? us[us.length - 1].start + us[us.length - 1].dur : 0;
      const total = Math.max(ideal ? ideal.total : 0, userTotal, 7 * u) * 1.03;
      const sx = (W - left - right) / total;
      const yI = 40;
      const yU = 115;
      const bh = 22;

      g.font = '12px Segoe UI, sans-serif';
      g.fillStyle = C('--muted');
      g.fillText('Ideal', 12, yI + 15);
      g.fillText('You', 12, yU + 15);

      // unit grid
      if (u * sx >= 5) {
        g.strokeStyle = 'rgba(255,255,255,0.05)';
        g.lineWidth = 1;
        for (let x = 0; x <= total; x += u) {
          const px = Math.round(left + x * sx) + 0.5;
          g.beginPath(); g.moveTo(px, 22); g.lineTo(px, H - 12); g.stroke();
        }
      }

      if (ideal && S.hints.rhShowIdeal) {
        for (const s of ideal.segs) {
          const x = left + s.start * sx;
          const w = Math.max(1, s.dur * sx);
          if (s.type === 'mark') {
            g.fillStyle = C('--accent-2');
            g.fillRect(x, yI, w, bh);
          } else if (s.kind !== 'intra' && w > 18) {
            g.fillStyle = C('--muted');
            g.textAlign = 'center';
            g.fillText(IDEAL[s.kind] + 'u', x + w / 2, yI + 15);
            g.textAlign = 'left';
          }
        }
      } else if (ideal) {
        g.fillStyle = C('--muted');
        g.fillText('(hidden — enable the hint to see the ideal timeline)', left, yI + 15);
      }

      const colFor = (err) => {
        if (err === undefined) return C('--accent');
        const a = Math.abs(err);
        return a <= 0.15 ? C('--good') : a <= 0.35 ? C('--warn') : C('--bad');
      };
      for (const s of us) {
        const x = left + s.start * sx;
        const w = Math.max(1, s.dur * sx);
        if (s.type === 'mark') {
          g.fillStyle = colFor(s.err);
          g.fillRect(x, yU, w, bh);
        } else if (analysis) {
          g.strokeStyle = colFor(s.err);
          g.lineWidth = 2;
          g.setLineDash([3, 3]);
          g.beginPath(); g.moveTo(x + 1, yU + bh + 8); g.lineTo(x + w - 1, yU + bh + 8); g.stroke();
          g.setLineDash([]);
          if (w > 22) {
            g.fillStyle = colFor(s.err);
            g.textAlign = 'center';
            g.fillText(s.units.toFixed(1), x + w / 2, yU + bh + 24);
            g.textAlign = 'left';
          }
        }
      }

      g.fillStyle = C('--muted');
      g.fillText(`grid = 1 unit (${Math.round(u)} ms)`, W - 150, 14);

      if (cursor) {
        const el = performance.now() - cursor.startAt;
        if (el >= 0 && el <= cursor.total) {
          const px = left + el * sx;
          g.strokeStyle = C('--accent');
          g.lineWidth = 2;
          g.beginPath(); g.moveTo(px, yI - 8); g.lineTo(px, yI + bh + 8); g.stroke();
        }
      }
    }

    function playRef() {
      if (!text) return;
      const { sch, handle } = play(text, { onEnd: () => { cursor = null; draw(); } }, t());
      cursor = { startAt: handle.startAt, total: sch.total };
      const loop = () => {
        if (!cursor) return;
        draw();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    function onKeyer(type, d) {
      if (type === 'down') {
        if (analysis) { // start a fresh attempt automatically
          marks = [];
          analysis = null;
          res.innerHTML = '';
        }
        clearTimeout(finishTimer);
        status.textContent = 'Recording…';
      }
      if (type === 'element') {
        marks.push({ el: d.el, start: d.start, end: d.end });
        draw();
        clearTimeout(finishTimer);
        finishTimer = setTimeout(analyze, 7 * t().u * 1.6 + 900);
      }
    }

    $('#rh-unit').value = S.rhythmUnit;
    $('#rh-unit').addEventListener('change', (e) => { S.rhythmUnit = e.target.value; save(); e.target.blur(); newTarget(); });
    $('#rh-new').addEventListener('click', newTarget);
    $('#rh-play').addEventListener('click', playRef);
    $('#rh-reset').addEventListener('click', reset);
    $('#rh-analyze').addEventListener('click', analyze);
    window.addEventListener('resize', () => active === 'rhythm' && draw());

    return {
      onKeyer,
      refresh() { renderTarget(); draw(); },
      enter() {
        legend();
        if (!text) newTarget();
        else { buildIdeal(); renderTarget(); draw(); }
      },
      leave() { clearTimeout(finishTimer); cursor = null; },
      onSpeed() { legend(); if (text) { buildIdeal(); draw(); } },
    };
  })();

  // =====================================================================
  // FREE ROAM
  // =====================================================================
  panels.free = (() => {
    const copy = $('#fr-copy');
    let out = [];
    let marks = [];

    function renderCopy() {
      copy.textContent = out.join('');
      copy.scrollTop = copy.scrollHeight;
      const w = MT.estimateWpm(marks);
      $('#fr-speed').textContent = w ? `≈ ${w.toFixed(1)} WPM` : '';
    }
    function undo() {
      while (out.length && out[out.length - 1] === ' ') out.pop();
      out.pop();
      renderCopy();
    }
    function onKeyer(type, d) {
      if (type === 'element') {
        marks.push(d);
        if (marks.length > 60) marks.shift();
      } else if (type === 'char') {
        out.push(d.text || '?');
        renderCopy();
      } else if (type === 'space') {
        out.push(' ');
        renderCopy();
      } else if (type === 'error') undo();
    }
    $('#fr-clear').addEventListener('click', () => { out = []; marks = []; renderCopy(); });
    $('#fr-copybtn').addEventListener('click', () => {
      navigator.clipboard.writeText(out.join('')).then(() => toast('Copied'), () => toast('Copy failed'));
    });
    $('#fr-space').addEventListener('click', () => { out.push(' '); renderCopy(); });
    $('#fr-send-card').addEventListener('pointerdown', (e) => {
      if (!e.target.closest('textarea,input,button')) {
        if (document.activeElement) document.activeElement.blur();
        $('#fr-send-card').focus();
      }
    });

    // --- continuous receive stream ---
    let running = false;
    let played = [];
    let gapTimer = null;
    const playedEl = $('#fr-played');
    const typeEl = $('#fr-type');

    function renderPlayed() {
      playedEl.style.display = S.hints.frShowPlayed ? '' : 'none';
      playedEl.textContent = played.join('');
      playedEl.scrollTop = playedEl.scrollHeight;
    }
    function liveAcc() {
      const exp = played.filter((x, i) => !(x === ' ' && played[i - 1] === ' '));
      const typed = MT.tokenize(typeEl.value);
      if (!typed.length || !exp.length) { $('#fr-live-acc').textContent = ''; return; }
      // Only compare up to roughly what has been typed so far.
      const ops = MT.align(exp.slice(0, Math.min(exp.length, typed.length + 2)), typed);
      const n = ops.filter((o) => o.e && o.e !== ' ').length;
      const ok = ops.filter((o) => o.type === 'match' && o.e !== ' ').length;
      $('#fr-live-acc').textContent = n ? `${Math.round((100 * ok) / n)}% so far` : '';
    }
    function chunk() {
      if (!running) return;
      const txt = MT.generate(S, 4);
      const toks = MT.tokenize(txt);
      play(txt, {
        onMark: (m) => { played.push(toks[m.i]); renderPlayed(); },
        onEnd: () => {
          if (!running) return;
          played.push(' ');
          renderPlayed();
          gapTimer = setTimeout(chunk, MT.timing(S).wg);
        },
      });
    }
    function start() {
      stopStream();
      running = true;
      played = [];
      typeEl.value = '';
      $('#fr-result').innerHTML = '';
      $('#fr-live-acc').textContent = '';
      renderPlayed();
      chunk();
      typeEl.focus();
    }
    function stopStream() {
      running = false;
      clearTimeout(gapTimer);
      stopPlayback();
    }
    function checkStream() {
      stopStream();
      const exp = MT.tokenize(played.join(''));
      if (!exp.length) return;
      $('#fr-result').innerHTML = renderDiff(MT.align(exp, MT.tokenize(typeEl.value)));
      playedEl.style.display = '';
    }
    $('#fr-start').addEventListener('click', start);
    $('#fr-stop').addEventListener('click', stopStream);
    $('#fr-check').addEventListener('click', checkStream);
    typeEl.addEventListener('input', liveAcc);

    // --- text to morse ---
    const txt = $('#fr-text');
    const morseOut = $('#fr-text-morse');
    function renderMorse() {
      const toks = MT.tokenize(txt.value);
      morseOut.innerHTML = toks.map((x) => (x === ' ' ? '<span class="w">/</span>' : esc(pretty(MT.patternOf(x))))).join(' ');
    }
    txt.addEventListener('input', renderMorse);
    $('#fr-text-play').addEventListener('click', () => { stopStream(); play(txt.value); });
    $('#fr-text-stop').addEventListener('click', stopPlayback);

    return {
      onKeyer,
      undo,
      refresh: renderPlayed,
      enter() { renderPlayed(); renderCopy(); },
      leave() { stopStream(); },
    };
  })();

  // =====================================================================
  // REFERENCE
  // =====================================================================
  panels.reference = (() => {
    const body = $('#ref-body');
    const search = $('#ref-search');
    let view = 'chart';

    const cell = (c) => `<button class="cell" data-play="${esc(c)}"><b>${esc(c)}</b><span>${pretty(MT.patternOf(c))}</span></button>`;

    const views = {
      chart: () => {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        const nums = '1234567890'.split('');
        const punct = ['.', ',', '?', '/', '=', '+', '-', "'", '!', '(', ')', '&', ':', ';', '"', '@'];
        return `<p class="muted">Click any character to hear it.</p><div class="chart">
          <h4>Letters</h4>${letters.map(cell).join('')}
          <h4>Numbers</h4>${nums.map(cell).join('')}
          <h4>Punctuation</h4>${punct.map(cell).join('')}
          <h4>Prosigns</h4>${Object.keys(MT.PROSIGNS).map(cell).join('')}</div>`;
      },
      qcodes: () => `<p class="muted">Q codes are three-letter signals. Sent with a <code>?</code> they become a question. Click a row to hear it.</p>
        <table class="ref"><tr><th>Code</th><th>Statement</th><th>As a question (with ?)</th><th>Morse</th></tr>
        ${MT.QCODES.map(([c, m, q]) => `<tr data-play="${c}"><td>${c}</td><td>${esc(m)}</td><td>${esc(q)}</td><td class="pat">${pretty(MT.tokenize(c).map(MT.patternOf).join(' '))}</td></tr>`).join('')}</table>`,
      abbr: () => `<p class="muted">Common CW abbreviations used to keep contacts short. Click a row to hear it.</p>
        <table class="ref"><tr><th>Abbr.</th><th>Meaning</th><th>Morse</th></tr>
        ${MT.ABBR.map(([c, m]) => `<tr data-play="${c}"><td>${c}</td><td>${esc(m)}</td><td class="pat">${pretty(MT.tokenize(c).map(MT.patternOf).join(' '))}</td></tr>`).join('')}</table>`,
      prosigns: () => `<p class="muted">Prosigns are sent as one run-together character, written with a bar or in angle brackets.</p>
        <table class="ref"><tr><th>Prosign</th><th>Meaning</th><th>Morse</th></tr>
        ${MT.PROSIGN_INFO.map(([c, m]) => `<tr data-play="${esc(c)}"><td>${esc(c)}</td><td>${esc(m)}</td><td class="pat">${pretty(MT.patternOf(c))}</td></tr>`).join('')}</table>
        <h3>Cut numbers</h3><p class="muted">In contests and signal reports, some digits are shortened to letters — e.g. 599 is sent as 5NN.</p>
        <table class="ref"><tr><th>Digit</th><th>Sent as</th></tr>${MT.CUT_NUMBERS.map(([d, l]) => `<tr><td>${d}</td><td>${l}</td></tr>`).join('')}</table>`,
      timing: () => {
        const u = MT.standardTiming(S.wpm).u;
        return `<div class="prose">
        <h3>Standard timing (PARIS)</h3>
        <p>Every part of Morse is a multiple of one <b>unit</b> — the length of a dit. At ${S.wpm} WPM one unit is <b>${Math.round(u)} ms</b> (unit = 1200 ÷ WPM).</p>
        <table class="ref"><tr><th>Element</th><th>Length</th><th>@ ${S.wpm} WPM</th></tr>
          <tr><td>Dit</td><td>1 unit</td><td>${Math.round(u)} ms</td></tr>
          <tr><td>Dah</td><td>3 units</td><td>${Math.round(3 * u)} ms</td></tr>
          <tr><td>Gap inside a character</td><td>1 unit</td><td>${Math.round(u)} ms</td></tr>
          <tr><td>Gap between characters</td><td>3 units</td><td>${Math.round(3 * u)} ms</td></tr>
          <tr><td>Gap between words</td><td>7 units</td><td>${Math.round(7 * u)} ms</td></tr>
          <tr><td>Between sentences</td><td>period or &lt;BT&gt;, then 7 units</td><td></td></tr>
        </table>
        <p>The word <b>PARIS</b> is exactly 50 units including its trailing word gap, which is how WPM is defined.</p>
        <h3>Farnsworth spacing</h3>
        <p>Characters are sent at full speed but the gaps between characters and words are stretched, so you learn each letter's sound rather than counting dits. Enable it in Settings and set an effective speed lower than the character speed.</p>
        <h3>RST signal reports</h3>
        <table class="ref"><tr><th>Part</th><th>Scale</th><th>Meaning</th></tr>
          <tr><td>R — Readability</td><td>1–5</td><td>1 unreadable · 3 readable with difficulty · 5 perfectly readable</td></tr>
          <tr><td>S — Strength</td><td>1–9</td><td>1 faint · 5 fairly good · 9 extremely strong</td></tr>
          <tr><td>T — Tone</td><td>1–9</td><td>1 harsh, rough · 9 perfect pure tone (CW only)</td></tr>
        </table></div>`;
      },
      qso: () => `<div class="prose">
        <h3>A typical CW contact</h3>
        <p class="muted">Click a line to hear it.</p>
        <pre>${[
          'CQ CQ CQ DE VU2ABC VU2ABC K',
          'VU2ABC DE G4XYZ G4XYZ K',
          'G4XYZ DE VU2ABC GM OM TNX FER CALL <BT> UR RST 579 579 <BT> NAME RAJ RAJ <BT> QTH CHENNAI CHENNAI <BT> HW CPY? <AR> G4XYZ DE VU2ABC KN',
          'VU2ABC DE G4XYZ R R GM RAJ TNX FER RPT <BT> UR RST 599 5NN <BT> NAME TOM TOM <BT> QTH LONDON <BT> RIG IC7300 ES ANT DIPOLE <BT> WX CLOUDY <AR> VU2ABC DE G4XYZ KN',
          'G4XYZ DE VU2ABC FB TOM TNX FER QSO <BT> HPE CUL 73 <SK> G4XYZ DE VU2ABC TU',
          'VU2ABC DE G4XYZ TU 73 <SK> EE',
        ].map((l) => `<span data-play="${esc(l)}" style="cursor:pointer;display:block">${esc(l)}</span>`).join('')}</pre>
        <p>Calling CQ, exchanging RST, name and QTH, then signing off with 73 and &lt;SK&gt; is the backbone of most contacts. <b>K</b> invites anyone, <b>KN</b> only the station you're working.</p></div>`,
    };

    function render() {
      body.innerHTML = views[view]();
      filter();
    }
    function filter() {
      const q = search.value.trim().toLowerCase();
      $$('tr[data-play], .cell', body).forEach((r) => {
        r.style.display = !q || r.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }
    body.addEventListener('click', (e) => {
      const p = e.target.closest('[data-play]');
      if (p) play(p.dataset.play);
    });
    $$('.subtab').forEach((b) => b.addEventListener('click', () => {
      $$('.subtab').forEach((x) => x.classList.toggle('active', x === b));
      view = b.dataset.ref;
      render();
    }));
    search.addEventListener('input', () => {
      if (search.value && !['qcodes', 'abbr', 'prosigns', 'chart'].includes(view)) {
        // searching jumps to the most useful table
        $$('.subtab').forEach((x) => x.classList.toggle('active', x.dataset.ref === 'qcodes'));
        view = 'qcodes';
        render();
        return;
      }
      filter();
    });
    return { enter: render };
  })();

  // =====================================================================
  // EXAM MODE
  // =====================================================================
  panels.exam = (() => {
    const E = MT.exam;
    const HISTORY_KEY = 'morse-trainer.exam-history.v1';
    const STYLE_LABEL = { plain: 'Plain English', mixed: 'With numbers', ham: 'Ham messages' };
    const examTiming = MT.standardTiming(E.EXAM_WPM);
    const fmt = (ms) => {
      const s = Math.max(0, Math.round(ms / 1000));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    const setup = $('#ex-setup');
    const run = $('#ex-run');
    const result = $('#ex-result');
    const styleSel = $('#ex-style');
    const lenSel = $('#ex-length');
    const spacingCb = $('#ex-spacing');
    const rxType = $('#ex-rx-type');
    const liveRun = $('#ex-live-run');

    let mode = null; // 'rx' | 'tx' | null
    let durMs = 300000;
    let tick = null;
    let rx = null;
    let tx = null;

    // ---------- history ----------
    function loadHistory() {
      try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) { return []; }
    }
    function saveHistory(h) {
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50))); } catch (_) { /* ignore */ }
    }
    function renderHistory() {
      const h = loadHistory();
      $('#ex-history').innerHTML = h.length
        ? `<table><tr><th>When</th><th>Test</th><th>Text</th><th>Length</th><th>Result</th><th>Longest clean run</th><th>Accuracy</th></tr>
          ${h.slice(0, 15).map((r) => `<tr>
            <td>${esc(new Date(r.when).toLocaleString())}</td>
            <td>${r.kind === 'rx' ? 'Receiving' : 'Sending'}</td>
            <td>${esc(STYLE_LABEL[r.style] || r.style)}</td>
            <td>${fmt(r.length)}</td>
            <td class="${r.pass ? 'v-good' : 'v-bad'}"><b>${r.pass ? 'PASS' : 'FAIL'}</b></td>
            <td>${fmt(r.best)}${r.wpm ? ` @ ${r.wpm.toFixed(1)} WPM` : ''}</td>
            <td>${r.acc}%</td></tr>`).join('')}</table>`
        : '<p class="muted small">No attempts yet.</p>';
    }

    // ---------- options ----------
    function syncOptions() {
      styleSel.value = S.exam.style;
      lenSel.value = String(S.exam.length);
      spacingCb.checked = S.exam.spacing;
    }
    styleSel.addEventListener('change', () => { S.exam.style = styleSel.value; save(); });
    lenSel.addEventListener('change', () => { S.exam.length = +lenSel.value; save(); });
    spacingCb.addEventListener('change', () => { S.exam.spacing = spacingCb.checked; save(); });

    // ---------- shared run state ----------
    function setProgress(f) {
      $('#ex-progress-fill').style.width = `${Math.max(0, Math.min(1, f)) * 100}%`;
    }

    function begin(kind) {
      stopPlayback();
      keyer.reset();
      mode = kind;
      durMs = S.exam.length * 1000;
      result.innerHTML = '';
      setup.hidden = true;
      run.hidden = false;
      $('#ex-rx-area').hidden = kind !== 'rx';
      $('#ex-tx-area').hidden = kind !== 'tx';
      $('.ex-clean').style.visibility = kind === 'tx' ? 'visible' : 'hidden';
      liveRun.textContent = '0:00';
      liveRun.classList.remove('met');
      setProgress(0);
      clearInterval(tick);
      tick = setInterval(update, 250);
    }

    function end() {
      clearInterval(tick);
      tick = null;
      mode = null;
      if (rx) clearTimeout(rx.grace);
      examOverride = null;
      keyer.reset();
      setup.hidden = false;
      run.hidden = true;
    }

    function update() {
      const now = performance.now();
      if (mode === 'rx' && rx && rx.handle && !rx.ended) {
        const el = now - rx.startAt;
        if (el < 0) {
          $('#ex-run-title').textContent = 'Receiving test · warm-up: VVV (not scored, don’t type it)';
          $('#ex-clock').textContent = fmt(rx.sch.total);
        } else {
          $('#ex-run-title').textContent = 'Receiving test · 8 WPM';
          $('#ex-clock').textContent = fmt(rx.sch.total - el);
          setProgress(el / rx.sch.total);
        }
      }
      if (mode === 'tx' && tx && tx.t0 !== null) {
        const el = now - tx.t0;
        $('#ex-clock').textContent = fmt(durMs - el);
        setProgress(el / durMs);
        let start = null;
        for (const ev of tx.events) {
          if (ev.type === 'char' && ev.ok) { if (start === null) start = ev.start; } else start = null;
        }
        const cur = start === null ? 0 : now - start;
        liveRun.textContent = fmt(cur);
        liveRun.classList.toggle('met', cur >= E.CLEAN_MS);
        if (el >= durMs) finish();
      }
    }

    // ---------- receiving ----------
    function startRx() {
      begin('rx');
      const approxChars = Math.ceil((durMs / 60000) * E.EXAM_WPM * 5 * 1.8) + 40;
      const fit = E.fitTokens(MT.tokenize(MT.examText(S.exam.style, approxChars)), durMs, examTiming);
      rx = { tokens: fit.tokens, sch: fit.sch, handle: null, startAt: Infinity, ended: false, grace: null };
      rxType.value = '';
      $('#ex-run-title').textContent = 'Receiving test · 8 WPM — get ready…';
      $('#ex-clock').textContent = fmt(fit.sch.total);
      rxType.focus();
      // An unscored "VVV" warm-up goes first, so an audio device that is still waking up
      // only loses the warm-up. Scoring and the clock start with the first real character.
      const pre = MT.tokenize('VVV ');
      const full = MT.buildSchedule([...pre, ' ', ...fit.tokens], examTiming);
      const offset = full.marks.find((m) => m.i === pre.length + 1).time;
      setTimeout(() => {
        if (mode !== 'rx') return;
        const p = play(`VVV ${rx.tokens.join('')}`, {
          onEnd: () => {
            if (mode !== 'rx') return;
            rx.ended = true;
            setProgress(1);
            $('#ex-clock').textContent = '0:00';
            $('#ex-run-title').textContent = 'Transmission over — finish typing, then press “Finish now” (auto in 20 s)';
            rx.grace = setTimeout(finish, 20000);
          },
        }, examTiming);
        rx.handle = p.handle;
        rx.startAt = p.handle.startAt + offset;
      }, 1500);
    }

    // ---------- sending ----------
    const nextIdx = (from) => {
      let i = from;
      while (i < tx.tokens.length && tx.tokens[i] === ' ') i++;
      return i < tx.tokens.length ? i : -1;
    };

    function renderTx() {
      const cur = nextIdx(tx.pos);
      $('#ex-tx-target').innerHTML = tx.tokens.map((t, i) => {
        const r = tx.results[i];
        const cls = r ? (r.ok ? 'ok' : 'bad') : i === cur ? 'current' : '';
        return tokHtml(t, { cls, extra: r && !r.ok ? `<u>${esc(r.got)}</u>` : '' });
      }).join('');
      const c = $('#ex-tx-target .tok.current');
      if (c) {
        const box = $('#ex-tx-target');
        const top = c.offsetTop - box.offsetTop;
        if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 60) box.scrollTop = top - 50;
      }
      $('#ex-tx-copy').textContent = tx.transcript.join('').slice(-48);
    }

    function startTx() {
      examOverride = { ...S, wpm: E.EXAM_WPM, farnsworth: false };
      begin('tx');
      tx = {
        tokens: MT.tokenize(MT.examText(S.exam.style, 700)),
        pos: 0, results: [], events: [], t0: null, sawSpace: false, transcript: [], charStart: null, lastEnd: null,
      };
      $('#ex-run-title').textContent = 'Sending test · 8 WPM — the clock starts on your first key-down';
      $('#ex-clock').textContent = fmt(durMs);
      if (document.activeElement) document.activeElement.blur();
      renderTx();
    }

    function onKeyer(type, d) {
      if (mode !== 'tx' || !tx) return;
      if (type === 'down' && tx.t0 === null) {
        tx.t0 = d.t;
        $('#ex-run-title').textContent = 'Sending test · 8 WPM';
      }
      if (tx.t0 === null) return;
      if (type === 'element') {
        if (tx.charStart === null) tx.charStart = d.start;
        tx.lastEnd = d.end;
      } else if (type === 'char') {
        const idx = nextIdx(tx.pos);
        if (idx < 0) return;
        const got = d.text || '?';
        const ok = d.pattern === MT.patternOf(tx.tokens[idx]);
        const wordStart = idx > 0 && tx.tokens[idx - 1] === ' ';
        const start = tx.charStart !== null ? tx.charStart : d.end;
        if (wordStart && tx.results.some(Boolean) && !tx.sawSpace && S.exam.spacing) {
          tx.events.push({ type: 'error', t: start, why: 'words run together' });
        }
        tx.results[idx] = { ok, got };
        tx.events.push({ type: 'char', ok, pattern: d.pattern, start, end: d.end || tx.lastEnd, wordStart, idx });
        tx.transcript.push(got);
        tx.pos = idx + 1;
        tx.sawSpace = false;
        tx.charStart = null;
        renderTx();
        if (nextIdx(tx.pos) < 0) finish();
      } else if (type === 'space') {
        tx.sawSpace = true;
        tx.transcript.push(' ');
        const idx = nextIdx(tx.pos);
        if (tx.pos > 0 && idx > 0 && tx.tokens[idx - 1] !== ' ' && S.exam.spacing) {
          tx.events.push({ type: 'error', t: performance.now(), why: 'gap inside a word' });
        }
        renderTx();
      } else if (type === 'error') {
        undo();
      }
    }

    // Error signal (8 dits) or Backspace: counts as an error, then removes the last character.
    function undo() {
      if (mode !== 'tx' || !tx || tx.t0 === null) return;
      tx.events.push({ type: 'error', t: performance.now(), why: 'error signal' });
      for (let i = tx.pos - 1; i >= 0; i--) {
        if (tx.results[i]) {
          tx.results[i] = undefined;
          tx.pos = i;
          break;
        }
      }
      while (tx.transcript.length && tx.transcript[tx.transcript.length - 1] === ' ') tx.transcript.pop();
      tx.transcript.pop();
      tx.charStart = null;
      renderTx();
    }

    // ---------- finish & results ----------
    function finish() {
      if (!mode) return;
      const kind = mode;
      let res = null;
      let detail = '';
      let endedEarly = false;
      if (kind === 'rx') {
        clearTimeout(rx.grace);
        let { tokens, sch } = rx;
        if (!rx.ended) {
          endedEarly = true;
          const el = rx.handle ? performance.now() - rx.startAt : -1;
          const played = sch.marks.filter((m) => !m.space && m.time + 1 <= el).map((m) => m.i);
          tokens = played.length ? tokens.slice(0, played[played.length - 1] + 1) : [];
          sch = MT.buildSchedule(tokens, examTiming);
          stopPlayback();
        }
        if (tokens.length) {
          // If the warm-up VVV was typed anyway, don't count it.
          const typed = rxType.value.replace(/^\s*V\s*V\s*V\b/i, '');
          res = E.scoreReceive(tokens, sch, typed);
          detail = `<h3>What was sent vs. what you typed</h3>${renderDiff(res.ops)}`;
        }
      } else if (tx.t0 !== null) {
        const now = performance.now();
        endedEarly = now - tx.t0 < durMs - 500;
        res = E.scoreSend(tx.events, tx.t0, Math.min(now, tx.t0 + durMs));
        res.spacingErrors = tx.events.filter((e) => e.type === 'error' && e.why !== 'error signal').length;
        res.errorSignals = tx.events.filter((e) => e.why === 'error signal').length;
        const last = tx.pos;
        detail = `<h3>Your sending</h3><div class="tokens">${tx.tokens.slice(0, last).map((t, i) => {
          const r = tx.results[i];
          return tokHtml(t, { cls: r ? (r.ok ? 'ok' : 'bad') : '', extra: r && !r.ok ? `<u>${esc(r.got)}</u>` : '' });
        }).join('')}</div>`;
      }
      end();
      showResult(kind, res, detail, endedEarly);
    }

    function showResult(kind, res, detail, endedEarly) {
      if (!res) {
        result.innerHTML = '<p class="muted">The test was stopped before anything was sent.</p>';
        return;
      }
      const best = res.best;
      // Round speeds down for display so 7.96 never shows as a passing "8.0".
      const wpmTxt = (w) => (Math.floor(w * 10 + 1e-6) / 10).toFixed(1);
      const minuteWpm = best && best.minute ? best.minute.wpm : null;
      const bestDur = best ? best.dur : 0;
      const acc = res.count ? Math.round((100 * res.correct) / res.count) : 0;
      const why = [];
      if (bestDur < E.CLEAN_MS) why.push(`Your longest error-free stretch was ${fmt(bestDur)}. You need at least 1:00.`);
      else if (!res.pass && kind === 'tx') why.push(`Your fastest error-free minute was ${wpmTxt(res.fastestMinute ? res.fastestMinute.wpm : 0)} WPM. The minimum is ${E.MIN_SEND_WPM} WPM.`);
      if (endedEarly) why.push(`The test ended early, at ${fmt(res.total)} of ${fmt(durMs)}.`);

      const D = Math.max(res.total, 1);
      const ticks = [];
      for (let m = 60000; m < D; m += 60000) ticks.push(`<div class="min" style="left:${(m / D) * 100}%"></div>`);
      const timeline = `<div class="timeline">${ticks.join('')}
          ${best ? `<div class="run" style="left:${(best.start / D) * 100}%;width:${(best.dur / D) * 100}%"></div>` : ''}
          ${res.errors.map((t) => `<div class="err" style="left:${Math.min(99.6, (t / D) * 100)}%"></div>`).join('')}</div>
        <div class="timeline-labels"><span>0:00</span><span>green = longest clean stretch · red = errors</span><span>${fmt(D)}</span></div>`;

      const stats = [
        [fmt(bestDur), 'Longest error-free stretch (need 1:00)', bestDur >= E.CLEAN_MS ? 'v-good' : 'v-bad'],
        [String(res.errors.length), 'Errors', res.errors.length ? 'v-warn' : 'v-good'],
        [`${acc}%`, kind === 'rx' ? `Characters copied correctly (${res.correct}/${res.count})` : `Characters keyed correctly (${res.correct}/${res.count})`, ''],
      ];
      if (kind === 'tx') {
        stats.push([minuteWpm !== null ? wpmTxt(minuteWpm) : '—', `Fastest error-free minute (WPM, need ${E.MIN_SEND_WPM})`, minuteWpm !== null && minuteWpm >= E.MIN_SEND_WPM - 1e-9 ? 'v-good' : 'v-bad']);
        stats.push([wpmTxt(res.overallWpm), 'Overall sending speed (WPM)', '']);
        stats.push([`${res.errorSignals} / ${res.spacingErrors}`, 'Error signals / spacing mistakes', '']);
      } else if (res.extras) {
        stats.push([String(res.extras), 'Extra characters typed', 'v-warn']);
      }

      result.innerHTML = `
        <div class="verdict">
          <span class="badge ${res.pass ? 'pass' : 'fail'}">${res.pass ? 'PASS' : 'FAIL'}</span>
          <div><b>${kind === 'rx' ? 'Receiving' : 'Sending'} test</b> · ${esc(STYLE_LABEL[S.exam.style])} · 8 WPM
            ${why.length ? `<div class="muted small">${why.map(esc).join(' ')}</div>` : '<div class="muted small">You had at least one full minute without errors.</div>'}</div>
          <span class="spacer"></span>
          <button id="ex-again" class="primary">Try another ${kind === 'rx' ? 'receiving' : 'sending'} test</button>
        </div>
        ${timeline}
        <div class="summary">${stats.map(([v, l, c]) => `<div class="stat"><div class="v ${c}">${v}</div><div class="l">${l}</div></div>`).join('')}</div>
        ${detail}`;
      $('#ex-again').addEventListener('click', () => (kind === 'rx' ? startRx() : startTx()));

      const h = loadHistory();
      h.unshift({
        when: Date.now(), kind, style: S.exam.style, length: res.total, pass: res.pass,
        best: bestDur, wpm: minuteWpm !== null ? Math.floor(minuteWpm * 10 + 1e-6) / 10 : null, acc,
      });
      saveHistory(h);
      renderHistory();
    }

    function abort() {
      if (!mode) return;
      stopPlayback();
      end();
      result.innerHTML = '<p class="muted">Test aborted — nothing was recorded.</p>';
    }

    $('#ex-start-rx').addEventListener('click', startRx);
    $('#ex-start-tx').addEventListener('click', startTx);
    $('#ex-finish').addEventListener('click', finish);
    $('#ex-abort').addEventListener('click', abort);
    $('#ex-clear-history').addEventListener('click', () => { saveHistory([]); renderHistory(); });

    return {
      onKeyer,
      undo,
      enter() { syncOptions(); renderHistory(); },
      leave() { abort(); },
    };
  })();

  // =====================================================================
  // SETTINGS + HEADER
  // =====================================================================
  const prettyCode = (c) => (c || '—').replace(/^Key/, '').replace(/^Digit/, '');

  function syncSettingsUI() {
    $('#hdr-wpm').value = S.wpm;
    $('#hdr-wpm-val').textContent = S.wpm;
    $('#hdr-eff').textContent = S.farnsworth && S.effWpm < S.wpm ? `(eff ${S.effWpm})` : '';
    $('#hdr-keymode').value = S.keyMode;
    $('#set-wpm').value = S.wpm;
    $('#set-farnsworth').checked = S.farnsworth;
    $('#set-eff').value = S.effWpm;
    $('#set-eff').disabled = !S.farnsworth;
    $('#set-freq').value = S.freq;
    $('#set-freq-val').textContent = S.freq;
    $('#set-vol').value = S.volume;
    $('#set-vol-val').textContent = Math.round(S.volume * 100) + '%';
    $('#set-sidetone').checked = S.sidetone;
    $('#set-keepawake').checked = S.keepAwake;
    $('#set-keymode').value = S.keyMode;
    $('#set-swap').checked = S.swapPaddles;
    $('#set-adaptive').checked = S.adaptive;
    $('#set-prosign').checked = S.prosignDecode;
    $('#set-errbs').checked = S.errorBackspace;
    $('#set-count').value = S.count;
    $('#set-group').value = S.groupSize;
    $('#set-chars').value = S.customChars;
    $('#bind-straight').textContent = prettyCode(S.keys.straight);
    $('#bind-dit').textContent = prettyCode(S.keys.dit);
    $('#bind-dah').textContent = prettyCode(S.keys.dah);
    const t = MT.timing(S);
    $('#set-timing').textContent = `Dit ${Math.round(t.u)} ms · dah ${Math.round(t.dash)} ms · letter gap ${Math.round(t.cg)} ms · word gap ${Math.round(t.wg)} ms`;
    $$('[data-hint]').forEach((cb) => (cb.checked = !!S.hints[cb.dataset.hint]));
    $('#rh-unit').value = S.rhythmUnit;
  }

  function setSpeed(w) {
    S.wpm = Math.max(5, Math.min(50, Math.round(+w || 8)));
    if (S.effWpm > S.wpm) S.effWpm = S.wpm;
    save();
    keyer.resetAdaptive();
    syncSettingsUI();
    if (panels.rhythm.onSpeed) panels.rhythm.onSpeed();
  }

  function setKeyMode(m) {
    S.keyMode = m;
    save();
    keyer.reset();
    buildPads();
    syncSettingsUI();
  }

  $('#hdr-wpm').addEventListener('input', (e) => setSpeed(e.target.value));
  $('#hdr-wpm').addEventListener('change', (e) => e.target.blur());
  $('#hdr-keymode').addEventListener('change', (e) => { setKeyMode(e.target.value); e.target.blur(); });
  $('#set-wpm').addEventListener('change', (e) => setSpeed(e.target.value));
  $('#set-farnsworth').addEventListener('change', (e) => { S.farnsworth = e.target.checked; save(); keyer.resetAdaptive(); syncSettingsUI(); });
  $('#set-eff').addEventListener('change', (e) => {
    S.effWpm = Math.max(2, Math.min(S.wpm, Math.round(+e.target.value || 5)));
    save();
    syncSettingsUI();
  });
  $('#set-freq').addEventListener('input', (e) => { S.freq = +e.target.value; save(); applyAudio(); syncSettingsUI(); });
  $('#set-vol').addEventListener('input', (e) => { S.volume = +e.target.value; save(); applyAudio(); syncSettingsUI(); });
  $('#set-sidetone').addEventListener('change', (e) => { S.sidetone = e.target.checked; save(); });
  $('#set-keepawake').addEventListener('change', (e) => { S.keepAwake = e.target.checked; save(); applyAudio(); });
  $('#set-test').addEventListener('click', () => play('VVV'));
  $('#set-keymode').addEventListener('change', (e) => setKeyMode(e.target.value));
  $('#set-swap').addEventListener('change', (e) => { S.swapPaddles = e.target.checked; save(); });
  $('#set-adaptive').addEventListener('change', (e) => { S.adaptive = e.target.checked; save(); keyer.resetAdaptive(); });
  $('#set-prosign').addEventListener('change', (e) => { S.prosignDecode = e.target.checked; save(); });
  $('#set-errbs').addEventListener('change', (e) => { S.errorBackspace = e.target.checked; save(); });
  $('#set-count').addEventListener('change', (e) => { S.count = Math.max(1, Math.min(60, +e.target.value || 8)); save(); syncSettingsUI(); });
  $('#set-group').addEventListener('change', (e) => { S.groupSize = Math.max(1, Math.min(10, +e.target.value || 5)); save(); syncSettingsUI(); });
  $('#set-chars').addEventListener('change', (e) => { S.customChars = e.target.value.toUpperCase(); save(); syncSettingsUI(); });

  $$('[data-bind]').forEach((b) => b.addEventListener('click', () => {
    const role = b.dataset.bind;
    const kbd = $('#bind-' + role);
    kbd.textContent = 'Press a key…';
    kbd.classList.add('listening');
    b.blur();
    capturing = (code) => {
      kbd.classList.remove('listening');
      if (code) {
        S.keys[role] = code;
        save();
        buildPads();
        toast(`${role === 'straight' ? 'Straight key' : role === 'dit' ? 'Dit paddle' : 'Dah paddle'} → ${prettyCode(code)}`);
      }
      syncSettingsUI();
    };
  }));

  $('#set-reset-stats').addEventListener('click', () => {
    stats = { rx: {}, tx: {} };
    saveStats();
    $('#rx-weak').innerHTML = '';
    $('#tx-weak').innerHTML = '';
    toast('Character statistics cleared');
  });
  $('#set-reset-all').addEventListener('click', () => {
    S = JSON.parse(JSON.stringify(MT.DEFAULTS));
    save();
    applyAudio();
    keyer.reset();
    buildPads();
    renderChips();
    syncSettingsUI();
    toast('Defaults restored');
  });

  // Create the audio engine up front so the first key press is not delayed.
  try { tone.ensure(); } catch (_) { /* resumes on first interaction */ }
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => tone.ensure(), { once: true, capture: true }));

  // ---------------- boot ----------------
  syncSettingsUI();
  buildPads();
  renderChips();
  showTab('receive');
})();
