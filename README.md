# Tic Tac Toe in WASM (Rust)

A small Tic Tac Toe game with game logic in Rust compiled to WebAssembly.

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
