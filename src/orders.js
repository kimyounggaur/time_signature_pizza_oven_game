// 박자표 피자 화덕 — 주문 모델. 씨앗에서 문장, 보기, 풀이, 판정, 안내문을 만든다. DOM과 오디오를 만지지 않는다.
import { F, N, M, sub, eq, cmp, num, str, dur, capacity, defaultGroups, kindOf, bounds, pulseGroups, clicks, straddles, lengthIn, fillsOf, fills, fitting, keyOf, parseFill, sameNote, cells, usable, beams, noteKo, meterKo, groupText, countKo, shortKo } from "./engine.js";

export const PIECES = [N(1), N(2, 1), N(2), N(4, 1), N(4), N(8)];        // v1.0의 조각 여섯 종. 쟁반의 자리 순서(긴 것부터)
export const METERS = [M(2, 4), M(3, 4), M(4, 4), M(6, 8)];               // v1.0의 박자표. 박자표 고르기의 보기 순서
export const meterKey = (m) => `${m.num}/${m.den}`;
export const passNeed = (n) => Math.ceil(n * 0.8);                         // 영업일 통과에 필요한 ● 수

// ── 씨앗 → 계산된 주문과 발견 장면 ──
export function makeOrder(seed) {
  const m = seed.meter ? M(seed.meter[0], seed.meter[1]) : null, slot = seed.slot ? parseFill(seed.slot)[0] : null;
  const g = m ? seed.groups || defaultGroups(m) : null, len = m ? capacity(m) : dur(slot), B = m ? bounds(m, g) : [F(0), len];
  const tray = seed.tray ? parseFill(seed.tray) : m ? usable(m, g, PIECES) : PIECES.filter((p) => cmp(dur(p), len) < 0);
  const pick = seed.pick || (seed.ask === "score" || seed.ask === "sound" ? "meter" : null);
  return { id: seed.id, kind: "order", ask: seed.ask, m, slot, g, len, B, tray, pick, target: seed.target ? parseFill(seed.target) : null,
    cond: seed.cond || null, strict: seed.ask === "group", fresh: !!seed.fresh, final: !!seed.final };
}
export function makeScene(seed) {
  const states = seed.states.map((s) => { const m = M(s.meter[0], s.meter[1]), g = defaultGroups(m); return { m, g, len: capacity(m), B: bounds(m, g), fill: parseFill(s.fill) }; });
  return { id: seed.id, kind: "scene", title: seed.title, text: seed.text, states };
}
// 장면 문장의 {m0} {c0} {n0} {w0}을 엔진 값으로 채운다: 박자표 이름, 칸 수, 조각 수, 묶음을 말로("둘씩 셋")
const WORD = { 1: "하나", 2: "둘", 3: "셋", 4: "넷" };
export function sceneText(sc) {
  return sc.text.replace(/\{([mcnw])(\d)\}/g, (_, k, i) => { const st = sc.states[+i], pg = pulseGroups(st.m, st.g);
    return k === "m" ? meterKo(st.m) : k === "c" ? str(cells(st.len)) : k === "n" ? String(st.fill.length) : `${WORD[pg[0]]}씩 ${WORD[pg.length]}`; });
}
export const makeItem = (seed) => (seed.states ? makeScene(seed) : makeOrder(seed));

// ── 풀이와 판정 ──
export function condFail(cond, fill) {                                     // 어긴 조건 하나(없으면 null)
  if (!cond) return null;
  if (cond.has) { const note = parseFill(cond.has[0])[0], got = fill.filter((x) => sameNote(x, note)).length; if (got !== cond.has[1]) return { type: "has", note, want: cond.has[1], got }; }
  if (cond.kinds != null) { const got = new Set(fill.map((x) => keyOf([x]))).size; if (got !== cond.kinds) return { type: "kinds", want: cond.kinds, got }; }
  if (cond.pieces != null && fill.length !== cond.pieces) return { type: "pieces", want: cond.pieces, got: fill.length };
  return null;
}
// 그 주문의 모든 정답. last: 방금 낸 채우기의 열쇠("다른 조합"에서만 쓴다)
export function solutions(o, last = null) {
  if (o.target) return [o.target];
  let list = fillsOf(o.len, o.tray);
  if (o.strict) list = list.filter((f) => straddles(f, o.B).length === 0);
  list = list.filter((f) => !condFail(o.cond, f));
  return o.fresh ? list.filter((f) => keyOf(f) !== last) : list;
}
// 판정 순서: 길이 → 쪽지 → 묶음 → 조건 → 다른 조합
export function judge(o, fill, last = null) {
  const len = lengthIn(o.len, fill), bad = straddles(fill, o.B);
  if (len.state !== "exact") return { ok: false, why: "length", len, bad };
  if (o.target) { const at = o.target.findIndex((x, i) => !fill[i] || !sameNote(x, fill[i])); if (at >= 0 || fill.length !== o.target.length) return { ok: false, why: "score", at: at >= 0 ? at : o.target.length, bad }; }
  if (o.strict && bad.length) return { ok: false, why: "group", bad };
  const cond = condFail(o.cond, fill);
  if (cond) return { ok: false, why: "cond", cond, bad };
  if (o.fresh && keyOf(fill) === last) return { ok: false, why: "fresh", bad };
  return { ok: true, bad };
}

// ── 고르기: 도우(칸 수) 또는 박자표 ──
export const doughOptions = () => [...new Set(METERS.map((m) => num(cells(capacity(m)))))].sort((a, b) => a - b);
// 그 박자표가 악보·소리 주문의 답인가: ok · short · long · group(묶음에 걸친다, 클릭이 다르다) · beam(꼬리 잇기가 다르다)
export function meterFits(o, m2) {
  const g2 = defaultGroups(m2), B2 = bounds(m2, g2), c = cmp(capacity(m2), o.len), lv = (m, g) => clicks(m, g).map((x) => x.level).join("");
  if (c !== 0) return c < 0 ? "short" : "long";
  if (o.ask === "sound") return lv(m2, g2) === lv(o.m, o.g) ? "ok" : "group";
  if (straddles(o.target, B2).length) return "group";
  return JSON.stringify(beams(o.target, B2)) === JSON.stringify(beams(o.target, o.B)) ? "ok" : "beam";
}
export const pickOptions = (o) => (o.pick === "dough" ? doughOptions() : o.pick === "meter" ? METERS : []);
export const pickAnswer = (o) => (o.pick === "dough" ? doughOptions().indexOf(num(cells(o.len))) : METERS.findIndex((m) => meterFits(o, m) === "ok"));
export const pickUnique = (o) => (o.pick === "meter" ? METERS.filter((m) => meterFits(o, m) === "ok").length === 1 : pickAnswer(o) >= 0);

// ── 메뉴판: 박자표마다 묶음에 맞는 채우기 전부 ──
export const menuTray = (m) => usable(m, defaultGroups(m), PIECES);
export const menuKeys = (m) => fitting(m, defaultGroups(m), fills(m, menuTray(m))).map(keyOf);
// 낸 리듬이 가는 곳: 묶음에 맞으면 메뉴판의 칸("menu"), 걸친 조각이 있으면 엇박 선반("shelf"). 자리 채우기는 모으지 않는다(null)
export const menuSlot = (o, fill) => (!o.m ? null : straddles(fill, o.B).length ? "shelf" : "menu");
// 이 주문의 풀이 가운데 아직 찾지 못한 것. found: 그 박자표에서 찾은 열쇠(메뉴판과 엇박 선반). 내기의 [다른 조합]을 켤지 정한다
export const unfound = (o, found) => (!o.m || o.ask === "sound" ? [] : solutions(Object.assign({}, o, { fresh: false })).filter((f) => !found.includes(keyOf(f))));
// 발견 장면의 보기 이름: 박자표가 서로 다르면 박자표, 같으면 조각 수
export function stateLabels(sc) {
  const one = sc.states.every((s) => meterKey(s.m) === meterKey(sc.states[0].m));
  return sc.states.map((s) => (one ? `조각 ${s.fill.length}개` : meterKey(s.m)));
}

// ── 문장. 수치와 이름은 전부 엔진이 넣는다 ──
const open2 = (n) => n === 2;                                              // 묶음의 끝 숫자가 2(이)면 받침이 없다
const iga = (xs) => (open2(xs[xs.length - 1]) ? "가" : "이"), euro = (xs) => (open2(xs[xs.length - 1]) ? "로" : "으로");
export const trayKo = (tray) => tray.map(shortKo).join("·") + "음표";
export const tagKo = (o, redo = false) => (redo ? "다시 한 번 · " : o.final ? "마감 · " : "") + (o.slot ? "자리 채우기" : o.fresh ? "다른 조합" : { set: "지정 주문", cond: "조건 주문", group: "묶음 주문", score: "악보 주문", sound: "소리 주문" }[o.ask]);
export function condKo(cond) {
  const parts = [];
  if (cond && cond.has) parts.push(`${noteKo(parseFill(cond.has[0])[0])} 조각을 ${cond.has[1]}개 넣어`);
  if (cond && cond.kinds != null) parts.push(`서로 다른 조각 ${cond.kinds}종류로`);
  if (cond && cond.pieces != null) parts.push(`조각 ${cond.pieces}개로`);
  return parts.join(" ");
}
export function orderText(o) {
  if (o.ask === "score") return "이 쪽지대로 주세요.";
  if (o.ask === "sound") return "소리를 듣고 박자표를 골라 주세요.";
  const fresh = o.fresh ? "방금과 다르게," : "", how = o.ask === "set" ? `${trayKo(o.tray)} 조각으로만` : condKo(o.cond);
  if (o.slot) return [fresh, `${noteKo(o.slot)} 조각만 한 자리를`, how, "채워 주세요."].filter(Boolean).join(" ");
  const pg = pulseGroups(o.m, o.g), show = !o.strict ? "" : kindOf(o.g) === "simple" ? "박이 보이게" : `${groupText(pg)}${iga(pg)} 보이게`;
  return [fresh, `${meterKo(o.m)} 피자를`, show, how, "주세요."].filter(Boolean).join(" ");
}
// 악보 쪽지를 말로 읽은 것(화면 읽기용)
export const scoreAlt = (o) => `악보 쪽지: ${o.target.map(noteKo).join(", ")}`;
// 마감 화면의 주문별 기록에 적는 말. 악보·소리 주문은 문장이 같으므로 리듬과 박자표를 적는다
export const recordText = (o) => (o.ask === "score" ? `악보 주문: ${o.target.map(shortKo).join("·")} (${meterKo(o.m)})` : o.ask === "sound" ? `소리 주문: ${meterKo(o.m)} (${o.target.map(shortKo).join("·")})` : orderText(o));
export const straddleText = (o, bad) => `${bad.map((i) => i + 1).join("·")}번째 조각이 ${o.m && kindOf(o.g) !== "simple" ? "묶음" : "박"} 경계에 걸쳐 있어요`;
export function fillKo(fill) {                                              // "4분음표 2개" · "4분음표 1개 + 8분음표 1개"
  const seen = [];
  for (const x of fill) { const e = seen.find((s) => sameNote(s.note, x)); if (e) e.n++; else seen.push({ note: x, n: 1 }); }
  return seen.map((s) => `${noteKo(s.note)} ${s.n}개`).join(" + ");
}
const amountKo = (len, m) => countKo(len, m).replace(" 분량", "");         // "8분음표 1개"
// 조립 중의 판독 줄. ghost: 방금 누른, 안 들어가는 조각
export function buildText(o, fill, ghost = null) {
  const len = lengthIn(o.len, fill), bad = straddles(fill, o.B);
  if (ghost) return { tone: "warn", text: `${noteKo(ghost)}는 ${amountKo(sub(dur(ghost), len.diff), o.m)}만큼 넘쳐요. 남은 자리는 ${countKo(len.diff, o.m)}이에요.` };
  if (o.final) return { tone: "", text: "마감 주문이에요. 도움 없이 만들어요." };
  if (len.state === "short") return { tone: bad.length && o.strict ? "warn" : "", text: `남은 자리는 ${countKo(len.diff, o.m)}이에요.` + (bad.length ? ` ${straddleText(o, bad)}.` : "") };
  if (bad.length && o.strict) return { tone: "warn", text: `길이는 맞아요. 그런데 ${straddleText(o, bad)}.` };
  if (bad.length) return { tone: "good", text: `딱 맞아요. ${straddleText(o, bad)}. 구워서 들어 보세요.` };
  return { tone: "good", text: "딱 맞아요. 굽기를 눌러요." };
}
export const FULL_TEXT = "이미 딱 맞아요. 굽거나 조각을 빼요.";
export const FIXED_TEXT = "한 가지 답을 올려 두었어요. 굽기를 눌러 들어 보세요.";
export function judgeText(o, j) {
  if (j.why === "length") return `아직 못 구워요. ${countKo(j.len.diff, o.m)}이 더 필요해요.`;
  if (j.why === "score") return `길이는 맞아요. 그런데 쪽지와 달라요. ${j.at + 1}번째 조각을 보세요.`;
  if (j.why === "group") return `길이는 맞지만 ${straddleText(o, j.bad)}. ${kindOf(o.g) === "simple" ? "박" : groupText(pulseGroups(o.m, o.g)) + " 묶음"}이 가려져요.`;
  if (j.why === "fresh") return "길이는 맞아요. 그런데 방금 구운 리듬과 같아요. 조각이나 순서를 바꿔요.";
  const c = j.cond;
  if (c.type === "pieces") return `길이는 맞아요. 조각이 ${c.got}개예요. 주문은 ${c.want}개예요.`;
  if (c.type === "kinds") return `길이는 맞아요. 조각 종류가 ${c.got}가지예요. 주문은 ${c.want}가지예요.`;
  return `길이는 맞아요. ${noteKo(c.note)}가 ${c.got}개예요. 주문은 ${c.want}개예요.`;
}
export function serveText(o, fill, isNew = false) {                         // isNew: false · "menu"(또는 true) · "shelf"
  if (o.slot) return `완성이에요. ${noteKo(o.slot)} 하나는 ${fillKo(fill)}와 길이가 같아요.`;
  return `완성이에요. ${meterKo(o.m)} · 묶음 ${groupText(pulseGroups(o.m, o.g))} · 조각 ${fill.length}개.` + (isNew === "shelf" ? " 엇박 선반에 새 리듬이 올랐어요." : isNew ? " 메뉴판에 새 리듬이 올랐어요." : "");
}
export const BAKE_TEXT = "준비 한 마디를 듣고 두 바퀴 구워요.";
export const BAKE_SLOT_TEXT = "자리의 소리를 먼저 듣고, 조각의 소리를 들어요.";
export const EXTRA_TEXT = "같은 주문을 다른 리듬으로 만들어 보세요. 새 리듬은 메뉴판에 올라가요.";
export const FOUND_TEXT = "이미 찾은 리듬이에요. 조각이나 순서를 바꿔요.";
export const ABORT_TEXT = "소리가 멈춰서 중단했어요. 소리를 켜고 다시 해 주세요.";
// 마감: ● 수와 도장. total은 그날의 주문 수
export function closeText(clean, total) {
  const need = passNeed(total);
  return `한 번에 맞힌 주문 ${clean}/${total}. ` + (clean >= need ? "도장을 받았어요." : `도장까지 ●가 ${need - clean}개 더 필요해요.`);
}
export const newText = (menuNew, shelfNew) => `메뉴판에 새로 오른 리듬 ${menuNew}개` + (shelfNew ? ` · 엇박 선반 ${shelfNew}개` : "");
export function pickPrompt(o) {
  if (o.pick === "dough") return `${meterKo(o.m)} 도우는 몇 칸일까요? 눈금 한 칸은 8분음표 하나예요.`;
  return o.ask === "sound" ? "주문 듣기를 누르고 박자표를 골라요." : "쪽지의 리듬을 보고 박자표를 골라요.";
}
export const PICK_FIRST_TEXT = "보기를 먼저 골라 주세요.";
// k: 고른 보기의 번호. tries: 이 주문에서 틀린 횟수(이번 것 포함). 두 번째부터는 답을 골라 준다
export function pickWrongText(o, k, tries) {
  if (o.pick === "dough") {
    const unit = N(o.m.den);
    if (tries >= 2) return `${noteKo(unit)} ${o.m.num}개면 ${str(cells(o.len))}칸이에요. 골라 두었어요. 확정을 눌러요.`;
    return `${meterKo(o.m)}는 ${noteKo(unit)} ${o.m.num}개 분량이에요. ${noteKo(unit)} 하나는 ${str(cells(dur(unit)))}칸이에요.`;
  }
  if (tries >= 2) return `답은 ${meterKo(o.m)}예요. 골라 두었어요. 확정을 눌러요.`;
  const m2 = METERS[k], why = meterFits(o, m2), g2 = defaultGroups(m2), pg2 = pulseGroups(m2, g2);
  if (o.ask === "sound") return why === "group" ? "길이는 맞아요. 큰 박 클릭이 한 마디에 몇 번인지 세어 보세요." : "한 마디의 길이가 달라요. 첫 박 클릭 사이의 분할을 세어 보세요.";
  if (why === "short" || why === "long") return `이 리듬은 ${str(cells(o.len))}칸이에요. ${meterKo(m2)} 도우는 ${str(cells(capacity(m2)))}칸이라 ${why === "short" ? "모자라요" : "남아요"}.`;
  if (why === "group") return `길이는 맞아요. 그런데 ${meterKo(m2)}의 묶음에는 ${straddles(o.target, bounds(m2, g2))[0] + 1}번째 음표가 걸쳐요.`;
  return `길이는 맞아요. 그런데 ${meterKo(m2)}라면 꼬리를 ${groupText(pg2)}${euro(pg2)} 이어요. 쪽지를 보세요.`;
}
export function pickRightText(o) {
  if (o.pick === "dough") return `맞아요. ${str(cells(o.len))}칸이에요. 이제 조각을 올려요.`;
  return o.ask === "sound" ? `맞아요. ${meterKo(o.m)}예요. 리듬을 보면서 다시 들어요.` : `맞아요. ${meterKo(o.m)}예요. 이제 쪽지대로 만들어요.`;
}
