import test from 'node:test';
import assert from 'node:assert/strict';
import { questions, characters } from '../story.mjs';
import { enQuestions, enCharacters, commentSpeaker } from '../i18n.mjs';
import { buildCommentPrompt, buildPrompt, loadSave } from '../game-core.mjs';

test('every question has English text with the same answer keys and scores', () => {
  assert.equal(enQuestions.length, questions.length);
  enQuestions.forEach((q, i) => {
    assert.ok(q.title && q.sub && q.kicker && q.note);
    assert.notEqual(q.title, questions[i].title);
    assert.deepEqual(q.answers.map(a => [a[0], a[2]]), questions[i].answers.map(a => [a[0], a[2]]));
  });
  assert.equal(enCharacters.length, characters.length);
});

test('comment prompt covers the first and final scenes through Towa', () => {
  for (const index of [0, 17]) {
    const npc = commentSpeaker(index, characters);
    assert.equal(npc.idx, 0);
    const prompt = buildCommentPrompt({ npc, sceneName:questions[index].name, answer:questions[index].answers[0][1] });
    assert.match(prompt[0].content, /トワ/);
    assert.match(prompt[1].content, /回答/);
  }
});

test('English comment prompt uses English character voice and choice', () => {
  const prompt = buildCommentPrompt({ npc:enCharacters[3], sceneName:enQuestions[9].name,
    answer:enQuestions[9].answers[1][1], lang:'en' });
  assert.match(prompt[0].content, /Bit/);
  assert.match(prompt[1].content, /Choice:/);
  assert.match(prompt[1].content, /Forgive/);
});

test('English letter prompt uses translated choices and English headings', () => {
  const prompt = buildPrompt({ answers:['A'], reasons:['I wanted to hear it firsthand.'] }, enQuestions, 'en');
  assert.match(prompt[1].content, /What You Protected/);
  assert.match(prompt[1].content, /Ask them directly/);
  assert.match(prompt[1].content, /Reason: I wanted/);
});

test('generated comments survive save validation', () => {
  const saved = loadSave(JSON.stringify({ version:2, index:0, answers:['A'], reasons:[''],
    comments:['問いかけ'], completed:false, report:'' }), questions);
  assert.equal(saved.comments[0], '問いかけ');
});
