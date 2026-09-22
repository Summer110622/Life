import { questions, characters, factorNames, archetypes, sceneEpigraphs, archePhil } from './story.mjs';
import { summarize, makeTranscript, buildPrompt, buildNpcPrompt, loadSave } from './game-core.mjs';
import { createWalk, sceneOf, slotOf, npcCharOf } from './walk.mjs';

const $ = s => document.querySelector(s);
const SAVE_KEY = 'ember-life-v2';
let state = loadSave(localStorageSafeGet(SAVE_KEY), questions);
let screen = 'intro', busy = false, frameTimer = null, transitionTimer = null, frame = 0;
let worker = null, modelState = 'idle', modelTimer = null, generating = false, requestId = 0;
let lastModelError = '', loadStart = 0, readyWaiters = [];
function setModelState(s) {
  modelState = s;
  document.body.dataset.lfm = s;
}
// LFM必須ゲート：READYになるまで待つ。失敗時はfalseで復帰する
function ensureModel() {
  if (modelState === 'ready') return Promise.resolve(true);
  if (modelState !== 'loading') loadModel();
  return new Promise(res => readyWaiters.push(res));
}
function settleWaiters(ok) {
  readyWaiters.splice(0).forEach(fn => { try { fn(ok); } catch {} });
}
let report = '', hasSavedReport = false;
let walk = null, dialogueOpen = false, walkScene = -1;
// ---- NPC会話AI ----
let npcOpen = false, chatBusy = false, chatReqId = 0, chatTimer = null, chatDraft = '';
let npcLog = [], npcVisits = {}, lastHud = null;
// 回答へのAIコメント（NPCが問い→回答→寸評の進行フロー用）
let commentMode = false, commentCallback = null, commentTimer = null, ackVisits = {};
// LFM準備中の回答は保留し、READYになり次第その場で寸評を届ける
let pendingComment = null, ambientMode = false, ambientTimer = null, ambientName = '';
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
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); $('#saveMessage').textContent = 'この端末に自動保存'; }
  catch { $('#saveMessage').textContent = '保存できません。このタブで続行できます'; }
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
    setNpcStatus(chatBusy ? 'LFM生成中…' : generating ? '手紙を生成中…' : 'LFM READY・随時生成');
  } else {
    if (load) { load.hidden = modelState === 'loading'; load.textContent = modelState === 'loading' ? 'LFM読込中…' : 'LFMを読み込む'; }
    if (modelState !== 'loading') setNpcStatus('LFM未読込・定型文で応答');
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
      div.textContent = (m.who === 'you' ? 'トワ：' : '') + m.text;
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
  if (pendingComment) deliverAmbient(); // READY後の届け損ねを歩行中に再試行
  if (!lastHud || !lastHud.has || screen !== 'play' || state.completed) {
    if (!npcOpen && !commentMode) balloon.hidden = true;
    btn.hidden = true;
    return;
  }
  const canvas = $('#walkCanvas');
  const r = canvas.getBoundingClientRect(), wrap = canvas.parentElement.getBoundingClientRect();
  const x = (r.left - wrap.left) + lastHud.fx * r.width;
  const y = (r.top - wrap.top) + lastHud.fy * r.height;
  balloon.style.left = Math.max(70, Math.min(wrap.width - 70, x)) + 'px';
  balloon.style.top = Math.max(48, y) + 'px';
  if (commentMode) { balloon.hidden = false; btn.hidden = true; return; }
  if (npcOpen) { balloon.hidden = false; return; }
  btn.hidden = !lastHud.near || dialogueOpen;
  if (lastHud.near && !dialogueOpen) {
    const c = curNpc();
    const q = questions[state.index];
    balloon.hidden = false;
    $('#balloonName').textContent = c ? c.name : 'トワ';
    $('#balloonText').textContent = state.answers[state.index] === undefined && q ? '「' + q.kicker + '」の話 ［T/E］' : '［T］話しかける';
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
  renderNpc(); updateNpcModel();
  clearTimeout(chatTimer);
  chatTimer = setTimeout(() => {
    if (!chatBusy) return;
    chatBusy = false; requestId++;
    setNpcStatus('生成が時間切れになりました。定型文で続けます。');
    renderNpc(); updateNpcModel();
  }, 120000);
  worker.postMessage({ type: 'generate', id: chatReqId, messages: buildNpcPrompt({
    npc: c, sceneName: questions[state.index].name,
    answered: state.answers.length, total: questions.length,
    transcript: makeTranscript(state, questions),
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
  commentMode = false; chatBusy = false;
  clearTimeout(commentTimer); clearTimeout(chatTimer);
  const done = commentCallback;
  commentCallback = null;
  $('#speechBalloon').hidden = true;
  if (done) done();
}
function abortComment() {
  commentCallback = null; commentMode = false; chatBusy = false;
  clearTimeout(commentTimer); clearTimeout(chatTimer);
  const b = $('#speechBalloon'); if (b) b.hidden = true;
}
function clearAmbient() {
  pendingComment = null; ambientMode = false; ambientName = '';
  clearTimeout(ambientTimer);
}
// 保留していた回答への寸評を、その場で届ける（進行は止めない）
function deliverAmbient() {
  const p = pendingComment;
  if (!p || screen !== 'play' || dialogueOpen || npcOpen || commentMode) return;
  if (modelState !== 'ready' || generating || chatBusy || !worker) return;
  pendingComment = null;
  ambientMode = true; ambientName = p.name;
  chatBusy = true; chatReqId = ++requestId; chatDraft = '';
  setBalloon(p.name, '…');
  updateNpcModel();
  clearTimeout(ambientTimer);
  ambientTimer = setTimeout(() => {
    ambientMode = false; chatBusy = false; requestId++;
    $('#speechBalloon').hidden = true;
    updateNpcModel();
  }, 25000);
  worker.postMessage({ type: 'generate', id: chatReqId, messages: buildNpcPrompt({
    npc: { idx: p.npcIdx, ...characters[p.npcIdx] }, sceneName: p.sceneName,
    answered: p.answered, total: questions.length,
    transcript: p.transcript, history: p.history, playerText: null, answer: p.say,
  }) });
}
function showNpcComment(answerLabel, reason, done) {
  const c = curNpc();
  const who = c ? c.name : 'トワ';
  const say = '選択：' + answerLabel + (reason ? '（理由：' + reason + '）' : '');
  commentMode = true; commentCallback = done;
  if (walk) walk.setPaused(true);
  const canAi = c && worker && !generating && !chatBusy;
  if (canAi && modelState === 'ready') {
    chatBusy = true; chatReqId = ++requestId; chatDraft = '';
    setBalloon(who, '…');
    clearTimeout(chatTimer); clearTimeout(commentTimer);
    chatTimer = setTimeout(() => {
      if (!commentMode) return;
      setBalloon(who, 'LFMの生成が時間切れになりました。次の回答で再試行します');
      commentTimer = setTimeout(finishComment, 2200);
    }, 15000);
    worker.postMessage({ type: 'generate', id: chatReqId, messages: buildNpcPrompt({
      npc: c, sceneName: questions[state.index].name,
      answered: state.answers.length, total: questions.length,
      transcript: makeTranscript(state, questions),
      history: npcLog.slice(-6), playerText: null, answer: say,
    }) });
  } else if (canAi && modelState === 'loading') {
    // 準備中の回答は保留：READYになり次第、その場で寸評を届ける
    pendingComment = {
      npcIdx: c.idx, name: who, sceneName: questions[state.index].name,
      answered: state.answers.length, transcript: makeTranscript(state, questions),
      history: npcLog.slice(-6), say,
    };
    setBalloon(who, 'LFM準備中…言葉を用意しています');
    clearTimeout(commentTimer);
    commentTimer = setTimeout(finishComment, 4000);
  } else {
    // 定型相づちは使わない。LFM不可の理由を示して進む
    if (modelState === 'idle' || modelState === 'loading') loadModel();
    setBalloon(who, 'LFMが使えません（' + (lastModelError || 'WebGPU対応端末でお試しください') + '）。NPCカードの[LFMを読み込む]で再試行できます');
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
  $('#soundBtn').setAttribute('aria-label', audio.paused ? 'BGMを再生' : 'BGMを停止');
  const gs = $('#gameSoundBtn');
  if (gs) { gs.textContent = audio.paused ? '♪' : '♫'; gs.setAttribute('aria-pressed', String(!audio.paused)); }
  const ts = $('#titleSoundBtn');
  if (ts) { ts.textContent = audio.paused ? '♪' : '♫'; ts.setAttribute('aria-pressed', String(!audio.paused)); }
}
async function toggleSound() {
  if (!audio.paused) audio.pause();
  else try { await audio.play(); } catch { $('#soundBtn').textContent = '音声を再生できません'; return; }
  syncSound();
}
// 旅の開始と同時に音楽を流す（クリック操作に紐づくため再生制限に掛からない）
function startBgm() {
  if (!audio.paused) return;
  audio.play().then(() => syncSound()).catch(() => {});
}
$('#soundBtn').onclick = toggleSound;
audio.addEventListener('error', () => { $('#soundBtn').textContent = 'BGM 読込エラー'; });

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
  disposeWorker(); lastModelError = message; setModelState('error'); settleWaiters(false);
  setStatus(message);
  $('#aiStatus').textContent = message + '。プレイにはLFMが必須のため、下の再試行ボタンで読み込み直してください。';
  $('#generateBtn').textContent = 'LFMを再読み込みして生成';
  $('#startAiBtn').disabled = false;
  $('#startAiBtn').textContent = 'LFMで旅をはじめる';
  const retry = $('#modelRetry');
  if (retry) retry.hidden = false;
}
function createModelWorker() {
  if (worker) return;
  worker = new Worker(new URL('./lfm-worker.mjs', import.meta.url), { type:'module' });
  worker.onmessage = ({ data }) => {
    if (data.id != null && chatBusy && data.id === chatReqId) {
      if (data.type === 'token') {
        chatDraft += data.text;
        if (commentMode) setBalloon(curNpc() ? curNpc().name : 'トワ', chatDraft.slice(0, 140));
        else if (ambientMode) setBalloon(ambientName || 'トワ', chatDraft.slice(0, 140));
        else renderNpc();
      }
      else if (data.type === 'complete') {
        clearTimeout(chatTimer); chatBusy = false;
        if (commentMode) {
          setBalloon(curNpc() ? curNpc().name : 'トワ', String(data.text || '……').slice(0, 140));
          clearTimeout(commentTimer);
          commentTimer = setTimeout(finishComment, 2400);
          return;
        }
        if (ambientMode) {
          ambientMode = false;
          setBalloon(ambientName || 'トワ', String(data.text || '……').slice(0, 140));
          clearTimeout(ambientTimer);
          ambientTimer = setTimeout(() => { $('#speechBalloon').hidden = true; }, 5000);
          updateNpcModel();
          return;
        }
        npcLog.push({ who: 'npc', text: String(data.text || '……').slice(0, 400) });
        setNpcStatus('LFM随時生成・仮説としての言葉です');
        renderNpc(); updateNpcModel();
      }
      else if (data.type === 'error') {
        clearTimeout(chatTimer); chatBusy = false;
        if (ambientMode) {
          ambientMode = false;
          $('#speechBalloon').hidden = true;
          updateNpcModel();
          return;
        }
        if (commentMode) {
          const c = curNpc();
          setBalloon(c ? c.name : 'トワ', 'LFM生成に失敗しました。次の回答で再試行します');
          clearTimeout(commentTimer);
          commentTimer = setTimeout(finishComment, 2200);
          return;
        }
        setNpcStatus('生成できませんでした。定型文で続けます。');
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
      setStatus('LFM 読込中 · ' + mb + ' MB' + (pct == null ? '' : ' / ' + pct + '%') + ' · ' + clock);
      $('#aiStatus').textContent = $('#modelMessage').textContent;
      if (modelState === 'loading') $('#startAiBtn').textContent = 'LFM読込中' + (pct == null ? '…' : ' ' + pct + '%');
    }
    if (data.type === 'ready') {
      clearTimeout(modelTimer); setModelState('ready');
      const retry1 = $('#modelRetry');
      if (retry1) retry1.hidden = true;
      setStatus('LFM2-350M · WebGPU READY');
      $('#cancelModelBtn').hidden = true;
      $('#startAiBtn').disabled = false;
      $('#startAiBtn').textContent = 'LFMで旅をはじめる';
      $('#aiStatus').textContent = 'LFMの準備ができました。回答をもとに手紙を生成できます。';
      updateNpcModel();
      if (npcOpen && !chatBusy && !generating) npcGenerate(null);
      deliverAmbient();
      settleWaiters(true);
      if (screen === 'result') generateReport();
    }
    if (data.type === 'token') {
      report += data.text;
      $('#aiOutput').textContent = report;
    }
    if (data.type === 'complete') {
      clearTimeout(modelTimer); generating = false; hasSavedReport = true;
      report = data.text; $('#aiOutput').textContent = report;
      $('#aiStatus').textContent = 'LFM2-350M / WebGPUで生成しました。AIの読み取りは仮説です。';
      $('#generateBtn').disabled = false; $('#generateBtn').textContent = 'もう一度読み解く';
      $('#cancelModelBtn').hidden = true;
      state.report = report; save();
      $('#aiOutput').setAttribute('aria-busy', 'false');
    }
    if (data.type === 'error') { modelFailure(data.message); updateNpcModel(); }
  };
  worker.onerror = e => { e.preventDefault(); modelFailure('LFMの起動に失敗しました。通信・WebGPU対応をご確認ください'); };
}
async function loadModel() {
  if (modelState === 'ready') return true;
  if (modelState === 'loading') return false;
  setModelState('loading');
  const retry0 = $('#modelRetry');
  if (retry0) retry0.hidden = true;
  $('#startAiBtn').disabled = true; $('#cancelModelBtn').hidden = false;
  setStatus('WebGPUを確認しています');
  if (!isSecureContext || !navigator.gpu) {
    modelFailure('この環境ではWebGPUが利用できません。HTTPS対応のChrome / Edge等でお試しください');
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('GPU adapter unavailable');
    createModelWorker();
    loadStart = Date.now();
    modelTimer = setTimeout(() => modelFailure('読み込みが時間上限(30分)に達しました。通信を確認して再試行してください'), 1800000);
    worker.postMessage({ type:'load' });
    return true;
  } catch { modelFailure('GPUを取得できません。対応端末でお試しください'); return false; }
}
$('#cancelModelBtn').onclick = () => {
  requestId++; disposeWorker(); setModelState('idle');
  clearTimeout(chatTimer); chatBusy = false; chatDraft = ''; abortComment(); clearAmbient();
  setStatus('LFMを停止しました');
  if (!hasSavedReport) { report = ''; $('#aiOutput').textContent = '生成は完了していません。'; }
  $('#aiStatus').textContent = 'AI処理を停止しました。再読み込みできます。';
  updateNpcModel(); renderNpc();
  settleWaiters(false);
};
const modelRetryBtn = $('#modelRetry');
if (modelRetryBtn) modelRetryBtn.onclick = () => { loadModel(); };
function startNew() {
  clearTimeout(transitionTimer); busy = false; stopType(); closeNpc(); abortComment();
  state = { version:2, index:0, answers:[], reasons:[], completed:false, report:'' };
  report = ''; hasSavedReport = false; save(); show('play');
  if (walk) { walk.destroy(); walk = null; }
  walkScene = -1; dialogueOpen = false;
  startBgm();
  const pane = $('#questionPane');
  if (pane) { pane.hidden = true; pane.classList.remove('dialogue-open'); }
  ensureWalk(); syncWalk(); animate();
}
$('#startAiBtn').onclick = async () => {
  const btn = $('#startAiBtn');
  btn.disabled = true; btn.textContent = 'LFM読込中…';
  if (await ensureModel()) startNew();
  // 失敗時は modelFailure がボタンを戻す
};
$('#resumeBtn').hidden = !state.answers.length;
$('#resumeBtn').onclick = async () => {
  if (state.completed) { renderResult(); return; }
  const btn = $('#resumeBtn'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'LFM読込中…';
  const ok = await ensureModel();
  btn.disabled = false; btn.textContent = label;
  if (ok) { show('play'); ensureWalk(); syncWalk(); animate(); startBgm(); }
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
  $('#resultArchetype').textContent = name;
  $('#resultLead').textContent = message;
  $('#resultPhil').textContent = '— ' + (archePhil[result.primary] || '答えではなく、問いを持ち帰れ。');
  $('#confidence').textContent = state.answers.length + '個の選択 / 検証済み尺度ではありません';
  $('#factorBars').replaceChildren();
  for (const [key, label] of Object.entries(factorNames)) {
    const row = document.createElement('div'); row.className = 'factor';
    const labelEl = document.createElement('label'); labelEl.textContent = label;
    const bar = document.createElement('div'); bar.className = 'factor-track';
    const fill = document.createElement('i'); fill.style.width = result.percentages[key] + '%'; bar.append(fill);
    const value = document.createElement('b'); value.textContent = result.percentages[key];
    row.append(labelEl, bar, value); $('#factorBars').append(row);
  }
  $('#resultMemo').textContent = '同じやさしさでも、「選んだ」のか「断れなかった」のかで、その内側は違う。\nあなたの言葉で、選択の理由をたどってみよう。';
  $('#answerLog').replaceChildren();
  state.answers.forEach((key, i) => {
    const li = document.createElement('li');
    li.textContent = questions[i].title + '\n→ ' + questions[i].answers.find(a => a[0] === key)[1] + (state.reasons[i] ? '\n理由：' + state.reasons[i] : '');
    $('#answerLog').append(li);
  });
  report = state.report || ''; hasSavedReport = !!report;
  $('#aiOutput').textContent = report || 'ここにLFMが、あなたの選択と理由から手紙を書きます。定型文ではなく、この端末で生成します。';
  $('#aiStatus').textContent = report ? '保存されたLFMの手紙' : 'LFM未生成。下のボタンから実行できます。';
  if (modelState === 'ready' && !report) generateReport();
  if (modelState === 'loading') $('#aiStatus').textContent = 'LFMを読み込み中。完了後、自動で手紙を生成します。';
}
async function generateReport() {
  if (generating) return;
  if (chatBusy) { $('#aiStatus').textContent = 'NPCとの会話生成が終わるまでお待ちください。'; return; }
  if (modelState !== 'ready') { await loadModel(); return; }
  requestId++; generating = true; report = ''; hasSavedReport = false;
  state.report = ''; save();
  $('#aiOutput').textContent = '';
  $('#aiOutput').setAttribute('aria-busy', 'true');
  $('#aiStatus').textContent = 'LFMが選択の背景・葛藤・別の解釈を考えています…';
  $('#generateBtn').disabled = true; $('#cancelModelBtn').hidden = false;
  modelTimer = setTimeout(() => modelFailure('生成が時間上限に達しました'), 180000);
  worker.postMessage({ type:'generate', id:requestId, messages:buildPrompt(state, questions) });
}
$('#generateBtn').onclick = generateReport;
$('#restartBtn').onclick = () => {
  if (generating || modelState === 'loading') { requestId++; disposeWorker(); setModelState('idle'); setStatus('LFM未読込'); }
  clearTimeout(chatTimer); chatBusy = false; closeNpc(); abortComment(); clearAmbient();
  show('intro'); stopAnimation(); $('#resumeBtn').hidden = false; $('#resumeBtn').textContent = '今の結果を見る';
};
$('#exportBtn').onclick = () => {
  const text = 'EMBER — トワの旅の記録\n\n' + makeTranscript(state, questions) + '\n\nLFMの手紙\n' + (state.report || '未生成') + '\n\nこれは娯楽・自己対話用であり、医学的・心理学的な診断ではありません。';
  const url = URL.createObjectURL(new Blob([text], { type:'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'ember-journey.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('#eraseBtn').onclick = () => {
  if (!confirm('この端末に保存した回答と手紙を削除しますか？')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  requestId++; disposeWorker(); setModelState('idle');
  clearTimeout(chatTimer); chatBusy = false; closeNpc(); abortComment(); clearAmbient(); stopType();
  state = { version:2, index:0, answers:[], reasons:[], completed:false, report:'' };
  report = ''; hasSavedReport = false; show('intro'); stopAnimation(); $('#resumeBtn').hidden = true; setStatus('保存した旅の記録を削除しました');
};
window.addEventListener('pagehide', () => { requestId++; stopAnimation(); disposeWorker(); setModelState('idle'); });
setStatus('LFM2-350M / 未読込');
syncSound();
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
    if (!npcGenerate(v)) setNpcStatus(modelState === 'ready' ? '生成中です。少し待ってください。' : 'LFM未読込のため、定型文で応えます。');
  };
  $('#npcSend').onclick = send;
  $('#npcInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } e.stopPropagation(); });
  $('#npcNudge').onclick = () => { if (!npcGenerate(null)) setNpcStatus(modelState === 'ready' ? '生成中です。少し待ってください。' : 'LFM未読込のため、定型文で応えます。'); };
  $('#npcLoad').onclick = () => { loadModel(); updateNpcModel(); };
  const gs = $('#gameSoundBtn');
  if (gs) gs.onclick = toggleSound;
  const ts = $('#titleSoundBtn');
  if (ts) ts.onclick = toggleSound;
})();
// タイトル画面の哲学的名言ローテーション
const TITLE_QUOTES = [
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
    btn.textContent = document.fullscreenElement ? '⛶ 終了' : '⛶ 全画面';
  });
})();
