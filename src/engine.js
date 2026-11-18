// 박자표 피자 화덕 — 이론 엔진 초안(분수 기반). 수치 표를 두지 않고 규칙으로 계산한다.
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
export const F = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; };
export const add = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => F(a.n * b.n, a.d * b.d);
export const div = (a, b) => F(a.n * b.d, a.d * b.n);
export const eq = (a, b) => a.n === b.n && a.d === b.d;
export const cmp = (a, b) => a.n * b.d - b.n * a.d;                       // 음수: a < b
export const num = (a) => a.n / a.d;
export const str = (a) => (a.d === 1 ? `${a.n}` : `${a.n}/${a.d}`);
export const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const isPow2 = (x) => Number.isInteger(x) && x > 0 && (x & (x - 1)) === 0;
const ZERO = F(0);

// ── 음표(조각). 길이는 온음표 = 1. den: 1, 2, 4, 8, 16 / dots: 점 개수 ──
export const N = (den, dots = 0) => ({ den, dots });
export const noteWhole = (den, dots = 0) => F(2 ** (dots + 1) - 1, den * 2 ** dots);
export const dur = (note) => noteWhole(note.den, note.dots);
// 길이에서 음표 찾기: 1/2^k 이면 민음표, 3/2^k 이면 점음표. 한 음표로 못 적으면 null
export function noteOf(len) {
  if (len.n === 1 && isPow2(len.d)) return N(len.d, 0);
  if (len.n === 3 && isPow2(len.d) && len.d >= 2) return N(len.d / 2, 1);
  return null;
}

// ── 박자표. {num, den}을 약분하지 않는다(6/8과 3/4는 다른 박자표다). 길이만 분수로 계산한다 ──
export const M = (numer, den) => ({ num: numer, den });
export const capacity = (m) => F(m.num, m.den);                            // 한 마디의 길이(온음표 = 1)
// 기본 묶음(분모 음표의 개수). 분자가 3의 배수(6, 9, 12 …)면 셋씩, 2·3·4면 한 박씩, 그 밖에는 주문이 정해야 한다
export function defaultGroups(m) {
  if (m.num % 3 === 0 && m.num > 3) return Array(m.num / 3).fill(3);
  if (m.num >= 2 && m.num <= 4) return Array(m.num).fill(1);
  return null;
}
// 2와 3으로 n을 만드는 모든 순서(섞임박자의 묶음 후보)
export function groupings(n) {
  if (n === 0) return [[]];
  if (n < 2) return [];
  return [2, 3].flatMap((g) => (n - g >= 0 ? groupings(n - g).map((rest) => [g, ...rest]) : []));
}
export const kindOf = (groups) => (groups.every((g) => g === 1) ? "simple" : groups.every((g) => g === 3) ? "compound" : "mixed");
// 묶음 경계(0과 마디 끝 포함)
export function bounds(m, groups) {
  const out = [ZERO];
  for (const g of groups) out.push(add(out[out.length - 1], F(g, m.den)));
  return out;
}
// 분할 단위(잔박): 홑박자는 박을 둘로 나눈 것, 겹박자·섞임박자는 분모 음표
export const pulse = (m, groups) => (kindOf(groups) === "simple" ? F(1, m.den * 2) : F(1, m.den));
export const pulseGroups = (m, groups) => groups.map((g) => num(div(F(g, m.den), pulse(m, groups))));
export const beatNotes = (m, groups) => groups.map((g) => noteOf(F(g, m.den)));    // 큰 박 하나를 적는 음표
// 클릭: level 0 마디 첫 박, 1 큰 박, 2 분할
export function clicks(m, groups) {
  const B = bounds(m, groups), p = pulse(m, groups), out = [];
  for (let t = ZERO; cmp(t, capacity(m)) < 0; t = add(t, p)) out.push({ t, level: eq(t, ZERO) ? 0 : B.some((b) => eq(b, t)) ? 1 : 2 });
  return out;
}

// ── 판. turn = 판 한 바퀴의 길이(온음표 = 1). 보통 판 1, 큰 판 3/2 ──
export const TURN = F(1);
export const TURN_BIG = F(3, 2);
export const angle = (len, turn = TURN) => mul(div(len, turn), F(360));    // 각도(분수, 도)
export const fits = (m, turn = TURN) => cmp(capacity(m), turn) <= 0;        // 한 판에 들어가는가
export const turnFor = (m) => (fits(m, TURN) ? TURN : fits(m, TURN_BIG) ? TURN_BIG : null);
export const sameAreaRadius = (turn) => Math.sqrt(num(turn));               // 같은 음표가 같은 넓이가 되는 반지름 배율

// ── 채우기(조각의 순서 있는 목록) ──
export const total = (fill) => fill.reduce((s, x) => add(s, dur(x)), ZERO);
export function spans(fill) {
  let t = ZERO;
  return fill.map((note) => { const s = t; t = add(t, dur(note)); return { s, e: t, note }; });
}
// 걸침: 조각이 묶음 경계를 부분적으로 넘는다. 경계에서 시작해 경계에서 끝나며 묶음을 통째로 덮는 조각은 걸침이 아니다
export function straddles(fill, B) {
  const on = (t) => B.some((b) => eq(b, t));
  return spans(fill).map(({ s, e }, i) => (B.some((b) => cmp(s, b) < 0 && cmp(b, e) < 0) && !(on(s) && on(e)) ? i : -1)).filter((i) => i >= 0);
}
// 길이 판정: 부족(short) · 딱 맞음(exact) · 넘침(over)과 그 차이. len은 채울 길이(한 마디 또는 조각 자리)
export function lengthIn(len, fill) {
  const d = sub(len, total(fill)), c = cmp(d, ZERO);
  return { state: c > 0 ? "short" : c < 0 ? "over" : "exact", diff: c < 0 ? sub(ZERO, d) : d };
}
export const lengthOf = (m, fill) => lengthIn(capacity(m), fill);
// 차이를 음표 개수로: 분모 음표로 나누어 떨어지면 그 음표로, 아니면 딱 떨어지는 가장 긴 민음표로. m이 없으면 뒤쪽만 쓴다
export function asCount(len, m) {
  const k = m ? div(len, F(1, m.den)) : null;
  if (k && k.d === 1) return { note: N(m.den), count: k.n };
  return { note: N(len.d), count: len.n };
}
// 모든 채우기(순서 구분). len: 채울 길이, tray: 음표 목록
export function fillsOf(len, tray, limit = 200000) {
  const out = [];
  (function go(rest, acc) {
    if (out.length >= limit) return;
    if (eq(rest, ZERO)) { out.push(acc.slice()); return; }
    for (const note of tray) { const d = dur(note); if (cmp(d, rest) <= 0) { acc.push(note); go(sub(rest, d), acc); acc.pop(); } }
  })(len, []);
  return out;
}
export const fills = (m, tray, limit) => fillsOf(capacity(m), tray, limit);
export const fitting = (m, groups, list) => list.filter((f) => straddles(f, bounds(m, groups)).length === 0);
export const keyOf = (fill) => fill.map((x) => x.den + ".".repeat(x.dots)).join(" ");
export const parseFill = (s) => (s && s.trim() ? s.trim().split(/\s+/).map((t) => N(parseInt(t, 10), t.endsWith(".") ? 1 : 0)) : []);   // "4. 4 8" → 조각 목록
export const sameNote = (a, b) => a.den === b.den && a.dots === b.dots;
export const cells = (len) => div(len, F(1, 8));                            // 칸 수. 판의 눈금 한 칸은 8분음표 하나다
// 그 박자표의 묶음에 맞는 채우기에 한 번이라도 나오는 조각(그 박자표의 쟁반)
export function usable(m, groups, pieces) {
  const fit = fitting(m, groups, fills(m, pieces));
  return pieces.filter((p) => fit.some((f) => f.some((x) => sameNote(x, p))));
}
// 꼬리 잇기(빔): 같은 묶음 안에서 이어지는 8분음표 이하끼리 묶는다
export function beams(fill, B) {
  const groupOf = (t) => B.findIndex((b, i) => i < B.length - 1 && cmp(b, t) <= 0 && cmp(t, B[i + 1]) < 0);
  const out = []; let cur = [], g = -1;
  spans(fill).forEach(({ s, note }, i) => {
    const flagged = note.den >= 8, gi = groupOf(s);
    if (flagged && cur.length && gi === g) cur.push(i);
    else { if (cur.length > 1) out.push(cur); cur = flagged ? [i] : []; g = gi; }
  });
  if (cur.length > 1) out.push(cur);
  return out;
}
// 시간: 8분음표 하나의 길이(초)를 기준으로 한다. 빠르기는 분수 길이를 바꾸지 않는다
export const toSec = (len, eighthSec) => num(div(len, F(1, 8))) * eighthSec;

// ── 이름(우리말). 이론 표가 아니다 ──
export const noteKo = (note) => "점".repeat(note.dots) + (note.den === 1 ? "온음표" : `${note.den}분음표`);
export const meterKo = (m) => `${m.den}분의 ${m.num}박자`;
export const kindKo = (groups) => ({ simple: "홑박자", compound: "겹박자", mixed: "섞임박자" }[kindOf(groups)]);
export const groupText = (xs) => xs.join("+");
export const countKo = (len, m) => { const c = asCount(len, m); return `${noteKo(c.note)} ${c.count}개 분량`; };
export const shortKo = (note) => "점".repeat(note.dots) + (note.den === 1 ? "온" : `${note.den}분`);
