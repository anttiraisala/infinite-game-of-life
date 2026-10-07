# Infinite Game of Life

Conway's Game of Life with an unbounded board made of linked chunks, written in JavaScript. Pattern brushes (gliders, guns, puffers, ...) for painting. HashLife is a possible later addition.

## Structure

- `src/` – source code
- `docs/` – documentation: `design.md` (decisions and open questions), `notes.md` (conventions)

## Status

Working prototype that runs in the browser (single HTML page, no dependencies).

- `src/life-engine.js` – chunked infinite world (16x16 chunks, bit-packed rows), B/S rules, timeline (rewind/undo), cycle detection, RLE import/export
- `src/patterns.js` – brush pattern library (RLE)
- `src/app.js` + `src/template.html` – canvas UI: brushes, tools, selection, rule picker
- `src/test.js` – engine tests (compares against a naive implementation and known patterns)

```
node src/test.js     # run the engine tests
node src/build.js    # build dist/index.html (open it in a browser)
```
