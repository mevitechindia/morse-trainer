// Web Audio sidetone: scheduled playback and live keying.
(function () {
  'use strict';
  const MT = (window.MT = window.MT || {});
  const RAMP = 0.005; // 5 ms rise/fall to avoid key clicks

  class Tone {
    constructor() {
      this.ctx = null;
      this.freq = 600;
      this.volume = 0.5;
      this.live = null;
      this.playback = null;
      this.keepAwake = true;
      this.keepAliveNode = null;
    }

    ensure() {
      if (!this.ctx) {
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.setVolume(this.volume);
        if (this.keepAwake) this._startKeepAlive();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }

    // Many outputs (Bluetooth headsets, USB audio, laptop codecs with power saving) go to
    // sleep during digital silence and clip the first second or two of sound when they
    // wake. A continuous, inaudible noise floor (about -80 dBFS) keeps them awake.
    setKeepAwake(on) {
      this.keepAwake = !!on;
      if (!this.ctx) return;
      if (on) this._startKeepAlive();
      else if (this.keepAliveNode) {
        this.keepAliveNode.stop();
        this.keepAliveNode.disconnect();
        this.keepAliveNode = null;
      }
    }

    _startKeepAlive() {
      if (this.keepAliveNode) return;
      const ctx = this.ctx;
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 1e-4;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(ctx.destination);
      src.start();
      this.keepAliveNode = src;
    }

    setVolume(v) {
      this.volume = v;
      if (this.master) this.master.gain.value = v * v;
    }

    _voice() {
      const ctx = this.ensure();
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = this.freq;
      const env = ctx.createGain();
      env.gain.value = 0;
      osc.connect(env).connect(this.master);
      return { osc, env };
    }

    // ---- live keying ----
    on() {
      if (this.live) return;
      const v = this._voice();
      const now = this.ctx.currentTime;
      v.env.gain.setValueAtTime(0, now);
      v.env.gain.linearRampToValueAtTime(1, now + RAMP);
      v.osc.start(now);
      this.live = v;
    }

    off() {
      if (!this.live) return;
      const { osc, env } = this.live;
      const now = this.ctx.currentTime;
      env.gain.cancelScheduledValues(now);
      env.gain.setValueAtTime(env.gain.value, now);
      env.gain.linearRampToValueAtTime(0, now + RAMP);
      osc.stop(now + RAMP + 0.02);
      this.live = null;
    }

    // ---- scheduled playback ----
    // schedule from MT.buildSchedule. Returns { stop, startAt (performance.now ms) }.
    play(schedule, cb = {}) {
      this.stopPlayback();
      const ctx = this.ensure();
      const { osc, env } = this._voice();
      const lead = 0.08;
      const t0 = ctx.currentTime + lead;
      for (const tn of schedule.tones) {
        const s = t0 + tn.start / 1000;
        const e = s + tn.dur / 1000;
        env.gain.setValueAtTime(0, s);
        env.gain.linearRampToValueAtTime(1, s + RAMP);
        env.gain.setValueAtTime(1, e);
        env.gain.linearRampToValueAtTime(0, e + RAMP);
      }
      osc.start(t0);
      osc.stop(t0 + schedule.total / 1000 + 0.1);

      const timers = [];
      const delay = lead * 1000;
      if (cb.onMark) for (const m of schedule.marks) timers.push(setTimeout(() => cb.onMark(m), delay + m.time));
      if (cb.onTone) for (const tn of schedule.tones) timers.push(setTimeout(() => cb.onTone(tn), delay + tn.start));
      timers.push(setTimeout(() => {
        if (this.playback === handle) this.playback = null;
        cb.onEnd && cb.onEnd();
      }, delay + schedule.total + 30));

      const handle = {
        startAt: performance.now() + delay,
        stop: () => {
          timers.forEach(clearTimeout);
          try {
            const now = ctx.currentTime;
            env.gain.cancelScheduledValues(now);
            env.gain.setValueAtTime(env.gain.value, now);
            env.gain.linearRampToValueAtTime(0, now + RAMP);
            osc.stop(now + RAMP + 0.02);
          } catch (_) { /* already stopped */ }
          if (this.playback === handle) this.playback = null;
          cb.onStop && cb.onStop();
        },
      };
      this.playback = handle;
      return handle;
    }

    stopPlayback() {
      if (this.playback) this.playback.stop();
    }
  }

  MT.Tone = Tone;
})();
