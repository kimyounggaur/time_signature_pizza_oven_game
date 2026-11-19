import test from 'node:test';
import assert from 'node:assert/strict';
import { initialTaster, reduceTaster, tasterView, resolveLanding, hasLearningHistory, TASTER_ENABLED } from '../src/taster.js';
import { F, N, M, dur, angle, capacity, lengthIn, keyOf } from '../src/engine.js';
import { SAVE_KEY, BACKUP_KEY, freshSave, normalizeSave, loadSave, writeSave } from '../src/storage.js';

const step = (state, event) => reduceTaster(state, event).state;
const two = () => step(step(initialTaster(), 'ADD'), 'ADD');
const three = () => step(two(), 'SKIP_TO_COMPARE');
const compare = () => step(three(), 'ADD');
const host = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const protectedFields = save => ({ active: save.active, days: save.days, stats: save.stats, menu: save.menu, shelf: save.shelf, scenes: save.scenes });

test('Q01 brand-new landing is a silent two-beat task; defaults alone are not history', () => {
  assert.equal(TASTER_ENABLED, true);
  const save = freshSave(), state = initialTaster(), view = tasterView(state);
  assert.deepEqual(resolveLanding('', save), { screen: 'taster' });
  assert.equal(save.active, null);
  assert.equal(state.phase, 'two');
  assert.equal(state.playing, false);
  assert.equal(view.count, 0);
  assert.equal(view.remaining, 2);
  assert.equal(view.canAdd, true);
  assert.equal(view.canUndo, false);
  assert.equal(view.canBake, false);
  assert.deepEqual(view.meter, M(2, 4));
  assert.equal(hasLearningHistory(save), false);
});

test('Q02 add/undo/overfill and bake guards are enforced by the model', () => {
  let s = initialTaster();
  assert.strictEqual(step(s, 'UNDO'), s);
  assert.strictEqual(step(s, 'BAKE'), s);
  s = step(s, 'ADD');
  assert.equal(tasterView(s).remaining, 1);
  s = step(s, 'UNDO');
  assert.equal(tasterView(s).remaining, 2);
  s = step(step(s, 'ADD'), 'ADD');
  assert.equal(tasterView(s).remaining, 0);
  assert.equal(tasterView(s).canAdd, false);
  assert.equal(tasterView(s).canBake, true);
  for (let i = 0; i < 20; i++) assert.strictEqual(step(s, 'ADD'), s);
  assert.equal(s.two.length, 2);
});

test('Q03 two quarter notes copy unchanged into three-beat space; exactly one add completes', () => {
  const a = two(), b = step(a, 'SKIP_TO_COMPARE');
  assert.equal(b.phase, 'three');
  assert.deepEqual(b.three, [N(4), N(4)]);
  assert.notStrictEqual(b.two, b.three);
  assert.notStrictEqual(b.two[0], b.three[0]);
  assert.equal(keyOf(b.two), '4 4');
  assert.equal(tasterView(b).remaining, 1);
  const c = reduceTaster(b, 'ADD');
  assert.equal(c.state.phase, 'compare');
  assert.deepEqual(c.effects, [{ type: 'seen' }]);
  assert.equal(keyOf(c.state.two), '4 4');
  assert.equal(keyOf(c.state.three), '4 4 4');
  assert.equal(tasterView(c.state).complete, true);
  assert.deepEqual(capacity(M(2, 4)), F(1, 2));
  assert.deepEqual(capacity(M(3, 4)), F(3, 4));
  assert.deepEqual(angle(dur(N(4))), F(90));
  assert.deepEqual(angle(capacity(M(2, 4))), F(180));
  assert.deepEqual(angle(capacity(M(3, 4))), F(270));
});

test('Q03 first completed playback or immediate comparison both preserve the same two pieces', () => {
  const started = reduceTaster(two(), 'BAKE');
  assert.equal(started.state.phase, 'playTwo');
  assert.equal(started.state.playing, true);
  assert.equal(started.effects[0].type, 'play');
  assert.deepEqual(started.effects[0].meter, M(2, 4));
  assert.equal(keyOf(started.effects[0].fill), '4 4');
  const ended = step(started.state, { type: 'END', token: started.state.token });
  const skipped = step(started.state, 'SKIP_TO_COMPARE');
  assert.equal(ended.phase, 'three');
  assert.equal(skipped.phase, 'three');
  assert.deepEqual(ended.three, skipped.three);
  assert.equal(ended.playing, false);
});

test('Q03 all three-beat pieces remain removable and the completion effect is emitted once', () => {
  let s = compare();
  assert.equal(tasterView(s).canUndo, true);
  s = step(s, 'UNDO');
  assert.equal(s.phase, 'three');
  assert.equal(s.three.length, 2);
  s = step(step(s, 'UNDO'), 'UNDO');
  assert.equal(s.three.length, 0);
  assert.equal(tasterView(s).remaining, 3);
  const a = reduceTaster(step(step(s, 'ADD'), 'ADD'), 'ADD');
  assert.equal(a.state.phase, 'compare');
  assert.deepEqual(a.effects, []);
});

test('Q07 explicit hashes take precedence over both progress and taster switches', () => {
  const save = freshSave();
  save.settings.tasterSeenV1 = true;
  assert.deepEqual(resolveLanding('#test', save), { screen: 'test' });
  for (let i = 0; i <= 4; i++) assert.deepEqual(resolveLanding('#d' + i, save), { screen: 'shift', day: 'd' + i });
  assert.deepEqual(resolveLanding('', freshSave(), { enabled: false }), { screen: 'title' });
  assert.deepEqual(resolveLanding('#d3', freshSave(), { enabled: false }), { screen: 'shift', day: 'd3' });
});

test('Q07 active progress is preserved and routes to existing resume title rather than restarting', () => {
  const save = freshSave();
  save.active = { day: 'd1', queue: [{ i: 0, redo: false }, { i: 1, redo: false }], idx: 1, results: [], last: '4 4', fresh: 0, freshShelf: 0 };
  const before = structuredClone(save);
  assert.deepEqual(resolveLanding('', save), { screen: 'title' });
  assert.deepEqual(save, before);
  const invalid = freshSave(); invalid.active = { day: 'd1', queue: [{ i: 0, redo: false }], idx: 4 };
  assert.deepEqual(resolveLanding('', invalid), { screen: 'taster' });
});

test('Q07 each actual learning trace routes to title while a stored default save does not', () => {
  const fixtures = [
    s => { s.settings.tasterSeenV1 = true; },
    s => { s.days.d0.runs = 1; },
    s => { s.days.d0.best = 1; },
    s => { s.days.d0.passed = true; },
    s => { s.stats.bakes = 1; },
    s => { s.menu['2/4'] = ['4 4']; },
    s => { s.shelf['2/4'] = ['8 4 8']; },
    s => { s.scenes = ['S1']; },
    s => { s.settings.tips = ['tray']; },
    s => { s.settings.soundChecked = true; },
  ];
  for (const change of fixtures) {
    const save = freshSave(); change(save);
    assert.deepEqual(resolveLanding('', save), { screen: 'title' });
  }
  const storage = host({ [SAVE_KEY]: JSON.stringify(freshSave()) });
  assert.deepEqual(resolveLanding('', loadSave(storage).save), { screen: 'taster' });
});

test('Q08 only boolean tasterSeenV1 values normalize; old saves keep version and key', () => {
  assert.equal(SAVE_KEY, 'pzo_save_v1');
  for (const value of [true, false, 'true', 1, null, {}, []]) {
    const save = normalizeSave({ version: 1, settings: { tasterSeenV1: value } });
    assert.equal(save.settings.tasterSeenV1, value === true);
    assert.equal(save.version, 1);
  }
  assert.equal(normalizeSave({ version: 1 }).settings.tasterSeenV1, false);
  const save = freshSave(), storage = host(); save.settings.tasterSeenV1 = true;
  assert.equal(writeSave(save, storage), true);
  assert.equal(loadSave(storage).save.settings.tasterSeenV1, true);
  save.settings.tips = [];
  assert.equal(normalizeSave(save).settings.tasterSeenV1, true);
});

test('Q08 corrupt/future backups and blocked storage retain the new optional setting contract', () => {
  for (const raw of ['bad', '{"version":2,"settings":{"tasterSeenV1":true}}']) {
    const storage = host({ [SAVE_KEY]: raw }), loaded = loadSave(storage);
    assert.equal(loaded.recovered, true);
    assert.equal(loaded.save.settings.tasterSeenV1, false);
    assert.equal(storage.values.get(BACKUP_KEY), raw);
  }
  const save = freshSave(); save.settings.tasterSeenV1 = true;
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(writeSave(save, blocked), false);
  const loaded = loadSave(blocked);
  assert.equal(loaded.persistent, false);
  assert.equal(loaded.save.settings.tasterSeenV1, true);
  assert.deepEqual(resolveLanding('', loaded.save), { screen: 'title' });
});

test('Q09 model completion and explicit exit never change protected regular-learning fields', () => {
  const save = freshSave();
  save.active = { day: 'd0', queue: [{ i: 0, redo: false }], idx: 0, results: [], last: null, fresh: 0, freshShelf: 0 };
  save.menu = { '2/4': ['4 4'] }; save.shelf = { '2/4': ['8 4 8'] }; save.scenes = ['S1'];
  save.days.d0 = { runs: 1, best: 4, passed: false }; save.stats = { bakes: 4, orders: 3, clean: 2 };
  const before = structuredClone(protectedFields(save));
  let s = compare();
  for (const event of ['BAKE', 'STOP', 'UNDO', 'ADD', 'RESTART', { type: 'EXIT', screen: 'map' }]) {
    const reduced = reduceTaster(s, event); s = reduced.state;
    for (const effect of reduced.effects) if (effect.type === 'seen') save.settings.tasterSeenV1 = true;
  }
  assert.deepEqual(protectedFields(save), before);
  assert.equal(save.settings.soundChecked, false);
});

test('Q12 stop, dialogs and hidden tabs cancel playback and reject every old END token', () => {
  for (const type of ['STOP', 'OPEN_DIALOG', 'VISIBILITY_HIDDEN']) {
    const started = reduceTaster(two(), 'BAKE'), token = started.state.token;
    const stopped = reduceTaster(started.state, type);
    assert.equal(stopped.state.phase, 'two');
    assert.equal(stopped.state.two.length, 2);
    assert.equal(stopped.state.playing, false);
    assert.ok(stopped.state.token > token);
    assert.deepEqual(stopped.effects, [{ type: 'cancel' }]);
    assert.strictEqual(step(stopped.state, { type: 'END', token }), stopped.state);
  }
});

test('Q12 immediate compare, exit and restart invalidate delayed completions', () => {
  const started = reduceTaster(two(), 'BAKE'), token = started.state.token;
  const skipped = step(started.state, 'SKIP_TO_COMPARE');
  assert.strictEqual(step(skipped, { type: 'END', token }), skipped);
  const exited = reduceTaster(started.state, { type: 'EXIT', screen: 'map' });
  assert.equal(exited.state.exited, true);
  assert.deepEqual(exited.effects, [{ type: 'cancel' }, { type: 'seen' }, { type: 'exit', screen: 'map' }]);
  for (const event of ['ADD', 'UNDO', 'BAKE', { type: 'END', token }]) assert.strictEqual(step(exited.state, event), exited.state);
  const restarted = step(exited.state, 'RESTART');
  assert.equal(restarted.phase, 'two'); assert.equal(restarted.exited, false);
  assert.equal(restarted.two.length, 0);
  assert.ok(restarted.token > token);
});

test('Q12 compare listening stays in compare and cannot double-apply ADD or END', () => {
  const c = compare(), run = reduceTaster(c, 'BAKE');
  assert.equal(run.state.phase, 'compare');
  assert.equal(run.effects[0].meter.num, 3);
  assert.equal(run.effects[0].fill.length, 3);
  assert.strictEqual(step(run.state, 'ADD'), run.state);
  assert.strictEqual(step(run.state, 'UNDO'), run.state);
  const ended = step(run.state, { type: 'END', token: run.state.token });
  assert.equal(ended.phase, 'compare'); assert.equal(ended.playing, false);
  assert.strictEqual(step(ended, { type: 'END', token: run.state.token }), ended);
});

test('Q13 view summary uses quarter-note beat places, not eighth-note cells; no references leak', () => {
  const s = three(), view = tasterView(s);
  assert.equal(view.remaining, 1);
  assert.match(view.summary, /4분의 3박자, 3자리 중 2자리/);
  assert.equal(lengthIn(capacity(view.meter), view.fill).state, 'short');
  view.fill[0].den = 8;
  view.twoFill.push(N(8));
  assert.equal(s.three[0].den, 4);
  assert.equal(s.two.length, 2);
});

test('Q02 reducer is deterministic and leaves frozen input state untouched', () => {
  const s = two(); Object.freeze(s.two); Object.freeze(s.three); Object.freeze(s);
  assert.deepEqual(reduceTaster(s, 'BAKE'), reduceTaster(s, 'BAKE'));
  assert.equal(s.phase, 'two');
  assert.equal(s.playing, false);
  assert.equal(s.token, 0);
});
