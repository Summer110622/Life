// walk.mjs — EMBER 歩行エンジン（ピクセルパーフェクト・Canvas）
// 960x540 の固定バックバッファを CSS で拡大表示し、ドット絵を潰さない。
// WASD/矢印キー + タッチ十字キー + E/Space/Enter/タップで操作。

export const VIEW_W = 960;
export const VIEW_H = 540;
export const WORLD_W = 1920;
const GROUND_TOP = 336;   // 歩行バンド上端（背景の空と分離）
const GROUND_BOTTOM = 476;

const SCENES = [
  { bg: 'assets/scene-01.png', npc: null },
  { bg: 'assets/scene-02.png', npc: 'assets/grandpa.png' },
  { bg: 'assets/scene-03.png', npc: 'assets/minimax.png' },
  { bg: 'assets/scene-04.png', npc: 'assets/linux.png' },
  { bg: 'assets/scene-05.png', npc: 'assets/seramu.png' },
  { bg: 'assets/scene-01.png', npc: null }, // SCENE 06 町外れ：入口を反対側から
];

const PLAYER_FILES = [
  'assets/robot-walk-01.png', 'assets/robot-walk-02.png', 'assets/robot-walk-03.png',
  'assets/robot-walk-04.png', 'assets/robot-walk-05.png', 'assets/robot-walk-06.png',
];
const PLAYER_W = 68, PLAYER_H = 136;
const MARK_SLOTS = [1200, 1500, 1780]; // ワールドX（各シーン3問分）

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function sceneOf(qIndex) { return Math.min(5, Math.floor(qIndex / 3)); }
export function slotOf(qIndex) { return qIndex % 3; }
// 歩行シーン → story.mjs characters の index（NPCのいないシーンは -1）
const NPC_CHAR = { 1: 1, 2: 2, 3: 3, 4: 4 };
export function npcCharOf(sceneIdx) { return NPC_CHAR[sceneIdx] ?? -1; }

export function createWalk(canvas, opts = {}) {
  const onInteract = opts.onInteract || (() => {});
  const onHud = opts.onHud || (() => {});
  const onTalkNpc = opts.onTalkNpc || (() => {});
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // 背景の事前レンダリング先（ワールドサイズ）
  const bgCache = new Map(); // sceneIdx -> offscreen canvas
  const imgCache = new Map(); // src -> HTMLImageElement

  const input = { up: false, down: false, left: false, right: false };
  let paused = false;
  let sceneIdx = 0;
  let activeSlot = 0;      // 今回す質問のスロット（0/1/2）。-1 は全完了
  let doneSlots = [];      // 完了済みスロット
  let player = { x: 120, y: 410, frame: 0, acc: 0, moving: false, dir: 1 };
  let camX = 0;
  let prompt = '';         // 画面下ヒント
  let raf = 0, last = 0;
  let ready = false;
  let hudTick = 0;

  async function ensureScene(i) {
    const s = SCENES[i];
    if (!imgCache.has('__player')) {
      const frames = await Promise.all(PLAYER_FILES.map(loadImage));
      imgCache.set('__player', frames);
    }
    if (s.npc && !imgCache.has(s.npc)) imgCache.set(s.npc, await loadImage(s.npc));
    if (!bgCache.has(i)) {
      const bg = await loadImage(s.bg);
      const off = document.createElement('canvas');
      off.width = WORLD_W; off.height = VIEW_H;
      const c = off.getContext('2d');
      c.imageSmoothingEnabled = false;
      // 1983x793 のパノラマをワールド全幅にカバー描画（上下中央クロップ）
      if (bg) {
        const scale = Math.max(WORLD_W / bg.width, VIEW_H / bg.height);
        const dw = bg.width * scale, dh = bg.height * scale;
        c.drawImage(bg, (WORLD_W - dw) / 2, (VIEW_H - dh) / 2 - 40, dw, dh);
      } else {
        c.fillStyle = '#1a1518'; c.fillRect(0, 0, WORLD_W, VIEW_H);
      }
      // 地面ラインを暗く締める（歩行バンドの視認性）
      const g = c.createLinearGradient(0, GROUND_TOP - 60, 0, VIEW_H);
      g.addColorStop(0, 'rgba(9,8,10,0)');
      g.addColorStop(1, 'rgba(9,8,10,0.55)');
      c.fillStyle = g; c.fillRect(0, 0, WORLD_W, VIEW_H);
      bgCache.set(i, off);
    }
    ready = true;
  }

  function markers() {
    // [{x, y, slot, done, active}]
    return MARK_SLOTS.map((x, slot) => ({
      x, y: 400, slot,
      done: doneSlots.includes(slot),
      active: slot === activeSlot,
    }));
  }

  function nearestActive() {
    const ms = markers().filter(m => m.active);
    if (!ms.length) return null;
    const m = ms[0];
    const dx = player.x - m.x, dy = player.y - m.y;
    return Math.hypot(dx, dy) < 68 ? m : null;
  }

  function tryInteract() {
    if (paused) return;
    const m = nearestActive();
    if (m) onInteract(sceneIdx * 3 + m.slot);
  }

  function goScene(i, slot, done) {
    const changed = i !== sceneIdx || !ready;
    sceneIdx = i; activeSlot = slot; doneSlots = [...done];
    if (changed) { player.x = 120; player.y = 410; camX = 0; }
    ensureScene(i);
  }

  function setPaused(b) { paused = b; }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    if (!ready) {
      ctx.fillStyle = '#120f12'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = '#f08b51'; ctx.font = '24px monospace';
      ctx.fillText('LOADING...', 400, 280);
      return;
    }
    // 移動
    let vx = 0, vy = 0;
    if (!paused) {
      if (input.left) vx -= 1;
      if (input.right) vx += 1;
      if (input.up) vy -= 1;
      if (input.down) vy += 1;
    }
    const moving = vx !== 0 || vy !== 0;
    player.moving = moving;
    if (moving) {
      const len = Math.hypot(vx, vy);
      const spd = 210; // px/s（ワールド座標）
      player.x = Math.max(32, Math.min(WORLD_W - 32, player.x + (vx / len) * spd * dt));
      player.y = Math.max(GROUND_TOP, Math.min(GROUND_BOTTOM, player.y + (vy / len) * spd * dt));
      if (vx !== 0) player.dir = vx > 0 ? 1 : -1;
      player.acc += dt;
      if (player.acc > 0.14) { player.acc = 0; player.frame = (player.frame + 1) % 6; }
    }
    // カメラ追従
    const target = Math.max(0, Math.min(WORLD_W - VIEW_W, player.x - VIEW_W / 2));
    camX += (target - camX) * Math.min(1, dt * 6);

    // 描画
    const bg = bgCache.get(sceneIdx);
    ctx.fillStyle = '#120f12'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (bg) ctx.drawImage(bg, Math.round(camX), 0, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

    const ms = markers();
    const near = nearestActive();
    prompt = near ? (opts.lang === 'en' ? 'Talk with T / E' : 'T / E で話す')
      : (activeSlot >= 0 ? (opts.lang === 'en' ? 'Walk to ◆ (WASD / arrows)' : '◆ を目指して歩こう（WASD / 十字キー）') : '');

    // NPCのHUD通知（吹き出し配置・話しかけ可否用。5フレームに1回）
    {
      const sc0 = SCENES[sceneIdx];
      const actM = ms.find(m => m.active);
      const hud = { has: !!(sc0.npc && actM), near: false, fx: 0.5, fy: 0.4 };
      if (hud.has) {
        const nx = actM.x + 68, ny = actM.y;
        hud.near = Math.hypot(player.x - nx, player.y - ny) < 104;
        hud.fx = (nx - camX) / VIEW_W;
        hud.fy = (ny - 128) / VIEW_H;
      }
      if ((hudTick = (hudTick + 1) % 5) === 0) onHud(hud);
    }

    // マーカー（光る菱形）
    const pulse = 0.55 + 0.45 * Math.sin(t / 280);
    for (const m of ms) {
      const sx = Math.round(m.x - camX), sy = Math.round(m.y - 112);
      if (sx < -40 || sx > VIEW_W + 40) continue;
      if (m.done) {
        ctx.fillStyle = 'rgba(200,150,110,0.35)';
      } else if (m.active) {
        ctx.fillStyle = `rgba(240,139,81,${0.65 + 0.35 * pulse})`;
      } else continue;
      const r = m.active ? 14 + 4 * pulse : 10;
      ctx.beginPath();
      ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r * 0.7, sy);
      ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r * 0.7, sy);
      ctx.closePath(); ctx.fill();
      if (m.active) {
        // 足元の影＋光柱
        ctx.fillStyle = `rgba(240,139,81,${0.10 + 0.08 * pulse})`;
        ctx.fillRect(sx - 16, sy + r, 32, 88);
      }
    }

    // NPC（アクティブマーカーの隣）
    const sc = SCENES[sceneIdx];
    const npcImg = sc.npc ? imgCache.get(sc.npc) : null;
    for (const m of ms) {
      if (!m.active || !npcImg) continue;
      const sx = Math.round(m.x + 68 - camX);
      const sy = Math.round(m.y);
      const nw = 60, nh = Math.round(60 * (npcImg.height / npcImg.width));
      // 簡易ソート：NPCを先に描く
      ctx.drawImage(npcImg, sx - nw / 2, sy - nh, nw, nh);
    }

    // プレイヤー（トワ）
    const frames = imgCache.get('__player') || [];
    const spr = frames[player.moving ? player.frame : 0] || frames[0];
    const px = Math.round(player.x - camX), py = Math.round(player.y);
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(px, py + 4, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
    if (spr) {
      ctx.save();
      if (player.dir < 0) { ctx.translate(px, 0); ctx.scale(-1, 1); ctx.drawImage(spr, -PLAYER_W / 2, py - PLAYER_H, PLAYER_W, PLAYER_H); }
      else ctx.drawImage(spr, px - PLAYER_W / 2, py - PLAYER_H, PLAYER_W, PLAYER_H);
      ctx.restore();
    } else {
      ctx.fillStyle = '#f08b51'; ctx.fillRect(px - 16, py - 80, 32, 80);
    }

    // HUDヒント
    if (prompt && !paused) {
      ctx.font = '22px "DotGothic16", monospace';
      const w = ctx.measureText(prompt).width;
      ctx.fillStyle = 'rgba(10,8,10,0.72)';
      ctx.fillRect(VIEW_W / 2 - w / 2 - 16, VIEW_H - 52, w + 32, 36);
      ctx.fillStyle = '#f8d3a6';
      ctx.fillText(prompt, VIEW_W / 2 - w / 2, VIEW_H - 26);
    }
  }

  function onKey(e, down) {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'w', 'つ'].includes(k)) input.up = down;
    else if (['arrowdown', 's', 'し'].includes(k)) input.down = down;
    else if (['arrowleft', 'a', 'ち'].includes(k)) input.left = down;
    else if (['arrowright', 'd', 'り'].includes(k)) input.right = down;
    else if (down && ['e', ' ', 'enter', 'z'].includes(k === ' ' ? ' ' : k)) tryInteract();
    else if (down && k === 't') onTalkNpc();
    if (down && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  }
  const kd = e => onKey(e, true), ku = e => onKey(e, false);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);

  // タップ＝その場で話す or その方向へ少し歩く
  function onTap(e) {
    const r = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) / r.width * VIEW_W;
    if (paused) return;
    if (nearestActive()) { tryInteract(); return; }
    // タップ方向へ自動で少し移動（短距離ステップ）
    const wx = camX + cx;
    player.dir = wx > player.x ? 1 : -1;
    player.x = Math.max(32, Math.min(WORLD_W - 32, wx));
  }
  canvas.addEventListener('pointerdown', onTap);

  ensureScene(0);
  last = performance.now();
  raf = requestAnimationFrame(frame);

  return {
    goScene, setPaused, tryInteract, sceneOf, slotOf,
    setInput(name, v) { if (name in input) input[name] = v; },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    },
  };
}
