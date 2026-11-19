import { F, TURN, capacity, defaultGroups, dur, spans, clicks, num, angle, toSec, hz } from './engine.js';

export const CLICK = [[2700, 0.9], [1900, 0.5], [1250, 0.16]];
export const ABORT_TEXT = '소리가 멈춰서 중단했어요. 소리를 켜고 다시 해 주세요.';

/** A complete relative-time score, calculated once before any sound is scheduled. */
export function createAudioPlan(spec, options = {}) {
  const meter = spec.meter || spec.m;
  const groups = spec.groups || spec.g || (meter ? defaultGroups(meter) : null);
  const len = spec.len || (meter ? capacity(meter) : dur(spec.slot));
  const fill = spec.fill || [];
  const e8 = options.slow ? .45 : .3;
  const capS = toSec(len, e8);
  const lead = spec.slot ? 2 * e8 : capS;
  const parts = spans(fill);
  const events = [];
  if (spec.slot) {
    const full = Math.round((lead + 2 * capS) / e8);
    const cellCount = Math.round(capS / e8);
    for (let k = 0; k < full; k++) events.push({ type: 'click', time: k * e8, level: k === 2 || k === 2 + cellCount ? 1 : 2 });
    events.push({ type: 'tone', midi: 60, time: lead, duration: capS });
    for (const { s, note } of parts) events.push({ type: 'tone', midi: 72, time: lead + capS + toSec(s, e8), duration: toSec(dur(note), e8) });
  } else {
    const subs = options.subs !== false || options.kind === 'hear' || options.forceSubs;
    for (let k = 0; k < 3; k++) for (const ck of clicks(meter, groups)) {
      if (ck.level < 2 || subs) events.push({ type: 'click', time: k * capS + toSec(ck.t, e8), level: ck.level });
    }
    for (let k = 1; k < 3; k++) for (const { s, note } of parts) events.push({ type: 'tone', midi: 72, time: k * capS + toSec(s, e8), duration: toSec(dur(note), e8) });
  }
  return { events, lead, capS, len, parts, slot: !!spec.slot, end: lead + 2 * capS + .2, capA: num(angle(len, spec.turn || TURN)) };
}

/** One bar only. Taster timing is separate from regular preparation/repetition. */
export function createTasterPlan(spec, options = {}) {
  const meter = spec.meter || spec.m;
  const groups = spec.groups || spec.g || defaultGroups(meter);
  const len = capacity(meter), fill = spec.fill || [], parts = spans(fill);
  const e8 = options.slow ? .45 : .3, capS = toSec(len, e8);
  const beats = clicks(meter, groups).filter(x => x.level < 2).map((x, beatIndex) => ({ time: toSec(x.t, e8), level: x.level, beatIndex }));
  const events = beats.map(x => ({ type: 'click', time: x.time, level: x.level }));
  for (const { s, note } of parts) events.push({ type: 'tone', midi: 72, time: toSec(s, e8), duration: toSec(dur(note), e8) });
  return { events, beats, parts, len, lead: 0, end: capS, capS, slot: false, capA: num(angle(len, spec.turn || TURN)) };
}

export class AudioEngine {
  constructor({ onState = () => {}, onFrame = () => {}, onInterrupt = () => {} } = {}) {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.nodes = new Set();
    this.run = null;
    this.raf = 0;
    this.generation = 0;
    this.volume = .8;
    this.muted = false;
    this.onState = onState;
    this.onFrame = onFrame;
    this.onInterrupt = onInterrupt;
    this._visibility = () => { if (document.hidden && this.run) this._interrupt('hidden'); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._visibility);
  }

  get available() { return !!this.ctx && this.ctx.state === 'running' && !this.muted && this.volume > 0; }
  get playing() { return !!this.run; }

  _ensureAudio() {
    try {
      if (!this.ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) { this.onState(false); return null; }
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.master.connect(this.ctx.destination);
        this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.ctx.addEventListener('statechange', () => {
          this.onState(this.available);
          if (this.ctx.state !== 'running' && this.run && !this.run.perf) {
            if (this.run.owner === 'taster' && !(typeof document !== 'undefined' && document.hidden)) this._fallbackTasterClock();
            else this._interrupt('context');
          }
        });
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => this.onState(false));
      this.onState(this.available);
      return this.ctx;
    } catch { this.onState(false); return null; }
  }

  async unlock() {
    const ctx = this._ensureAudio();
    if (!ctx) return false;
    try { if (ctx.state !== 'running') await ctx.resume(); } catch { /* State remains visible in HUD. */ }
    this.onState(this.available);
    return this.available;
  }

  setVolume(volume = .8, muted = false) {
    this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    this.muted = !!muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, .015);
    this.onState(this.available);
  }

  _keep(node, extras) {
    this.nodes.add(node);
    node.addEventListener('ended', () => {
      this.nodes.delete(node);
      node.disconnect();
      extras.forEach(x => x.disconnect());
    }, { once: true });
  }

  _tone(midi, when, len) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    const hold = Math.max(.06, len * .86), peak = .3;
    o.type = 'triangle';
    o.frequency.setValueAtTime(hz(midi), when);
    g.gain.setValueAtTime(.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + .01);
    g.gain.setValueAtTime(peak * .8, when + hold - .04);
    g.gain.linearRampToValueAtTime(.0001, when + hold);
    o.connect(g); g.connect(this.master);
    this._keep(o, [g]);
    o.start(when); o.stop(when + hold + .03);
  }

  _click(when, level) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise;
    f.type = 'bandpass'; f.frequency.value = CLICK[level][0]; f.Q.value = 6;
    g.gain.setValueAtTime(CLICK[level][1], when);
    g.gain.exponentialRampToValueAtTime(.0001, when + .035);
    s.connect(f); f.connect(g); g.connect(this.master);
    this._keep(s, [f, g]);
    s.start(when); s.stop(when + .055);
  }

  _silence() {
    this.nodes.forEach(n => { try { n.stop(); } catch { /* A source may already have ended. */ } });
    this.nodes.clear();
  }

  play(spec, options = {}) {
    this.stop();
    const ctx = this._ensureAudio();
    if (options.volume !== undefined || options.muted !== undefined) this.setVolume(options.volume ?? this.volume, options.muted ?? this.muted);
    const soundOnly = options.kind === 'hear';
    if (soundOnly && (!ctx || this.muted || this.volume === 0)) {
      this.onInterrupt('sound-required', '이 주문은 소리가 필요해요. 소리를 켜 주세요.');
      return null;
    }
    const plan = createAudioPlan(spec, options);
    const t0 = (ctx ? ctx.currentTime : performance.now() / 1000) + .12;
    this.run = { ...plan, t0, kind: options.kind || 'bake', visual: !soundOnly, perf: !ctx, onEnd: options.onEnd, ctx0: ctx?.currentTime || 0, audioStarted: ctx?.state === 'running', p0: performance.now(), lastAt: performance.now(), lastNow: null, index: null };
    if (ctx) {
      try {
        for (const e of plan.events) {
          if (e.type === 'tone') this._tone(e.midi, t0 + e.time, e.duration);
          else this._click(t0 + e.time, e.level);
        }
      } catch {
        this._silence();
        if (soundOnly) { this._interrupt('sound-required'); return null; }
        this.run.perf = true;
        this.run.t0 = performance.now() / 1000 + .12;
        this.onState(false);
      }
    }
    this.raf = requestAnimationFrame(() => this._frame());
    return this.run;
  }

  /** Called by a trusted play button, never while adding or removing pieces.
   * We request audio activation but never await it. A late resume cannot add
   * notes to the visual-only run, nor can it revive a canceled run.
   */
  playTaster(spec, options = {}) {
    this.stop();
    if (options.volume !== undefined || options.muted !== undefined) this.setVolume(options.volume ?? this.volume, options.muted ?? this.muted);
    const ctx = !this.muted && this.volume > 0 ? this._ensureAudio() : this.ctx;
    const ready = !!ctx && ctx.state === 'running' && !this.muted && this.volume > 0;
    const plan = createTasterPlan(spec, options), wall = performance.now();
    // Short scheduling headroom is not a musical preparation bar. Visual-only
    // starts immediately; audible visuals use the same scheduled t0 and latency.
    const headroom = ready ? .04 : 0;
    const run = this.run = { ...plan, owner: 'taster', kind: 'taster', requestId: options.requestId, visual: true, perf: !ready,
      t0: ready ? ctx.currentTime + headroom : wall / 1000, wallT0: wall / 1000 + headroom,
      onEnd: options.onEnd, p0: wall, lastAt: wall, lastNow: null, lastElapsed: 0, ctx0: ctx?.currentTime || 0 };
    if (ready) {
      try {
        for (const event of plan.events) {
          if (event.type === 'tone') this._tone(event.midi, run.t0 + event.time, event.duration);
          else this._click(run.t0 + event.time, event.level);
        }
      } catch { this._fallbackTasterClock(); }
    }
    this._frameTaster();
    return run;
  }

  _fallbackTasterClock() {
    const run = this.run;
    if (!run || run.owner !== 'taster' || run.perf) return;
    this._silence();
    const now = performance.now() / 1000;
    const elapsed = Math.max(0, run.lastElapsed, now - run.wallT0);
    run.perf = true;
    run.t0 = now - elapsed;
    this.onState(false);
  }

  _frameTaster(expectedRun = this.run) {
    const run = this.run;
    if (!run || run !== expectedRun || run.owner !== 'taster') return;
    const wall = performance.now();
    if (!run.perf) {
      const current = this.ctx.currentTime;
      if (current !== run.lastNow) { run.lastNow = current; run.lastAt = wall; }
      else if (wall - run.lastAt > 800) this._fallbackTasterClock();
    }
    const now = run.perf ? wall / 1000 : this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
    const started = now >= run.t0;
    const elapsed = Math.max(0, now - run.t0);
    run.lastElapsed = Math.max(run.lastElapsed, elapsed);
    if (elapsed >= run.end) {
      const after = run.onEnd;
      this.stop();
      after?.();
      return;
    }
    const musical = elapsed / run.capS * num(run.len);
    const noteIndex = started ? run.parts.findIndex(x => num(x.s) <= musical + 1e-9 && musical < num(x.e) - 1e-9) : -1;
    let beatIndex = -1;
    if (started) for (const beat of run.beats) if (beat.time <= elapsed + 1e-9) beatIndex = beat.beatIndex;
    this.onFrame({ owner: 'taster', requestId: run.requestId, angle: run.capA * elapsed / run.capS, index: noteIndex, noteIndex, beatIndex,
      all: false, preparing: false, visible: true, elapsed, duration: run.capS });
    if (this.run === run) this.raf = requestAnimationFrame(() => this._frameTaster(run));
  }

  _frame() {
    const r = this.run;
    if (!r) return;
    const wall = performance.now();
    if (!r.perf && r.audioStarted && this.ctx.currentTime === r.ctx0 && wall - r.p0 > 800) { this._interrupt('clock'); return; }
    if (!r.perf && wall - r.p0 > 1200 && this.ctx.currentTime === r.ctx0) {
      if (r.kind === 'hear') { this._interrupt('clock'); return; }
      r.perf = true; r.t0 = wall / 1000 + .1; this._silence(); this.onState(false);
    }
    const now = r.perf ? wall / 1000 : this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
    if (!r.perf) {
      if (now !== r.lastNow) { r.lastNow = now; r.lastAt = wall; }
      else if (this.ctx.currentTime !== r.ctx0 && wall - r.lastAt > 800) { this._interrupt('clock'); return; }
    }
    if (now >= r.t0 + r.end) {
      const after = r.onEnd;
      this.stop();
      after?.();
      return;
    }
    if (r.visual) {
      const u = now - r.t0 - r.lead;
      const cycle = Math.floor(u / r.capS);
      const fraction = u < 0 ? (r.slot ? 0 : Math.max(0, (now - r.t0) / r.capS)) : cycle > 1 ? 1 : u / r.capS - cycle;
      let index = -1;
      const all = r.slot && u >= 0 && cycle === 0;
      if (u >= 0 && cycle <= 1 && !all) {
        const t = fraction * num(r.len);
        index = r.parts.findIndex(x => num(x.s) <= t + 1e-9 && t < num(x.e) - 1e-9);
      }
      this.onFrame({ angle: r.capA * Math.min(1, fraction), index, all, preparing: u < 0, visible: true });
    }
    this.raf = requestAnimationFrame(() => this._frame());
  }

  stop() {
    this.generation++;
    const previous = this.run;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this._silence();
    this.run = null;
    this.onFrame({ ...(previous?.owner === 'taster' ? { owner: 'taster', requestId: previous.requestId, noteIndex: -1, beatIndex: -1 } : {}), angle: 0, index: -1, all: false, preparing: false, visible: false });
  }

  _interrupt(reason) {
    if (!this.run) return;
    const owner = this.run.owner;
    this.stop();
    this.onState(this.available);
    this.onInterrupt(reason, ABORT_TEXT, owner);
  }

  /** Tutorial sound check, started only by a learner's button press. */
  async testTone() {
    this.stop();
    const generation = this.generation;
    const ok = await this.unlock();
    if (!ok || generation !== this.generation || (typeof document !== 'undefined' && document.hidden)) return false;
    this._tone(72, this.ctx.currentTime + .05, .45);
    return true;
  }

  destroy() {
    this.stop();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._visibility);
    this.ctx?.close();
  }
}
