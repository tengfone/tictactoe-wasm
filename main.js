import init, { Cell, Game } from "./pkg/tic_tac_toe_wasm.js";
import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const statusEl = document.getElementById("status");
const resetButton = document.getElementById("reset");
const viewport = document.getElementById("viewport");

const labels = {
  [Cell.Empty]: "",
  [Cell.X]: "X",
  [Cell.O]: "O",
};

let game;
let scene;
let camera;
let renderer;
let raycaster;
let pointer;
let cells = [];
let pieces = [];
let boardGroup;

function updateStatus() {
  if (game.winner() !== Cell.Empty) {
    statusEl.textContent = `${labels[game.winner()]} wins!`;
    return;
  }

  if (game.is_draw()) {
    statusEl.textContent = "Draw game.";
    return;
  }

  statusEl.textContent = `Current player: ${labels[game.current_player()]}`;
}

function buildCellGeometry() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.2, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x1f2637, metalness: 0.2, roughness: 0.65 })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildXPiece() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x57b3ff, metalness: 0.5, roughness: 0.35, emissive: 0x0c2740 });

  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.2, 0.25), mat);
    bar.rotation.y = angle;
    bar.castShadow = true;
    group.add(bar);
  }

  return group;
}

function buildOPiece() {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.14, 24, 64),
    new THREE.MeshStandardMaterial({ color: 0xff6f91, metalness: 0.5, roughness: 0.35, emissive: 0x421421 })
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  return mesh;
}

function boardToWorld(i) {
  const row = Math.floor(i / 3);
  const col = i % 3;
  return new THREE.Vector3((col - 1) * 2.1, 0, (row - 1) * 2.1);
}

function addPiece(index, cell) {
  let piece;
  if (cell === Cell.X) {
    piece = buildXPiece();
  } else if (cell === Cell.O) {
    piece = buildOPiece();
  } else {
    return;
  }

  const pos = boardToWorld(index);
  piece.position.set(pos.x, 0.28, pos.z);
  piece.scale.setScalar(0.001);
  boardGroup.add(piece);
  pieces.push({ piece, bornAt: performance.now() });
}

function renderBoardState() {
  for (let i = 0; i < 9; i++) {
    const existing = cells[i].userData.value;
    const value = game.get_cell(i);
    if (existing === Cell.Empty && value !== Cell.Empty) {
      addPiece(i, value);
    }

    cells[i].userData.value = value;
    const playable = game.winner() === Cell.Empty && !game.is_draw() && value === Cell.Empty;
    cells[i].material.color.setHex(playable ? 0x1f2637 : 0x151b28);
  }

  updateStatus();
}

function resetScenePieces() {
  for (const { piece } of pieces) {
    boardGroup.remove(piece);
  }
  pieces = [];

  for (let i = 0; i < 9; i++) {
    cells[i].userData.value = Cell.Empty;
  }
}

function onClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(cells).find((item) => item.object.userData.index !== undefined);
  if (!hit) {
    return;
  }

  const index = hit.object.userData.index;
  if (game.play(index)) {
    renderBoardState();
  }
}

function animate(now) {
  requestAnimationFrame(animate);

  for (const entry of pieces) {
    const t = Math.min(1, (now - entry.bornAt) / 220);
    const eased = 1 - Math.pow(1 - t, 3);
    entry.piece.scale.setScalar(eased);
  }

  boardGroup.rotation.y += 0.0012;
  renderer.render(scene, camera);
}

function onResize() {
  const width = viewport.clientWidth;
  const height = Math.max(360, viewport.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function setup3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b13);

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 7.5, 9.25);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.appendChild(renderer.domElement);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(7, 12, 8);
  key.castShadow = true;
  scene.add(key);

  scene.add(new THREE.AmbientLight(0x89a8ff, 0.4));

  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8.5, 0.4, 50),
    new THREE.MeshStandardMaterial({ color: 0x10182a, metalness: 0.35, roughness: 0.8 })
  );
  floor.position.y = -0.35;
  floor.receiveShadow = true;
  scene.add(floor);

  boardGroup = new THREE.Group();
  scene.add(boardGroup);

  for (let i = 0; i < 9; i++) {
    const cell = buildCellGeometry();
    const pos = boardToWorld(i);
    cell.position.set(pos.x, 0, pos.z);
    cell.userData.index = i;
    cell.userData.value = Cell.Empty;
    boardGroup.add(cell);
    cells.push(cell);
  }

  renderer.domElement.addEventListener("click", onClick);
  window.addEventListener("resize", onResize);
  onResize();
  requestAnimationFrame(animate);
}

async function run() {
  await init();
  game = new Game();
  setup3D();
  renderBoardState();

  resetButton.addEventListener("click", () => {
    game.reset();
    resetScenePieces();
    renderBoardState();
  });
}

run();
