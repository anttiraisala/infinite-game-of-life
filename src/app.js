(function () {
'use strict';
document.documentElement.lang = 'en';
const L = window.LifeEngine, PATTERNS = window.LifePatterns.PATTERNS;
const { Universe, Timeline, CycleDetector, parseRLE, cellsToRLE, parseRule, POP, chunkKey } = L;

const U = new Universe('B3/S23');
const TL = new Timeline(U, { interval: 10, max: 300 });
const CD = new CycleDetector(U);

const $ = id => document.getElementById(id);
const cvs = $('cv'), ctx = cvs.getContext('2d');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => Number(n).toLocaleString('en-US');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
};

// ---------- tila ----------
const SPEEDS = [1, 2, 4, 8, 15, 30, 60, 'turbo'];
const S = {
  running: false, speedIdx: 4, jobLeft: 0, jobTotal: 0,
  tool: 'stamp', orient: 0, showChunks: false, showGrid: true,
  gap: 2, density: 0.35, radius: 6, eraseR: 4,
  mouse: null, sel: null, dup: false, brush: null, space: false, dirty: true
};
const cam = { x: 0, y: 0, s: 14 };
let W = 1, H = 1, dpr = 1;
const col = {};

// ---------- toast ja modal ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}
function openModal(title, body, buttons) {
  $('mTitle').textContent = title;
  $('mBody').replaceChildren(body);
  const foot = $('mFoot'); foot.replaceChildren();
  buttons.forEach(b => {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = b.label; if (b.primary) el.className = 'primary';
    el.addEventListener('click', () => { if (b.onClick() !== false) closeModal(); });
    foot.appendChild(el);
  });
  $('modal').hidden = false;
  const first = $('mBody').querySelector('textarea,input'); if (first) first.focus();
}
function closeModal() { $('modal').hidden = true; }
$('modal').addEventListener('pointerdown', e => { if (e.target === $('modal')) closeModal(); });

// ---------- värit ----------
function refreshColors() {
  const cs = getComputedStyle(document.documentElement);
  ['canvas', 'cell', 'grid', 'chunkline', 'chunkfill', 'activefill', 'accent', 'ghost'].forEach(k => { col[k] = cs.getPropertyValue('--' + k).trim(); });
  S.dirty = true; redrawThumbs();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshColors);
new MutationObserver(refreshColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ---------- sivellinmuunnokset ----------
function transform(cells, o) {
  const rot = o & 3, flip = o >> 2;
  const out = new Array(cells.length);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < cells.length; i += 2) {
    let x = cells[i], y = cells[i + 1];
    if (flip) x = -x;
    for (let k = 0; k < rot; k++) { const t = x; x = -y; y = t; }
    out[i] = x; out[i + 1] = y;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  for (let i = 0; i < out.length; i += 2) { out[i] -= minX; out[i + 1] -= minY; }
  return { cells: out, w: maxX - minX + 1, h: maxY - minY + 1 };
}
const viewCache = new Map();
function brushView(b, o) {
  const key = b.id + ':' + o;
  let v = viewCache.get(key);
  if (!v) { v = transform(b.cells, o); viewCache.set(key, v); }
  return v;
}

let brushSeq = 0;
function makeBrush(name, p, extra) {
  return Object.assign({ id: ++brushSeq, name, cells: p.cells, w: p.w, h: p.h }, extra || {});
}
const libBrushes = PATTERNS.map(p => makeBrush(p.name, parseRLE(p.rle), { cat: p.cat, info: p.info || '' }));
let customBrushes = [];
function loadCustom() {
  try {
    const arr = JSON.parse(store.get('life.custom') || '[]');
    customBrushes = arr.map(o => makeBrush(o.name, parseRLE(o.rle), { cat: 'Custom', custom: true, rle: o.rle, info: 'Custom brush' }));
  } catch (e) { customBrushes = []; }
}
function saveCustom() {
  const ok = store.set('life.custom', JSON.stringify(customBrushes.map(b => ({ name: b.name, rle: b.rle }))));
  if (!ok) toast('The browser blocks saving; the brush will only last for this session.');
}
loadCustom();
S.brush = libBrushes.find(b => b.name === 'Glider');

// ---------- paletti ----------
const thumbs = [];
function drawThumb(cv, b) {
  const c = cv.getContext('2d'), n = cv.width;
  c.clearRect(0, 0, n, n);
  const px = Math.max(1, Math.min(Math.floor((n - 8) / b.w), Math.floor((n - 8) / b.h), 10));
  const ox = Math.floor((n - b.w * px) / 2), oy = Math.floor((n - b.h * px) / 2);
  c.fillStyle = col.cell;
  for (let i = 0; i < b.cells.length; i += 2) c.fillRect(ox + b.cells[i] * px, oy + b.cells[i + 1] * px, px, px);
}
function redrawThumbs() { thumbs.forEach(t => drawThumb(t.cv, t.b)); }

function buildPalette() {
  const root = $('palette'); root.replaceChildren(); thumbs.length = 0;
  const cats = [];
  libBrushes.concat(customBrushes).forEach(b => { if (!cats.includes(b.cat)) cats.push(b.cat); });
  if (!cats.includes('Custom')) cats.push('Custom');
  cats.forEach(cat => {
    const list = libBrushes.concat(customBrushes).filter(b => b.cat === cat);
    const sec = document.createElement('section');
    const h = document.createElement('h3'); h.textContent = cat; sec.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'cards';
    if (!list.length) {
      const p = document.createElement('p'); p.className = 'hint';
      p.textContent = 'Select an area with the Select tool and save it here, or import an RLE file.';
      sec.appendChild(p);
    }
    list.forEach(b => {
      const card = document.createElement('div'); card.className = 'card-wrap';
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'card';
      btn.title = b.name + (b.info ? ' · ' + b.info : '') + ' · ' + b.w + '×' + b.h;
      btn.dataset.id = b.id;
      const cv = document.createElement('canvas'); cv.width = 96; cv.height = 96;
      const nm = document.createElement('span'); nm.textContent = b.name;
      btn.append(cv, nm);
      btn.addEventListener('click', () => selectBrush(b));
      card.appendChild(btn);
      if (b.custom) {
        const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = '×';
        del.setAttribute('aria-label', 'Delete brush ' + b.name);
        del.addEventListener('click', () => {
          customBrushes = customBrushes.filter(x => x !== b); saveCustom();
          if (S.brush === b) S.brush = libBrushes[0];
          buildPalette(); toast('Brush deleted');
        });
        card.appendChild(del);
      }
      grid.appendChild(card);
      thumbs.push({ cv, b });
    });
    sec.appendChild(grid); root.appendChild(sec);
  });
  redrawThumbs(); markSelectedBrush();
}
function markSelectedBrush() {
  document.querySelectorAll('#palette .card').forEach(el => el.setAttribute('aria-pressed', String(+el.dataset.id === S.brush.id)));
  $('brushName').textContent = S.brush.name + ' · ' + brushView(S.brush, S.orient).w + '×' + brushView(S.brush, S.orient).h;
}
function selectBrush(b) {
  S.brush = b;
  if (S.tool !== 'line') setTool('stamp');
  markSelectedBrush(); S.dirty = true;
  if (matchMedia('(max-width: 820px)').matches) $('side').classList.remove('open');
}
function rotateBrush(d) {
  const rot = S.orient & 3, f = S.orient >> 2;
  S.orient = f * 4 + ((rot + d) & 3);
  markSelectedBrush(); S.dirty = true;
}
function flipBrush() {
  const rot = S.orient & 3, f = S.orient >> 2;
  S.orient = (1 - f) * 4 + ((4 - rot) & 3);
  markSelectedBrush(); S.dirty = true;
}

// ---------- työkalut ----------
const TOOLS = { draw: 'P', stamp: 'B', line: 'L', rand: 'N', erase: 'E', select: 'S', pan: 'H' };
function setTool(t) {
  S.tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  ['line', 'rand', 'erase'].forEach(k => { $('opt-' + k).hidden = (k !== t); });
  $('brushRow').hidden = !(t === 'stamp' || t === 'line');
  cvs.style.cursor = t === 'pan' ? 'grab' : 'crosshair';
  S.dirty = true;
}
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

// ---------- muokkaukset ----------
let editing = false;
function beginEdit() { if (editing) return; editing = true; TL.beforeEdit(); }
function endEdit() { if (!editing) return; editing = false; TL.afterEdit(); CD.reset(); S.dirty = true; updateStatus(true); }
function edit(fn) { beginEdit(); fn(); endEdit(); }

function stampView(v, cx, cy) {
  const ox = cx - Math.floor(v.w / 2), oy = cy - Math.floor(v.h / 2);
  for (let i = 0; i < v.cells.length; i += 2) U.setCell(ox + v.cells[i], oy + v.cells[i + 1], true);
}
function linePositions(a, b) {
  const v = brushView(S.brush, S.orient);
  const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
  const spacing = (Math.abs(dx) >= Math.abs(dy) ? v.w : v.h) + S.gap;
  const out = [{ x: a.x, y: a.y }];
  if (dist > 0) {
    const n = Math.floor(dist / spacing);
    for (let i = 1; i <= n; i++) out.push({ x: Math.round(a.x + dx / dist * spacing * i), y: Math.round(a.y + dy / dist * spacing * i) });
  }
  return out;
}
function bresenham(a, b, fn) {
  let x = a.x, y = a.y; const dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y), sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    fn(x, y);
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function randomDisc(c) {
  const r = S.radius;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) U.setCell(c.x + x, c.y + y, Math.random() < S.density);
}
function eraseDisc(c) {
  const r = S.eraseR, cells = U.cellsInRect(c.x - r, c.y - r, c.x + r, c.y + r);
  for (let i = 0; i < cells.length; i += 2) {
    const dx = cells[i] - c.x, dy = cells[i + 1] - c.y;
    if (dx * dx + dy * dy <= r * r + r) U.setCell(cells[i], cells[i + 1], false);
  }
}

// ---------- kamera ----------
const s2w = (sx, sy) => ({ x: cam.x + (sx - W / 2) / cam.s, y: cam.y + (sy - H / 2) / cam.s });
const cellAt = p => { const w = s2w(p.x, p.y); return { x: Math.floor(w.x), y: Math.floor(w.y) }; };
function zoomAt(f, sx, sy) {
  const before = s2w(sx, sy);
  cam.s = clamp(cam.s * f, 0.02, 48);
  cam.x = before.x - (sx - W / 2) / cam.s; cam.y = before.y - (sy - H / 2) / cam.s;
  S.dirty = true;
}
function fitView() {
  const b = U.bounds();
  if (!b) { cam.x = 0; cam.y = 0; cam.s = 14; S.dirty = true; return; }
  const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
  cam.s = clamp(Math.min(W / (w * 1.25), H / (h * 1.25)), 0.02, 24);
  cam.x = (b.minX + b.maxX + 1) / 2; cam.y = (b.minY + b.maxY + 1) / 2; S.dirty = true;
}

// ---------- selection move ----------
const inSel = c => S.sel && c.x >= S.sel.x0 && c.x <= S.sel.x1 && c.y >= S.sel.y0 && c.y <= S.sel.y1;
// Dragging inside the selection lifts its cells off the board (move) or leaves them (copy);
// the drop is a single edit, so Undo/Redo treat the whole move as one step.
function startMove(c, e) {
  const r = { x0: S.sel.x0, y0: S.sel.y0, x1: S.sel.x1, y1: S.sel.y1 };
  const copy = S.dup || e.ctrlKey || e.altKey, cells = U.cellsInRect(r.x0, r.y0, r.x1, r.y1);
  G = { type: 'move', a: c, dx: 0, dy: 0, cells, copy, lifted: false, rect: r };
  if (cells.length && !copy) { beginEdit(); U.clearRect(r.x0, r.y0, r.x1, r.y1); G.lifted = true; }
  cvs.style.cursor = 'move';
}
function finishMove(g, cancel) {
  const dx = cancel ? 0 : g.dx, dy = cancel ? 0 : g.dy, r = g.rect;
  if (g.lifted) { U.pasteCells(g.cells, r, dx, dy); endEdit(); }
  else if (g.copy && g.cells.length && (dx || dy)) edit(() => U.pasteCells(g.cells, r, dx, dy));
  if (dx || dy) {
    S.sel = { x0: r.x0 + dx, y0: r.y0 + dy, x1: r.x1 + dx, y1: r.y1 + dy };
    toast(g.copy ? 'Copied selection' : 'Moved selection');
  }
  S.dirty = true;
}

// ---------- osoitin ----------
const pointers = new Map();
let G = null, pinch = null;
const posOf = e => { const r = cvs.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

cvs.addEventListener('contextmenu', e => e.preventDefault());
cvs.addEventListener('pointerdown', e => {
  cvs.setPointerCapture(e.pointerId);
  const p = posOf(e); pointers.set(e.pointerId, p);
  if (pointers.size === 2) {
    endGesture(); const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, w = s2w(mid.x, mid.y);
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: cam.s, wx: w.x, wy: w.y };
    return;
  }
  if (pointers.size > 2) return;
  if (e.button === 1 || e.button === 2 || S.tool === 'pan' || S.space) {
    G = { type: 'pan', sx: p.x, sy: p.y, cx: cam.x, cy: cam.y }; cvs.style.cursor = 'grabbing'; return;
  }
  const c = cellAt(p);
  switch (S.tool) {
    case 'draw': {
      beginEdit();
      const mode = !U.getCell(c.x, c.y);
      U.setCell(c.x, c.y, mode);
      G = { type: 'draw', mode, last: c }; break;
    }
    case 'stamp': edit(() => stampView(brushView(S.brush, S.orient), c.x, c.y)); break;
    case 'line': G = { type: 'line', a: c, b: c }; break;
    case 'rand': beginEdit(); randomDisc(c); G = { type: 'rand', last: c }; break;
    case 'erase': beginEdit(); eraseDisc(c); G = { type: 'erase', last: c }; break;
    case 'select':
      if (S.sel && inSel(c)) startMove(c, e);
      else { G = { type: 'select', a: c, b: c }; S.sel = null; $('selbar').hidden = true; }
      break;
  }
  S.dirty = true;
});
cvs.addEventListener('pointermove', e => {
  const p = posOf(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
  S.mouse = p; S.dirty = true;
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    cam.s = clamp(pinch.s0 * d / pinch.d0, 0.02, 48);
    cam.x = pinch.wx - (mid.x - W / 2) / cam.s; cam.y = pinch.wy - (mid.y - H / 2) / cam.s;
    return;
  }
  if (!G) { if (S.tool === 'select' && !S.space) cvs.style.cursor = S.sel && inSel(cellAt(p)) ? 'move' : 'crosshair'; return; }
  const c = cellAt(p);
  if (G.type === 'move') { G.dx = c.x - G.a.x; G.dy = c.y - G.a.y; }
  else if (G.type === 'pan') { cam.x = G.cx - (p.x - G.sx) / cam.s; cam.y = G.cy - (p.y - G.sy) / cam.s; }
  else if (G.type === 'draw') { bresenham(G.last, c, (x, y) => U.setCell(x, y, G.mode)); G.last = c; }
  else if (G.type === 'line' || G.type === 'select') G.b = c;
  else if (G.type === 'rand') { if (Math.hypot(c.x - G.last.x, c.y - G.last.y) >= Math.max(1, S.radius / 2)) { randomDisc(c); G.last = c; } }
  else if (G.type === 'erase') { bresenham(G.last, c, (x, y) => eraseDisc({ x, y })); G.last = c; }
});
function endGesture() {
  if (!G) return;
  const g = G; G = null;
  if (g.type === 'pan') cvs.style.cursor = S.tool === 'pan' ? 'grab' : 'crosshair';
  else if (g.type === 'move') finishMove(g, false);
  else if (g.type === 'line') edit(() => { const v = brushView(S.brush, S.orient); linePositions(g.a, g.b).forEach(q => stampView(v, q.x, q.y)); });
  else if (g.type === 'select') {
    S.sel = { x0: Math.min(g.a.x, g.b.x), y0: Math.min(g.a.y, g.b.y), x1: Math.max(g.a.x, g.b.x), y1: Math.max(g.a.y, g.b.y) };
    $('selbar').hidden = false;
    $('selInfo').textContent = (S.sel.x1 - S.sel.x0 + 1) + '×' + (S.sel.y1 - S.sel.y0 + 1);
  } else endEdit();
  S.dirty = true;
}
function pointerEnd(e) {
  pointers.delete(e.pointerId);
  if (pinch) { pinch = null; G = null; return; }
  if (pointers.size === 0) endGesture();
}
cvs.addEventListener('pointerup', pointerEnd);
cvs.addEventListener('pointercancel', pointerEnd);
cvs.addEventListener('pointerleave', () => { if (!G) { S.mouse = null; S.dirty = true; } });
cvs.addEventListener('wheel', e => {
  e.preventDefault();
  const p = posOf(e), k = e.ctrlKey ? 0.01 : (e.deltaMode === 1 ? 0.05 : 0.0015);
  zoomAt(Math.exp(-e.deltaY * k), p.x, p.y);
}, { passive: false });

// ---------- piirto ----------
function forVisible(cx0, cy0, cx1, cy1, fn) { U.forChunksInRect(cx0, cy0, cx1, cy1, fn); }
function drawCellList(cells, ox, oy, color, minPx) {
  const s = cam.s, pad = s >= 8 ? 1 : 0, size = Math.max(minPx || 0, s - pad);
  ctx.fillStyle = color;
  for (let i = 0; i < cells.length; i += 2) ctx.fillRect(((ox + cells[i]) - cam.x) * s + W / 2, ((oy + cells[i + 1]) - cam.y) * s + H / 2, size, size);
}
function render() {
  S.dirty = false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = col.canvas; ctx.fillRect(0, 0, W, H);
  const s = cam.s;
  const x0 = cam.x - W / 2 / s, x1 = cam.x + W / 2 / s, y0 = cam.y - H / 2 / s, y1 = cam.y + H / 2 / s;
  const cx0 = Math.floor(x0 / 16), cx1 = Math.floor(x1 / 16), cy0 = Math.floor(y0 / 16), cy1 = Math.floor(y1 / 16);

  if (S.showGrid && s >= 6) {
    ctx.beginPath(); ctx.strokeStyle = col.grid; ctx.lineWidth = 1;
    for (let x = Math.ceil(x0); x <= x1; x++) { const sx = Math.round((x - cam.x) * s + W / 2) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, H); }
    for (let y = Math.ceil(y0); y <= y1; y++) { const sy = Math.round((y - cam.y) * s + H / 2) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(W, sy); }
    ctx.stroke();
  }
  if (S.showChunks) {
    const csz = 16 * s;
    forVisible(cx0, cy0, cx1, cy1, (cx, cy) => {
      ctx.fillStyle = U.changed.has(chunkKey(cx, cy)) ? col.activefill : col.chunkfill;
      ctx.fillRect((cx * 16 - cam.x) * s + W / 2, (cy * 16 - cam.y) * s + H / 2, Math.max(csz, 1), Math.max(csz, 1));
    });
    if (csz >= 6 && cx1 - cx0 < 300 && cy1 - cy0 < 300) {
      ctx.beginPath(); ctx.strokeStyle = col.chunkline; ctx.lineWidth = 1;
      for (let cx = cx0; cx <= cx1 + 1; cx++) { const sx = Math.round((cx * 16 - cam.x) * s + W / 2) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, H); }
      for (let cy = cy0; cy <= cy1 + 1; cy++) { const sy = Math.round((cy * 16 - cam.y) * s + H / 2) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(W, sy); }
      ctx.stroke();
    }
  }
  // solut
  if (s >= 1) {
    const pad = s >= 8 ? 1 : 0, size = s - pad;
    ctx.fillStyle = col.cell;
    forVisible(cx0, cy0, cx1, cy1, (cx, cy, rows) => {
      const bx = cx * 16, by = cy * 16;
      for (let r = 0; r < 16; r++) {
        let b = rows[r]; if (!b) continue;
        const sy = (by + r - cam.y) * s + H / 2;
        if (sy < -s || sy > H) continue;
        let x = 0;
        while (b) {
          const tz = 31 - Math.clz32(b & -b); b >>>= tz; x += tz;
          const inv = ~b, run = 31 - Math.clz32(inv & -inv);
          ctx.fillRect((bx + x - cam.x) * s + W / 2, sy, run * s - pad, size);
          b >>>= run; x += run;
        }
      }
    });
  } else {
    const csz = Math.max(1, 16 * s);
    ctx.fillStyle = col.cell;
    forVisible(cx0, cy0, cx1, cy1, (cx, cy, rows) => {
      let pop = 0; for (let r = 0; r < 16; r++) pop += POP[rows[r]];
      ctx.globalAlpha = Math.min(1, 0.3 + pop / 64);
      ctx.fillRect((cx * 16 - cam.x) * s + W / 2, (cy * 16 - cam.y) * s + H / 2, csz, csz);
    });
    ctx.globalAlpha = 1;
  }
  // haamut ja esikatselut
  const m = S.mouse && !pointers.has(-1) ? cellAt(S.mouse) : null;
  if ((S.tool === 'stamp' || S.tool === 'line') && !G && m && pointers.size < 2) {
    const v = brushView(S.brush, S.orient);
    drawCellList(v.cells, m.x - Math.floor(v.w / 2), m.y - Math.floor(v.h / 2), col.ghost, 2);
  }
  if (G && G.type === 'line') {
    const v = brushView(S.brush, S.orient);
    ctx.strokeStyle = col.ghost; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath();
    ctx.moveTo((G.a.x + 0.5 - cam.x) * s + W / 2, (G.a.y + 0.5 - cam.y) * s + H / 2);
    ctx.lineTo((G.b.x + 0.5 - cam.x) * s + W / 2, (G.b.y + 0.5 - cam.y) * s + H / 2); ctx.stroke(); ctx.setLineDash([]);
    linePositions(G.a, G.b).forEach(q => drawCellList(v.cells, q.x - Math.floor(v.w / 2), q.y - Math.floor(v.h / 2), col.ghost, 2));
  }
  if ((S.tool === 'rand' || S.tool === 'erase') && m) {
    const r = S.tool === 'rand' ? S.radius : S.eraseR;
    ctx.strokeStyle = col.ghost; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.arc((m.x + 0.5 - cam.x) * s + W / 2, (m.y + 0.5 - cam.y) * s + H / 2, Math.sqrt(r * r + r + 0.5) * s, 0, Math.PI * 2); ctx.stroke();
  }
  if (S.tool === 'draw' && m && !G) { ctx.fillStyle = col.ghost; ctx.fillRect((m.x - cam.x) * s + W / 2, (m.y - cam.y) * s + H / 2, Math.max(2, s), Math.max(2, s)); }
  // valinta
  let sel = G && G.type === 'select' ? { x0: Math.min(G.a.x, G.b.x), y0: Math.min(G.a.y, G.b.y), x1: Math.max(G.a.x, G.b.x), y1: Math.max(G.a.y, G.b.y) } : S.sel;
  if (G && G.type === 'move') {
    const r = G.rect; sel = { x0: r.x0 + G.dx, y0: r.y0 + G.dy, x1: r.x1 + G.dx, y1: r.y1 + G.dy };
    ctx.fillStyle = col.canvas; ctx.fillRect((sel.x0 - cam.x) * s + W / 2, (sel.y0 - cam.y) * s + H / 2, (sel.x1 - sel.x0 + 1) * s, (sel.y1 - sel.y0 + 1) * s);
    drawCellList(G.cells, G.dx, G.dy, col.cell, 1);
  }
  if (sel) {
    const rx = (sel.x0 - cam.x) * s + W / 2, ry = (sel.y0 - cam.y) * s + H / 2, rw = (sel.x1 - sel.x0 + 1) * s, rh = (sel.y1 - sel.y0 + 1) * s;
    ctx.globalAlpha = 0.1; ctx.fillStyle = col.accent; ctx.fillRect(rx, ry, rw, rh); ctx.globalAlpha = 1;
    ctx.strokeStyle = col.accent; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh); ctx.setLineDash([]);
  }
}

// ---------- ohjaus ----------
function setRunning(v) {
  S.running = v;
  $('bPlay').textContent = v ? 'Pause' : 'Start';
  $('bPlay').setAttribute('aria-pressed', String(v));
}
function stepOnce() {
  U.step(); TL.tick();
  const st = CD.observe();
  if (st && (st.type === 'still' || st.type === 'dead')) { setRunning(false); cancelJob(); }
}
function togglePlay() {
  if (S.running) { setRunning(false); return; }
  if (CD.status && (CD.status.type === 'still' || CD.status.type === 'dead')) { toast(CD.status.type === 'dead' ? 'All cells are dead. Draw something new.' : 'The pattern has stopped and no longer changes.'); return; }
  cancelJob(); setRunning(true);
}
function doStep() { setRunning(false); cancelJob(); stepOnce(); S.dirty = true; }
function doRewind(n) {
  setRunning(false); cancelJob();
  if (!TL.canRewind()) { toast('Cannot go back: no saved state.'); return; }
  if (!TL.rewind(n)) { toast('Cannot go back any further.'); return; }
  CD.reset(); S.dirty = true; updateStatus(true);
}
function doUndo() {
  if (G) return;
  setRunning(false); cancelJob();
  if (TL.undo()) { CD.reset(); S.dirty = true; updateStatus(true); toast('Edit undone'); } else toast('Nothing to undo');
}
function doRedo() {
  if (G) return;
  setRunning(false); cancelJob();
  if (TL.redo()) { CD.reset(); S.dirty = true; updateStatus(true); toast('Edit redone'); } else toast('Nothing to redo');
}
function cancelJob() { S.jobLeft = 0; S.jobTotal = 0; S.resumeAfterJob = false; }
function finishJob(resume) {
  const again = S.resumeAfterJob;
  cancelJob();
  if (resume && again) setRunning(true);
}
function startJump() {
  if (S.jobLeft > 0) { finishJob(true); return; }
  const n = clamp(parseInt($('jumpN').value, 10) || 0, 1, 1e7);
  S.resumeAfterJob = S.running;
  setRunning(false); S.jobLeft = n; S.jobTotal = n;
}
$('bPlay').addEventListener('click', togglePlay);
$('bStep').addEventListener('click', doStep);
$('bBack1').addEventListener('click', () => doRewind(1));
$('bBack10').addEventListener('click', () => doRewind(10));
$('bJump').addEventListener('click', startJump);
$('bUndo').addEventListener('click', doUndo);
$('bRedo').addEventListener('click', doRedo);
$('selDup').addEventListener('click', e => { S.dup = !S.dup; e.currentTarget.setAttribute('aria-pressed', String(S.dup)); });
$('speed').addEventListener('input', e => { S.speedIdx = +e.target.value; updateSpeedLabel(); });
function updateSpeedLabel() { const v = SPEEDS[S.speedIdx]; $('speedOut').textContent = v === 'turbo' ? 'Max' : v + ' gen/s'; }
$('bZoomIn').addEventListener('click', () => zoomAt(1.5, W / 2, H / 2));
$('bZoomOut').addEventListener('click', () => zoomAt(1 / 1.5, W / 2, H / 2));
$('bFit').addEventListener('click', fitView);
$('bHome').addEventListener('click', () => { cam.x = 0; cam.y = 0; S.dirty = true; });
$('bGrid').addEventListener('click', e => { S.showGrid = !S.showGrid; e.currentTarget.setAttribute('aria-pressed', String(S.showGrid)); S.dirty = true; });
$('bChunks').addEventListener('click', e => { S.showChunks = !S.showChunks; e.currentTarget.setAttribute('aria-pressed', String(S.showChunks)); S.dirty = true; });
$('bRotR').addEventListener('click', () => rotateBrush(1));
$('bRotL').addEventListener('click', () => rotateBrush(3));
$('bRot180').addEventListener('click', () => rotateBrush(2));
$('bFlip').addEventListener('click', flipBrush);
$('bPanel').addEventListener('click', () => $('side').classList.toggle('open'));
$('gap').addEventListener('input', e => { S.gap = +e.target.value; $('gapOut').textContent = S.gap; S.dirty = true; });
$('dens').addEventListener('input', e => { S.density = +e.target.value / 100; $('densOut').textContent = e.target.value + ' %'; });
$('rad').addEventListener('input', e => { S.radius = +e.target.value; $('radOut').textContent = S.radius; S.dirty = true; });
$('eraseR').addEventListener('input', e => { S.eraseR = +e.target.value; $('eraseOut').textContent = S.eraseR; S.dirty = true; });

// sääntö
function applyRule(str) {
  const r = parseRule(str);
  if (!r || (r.b & 1)) { toast('Invalid rule. Use the form B3/S23 (B0 is not allowed).'); return false; }
  edit(() => U.setRule(r.name));
  const opt = [...$('rule').options].find(o => o.value === r.name);
  $('rule').value = opt ? r.name : 'custom';
  $('ruleIn').hidden = !!opt; if (!opt) $('ruleIn').value = r.name;
  toast('Rule: ' + r.name); return true;
}
$('rule').addEventListener('change', e => {
  if (e.target.value === 'custom') { $('ruleIn').hidden = false; $('ruleIn').focus(); return; }
  $('ruleIn').hidden = true; applyRule(e.target.value);
});
$('ruleIn').addEventListener('keydown', e => { if (e.key === 'Enter') applyRule(e.target.value); });
$('ruleIn').addEventListener('change', e => applyRule(e.target.value));

// tyhjennys
$('bClear').addEventListener('click', () => { setRunning(false); cancelJob(); edit(() => U.clearCells()); toast('World cleared'); });

// valinnan toiminnot
function selCells() { return S.sel ? U.cellsInRect(S.sel.x0, S.sel.y0, S.sel.x1, S.sel.y1) : []; }
function normCells(cells) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < cells.length; i += 2) { minX = Math.min(minX, cells[i]); maxX = Math.max(maxX, cells[i]); minY = Math.min(minY, cells[i + 1]); maxY = Math.max(maxY, cells[i + 1]); }
  const out = cells.slice(); for (let i = 0; i < out.length; i += 2) { out[i] -= minX; out[i + 1] -= minY; }
  return { cells: out, w: maxX - minX + 1, h: maxY - minY + 1 };
}
function clearSelection() { S.sel = null; $('selbar').hidden = true; S.dirty = true; }
function copySel(thenDelete) {
  const c = selCells(); if (!c.length) { toast('The selection has no cells'); return false; }
  const p = normCells(c); S.brush = makeBrush('Copy', p, { cat: 'Copy' }); S.orient = 0;
  if (thenDelete) edit(() => U.clearRect(S.sel.x0, S.sel.y0, S.sel.x1, S.sel.y1));
  clearSelection(); setTool('stamp'); markSelectedBrush();
  toast((thenDelete ? 'Cut' : 'Copied') + ' to brush. Click the field to place it.'); return true;
}
$('selCopy').addEventListener('click', () => copySel(false));
$('selCut').addEventListener('click', () => copySel(true));
$('selDel').addEventListener('click', () => { if (S.sel) { edit(() => U.clearRect(S.sel.x0, S.sel.y0, S.sel.x1, S.sel.y1)); clearSelection(); } });
$('selClose').addEventListener('click', clearSelection);
$('selSave').addEventListener('click', () => {
  const c = selCells(); if (!c.length) { toast('The selection has no cells'); return; }
  const inp = document.createElement('input'); inp.type = 'text'; inp.id = 'brushNameIn'; inp.maxLength = 40; inp.placeholder = 'E.g. My gun';
  const lab = document.createElement('label'); lab.textContent = 'Brush name'; lab.htmlFor = 'brushNameIn';
  const wrap = document.createElement('div'); wrap.className = 'field'; wrap.append(lab, inp);
  const save = () => {
    const name = inp.value.trim() || 'My pattern ' + (customBrushes.length + 1);
    const p = normCells(c), rle = cellsToRLE(p.cells, U.ruleName, name);
    const b = makeBrush(name, p, { cat: 'Custom', custom: true, rle, info: 'Custom brush' });
    customBrushes.push(b); saveCustom(); buildPalette(); selectBrush(b); clearSelection(); toast('Saved: ' + name);
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { save(); closeModal(); } });
  openModal('Save as brush', wrap, [{ label: 'Save', primary: true, onClick: () => { save(); } }, { label: 'Cancel', onClick: () => true }]);
});

// RLE vienti ja tuonti
function copyText(ta) {
  const done = () => toast('Copied to clipboard');
  const fallback = () => { ta.focus(); ta.select(); toast('Select the text and copy it (Ctrl+C)'); };
  try { navigator.clipboard.writeText(ta.value).then(done, fallback); } catch (e) { fallback(); }
}
function exportRLE(cells, title) {
  const ta = document.createElement('textarea'); ta.id = 'rleOut'; ta.readOnly = true; ta.rows = 12;
  ta.value = cellsToRLE(cells, U.ruleName, title || 'Infinite Game of Life');
  const note = document.createElement('p'); note.className = 'hint';
  note.textContent = cells.length ? (fmt(cells.length / 2) + ' cells. Paste the text into another Life program or save it as an .rle file.') : 'No cells to export.';
  const wrap = document.createElement('div'); wrap.append(ta, note);
  openModal('Export as RLE', wrap, [{ label: 'Copy', primary: true, onClick: () => { copyText(ta); return false; } }, { label: 'Close', onClick: () => true }]);
}
$('bExport').addEventListener('click', () => exportRLE(U.allCells(), 'World'));
$('selExport').addEventListener('click', () => exportRLE(selCells(), 'Selection'));
$('bImport').addEventListener('click', () => {
  const ta = document.createElement('textarea'); ta.id = 'rleIn'; ta.rows = 10; ta.placeholder = 'Paste RLE here, e.g.\nx = 3, y = 3, rule = B3/S23\nbo$2bo$3o!';
  const file = document.createElement('input'); file.type = 'file'; file.id = 'rleFile'; file.accept = '.rle,.txt,text/plain';
  file.addEventListener('change', () => { const f = file.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { ta.value = String(r.result); }; r.readAsText(f); });
  const note = document.createElement('p'); note.className = 'hint'; note.textContent = 'Import the pattern as a brush or replace the whole world with it.';
  const lib = document.createElement('p'); lib.className = 'hint';
  lib.append('Browse libraries: ');
  [['LifeWiki patterns', 'https://conwaylife.com/patterns/'], ['Pattern library', 'https://conwaylife.appspot.com/library/']].forEach(([t, u], i) => {
    const l = document.createElement('a'); l.href = u; l.target = '_blank'; l.rel = 'noopener'; l.textContent = t;
    if (i) lib.append(' · '); lib.append(l);
  });
  lib.append('. Open a pattern page, copy its RLE text and paste it here.');
  const wrap = document.createElement('div'); wrap.append(ta, file, lib, note);
  const parse = () => {
    if (/^\s*https?:\/\//i.test(ta.value)) { toast('This page cannot fetch URLs itself. Open the link, copy the RLE text and paste it here.'); return null; }
    const p = parseRLE(ta.value); if (!p.cells.length) { toast('No cells found in the RLE'); return null; } return p; };
  openModal('Import RLE', wrap, [
    { label: 'Add as brush', primary: true, onClick: () => {
      const p = parse(); if (!p) return false;
      const name = p.name || 'Imported pattern ' + (customBrushes.length + 1);
      const rle = cellsToRLE(p.cells, p.rule || U.ruleName, name);
      const b = makeBrush(name, p, { cat: 'Custom', custom: true, rle, info: 'Imported' });
      customBrushes.push(b); saveCustom(); buildPalette(); selectBrush(b);
      if (p.rule && parseRule(p.rule) && parseRule(p.rule).name !== U.ruleName) toast('Note: this pattern was made for rule ' + p.rule);
    } },
    { label: 'Replace world', onClick: () => {
      const p = parse(); if (!p) return false;
      setRunning(false); cancelJob();
      edit(() => {
        U.clearCells();
        if (p.rule && parseRule(p.rule) && !(parseRule(p.rule).b & 1)) U.setRule(parseRule(p.rule).name);
        const ox = Math.round(-p.w / 2), oy = Math.round(-p.h / 2);
        for (let i = 0; i < p.cells.length; i += 2) U.setCell(p.cells[i] + ox, p.cells[i + 1] + oy, true);
      });
      const opt = [...$('rule').options].find(o => o.value === U.ruleName);
      $('rule').value = opt ? U.ruleName : 'custom'; $('ruleIn').hidden = !!opt; if (!opt) $('ruleIn').value = U.ruleName;
      fitView(); toast('World replaced: ' + fmt(U.population) + ' cells');
    } },
    { label: 'Cancel', onClick: () => true }
  ]);
});

// tallennus ja lataus selaimeen
$('bSave').addEventListener('click', () => {
  const cells = U.allCells();
  const data = JSON.stringify({ rle: cellsToRLE(cells, U.ruleName, 'Saved world'), gen: U.generation, rule: U.ruleName, cam: { x: cam.x, y: cam.y, s: cam.s } });
  toast(store.set('life.save', data) ? 'Saved in the browser: ' + fmt(cells.length / 2) + ' cells' : 'Saving failed. Use Export and copy the RLE.');
});
$('bLoad').addEventListener('click', () => {
  const raw = store.get('life.save'); if (!raw) { toast('No saved world found'); return; }
  try {
    const d = JSON.parse(raw), p = parseRLE(d.rle);
    setRunning(false); cancelJob();
    edit(() => {
      U.clearCells(); if (d.rule) U.setRule(d.rule);
      const b = d.cam || { x: 0, y: 0, s: 14 };
      // RLE normalisoi alkupisteen; tallennus sijoittaa kuvion origoon, joten kamera haetaan sovituksella
      for (let i = 0; i < p.cells.length; i += 2) U.setCell(p.cells[i], p.cells[i + 1], true);
      U.generation = d.gen || 0;
    });
    const opt = [...$('rule').options].find(o => o.value === U.ruleName);
    $('rule').value = opt ? U.ruleName : 'custom'; $('ruleIn').hidden = !!opt; if (!opt) $('ruleIn').value = U.ruleName;
    fitView(); toast('Loaded: ' + fmt(U.population) + ' cells');
  } catch (e) { toast('The saved data is corrupted'); }
});

// ---------- näppäimistö ----------
addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (e.key === 'Escape') { if (!$('modal').hidden) closeModal();
    else if (G && G.type === 'move') { const g = G; G = null; finishMove(g, true); }
    else { clearSelection(); G = null; }
    return; }
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || !$('modal').hidden) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === ' ') { e.preventDefault(); S.space = true; if (!e.repeat) togglePlay(); return; }
  if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); doStep(); return; }
  if (e.key === 'ArrowLeft') { e.preventDefault(); doRewind(e.shiftKey ? 10 : 1); return; }
  if (e.key === '+' || e.key === '=') { zoomAt(1.5, W / 2, H / 2); return; }
  if (e.key === '-') { zoomAt(1 / 1.5, W / 2, H / 2); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (S.sel) { e.preventDefault(); $('selDel').click(); } return; }
  const toolKey = Object.keys(TOOLS).find(t => TOOLS[t].toLowerCase() === k);
  if (toolKey) { setTool(toolKey); return; }
  if (k === 'r') rotateBrush(e.shiftKey ? 3 : 1); else if (k === 'd') rotateBrush(2); else if (k === 'f') flipBrush();
  else if (k === 'g') $('bGrid').click(); else if (k === 'c') $('bChunks').click();
  else if (k === 'o') fitView();
});
addEventListener('keyup', e => { if (e.key === ' ') S.space = false; });

// ---------- tila ja silmukka ----------
const el = { gen: $('sGen'), pop: $('sPop'), ch: $('sCh'), act: $('sAct'), zoom: $('sZoom'), pos: $('sPos'), state: $('sState') };
let lastStatus = 0;
function stateText() {
  if (S.jobLeft > 0) return 'Jumping, ' + fmt(S.jobLeft) + ' generations left';
  const st = CD.status;
  if (st) {
    if (st.type === 'dead') return 'All cells dead';
    if (st.type === 'still') return 'Stopped: the pattern no longer changes';
    if (st.type === 'cycle') return 'Repeating: period ' + st.period;
    if (st.type === 'ship') return 'Spaceship: period ' + st.period + ', displacement (' + st.dx + ', ' + st.dy + ')';
  }
  return S.running ? 'Evolving' : (U.population ? 'Paused' : 'Empty world');
}
function updateStatus(force) {
  const now = performance.now();
  if (!force && now - lastStatus < 100) return;
  lastStatus = now;
  el.gen.textContent = fmt(U.generation); el.pop.textContent = fmt(U.population);
  el.ch.textContent = fmt(U.chunks.size); el.act.textContent = fmt(U.changed.size);
  el.zoom.textContent = (cam.s >= 10 ? cam.s.toFixed(0) : cam.s.toFixed(cam.s >= 1 ? 1 : 2)) + ' px/cell';
  if (S.mouse) { const c = cellAt(S.mouse); el.pos.textContent = c.x + ', ' + c.y; } else el.pos.textContent = '–';
  el.state.textContent = stateText();
  $('bJump').textContent = S.jobLeft > 0 ? 'Stop' : 'Jump';
  $('bBack1').disabled = $('bBack10').disabled = !TL.canRewind();
  $('bUndo').disabled = !TL.canUndo();
  $('bRedo').disabled = !TL.canRedo();
}
let lastT = performance.now(), acc = 0;
function frame(t) {
  const dt = Math.min(100, t - lastT); lastT = t;
  if (S.running || S.jobLeft > 0) {
    const budget = 12, t0 = performance.now();
    if (S.jobLeft > 0) {
      while (S.jobLeft > 0 && performance.now() - t0 < budget) { stepOnce(); if (S.jobTotal > 0) S.jobLeft--; }
      if (S.jobTotal > 0 && S.jobLeft <= 0) finishJob(true);
    } else if (SPEEDS[S.speedIdx] === 'turbo') {
      do { stepOnce(); } while (S.running && performance.now() - t0 < budget);
    } else {
      acc += dt * SPEEDS[S.speedIdx] / 1000;
      let n = Math.min(Math.floor(acc), 100); acc -= Math.floor(acc); if (acc > 1) acc = 0;
      while (n-- > 0 && S.running && performance.now() - t0 < budget) stepOnce();
    }
    S.dirty = true;
  }
  if (S.dirty) render();
  updateStatus(false);
  requestAnimationFrame(frame);
}

function resize() {
  const st = $('stage'); W = Math.max(1, st.clientWidth); H = Math.max(1, st.clientHeight);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
  cvs.style.width = W + 'px'; cvs.style.height = H + 'px'; S.dirty = true;
}
new ResizeObserver(resize).observe($('stage'));

// ---------- käynnistys ----------
refreshColors(); resize(); buildPalette(); setTool('stamp'); updateSpeedLabel();
$('speed').value = S.speedIdx;
(function seed() {
  const gun = PATTERNS.find(p => p.name === 'Gosper glider gun'), p = parseRLE(gun.rle);
  for (let i = 0; i < p.cells.length; i += 2) U.setCell(p.cells[i] - 18, p.cells[i + 1] - 6, true);
  TL.afterEdit(); cam.x = 2; cam.y = 2; cam.s = 14;
})();
window.__life = { U, TL, CD, S, cam };
requestAnimationFrame(frame);
})();
