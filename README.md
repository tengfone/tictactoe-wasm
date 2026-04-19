# Tic Tac Toe in WASM + WebGL (Rust)

A static-deployable Tic Tac Toe demo where gameplay rules run in Rust/WebAssembly and rendering uses WebGL (Three.js).

## Feature set

- Rust + WASM gameplay logic (win/draw validation in `src/lib.rs`)
- WebGL renderer with post-processing bloom + vignette
- Cinematic camera transitions by game state
- PBR materials with environment lighting
- Win/draw confetti particle celebrations
- Sound effects + mobile haptic feedback

## Local development

### Prerequisites

- Rust (stable)
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/)

### Build WASM package

```bash
wasm-pack build --target web
```

This generates a `pkg/` folder used by `main.js`.

### Run locally

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## GitHub Pages deployment

This repo includes `.github/workflows/deploy-pages.yml`.

1. Push this project to a GitHub repo.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`.

The action will:

- build the WASM package with `wasm-pack`
- upload the site as a static artifact
- deploy automatically to GitHub Pages

## Notes

This is still a compact demo, not a full AAA production pipeline, but it now includes many "AAA-style" presentation features.
