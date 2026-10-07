// life-engine.js — äärettömän maailman Game of Life
// Maailma koostuu 16x16 chunkeista. Jokainen chunk on 16 kpl 16-bittisiä lukuja (yksi per rivi).
// Chunkit ovat Map-sanakirjassa; puuttuva chunk = tyhjä. Vain muuttuneet chunkit (ja niiden naapurit) lasketaan.
(function (root) {
'use strict';

const CS = 16;
const BIAS = 33554432;   // 2^25
const SPAN = 67108864;   // 2^26
const LIMIT = BIAS - 4;  // chunk-koordinaatin raja (~ ±536 miljoonaa solua)

function chunkKey(cx, cy) { return (cx + BIAS) * SPAN + (cy + BIAS); }
function keyCx(k) { return Math.floor(k / SPAN) - BIAS; }
function keyCy(k) { return (k % SPAN) - BIAS; }

const POP = new Uint8Array(65536);
for (let i = 1; i < 65536; i++) POP[i] = POP[i >> 1] + (i & 1);

const EMPTY = new Uint16Array(16);

function isEmptyRows(rows) {
  for (let i = 0; i < 16; i++) if (rows[i]) return false;
  return true;
}
function chunkPop(rows) {
  let p = 0;
  for (let i = 0; i < 16; i++) p += POP[rows[i]];
  return p;
}

function parseRule(str) {
  const m = /^\s*B([0-8]*)\s*\/\s*S([0-8]*)\s*$/i.exec(str || '');
  if (!m) return null;
  let b = 0, s = 0;
  for (const ch of m[1]) b |= 1 << +ch;
  for (const ch of m[2]) s |= 1 << +ch;
  return { b, s, name: 'B' + m[1] + '/S' + m[2] };
}

function chunkHashes(key, rows, out) {
  const lo = key | 0, hi = Math.floor(key / 4294967296) | 0;
  let a = Math.imul(lo ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(hi + 0x7f4a7c15, 0xc2b2ae35);
  let b = Math.imul(lo + 0x1b873593, 0xcc9e2d51) ^ Math.imul(hi ^ 0x27d4eb2f, 0x165667b1);
  for (let i = 0; i < 16; i++) {
    const r = rows[i];
    a = Math.imul(a ^ r, 0x01000193); a ^= a >>> 15;
    b = Math.imul(b + r + i, 0x2545f491); b ^= b >>> 13;
  }
  out[0] = a; out[1] = b;
}

class Universe {
  constructor(rule) {
    this.chunks = new Map();     // key -> Uint16Array(16)
    this.changed = new Set();    // chunkit, jotka muuttuivat viime askeleella tai muokkauksessa
    this.generation = 0;
    this.population = 0;
    this.hashA = 0; this.hashB = 0;
    this._h = new Int32Array(2);
    this._ext = new Int32Array(18);
    this.setRule(rule || 'B3/S23');
  }

  setRule(str) {
    const r = parseRule(str);
    if (!r || (r.b & 1)) return false; // B0 rikkoisi äärettömän tyhjän tilan
    this.rule = r;
    this.ruleName = r.name;
    this._fast = r.name === 'B3/S23';
    this._bList = []; this._sList = [];
    for (let k = 0; k <= 8; k++) {
      if ((r.b >> k) & 1) this._bList.push(k);
      if ((r.s >> k) & 1) this._sList.push(k);
    }
    this.markAllChanged();
    return true;
  }

  markAllChanged() { this.changed = new Set(this.chunks.keys()); }

  _hash(key, rows, sign) {
    chunkHashes(key, rows, this._h);
    if (sign > 0) { this.hashA = (this.hashA + this._h[0]) | 0; this.hashB = (this.hashB + this._h[1]) | 0; }
    else { this.hashA = (this.hashA - this._h[0]) | 0; this.hashB = (this.hashB - this._h[1]) | 0; }
  }

  getCell(x, y) {
    const cx = Math.floor(x / CS), cy = Math.floor(y / CS);
    const rows = this.chunks.get(chunkKey(cx, cy));
    if (!rows) return false;
    return ((rows[y - cy * CS] >> (x - cx * CS)) & 1) === 1;
  }

  setCell(x, y, alive) {
    const cx = Math.floor(x / CS), cy = Math.floor(y / CS);
    if (cx < -LIMIT || cx > LIMIT || cy < -LIMIT || cy > LIMIT) return false;
    const key = chunkKey(cx, cy);
    let rows = this.chunks.get(key);
    const lx = x - cx * CS, ly = y - cy * CS;
    const bit = 1 << lx;
    const cur = rows ? (rows[ly] & bit) !== 0 : false;
    alive = !!alive;
    if (cur === alive) return false;
    if (rows) this._hash(key, rows, -1);
    else { rows = new Uint16Array(16); this.chunks.set(key, rows); }
    if (alive) { rows[ly] |= bit; this.population++; }
    else { rows[ly] &= ~bit; this.population--; }
    if (isEmptyRows(rows)) this.chunks.delete(key); else this._hash(key, rows, +1);
    this.changed.add(key);
    return true;
  }

  clear() {
    this.chunks = new Map(); this.changed = new Set();
    this.population = 0; this.hashA = 0; this.hashB = 0; this.generation = 0;
  }

  // Poistaa kaikki solut mutta säilyttää sukupolvilaskurin
  clearCells() {
    this.chunks = new Map(); this.changed = new Set();
    this.population = 0; this.hashA = 0; this.hashB = 0;
  }

  // Laskee yhden chunkin seuraavan tilan. Palauttaa uuden Uint16Array(16):n tai null, jos ei muutosta.
  _compute(cx, cy) {
    const ch = this.chunks;
    const NW = ch.get(chunkKey(cx - 1, cy - 1)) || EMPTY, N = ch.get(chunkKey(cx, cy - 1)) || EMPTY, NE = ch.get(chunkKey(cx + 1, cy - 1)) || EMPTY;
    const W = ch.get(chunkKey(cx - 1, cy)) || EMPTY, C = ch.get(chunkKey(cx, cy)) || EMPTY, Eo = ch.get(chunkKey(cx + 1, cy)) || EMPTY;
    const SW = ch.get(chunkKey(cx - 1, cy + 1)) || EMPTY, S = ch.get(chunkKey(cx, cy + 1)) || EMPTY, SE = ch.get(chunkKey(cx + 1, cy + 1)) || EMPTY;
    const ext = this._ext;
    // 18-bittinen laajennettu rivi: bitti 0 = x -1, bitit 1..16 = oma chunk, bitti 17 = x 16
    ext[0] = ((NW[15] >>> 15) & 1) | (N[15] << 1) | ((NE[15] & 1) << 17);
    for (let r = 0; r < 16; r++) ext[r + 1] = ((W[r] >>> 15) & 1) | (C[r] << 1) | ((Eo[r] & 1) << 17);
    ext[17] = ((SW[0] >>> 15) & 1) | (S[0] << 1) | ((SE[0] & 1) << 17);

    const fast = this._fast, bL = this._bList, sL = this._sList;
    let out = null;
    for (let y = 0; y < 16; y++) {
      const a = ext[y], b = ext[y + 1], c = ext[y + 2];
      // bittisiivutettu naapurien laskenta: kahdeksan naapurin summa kaikille 16 sarakkeelle kerralla
      const al = a << 1, ar = a >>> 1, cl = c << 1, cr = c >>> 1, bl = b << 1, br = b >>> 1;
      const s1 = al ^ a ^ ar, c1 = (al & a) | (ar & (al ^ a));
      const s2 = cl ^ c ^ cr, c2 = (cl & c) | (cr & (cl ^ c));
      const s3 = bl ^ br, c3 = bl & br;
      const n0 = s1 ^ s2 ^ s3;
      const cA = (s1 & s2) | (s3 & (s1 ^ s2));
      const x = c1 ^ c2, y1 = c1 & c2, z = c3 ^ cA, w = c3 & cA;
      const n1 = x ^ z, carry = x & z;
      const n2 = carry ^ y1 ^ w, n3 = (carry & y1) | (w & (carry ^ y1));
      let nxt;
      if (fast) {
        nxt = n1 & ~n2 & ~n3 & (n0 | b);
      } else {
        let born = 0, surv = 0;
        for (let i = 0; i < bL.length; i++) {
          const k = bL[i];
          born |= ((k & 1) ? n0 : ~n0) & ((k & 2) ? n1 : ~n1) & ((k & 4) ? n2 : ~n2) & ((k & 8) ? n3 : ~n3);
        }
        for (let i = 0; i < sL.length; i++) {
          const k = sL[i];
          surv |= ((k & 1) ? n0 : ~n0) & ((k & 2) ? n1 : ~n1) & ((k & 4) ? n2 : ~n2) & ((k & 8) ? n3 : ~n3);
        }
        nxt = (b & surv) | (~b & born);
      }
      const res = (nxt >>> 1) & 0xFFFF;
      if (out) out[y] = res;
      else if (res !== C[y]) { out = new Uint16Array(16); out.set(C); out[y] = res; }
    }
    return out;
  }

  step() {
    const chunks = this.chunks;
    const cand = new Set();
    for (const key of this.changed) {
      const cx = keyCx(key), cy = keyCy(key);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cand.add(chunkKey(cx + dx, cy + dy));
    }
    const resKeys = [], resRows = [];
    for (const key of cand) {
      const rows = this._compute(keyCx(key), keyCy(key));
      if (rows) { resKeys.push(key); resRows.push(rows); }
    }
    // kaksoispuskuri: kaikki uudet tilat laskettu ennen kuin mitään kirjoitetaan
    const newChanged = new Set();
    for (let i = 0; i < resKeys.length; i++) {
      const key = resKeys[i], rows = resRows[i];
      const old = chunks.get(key);
      if (old) { this._hash(key, old, -1); this.population -= chunkPop(old); }
      if (isEmptyRows(rows)) chunks.delete(key);
      else { chunks.set(key, rows); this.population += chunkPop(rows); this._hash(key, rows, +1); }
      newChanged.add(key);
    }
    this.changed = newChanged;
    this.generation++;
  }

  // Käy läpi chunkit suorakulmiossa (chunk-koordinaatit, rajat mukaan lukien)
  forChunksInRect(cx0, cy0, cx1, cy1, fn) {
    const n = (cx1 - cx0 + 1) * (cy1 - cy0 + 1);
    if (n <= this.chunks.size) {
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const rows = this.chunks.get(chunkKey(cx, cy));
        if (rows) fn(cx, cy, rows);
      }
    } else {
      for (const [key, rows] of this.chunks) {
        const cx = keyCx(key), cy = keyCy(key);
        if (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) fn(cx, cy, rows);
      }
    }
  }

  // Solut suorakulmiossa (solukoordinaatit, rajat mukaan lukien) -> [x, y, x, y, ...]
  cellsInRect(x0, y0, x1, y1) {
    const out = [];
    this.forChunksInRect(Math.floor(x0 / CS), Math.floor(y0 / CS), Math.floor(x1 / CS), Math.floor(y1 / CS), (cx, cy, rows) => {
      for (let r = 0; r < 16; r++) {
        const y = cy * CS + r;
        if (y < y0 || y > y1) continue;
        let b = rows[r];
        while (b) {
          const lx = 31 - Math.clz32(b & -b);
          b &= b - 1;
          const x = cx * CS + lx;
          if (x >= x0 && x <= x1) out.push(x, y);
        }
      }
    });
    return out;
  }

  clearRect(x0, y0, x1, y1) {
    const cells = this.cellsInRect(x0, y0, x1, y1);
    for (let i = 0; i < cells.length; i += 2) this.setCell(cells[i], cells[i + 1], false);
    return cells.length / 2;
  }

  allCells() {
    const out = [];
    for (const [key, rows] of this.chunks) {
      const bx = keyCx(key) * CS, by = keyCy(key) * CS;
      for (let r = 0; r < 16; r++) {
        let b = rows[r];
        while (b) { const lx = 31 - Math.clz32(b & -b); b &= b - 1; out.push(bx + lx, by + r); }
      }
    }
    return out;
  }

  bounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [key, rows] of this.chunks) {
      const bx = keyCx(key) * CS, by = keyCy(key) * CS;
      let or = 0;
      for (let r = 0; r < 16; r++) {
        const b = rows[r];
        if (b) { or |= b; if (by + r < minY) minY = by + r; if (by + r > maxY) maxY = by + r; }
      }
      if (or) {
        const lo = bx + (31 - Math.clz32(or & -or)), hi = bx + (31 - Math.clz32(or));
        if (lo < minX) minX = lo; if (hi > maxX) maxX = hi;
      }
    }
    return minX === Infinity ? null : { minX, minY, maxX, maxY };
  }

  snapshot() {
    const data = [];
    for (const [key, rows] of this.chunks) data.push(key, rows.slice());
    return { generation: this.generation, population: this.population, hashA: this.hashA, hashB: this.hashB, rule: this.ruleName, data };
  }

  restore(s) {
    this.chunks = new Map();
    for (let i = 0; i < s.data.length; i += 2) this.chunks.set(s.data[i], s.data[i + 1].slice());
    this.generation = s.generation; this.population = s.population;
    this.hashA = s.hashA; this.hashB = s.hashB;
    if (s.rule !== this.ruleName) this.setRule(s.rule);
    this.markAllChanged();
  }
}

// ---------- Aikajana: takaisinkelaus ja kumoaminen ----------
class Timeline {
  constructor(u, opts) {
    opts = opts || {};
    this.u = u; this.snaps = [];
    this.interval = opts.interval || 10;
    this.max = opts.max || 300;
    this.maxChunks = opts.maxChunks || 40000;
  }
  _push(pre) {
    const u = this.u, last = this.snaps[this.snaps.length - 1];
    if (last && last.generation === u.generation && last.hashA === u.hashA && last.hashB === u.hashB &&
        last.population === u.population && last.rule === u.ruleName) {
      if (pre) last.pre = true;
      return;
    }
    const s = u.snapshot(); s.pre = !!pre;
    this.snaps.push(s);
    if (this.snaps.length > this.max) this.snaps.shift();
  }
  beforeEdit() { this._push(true); }
  afterEdit() { this._push(false); }
  tick() {
    const u = this.u;
    if (u.generation % this.interval === 0 && u.chunks.size <= this.maxChunks) this._push(false);
  }
  canRewind() {
    const g = this.u.generation;
    return this.snaps.some(s => s.generation <= g - 1);
  }
  rewind(n) {
    const u = this.u, T = u.generation - n;
    let idx = -1;
    for (let i = this.snaps.length - 1; i >= 0; i--) if (this.snaps[i].generation <= T) { idx = i; break; }
    if (idx < 0) return false;
    u.restore(this.snaps[idx]);
    this.snaps.length = idx + 1;
    while (u.generation < T) u.step();
    return true;
  }
  canUndo() { return this.snaps.some(s => s.pre); }
  undo() {
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].pre) {
        this.u.restore(this.snaps[i]);
        this.snaps.length = i + 1;
        this.snaps[i].pre = false;
        return true;
      }
    }
    return false;
  }
  reset() { this.snaps = []; }
}

// ---------- Syklintunnistus ----------
function cellMix(x, y, seed) {
  let h = Math.imul(x + 0x9e3779b1, 0x85ebca6b) ^ Math.imul(y + seed, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h | 0;
}

class CycleDetector {
  constructor(u) { this.u = u; this.window = 400; this.reset(); }
  reset() { this.map = new Map(); this.order = []; this.status = null; }
  _remember(key, rec) {
    this.map.set(key, rec); this.order.push(key);
    if (this.order.length > this.window) this.map.delete(this.order.shift());
  }
  // Kutsutaan jokaisen askeleen jälkeen. Asettaa this.status:
  // null | {type:'dead'} | {type:'still'} | {type:'cycle', period} | {type:'ship', period, dx, dy}
  observe() {
    const u = this.u;
    if (u.population === 0) { this.status = { type: 'dead' }; return this.status; }
    if (u.changed.size === 0) { this.status = { type: 'still' }; return this.status; }
    let key, rec;
    if (u.population <= 1500) {
      let minX = Infinity, minY = Infinity;
      for (const [k, rows] of u.chunks) {
        const bx = keyCx(k) * CS, by = keyCy(k) * CS;
        let or = 0;
        for (let r = 0; r < 16; r++) if (rows[r]) { or |= rows[r]; if (by + r < minY) minY = by + r; }
        if (or) { const lo = bx + (31 - Math.clz32(or & -or)); if (lo < minX) minX = lo; }
      }
      let ha = 0, hb = 0;
      for (const [k, rows] of u.chunks) {
        const bx = keyCx(k) * CS - minX, by = keyCy(k) * CS - minY;
        for (let r = 0; r < 16; r++) {
          let b = rows[r];
          while (b) { const lx = 31 - Math.clz32(b & -b); b &= b - 1; ha = (ha + cellMix(bx + lx, by + r, 17)) | 0; hb = (hb + cellMix(bx + lx, by + r, 91)) | 0; }
        }
      }
      key = 'n' + ha + ':' + hb + ':' + u.population;
      rec = { gen: u.generation, minX, minY };
    } else {
      key = 'a' + u.hashA + ':' + u.hashB + ':' + u.population;
      rec = { gen: u.generation, minX: 0, minY: 0 };
    }
    const prev = this.map.get(key);
    if (prev) {
      const period = u.generation - prev.gen;
      const dx = rec.minX - prev.minX, dy = rec.minY - prev.minY;
      this.status = (dx || dy) ? { type: 'ship', period, dx, dy } : { type: 'cycle', period };
      this.map.set(key, rec);
    } else {
      this.status = null;
      this._remember(key, rec);
    }
    return this.status;
  }
}

// ---------- RLE ----------
function parseRLE(text) {
  let name = '', rule = null;
  const body = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line[0] === '#') { if (/^#N\b/i.test(line)) name = line.slice(2).trim(); continue; }
    const hm = /^x\s*=\s*\d+\s*,\s*y\s*=\s*\d+(?:\s*,\s*rule\s*=\s*([^\s,]+))?\s*/i.exec(line);
    if (hm) {
      if (hm[1]) rule = hm[1];
      const rest = line.slice(hm[0].length).trim();   // header and pattern may share one line
      if (rest) body.push(rest);
      continue;
    }
    body.push(line);
  }
  const s = body.join('');
  const cells = [];
  let x = 0, y = 0, num = '';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch >= '0' && ch <= '9') { num += ch; continue; }
    if (/\s/.test(ch)) continue;
    const n = num ? parseInt(num, 10) : 1; num = '';
    if (ch === '!') break;
    if (ch === '$') { y += n; x = 0; }
    else if (ch === 'b' || ch === '.') x += n;
    else {
      for (let k = 0; k < n; k++) {
        cells.push(x + k, y);
      }
      if (x < minX) minX = x; if (x + n - 1 > maxX) maxX = x + n - 1;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      x += n;
    }
  }
  if (!cells.length) return { name, rule, cells: [], w: 0, h: 0 };
  for (let i = 0; i < cells.length; i += 2) { cells[i] -= minX; cells[i + 1] -= minY; }
  return { name, rule, cells, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function cellsToRLE(cells, ruleName, name) {
  if (!cells.length) return 'x = 0, y = 0, rule = ' + (ruleName || 'B3/S23') + '\n!\n';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < cells.length; i += 2) {
    const x = cells[i], y = cells[i + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const rows = Array.from({ length: h }, () => []);
  for (let i = 0; i < cells.length; i += 2) rows[cells[i + 1] - minY].push(cells[i] - minX);
  const rowStr = rows.map(xs => {
    xs.sort((a, b) => a - b);
    let s = '', pos = 0, i = 0;
    while (i < xs.length) {
      let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      const gap = xs[i] - pos, len = j - i + 1;
      if (gap > 0) s += (gap > 1 ? gap : '') + 'b';
      s += (len > 1 ? len : '') + 'o';
      pos = xs[j] + 1; i = j + 1;
    }
    return s;
  });
  let out = '', i = 0;
  while (i < h) {
    out += rowStr[i];
    let j = i + 1, k = 0;
    while (j < h && rowStr[j] === '') { k++; j++; }
    if (j >= h) break;
    const d = 1 + k;
    out += (d > 1 ? d : '') + '$';
    i = j;
  }
  out += '!';
  // rivitys ~70 merkkiin tokenien rajalla
  const tokens = out.match(/\d*[bo$!]/g) || [];
  let lines = [], cur = '';
  for (const t of tokens) { if (cur.length + t.length > 70) { lines.push(cur); cur = ''; } cur += t; }
  lines.push(cur);
  let head = '';
  if (name) head += '#N ' + name + '\n';
  head += 'x = ' + w + ', y = ' + h + ', rule = ' + (ruleName || 'B3/S23') + '\n';
  return head + lines.join('\n') + '\n';
}

const api = { CS, Universe, Timeline, CycleDetector, parseRLE, cellsToRLE, parseRule, chunkKey, keyCx, keyCy, POP, chunkPop };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.LifeEngine = api;
})(typeof self !== 'undefined' ? self : this);
