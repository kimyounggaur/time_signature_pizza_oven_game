import test from 'node:test';
import assert from 'node:assert/strict';
import { M, N, hz, parseFill } from '../src/engine.js';
import { AudioEngine, CLICK, createAudioPlan } from '../src/audio.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);
const metered = (m, fill) => ({ m, fill: parseFill(fill) });

test('AU-01 note pitches and three noise-filter click levels', () => {
  near(hz(72), 523.2511306011972); near(hz(60), 261.6255653005986);
  assert.deepEqual(CLICK, [[2700, .9], [1900, .5], [1250, .16]]);
});

test('AU-02 exact note starts are scheduled for two rhythm loops after one preparation bar', () => {
  const plan = createAudioPlan(metered(M(3, 4), '4 4 4'));
  const tones = plan.events.filter(event => event.type === 'tone');
  assert.equal(tones.length, 6);
  tones.forEach((event, i) => near(event.time, 1.8 + i * .6));
  const four = createAudioPlan(metered(M(4, 4), '2 4 4')).events.filter(event => event.type === 'tone');
  four.forEach((event, i) => near(event.time, [2.4, 3.6, 4.2, 4.8, 6, 6.6][i]));
});

test('AU-03 subdivision setting and slow pace affect clicks without changing note lengths', () => {
  const regular = createAudioPlan(metered(M(3, 4), '4 4 4'));
  const clicks = regular.events.filter(event => event.type === 'click');
  assert.equal(clicks.length, 18); clicks.forEach((event, i) => near(event.time, i * .3));
  const slow = createAudioPlan(metered(M(4, 4), '2 4 4'), { slow: true, subs: false });
  const large = slow.events.filter(event => event.type === 'click');
  assert.equal(large.length, 12); large.forEach((event, i) => near(event.time, i * .9));
});

test('AU-04 slot has a low reference tone followed by equal-length piece tones', () => {
  const plan = createAudioPlan({ slot: N(4, 1), fill: parseFill('4 8') });
  assert.equal(plan.events.filter(event => event.type === 'click').length, 8);
  const tones = plan.events.filter(event => event.type === 'tone');
  assert.deepEqual(tones.map(event => event.midi), [60, 72, 72]);
  tones.forEach((event, i) => near(event.time, [.6, 1.5, 2.1][i]));
});

function fakeAudio(work) {
  const previous = { AudioContext: globalThis.AudioContext, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const sources = [], nodes = [];
  const param = () => ({ value: 0, setValueAtTime(value, when) { this.value = value; this.when = when; }, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = (kind = 'pass') => {
    const value = { kind, gain: param(), frequency: param(), Q: param(), starts: [], stops: [], connect() {}, disconnect() {}, addEventListener() {}, start(when) { this.starts.push(when); }, stop(when) { this.stops.push(when); } };
    nodes.push(value); if (kind === 'tone' || kind === 'noise') sources.push(value); return value;
  };
  class Context {
    constructor() { this.currentTime = 10; this.state = 'running'; this.sampleRate = 128; this.destination = {}; this.listeners = {}; }
    createGain() { return node(); } createOscillator() { return node('tone'); } createBufferSource() { return node('noise'); } createBiquadFilter() { return node(); }
    createBuffer() { return { getChannelData: () => new Float32Array(128) }; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    resume() { this.state = 'running'; return Promise.resolve(); } close() { this.state = 'closed'; }
  }
  globalThis.AudioContext = Context; globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  try { work({ sources, nodes }); } finally { for (const [name, value] of Object.entries(previous)) if (value === undefined) delete globalThis[name]; else globalThis[name] = value; }
}

test('AU-05 all sources are created immediately; stop and replacement cancel future starts as a group', () => fakeAudio(({ sources }) => {
  const engine = new AudioEngine();
  const spec = metered(M(3, 4), '4 4 4');
  const run = engine.play(spec), initial = sources.slice();
  assert.equal(initial.length, createAudioPlan(spec).events.length);
  assert.ok(initial.every(source => source.starts.length === 1 && source.starts[0] >= 10.12));
  engine.play(spec);
  assert.ok(initial.every(source => source.stops.at(-1) === undefined));
  const replacement = sources.slice(initial.length); engine.stop();
  assert.ok(replacement.every(source => source.stops.at(-1) === undefined));
  assert.equal(engine.run, null); assert.equal(engine.nodes.size, 0); assert.equal(run.perf, false);
  engine.destroy();
}));

test('AU-06 sound-only questions always schedule subdivision clicks', () => {
  assert.equal(createAudioPlan(metered(M(3, 4), '4 4 4'), { subs: false, kind: 'hear' }).events.filter(event => event.type === 'click').length, 18);
  assert.equal(createAudioPlan(metered(M(3, 4), '4 4 4'), { subs: false, kind: 'listen' }).events.filter(event => event.type === 'click').length, 9);
});

test('AU-07 running audio clock frozen over 0.8 seconds interrupts and cancels', () => fakeAudio(() => {
  const messages = [], engine = new AudioEngine({ onInterrupt: (reason, message) => messages.push([reason, message]) });
  engine.play(metered(M(3, 4), '4 4 4')); engine.run.p0 = performance.now() - 850; engine._frame();
  assert.equal(engine.run, null); assert.equal(messages[0][0], 'clock'); assert.match(messages[0][1], /소리가 멈춰서/);
  engine.destroy();
}));

test('AU-08 sound-order listening suppresses visual needle and pieces', () => fakeAudio(() => {
  const frames = [], engine = new AudioEngine({ onFrame: frame => frames.push(frame) });
  const run = engine.play(metered(M(3, 4), '4 4 4'), { kind: 'hear' });
  assert.equal(run.visual, false); frames.length = 0;
  engine.ctx.currentTime += .6; engine._frame(); assert.deepEqual(frames, []);
  engine.destroy();
}));

test('context interruption aborts immediately; output latency shifts visuals only', () => fakeAudio(() => {
  const frames = [], messages = [], engine = new AudioEngine({ onFrame: frame => frames.push(frame), onInterrupt: reason => messages.push(reason) });
  engine.play(metered(M(3, 4), '4 4 4'));
  engine.ctx.outputLatency = .1; engine.ctx.currentTime = 10.82; engine._frame();
  near(frames.at(-1).angle, 90); // (10.82 - .10 - 10.12) / 1.8 * 270
  engine.ctx.state = 'suspended'; engine.ctx.listeners.statechange();
  assert.equal(engine.run, null); assert.deepEqual(messages, ['context']); engine.destroy();
}));
