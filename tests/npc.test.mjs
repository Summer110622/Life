import test from 'node:test';
import assert from 'node:assert/strict';
import { characters } from '../story.mjs';
import { buildNpcPrompt } from '../game-core.mjs';
import { npcCharOf, sceneOf } from '../walk.mjs';

test('npc cast has personas and fallback lines for talkable scenes', () => {
  for (let s = 0; s < 6; s++) {
    const ci = npcCharOf(s);
    if (ci < 0) continue;
    const c = characters[ci];
    assert.ok(c.persona && c.persona.length > 5, `persona for scene ${s}`);
    assert.ok(Array.isArray(c.lines) && c.lines.length >= 2, `lines for scene ${s}`);
    c.lines.forEach(l => assert.ok(l.length <= 120, 'fallback line is short'));
  }
  // scenes 1..4 map onto characters 1..4, scenes 0/5 have no npc
  assert.equal(npcCharOf(0), -1);
  assert.equal(npcCharOf(5), -1);
  assert.equal(sceneOf(3), 1);
});

test('npc prompt carries context, player words, and safety rules', () => {
  const npc = characters[1];
  const p = buildNpcPrompt({
    npc, sceneName: '市場跡 / THE MARKET', answered: 3, total: 18,
    transcript: '1. 町に入る前…\n選択：出口の場所',
    history: [{ who: 'you', text: 'こんにちは' }],
    playerText: 'この町はどうなったの？',
  });
  assert.equal(p.length, 2);
  assert.ok(p[0].content.includes('ナギ'));
  assert.ok(p[0].content.includes(npc.persona));
  assert.ok(p[0].content.includes('断定'));
  assert.ok(p[1].content.includes('市場跡'));
  assert.ok(p[1].content.includes('3/18'));
  assert.ok(p[1].content.includes('この町はどうなったの？'));
  assert.ok(p[1].content.includes('こんにちは'));
});

test('npc prompt works for silent nudge without player text', () => {
  const p = buildNpcPrompt({
    npc: characters[4], sceneName: '工場跡', answered: 0, total: 18,
    transcript: '', history: [], playerText: null,
  });
  assert.ok(p[1].content.includes('最初の一声'));
  assert.ok(p[1].content.includes('まだ記録なし'));
});

test('npc prompt comments on an answer when answer is given', () => {
  const p = buildNpcPrompt({
    npc: characters[3], sceneName: '廃駅', answered: 7, total: 18,
    transcript: '', history: [], playerText: null,
    answer: '選択：本人に直接会って、聞く。（理由：逃げたくない）',
  });
  assert.ok(p[1].content.includes('本人に直接会って'));
  assert.ok(p[1].content.includes('1〜2文'));
});

test('every character has short ack lines for answer comments', () => {
  characters.forEach(c => {
    assert.ok(Array.isArray(c.ack) && c.ack.length >= 2, `ack for ${c.name}`);
    c.ack.forEach(l => assert.ok(l.length <= 60, 'ack line is short'));
  });
});
