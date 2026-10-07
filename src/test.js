const E = require('./life-engine.js');
const { Universe, Timeline, CycleDetector, parseRLE, cellsToRLE } = E;

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FAIL:', msg); } else console.log('ok  :', msg); }

function load(u, rle, ox = 0, oy = 0) {
  const p = parseRLE(rle);
  for (let i = 0; i < p.cells.length; i += 2) u.setCell(p.cells[i] + ox, p.cells[i + 1] + oy, true);
  return p;
}
function norm(cells) {
  const a = [];
  for (let i = 0; i < cells.length; i += 2) a.push(cells[i] + ',' + cells[i + 1]);
  return a.sort().join(';');
}

// naiivi vertailutoteutus
function naiveStep(set, rule) {
  const r = E.parseRule(rule);
  const cnt = new Map();
  for (const k of set) {
    const [x, y] = k.split(',').map(Number);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const kk = (x + dx) + ',' + (y + dy);
      cnt.set(kk, (cnt.get(kk) || 0) + 1);
    }
  }
  const out = new Set();
  for (const [k, n] of cnt) {
    if (set.has(k)) { if ((r.s >> n) & 1) out.add(k); }
    else if ((r.b >> n) & 1) out.add(k);
  }
  return out;
}

// 1. vertailu naiiviin: satunnaissoppa, negatiiviset koordinaatit ja chunk-rajat
for (const rule of ['B3/S23', 'B36/S23', 'B2/S', 'B3678/S34678', 'B35678/S5678']) {
  const u = new Universe(rule);
  let set = new Set();
  let seed = 12345;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = -25; y < 25; y++) for (let x = -25; x < 25; x++) if (rnd() < 0.3) { set.add(x + ',' + y); u.setCell(x, y, true); }
  let same = true;
  for (let g = 0; g < 60 && same; g++) {
    u.step(); set = naiveStep(set, rule);
    const mine = new Set(); const c = u.allCells();
    for (let i = 0; i < c.length; i += 2) mine.add(c[i] + ',' + c[i + 1]);
    if (mine.size !== set.size || u.population !== set.size) same = false;
    else for (const k of set) if (!mine.has(k)) { same = false; break; }
    if (!same) console.log('  ero sukupolvella', g + 1, mine.size, set.size, u.population);
  }
  ok(same, 'vastaa naiivia toteutusta: ' + rule);
}

// 2. blinker
{
  const u = new Universe(); load(u, '3o!');
  const a = norm(u.allCells()); u.step(); const b = norm(u.allCells()); u.step();
  ok(a !== b && norm(u.allCells()) === a, 'blinker jakso 2');
}

// 3. glider liikkuu (1,1) / 4 sukupolvea, myös chunkkien ja origon yli
{
  const u = new Universe(); load(u, 'bo$2bo$3o!', -40, -40);
  const start = u.allCells();
  for (let i = 0; i < 400; i++) u.step();
  const moved = start.map((v, i) => v + 100);
  ok(norm(u.allCells()) === norm(moved) && u.population === 5, 'glider siirtyi 100 ruutua vinoon 400 sukupolvessa');
  ok(u.chunks.size <= 4, 'glider ei jätä roskaa chunkkeihin (' + u.chunks.size + ')');
}

// 4. R-pentomino: 1103 sukupolvea, 116 solua
{
  const u = new Universe(); load(u, 'b2o$2ob$bo!');
  for (let i = 0; i < 1103; i++) u.step();
  const p1 = u.population;
  for (let i = 0; i < 100; i++) u.step();
  ok(p1 === 116 && u.population === 116, 'R-pentomino 1103 gen -> 116 solua (' + p1 + ')');
}

// 5. Gosperin tykki
{
  const u = new Universe();
  load(u, '24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!');
  ok(u.population === 36, 'Gosperin tykki 36 solua');
  let good = true;
  for (let k = 1; k <= 20; k++) { for (let i = 0; i < 30; i++) u.step(); if (u.population !== 36 + 5 * k) { good = false; console.log('  k', k, u.population); break; } }
  ok(good, 'tykki tuottaa gliderin 30 sukupolven välein');
}

// 6. diehard kuolee 130:ssä, acorn 5206 -> 633
{
  const u = new Universe(); load(u, '6bo$2o$bo3b3o!');
  for (let i = 0; i < 129; i++) u.step();
  const alive129 = u.population > 0; u.step();
  ok(alive129 && u.population === 0, 'diehard kuolee sukupolvella 130');
  const a = new Universe(); load(a, 'bo$3bo$2o2b3o!');
  const t = Date.now();
  for (let i = 0; i < 5206; i++) a.step();
  ok(a.population === 633, 'acorn 5206 gen -> 633 solua (' + a.population + '), ' + (Date.now() - t) + ' ms');
}

// 7. kuviokirjaston jaksot
function period(rle, maxP) {
  const u = new Universe(); load(u, rle, 5, 5);
  const cd = new CycleDetector(u);
  for (let i = 0; i < 200; i++) { u.step(); const s = cd.observe(); if (s && s.type !== 'dead') return s; }
  return null;
}
{
  let s = period('3o!'); ok(s && s.type === 'cycle' && s.period === 2, 'syklintunnistus: blinker jakso 2');
  s = period('2o$2o!'); ok(s && s.type === 'still', 'syklintunnistus: block pysähtynyt');
  s = period('bo$2bo$3o!'); ok(s && s.type === 'ship' && s.period === 4 && s.dx === 1 && s.dy === 1, 'syklintunnistus: glider ' + JSON.stringify(s));
  s = period('2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!');
  ok(s && s.type === 'cycle' && s.period === 3, 'pulsar jakso 3');
  s = period('2bo4bo2b$2ob4ob2o$2bo4bo!'); ok(s && s.type === 'cycle' && s.period === 15, 'pentadecathlon jakso 15');
  s = period('bo2bo$o4b$o3bo$4o!'); ok(s && s.type === 'ship' && s.period === 4 && s.dx !== 0 && s.dy === 0, 'LWSS ' + JSON.stringify(s));
  s = period('3bo2b$bo3bo$o5b$o4bo$5o!'); ok(s && s.type === 'ship' && s.period === 4, 'MWSS ' + JSON.stringify(s));
  s = period('3b2o2b$bo4bo$o6b$o5bo$6o!'); ok(s && s.type === 'ship' && s.period === 4, 'HWSS ' + JSON.stringify(s));
}

// 8. aikajana: takaisinkelaus ja kumoaminen
{
  const u = new Universe(); const tl = new Timeline(u, { interval: 10 });
  tl.beforeEdit(); load(u, 'b2o$2ob$bo!'); tl.afterEdit();
  const states = [norm(u.allCells())];
  for (let i = 0; i < 57; i++) { u.step(); tl.tick(); states.push(norm(u.allCells())); }
  ok(tl.rewind(1) && u.generation === 56 && norm(u.allCells()) === states[56], 'rewind 1');
  ok(tl.rewind(10) && u.generation === 46 && norm(u.allCells()) === states[46], 'rewind 10');
  for (let i = 0; i < 5; i++) { u.step(); tl.tick(); }
  ok(norm(u.allCells()) === states[51], 'eteneminen rewindin jälkeen on deterministinen');
  tl.beforeEdit(); u.setCell(100, 100, true); tl.afterEdit();
  ok(tl.undo() && norm(u.allCells()) === states[51], 'undo palauttaa tilan ennen muokkausta');
}

// 9. RLE kierros
{
  const src = 'b2o$2ob$bo!';
  const p = parseRLE(src);
  const back = cellsToRLE(p.cells, 'B3/S23');
  const p2 = parseRLE(back);
  ok(norm(p.cells) === norm(p2.cells) && /x = 3, y = 3/.test(back), 'RLE kierros: ' + back.trim().replace(/\n/g, ' | '));
  const gun = parseRLE('24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!');
  ok(norm(parseRLE(cellsToRLE(gun.cells)).cells) === norm(gun.cells) && gun.cells.length === 72, 'RLE kierros: tykki (36 solua)');
  const gap = parseRLE('3o2$bo!');
  ok(gap.h === 3 && gap.cells.length === 8, 'RLE tyhjä rivi');
}

// 10. suorituskyky: iso soppa
{
  const u = new Universe(); let seed = 7;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) if (rnd() < 0.3) u.setCell(x, y, true);
  const t = Date.now();
  for (let i = 0; i < 100; i++) u.step();
  console.log('info: 400x400 soppa, 100 sukupolvea', Date.now() - t, 'ms, chunkkeja', u.chunks.size);
}


// 11. lisäkuviot: pää- ja runko samalla rivillä, avaruusalus, tykki, kasvajat
{
  const hdr = parseRLE('x = 10, y = 9, rule = b3/s23 4b6o$2b2o5bo$2obo5bo$4bo3bob$6bo3b$6b2o2b$5b4ob$5b2ob2o$7b2o!');
  ok(hdr.cells.length === 56 && hdr.w === 10 && hdr.h === 9 && hdr.rule === 'b3/s23', 'RLE: otsikko ja kuvio samalla rivillä');
  const u = new Universe(); load(u, '4b6o$2b2o5bo$2obo5bo$4bo3bob$6bo3b$6b2o2b$5b4ob$5b2ob2o$7b2o!', 5, 5);
  const cd = new CycleDetector(u); let s = null;
  for (let i = 0; i < 400 && !(s && s.type === 'ship'); i++) { u.step(); s = cd.observe(); }
  ok(s && s.type === 'ship' && s.period === 16 && Math.abs(s.dx) === 8 && s.dy === 0, 'P16-avaruusalus: ' + JSON.stringify(s));
  const g = new Universe(); load(g, '2o5b2o$2o5b2o2$4b2o$4b2o5$22b2ob2o$21bo5bo$21bo6bo2b2o$21b3o3bo3b2o$26bo!');
  const pops = []; for (let i = 0; i <= 1200; i++) { pops.push(g.population); g.step(); }
  let good = true; for (let t = 480; t + 120 <= 1200; t += 40) if (pops[t + 120] - pops[t] !== 10) good = false;
  ok(good, 'Simkinin tykki: +10 solua / 120 sukupolvea');
  function growth(rle, P, d, gens) {
    const w = new Universe(); load(w, rle); const p = [];
    for (let i = 0; i <= gens; i++) { p.push(w.population); w.step(); }
    for (let t = Math.floor(gens * 0.6); t + P <= gens; t++) if (p[t + P] - p[t] !== d) return false;
    return true;
  }
  ok(growth('6bo$4bob2o$4bobo$4bo$2bo$obo17$30bo$28bob2o$28bobo$28bo$26bo$24bobo!', 144, 16, 6000), 'Twin engines A: +16 / 144');
  ok(growth('30bo$28bob2o$28bobo$28bo$26bo$24bobo11$6bo$4bob2o$4bobo$4bo$2bo$obo!', 144, 32, 6000), 'Twin engines B: +32 / 144');
  ok(growth('30bo$28bob2o$6bo21bobo$4bob2o20bo$4bobo19bo$4bo19bobo$2bo$obo!', 384, 59, 6000), 'Twin engines C: +59 / 384');
  for (const [name, rle] of [['5x5 grower', '3obo$o$3b2o$b2obo$obobo!'], ['Line of 39', '8ob5o3b3o6b7ob5o!'], ['Switch engine', '6bo$4bob2o$4bobo$4bo$2bo$obo!']]) {
    const w = new Universe(); load(w, rle); const p = {};
    for (let i = 1; i <= 3000; i++) { w.step(); if (i % 1000 === 0) p[i] = w.population; }
    ok(p[3000] > p[2000] && p[2000] > p[1000] * 0.95 && w.bounds().maxX - w.bounds().minX > 500, name + ' kasvaa rajatta');
  }
}

console.log(fails ? '\n' + fails + ' EPÄONNISTUI' : '\nKaikki testit läpi');
process.exit(fails ? 1 : 0);
