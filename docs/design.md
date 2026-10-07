# Design

Status: planning. This document holds the decisions made so far.

## Decisions

- **Language:** JavaScript.
- **Board:** unbounded (infinite). The world is held in memory as small grid chunks that link to each other (neighbour links between chunks), so the board grows as patterns expand.
- **Pattern brushes:** the user can paint with predefined patterns (gliders, guns, puffers, etc.).
- **HashLife:** not needed first. Keep it in mind as a later addition, so the chunk/world design should not make it impossible to add.
- **Repository:** GitHub `anttiraisala/infinite-game-of-life`, branch `master`. All source code and all documentation live in this repo (`src/` and `docs/`).

## Open questions

- Chunk size (e.g. 32x32 or 64x64) and cell storage format (bit-packed vs. one byte per cell).
- How chunks are stored and linked (neighbour pointers vs. a map keyed by chunk coordinates).
- When empty chunks are created and freed.
- Rendering approach (canvas, viewport, zoom, panning).
- How the brush pattern library is stored (e.g. RLE files in `docs/` or `src/patterns/`).
