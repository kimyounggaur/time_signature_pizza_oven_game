import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, BACKUP_KEY, freshSave, loadSave, writeSave } from '../src/storage.js';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

test('SV-01 version 1 settings, day, books, scenes and active order survive round trip', () => {
  const save = freshSave(), host = storage();
  save.settings = { ...save.settings, slow: true, motion: 'reduced', soundChecked: true, tips: ['place'] };
  save.days.d0 = { passed: true, best: 7, runs: 2 };
  save.menu = { '3/4': ['4 4 4'] };
  save.shelf = { '2/4': ['8 4 8'] };
  save.scenes = ['S1'];
  save.stats = { orders: 8, clean: 7, bakes: 9 };
  save.active = { day: 'd1', queue: [{ i: 0, redo: false }, { i: 1, redo: true }], idx: 1, results: [{ id: 'd1-02', text: '기록', recipe: 'half', again: 'full' }], last: '4 4', fresh: 2, freshShelf: 1 };
  assert.equal(writeSave(save, host), true);
  assert.deepEqual(loadSave(host).save, save);
  assert.equal(loadSave(host).persistent, true);
});

test('SV-02 damaged and future saves preserve original bytes in backup', () => {
  for (const raw of ['{broken', '{"version":2,"unknown":"keep"}', 'null', '[]']) {
    const host = storage({ [SAVE_KEY]: raw }), loaded = loadSave(host);
    assert.equal(loaded.recovered, true);
    assert.deepEqual(loaded.save, freshSave());
    assert.equal(host.values.get(BACKUP_KEY), raw);
    assert.equal(host.values.get(SAVE_KEY), raw);
  }
});

test('missing v1 fields receive defaults, values are bounded and unknown day IDs ignored', () => {
  const host = storage({ [SAVE_KEY]: JSON.stringify({ version: 1, settings: { volume: 9, slow: 'yes', motion: 'bad' }, days: { d0: { best: 50, runs: -1, passed: true }, d9: {} }, stats: { orders: -1 } }) });
  const save = loadSave(host).save;
  assert.equal(save.settings.volume, 1);
  assert.equal(save.settings.slow, false);
  assert.equal(save.settings.motion, 'system');
  assert.deepEqual(save.days.d0, { passed: true, best: 8, runs: 0 });
  assert.equal(save.days.d9, undefined);
  assert.deepEqual(save.stats, { orders: 0, clean: 0, bakes: 0 });
});

test('SV-03 blocked localStorage falls back to current session and reports limitation', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const save = freshSave(); save.settings.slow = true;
  assert.equal(writeSave(save, blocked), false);
  const loaded = loadSave(blocked);
  assert.equal(loaded.persistent, false);
  assert.equal(loaded.save.settings.slow, true);
  assert.equal(loaded.warning, '이 기기에서는 기록이 저장되지 않아요.');
});

test('SV-04 menu and shelf are filtered by exact full length and crossing semantics', () => {
  const raw = { version: 1, menu: { '3/4': ['4 4 4', '4 4 4', '8 4 8', '4. 4.', '1', 'bad', '0'], '6/8': ['4. 4.'], '9/8': ['4. 4. 4.'] }, shelf: { '2/4': ['8 4 8', '4 4', '8 8', 'bad'], '6/8': ['4 4 4', '4. 4.'] }, scenes: ['S1', 'S1', 'S9'] };
  const save = loadSave(storage({ [SAVE_KEY]: JSON.stringify(raw) })).save;
  assert.deepEqual(save.menu, { '3/4': ['4 4 4'], '6/8': ['4. 4.'] });
  assert.deepEqual(save.shelf, { '2/4': ['8 4 8'], '6/8': ['4 4 4'] });
  assert.deepEqual(save.scenes, ['S1']);
});

test('invalid resumable queues never reach game indexing', () => {
  for (const active of [ { day: 'd9', queue: [], idx: 0 }, { day: 'd0', queue: [{ i: 100, redo: false }], idx: 0 }, { day: 'd0', queue: [{ i: 0, redo: false }], idx: 8 }, { day: 'd0', queue: [{ i: 7, redo: true }], idx: 0 } ]) {
    assert.equal(loadSave(storage({ [SAVE_KEY]: JSON.stringify({ version: 1, active }) })).save.active, null);
  }
});

test('fresh saves do not share mutable arrays or objects', () => {
  const a = freshSave(), b = freshSave();
  a.settings.tips.push('x'); a.days.d0.best = 7; a.menu['2/4'] = ['4 4'];
  assert.deepEqual(b.settings.tips, []);
  assert.equal(b.days.d0.best, 0);
  assert.deepEqual(b.menu, {});
});
