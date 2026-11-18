import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { freshSave } from '../src/storage.js';
import { DAYS } from '../src/seeds.js';
import { solutions, pickAnswer, makeItem, menuKeys } from '../src/orders.js';
import { parseFill, keyOf, fillsOf } from '../src/engine.js';

function answer(game) {
  const o = game.item();
  if (o.kind === 'scene') { game.nextItem(); return; }
  if (game.state.phase === 'pick') { game.choose(pickAnswer(o)); game.confirmPick(); }
  if (game.state.phase === 'build') { for (const note of solutions(game.item(), game.state.last)[0]) game.place(note); game.bakePress(); }
  assert.equal(game.state.phase, 'bake', o.id);
  game.completeBake();
  assert.equal(game.state.phase, 'serve', o.id);
}

test('all five days complete all 39 exact orders and four discoveries without assistance', () => {
  const game = new Game();
  for (const day of DAYS) {
    game.startDay(day.id);
    let guard = 100;
    while (game.state.screen === 'shift' && guard-- > 0) { const o = game.item(); answer(game); if (o.kind !== 'scene') game.nextItem(); }
    assert.ok(guard > 0);
    const count = day.items.filter(item => !item.states).length;
    assert.equal(game.state.screen, 'close');
    assert.equal(game.state.results.length, count);
    assert.ok(game.state.results.every(result => result.recipe === 'full'));
    assert.deepEqual(game.save.days[day.id], { passed: true, runs: 1, best: count });
  }
  assert.equal(game.save.stats.orders, 39);
  assert.equal(game.save.stats.clean, 39);
  assert.deepEqual(game.save.scenes.sort(), ['S1', 'S2', 'S3', 'S4']);
});

test('every assisted order is repeated once before final, with original marks preserved', () => {
  for (const day of DAYS) {
    const game = new Game(); game.startDay(day.id);
    const repeatIds = [];
    let guard = 100;
    while (game.state.screen === 'shift' && guard-- > 0) {
      const o = game.item(), e = game.entry();
      if (o.kind === 'scene') { game.nextItem(); continue; }
      if (e.redo) { repeatIds.push(o.id); assert.equal(o.fresh, false); }
      else game.setState({ assisted: true });
      answer(game); game.nextItem();
    }
    assert.ok(guard > 0);
    const originals = day.items.filter(item => !item.states);
    assert.deepEqual(repeatIds, originals.filter(item => !item.final).map(item => item.id));
    assert.ok(game.state.results.every(result => result.recipe === 'half'));
    assert.ok(game.state.results.filter(result => result.id !== originals.at(-1).id).every(result => result.again === 'full'));
    assert.equal(game.state.queue.at(-1).redo, false);
    assert.equal(game.save.days[day.id].passed, false);
  }
});

test('pick omissions do not count; second choice miss supplies answer and build tries reset', () => {
  const game = new Game(); game.startDay('d1'); game.enter(3);
  const answerIndex = pickAnswer(game.item());
  game.confirmPick(); assert.equal(game.state.tries, 0); assert.equal(game.state.assisted, false);
  game.choose((answerIndex + 1) % 3); game.confirmPick(); assert.equal(game.state.tries, 1);
  game.choose((answerIndex + 1) % 3); game.confirmPick(); assert.equal(game.state.tries, 2); assert.equal(game.state.sel, answerIndex);
  game.confirmPick(); assert.equal(game.state.phase, 'build'); assert.equal(game.state.tries, 0); assert.equal(game.state.assisted, true);
});

test('incomplete bakes, overflow and a stopped bake preserve attempts and original pieces', () => {
  const game = new Game(); game.startDay('d0');
  game.bakePress(); assert.equal(game.state.tries, 0);
  game.place(parseFill('4')[0]);
  const before = keyOf(game.state.fill); game.place(parseFill('1')[0]); assert.equal(keyOf(game.state.fill), before);
  game.place(parseFill('4')[0]); game.bakePress(); game.stopBake();
  assert.equal(game.state.phase, 'build'); assert.equal(game.state.tries, 0); assert.equal(game.state.assisted, false);
  assert.equal(keyOf(game.state.fill), '4 4'); assert.deepEqual(game.state.menu, {});
});

test('second condition miss supplies first computed answer without baking', () => {
  const game = new Game(); game.startDay('d2');
  game.place(parseFill('1')[0]); game.bakePress(); assert.equal(game.state.tries, 1); assert.equal(game.state.phase, 'build');
  game.bakePress(); assert.equal(game.state.tries, 2); assert.equal(game.state.assisted, true);
  assert.equal(keyOf(game.state.fill), keyOf(solutions(game.item(), game.state.last)[0]));
});

test('group crossing is heard before assistance, but a condition order accepts and shelves it', () => {
  const grouped = new Game(); grouped.startDay('d3'); grouped.enter(3);
  for (const note of parseFill('4 4 4')) grouped.place(note);
  grouped.bakePress(); assert.equal(grouped.state.phase, 'bake'); assert.equal(grouped.state.tries, 0);
  grouped.completeBake(); assert.equal(grouped.state.phase, 'build'); assert.equal(grouped.state.tries, 1); assert.equal(keyOf(grouped.state.fill), '4 4 4');
  const cond = new Game(); cond.startDay('d2'); cond.enter(4);
  for (const note of parseFill('8 4 8')) cond.place(note);
  cond.bakePress(); cond.completeBake();
  assert.equal(cond.state.phase, 'serve'); assert.equal(cond.state.assisted, false);
  assert.deepEqual(cond.state.shelf['2/4'], ['8 4 8']); assert.equal(cond.state.menu['2/4'], undefined);
});

test('other combination rejects known fill without marking and quit restores last served fill', () => {
  const game = new Game(); game.startDay('d2'); answer(game);
  const served = keyOf(game.state.served); assert.equal(game.canOther(), true);
  game.otherFill(); for (const note of parseFill(served)) game.place(note); game.bakePress();
  assert.equal(game.state.phase, 'build'); assert.equal(game.state.tries, 0); assert.equal(game.state.assisted, false);
  assert.match(game.state.msg.text, /이미 찾은/);
  game.clear(); game.place(parseFill('4')[0]); game.quitExtra();
  assert.equal(game.state.phase, 'serve'); assert.equal(keyOf(game.state.fill), served);
});

test('all solutions collected disables other combination', () => {
  const game = new Game(); game.startDay('d2'); answer(game);
  let guard = 50;
  while (game.canOther() && guard-- > 0) {
    game.otherFill();
    const fill = solutions({ ...game.item(), fresh: false }).find(fill => !game.found(game.item()).includes(keyOf(fill)));
    for (const note of fill) game.place(note);
    game.bakePress(); game.completeBake();
  }
  assert.ok(guard > 0); assert.equal(game.canOther(), false);
});

test('resume restores redo queue and records but restarts current order without partial pieces', () => {
  const game = new Game(); game.startDay('d2'); game.setState({ assisted: true }); answer(game); game.nextItem();
  const queue = game.state.queue; const idx = game.state.idx;
  game.place(parseFill('2')[0]); game.checkpoint();
  const restored = new Game(JSON.parse(JSON.stringify(game.save))); assert.equal(restored.resume(), true);
  assert.deepEqual(restored.state.queue, queue); assert.equal(restored.state.idx, idx); assert.deepEqual(restored.state.results, game.state.results);
  assert.equal(restored.state.last, game.state.last); assert.deepEqual(restored.state.fill, []); assert.equal(restored.state.phase, 'build');
});

test('free oven keeps equal-length fill, clears different-length fill and only collects complete bakes', () => {
  const game = new Game(); game.startFree(1);
  for (const note of parseFill('4 4 4')) game.place(note);
  game.changeMeter(3); assert.equal(keyOf(game.state.fill), '4 4 4');
  game.bakePress(); game.stopBake(); assert.deepEqual(game.state.shelf, {});
  game.bakePress(); game.completeBake(); assert.deepEqual(game.state.shelf['6/8'], ['4 4 4']);
  game.changeMeter(1); game.bakePress(); game.completeBake(); assert.deepEqual(game.state.menu['3/4'], ['4 4 4']);
  game.changeMeter(0); assert.deepEqual(game.state.fill, []);
});

test('sound-pick stop counts accepted answer; interrupted sound returns to choice', () => {
  const game = new Game(); game.startDay('d4'); game.enter(4);
  game.choose(pickAnswer(game.item())); game.confirmPick(); game.stopBake(true);
  assert.equal(game.state.phase, 'pick'); assert.equal(game.state.assisted, false); assert.deepEqual(game.state.menu, {});
  game.confirmPick(); game.stopBake(false); assert.equal(game.state.phase, 'serve');
});

test('passed stamps and best scores survive later assisted run', () => {
  const save = freshSave(); save.days.d0 = { passed: true, runs: 1, best: 8 };
  const game = new Game(save); game.startDay('d0');
  let guard = 100;
  while (game.state.screen === 'shift' && guard-- > 0) { game.setState({ assisted: true }); answer(game); game.nextItem(); }
  assert.deepEqual(game.save.days.d0, { passed: true, runs: 2, best: 8 });
  assert.equal(game.save.active, null);
});
