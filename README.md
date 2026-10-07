# Infinite Game of Life

Conway's Game of Life with an unbounded board made of linked chunks, written in JavaScript. Pattern brushes (gliders, guns, puffers, ...) for painting. HashLife is a possible later addition.

## Structure

- `src/` – source code
- `docs/` – documentation: `design.md` (decisions and open questions), `notes.md` (conventions)

## Status

Working prototype that runs in the browser (single HTML page, no dependencies).

- `src/life-engine.js` – chunked infinite world (16x16 chunks, bit-packed rows), B/S rules, timeline (rewind, undo/redo), cycle detection, RLE import/export
- `src/patterns.js` – brush pattern library (RLE)
- `src/app.js` + `src/template.html` – canvas UI: brushes, tools, selection (drag to move or copy), rule picker
- `src/test.js` – engine tests (compares against a naive implementation and known patterns)

## Quick start

You only need **Node.js 18 or newer** (it includes `npm`) and **git**. There are no dependencies to install: `npm install` is not needed. To run the game you need a web browser.

### 1. Install Node.js and git

Linux (Debian / Ubuntu / Mint):

```
sudo apt update && sudo apt install -y git nodejs npm
```

Linux (Fedora): `sudo dnf install -y git nodejs`  
Linux (Arch): `sudo pacman -S git nodejs npm`

If `node --version` prints something older than v18, install a newer one with nvm:

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# open a new terminal, then:
nvm install --lts
```

macOS: `brew install git node` (Homebrew from https://brew.sh), or the installer from https://nodejs.org  
Windows (PowerShell): `winget install Git.Git OpenJS.NodeJS.LTS`, then open a new terminal.

Check: `node --version` (v18 or newer) and `git --version`.

### 2. Get, test, build and open

Linux:

```
git clone https://github.com/anttiraisala/infinite-game-of-life
cd infinite-game-of-life
npm test
npm run build
xdg-open dist/index.html
```

macOS: same, but the last line is `open dist/index.html`.  
Windows (PowerShell): same, but the last line is `start dist\index.html`.

`npm test` runs the engine tests (it should end with "All tests passed"; it takes a few seconds). `npm run build` writes `dist/index.html`, one self-contained page that works from a file, without a server. The page loads its fonts from Google Fonts; offline it falls back to system fonts.

Without npm the same commands are `node src/test.js` and `node src/build.js`.

Works the same on Linux, macOS and Windows: the build only uses Node's `path` and `fs`, and the game runs in any current browser (Chrome, Firefox, Safari, Edge).
