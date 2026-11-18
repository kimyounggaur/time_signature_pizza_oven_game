import test from 'node:test';
import assert from 'node:assert/strict';
import {rulebookHTML} from '../src/rulebook.js';

test('rulebook diagrams and table of contents are locally available and navigable',()=>{
  const html=rulebookHTML();
  const sections=[...html.matchAll(/<section class="rb-section" id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(sections.length,12);
  for(const [,target] of html.matchAll(/data-rule-jump="([^"]+)"/g))assert.ok(sections.includes(target),target);
  assert.ok((html.match(/<figure /g)||[]).length>=18);
  assert.equal((html.match(/<figure /g)||[]).length,(html.match(/<figcaption>/g)||[]).length);
  assert.doesNotMatch(html,/<(?:img|script|iframe|link)\b[^>]*(?:https?:)?\/\//i);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,'SVG IDs must remain unique');
});

test('rulebook explains the distinction between equal length and different grouping',()=>{
  const html=rulebookHTML();
  assert.match(html,/3\/4와 6\/8은 둘 다 6칸/);
  assert.match(html,/3\/4 · 2\+2\+2 · 큰 박 셋/);
  assert.match(html,/6\/8 · 3\+3 · 큰 박 둘/);
  assert.match(html,/엇박 선반/);
  assert.match(html,/빈 자리는 아직 채우지 않은 곳이며 쉼표가 아니에요/);
});
