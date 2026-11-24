// Keyer: straight key (timed by you) and iambic paddles (mode A / B).
// Emits: 'down', 'up', 'element' {el,start,end,buffer}, 'char' {pattern,text,end}, 'space', 'error'.
(function () {
  'use strict';
  const MT = (window.MT = window.MT || {});
  const now = () => performance.now();

  class Keyer {
    constructor(tone, getSettings) {
      this.tone = tone;
      this.get = getSettings;
      this.listeners = new Set();
      this.charTimer = null;
      this.wordTimer = null;
      this.elTimer = null;
      this.reset();
    }

    on(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    emit(type, data = {}) {
      for (const fn of this.listeners) fn(type, data);
    }

    reset() {
      this._clearGapTimers();
      clearTimeout(this.elTimer);
      this.elTimer = null;
      this.tone.off();
      this.buffer = '';
      this.down = false;
      this.dotDown = this.dahDown = false;
      this.dotMem = this.dahMem = false;
      this.busy = false;
      this.lastEl = null;
      this.squeeze = false;
      this.lastEnd = 0;
      this.pendingSpace = false;
      this.resetAdaptive();
    }

    resetAdaptive() {
      const u = MT.timing(this.get()).u;
      this.dotAvg = u;
      this.dahAvg = 3 * u;
    }

    _straight() {
      return this.get().keyMode === 'straight';
    }

    _unit() {
      const s = this.get();
      const u = MT.timing(s).u;
      if (!this._straight() || !s.adaptive) return u;
      return (this.dotAvg + this.dahAvg / 3) / 2;
    }

    _thresholds() {
      const s = this.get();
      const t = MT.timing(s);
      const u = this._unit();
      const scale = u / t.u;
      return {
        dotDash: this._straight() && s.adaptive ? (this.dotAvg + this.dahAvg) / 2 : 2 * u,
        char: 2 * u,
        word: ((t.cg + t.wg) / 2) * scale,
      };
    }

    // role: 'straight' | 'dit' | 'dah'
    // t: event timestamp (performance.now timebase) so handler lag does not skew timing
    press(role, t) {
      if (this._straight()) {
        this._straightDown(t);
        return;
      }
      if (role === 'dit') {
        if (this.dotDown) return;
        this.dotDown = true;
        this.dotMem = true;
      } else if (role === 'dah') {
        if (this.dahDown) return;
        this.dahDown = true;
        this.dahMem = true;
      } else return;
      if (this.dotDown && this.dahDown) this.squeeze = true;
      if (!this.busy) {
        this._clearGapTimers();
        this._sendNext();
      }
    }

    release(role, t) {
      if (this._straight()) {
        this._straightUp(t);
        return;
      }
      if (role === 'dit') this.dotDown = false;
      if (role === 'dah') this.dahDown = false;
    }

    releaseAll() {
      if (this.down) this._straightUp();
      this.dotDown = this.dahDown = false;
      this.dotMem = this.dahMem = false;
    }

    // ---- straight key ----
    _straightDown(t) {
      if (this.down) return;
      this.down = true;
      this._clearGapTimers();
      this.markStart = t || now();
      if (this.get().sidetone) this.tone.on();
      this.emit('down', { t: this.markStart });
    }

    _straightUp(t) {
      if (!this.down) return;
      this.down = false;
      this.tone.off();
      const end = Math.max(this.markStart, t || now());
      const dur = end - this.markStart;
      this.emit('up', { t: end });
      if (dur < 12) return; // contact bounce / accidental tap
      const th = this._thresholds();
      const el = dur < th.dotDash ? '.' : '-';
      if (this.get().adaptive) {
        const u = MT.timing(this.get()).u;
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        if (el === '.') this.dotAvg = clamp(0.75 * this.dotAvg + 0.25 * dur, 0.3 * u, 2.5 * u);
        else this.dahAvg = clamp(0.75 * this.dahAvg + 0.25 * dur, 1.5 * u, 8 * u);
        if (this.dahAvg < 1.8 * this.dotAvg) this.dahAvg = 1.8 * this.dotAvg;
      }
      this._addElement(el, this.markStart, end);
      this._armGapTimers(end);
    }

    // ---- iambic paddles ----
    _choose() {
      const wantDot = this.dotDown || this.dotMem;
      const wantDah = this.dahDown || this.dahMem;
      if (wantDot && wantDah) return this.lastEl === '.' ? '-' : '.';
      if (wantDot) return '.';
      if (wantDah) return '-';
      if (this.get().keyMode === 'iambicB' && this.squeeze && this.lastEl) {
        this.squeeze = false;
        return this.lastEl === '.' ? '-' : '.';
      }
      return null;
    }

    _sendNext() {
      const el = this._choose();
      if (!el) {
        this.busy = false;
        this.nextAt = null;
        this.lastEl = null;
        this.squeeze = false;
        this._armGapTimers(this.lastEnd);
        return;
      }
      // Element times are kept on an exact grid (start of the next element = end of this
      // one + 1 unit) instead of whenever the timer happens to fire, so timer lateness
      // never accumulates and the keyer sends at exactly the set speed.
      const continuing = this.busy && this.nextAt != null;
      this.busy = true;
      this._clearGapTimers();
      if (el === '.') this.dotMem = false;
      else this.dahMem = false;
      this.squeeze = this.dotDown && this.dahDown;
      const u = MT.timing(this.get()).u;
      const start = continuing ? this.nextAt : now();
      const end = start + (el === '.' ? u : 3 * u);
      if (this.get().sidetone) this.tone.on();
      this.emit('down', { t: start });
      this.elTimer = setTimeout(() => {
        this.tone.off();
        this.emit('up', { t: end });
        this._addElement(el, start, end);
        this.lastEl = el;
        this.nextAt = end + u;
        this.elTimer = setTimeout(() => this._sendNext(), Math.max(0, this.nextAt - now()));
      }, Math.max(0, end - now()));
    }

    // ---- shared ----
    _addElement(el, start, end) {
      this.buffer += el;
      this.lastEnd = end;
      this.emit('element', { el, start, end, buffer: this.buffer });
    }

    _clearGapTimers() {
      clearTimeout(this.charTimer);
      clearTimeout(this.wordTimer);
      this.charTimer = this.wordTimer = null;
    }

    _armGapTimers(from) {
      this._clearGapTimers();
      const th = this._thresholds();
      const elapsed = now() - from;
      this.charTimer = setTimeout(() => this._flushChar(), Math.max(0, th.char - elapsed));
      this.wordTimer = setTimeout(() => {
        this._flushChar();
        if (this.pendingSpace) {
          this.pendingSpace = false;
          this.emit('space', {});
        }
      }, Math.max(0, th.word - elapsed));
    }

    _flushChar() {
      if (!this.buffer) return;
      const pattern = this.buffer;
      this.buffer = '';
      const s = this.get();
      if (s.errorBackspace && /^\.{7,}$/.test(pattern)) {
        this.emit('error', { pattern });
        return;
      }
      this.pendingSpace = true;
      this.emit('char', { pattern, text: MT.decode(pattern, s.prosignDecode), end: this.lastEnd });
    }
  }

  MT.Keyer = Keyer;
})();
