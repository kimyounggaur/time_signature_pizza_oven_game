// Browser-safe verification suite: core theory, every curriculum path, storage,
// and relative audio schedules. No real audio is emitted and no user save is written.
import * as E from './engine.js';
import * as O from './orders.js';
import { DAYS } from './seeds.js';
import { Game } from './game.js';
import { SAVE_KEY, BACKUP_KEY, freshSave, loadSave, writeSave } from './storage.js';
import { createAudioPlan, AudioEngine, CLICK } from './audio.js';

const fail = message => { throw new Error(message || '검사 값이 일치하지 않아요.'); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const assert = {
  equal(a, b, message) { if (!Object.is(a, b)) fail(message || `${a} !== ${b}`); },
  deepEqual(a, b, message) { if (JSON.stringify(canonical(a)) !== JSON.stringify(canonical(b))) fail(message); },
  ok(value, message) { if (!value) fail(message); },
  match(value, pattern) { if (!pattern.test(value)) fail(`${value} !~ ${pattern}`); },
  doesNotMatch(value, pattern) { if (pattern.test(value)) fail(`${value} ~ ${pattern}`); },
};

export function selfTests() {
  const results = [];
  let category = 'NT';
  const originalMemory = loadSave().save;
  const check = (name, body) => {
    const group = /^[A-Z]{2}-/.test(name) ? name.slice(0, 2) : category;
    try { body(); results.push({ name, id: name.split(' ')[0], group, ok: true }); }
    catch (error) { results.push({ name, id: name.split(' ')[0], group, ok: false, error: String(error.message || error) }); }
  };
  {
    category = 'NT';


const { F, N, M, add, sub, mul, div, eq, num, dur, noteOf, capacity, defaultGroups,
  groupings, bounds, pulse, pulseGroups, clicks, angle, cells, total, spans,
  straddles, lengthIn, fills, fitting, keyOf, parseFill, beams, sameNote } = E;
const items = DAYS.flatMap(day => day.items.map(O.makeItem));
const orders = items.filter(item => item.kind === 'order');
const scenes = items.filter(item => item.kind === 'scene');
const order = id => orders.find(o => o.id === id);
const fill = parseFill;
const b = (n, d) => bounds(M(n, d), defaultGroups(M(n, d)));

check('FR-01 fractions normalize and preserve exact arithmetic', () => {
  assert.deepEqual(F(6, 8), F(3, 4));
  assert.deepEqual(F(1, -2), F(-1, 2));
  assert.deepEqual(add(F(1, 4), F(1, 8)), F(3, 8));
  assert.deepEqual(sub(F(3, 4), F(1, 8)), F(5, 8));
  assert.deepEqual(mul(F(3, 8), F(2)), F(3, 4));
  assert.deepEqual(div(F(3, 4), F(1, 8)), F(6));
});
check('NT-01 dotted and plain note lengths', () => {
  assert.deepEqual(dur(N(4)), F(1, 4));
  assert.deepEqual(dur(N(4, 1)), F(3, 8));
  assert.deepEqual(dur(N(2, 1)), F(3, 4));
  for (const den of [1, 2, 4, 8]) {
    assert.deepEqual(dur(N(den, 1)), mul(dur(N(den)), F(3, 2)));
    assert.deepEqual(dur(N(den * 2)), div(dur(N(den)), F(2)));
  }
});
check('NT-02 note length inverse and unrepresentable duration', () => {
  for (const p of O.PIECES) assert.deepEqual(noteOf(dur(p)), p);
  assert.equal(noteOf(F(5, 8)), null);
});
check('NT-03 rhythm keys round trip', () => {
  assert.deepEqual(fill('4. 4 8'), [N(4, 1), N(4), N(8)]);
  for (const m of O.METERS) for (const key of O.menuKeys(m)) assert.equal(keyOf(fill(key)), key);
});
check('MT-01 equal dough has distinct grouping', () => {
  assert.deepEqual(capacity(M(6, 8)), capacity(M(3, 4)));
  assert.deepEqual(pulseGroups(M(3, 4), defaultGroups(M(3, 4))), [2, 2, 2]);
  assert.deepEqual(pulseGroups(M(6, 8), defaultGroups(M(6, 8))), [3, 3]);
});
check('MT-02 time signature is never reduced', () => {
  assert.deepEqual(M(6, 8), { num: 6, den: 8 });
  assert.equal(E.meterKo(M(6, 8)), '8분의 6박자');
});
check('MT-03 default groups follow meter rules', () => {
  for (const n of [2, 3, 4]) assert.deepEqual(defaultGroups(M(n, 4)), Array(n).fill(1));
  for (const n of [6, 9, 12]) assert.deepEqual(defaultGroups(M(n, 8)), Array(n / 3).fill(3));
  assert.equal(defaultGroups(M(5, 8)), null);
  assert.equal(defaultGroups(M(7, 8)), null);
});
check('MT-04 mixed grouping candidates', () => {
  assert.deepEqual(groupings(5), [[2, 3], [3, 2]]);
  assert.deepEqual(groupings(7), [[2, 2, 3], [2, 3, 2], [3, 2, 2]]);
});
check('MT-05 boundaries and pulses equal bar duration', () => {
  for (const m of [...O.METERS, M(9, 8), M(12, 8), M(5, 8), M(7, 8)]) {
    for (const g of defaultGroups(m) ? [defaultGroups(m)] : groupings(m.num)) {
      assert.deepEqual(bounds(m, g).at(-1), capacity(m));
      assert.deepEqual(mul(pulse(m, g), F(clicks(m, g).length)), capacity(m));
    }
  }
});
check('MT-06 large beats as notes', () => {
  assert.deepEqual(E.beatNotes(M(6, 8), [3, 3]), [N(4, 1), N(4, 1)]);
  assert.deepEqual(E.beatNotes(M(5, 8), [2, 3]), [N(4), N(4, 1)]);
});
check('MT-07 three-level click signatures', () => {
  const cases = [[M(2, 4), [1, 1], '0212'], [M(3, 4), [1, 1, 1], '021212'],
    [M(4, 4), [1, 1, 1, 1], '02121212'], [M(6, 8), [3, 3], '022122'],
    [M(9, 8), [3, 3, 3], '022122122'], [M(5, 8), [2, 3], '02122'], [M(5, 8), [3, 2], '02212']];
  for (const [m, g, signature] of cases) assert.equal(clicks(m, g).map(c => c.level).join(''), signature);
});
check('MT-08 kinds and divisions', () => {
  assert.equal(E.kindOf([1, 1, 1]), 'simple');
  assert.equal(E.kindOf([3, 3]), 'compound');
  assert.equal(E.kindOf([2, 3]), 'mixed');
  assert.equal(E.kindKo([3, 3]), '겹박자');
});
check('AN-01 fixed note angles and cell counts', () => {
  assert.deepEqual(O.PIECES.map(p => num(angle(dur(p)))), [360, 270, 180, 135, 90, 45]);
  assert.deepEqual(O.PIECES.map(p => num(cells(dur(p)))), [8, 6, 4, 3, 2, 1]);
});
check('AN-02 dough angle and cell counts', () => {
  assert.deepEqual(O.METERS.map(m => num(angle(capacity(m)))), [180, 270, 360, 270]);
  assert.deepEqual(O.METERS.map(m => num(cells(capacity(m)))), [4, 6, 8, 6]);
});
check('AN-03 exact sum of slice angles equals dough', () => {
  for (const m of O.METERS) for (const f of fills(m, O.menuTray(m))) {
    assert.deepEqual(f.reduce((acc, note) => add(acc, angle(dur(note))), F(0)), angle(capacity(m)));
  }
});
check('AN-04 future large-board geometry', () => {
  for (const [n, expected] of [[9, 270], [12, 360]]) {
    assert.equal(E.fits(M(n, 8)), false);
    assert.deepEqual(E.turnFor(M(n, 8)), E.TURN_BIG);
    assert.equal(num(angle(capacity(M(n, 8)), E.TURN_BIG)), expected);
  }
});
check('AN-05 larger board keeps proportional angles', () => {
  for (const p of O.PIECES) assert.deepEqual(angle(dur(p), E.TURN_BIG), mul(angle(dur(p)), F(2, 3)));
});
check('FL-01 fill counts and 69 fitting menu slots', () => {
  assert.deepEqual(O.METERS.map(m => fills(m, O.menuTray(m)).length), [6, 19, 61, 25]);
  assert.deepEqual(O.METERS.map(m => O.menuKeys(m).length), [5, 13, 34, 17]);
  assert.equal(O.METERS.reduce((sum, m) => sum + O.menuKeys(m).length, 0), 69);
});
check('FL-02 fills are exact and unique', () => {
  for (const m of O.METERS) {
    const fs = fills(m, O.menuTray(m));
    assert.equal(new Set(fs.map(keyOf)).size, fs.length);
    for (const f of fs) assert.deepEqual(total(f), capacity(m));
  }
});
check('FL-03 same length and tray produce same rhythm list', () => {
  assert.deepEqual(fills(M(3, 4), O.PIECES), fills(M(6, 8), O.PIECES));
});
check('FL-04 trays are derived from fitting fills', () => {
  assert.deepEqual(O.METERS.map(m => keyOf(O.menuTray(m))), ['2 4 8', '2. 2 4 8', '1 2. 2 4 8', '2. 4. 4 8']);
});
check('FL-05 dotted quarters always cross simple beat boundaries', () => {
  for (const m of O.METERS.filter(m => m.den === 4)) {
    for (const f of fills(m, O.PIECES)) {
      const bad = straddles(f, bounds(m, defaultGroups(m)));
      f.forEach((p, i) => { if (sameNote(p, N(4, 1))) assert.ok(bad.includes(i)); });
    }
  }
});
check('ST-01 identical quarter notes have meter-dependent crossing', () => {
  assert.deepEqual(straddles(fill('4 4 4'), b(6, 8)), [1]);
  assert.deepEqual(straddles(fill('4 4 4'), b(3, 4)), []);
});
check('ST-02 whole groups may be spanned', () => {
  assert.deepEqual(straddles(fill('2.'), b(6, 8)), []);
  assert.deepEqual(straddles(fill('4 2 4'), b(4, 4)), []);
  assert.deepEqual(straddles(fill('1'), b(4, 4)), []);
});
check('ST-03 syncopation indices', () => {
  assert.deepEqual(straddles(fill('8 4 8'), b(2, 4)), [1]);
  assert.deepEqual(straddles(fill('4. 8'), b(2, 4)), [0]);
});
check('ST-04 slot orders have no internal boundaries', () => {
  for (const o of orders.filter(o => o.slot)) for (const f of O.solutions(o)) assert.deepEqual(straddles(f, o.B), []);
});
check('LN-01 exact length comparison', () => {
  assert.deepEqual(lengthIn(F(1), fill('2 4')), { state: 'short', diff: F(1, 4) });
  assert.deepEqual(lengthIn(F(1), fill('2 4 4')), { state: 'exact', diff: F(0) });
  assert.deepEqual(lengthIn(F(3, 8), fill('4 4')), { state: 'over', diff: F(1, 8) });
});
check('LN-02 difference explanation uses longest exact plain unit', () => {
  assert.equal(E.countKo(F(3, 8), M(4, 4)), '8분음표 3개 분량');
  assert.equal(E.countKo(F(1, 2), M(4, 4)), '4분음표 2개 분량');
  assert.equal(E.countKo(F(1, 2)), '2분음표 1개 분량');
});
check('BM-01 eighth-note beams distinguish 3/4 and 6/8', () => {
  const six = fill('8 8 8 8 8 8');
  assert.deepEqual(beams(six, b(3, 4)), [[0, 1], [2, 3], [4, 5]]);
  assert.deepEqual(beams(six, b(6, 8)), [[0, 1, 2], [3, 4, 5]]);
});
check('BM-02 beams join only flagged notes in one group', () => {
  assert.deepEqual(beams(fill('4 8 4 8'), b(6, 8)), []);
  assert.deepEqual(beams(fill('4 8 8'), b(2, 4)), [[1, 2]]);
  assert.deepEqual(beams(fill('2 4 4'), b(4, 4)), []);
});
check('GN-01 exact curriculum inventory', () => {
  assert.deepEqual(DAYS.map(d => d.items.filter(i => !i.states).length), [8, 7, 8, 8, 8]);
  assert.equal(orders.length, 39);
  assert.equal(scenes.length, 4);
});
check('GN-02 final order is unique and last, all IDs unique', () => {
  assert.equal(new Set(items.map(i => i.id)).size, items.length);
  for (const d of DAYS) {
    assert.equal(d.items.filter(i => i.final).length, 1);
    assert.equal(d.items.at(-1).final, true);
  }
});
check('GN-03 all orders solvable, alternatives genuinely multiple', () => {
  for (const o of orders) {
    const ss = O.solutions(o);
    assert.ok(ss.length >= (o.fresh ? 2 : 1), o.id);
  }
});
check('GN-04 set, score and sound solutions are unique', () => {
  for (const o of orders.filter(o => ['set', 'score', 'sound'].includes(o.ask))) assert.equal(O.solutions(o).length, 1, o.id);
});
check('GN-05 solutions exactly equal accepting complete fills', () => {
  for (const o of orders) {
    const valid = new Set(O.solutions(o).map(keyOf));
    for (const f of E.fillsOf(o.len, o.tray)) assert.equal(O.judge(o, f).ok, valid.has(keyOf(f)), `${o.id}: ${keyOf(f)}`);
  }
});
check('GN-06 tray lengths and score membership', () => {
  for (const o of orders) {
    for (const p of o.tray) assert.ok(E.cmp(dur(p), o.len) <= 0, o.id);
    if (o.slot) for (const p of o.tray) assert.ok(!eq(dur(p), o.len));
    if (o.target) for (const p of o.target) assert.ok(o.tray.some(t => sameNote(p, t)), o.id);
  }
});
check('GN-07 all twelve pick questions have one answer', () => {
  const picked = orders.filter(o => o.pick);
  assert.equal(picked.length, 12);
  assert.equal(picked.filter(o => o.pick === 'dough').length, 4);
  assert.equal(picked.filter(o => o.pick === 'meter').length, 8);
  for (const o of picked) assert.equal(O.pickUnique(o), true, o.id);
});
check('GN-08 score and sound targets are exact and uncrossed', () => {
  for (const o of orders.filter(o => o.target)) {
    assert.deepEqual(total(o.target), o.len, o.id);
    assert.deepEqual(straddles(o.target, o.B), [], o.id);
  }
});
check('GN-09 alternative orders follow same-capacity same-tray orders', () => {
  for (const day of DAYS) {
    const os = day.items.filter(i => !i.states).map(O.makeOrder);
    os.forEach((o, i) => { if (o.fresh) {
      assert.deepEqual(o.len, os[i - 1].len);
      assert.equal(keyOf(o.tray), keyOf(os[i - 1].tray));
    } });
  }
});
check('GN-10 discovery states full and uniquely labelled', () => {
  for (const sc of scenes) {
    assert.equal(new Set(O.stateLabels(sc)).size, sc.states.length);
    for (const st of sc.states) assert.deepEqual(total(st.fill), st.len);
  }
});
check('GN-11 order trays belong to meter menu trays', () => {
  for (const o of orders.filter(o => o.m)) for (const p of o.tray) assert.ok(O.menuTray(o.m).some(t => sameNote(t, p)), o.id);
});
check('GN-12 pass threshold is rounded up', () => {
  assert.equal(O.passNeed(8), 7);
  assert.equal(O.passNeed(7), 6);
});
check('JD-01 length checked before any other condition', () => {
  assert.equal(O.judge(order('d2-01'), fill('4')).why, 'length');
});
check('JD-02 piece count condition', () => {
  const j = O.judge(order('d2-01'), fill('4 4 4 4'));
  assert.equal(j.why, 'cond'); assert.deepEqual(j.cond, { type: 'pieces', want: 3, got: 4 });
});
check('JD-03 required note count and kinds', () => {
  assert.equal(O.judge(order('d2-04'), fill('4 4')).cond.type, 'has');
  assert.equal(O.judge(order('d2-06'), fill('2 2')).cond.type, 'kinds');
});
check('JD-04 grouping condition reports crossing indices', () => {
  const j = O.judge(order('d3-03'), fill('4 4 4'));
  assert.equal(j.why, 'group'); assert.deepEqual(j.bad, [1]);
});
check('JD-05 crossed rhythms accepted by non-group orders', () => {
  const j = O.judge(order('d2-04'), fill('8 4 8'));
  assert.equal(j.ok, true); assert.deepEqual(j.bad, [1]);
});
check('JD-06 grouping takes priority over piece count', () => {
  assert.equal(O.judge(order('d3-04'), fill('4 4 4')).why, 'group');
});
check('JD-07 alternative compares only immediate prior rhythm', () => {
  const o = order('d2-02');
  assert.equal(O.judge(o, fill('2 4 4'), '2 4 4').why, 'fresh');
  assert.equal(O.judge(o, fill('4 2 4'), '2 4 4').ok, true);
  assert.equal(O.judge(o, fill('2 4 4'), '4 2 4').ok, true);
});
check('JD-08 score compares note order and reports first difference', () => {
  const j = O.judge(order('d4-01'), fill('8 4 8'));
  assert.equal(j.why, 'score'); assert.equal(j.at, 0);
});
check('JD-09 dotted-quarter slot allows both note orders', () => {
  assert.equal(O.judge(order('d0-07'), fill('4 8')).ok, true);
  assert.equal(O.judge(order('d0-07'), fill('8 4')).ok, true);
});
check('JD-10 alternative solutions omit only immediate prior key', () => {
  assert.deepEqual(O.solutions(order('d2-02'), '2 4 4').map(keyOf), ['4 2 4', '4 4 2']);
});
check('JD-11 collection routing respects groups and slot orders', () => {
  assert.equal(O.menuSlot(order('d2-04'), fill('4 8 8')), 'menu');
  assert.equal(O.menuSlot(order('d2-04'), fill('8 4 8')), 'shelf');
  assert.equal(O.menuSlot(order('d0-07'), fill('4 8')), null);
});
check('JD-12 extra rhythm availability excludes collected/sound/slot', () => {
  assert.equal(O.unfound(order('d2-01'), []).length, 3);
  assert.equal(O.unfound(order('d2-01'), ['2 4 4', '4 2 4', '4 4 2']).length, 0);
  assert.deepEqual(O.unfound(order('d4-05'), []), []);
  assert.deepEqual(O.unfound(order('d0-05'), []), []);
});
check('PK-01 dough options and expected answers', () => {
  assert.deepEqual(O.doughOptions(), [4, 6, 8]);
  assert.deepEqual(['d1-03', 'd1-04', 'd1-06', 'd1-07'].map(id => O.pickOptions(order(id))[O.pickAnswer(order(id))]), [6, 4, 6, 8]);
});
check('PK-02 meter options and eight answers', () => {
  assert.deepEqual(O.METERS.map(O.meterKey), ['2/4', '3/4', '4/4', '6/8']);
  assert.deepEqual(orders.filter(o => o.id.startsWith('d4')).map(o => O.meterKey(O.pickOptions(o)[O.pickAnswer(o)])),
    ['2/4', '6/8', '3/4', '6/8', '4/4', '3/4', '6/8', '6/8']);
});
check('PK-03 score excludes bars with different lengths', () => {
  assert.equal(O.meterFits(order('d4-02'), M(2, 4)), 'short');
  assert.equal(O.meterFits(order('d4-02'), M(4, 4)), 'long');
});
check('PK-04 equal length with crossed groups cannot match score', () => {
  assert.equal(O.meterFits(order('d4-02'), M(3, 4)), 'group');
});
check('PK-05 equal length with different beams cannot match score', () => {
  assert.equal(O.meterFits(order('d4-03'), M(6, 8)), 'beam');
  assert.equal(O.meterFits(order('d4-04'), M(3, 4)), 'beam');
});
check('PK-06 sound questions distinguish click grouping', () => {
  assert.equal(O.meterFits(order('d4-06'), M(6, 8)), 'group');
  assert.equal(O.meterFits(order('d4-07'), M(3, 4)), 'group');
});
check('PK-07 ambiguous unbeamed score is rejected by uniqueness check', () => {
  const ambiguous = O.makeOrder({ id: 'ambiguous', ask: 'score', meter: [6, 8], target: '2.' });
  assert.equal(O.pickUnique(ambiguous), false);
});
check('TX-01 all order texts are generated and nonempty', () => {
  for (const o of orders) assert.ok(O.orderText(o).endsWith('주세요.'), o.id);
  assert.equal(O.orderText(order('d2-01')), '4분의 4박자 피자를 조각 3개로 주세요.');
});
check('TX-02 grouping particles follow final numeral', () => {
  assert.match(O.orderText(order('d3-03')), /3\+3이 보이게/);
  for (const [groups, wording] of [[[3, 2], '3+2가'], [[2, 3], '2+3이']]) {
    assert.ok(O.orderText(O.makeOrder({ id: 'mixed', ask: 'group', meter: [5, 8], groups })).includes(wording));
  }
  assert.match(O.orderText(order('d3-06')), /박이 보이게/);
});
check('TX-03 tags include close and retry prefixes', () => {
  assert.equal(O.tagKo(order('d0-01')), '자리 채우기');
  assert.equal(O.tagKo(order('d2-02')), '다른 조합');
  assert.equal(O.tagKo(order('d3-08')), '마감 · 묶음 주문');
  assert.equal(O.tagKo(order('d1-01'), true), '다시 한 번 · 지정 주문');
});
check('TX-04 building messages explain amount and conceal closing help', () => {
  assert.match(O.buildText(order('d1-01'), fill('4')).text, /4분음표 3개/);
  assert.match(O.buildText(order('d1-01'), fill('4 4 4 4')).text, /딱 맞아요/);
  assert.match(O.buildText(order('d3-03'), fill('4 4 4')).text, /2번째 조각/);
  assert.equal(O.buildText(order('d3-08'), fill('4')).text, '마감 주문이에요. 도움 없이 만들어요.');
  assert.match(O.buildText(order('d0-07'), fill('4'), N(4)).text, /8분음표 1개만큼 넘쳐요/);
});
check('TX-05 verdict messages include precise cause', () => {
  for (const [id, rhythm, expected] of [['d2-01', '4', '더 필요해요'], ['d2-01', '4 4 4 4', '주문은 3개'],
    ['d3-03', '4 4 4', '3+3 묶음'], ['d4-01', '8 4 8', '1번째 조각']]) {
    const o = order(id); assert.ok(O.judgeText(o, O.judge(o, fill(rhythm))).includes(expected));
  }
});
check('TX-06 serving messages use correct collection and slot relation', () => {
  assert.match(O.serveText(order('d0-07'), fill('4 8')), /길이가 같아요/);
  assert.match(O.serveText(order('d3-02'), fill('4. 4.'), 'menu'), /묶음 3\+3.*메뉴판/);
  assert.match(O.serveText(order('d2-04'), fill('8 4 8'), 'shelf'), /엇박 선반/);
});
check('TX-07 pick explanations and second-attempt assistance', () => {
  assert.match(O.pickPrompt(order('d1-03')), /몇 칸일까요/);
  assert.match(O.pickWrongText(order('d1-03'), 0, 1), /4분음표 3개/);
  assert.match(O.pickWrongText(order('d1-03'), 0, 2), /6칸.*확정/);
  assert.match(O.pickWrongText(order('d4-02'), 1, 1), /걸쳐요/);
  assert.match(O.pickWrongText(order('d4-03'), 3, 1), /꼬리/);
  assert.match(O.pickWrongText(order('d4-06'), 3, 1), /큰 박 클릭/);
  assert.match(O.pickRightText(order('d4-08')), /8분의 6박자/);
});
check('TX-08 all discovery templates interpolate correctly', () => {
  for (const sc of scenes) assert.doesNotMatch(O.sceneText(sc), /\{[mcnw]\d\}/);
  assert.match(O.sceneText(scenes.find(s => s.id === 'S3')), /둘씩 셋.*셋씩 둘/);
  const s4 = scenes.find(s => s.id === 'S4');
  assert.deepEqual(s4.states.map(st => straddles(st.fill, st.B)), [[1], []]);
});
check('TX-09 closing text and order record identity', () => {
  assert.match(O.closeText(7, 8), /도장을 받았어요/);
  assert.match(O.closeText(5, 8), /●가 2개/);
  assert.match(O.recordText(order('d4-02')), /4분·8분·4분·8분.*8분의 6박자/);
  assert.match(O.recordText(order('d4-06')), /소리 주문: 4분의 3박자/);
});
check('AU-01 pitch derived from equal-temperament formula', () => {
  assert.ok(Math.abs(E.hz(72) - 523.2511306011972) < 1e-10);
  assert.ok(Math.abs(E.hz(60) - 261.6255653005986) < 1e-10);
});
check('AU-02 duration-to-seconds preserves note length', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10);
  near(E.toSec(F(3, 4), 0.3), 1.8);
  near(E.toSec(F(1), 0.3), 2.4);
  near(E.toSec(F(1, 8), 0.45), 0.45);
  spans(fill('2 4 4')).forEach((s, i) => near(E.toSec(s.s, 0.3), [0, 1.2, 1.8][i]));
});
check('CT-02 and CT-03 generated content avoids prohibited or reduced wording', () => {
  const banned = /여섯 박|6박|틀렸|틀린|오답|실패/;
  const texts = [];
  for (const o of orders) {
    texts.push(O.orderText(o), O.tagKo(o), O.recordText(o));
    if (o.pick) texts.push(O.pickPrompt(o), O.pickRightText(o));
    for (const f of O.solutions(o)) texts.push(O.buildText(o, f).text, O.serveText(o, f));
    if (o.m?.num === 6) assert.doesNotMatch(O.orderText(o), /4분의 3박자/);
  }
  texts.push(...scenes.map(O.sceneText));
  for (const text of texts) assert.doesNotMatch(text.replaceAll('8분의 6박자', ''), banned);
});

  }
  {
    category = 'SM';
const { solutions, pickAnswer, makeItem, menuKeys } = O; const { parseFill, keyOf, fillsOf } = E;

function answer(game) {
  const o = game.item();
  if (o.kind === 'scene') { game.nextItem(); return; }
  if (game.state.phase === 'pick') { game.choose(pickAnswer(o)); game.confirmPick(); }
  if (game.state.phase === 'build') { for (const note of solutions(game.item(), game.state.last)[0]) game.place(note); game.bakePress(); }
  assert.equal(game.state.phase, 'bake', o.id);
  game.completeBake();
  assert.equal(game.state.phase, 'serve', o.id);
}

check('all five days complete all 39 exact orders and four discoveries without assistance', () => {
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

check('every assisted order is repeated once before final, with original marks preserved', () => {
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

check('pick omissions do not count; second choice miss supplies answer and build tries reset', () => {
  const game = new Game(); game.startDay('d1'); game.enter(3);
  const answerIndex = pickAnswer(game.item());
  game.confirmPick(); assert.equal(game.state.tries, 0); assert.equal(game.state.assisted, false);
  game.choose((answerIndex + 1) % 3); game.confirmPick(); assert.equal(game.state.tries, 1);
  game.choose((answerIndex + 1) % 3); game.confirmPick(); assert.equal(game.state.tries, 2); assert.equal(game.state.sel, answerIndex);
  game.confirmPick(); assert.equal(game.state.phase, 'build'); assert.equal(game.state.tries, 0); assert.equal(game.state.assisted, true);
});

check('incomplete bakes, overflow and a stopped bake preserve attempts and original pieces', () => {
  const game = new Game(); game.startDay('d0');
  game.bakePress(); assert.equal(game.state.tries, 0);
  game.place(parseFill('4')[0]);
  const before = keyOf(game.state.fill); game.place(parseFill('1')[0]); assert.equal(keyOf(game.state.fill), before);
  game.place(parseFill('4')[0]); game.bakePress(); game.stopBake();
  assert.equal(game.state.phase, 'build'); assert.equal(game.state.tries, 0); assert.equal(game.state.assisted, false);
  assert.equal(keyOf(game.state.fill), '4 4'); assert.deepEqual(game.state.menu, {});
});

check('second condition miss supplies first computed answer without baking', () => {
  const game = new Game(); game.startDay('d2');
  game.place(parseFill('1')[0]); game.bakePress(); assert.equal(game.state.tries, 1); assert.equal(game.state.phase, 'build');
  game.bakePress(); assert.equal(game.state.tries, 2); assert.equal(game.state.assisted, true);
  assert.equal(keyOf(game.state.fill), keyOf(solutions(game.item(), game.state.last)[0]));
});

check('group crossing is heard before assistance, but a condition order accepts and shelves it', () => {
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

check('other combination rejects known fill without marking and quit restores last served fill', () => {
  const game = new Game(); game.startDay('d2'); answer(game);
  const served = keyOf(game.state.served); assert.equal(game.canOther(), true);
  game.otherFill(); for (const note of parseFill(served)) game.place(note); game.bakePress();
  assert.equal(game.state.phase, 'build'); assert.equal(game.state.tries, 0); assert.equal(game.state.assisted, false);
  assert.match(game.state.msg.text, /이미 찾은/);
  game.clear(); game.place(parseFill('4')[0]); game.quitExtra();
  assert.equal(game.state.phase, 'serve'); assert.equal(keyOf(game.state.fill), served);
});

check('all solutions collected disables other combination', () => {
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

check('resume restores redo queue and records but restarts current order without partial pieces', () => {
  const game = new Game(); game.startDay('d2'); game.setState({ assisted: true }); answer(game); game.nextItem();
  const queue = game.state.queue; const idx = game.state.idx;
  game.place(parseFill('2')[0]); game.checkpoint();
  const restored = new Game(JSON.parse(JSON.stringify(game.save))); assert.equal(restored.resume(), true);
  assert.deepEqual(restored.state.queue, queue); assert.equal(restored.state.idx, idx); assert.deepEqual(restored.state.results, game.state.results);
  assert.equal(restored.state.last, game.state.last); assert.deepEqual(restored.state.fill, []); assert.equal(restored.state.phase, 'build');
});

check('free oven keeps equal-length fill, clears different-length fill and only collects complete bakes', () => {
  const game = new Game(); game.startFree(1);
  for (const note of parseFill('4 4 4')) game.place(note);
  game.changeMeter(3); assert.equal(keyOf(game.state.fill), '4 4 4');
  game.bakePress(); game.stopBake(); assert.deepEqual(game.state.shelf, {});
  game.bakePress(); game.completeBake(); assert.deepEqual(game.state.shelf['6/8'], ['4 4 4']);
  game.changeMeter(1); game.bakePress(); game.completeBake(); assert.deepEqual(game.state.menu['3/4'], ['4 4 4']);
  game.changeMeter(0); assert.deepEqual(game.state.fill, []);
});

check('sound-pick stop counts accepted answer; interrupted sound returns to choice', () => {
  const game = new Game(); game.startDay('d4'); game.enter(4);
  game.choose(pickAnswer(game.item())); game.confirmPick(); game.stopBake(true);
  assert.equal(game.state.phase, 'pick'); assert.equal(game.state.assisted, false); assert.deepEqual(game.state.menu, {});
  game.confirmPick(); game.stopBake(false); assert.equal(game.state.phase, 'serve');
});

check('passed stamps and best scores survive later assisted run', () => {
  const save = freshSave(); save.days.d0 = { passed: true, runs: 1, best: 8 };
  const game = new Game(save); game.startDay('d0');
  let guard = 100;
  while (game.state.screen === 'shift' && guard-- > 0) { game.setState({ assisted: true }); answer(game); game.nextItem(); }
  assert.deepEqual(game.save.days.d0, { passed: true, runs: 2, best: 8 });
  assert.equal(game.save.active, null);
});

  }
  {
    category = 'SV';


function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

check('SV-01 version 1 settings, day, books, scenes and active order survive round trip', () => {
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

check('SV-02 damaged and future saves preserve original bytes in backup', () => {
  for (const raw of ['{broken', '{"version":2,"unknown":"keep"}', 'null', '[]']) {
    const host = storage({ [SAVE_KEY]: raw }), loaded = loadSave(host);
    assert.equal(loaded.recovered, true);
    assert.deepEqual(loaded.save, freshSave());
    assert.equal(host.values.get(BACKUP_KEY), raw);
    assert.equal(host.values.get(SAVE_KEY), raw);
  }
});

check('missing v1 fields receive defaults, values are bounded and unknown day IDs ignored', () => {
  const host = storage({ [SAVE_KEY]: JSON.stringify({ version: 1, settings: { volume: 9, slow: 'yes', motion: 'bad' }, days: { d0: { best: 50, runs: -1, passed: true }, d9: {} }, stats: { orders: -1 } }) });
  const save = loadSave(host).save;
  assert.equal(save.settings.volume, 1);
  assert.equal(save.settings.slow, false);
  assert.equal(save.settings.motion, 'system');
  assert.deepEqual(save.days.d0, { passed: true, best: 8, runs: 0 });
  assert.equal(save.days.d9, undefined);
  assert.deepEqual(save.stats, { orders: 0, clean: 0, bakes: 0 });
});

check('SV-03 blocked localStorage falls back to current session and reports limitation', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const save = freshSave(); save.settings.slow = true;
  assert.equal(writeSave(save, blocked), false);
  const loaded = loadSave(blocked);
  assert.equal(loaded.persistent, false);
  assert.equal(loaded.save.settings.slow, true);
  assert.equal(loaded.warning, '이 기기에서는 기록이 저장되지 않아요.');
});

check('SV-04 menu and shelf are filtered by exact full length and crossing semantics', () => {
  const raw = { version: 1, menu: { '3/4': ['4 4 4', '4 4 4', '8 4 8', '4. 4.', '1', 'bad', '0'], '6/8': ['4. 4.'], '9/8': ['4. 4. 4.'] }, shelf: { '2/4': ['8 4 8', '4 4', '8 8', 'bad'], '6/8': ['4 4 4', '4. 4.'] }, scenes: ['S1', 'S1', 'S9'] };
  const save = loadSave(storage({ [SAVE_KEY]: JSON.stringify(raw) })).save;
  assert.deepEqual(save.menu, { '3/4': ['4 4 4'], '6/8': ['4. 4.'] });
  assert.deepEqual(save.shelf, { '2/4': ['8 4 8'], '6/8': ['4 4 4'] });
  assert.deepEqual(save.scenes, ['S1']);
});

check('invalid resumable queues never reach game indexing', () => {
  for (const active of [ { day: 'd9', queue: [], idx: 0 }, { day: 'd0', queue: [{ i: 100, redo: false }], idx: 0 }, { day: 'd0', queue: [{ i: 0, redo: false }], idx: 8 }, { day: 'd0', queue: [{ i: 7, redo: true }], idx: 0 } ]) {
    assert.equal(loadSave(storage({ [SAVE_KEY]: JSON.stringify({ version: 1, active }) })).save.active, null);
  }
});

check('fresh saves do not share mutable arrays or objects', () => {
  const a = freshSave(), b = freshSave();
  a.settings.tips.push('x'); a.days.d0.best = 7; a.menu['2/4'] = ['4 4'];
  assert.deepEqual(b.settings.tips, []);
  assert.equal(b.days.d0.best, 0);
  assert.deepEqual(b.menu, {});
});

  }

  category = 'AU';
  check('AU-03 metered schedule uses one preparation and two exact rhythm loops', () => {
    const spec = { m: E.M(3, 4), fill: E.parseFill('4 4 4') }, plan = createAudioPlan(spec);
    const tones = plan.events.filter(event => event.type === 'tone');
    assert.equal(tones.length, 6);
    tones.forEach((event, i) => assert.ok(Math.abs(event.time - (1.8 + i * .6)) < 1e-9));
    const clicks = plan.events.filter(event => event.type === 'click');
    assert.equal(clicks.length, 18);
    clicks.forEach((event, i) => assert.ok(Math.abs(event.time - i * .3) < 1e-9));
    const slow = createAudioPlan({ m: E.M(4, 4), fill: E.parseFill('2 4 4') }, { slow: true, subs: false });
    const mainClicks = slow.events.filter(event => event.type === 'click');
    assert.equal(mainClicks.length, 12);
    mainClicks.forEach((event, i) => assert.ok(Math.abs(event.time - i * .9) < 1e-9));
    assert.deepEqual(CLICK.map(value => value[0]), [2700, 1900, 1250]);
  });
  check('AU-04 slot compares one low reference tone with exactly equal-duration pieces', () => {
    const plan = createAudioPlan({ slot: E.N(4, 1), fill: E.parseFill('4 8') });
    const tones = plan.events.filter(event => event.type === 'tone');
    assert.equal(plan.events.filter(event => event.type === 'click').length, 8);
    assert.deepEqual(tones.map(event => event.midi), [60, 72, 72]);
    tones.forEach((event, i) => assert.ok(Math.abs(event.time - [.6, 1.5, 2.1][i]) < 1e-9));
  });
  check('AU-05 stop cancels the entire outstanding node group and hides the needle', () => {
    const frames = [], engine = new AudioEngine({ onFrame: value => frames.push(value) });
    let cancelled = 0;
    engine.nodes.add({ stop() { cancelled++; } });
    engine.nodes.add({ stop() { cancelled++; } });
    engine.run = { kind: 'bake' }; engine.stop();
    assert.equal(cancelled, 2); assert.equal(engine.nodes.size, 0); assert.equal(engine.run, null);
    assert.equal(frames.at(-1).visible, false);
    engine.destroy();
  });
  check('AU-06 sound questions force subdivision clicks while normal replay honors settings', () => {
    const spec = { m: E.M(3, 4), fill: E.parseFill('4 4 4') };
    assert.equal(createAudioPlan(spec, { subs: false, kind: 'hear' }).events.filter(event => event.type === 'click').length, 18);
    assert.equal(createAudioPlan(spec, { subs: false, kind: 'listen' }).events.filter(event => event.type === 'click').length, 9);
  });
  // Restore the fallback snapshot after fake-storage tests; never write to the device.
  writeSave(originalMemory, null);
  const groupMap = {};
  for (const result of results) { groupMap[result.group] ||= { name: result.group, pass: 0, passed: 0, total: 0, failures: [], results: [] }; const group = groupMap[result.group]; group.total++; group.results.push(result); if (result.ok) { group.pass++; group.passed++; } else group.failures.push(result.name); }
  const pass = results.filter(result => result.ok).length;
  return { pass, passed: pass, total: results.length, fail: results.length - pass, results, groups: Object.values(groupMap), groupMap };
}
