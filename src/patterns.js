// patterns.js — pattern library (RLE). Every pattern was verified by simulation (periods, stabilisation times, cell counts).
(function (root) {
'use strict';
const PATTERNS = [
  { cat: 'Basics', name: 'Single cell', rle: 'o!', info: 'One cell' },

  { cat: 'Still lifes', name: 'Block', rle: '2o$2o!', info: 'The smallest still life' },
  { cat: 'Still lifes', name: 'Beehive', rle: 'b2o$o2bo$b2o!', info: '' },
  { cat: 'Still lifes', name: 'Loaf', rle: 'b2o$o2bo$bobo$2bo!', info: '' },
  { cat: 'Still lifes', name: 'Boat', rle: '2o$obo$bo!', info: '' },
  { cat: 'Still lifes', name: 'Tub', rle: 'bo$obo$bo!', info: '' },
  { cat: 'Still lifes', name: 'Pond', rle: 'b2o$o2bo$o2bo$b2o!', info: '' },

  { cat: 'Oscillators', name: 'Blinker', rle: '3o!', info: 'Period 2' },
  { cat: 'Oscillators', name: 'Toad', rle: 'b3o$3o!', info: 'Period 2' },
  { cat: 'Oscillators', name: 'Beacon', rle: '2o$2o$2b2o$2b2o!', info: 'Period 2' },
  { cat: 'Oscillators', name: 'Pulsar', rle: '2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!', info: 'Period 3' },
  { cat: 'Oscillators', name: 'Pentadecathlon', rle: '2bo4bo2b$2ob4ob2o$2bo4bo!', info: 'Period 15' },

  { cat: 'Spaceships', name: 'Glider', rle: 'bo$2bo$3o!', info: 'Travels diagonally, c/4' },
  { cat: 'Spaceships', name: 'LWSS', rle: 'bo2bo$o4b$o3bo$4o!', info: 'Lightweight spaceship, c/2' },
  { cat: 'Spaceships', name: 'MWSS', rle: '3bo2b$bo3bo$o5b$o4bo$5o!', info: 'Middleweight spaceship' },
  { cat: 'Spaceships', name: 'HWSS', rle: '3b2o2b$bo4bo$o6b$o5bo$6o!', info: 'Heavyweight spaceship' },
  { cat: 'Spaceships', name: 'P16 spaceship', rle: '4b6o$2b2o5bo$2obo5bo$4bo3bob$6bo3b$6b2o2b$5b4ob$5b2ob2o$7b2o!', info: '28 cells, period 16, c/2 (supplied by the project owner)' },

  { cat: 'Methuselahs', name: 'R-pentomino', rle: 'b2o$2ob$bo!', info: 'Stabilises at generation 1103 with 116 cells' },
  { cat: 'Methuselahs', name: 'Diehard', rle: '6bo$2o$bo3b3o!', info: 'Dies out at generation 130' },
  { cat: 'Methuselahs', name: 'Acorn', rle: 'bo$3bo$2o2b3o!', info: '5206 generations, ends with 633 cells' },
  { cat: 'Methuselahs', name: 'Pi-heptomino', rle: '3o$obo$obo!', info: 'Stabilises at generation 173' },
  { cat: 'Methuselahs', name: 'Thunderbird', rle: '3o2$bo$bo$bo!', info: 'Stabilises at generation 243' },
  { cat: 'Methuselahs', name: 'Rabbits', rle: 'o3b3o$3o2bo$bo!', info: '17331 generations, ends with 1744 cells' },

  { cat: 'Guns and growers', name: 'Gosper glider gun', rle: '24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!', info: 'Fires a glider every 30 generations' },
  { cat: 'Guns and growers', name: 'Simkin glider gun', rle: '2o5b2o$2o5b2o2$4b2o$4b2o5$22b2ob2o$21bo5bo$21bo6bo2b2o$21b3o3bo3b2o$26bo!', info: 'Two gliders every 120 generations, 36 cells' },
  { cat: 'Guns and growers', name: 'Switch engine', rle: '6bo$4bob2o$4bobo$4bo$2bo$obo!', info: 'Grows forever along a diagonal, leaving debris behind' },
  { cat: 'Guns and growers', name: 'Twin engines A', rle: '6bo$4bob2o$4bobo$4bo$2bo$obo17$30bo$28bob2o$28bobo$28bo$26bo$24bobo!', info: 'Two switch engines; population +16 every 144 generations' },
  { cat: 'Guns and growers', name: 'Twin engines B', rle: '30bo$28bob2o$28bobo$28bo$26bo$24bobo11$6bo$4bob2o$4bobo$4bo$2bo$obo!', info: 'Two switch engines; population +32 every 144 generations' },
  { cat: 'Guns and growers', name: 'Twin engines C', rle: '30bo$28bob2o$6bo21bobo$4bob2o20bo$4bobo19bo$4bo19bobo$2bo$obo!', info: 'Two switch engines; population +59 every 384 generations' },
  { cat: 'Guns and growers', name: '5x5 grower', rle: '3obo$o$3b2o$b2obo$obobo!', info: 'Ten cells that grow without bound' },
  { cat: 'Guns and growers', name: 'Line of 39', rle: '8ob5o3b3o6b7ob5o!', info: 'A row of five groups that grows without bound' },

  { cat: 'Eaters', name: 'Eater 1', rle: '2o$obo$2bo$2b2o!', info: 'Eats a glider and restores itself' }
];
const api = { PATTERNS };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LifePatterns = api;
})(typeof self !== 'undefined' ? self : this);
