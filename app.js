import { questions, characters, factorNames, archetypes } from './story.mjs';
import { summarize, makeTranscript, buildPrompt, loadSave } from './game-core.mjs';

const $ = s => document.querySelector(s);
const SAVE_KEY = 'ember-life-v2';
let state = loadSave(localStorageSafeGet(SAVE_KEY), questions);
let screen = 'intro', busy = false, frameTimer = null, transitionTimer = null, frame = 0;
let worker = null, modelState = 'idle', modelTimer = null, generating = false, requestId = 0;
let report = '', hasSavedReport = false;
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
  window.scrollTo({ top:0, behavior:'instant' });
}
function setStatus(text) { $('#lfmStatus').textContent = text; $('#modelMessage').textContent = text; }
function stopAnimation() { clearTimeout(frameTimer); frameTimer = null; }
function animate() {
  stopAnimation();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return;
  frame = (frame + 1) % 6;
  const file = 'assets/robot-walk-0' + (frame + 1) + '.png';
  $('#playRobot').style.backgroundImage = 'url("' + file + '")';
  $('#heroRobot').style.backgroundImage = 'url("' + file + '")';
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
}
$('#soundBtn').onclick = async () => {
  if (!audio.paused) audio.pause();
  else try { await audio.play(); } catch { $('#soundBtn').textContent = '音声を再生できません'; return; }
  syncSound();
};
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
  disposeWorker(); modelState = 'error';
  setStatus(message);
  $('#aiStatus').textContent = message + '。再試行できます。通常のゲーム進行には影響しません。';
  $('#generateBtn').textContent = 'LFMを再読み込みして生成';
}
function createModelWorker() {
  if (worker) return;
  worker = new Worker(new URL('./lfm-worker.mjs', import.meta.url), { type:'module' });
  worker.onmessage = ({ data }) => {
    if (data.id != null && data.id !== requestId) return;
    if (data.type === 'status') setStatus(data.message);
    if (data.type === 'progress') {
      const mb = (data.loaded / 1048576).toFixed(0);
      setStatus('LFM 読込中 · ' + mb + ' MB' + (data.progress == null ? '' : ' / ' + Math.round(data.progress) + '%'));
      $('#aiStatus').textContent = $('#modelMessage').textContent;
    }
    if (data.type === 'ready') {
      clearTimeout(modelTimer); modelState = 'ready';
      setStatus('LFM2-350M · WebGPU READY');
      $('#cancelModelBtn').hidden = true;
      $('#startAiBtn').disabled = false;
      $('#startAiBtn').textContent = 'LFMで旅をはじめる';
      $('#aiStatus').textContent = 'LFMの準備ができました。回答をもとに手紙を生成できます。';
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
    if (data.type === 'error') modelFailure(data.message);
  };
  worker.onerror = e => { e.preventDefault(); modelFailure('LFMの起動に失敗しました。通信・WebGPU対応をご確認ください'); };
}
async function loadModel() {
  if (modelState === 'ready') return true;
  if (modelState === 'loading') return false;
  modelState = 'loading';
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
    modelTimer = setTimeout(() => modelFailure('読み込みが時間上限に達しました。通信を確認して再試行してください'), 300000);
    worker.postMessage({ type:'load' });
    return true;
  } catch { modelFailure('GPUを取得できません。対応端末でお試しください'); return false; }
}
$('#cancelModelBtn').onclick = () => {
  requestId++; disposeWorker(); modelState = 'idle';
  setStatus('LFMを停止しました');
  if (!hasSavedReport) { report = ''; $('#aiOutput').textContent = '生成は完了していません。'; }
  $('#aiStatus').textContent = 'AI処理を停止しました。再読み込みできます。';
};
function startNew() {
  clearTimeout(transitionTimer); busy = false;
  state = { version:2, index:0, answers:[], reasons:[], completed:false, report:'' };
  report = ''; hasSavedReport = false; save(); show('play'); renderQuestion(); animate();
}
$('#startAiBtn').onclick = async () => { await loadModel(); startNew(); };
$('#startBtn').onclick = startNew;
$('#resumeBtn').hidden = !state.answers.length;
$('#resumeBtn').onclick = () => {
  if (state.completed) renderResult();
  else { show('play'); renderQuestion(); animate(); }
};
function renderQuestion() {
  const q = questions[state.index];
  $('#sceneNo').textContent = q.scene;
  $('#sceneName').textContent = q.name;
  $('#sceneNote').textContent = q.note;
  $('#questionKicker').textContent = q.kicker;
  $('#questionTitle').textContent = q.title;
  $('#questionSub').textContent = q.sub;
  $('#questionCount').textContent = String(state.index + 1).padStart(2, '0') + ' / ' + questions.length;
  $('#depthLabel').textContent = 'DEPTH ' + String(Math.floor(state.index / 2) + 1).padStart(2, '0');
  $('#progressBar').style.width = (state.index / questions.length * 100) + '%';
  $('#backBtn').disabled = state.index === 0;
  $('#reason').value = state.reasons[state.index] || '';
  const personIndex = state.index < 2 ? 0 : state.index < 4 ? 1 : state.index < 6 ? 2 : state.index === 6 ? 3 : state.index === 7 ? 4 : state.index < 10 ? 3 : 4;
  const person = characters[personIndex];
  $('#speaker').textContent = person.name + ' / ' + person.role;
  const npc = $('#npc');
  npc.hidden = personIndex === 0;
  npc.src = 'assets/' + person.file; npc.alt = person.name;
  const scene = Math.min(4, Math.floor(state.index / 2));
  $('.scene-window').style.backgroundImage = 'url("assets/scene-0' + (scene + 1) + '.png")';
  $('.scene-window').style.backgroundPosition = (20 + (state.index % 2) * 50) + '% center';
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
    if (state.index + 1 === questions.length) { state.completed = true; save(); renderResult(); }
    else { state.index++; save(); renderQuestion(); $('#questionTitle').focus({ preventScroll:true }); }
  }, 200);
}
$('#backBtn').onclick = () => {
  if (busy || state.index === 0) return;
  state.reasons[state.index] = $('#reason').value.trim().slice(0, 240);
  state.index--; save(); renderQuestion();
};
document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
  if (/^[1-4]$/.test(event.key) && screen === 'play') { event.preventDefault(); choose('ABCD'[Number(event.key)-1]); }
});
function renderResult() {
  show('result'); stopAnimation();
  const result = summarize(state.answers, questions, factorNames);
  const [name, message] = archetypes[result.primary];
  $('#resultArchetype').textContent = name;
  $('#resultLead').textContent = message;
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
  if (generating || modelState === 'loading') { requestId++; disposeWorker(); modelState = 'idle'; setStatus('LFM未読込'); }
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
  requestId++; disposeWorker(); modelState = 'idle';
  state = { version:2, index:0, answers:[], reasons:[], completed:false, report:'' };
  report = ''; hasSavedReport = false; show('intro'); stopAnimation(); $('#resumeBtn').hidden = true; setStatus('保存した旅の記録を削除しました');
};
window.addEventListener('pagehide', () => { requestId++; stopAnimation(); disposeWorker(); modelState = 'idle'; });
setStatus('LFM2-350M / 未読込');
syncSound();
