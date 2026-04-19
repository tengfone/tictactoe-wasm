# Tic Tac Toe in WASM + WebGL (Rust)

A Tic Tac Toe demo where game rules run in Rust/WebAssembly and the board is rendered in WebGL using Three.js.

## Notes on scope

This is a polished demo-style implementation, not a true "AAA" production game pipeline. It focuses on:

- Rust + WASM gameplay logic
- interactive 3D board and pieces
- smooth piece spawn animation and dynamic lighting

## Prerequisites

- Rust (stable)
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/)

## Build WASM package

```bash
wasm-pack build --target web
```

This generates a `pkg/` folder used by `main.js`.

## Run locally

Serve this folder with a static file server after building:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.
