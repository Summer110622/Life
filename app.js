import { questions as jaQuestions, characters as jaCharacters, factorNames as jaFactorNames, archetypes as jaArchetypes, sceneEpigraphs as jaEpigraphs, archePhil as jaArchePhil } from './story.mjs';
import { enQuestions, enCharacters, enFactorNames, enArchetypes, enEpigraphs, enArchePhil, commentSpeaker } from './i18n.mjs';
import { summarize, makeTranscript, buildPrompt, buildNpcPrompt, buildCommentPrompt, loadSave } from './game-core.mjs';
import { createWalk, sceneOf, slotOf, npcCharOf } from './walk.mjs';

const $ = s => document.querySelector(s);
const lang = localStorageSafeGet('ember-lang') === 'en' ? 'en' : 'ja';
const english = lang === 'en';
const m = (ja, en) => english ? en : ja;
const questions = english ? enQuestions : jaQuestions;
const characters = english ? enCharacters : jaCharacters;
const factorNames = english ? enFactorNames : jaFactorNames;
const archetypes = english ? enArchetypes : jaArchetypes;
const sceneEpigraphs = english ? enEpigraphs : jaEpigraphs;
const archePhil = english ? enArchePhil : jaArchePhil;
const SAVE_KEY = 'ember-life-v2';
let state = loadSave(localStorageSafeGet(SAVE_KEY), questions);
let screen = 'intro', busy = false, frameTimer = null, transitionTimer = null, frame = 0;
let worker = null, modelState = 'idle', modelTimer = null, generating = false, requestId = 0;
let lastModelError = '', loadStart = 0, cpuMode = false;
function setModelState(s) {
  modelState = s;
  document.body.dataset.lfm = s;
}
let report = '', hasSavedReport = false;
let walk = null, dialogueOpen = false, walkScene = -1;
// ---- NPC会話AI ----
let npcOpen = false, chatBusy = false, chatReqId = 0, chatTimer = null, chatDraft = '';
let npcLog = [], npcVisits = {}, lastHud = null;
// 回答へのAIコメント（NPCが問い→回答→寸評の進行フロー用）
let commentMode = false, commentGenerating = false, activeCommentIndex = -1, commentCallback = null, commentTimer = null, ackVisits = {};
// LFM準備中の回答は保留し、READYになり次第その場で寸評を届ける
let pendingComments = [], ambientMode = false, ambientTimer = null, ambientName = '';
let typeTimer = null;
function stopType() { clearTimeout(typeTimer); typeTimer = null; }
function typewrite(el, text) {
  stopType();
  el.classList.remove('typing');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }
  el.textContent = '';
  el.classList.add('typing');
  let i = 0;
  const step = () => {
    i += 2;
    el.textContent = text.slice(0, i);
    if (i < text.length) typeTimer = setTimeout(step, 28);
    else { typeTimer = null; el.classList.remove('typing'); }
  };
  step();
}
function finishType() {
  if (!typeTimer) return;
  stopType();
  const el = $('#questionTitle');
  el.classList.remove('typing');
  el.textContent = questions[state.index].title;
}
const audio = $('#bgm');
audio.volume = 0.28;

function localStorageSafeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function renderCommentJournal(draftIndex = -1, draft = '') {
  const list = $('#commentJournalList');
  if (!list) return;
  list.replaceChildren();
  const count = state.answers.reduce((n, _, i) => n + (state.comments?.[i] ? 1 : 0), 0);
  $('#commentJournalTitle').textContent = m(`LFMの言葉 ${count}/${state.answers.length}`, `LFM reflections ${count}/${state.answers.length}`);
  state.answers.forEach((_, i) => {
    const li = document.createElement('li');
    const title = document.createElement('b'); title.textContent = `${i + 1}. ${questions[i].kicker}`;
    const body = document.createElement('span');
    body.textContent = state.comments?.[i] || (i === draftIndex && draft ? draft + ' ▌' : m('生成待ち', 'Waiting for LFM'));
    li.append(title, body); list.append(li);
  });
}
function applyLanguage() {
  document.documentElement.lang = lang;
  ['langBtn', 'titleLangBtn', 'gameLangBtn'].forEach(id => { $('#' + id).textContent = english ? '日本語' : 'EN'; });
  const switchLanguage = () => {
    try {
      localStorage.setItem('ember-lang', english ? 'ja' : 'en');
      const saved = JSON.parse(localStorageSafeGet(SAVE_KEY) || 'null');
      if (saved) { saved.report = ''; saved.comments = []; localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); }
    } catch {}
    location.reload();
  };
  ['langBtn', 'titleLangBtn', 'gameLangBtn'].forEach(id => { $('#' + id).onclick = switchLanguage; });
  if (!english) return;
  document.title = 'EMBER / A Journey of Choices';
  $('#introTitle').innerHTML = 'The roads you did not take<br><em>still shape you.</em>';
  const copy = [
    ['.brand small', 'A JOURNEY OF CHOICES'],
    ['#introScreen .lede', 'Walk through a town at dusk with Towa, a robot who has lost its memory. Eighteen choices make a path only you can walk. At the end, LFM writes a letter grounded in the choices you made.'],
    ['#startAiBtn', 'Begin the journey →'], ['#resumeBtn', 'Continue'],
    ['#introScreen .hero-meta span:last-child', 'ABOUT 10–20 MIN'],
    ['#introScreen .hero-caption b', 'Towa — the walker without memories'],
    ['#cpuBtn', 'Use CPU (slow)'], ['#cancelModelBtn', 'Stop AI'], ['#modelRetry', 'Retry LFM'], ['#gameRetryBtn', 'Retry LFM'], ['#startForceBtn', 'Continue without AI'],
    ['#fsBtn', '⛶ Full screen'], ['#npcBtn', 'Talk T'], ['#npcClose', 'Leave ✕'], ['#npcSend', 'Send'], ['#npcNudge', 'One more thought'], ['#npcLoad', 'Load LFM'], ['#talkBtn', 'Talk E'],
    ['.reason-label', 'Before choosing, leave a reason (optional, 240 characters)'], ['#backBtn', '← Back'],
    ['#restartBtn', 'Return to the beginning ↻'], ['#letterTitle', 'A letter from Towa to you.'], ['#generateBtn', 'Read more deeply with LFM →'],
    ['.ai-letter > .hint:last-child', 'The first use downloads the model. This is a reflection, not a personality measurement.'],
    ['.factor-card .card-head span', 'Patterns in your choices'], ['.factor-card > .hint:last-child', 'These are game indicators, not LFM inferences or psychological test scores.'],
    ['.memo-card .card-head span:first-child', 'A NOTE RECOVERED'], ['.memo-sign', '— EMBER / space between steps'],
    ['.journey-log summary', 'Look back at your choices'], ['#exportBtn', 'Save your journey'], ['#eraseBtn', 'Delete answers on this device'],
    ['.footer span:last-child', 'Answers are stored only on this device'],
  ];
  copy.forEach(([selector, value]) => { const el = $(selector); if (el) el.textContent = value; });
  const hints = document.querySelectorAll('#introScreen .hint');
  if (hints[0]) hints[0].textContent = 'The journey begins at once. LFM loads in the background and will respond when ready. The first download may take several minutes. Generation stays on your device; your answers are not sent away. Music starts with the journey and can be turned off.';
  if (hints[1]) hints[1].textContent = 'A work for reflection and play, not a medical or psychological diagnosis.';
  $('#npcInput').placeholder = 'Say something to this character…';
  $('#reason').placeholder = 'The same choice can have a different reason.';
  $('#saveMessage').textContent = 'Saved on this device / keys 1–4 also choose';
  $('#walkCanvas').setAttribute('aria-label', 'Walkable map. Move with WASD or arrow keys; talk with E.');
  $('#titleSoundBtn').setAttribute('aria-label', 'Toggle music');
  $('#gameSoundBtn').setAttribute('aria-label', 'Toggle music');
}
applyLanguage();
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); $('#saveMessage').textContent = english ? 'Saved on this device' : 'この端末に自動保存'; }
  catch { $('#saveMessage').textContent = english ? 'Could not save; you can keep playing in this tab.' : '保存できません。このタブで続行できます'; }
  renderCommentJournal();
}
function show(name) {
  screen = name;
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === name + 'Screen'));
  document.body.classList.toggle('playing', name === 'play');
  document.body.classList.toggle('title', name === 'intro');
  window.scrollTo({ top:0, behavior:'instant' });
}
function setStatus(text) {
  $('#lfmStatus').textContent = text; $('#modelMessage').textContent = text;
  const ws = $('#walkStatus'); if (ws) ws.textContent = text;
}
function stopAnimation() { clearTimeout(frameTimer); frameTimer = null; }
// ---- 歩行モード ----
function ensureWalk() {
  if (walk || !$('#walkCanvas')) return;
  walk = createWalk($('#walkCanvas'), {
    lang,
    onInteract: qi => { if (qi === state.index && !dialogueOpen && !npcOpen && !commentMode && screen === 'play') openDialogue(); },
    onTalkNpc: () => { if (screen === 'play' && !dialogueOpen && !npcOpen && !commentMode && lastHud && lastHud.near) openNpcCard(); },
    onHud: h => { lastHud = h; updateNpcHud(); },
  });
  document.querySelectorAll('.dpad button[data-dir]').forEach(btn => {
    const dir = btn.dataset.dir;
    const on = e => { e.preventDefault(); walk.setInput(dir, true); };
    const off = e => { e.preventDefault(); walk.setInput(dir, false); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  });
  const talk = $('#talkBtn');
  if (talk) talk.onclick = () => walk.tryInteract();
}
function syncWalk() {
  if (!walk || screen !== 'play' || state.completed) return;
  const s = sceneOf(state.index);
  const done = [0, 1, 2].filter(slot => state.answers[s * 3 + slot] !== undefined && (s * 3 + slot) < questions.length);
  const slot = state.answers[state.index] === undefined ? slotOf(state.index) : -1;
  const q = questions[state.index];
  if (q) {
    $('#sceneNo').textContent = q.scene;
    $('#sceneName').textContent = q.name;
    const ci = npcCharOf(s), person = characters[ci < 0 ? 0 : ci];
    $('#speaker').textContent = person.name + ' / ' + person.role;
  }
  walk.goScene(s, slot, done);
  if (walkScene !== s) showSceneCard(s);
  walkScene = s;
}
let sceneCardTimer = null;
function showSceneCard(s) {
  const card = $('#sceneCard');
  if (!card) return;
  const q = questions[s * 3];
  if (!q) return;
  $('#sceneCardNo').textContent = q.scene;
  $('#sceneCardName').textContent = q.name;
  $('#sceneCardLine').textContent = sceneEpigraphs[s] || '';
  card.hidden = false;
  requestAnimationFrame(() => card.classList.add('show'));
  clearTimeout(sceneCardTimer);
  sceneCardTimer = setTimeout(() => {
    card.classList.remove('show');
    setTimeout(() => { card.hidden = true; }, 550);
  }, 2400);
}
function openDialogue() {
  dialogueOpen = true;
  renderQuestion();
  const pane = $('#questionPane');
  if (pane) { pane.hidden = false; pane.classList.add('dialogue-open'); }
  if (walk) walk.setPaused(true);
}
function closeDialogue() {
  dialogueOpen = false;
  const pane = $('#questionPane');
  if (pane) { pane.hidden = true; pane.classList.remove('dialogue-open'); }
  if (walk) { walk.setPaused(false); syncWalk(); }
}
// ---- NPC会話AI（ゲーム内ダイアログ＋LFM随時生成） ----
function curNpc() {
  const ci = npcCharOf(sceneOf(state.index));
  return ci < 0 ? null : { idx: ci, ...characters[ci] };
}
function setNpcStatus(t) { const el = $('#npcModel'); if (el) el.textContent = t; }
function updateNpcModel() {
  const load = $('#npcLoad'), send = $('#npcSend'), nudge = $('#npcNudge');
  if (modelState === 'ready') {
    if (load) load.hidden = true;
    setNpcStatus(chatBusy ? m('LFM生成中…', 'LFM is writing…') : generating ? m('手紙を生成中…', 'Writing the letter…') : m('LFM READY・随時生成', 'LFM READY · live responses'));
  } else {
    if (load) { load.hidden = modelState === 'loading'; load.textContent = modelState === 'loading' ? m('LFM読込中…', 'Loading LFM…') : m('LFMを読み込む', 'Load LFM'); }
    if (modelState !== 'loading') setNpcStatus(m('LFM未読込・定型文で応答', 'LFM unavailable · story dialogue only'));
  }
  const lock = chatBusy || generating;
  if (send) send.disabled = lock;
  if (nudge) nudge.disabled = lock;
}
function renderNpc() {
  const log = $('#npcLog');
  if (log) {
    log.replaceChildren();
    npcLog.slice(-20).forEach(m => {
      const div = document.createElement('div');
      div.className = 'npc-line ' + (m.who === 'you' ? 'you' : 'npc');
      div.textContent = (m.who === 'you' ? characters[0].name + ': ' : '') + m.text;
      log.append(div);
    });
    if (chatBusy && chatDraft) {
      const div = document.createElement('div');
      div.className = 'npc-line npc streaming';
      div.textContent = chatDraft;
      log.append(div);
    }
    log.scrollTop = log.scrollHeight;
  }
  const bt = $('#balloonText');
  if (bt && npcLog.length) bt.textContent = npcLog[npcLog.length - 1].text.slice(0, 90);
}
function npcSayFallback() {
  const c = curNpc();
  if (!c) return;
  const n = npcVisits[c.idx] || 0;
  npcVisits[c.idx] = n + 1;
  const lines = c.lines && c.lines.length ? c.lines : ['……。'];
  npcLog.push({ who: 'npc', text: lines[n % lines.length] });
}
function setBalloon(name, text) {
  $('#balloonName').textContent = name;
  $('#balloonText').textContent = text;
  const balloon = $('#speechBalloon');
  balloon.hidden = false;
  if (!lastHud || !lastHud.has) {
    // NPCのいない場面（トワの問い）は画面中央上部に固定
    const canvas = $('#walkCanvas');
    const wrap = canvas.parentElement.getBoundingClientRect(), r = canvas.getBoundingClientRect();
    balloon.style.left = ((r.left - wrap.left) + r.width / 2) + 'px';
    balloon.style.top = ((r.top - wrap.top) + 70) + 'px';
  } else updateNpcHud();
}
function updateNpcHud() {
  const balloon = $('#speechBalloon'), btn = $('#npcBtn');
  if (!balloon || !btn) return;
  if (pendingComments.length) deliverAmbient(); // READY後の届け損ねを歩行中に再試行
  if (!lastHud || !lastHud.has || screen !== 'play' || state.completed) {
    if (!npcOpen && !commentMode && !ambientMode) balloon.hidden = true;
    btn.hidden = true;
    return;
  }
  const canvas = $('#walkCanvas');
  const r = canvas.getBoundingClientRect(), wrap = canvas.parentElement.getBoundingClientRect();
  const x = (r.left - wrap.left) + lastHud.fx * r.width;
  const y = (r.top - wrap.top) + lastHud.fy * r.height;
  const edge = Math.min(210, wrap.width * 0.42);
  balloon.style.left = Math.max(edge, Math.min(wrap.width - edge, x)) + 'px';
  balloon.style.top = Math.max(48, y) + 'px';
  if (commentMode || ambientMode) { balloon.hidden = false; btn.hidden = true; return; }
  if (npcOpen) { balloon.hidden = false; return; }
  btn.hidden = !lastHud.near || dialogueOpen;
  if (lastHud.near && !dialogueOpen) {
    const c = curNpc();
    const q = questions[state.index];
    balloon.hidden = false;
    $('#balloonName').textContent = c ? c.name : characters[0].name;
    $('#balloonText').textContent = state.answers[state.index] === undefined && q ? m('「' + q.kicker + '」の話 ［T/E］', 'Talk about ' + q.kicker + ' [T/E]') : m('［T］話しかける', '[T] Talk');
  } else balloon.hidden = true;
}
function openNpcCard() {
  if (npcOpen || dialogueOpen || screen !== 'play') return;
  const c = curNpc();
  if (!c) return;
  npcOpen = true; npcLog = []; chatDraft = '';
  if (walk) walk.setPaused(true);
  const card = $('#npcCard');
  if (card) card.hidden = false;
  $('#npcName').textContent = c.name + ' / ' + c.role;
  $('#balloonName').textContent = c.name;
  $('#npcInput').value = '';
  npcSayFallback();
  renderNpc(); updateNpcModel();
  $('#speechBalloon').hidden = false;
  updateNpcHud();
  if (modelState === 'ready' && !generating && !chatBusy) npcGenerate(null);
}
function closeNpc() {
  if (!npcOpen) return;
  npcOpen = false; chatDraft = '';
  const card = $('#npcCard');
  if (card) card.hidden = true;
  $('#speechBalloon').hidden = true;
  const btn = $('#npcBtn');
  if (btn) btn.hidden = true;
  if (walk && !dialogueOpen && screen === 'play') walk.setPaused(false);
}
function npcGenerate(playerText) {
  if (modelState !== 'ready' || generating || chatBusy || !worker) return false;
  const c = curNpc();
  if (!c) return false;
  chatBusy = true; chatReqId = ++requestId; chatDraft = '';
  activeCommentIndex = -1;
  renderNpc(); updateNpcModel();
  clearTimeout(chatTimer);
  chatTimer = setTimeout(() => {
    if (!chatBusy) return;
    chatBusy = false; requestId++;
    setNpcStatus(m('生成が時間切れになりました。定型文で続けます。', 'Generation timed out. The story continues.'));
    renderNpc(); updateNpcModel();
  }, 120000);
  worker.postMessage({ type: 'generate', id: chatReqId, max_new_tokens: 128, messages: buildNpcPrompt({
    npc: c, sceneName: questions[state.index].name,
    answered: state.answers.length, total: questions.length,
    transcript: makeTranscript(state, questions, lang), lang,
    history: npcLog.slice(-6), playerText,
  }) });
  return true;
}
// ---- 回答へのAIコメント：NPCが問い→回答→寸評して次へ ----
// paneを閉じた状態で吹き出しに寸評を流し、終わったらdone()で進行する。
function pickAck(c) {
  const ack = (c && c.ack && c.ack.length ? c.ack : ['……わかった。']);
  const n = ackVisits[c ? c.idx : -1] || 0;
  ackVisits[c ? c.idx : -1] = n + 1;
  return ack[n % ack.length];
}
function finishComment() {
  if (!commentMode) return;
  const stillGenerating = commentGenerating && chatBusy;
  commentMode = false;
  commentGenerating = false;
  if (stillGenerating) {
    ambientMode = true;
    ambientName = commentSpeaker(activeCommentIndex, characters).name;
    clearTimeout(ambientTimer);
    ambientTimer = setTimeout(() => {
      ambientMode = false; chatBusy = false; requestId++;
      $('#speechBalloon').hidden = true;
      deliverAmbient();
    }, 300000);
  }
  clearTimeout(commentTimer); clearTimeout(chatTimer);
  const done = commentCallback;
  commentCallback = null;
  if (!stillGenerating) $('#speechBalloon').hidden = true;
  if (done) done();
  if (stillGenerating) updateNpcHud();
  if (!stillGenerating) deliverAmbient();
}
function abortComment() {
  commentCallback = null; commentMode = false; commentGenerating = false; chatBusy = false;
  clearTimeout(commentTimer); clearTimeout(chatTimer);
  const b = $('#speechBalloon'); if (b) b.hidden = true;
}
function clearAmbient() {
  pendingComments = []; ambientMode = false; ambientName = '';
  clearTimeout(ambientTimer);
}
function queueMissingComments() {
  if (state.completed) return;
  state.answers.forEach((key, index) => {
    if (state.comments?.[index] || pendingComments.some(p => p.index === index)) return;
    const c = commentSpeaker(index, characters);
    const answer = questions[index].answers.find(a => a[0] === key)?.[1];
    if (!answer) return;
    const reason = state.reasons[index];
    const say = m('選択：', 'Choice: ') + answer + (reason ? m('（理由：', ' (Reason: ') + reason + m('）', ')') : '');
    pendingComments.push({ index, npcIdx:c.idx, name:c.name, sceneName:questions[index].name, say });
  });
}
// 保留していた回答への寸評を、その場で届ける（進行は止めない）
function deliverAmbient() {
  const p = pendingComments[0];
  if (!p || screen !== 'play' || dialogueOpen || npcOpen || commentMode || ambientMode) return;
  if (modelState !== 'ready' || generating || chatBusy || !worker) return;
  pendingComments.shift();
  ambientMode = true; ambientName = p.name;
  chatBusy = true; chatReqId = ++requestId; chatDraft = '';
  activeCommentIndex = p.index;
  setBalloon(p.name, '…');
  updateNpcModel();
  clearTimeout(ambientTimer);
  ambientTimer = setTimeout(() => {
    ambientMode = false; chatBusy = false; requestId++;
    $('#speechBalloon').hidden = true;
    updateNpcModel();
  }, 300000);
  worker.postMessage({ type: 'generate', id: chatReqId, max_new_tokens: 48, messages: buildCommentPrompt({
    npc: characters[p.npcIdx], sceneName: p.sceneName, answer: p.say, lang,
  }) });
}
function showNpcComment(answerLabel, reason, done) {
  const c = commentSpeaker(state.index, characters);
  const who = c ? c.name : characters[0].name;
  const say = m('選択：', 'Choice: ') + answerLabel + (reason ? m('（理由：', ' (Reason: ') + reason + m('）', ')') : '');
  commentMode = true; commentCallback = done;
  commentGenerating = false;
  if (walk) walk.setPaused(true);
  const canAi = c && worker && !generating && !chatBusy;
  if (canAi && modelState === 'ready') {
    commentGenerating = true;
    chatBusy = true; chatReqId = ++requestId; chatDraft = '';
    activeCommentIndex = state.index;
    setBalloon(who, '…');
    clearTimeout(chatTimer); clearTimeout(commentTimer);
    chatTimer = setTimeout(() => {
      if (!commentMode) return;
      setBalloon(who, m('LFMの生成が時間切れになりました。後でコメントを届けます。', 'LFM is taking longer. I will bring the comment when it is ready.'));
      commentTimer = setTimeout(finishComment, 2200);
    }, 15000);
    // Keep the journey moving while each token appears in the balloon and journal.
    if (!state.completed) commentTimer = setTimeout(finishComment, 1200);
    worker.postMessage({ type: 'generate', id: chatReqId, max_new_tokens: 48, messages: buildCommentPrompt({
      npc: c, sceneName: questions[state.index].name, answer: say, lang,
    }) });
  } else if (modelState === 'loading' || (modelState === 'ready' && worker && (generating || chatBusy))) {
    // 準備中の回答は保留：READYになり次第、その場で寸評を届ける
    pendingComments.push({
      index: state.index, npcIdx: c.idx, name: who, sceneName: questions[state.index].name,
      say,
    });
    setBalloon(who, m('LFM準備中…この回答への言葉を後で届けます', 'LFM is loading. I will bring a comment on this choice later.'));
    clearTimeout(commentTimer);
    commentTimer = setTimeout(finishComment, 1200);
  } else {
    // 定型相づちは使わない。LFM不可の理由を示して進む
    if (modelState === 'idle' || modelState === 'loading') loadModel();
    setBalloon(who, m('LFMが使えません（', 'LFM is unavailable (') + (lastModelError || m('WebGPU対応端末でお試しください', 'Try a WebGPU browser or the CPU option')) + m('）。画面上部のCPUボタンで再試行できます', '). Use the CPU button above to try again.'));
    clearTimeout(commentTimer);
    commentTimer = setTimeout(finishComment, 3500);
  }
}
function animate() {
  stopAnimation();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return;
  frame = (frame + 1) % 6;
  const file = 'assets/robot-walk-0' + (frame + 1) + '.png';
  const play = $('#playRobot'), hero = $('#heroRobot');
  if (play) play.style.backgroundImage = 'url("' + file + '")';
  if (hero) hero.style.backgroundImage = 'url("' + file + '")';
  frameTimer = setTimeout(animate, [260,170,230,320,190,240][frame]);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopAnimation(); audio.pause(); syncSound(); }
  else if (screen !== 'result') animate();
});
function syncSound() {
  $('#soundBtn').textContent = audio.paused ? '♪ BGM OFF' : '♫ BGM ON';
  $('#soundBtn').setAttribute('aria-pressed', String(!audio.paused));
  $('#soundBtn').setAttribute('aria-label', audio.paused ? m('BGMを再生', 'Play music') : m('BGMを停止', 'Stop music'));
  const gs = $('#gameSoundBtn');
  if (gs) { gs.textContent = audio.paused ? '♪' : '♫'; gs.setAttribute('aria-pressed', String(!audio.paused)); }
  const ts = $('#titleSoundBtn');
  if (ts) { ts.textContent = audio.paused ? '♪' : '♫'; ts.setAttribute('aria-pressed', String(!audio.paused)); }
}
async function toggleSound() {
  if (!audio.paused) audio.pause();
  else try { await audio.play(); } catch { $('#soundBtn').textContent = m('音声を再生できません', 'Cannot play music'); return; }
  syncSound();
}
// 旅の開始と同時に音楽を流す（クリック操作に紐づくため再生制限に掛からない）
function startBgm() {
  if (!audio.paused) return;
  audio.play().then(() => syncSound()).catch(() => {});
}
$('#soundBtn').onclick = toggleSound;
audio.addEventListener('error', () => { $('#soundBtn').textContent = m('BGM 読込エラー', 'Music failed to load'); });

function disposeWorker() {
  clearTimeout(modelTimer);
  if (worker) { worker.terminate(); worker = null; }
  generating = false;
  $('#cancelModelBtn').hidden = true;
  $('#generateBtn').disabled = false;
  $('#startAiBtn').disabled = false;
  $('#aiOutput').setAttribute('aria-busy', 'false');
}
function modelFailure(message) {
  disposeWorker(); lastModelError = message; setModelState('error');
  setStatus(message);
  $('#aiStatus').textContent = message + m('。旅は続けられます。LFMが必要な場合は読み込み直してください。', '. The journey can continue. Retry LFM when you are ready.');
  $('#generateBtn').textContent = m('LFMを再読み込みして生成', 'Reload LFM and generate');
  $('#startAiBtn').disabled = false;
  $('#startAiBtn').textContent = m('旅をはじめる', 'Begin the journey');
  const retry = $('#modelRetry');
  if (retry) retry.hidden = false;
  $('#gameRetryBtn').hidden = false;
  const force = $('#startForceBtn');
  if (force) force.hidden = false;
  ['cpuBtn', 'gameCpuBtn'].forEach(id => { const cpu = $('#' + id); if (cpu) cpu.hidden = false; });
}
function createModelWorker() {
  if (worker) return;
  worker = new Worker(new URL('./lfm-worker.mjs', import.meta.url), { type:'module' });
  worker.onmessage = ({ data }) => {
    if (data.id != null && chatBusy && data.id === chatReqId) {
      if (data.type === 'token') {
        chatDraft += data.text;
        if ((commentMode || ambientMode) && activeCommentIndex >= 0) {
          if (chatDraft === data.text) $('#commentJournal').open = true;
          renderCommentJournal(activeCommentIndex, chatDraft);
        }
        if (commentMode) setBalloon(commentSpeaker(activeCommentIndex, characters).name, chatDraft.slice(0, 140));
        else if (ambientMode) setBalloon(ambientName || characters[0].name, chatDraft.slice(0, 140));
        else renderNpc();
      }
      else if (data.type === 'complete') {
        clearTimeout(chatTimer); chatBusy = false;
        if ((commentMode || ambientMode) && activeCommentIndex >= 0) {
          state.comments = state.comments || [];
          state.comments[activeCommentIndex] = String(data.text || '').slice(0, 500);
          save();
        }
        if (commentMode) {
          setBalloon(curNpc() ? curNpc().name : characters[0].name, String(data.text || '……').slice(0, 140));
          clearTimeout(commentTimer);
          commentTimer = setTimeout(finishComment, 2400);
          return;
        }
        if (ambientMode) {
          setBalloon(ambientName || characters[0].name, String(data.text || '……').slice(0, 140));
          clearTimeout(ambientTimer);
          ambientTimer = setTimeout(() => { ambientMode = false; $('#speechBalloon').hidden = true; deliverAmbient(); }, 5000);
          updateNpcModel();
          return;
        }
        npcLog.push({ who: 'npc', text: String(data.text || '……').slice(0, 400) });
        setNpcStatus(m('LFM随時生成・仮説としての言葉です', 'LFM response · one possible reading'));
        renderNpc(); updateNpcModel();
      }
      else if (data.type === 'error') {
        clearTimeout(chatTimer); chatBusy = false;
        if (ambientMode) {
          ambientMode = false;
          $('#speechBalloon').hidden = true;
          updateNpcModel();
          deliverAmbient();
          return;
        }
        if (commentMode) {
          const c = curNpc();
          setBalloon(c ? c.name : characters[0].name, m('LFM生成に失敗しました。次の回答で再試行します', 'LFM could not finish this comment. I will try again next time.'));
          clearTimeout(commentTimer);
          commentTimer = setTimeout(finishComment, 2200);
          return;
        }
        setNpcStatus(m('生成できませんでした。定型文で続けます。', 'Generation failed. The story continues.'));
        renderNpc(); updateNpcModel();
      }
      return;
    }
    if (data.id != null && data.id !== requestId) return;
    if (data.type === 'status') setStatus(data.message);
    if (data.type === 'progress') {
      const mb = (data.loaded / 1048576).toFixed(0);
      const pct = data.progress == null ? null : Math.round(data.progress);
      const sec = Math.max(0, Math.floor((Date.now() - loadStart) / 1000));
      const clock = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      setStatus(m('LFM 読込中 · ', 'LFM loading · ') + mb + ' MB' + (pct == null ? '' : ' / ' + pct + '%') + ' · ' + clock);
      $('#aiStatus').textContent = $('#modelMessage').textContent;
      if (modelState === 'loading') $('#startAiBtn').textContent = m('LFM読込中', 'LFM loading') + (pct == null ? '…' : ' ' + pct + '%');
    }
    if (data.type === 'ready') {
      clearTimeout(modelTimer); setModelState('ready');
      ['modelRetry', 'gameRetryBtn', 'startForceBtn', 'cpuBtn', 'gameCpuBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
      setStatus(cpuMode ? m('LFM2-350M · CPU READY（低速）', 'LFM2-350M · CPU READY (slow)') : 'LFM2-350M · WebGPU READY');
      $('#cancelModelBtn').hidden = true;
      $('#startAiBtn').disabled = false;
      $('#startAiBtn').textContent = m('旅をはじめる', 'Begin the journey');
      $('#aiStatus').textContent = m('LFMの準備ができました。回答をもとに手紙を生成できます。', 'LFM is ready to respond to your choices.');
      updateNpcModel();
      if (npcOpen && !chatBusy && !generating) npcGenerate(null);
      deliverAmbient();
      if (screen === 'result') generateReport();
    }
    if (data.type === 'token') {
      report += data.text;
      $('#aiOutput').textContent = report;
    }
    if (data.type === 'complete') {
      clearTimeout(modelTimer); generating = false; hasSavedReport = true;
      report = data.text; $('#aiOutput').textContent = report;
      $('#aiStatus').textContent = m('LFM2-350Mで生成しました。AIの読み取りは仮説です。', 'Generated with LFM2-350M. This is one possible reading.');
      $('#generateBtn').disabled = false; $('#generateBtn').textContent = m('もう一度読み解く', 'Read again');
      $('#cancelModelBtn').hidden = true;
      state.report = report; save();
      $('#aiOutput').setAttribute('aria-busy', 'false');
    }
    if (data.type === 'error') { modelFailure(data.message); updateNpcModel(); }
  };
  worker.onerror = e => { e.preventDefault(); modelFailure(m('LFMの起動に失敗しました。通信・WebGPU対応をご確認ください', 'LFM could not start. Check the connection and WebGPU support.')); };
}
async function loadModel(want = 'webgpu') {
  if (modelState === 'ready') return true;
  if (modelState === 'loading') return false;
  cpuMode = want === 'wasm';
  setModelState('loading');
  ['modelRetry', 'gameRetryBtn', 'startForceBtn', 'cpuBtn', 'gameCpuBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
  $('#startAiBtn').disabled = true; $('#cancelModelBtn').hidden = false;
  setStatus(cpuMode ? m('CPUモードで確認中（低速）', 'Checking CPU mode (slow)') : m('WebGPUを確認しています', 'Checking WebGPU'));
  if (!isSecureContext) {
    modelFailure(m('HTTPSまたはlocalhostの環境でお試しください', 'Open this site over HTTPS or localhost.'));
    return false;
  }
  if (want === 'webgpu' && !navigator.gpu) {
    const extra = await gpuMissingAdvice();
    modelFailure(m('この環境ではWebGPUが利用できません。', 'WebGPU is unavailable here. ') + extra);
    return false;
  }
  try {
    if (want === 'webgpu') {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('GPU adapter unavailable');
    }
    createModelWorker();
    loadStart = Date.now();
    modelTimer = setTimeout(() => modelFailure(m('読み込みが時間上限(30分)に達しました。通信を確認して再試行してください', 'Loading exceeded 30 minutes. Check the connection and retry.')), 1800000);
    worker.postMessage({ type:'load', device: want, lang });
    return true;
  } catch { modelFailure(cpuMode ? m('CPUモードを開始できませんでした', 'CPU mode could not start') : m('GPUを取得できません。対応端末でお試しください', 'No GPU adapter is available. Try CPU mode.')); return false; }
}
$('#cancelModelBtn').onclick = () => {
  requestId++; disposeWorker(); setModelState('idle');
  clearTimeout(chatTimer); chatBusy = false; chatDraft = ''; abortComment(); clearAmbient();
  setStatus(m('LFMを停止しました', 'LFM stopped'));
  $('#startAiBtn').disabled = false;
  $('#startAiBtn').textContent = m('旅をはじめる', 'Begin the journey');
  if (!hasSavedReport) { report = ''; $('#aiOutput').textContent = m('生成は完了していません。', 'Generation did not finish.'); }
  $('#aiStatus').textContent = m('AI処理を停止しました。再読み込みできます。', 'AI stopped. You can load it again.');
  updateNpcModel(); renderNpc();
};
const modelRetryBtn = $('#modelRetry');
if (modelRetryBtn) modelRetryBtn.onclick = () => { loadModel(); };
$('#gameRetryBtn').onclick = () => { void loadModel(); };
const startForceBtn = $('#startForceBtn');
if (startForceBtn) startForceBtn.onclick = () => { startNew(); };
const cpuBtn = $('#cpuBtn');
if (cpuBtn) cpuBtn.onclick = async () => {
  if (screen === 'intro') startNew();
  void loadModel('wasm');
};
$('#gameCpuBtn').onclick = () => cpuBtn?.click();
function startNew() {
  clearTimeout(transitionTimer); busy = false; stopType(); closeNpc(); abortComment();
  state = { version:2, index:0, answers:[], reasons:[], comments:[], completed:false, report:'' };
  report = ''; hasSavedReport = false; save(); show('play');
  if (walk) { walk.destroy(); walk = null; }
  walkScene = -1; dialogueOpen = false;
  startBgm();
  const pane = $('#questionPane');
  if (pane) { pane.hidden = true; pane.classList.remove('dialogue-open'); }
  ensureWalk(); syncWalk(); animate();
}
$('#startAiBtn').onclick = () => {
  startNew();
  if (modelState !== 'ready' && modelState !== 'loading') void loadModel();
};
$('#resumeBtn').hidden = !state.answers.length;
$('#resumeBtn').onclick = () => {
  if (state.completed) { renderResult(); return; }
  show('play'); ensureWalk(); syncWalk(); animate(); startBgm();
  if (modelState !== 'ready' && modelState !== 'loading') void loadModel();
};
function renderQuestion() {
  const q = questions[state.index];
  $('#sceneNo').textContent = q.scene;
  $('#sceneName').textContent = q.name;
  const sn = $('#sceneNote');
  if (sn) sn.textContent = q.note;
  $('#questionKicker').textContent = q.kicker;
  typewrite($('#questionTitle'), q.title);
  $('#questionSub').textContent = q.sub;
  $('#questionCount').textContent = String(state.index + 1).padStart(2, '0') + ' / ' + questions.length;
  $('#depthLabel').textContent = 'DEPTH ' + String(Math.floor(state.index / 3) + 1).padStart(2, '0');
  $('#progressBar').style.width = (state.index / questions.length * 100) + '%';
  $('#backBtn').disabled = state.index === 0;
  $('#reason').value = state.reasons[state.index] || '';
  const npcCi = npcCharOf(sceneOf(state.index));
  const person = characters[npcCi < 0 ? 0 : npcCi];
  $('#speaker').textContent = person.name + ' / ' + person.role;
  const portrait = $('#dlgPortrait');
  if (portrait) { portrait.src = 'assets/' + person.file; portrait.alt = person.name; }
  $('#answers').replaceChildren();
  q.answers.forEach(([key, text]) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'answer-btn';
    const label = document.createElement('span'); label.className = 'answer-key'; label.textContent = key;
    const copy = document.createElement('span'); copy.textContent = text;
    button.append(label, copy); button.onclick = () => choose(key);
    $('#answers').append(button);
  });
}
function choose(key) {
  if (busy || screen !== 'play') return;
  const q = questions[state.index];
  if (!q.answers.some(a => a[0] === key)) return;
  busy = true;
  state.answers[state.index] = key;
  state.reasons[state.index] = $('#reason').value.trim().slice(0, 240);
  state.answers.length = state.index + 1;
  state.reasons.length = state.index + 1;
  state.comments = state.comments || [];
  state.comments.length = state.index + 1;
  state.comments[state.index] = '';
  pendingComments = pendingComments.filter(p => p.index < state.index);
  $('#backBtn').disabled = true;
  document.querySelectorAll('.answer-btn').forEach(b => { b.disabled = true; b.classList.toggle('chosen', b.firstChild.textContent === key); });
  transitionTimer = setTimeout(() => {
    busy = false;
    const answered = questions[state.index].answers.find(a => a[0] === key)[1];
    const why = state.reasons[state.index] || '';
    const isLast = state.index + 1 === questions.length;
    if (isLast) { state.completed = true; save(); }
    // 質問ダイアログを閉じ、NPCの寸評を聞いてから次へ進む
    dialogueOpen = false;
    const pane = $('#questionPane');
    if (pane) { pane.hidden = true; pane.classList.remove('dialogue-open'); }
    showNpcComment(answered, why, () => {
      if (state.completed) renderResult();
      else { state.index++; save(); syncWalk(); if (walk) walk.setPaused(false); }
    });
  }, 200);
}
$('#backBtn').onclick = () => {
  if (busy || state.index === 0) return;
  state.reasons[state.index] = $('#reason').value.trim().slice(0, 240);
  state.index--; save(); renderQuestion(); syncWalk();
};
document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
  if (/^[1-4]$/.test(event.key) && screen === 'play' && dialogueOpen) { event.preventDefault(); choose('ABCD'[Number(event.key)-1]); }
  if (event.key === 'Enter' && screen === 'intro') { event.preventDefault(); $('#startAiBtn').click(); }
});
$('#questionTitle').addEventListener('click', finishType);
function renderResult() {
  show('result'); stopAnimation(); stopType(); closeNpc();
  dialogueOpen = false;
  const pane = $('#questionPane');
  if (pane) { pane.hidden = true; pane.classList.remove('dialogue-open'); }
  if (walk) walk.setPaused(true);
  const result = summarize(state.answers, questions, factorNames);
  const [name, message] = archetypes[result.primary];
  $('#resultTitle').firstChild.textContent = m('今の選択が描いた、', 'The choices you made suggest ');
  $('#resultTitle').lastChild.textContent = m('。', '.');
  $('#resultArchetype').textContent = name;
  $('#resultLead').textContent = message;
  $('#resultPhil').textContent = '— ' + (archePhil[result.primary] || m('答えではなく、問いを持ち帰れ。', 'Take a question home, not a verdict.'));
  $('#confidence').textContent = english ? `${state.answers.length} choices / not a validated measure` : state.answers.length + '個の選択 / 検証済み尺度ではありません';
  $('#factorBars').replaceChildren();
  for (const [key, label] of Object.entries(factorNames)) {
    const row = document.createElement('div'); row.className = 'factor';
    const labelEl = document.createElement('label'); labelEl.textContent = label;
    const bar = document.createElement('div'); bar.className = 'factor-track';
    const fill = document.createElement('i'); fill.style.width = result.percentages[key] + '%'; bar.append(fill);
    const value = document.createElement('b'); value.textContent = result.percentages[key];
    row.append(labelEl, bar, value); $('#factorBars').append(row);
  }
  $('#resultMemo').textContent = m('同じやさしさでも、「選んだ」のか「断れなかった」のかで、その内側は違う。\nあなたの言葉で、選択の理由をたどってみよう。', 'The same kindness can come from a free choice or from a fear of saying no.\nOnly you can trace the reason behind your choices.');
  $('#answerLog').replaceChildren();
  state.answers.forEach((key, i) => {
    const li = document.createElement('li');
    li.textContent = questions[i].title + '\n→ ' + questions[i].answers.find(a => a[0] === key)[1] + (state.reasons[i] ? '\n' + m('理由：', 'Reason: ') + state.reasons[i] : '') + (state.comments?.[i] ? '\n' + m('LFMの言葉：', 'LFM reflection: ') + state.comments[i] : '');
    $('#answerLog').append(li);
  });
  report = state.report || ''; hasSavedReport = !!report;
  $('#aiOutput').textContent = report || m('ここにLFMが、あなたの選択と理由から手紙を書きます。定型文ではなく、この端末で生成します。', 'LFM will write a letter from your choices and reasons here. It is generated on this device.');
  $('#aiStatus').textContent = report ? m('保存されたLFMの手紙', 'Saved LFM letter') : m('LFM未生成。下のボタンから実行できます。', 'No LFM letter yet. Use the button below.');
  if (modelState === 'ready' && !report) generateReport();
  if (modelState === 'loading') $('#aiStatus').textContent = m('LFMを読み込み中。完了後、自動で手紙を生成します。', 'LFM is loading. The letter will start when it is ready.');
}
async function generateReport() {
  if (generating) return;
  if (chatBusy) { $('#aiStatus').textContent = m('NPCとの会話生成が終わるまでお待ちください。', 'Please wait for the current character response.'); return; }
  if (modelState !== 'ready') { await loadModel(); return; }
  requestId++; generating = true; report = ''; hasSavedReport = false;
  state.report = ''; save();
  $('#aiOutput').textContent = '';
  $('#aiOutput').setAttribute('aria-busy', 'true');
  $('#aiStatus').textContent = m('LFMが選択の背景・葛藤・別の解釈を考えています…', 'LFM is exploring the tensions and other readings in your choices…');
  $('#generateBtn').disabled = true; $('#cancelModelBtn').hidden = false;
  modelTimer = setTimeout(() => modelFailure(m('生成が時間上限に達しました', 'Generation timed out')), 180000);
  worker.postMessage({ type:'generate', id:requestId, max_new_tokens:600, messages:buildPrompt(state, questions, lang) });
}
$('#generateBtn').onclick = generateReport;
$('#restartBtn').onclick = () => {
  if (generating || modelState === 'loading') { requestId++; disposeWorker(); setModelState('idle'); setStatus(m('LFM未読込', 'LFM not loaded')); }
  clearTimeout(chatTimer); chatBusy = false; closeNpc(); abortComment(); clearAmbient();
  show('intro'); stopAnimation(); $('#resumeBtn').hidden = false; $('#resumeBtn').textContent = m('今の結果を見る', 'View current result');
};
$('#exportBtn').onclick = () => {
  const text = m('EMBER — トワの旅の記録\n\n', 'EMBER — Towa’s Journey Record\n\n') + makeTranscript(state, questions, lang) + m('\n\nLFMの手紙\n', '\n\nLFM Letter\n') + (state.report || m('未生成', 'Not generated')) + m('\n\nこれは娯楽・自己対話用であり、医学的・心理学的な診断ではありません。', '\n\nFor reflection and play, not a medical or psychological diagnosis.');
  const url = URL.createObjectURL(new Blob([text], { type:'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'ember-journey.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('#eraseBtn').onclick = () => {
  if (!confirm(m('この端末に保存した回答と手紙を削除しますか？', 'Delete the answers and letter saved on this device?'))) return;
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  requestId++; disposeWorker(); setModelState('idle');
  clearTimeout(chatTimer); chatBusy = false; closeNpc(); abortComment(); clearAmbient(); stopType();
  state = { version:2, index:0, answers:[], reasons:[], completed:false, report:'' };
  report = ''; hasSavedReport = false; show('intro'); stopAnimation(); $('#resumeBtn').hidden = true; setStatus(m('保存した旅の記録を削除しました', 'Saved journey deleted'));
};
window.addEventListener('pagehide', () => { requestId++; stopAnimation(); disposeWorker(); setModelState('idle'); });
setStatus(m('LFM2-350M / 未読込', 'LFM2-350M / not loaded'));
queueMissingComments();
renderCommentJournal();
syncSound();
// 起動時の環境表示：WebGPU不可なら最初から理由を示す
async function isBrave() {
  try { return !!(navigator.brave && (await navigator.brave.isBrave())); } catch { return false; }
}
async function gpuMissingAdvice() {
  if (await isBrave()) return m('Braveの場合は：①アドレスバーのライオン→このサイトのShieldsをOFF ②設定→システム→ハードウェアアクセラレーションをON ③Braveを再起動', 'In Brave, disable Shields for this site, enable hardware acceleration, then restart Brave.');
  return m('Chrome/Edge等の対応ブラウザでお試しください', 'Try a current Chrome or Edge browser, or use CPU mode.');
}
(function () {
  if (window.isSecureContext && navigator.gpu) return;
  gpuMissingAdvice().then(extra => {
    setStatus(m('このブラウザ・環境ではWebGPUが使えません。', 'WebGPU is unavailable in this browser. ') + extra);
    ['cpuBtn', 'gameCpuBtn'].forEach(id => { const cpu = document.getElementById(id); if (cpu) cpu.hidden = false; });
    const force = document.getElementById('startForceBtn');
    if (force) force.hidden = false;
  });
})();
// 診断用フック（コンソールで __ember() と呼ぶと状態が分かります）
window.__ember = () => ({ screen, modelState, lastModelError, progress: state.answers.length + '/' + questions.length });
// NPC会話UIの配線
(function () {
  const npcBtn = $('#npcBtn');
  if (npcBtn) npcBtn.onclick = () => { if (lastHud && lastHud.near) openNpcCard(); };
  const close = $('#npcClose');
  if (close) close.onclick = closeNpc;
  const send = () => {
    const input = $('#npcInput');
    const v = input.value.trim().slice(0, 120);
    if (!v || chatBusy || generating) return;
    npcLog.push({ who: 'you', text: v }); input.value = '';
    renderNpc();
    if (!npcGenerate(v)) setNpcStatus(modelState === 'ready' ? m('生成中です。少し待ってください。', 'Generating. Please wait.') : m('LFM未読込のため、定型文で応えます。', 'LFM is not loaded. Story dialogue is available.'));
  };
  $('#npcSend').onclick = send;
  $('#npcInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } e.stopPropagation(); });
  $('#npcNudge').onclick = () => { if (!npcGenerate(null)) setNpcStatus(modelState === 'ready' ? m('生成中です。少し待ってください。', 'Generating. Please wait.') : m('LFM未読込のため、定型文で応えます。', 'LFM is not loaded. Story dialogue is available.')); };
  $('#npcLoad').onclick = () => { loadModel(); updateNpcModel(); };
  const gs = $('#gameSoundBtn');
  if (gs) gs.onclick = toggleSound;
  const ts = $('#titleSoundBtn');
  if (ts) ts.onclick = toggleSound;
})();
// タイトル画面の哲学的名言ローテーション
const TITLE_QUOTES = english ? [
  'The road you did not take still shaped your step.',
  'Know yourself.',
  'A friend can be another self without becoming a mirror.',
  'What we protect also changes us.',
  'Take a question home, not a verdict.',
] : [
  '選ばなかった道が、あなたを形づくる。',
  '汝自身を知れ。',
  '友とは、第二の自己である。',
  '人は人によってのみ、人になる。',
  '答えではなく、問いを持ち帰れ。',
];
(function () {
  const el = $('#titleQuote');
  if (!el) return;
  let idx = 0;
  el.textContent = TITLE_QUOTES[0];
  el.classList.add('show');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setInterval(() => {
    if (screen !== 'intro') return;
    idx = (idx + 1) % TITLE_QUOTES.length;
    el.classList.remove('show');
    setTimeout(() => {
      if (screen !== 'intro') return;
      el.textContent = TITLE_QUOTES[idx];
      el.classList.add('show');
    }, 450);
  }, 5200);
})();
// 全画面トグル（Fullscreen API＋CSS全画面の併用）
(function () {
  const btn = $('#fsBtn');
  if (!btn) return;
  btn.onclick = async () => {
    const wrap = document.querySelector('.walk-wrap');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (wrap && wrap.requestFullscreen) await wrap.requestFullscreen();
    } catch { /* Fullscreen不可の環境ではCSS全画面のまま */ }
  };
  document.addEventListener('fullscreenchange', () => {
    btn.textContent = document.fullscreenElement ? m('⛶ 終了', '⛶ Exit full screen') : m('⛶ 全画面', '⛶ Full screen');
  });
})();
