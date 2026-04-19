import init, { Cell, Game } from "./pkg/tic_tac_toe_wasm.js";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const statusEl = document.getElementById("status");
const modeToggle = document.getElementById("mode-toggle");
const modeChip = document.getElementById("mode");
const resetButton = document.getElementById("reset");
const viewport = document.getElementById("viewport");

const labels = {
  [Cell.Empty]: "",
  [Cell.X]: "X",
  [Cell.O]: "O",
};

const cameraAnchors = {
  intro: new THREE.Vector3(0, 11.2, 13.8),
  neutral: new THREE.Vector3(0, 7.5, 9.25),
  xTurn: new THREE.Vector3(-2.3, 7.7, 8.6),
  oTurn: new THREE.Vector3(2.3, 7.7, 8.6),
  win: new THREE.Vector3(0, 6.2, 6.5),
  draw: new THREE.Vector3(0, 9.5, 11.2),
};

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 0.95 },
    darkness: { value: 1.15 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vig = smoothstep(0.9, 0.15, dot(uv, uv));
      color.rgb *= mix(darkness, 1.0, vig);
      gl_FragColor = color;
    }
  `,
};

let game;
let scene;
let camera;
let renderer;
let composer;
let raycaster;
let pointer;
let cells = [];
let pieces = [];
let confettiBursts = [];
let boardGroup;
let pbrMaterialX;
let pbrMaterialO;
let baseCellMaterial;
let audioCtx;
let cameraTarget = cameraAnchors.intro.clone();
let hoveredCell = null;
let ghostPiece = null;
let winBeam = null;
let winBeamProgress = 0;
let vsComputer = true;
let aiThinking = false;
let aiMoveToken = 0;

const PLAYER_HUMAN = Cell.X;
const PLAYER_AI = Cell.O;

function refreshModeChip() {
  if (!modeChip) {
    return;
  }

  modeChip.textContent = vsComputer ? "Mode: Smart AI" : "Mode: Human vs Human";
}

function refreshModeButton() {
  if (!modeToggle) {
    return;
  }

  modeToggle.textContent = vsComputer ? "Play 1v1" : "Play vs Computer";
}

function tryHaptic(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playTone(frequency, duration, type = "sine", volume = 0.03) {
  ensureAudio();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + duration);
}

function playMoveSfx(cell) {
  if (cell === Cell.X) {
    playTone(540, 0.12, "triangle", 0.04);
  } else {
    playTone(390, 0.12, "triangle", 0.04);
  }
}

function playWinSfx() {
  playTone(523.25, 0.15, "square", 0.045);
  setTimeout(() => playTone(659.25, 0.18, "square", 0.04), 80);
  setTimeout(() => playTone(783.99, 0.22, "square", 0.035), 160);
}

function playDrawSfx() {
  playTone(220, 0.13, "sawtooth", 0.03);
  setTimeout(() => playTone(196, 0.13, "sawtooth", 0.025), 110);
}

function updateStatus() {
  if (game.winner() !== Cell.Empty) {
    statusEl.textContent = `${labels[game.winner()]} wins!`;
    return;
  }

  if (game.is_draw()) {
    statusEl.textContent = "Draw game.";
    return;
  }

  const current = game.current_player() === PLAYER_HUMAN ? "You" : "Computer";
  const turn = vsComputer ? `Turn: ${current}` : `Turn: ${labels[game.current_player()]}`;
  statusEl.textContent = turn;
}

function buildCellGeometry() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 1.8), baseCellMaterial.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildXPiece(material = pbrMaterialX) {
  const group = new THREE.Group();

  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.28), material);
    bar.rotation.y = angle;
    bar.castShadow = true;
    group.add(bar);
  }

  return group;
}

function buildOPiece(material = pbrMaterialO) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.14, 24, 64), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  return mesh;
}

function buildGhostPiece() {
  const ghostMatX = new THREE.MeshPhysicalMaterial({
    color: 0x8ec9ff,
    transparent: true,
    opacity: 0.35,
    metalness: 0.72,
    roughness: 0.32,
    envMapIntensity: 1.4,
  });
  const ghostMatO = new THREE.MeshPhysicalMaterial({
    color: 0xffacc0,
    transparent: true,
    opacity: 0.35,
    metalness: 0.7,
    roughness: 0.33,
    envMapIntensity: 1.4,
  });

  const x = buildXPiece(ghostMatX);
  const o = buildOPiece(ghostMatO);

  const group = new THREE.Group();
  group.add(x);
  group.add(o);

  x.visible = false;
  o.visible = false;
  group.visible = false;
  group.position.y = 0.28;

  return { group, x, o };
}

function boardToWorld(i) {
  const row = Math.floor(i / 3);
  const col = i % 3;
  return new THREE.Vector3((col - 1) * 2.1, 0, (row - 1) * 2.1);
}

function calculateWinningLine() {
  for (const [a, b, c] of WIN_LINES) {
    const va = game.get_cell(a);
    const vb = game.get_cell(b);
    const vc = game.get_cell(c);

    if (va !== Cell.Empty && va === vb && vb === vc) {
      return [a, c, va];
    }
  }

  return null;
}

function boardFromGame() {
  const board = [];
  for (let i = 0; i < 9; i++) {
    board.push(game.get_cell(i));
  }
  return board;
}

function boardWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    const aVal = board[a];
    if (aVal !== Cell.Empty && aVal === board[b] && aVal === board[c]) {
      return aVal;
    }
  }

  return Cell.Empty;
}

function boardMoves(board) {
  const moves = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === Cell.Empty) {
      moves.push(i);
    }
  }
  return moves;
}

function evaluateBoard(board, depth) {
  const winner = boardWinner(board);

  if (winner === PLAYER_AI) {
    return 1000 - depth;
  }

  if (winner === PLAYER_HUMAN) {
    return -1000 + depth;
  }

  if (boardMoves(board).length === 0) {
    return 0;
  }

  return null;
}

function minimax(board, depth, player) {
  const score = evaluateBoard(board, depth);
  if (score !== null) {
    return score;
  }

  const moves = boardMoves(board);
  const maximizing = player === PLAYER_AI;
  let bestScore = maximizing ? -Infinity : Infinity;
  const nextPlayer = player === PLAYER_HUMAN ? PLAYER_AI : PLAYER_HUMAN;

  for (const move of moves) {
    board[move] = player;
    const childScore = minimax(board, depth + 1, nextPlayer);
    board[move] = Cell.Empty;

    if (maximizing) {
      bestScore = Math.max(bestScore, childScore);
      if (bestScore >= 1000 - depth) {
        return bestScore;
      }
    } else {
      bestScore = Math.min(bestScore, childScore);
      if (bestScore <= -1000 + depth) {
        return bestScore;
      }
    }
  }

  return bestScore;
}

function chooseSmartMove() {
  const board = boardFromGame();
  let bestMove = -1;
  let bestScore = -Infinity;

  const moves = boardMoves(board);
  if (moves.length === 0) {
    return -1;
  }

  for (const move of moves) {
    board[move] = PLAYER_AI;
    const score = minimax(board, 1, PLAYER_HUMAN);
    board[move] = Cell.Empty;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

function playComputerTurn() {
  if (!vsComputer) {
    return;
  }

  if (game.winner() !== Cell.Empty || game.is_draw() || game.current_player() !== PLAYER_AI) {
    return;
  }

  if (aiThinking) {
    return;
  }

  aiThinking = true;
  const token = ++aiMoveToken;
  const move = chooseSmartMove();
  statusEl.textContent = "Computer is thinking…";

  setTimeout(() => {
    if (token !== aiMoveToken) {
      aiThinking = false;
      return;
    }

    if (game.winner() !== Cell.Empty || game.is_draw() || game.current_player() !== PLAYER_AI) {
      aiThinking = false;
      return;
    }

    if (move >= 0 && game.play(move)) {
      renderBoardState();
      updateGhost();
    }

    aiThinking = false;
    updateStatus();
  }, 240);
}

function showWinBeam(line) {
  if (!line) {
    return;
  }

  const [startCell, endCell, winner] = line;
  const start = boardToWorld(startCell);
  const end = boardToWorld(endCell);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);

  const direction = end.clone().sub(start);
  const fullLength = direction.length();
  winBeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, fullLength, 0.22),
    new THREE.MeshStandardMaterial({
      color: winner === Cell.X ? 0x57b3ff : 0xff6f91,
      emissive: winner === Cell.X ? 0x204e80 : 0x53203a,
      emissiveIntensity: 0.74,
      transparent: true,
      opacity: 0.95,
      metalness: 0.35,
      roughness: 0.26,
    })
  );

  winBeam.position.set(midpoint.x, 0.52, midpoint.z);
  winBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  winBeam.scale.set(1, 0.001, 1);
  winBeam.userData.fullLength = fullLength;
  winBeam.renderOrder = 2;
  scene.add(winBeam);
  winBeamProgress = 0;
}

function spawnConfetti(color, center) {
  const count = 140;
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = center.x + (Math.random() - 0.5) * 0.25;
    positions[i * 3 + 1] = center.y + 0.65;
    positions[i * 3 + 2] = center.z + (Math.random() - 0.5) * 0.25;

    velocities.push(
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.085,
        Math.random() * 0.12 + 0.04,
        (Math.random() - 0.5) * 0.085
      )
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color,
    size: 0.09,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);
  confettiBursts.push({ points, velocities, life: 1.45 });
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

  playMoveSfx(cell);
  tryHaptic(18);
}

function setCameraMood() {
  if (game.winner() !== Cell.Empty) {
    cameraTarget.copy(cameraAnchors.win);
    return;
  }

  if (game.is_draw()) {
    cameraTarget.copy(cameraAnchors.draw);
    return;
  }

  cameraTarget.copy(game.current_player() === Cell.X ? cameraAnchors.xTurn : cameraAnchors.oTurn);
}

function updateGhost() {
  if (!ghostPiece) {
    return;
  }

  const gameFinished = game.winner() !== Cell.Empty || game.is_draw();
  if (gameFinished || !hoveredCell || hoveredCell.userData.value !== Cell.Empty) {
    ghostPiece.group.visible = false;
    return;
  }

  ghostPiece.group.visible = true;
  ghostPiece.x.visible = game.current_player() === Cell.X;
  ghostPiece.o.visible = game.current_player() === Cell.O;
  ghostPiece.group.position.copy(hoveredCell.position).add(new THREE.Vector3(0, 0.28, 0));
}

function updateHoverVisuals() {
  for (const cell of cells) {
    const value = cell.userData.value;
    const playable = game.winner() === Cell.Empty && !game.is_draw() && value === Cell.Empty;

    if (!playable) {
      cell.material.color.setHex(0x121a2a);
      cell.position.y = THREE.MathUtils.lerp(cell.position.y, 0, 0.18);
      continue;
    }

    const isHovered = hoveredCell === cell;
    cell.material.color.setHex(isHovered ? 0x2f4f88 : 0x23304a);
    cell.position.y = THREE.MathUtils.lerp(cell.position.y, isHovered ? 0.08 : 0, 0.18);
  }
}

function renderBoardState() {
  for (let i = 0; i < 9; i++) {
    const existing = cells[i].userData.value;
    const value = game.get_cell(i);
    if (existing === Cell.Empty && value !== Cell.Empty) {
      addPiece(i, value);
    }

    cells[i].userData.value = value;
  }

  const winner = game.winner();
  if (winner !== Cell.Empty && !scene.userData.winnerCelebrated) {
    const winnerColor = winner === Cell.X ? 0x57b3ff : 0xff6f91;
    spawnConfetti(winnerColor, new THREE.Vector3(0, 0.4, 0));
    showWinBeam(calculateWinningLine());
    playWinSfx();
    tryHaptic([30, 20, 40]);
    scene.userData.winnerCelebrated = true;
  } else if (game.is_draw() && !scene.userData.drawCelebrated) {
    spawnConfetti(0xffffff, new THREE.Vector3(0, 0.4, 0));
    playDrawSfx();
    tryHaptic([20, 20, 20]);
    scene.userData.drawCelebrated = true;
  }

  setCameraMood();
  updateStatus();
}

function resetScenePieces() {
  for (const { piece } of pieces) {
    boardGroup.remove(piece);
  }
  pieces = [];

  for (const burst of confettiBursts) {
    scene.remove(burst.points);
    burst.points.geometry.dispose();
    burst.points.material.dispose();
  }
  confettiBursts = [];

  if (winBeam) {
    scene.remove(winBeam);
    winBeam.geometry.dispose();
    winBeam.material.dispose();
    winBeam = null;
    winBeamProgress = 0;
  }

  hoveredCell = null;

  for (let i = 0; i < 9; i++) {
    cells[i].userData.value = Cell.Empty;
    cells[i].position.y = 0;
  }

  scene.userData.winnerCelebrated = false;
  scene.userData.drawCelebrated = false;
}

function pickCell(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(cells).find((item) => item.object.userData.index !== undefined);
  return hit ? hit.object : null;
}

function onPointerMove(event) {
  hoveredCell = pickCell(event);
  updateGhost();
}

function onClick(event) {
  if (aiThinking || (vsComputer && game.current_player() !== PLAYER_HUMAN)) {
    return;
  }

  const picked = pickCell(event);
  if (!picked) {
    return;
  }

  const index = picked.userData.index;
  if (game.play(index)) {
    renderBoardState();
    updateGhost();
    playComputerTurn();
  }
}

function updateConfetti(delta) {
  for (let i = confettiBursts.length - 1; i >= 0; i--) {
    const burst = confettiBursts[i];
    burst.life -= delta;

    const pos = burst.points.geometry.attributes.position;
    for (let p = 0; p < burst.velocities.length; p++) {
      const v = burst.velocities[p];
      v.y -= 0.0017;

      pos.array[p * 3] += v.x;
      pos.array[p * 3 + 1] += v.y;
      pos.array[p * 3 + 2] += v.z;
    }

    pos.needsUpdate = true;
    burst.points.material.opacity = Math.max(0, burst.life / 1.45);

    if (burst.life <= 0) {
      scene.remove(burst.points);
      burst.points.geometry.dispose();
      burst.points.material.dispose();
      confettiBursts.splice(i, 1);
    }
  }
}

function animateWinBeam() {
  if (!winBeam || winBeamProgress >= 1) {
    return;
  }

  winBeamProgress = Math.min(1, winBeamProgress + 0.045);
  winBeam.scale.y = THREE.MathUtils.lerp(0.001, winBeam.userData.fullLength, winBeamProgress);
  winBeam.material.opacity = 0.35 + 0.6 * Math.sin(winBeamProgress * Math.PI);
}

let prevTime = performance.now();
function animate(now) {
  requestAnimationFrame(animate);

  const delta = Math.min(0.033, (now - prevTime) / 1000);
  prevTime = now;

  for (const entry of pieces) {
    const t = Math.min(1, (now - entry.bornAt) / 240);
    const eased = 1 - Math.pow(1 - t, 3);
    entry.piece.scale.setScalar(eased);
  }

  updateConfetti(delta);
  updateHoverVisuals();
  updateGhost();
  animateWinBeam();

  camera.position.lerp(cameraTarget, 0.05);
  camera.lookAt(0, 0, 0);

  composer.render();
}

function onResize() {
  const width = viewport.clientWidth;
  const height = Math.max(260, viewport.clientHeight);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height, false);
  composer.setSize(width, height);
}

function setup3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050914);
  scene.userData.winnerCelebrated = false;
  scene.userData.drawCelebrated = false;

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.copy(cameraAnchors.intro);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  viewport.appendChild(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.08).texture;
  scene.environment = envTexture;
  pmrem.dispose();

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.86);
  composer.addPass(bloomPass);

  const vignettePass = new ShaderPass(VignetteShader);
  composer.addPass(vignettePass);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(7, 12, 8);
  key.castShadow = true;
  scene.add(key);
  scene.add(new THREE.AmbientLight(0x7f9dff, 0.5));

  baseCellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x23304a,
    metalness: 0.32,
    roughness: 0.47,
    clearcoat: 0.58,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.2,
  });

  pbrMaterialX = new THREE.MeshPhysicalMaterial({
    color: 0x57b3ff,
    metalness: 0.82,
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.13,
    envMapIntensity: 1.6,
  });

  pbrMaterialO = new THREE.MeshPhysicalMaterial({
    color: 0xff6f91,
    metalness: 0.78,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.6,
  });

  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8.5, 0.4, 50),
    new THREE.MeshPhysicalMaterial({
      color: 0x10182a,
      metalness: 0.45,
      roughness: 0.63,
      envMapIntensity: 1.2,
    })
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

  ghostPiece = buildGhostPiece();
  boardGroup.add(ghostPiece.group);

  renderer.domElement.addEventListener("click", onClick);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", () => {
    hoveredCell = null;
    updateGhost();
  });
  renderer.domElement.addEventListener("pointerdown", () => ensureAudio(), { once: true });
  window.addEventListener("resize", onResize);

  onResize();
  requestAnimationFrame(animate);
}

if (modeToggle) {
  modeToggle.addEventListener("click", () => {
    vsComputer = !vsComputer;
    aiMoveToken += 1;
    aiThinking = false;

    refreshModeChip();
    refreshModeButton();
    renderBoardState();

    if (vsComputer && game.current_player() === PLAYER_AI && !game.winner() && !game.is_draw()) {
      playComputerTurn();
    }
  });
}

async function run() {
  await init();
  game = new Game();
  setup3D();
  renderBoardState();
  refreshModeChip();
  refreshModeButton();
  if (vsComputer && game.current_player() === PLAYER_AI) {
    playComputerTurn();
  }

  setTimeout(() => {
    cameraTarget.copy(cameraAnchors.neutral);
  }, 260);

  resetButton.addEventListener("click", () => {
    aiMoveToken += 1;
    aiThinking = false;
    game.reset();
    resetScenePieces();
    cameraTarget.copy(cameraAnchors.neutral);
    renderBoardState();

    if (vsComputer && game.current_player() === PLAYER_AI) {
      playComputerTurn();
    }
  });
}

run();
