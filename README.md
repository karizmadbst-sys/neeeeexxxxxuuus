# NEXUS ROYALE

> *"100 fighters... only one survivor."*

**NEXUS ROYALE** is a cross-platform 3D Battle Royale game built with **TypeScript**, **Three.js**, **WebGL**, **HTML5**, **CSS3**, and **Vite**, engineered from the ground up to scale from low-end Android phones and tablets to high-end desktop PCs.

---

## Features

- Strict TypeScript + Vite + Express/WebSocket full-stack architecture
- Three.js WebGL renderer with ACES Filmic tone mapping, sRGB output, RoomEnvironment PBR reflections, and Software-WebGL protection
- Adaptive device & performance tier detection (`low-end-mobile`, `mid-mobile`, `tablet`, `low-end-pc`, `mid-pc`, `high-end-pc`)
- Portrait & Landscape responsive viewport manager with customizable touch & desktop controls
- 3D Military Forward Operating Base lobby with customizable operator skins, outfits, armor presets, and tactical pet companions
- Three full battlegrounds (**Desert**, **Forest**, **Snow**) with procedural buildings, destructible windows, loot tables, and shrinking safe zones
- Game modes: **Battle Royale (50 AI Bots)**, **Ranked Online Multiplayer** (authoritative WebSocket match server + RP tiers + leaderboard), and **Practice Arena**
- Full arsenal of 15 weapons + melee fists (SMGs, Assault Rifles, Shotguns, Sniper Rifles including variable 4x/6x/8x AWM scope, Pistols, Knife, and Baseball Bat) plus armor, helmets, backpacks, optics, and consumables
- **Armory & Shop** powered by **NX Credits**: earn credits from Battle Royale & Ranked matches to unlock and equip outfits, custom drop gliders, and helipad beacons

---

## Requirements

- **Node.js**: `>= 22.x` (LTS recommended)
- **npm**: `>= 10.x`
- **Browser**: Any modern WebGL / WebGL2 capable browser (Chrome, Firefox, Safari, Edge, Android WebView)

---

## Installation

```bash
npm install
```

---

## npm Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the Express + Vite + WebSocket server on port `3000` (`0.0.0.0`) |
| `npm run build` | Builds the optimized production bundle into `dist/` |
| `npm run start` | Runs the production Express + WebSocket server via `node server.ts` |
| `npm run lint` | Runs TypeScript type-checking (`tsc --noEmit`) |
| `npm run clean` | Removes `dist/` build artifacts |

---

## Development

1. Start the local dev server:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:3000` in your browser (or use browser DevTools to test Portrait/Landscape mobile & tablet viewports).
3. Run static type checks anytime:
   ```bash
   npm run lint
   ```

---

## Production Build

```bash
npm run build
```

This generates static, minified assets in `dist/` with Three.js split into its own cacheable vendor chunk (`manualChunks: { three: ['three'] }`).

Preview the production bundle locally:
```bash
npm run preview
```

---

## GitHub Pages Deployment Preparation

`vite.config.ts` uses `base: process.env.VITE_BASE_PATH || './'`, making the production `dist/` output portable for GitHub Pages project repositories (e.g., `https://<username>.github.io/nexus-royale/`) as well as custom domains.

### Option A: Automated Deployment via GitHub Actions

Create `.github/workflows/deploy.yml` in your repository:

```yaml
name: Deploy NEXUS ROYALE to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
        env:
          VITE_BASE_PATH: /${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Then in your GitHub repository **Settings → Pages → Source**, select **GitHub Actions**.
