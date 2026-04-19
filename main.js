import init, { Cell, Game } from "./pkg/tic_tac_toe_wasm.js";
import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { EffectComposer } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "https://unpkg.com/three@0.164.1/examples/jsm/environments/RoomEnvironment.js";

const statusEl = document.getElementById("status");
const resetButton = document.getElementById("reset");
const viewport = document.getElementById("viewport");

const labels = {
  [Cell.Empty]: "",
  [Cell.X]: "X",
  [Cell.O]: "O",
};

const cameraAnchors = {
  neutral: new THREE.Vector3(0, 7.5, 9.25),
  xTurn: new THREE.Vector3(-2.3, 7.7, 8.6),
  oTurn: new THREE.Vector3(2.3, 7.7, 8.6),
  win: new THREE.Vector3(0, 6.2, 6.5),
  draw: new THREE.Vector3(0, 9.5, 11.2),
};

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
let cameraTarget = cameraAnchors.neutral.clone();

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

  statusEl.textContent = `Current player: ${labels[game.current_player()]}`;
}

function buildCellGeometry() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 1.8), baseCellMaterial.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildXPiece() {
  const group = new THREE.Group();

  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.28), pbrMaterialX);
    bar.rotation.y = angle;
    bar.castShadow = true;
    group.add(bar);
  }

  return group;
}

function buildOPiece() {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.14, 24, 64), pbrMaterialO);
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  return mesh;
}

function boardToWorld(i) {
  const row = Math.floor(i / 3);
  const col = i % 3;
  return new THREE.Vector3((col - 1) * 2.1, 0, (row - 1) * 2.1);
}

function spawnConfetti(color, center) {
  const count = 110;
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = center.x + (Math.random() - 0.5) * 0.25;
    positions[i * 3 + 1] = center.y + 0.65;
    positions[i * 3 + 2] = center.z + (Math.random() - 0.5) * 0.25;

    velocities.push(
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.07,
        Math.random() * 0.11 + 0.03,
        (Math.random() - 0.5) * 0.07
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

function renderBoardState() {
  for (let i = 0; i < 9; i++) {
    const existing = cells[i].userData.value;
    const value = game.get_cell(i);
    if (existing === Cell.Empty && value !== Cell.Empty) {
      addPiece(i, value);
    }

    cells[i].userData.value = value;
    const playable = game.winner() === Cell.Empty && !game.is_draw() && value === Cell.Empty;
    cells[i].material.color.setHex(playable ? 0x23304a : 0x121a2a);
  }

  const winner = game.winner();
  if (winner !== Cell.Empty && !scene.userData.winnerCelebrated) {
    const winnerColor = winner === Cell.X ? 0x57b3ff : 0xff6f91;
    spawnConfetti(winnerColor, new THREE.Vector3(0, 0.4, 0));
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

  for (let i = 0; i < 9; i++) {
    cells[i].userData.value = Cell.Empty;
  }

  scene.userData.winnerCelebrated = false;
  scene.userData.drawCelebrated = false;
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

  camera.position.lerp(cameraTarget, 0.05);
  camera.lookAt(0, 0, 0);

  boardGroup.rotation.y += 0.0014;
  composer.render();
}

function onResize() {
  const width = viewport.clientWidth;
  const height = Math.max(360, viewport.clientHeight);

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
  camera.position.copy(cameraAnchors.neutral);
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

  renderer.domElement.addEventListener("click", onClick);
  renderer.domElement.addEventListener("pointerdown", () => ensureAudio(), { once: true });
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
    cameraTarget.copy(cameraAnchors.neutral);
    renderBoardState();
  });
}

run();
