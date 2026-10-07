# Design

Status: planning. This document holds the decisions made so far.

## Decisions

- **Language:** JavaScript.
- **Board:** unbounded (infinite). The world is held in memory as small grid chunks that link to each other (neighbour links between chunks), so the board grows as patterns expand.
- **Pattern brushes:** the user can paint with predefined patterns (gliders, guns, puffers, etc.).
- **HashLife:** not needed first. Keep it in mind as a later addition, so the chunk/world design should not make it impossible to add.
- **Repository:** GitHub `anttiraisala/infinite-game-of-life`, branch `master`. All source code and all documentation live in this repo (`src/` and `docs/`).

## Resolved (prototype)

- **Chunk size and cell format:** 16x16 chunks. Each chunk is 16 numbers of 16 bits, one per row, so a whole row is updated with bitwise operations. Chunk size is a constant (`CS`) in `src/life-engine.js`.
- **Storage and links:** a `Map` keyed by chunk coordinates (one number per chunk). A missing chunk is empty. Neighbours are looked up by coordinates, not by pointers. Coordinates reach about +-536 million cells.
- **Empty chunks:** created when a cell is born into them, deleted when they become empty.
- **Only active chunks are computed:** each step computes the chunks that changed last step and their neighbours; a still world costs nothing.
- **Rules:** any B/S rule except B0 (set at runtime). B3/S23 has a fast path.
- **Rendering:** canvas, one rectangle per run of live cells; zoomed far out each chunk is drawn as one block. Optional overlay shows chunks and active chunks.
- **Brush library:** RLE strings in `src/patterns.js`. Own brushes and RLE import are kept in the browser.
- **Extras:** rewind and undo through snapshots, cycle/spaceship detection through state hashes.

## Open questions

- HashLife (kept for later; the engine API is separate from the UI so it can be swapped in).
- Puffer trains and breeders: no verified RLE in the library yet (import via RLE works).
- Whether to keep the single-file build or split the UI into modules.
