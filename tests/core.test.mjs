import test from 'node:test';
import assert from 'node:assert/strict';
import { questions, characters, factorNames } from '../story.mjs';
import { summarize, loadSave, buildPrompt } from '../game-core.mjs';
test('twelve scenes, five renamed characters, seven transparent game indicators', () => {
  assert.equal(questions.length,12); assert.equal(characters.length,5); assert.equal(Object.keys(factorNames).length,7);
  assert.equal(new Set(characters.map(c=>c.name)).size,5);
  assert.doesNotMatch(JSON.stringify(questions),/おじいちゃん|ミニマックス|Linux|せらむ/);
  questions.forEach(q => { assert.equal(q.answers.length,4); assert.equal(new Set(q.answers.map(a=>a[0])).size,4); });
});
test('changing a previous answer recomputes scores without duplicate additions', () => {
  const answers = Array(12).fill('A'); answers[0]='B';
  const a=summarize(answers,questions,factorNames);
  const b=summarize(['B',...Array(11).fill('A')],questions,factorNames);
  assert.deepEqual(a,b);
  Object.values(a.percentages).forEach(v => assert.ok(v>=0 && v<=100));
});
test('malformed or out-of-range saves are rejected', () => {
  for(const raw of ['{','null',JSON.stringify({version:2,index:55,answers:['A']}),JSON.stringify({version:2,index:0,answers:['Z']})]) {
    assert.equal(loadSave(raw,questions).index,0); assert.equal(loadSave(raw,questions).answers.length,0);
  }
});
test('completed save restores and reasons are bounded', () => {
  const saved=loadSave(JSON.stringify({version:2,index:11,answers:Array(12).fill('B'),reasons:['x'.repeat(500)],completed:true,report:'手紙'}),questions);
  assert.equal(saved.completed,true); assert.equal(saved.report,'手紙'); assert.equal(saved.reasons[0].length,240);
});
test('LFM receives actual selected answers and reasons, not numeric score claims', () => {
  const p=buildPrompt({answers:['A','C'],reasons:['怖くても、戻る権利を残したい']},questions);
  assert.ok(p[1].content.includes('怖くても、戻る権利を残したい'));
  assert.ok(p[1].content.includes(questions[1].answers[2][1]));
  assert.ok(p[0].content.includes('医療・臨床診断ではない'));
  assert.equal(p.length,2);
});
