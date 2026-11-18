import { F, TURN, add, div, num, eq, cmp, angle, dur, noteWhole, total, spans, straddles, pulse, beams, cells, noteKo, shortKo, capacity, defaultGroups, bounds, meterKo } from './engine.js';

let serial = 0;
const escape = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// ── 그리기 도구 ──
const CX = 170, CY = 170, R_WOOD = 166, R_T0 = 154, R_T1 = 162, R_ARC = 145, R_DOUGH = 132, R_SLICE = 124, R_HUB = 28, RAD = Math.PI / 180;
const r1 = (x) => Math.round(x * 10) / 10;
const pt = (a, r) => [r1(CX + r * Math.sin(a * RAD)), r1(CY - r * Math.cos(a * RAD))];
function wedge(a0, a1, r, cx = CX, cy = CY) {
  if (a1 - a0 >= 359.99) return `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}Z`;
  const p = (a) => [r1(cx + r * Math.sin(a * RAD)), r1(cy - r * Math.cos(a * RAD))], [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${cx} ${cy}L${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}Z`;
}
function arcPath(a0, a1, r) { const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; }
const tint = (note) => `var(--n${note.den})`;                                        // 점음표는 바탕 음표와 같은 색을 쓴다
function glyph(note, x, y, o = {}) {                                                 // 음표 하나: 머리, 기둥, 꼬리, 점
  const c = o.color || "var(--ink)", open = note.den <= 2, up = 22;
  let h = `<g transform="translate(${r1(x)} ${r1(y)})${o.s ? ` scale(${o.s})` : ""}">`;
  h += `<ellipse rx="5.6" ry="4" transform="rotate(-20)" style="fill:${open ? "none" : c};stroke:${c}" stroke-width="${open ? 1.7 : 0}"/>`;
  if (note.den >= 2) h += `<line x1="5.1" y1="-1.2" x2="5.1" y2="${-up}" style="stroke:${c}" stroke-width="1.5"/>`;
  if (note.den >= 8 && !o.beamed) h += `<path d="M5.1 ${-up}c1.5 5 7 6 5.5 13" fill="none" style="stroke:${c}" stroke-width="1.6" stroke-linecap="round"/>`;
  for (let i = 0; i < note.dots; i++) h += `<circle cx="${10.5 + i * 4.5}" cy="-2.6" r="1.8" style="fill:${c}"/>`;
  return h + "</g>";
}

function boardContent(v) {
  const A = (len) => num(angle(len, v.turn)), capA = v.len ? A(v.len) : 0, tot = total(v.fill), totA = A(tot), full = !!v.len && eq(tot, v.len), sp = spans(v.fill), bad = v.B && v.marks ? straddles(v.fill, v.B) : [];
  let h = `<defs><pattern id="${v.uid}hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" style="stroke:var(--warn)" stroke-width="2.4"/></pattern></defs>`;
  h += `<circle cx="${CX}" cy="${CY}" r="${R_WOOD}" style="fill:var(--wood);stroke:var(--wood-edge)" stroke-width="3"/>`;
  h += `<g fill="none" stroke="#8a6128" stroke-width="1" opacity=".13" pointer-events="none"><path d="M30 110Q170 85 310 115M20 210Q170 190 320 214M61 65Q170 42 279 70M50 275Q170 255 290 275"/><ellipse cx="80" cy="200" rx="18" ry="6"/><ellipse cx="80" cy="200" rx="10" ry="3"/></g>`;
  for (let k = 0, ticks = num(cells(v.turn)); k < ticks; k++) { const a = A(F(k, 8)), q = k % 2 === 0, [x0, y0] = pt(a, q ? R_T0 - 2 : R_T0), [x1, y1] = pt(a, R_T1); h += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" style="stroke:var(--wood-edge)" stroke-width="${q ? 3 : 1.8}" stroke-linecap="round"/>`; }
  if (v.len) {
    h += `<path class="doughfill" d="${wedge(0, capA, R_DOUGH)}" style="fill:var(--dough);stroke:${full ? "var(--crust)" : "var(--dough-edge)"}" stroke-width="${full ? 6 : 2}"${full ? "" : ' stroke-dasharray="5 4"'} stroke-linejoin="round"/>`;
    if (360 - capA >= 60) { const [x, y] = pt((capA + 360) / 2, R_DOUGH * 0.6); h += `<text class="hint" text-anchor="middle" font-size="16" font-weight="600" fill="var(--ink)" x="${x}" y="${y + 5}">안 쓰는 판</text>`; }
    const emptyA = capA - totA;
    if ((emptyA >= 60 && !(v.preview && !v.note)) || (emptyA >= 44 && v.note)) { const [x, y] = emptyA >= 359 ? [CX, CY - 78] : pt((totA + capA) / 2, R_DOUGH * 0.6); h += `<text class="hint" text-anchor="middle" font-size="16" font-weight="600" fill="var(--ink)" x="${x}" y="${y + 5}">${v.note || (v.slot ? "자리" : "빈 자리")}</text>`; }
  } else if (v.hub.text !== "") { h += `<text class="hint" text-anchor="middle" font-size="16" font-weight="600" fill="var(--ink)" x="${CX}" y="${CY - 78}">${v.hub.text === "?" ? "박자표를 골라요" : "도우를 골라요"}</text>`; }
  // 묶음 경계: 긴 선은 조각 밑에 깔고(빈 도우에서만 보인다), 조각 위에는 가장자리의 짧은 눈금만 얹는다. 두 박을 덮는 조각이 둘로 잘려 보이지 않게
  if (v.g) v.B.slice(1, -1).forEach((b) => { const [x0, y0] = pt(A(b), R_HUB), [x1, y1] = pt(A(b), R_DOUGH + 7); h += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" style="stroke:var(--ink)" stroke-width="2.6" stroke-linecap="round" pointer-events="none"/>`; });
  sp.forEach(({ s, e, note }, i) => {
    h += `<path class="slice${v.tap ? " tap" : ""}" data-i="${i}"${v.tap ? ` tabindex="0" role="button" aria-label="${i + 1}번째 조각 ${noteKo(note)}. 누르면 빼요"` : ""} d="${wedge(A(s), A(e), R_SLICE)}" style="fill:${tint(note)};stroke:#fff" stroke-width="2.4"/>`;
    h += `<defs><clipPath id="${v.uid}slice${i}"><path d="${wedge(A(s), A(e), R_SLICE)}"/></clipPath></defs><g clip-path="url(#${v.uid}slice${i})" opacity=".32" pointer-events="none">`;
    for (const [delta, radial] of [[0, .9], [-.23, .49], [.23, .78]]) { const aa = (A(s)+A(e))/2 + (A(e)-A(s))*delta, [tx,ty] = pt(aa, R_SLICE*radial); h += toppingSVG(note,tx,ty,0.8); }
    h += `</g>`;
    if (bad.includes(i)) h += `<path d="${wedge(A(s), A(e), R_SLICE)}" fill="url(#${v.uid}hatch)" opacity="0.5" pointer-events="none"/>`;
    if (note.dots) { const a = A(add(s, noteWhole(note.den))), [x0, y0] = pt(a, R_HUB + 4), [x1, y1] = pt(a, R_SLICE - 3); h += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" style="stroke:#fff" stroke-width="1.6" stroke-dasharray="3 4" pointer-events="none"/>`; }
  });
  if (v.ghost) {                                                                     // 넘친 조각: 테두리는 전체, 빗금은 도우를 넘은 만큼만
    const g1 = totA + A(dur(v.ghost));
    h += `<path d="${wedge(capA, g1, R_SLICE)}" fill="url(#${v.uid}hatch)" opacity="0.6" pointer-events="none"/><path d="${wedge(totA, g1, R_SLICE)}" fill="none" style="stroke:var(--warn)" stroke-width="2.6" stroke-dasharray="6 4" stroke-linejoin="round" pointer-events="none"/>`;
  }
  if (v.g) {
    const p = pulse(v.m, v.g);
    v.B.slice(1, -1).forEach((b) => { const [x0, y0] = pt(A(b), R_SLICE - 9), [x1, y1] = pt(A(b), R_DOUGH + 7); h += `<line class="gtick" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" style="stroke:var(--ink)" stroke-width="2.6" stroke-linecap="round" pointer-events="none"/>`; });
    v.g.forEach((_, i) => {                                                          // 묶음 테두리와 분할 점
      h += `<path class="garc" d="${arcPath(A(v.B[i]) + 3.5, A(v.B[i + 1]) - 3.5, R_ARC)}" fill="none" style="stroke:var(--ink)" stroke-width="3.2" stroke-linecap="round"/>`;
      for (let t = v.B[i], k = 0; cmp(t, v.B[i + 1]) < 0; t = add(t, p), k++) { const [x, y] = pt(A(t) + (k === 0 ? 3.5 : 0), R_ARC); h += `<circle cx="${x}" cy="${y}" r="${k === 0 ? (i === 0 ? 7.5 : 6) : 3}" style="fill:${k === 0 && i === 0 ? "var(--sauce)" : "var(--ink)"};stroke:var(--wood)" stroke-width="1.5"/>`; }
    });
  }
  h += `<g class="lab" text-anchor="middle" font-size="16" font-weight="700" fill="var(--ink)" pointer-events="none">`;
  sp.forEach(({ s, e, note }) => {
    const a0 = A(s), a1 = A(e), wide = a1 - a0, [x, y] = wide >= 359 ? [CX, CY - 76] : pt((a0 + a1) / 2, R_SLICE * (wide >= 180 ? 0.52 : wide >= 90 ? 0.6 : 0.7));
    h += glyph(note, x - 4, y + 2) + `<text x="${x}" y="${y + 22}">${shortKo(note)}</text>`;
  });
  h += `</g>`;
  if (v.cursor && !full) { const [x, y] = pt(totA, R_DOUGH + 4); h += `<path d="M0 0L7 -13H-7Z" transform="translate(${x} ${y}) rotate(${r1(totA)})" style="fill:var(--sauce)" pointer-events="none"/>`; }
  h += `<line id="${v.handId}" class="hand" stroke="var(--sauce)" stroke-width="3.5" stroke-linecap="round" x1="${CX}" y1="${CY - R_HUB}" x2="${CX}" y2="${CY - R_ARC - 8}" visibility="hidden"/>`;
  h += `<circle cx="${CX}" cy="${CY}" r="${R_HUB}" style="fill:var(--panel);stroke:var(--ink)" stroke-width="2"/>`;
  if (v.hub.m) h += `<text x="${CX}" y="${CY - 3}" text-anchor="middle" font-size="20" font-weight="800">${v.hub.m.num}</text><line x1="${CX - 11}" y1="${CY + 1}" x2="${CX + 11}" y2="${CY + 1}" style="stroke:var(--ink)" stroke-width="1.6"/><text x="${CX}" y="${CY + 19}" text-anchor="middle" font-size="20" font-weight="800">${v.hub.m.den}</text>`;
  else if (v.hub.note) h += glyph(v.hub.note, CX - 5, CY + 9, { s: 1.35 });
  else if (v.hub.text) h += `<text x="${CX}" y="${CY + 8}" text-anchor="middle" font-size="24" font-weight="800">${v.hub.text}</text>`;
  return h;
}

function stripSvg(o) {
  const { W, H, len, fill } = o, pad = o.pad || 14, y = o.y || Math.round(H * 0.56), turn = o.turn || TURN;
  const X = (t) => r1(pad + num(div(t, turn)) * (W - 2 * pad)), xe = X(len), xt = X(turn), tot = total(fill), sp = spans(fill), bm = beams(fill, o.B), beamed = new Set(bm.flat());
  let h = "";
  if (!o.plain && xt - xe > 1) h += `<line x1="${xe}" y1="${y}" x2="${xt}" y2="${y}" style="stroke:var(--line)" stroke-width="1.4" stroke-dasharray="2 4"/>` + (xt - xe >= 62 ? `<text x="${(xe + xt) / 2}" y="${y - 9}" text-anchor="middle">안 쓰는 판</text>` : "");
  h += `<line x1="${X(F(0))}" y1="${y}" x2="${xe}" y2="${y}" style="stroke:var(--ink)" stroke-width="1.4"/>`;
  if (!o.plain) {
    h += `<line x1="${X(F(0))}" y1="${y - 13}" x2="${X(F(0))}" y2="${y + 13}" style="stroke:var(--ink)" stroke-width="1.4"/><line x1="${xe - 3.5}" y1="${y - 13}" x2="${xe - 3.5}" y2="${y + 13}" style="stroke:var(--ink)" stroke-width="1.4"/><line x1="${xe}" y1="${y - 13}" x2="${xe}" y2="${y + 13}" style="stroke:var(--ink)" stroke-width="3"/>`;
    if (o.g) { const p = pulse(o.m, o.g); o.g.forEach((_, i) => {
      h += `<line x1="${X(o.B[i]) + 4}" y1="${H - 9}" x2="${X(o.B[i + 1]) - 6}" y2="${H - 9}" style="stroke:var(--ink)" stroke-width="2.6" stroke-linecap="round"/>`;
      for (let t = o.B[i], k = 0; cmp(t, o.B[i + 1]) < 0; t = add(t, p), k++) h += `<circle cx="${X(t) + 4}" cy="${H - 9}" r="${k === 0 ? (i === 0 ? 5.5 : 4.5) : 2.4}" style="fill:${k === 0 && i === 0 ? "var(--sauce)" : "var(--ink)"}"/>`;
    }); }
  }
  bm.forEach((ix) => { const xa = X(sp[ix[0]].s) + 9 + 5.1, xb = X(sp[ix[ix.length - 1]].s) + 9 + 5.1; h += `<rect x="${xa - 0.8}" y="${y - 23}" width="${r1(xb - xa + 1.6)}" height="3.4" style="fill:var(--ink)"/>`; });
  sp.forEach(({ s, note }, i) => { h += `<g class="sn" data-i="${i}">${glyph(note, X(s) + 9, y, { beamed: beamed.has(i) })}</g>`; });
  return h;
}

function toppingSVG(note, x, y, scale = 1) {
  const shapes = {
    1: '<path d="M-8 0Q-3-12 9-7Q10 5-1 9Q-9 9-8 0Z" fill="#a9691f"/><path d="M-5 5L6-5" stroke="#f8ecd3" stroke-width="2"/>',
    2: '<circle r="8" fill="#a8321c"/><circle cx="-2" cy="-3" r="1.4" fill="#f8ecd3"/><circle cx="3" cy="2" r="1.5" fill="#f8ecd3"/>',
    4: '<path d="M-9 3Q-6-10 8-9Q12 3-2 8Z" fill="#1f6a3d"/><path d="M-7 5L6-6" stroke="#f8ecd3" stroke-width="1.3"/>',
    8: '<circle r="8" fill="#624578"/><circle r="3.5" fill="#cfc0ec"/>'
  };
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${scale})">${shapes[note.den] || shapes[8]}</g>`;
}

export function boardSVG(options = {}) {
  const meter = options.meter || options.m || null;
  const g = options.groups || options.g || (meter ? defaultGroups(meter) : null);
  const len = options.len !== undefined ? options.len : meter ? capacity(meter) : options.slot ? dur(options.slot) : null;
  const fill = options.fill || [];
  const v = {
    ...options, turn: options.turn || TURN, m: meter, g, len, fill,
    B: options.boundaries || options.B || (meter && g ? bounds(meter, g) : null),
    hub: options.hub || (meter ? { m: meter } : options.slot ? { note: options.slot } : { text: options.question === false ? '' : '?' }),
    marks: options.help !== false && options.marks !== false,
    tap: options.interactive !== false && options.tap !== false && !options.preview,
    cursor: options.interactive !== false && options.cursor !== false && !options.preview,
    note: escape(options.previewLabel || options.note || ''), uid: `pizza${++serial}-`,
    handId: options.handId || 'hand'
  };
  const label = options.label || (meter ? `${meterKo(meter)} 피자판, 조각 ${fill.length}개` : '피자 조립판');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="pizza-board" viewBox="0 0 340 340" role="${v.tap ? 'group' : 'img'}" aria-label="${escape(label)}" style="color:var(--ink)">${boardContent(v)}</svg>`;
}

export function rhythmSVG(options = {}) {
  const meter = options.meter || options.m || null;
  const g = options.groups || options.g || (meter ? defaultGroups(meter) : null);
  const len = options.len || (meter ? capacity(meter) : total(options.fill || []));
  const B = options.boundaries || options.B || (meter && g ? bounds(meter, g) : [F(0), len]);
  const W = options.width || options.W || (options.plain ? 150 : 296);
  const H = options.height || options.H || (options.plain ? 34 : 68);
  const fill = options.fill || [];
  const o = { ...options, W, H, len, m: meter, g, B, fill, turn: options.plain ? len : options.turn || TURN, ...(options.plain ? { pad: 8, y: 27 } : {}) };
  return `<svg xmlns="http://www.w3.org/2000/svg" class="rhythm-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(options.plain ? '악보 쪽지: ' : '리듬 줄: ')}${escape(fill.map(noteKo).join(', '))}" style="font-size:12px;fill:var(--ink)">${stripSvg(o)}</svg>`;
}

export function traySVG(note, turn = TURN) {
  const a = num(angle(dur(note), turn));
  const cx = 20, cy = a >= 300 ? 20 : a > 180 ? 22 : 29;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" aria-hidden="true"><path d="${wedge(-a / 2, a / 2, 17, cx, cy)}" style="fill:${tint(note)};stroke:var(--ink-2)" stroke-width="1.2" stroke-linejoin="round"/>${toppingSVG(note, cx, cy - 10, .38)}</svg>`;
}

export function doughSVG(count, turn = TURN) {
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" style="fill:var(--wood);stroke:var(--wood-edge)" stroke-width="1.5"/><path d="${wedge(0,num(angle(F(count,8),turn)),14,20,20)}" style="fill:var(--dough);stroke:var(--dough-edge)" stroke-width="1.2"/></svg>`;
}

export function timerSVG(mood = 'neutral') {
  const mouth = mood === 'happy' ? 'M43 62Q54 73 65 62' : mood === 'curious' ? 'M48 66Q54 60 60 65' : 'M47 65Q54 68 61 65';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="timer-art" viewBox="0 0 110 112" role="img" aria-label="박을 세는 화덕 타이머, 똑딱"><path d="M39 10H71V20H39Z" fill="#a8321c"/><path d="M43 7H67V13H43Z" fill="#f2b19b"/><path d="M29 91L23 104M79 91L86 104" stroke="#8a6128" stroke-width="8" stroke-linecap="round"/><circle cx="55" cy="56" r="41" fill="#a8321c"/><circle cx="55" cy="56" r="34" fill="#fffaf0" stroke="#8a6128" stroke-width="2"/><path d="M55 28V33M27 56H32M78 56H83" stroke="#8a6128" stroke-width="2.5"/><path d="M55 56V37M55 56L69 48" stroke="#a8321c" stroke-width="3" stroke-linecap="round"/><circle cx="55" cy="56" r="4" fill="#a8321c"/><circle cx="42" cy="54" r="2.7" fill="#1c2622"/><circle cx="68" cy="54" r="2.7" fill="#1c2622"/><path d="${mouth}" fill="none" stroke="#1c2622" stroke-width="2.7" stroke-linecap="round"/>${mood === 'counting' ? '<path d="M12 30L5 24M96 30L104 24" stroke="#a8321c" stroke-width="3" stroke-linecap="round"/>' : ''}</svg>`;
}

export function ovenSceneSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="oven-art" viewBox="0 0 420 230" role="img" aria-label="박자표 피자 화덕 가게"><path d="M20 209V70Q20 28 62 28H358Q400 28 400 70V209Z" fill="#f8ecd3"/><path d="M20 89H400M20 149H400M82 28V89M208 28V89M335 28V89M143 89V149M270 89V149" stroke="#e7cfad" stroke-width="3"/><path d="M110 211V132A100 100 0 0 1 310 132V211Z" fill="#a9691f"/><path d="M126 211V137A84 84 0 0 1 294 137V211Z" fill="#49352c"/><path d="M144 206Q135 173 155 155Q151 182 172 169Q163 194 180 206M256 206Q246 184 269 160Q264 184 281 190Q283 199 277 206" fill="#f2b19b"/><path d="M151 206Q148 189 161 182Q158 200 171 206M263 206Q258 193 273 184Q266 200 277 206" fill="#ffd35c"/><ellipse cx="211" cy="198" rx="55" ry="13" fill="#d6ab72"/><ellipse cx="211" cy="195" rx="48" ry="10" fill="#f2cf7a" stroke="#a9691f" stroke-width="3"/><ellipse cx="195" cy="193" rx="6" ry="2.6" fill="#a8321c"/><ellipse cx="228" cy="194" rx="6" ry="2.6" fill="#a8321c"/><path d="M208 191Q212 184 218 190Q217 197 208 191Z" fill="#1f6a3d"/><path d="M12 212H408" stroke="#8a6128" stroke-width="9" stroke-linecap="round"/><path d="M42 220H378" stroke="#cdb27a" stroke-width="12" stroke-linecap="round"/></svg>`;
}

export function iconSVG(name, size = 20) {
  const shapes = {
    sound: '<path d="M4 9H8L13 5V19L8 15H4Z"/><path d="M16 8Q21 12 16 16M19 5Q27 12 19 19"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M9 3L8 6L5 7L3 6L1 10L4 12L3 15L2 17L6 20L8 18L11 19L12 22L16 21V18L19 16L22 16L23 12L20 10L19 7L20 5L16 2L14 4L11 4Z"/>',
    back: '<path d="M14 5L7 12L14 19M7 12H22"/>',
    replay: '<path d="M4 10A8 8 0 1 1 6 18M4 4V10H10"/>',
    slow: '<circle cx="12" cy="13" r="8"/><path d="M12 9V13L15 16M9 2H15M12 2V5"/>',
    book: '<path d="M3 4H10Q12 4 12 7Q12 4 14 4H21V20H14Q12 20 12 22Q12 20 10 20H3ZM12 7V20"/>',
    close: '<path d="M5 5L19 19M19 5L5 19"/>'
  };
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.settings}</svg>`;
}

export function stampSVG(day = 0) {
  return `<svg viewBox="0 0 96 96" class="stamp-art" role="img" aria-label="${day}단 영업일 도장"><circle cx="48" cy="48" r="42" fill="none" stroke="#1f6a3d" stroke-width="3" stroke-dasharray="3 2"/><circle cx="48" cy="48" r="35" fill="none" stroke="#1f6a3d" stroke-width="1.5"/><path d="M27 48L42 63L68 32" fill="none" stroke="#1f6a3d" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><text x="48" y="82" text-anchor="middle" font-size="12" fill="#1f6a3d">${day}단 영업 완료</text></svg>`;
}

export { glyph, wedge };
