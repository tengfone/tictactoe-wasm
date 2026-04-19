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
const scoreEl = document.getElementById("score");
const resetButton = document.getElementById("reset");
const viewport = document.getElementById("viewport");
const qualityToggle = document.getElementById("quality-toggle");
const difficultyToggle = document.getElementById("difficulty-toggle");
const soundToggle = document.getElementById("sound-toggle");
const replayButton = document.getElementById("replay-button");
const resetScoreButton = document.getElementById("reset-score");
const moveLogEl = document.getElementById("move-log");

const scoreKey = "ttt-wasm-score-v2";
const qualityKey = "ttt-wasm-quality-v1";
const settingsKey = "ttt-wasm-settings-v1";
const matchKey = "ttt-wasm-last-match-v1";
const SETTINGS_TEMPLATE = {
  soundEnabled: true,
  aiDifficulty: "easy",
  quality: "balanced",
};
const SCORE_TEMPLATE = {
  vsComputer: { you: 0, ai: 0, draw: 0 },
  vsHuman: { x: 0, o: 0, draw: 0 },
};
const baseScoreTemplate = () => ({
  vsComputer: { ...SCORE_TEMPLATE.vsComputer },
  vsHuman: { ...SCORE_TEMPLATE.vsHuman },
});

const QUALITY_MODES = ["performance", "balanced", "cinematic"];
const DIFFICULTY_MODES = ["easy", "smart", "master"];
const AI_DIFFICULTY_LABELS = {
  easy: "Easy",
  smart: "Smart",
  master: "Master",
};
const DIFFICULTY_KEY_MAP = {
  easy: 0.22,
  smart: 0.35,
  master: 1,
};
const QUALITY_PRESETS = {
  performance: {
    label: "Performance",
    maxPixelRatio: 1,
    toneExposure: 0.96,
    toneMapping: THREE.ACESFilmicToneMapping,
    bloom: { strength: 0.22, radius: 0.34, threshold: 0.92 },
    vignette: { offset: 1.0, darkness: 1.0 },
    shadows: false,
    lights: { key: 1.85, fill: 0.22, rim: 0.16, ambient: 0.42 },
    confettiScale: 0.4,
  },
  balanced: {
    label: "Balanced",
    maxPixelRatio: 1.4,
    toneExposure: 1.0,
    toneMapping: THREE.ACESFilmicToneMapping,
    bloom: { strength: 0.46, radius: 0.48, threshold: 0.84 },
    vignette: { offset: 0.98, darkness: 1.08 },
    shadows: true,
    lights: { key: 2.05, fill: 0.34, rim: 0.2, ambient: 0.52 },
    confettiScale: 0.72,
  },
  cinematic: {
    label: "Cinematic",
    maxPixelRatio: 1.6,
    toneExposure: 1.04,
    toneMapping: THREE.ACESFilmicToneMapping,
    bloom: { strength: 0.54, radius: 0.56, threshold: 0.76 },
    vignette: { offset: 0.98, darkness: 1.06 },
    shadows: true,
    lights: { key: 2.35, fill: 0.48, rim: 0.24, ambient: 0.58 },
    confettiScale: 1,
  },
};

const CELL_LABELS = {
  [Cell.Empty]: "Empty",
  [Cell.X]: "X",
  [Cell.O]: "O",
};

const labels = {
  [Cell.Empty]: "",
  [Cell.X]: "X",
  [Cell.O]: "O",
};

const cameraAnchors = {
  intro: new THREE.Vector3(0, 8.6, 10.4),
  neutral: new THREE.Vector3(0, 6.35, 7.25),
  xTurn: new THREE.Vector3(-1.2, 6.25, 7.0),
  oTurn: new THREE.Vector3(1.2, 6.25, 7.0),
  win: new THREE.Vector3(0, 5.35, 6.05),
  draw: new THREE.Vector3(0, 7.6, 8.2),
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
let humanPlayerCell = Cell.X;
let aiPlayerCell = Cell.O;
let scoreState = loadScoreState();
let qualityMode = "cinematic";
let aiDifficulty = "smart";
let soundEnabled = true;
let moveHistory = [];
let bloomPass;
let vignettePass;
let keyLight;
let fillLight;
let rimLight;
let ambientLight;
let ambientGlow;
let starField;
let replayHandle = null;
let replayedMoves = [];
let replayIndex = 0;
let isReplaying = false;
let statusPulseTimer = null;

function refreshModeChip() {
  if (!modeChip) {
    return;
  }

  if (vsComputer) {
    modeChip.textContent = `Mode: ${AI_DIFFICULTY_LABELS[aiDifficulty]} AI (${humanPlayerCell === Cell.X ? "You are X" : "You are O"})`;
    return;
  }

  modeChip.textContent = "Mode: Human vs Human";
}

function formatCellReference(index) {
  const row = Math.floor(index / 3);
  const col = index % 3;
  return `R${row + 1}C${col + 1}`;
}

function appendMoveHistory(index, playerCell, playerAlias) {
  moveHistory.push({
    index,
    playerCell,
    playerAlias: playerAlias || (playerCell === Cell.X ? "X" : "O"),
    at: performance.now(),
    move: moveHistory.length + 1,
  });
  updateMoveLog();
}

function updateMoveLog(steps = moveHistory) {
  if (!moveLogEl) {
    return;
  }

  if (!steps.length) {
    moveLogEl.textContent = "Moves: none";
    return;
  }

  const labelsByMode = steps.map((entry, i) => {
    const alias = vsComputer && entry.playerAlias
      ? entry.playerAlias
      : (entry.playerCell === humanPlayerCell ? "You" : (vsComputer ? "AI" : CELL_LABELS[entry.playerCell] || "X"));
    return `${i + 1}. ${alias} → ${formatCellReference(entry.index)}`;
  });

  moveLogEl.textContent = `Moves: ${labelsByMode.join(" · ")}`;
}

function resetMoveLog() {
  moveHistory = [];
  updateMoveLog();
}

function parseReplayMove(entry) {
  const playerCell = entry?.playerCell;
  const index = Number(entry?.index);
  if (!Number.isInteger(index)) {
    return null;
  }

  if (playerCell !== Cell.X && playerCell !== Cell.O) {
    return null;
  }

  return { index, playerCell };
}

function saveLastMatch() {
  if (!window.localStorage) {
    return;
  }

  const isFinished = game.winner() !== Cell.Empty || game.is_draw();
  if (!isFinished) {
    return;
  }

  const payload = {
    vsComputer,
    moves: moveHistory.map((entry) => ({
      index: entry.index,
      playerCell: entry.playerCell,
      playerAlias: entry.playerAlias,
    })),
    winner: game.winner(),
    startedAt: moveHistory[0]?.at || Date.now(),
    endedAt: Date.now(),
    humanPlayerCell,
    aiPlayerCell,
    aiDifficulty,
  };

  try {
    window.localStorage.setItem(matchKey, JSON.stringify(payload));
  } catch (error) {
    console.warn("Unable to persist last match:", error);
  }
}

function loadLastMatch() {
  if (!window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(matchKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (!Array.isArray(parsed.moves) || parsed.moves.length === 0) {
      return null;
    }

    const normalizedMoves = [];
    for (const move of parsed.moves) {
      const parsedMove = parseReplayMove(move);
      if (parsedMove) {
        normalizedMoves.push(parsedMove);
      }
    }

    if (normalizedMoves.length === 0) {
      return null;
    }

    return {
      moves: normalizedMoves,
      winner: parsed.winner === Cell.X || parsed.winner === Cell.O ? parsed.winner : Cell.Empty,
      vsComputer: parsed.vsComputer === true,
      humanPlayerCell: parsed.humanPlayerCell === Cell.X || parsed.humanPlayerCell === Cell.O ? parsed.humanPlayerCell : Cell.X,
      aiPlayerCell: parsed.aiPlayerCell === Cell.X || parsed.aiPlayerCell === Cell.O ? parsed.aiPlayerCell : Cell.O,
      aiDifficulty: DIFFICULTY_MODES.includes(parsed.aiDifficulty) ? parsed.aiDifficulty : "smart",
    };
  } catch (error) {
    console.warn("Unable to load last match:", error);
    return null;
  }
}

function stopReplay() {
  if (replayHandle) {
    window.clearInterval(replayHandle);
    replayHandle = null;
  }

  isReplaying = false;
  replayedMoves = [];
  replayIndex = 0;
  refreshReplayButton();
}

function startReplay() {
  const match = loadLastMatch();
  if (!match) {
    statusEl.textContent = "No replay available yet";
    return;
  }

  isReplaying = true;
  replayedMoves = match.moves;
  replayIndex = 0;
  replayedMoves = replayedMoves.slice(0, 9);
  moveHistory = [];
  updateMoveLog([]);

  aiThinking = false;
  aiMoveToken += 1;
  game.reset();
  vsComputer = match.vsComputer;
  humanPlayerCell = match.humanPlayerCell || Cell.X;
  aiPlayerCell = match.aiPlayerCell || Cell.O;
  aiDifficulty = match.aiDifficulty || "smart";
  resetScenePieces();
  renderBoardState();
  refreshModeChip();
  refreshDifficultyButton();
  refreshQualityButton();
  refreshReplayButton();

  const replaySpeed = qualityMode === "performance" ? 420 : 580;
  statusEl.textContent = "Replaying last match…";
  replayHandle = window.setInterval(() => {
    if (!isReplaying) {
      stopReplay();
      return;
    }

    const next = replayedMoves[replayIndex];
    if (!next) {
      stopReplay();
      statusEl.textContent = "Replay complete.";
      return;
    }

    const moved = game.play(next.index);
    if (moved) {
      const playerAlias = vsComputer
        ? next.playerCell === humanPlayerCell
          ? "You"
          : "AI"
        : CELL_LABELS[next.playerCell] || "X";
      appendMoveHistory(next.index, next.playerCell, playerAlias);
      renderBoardState();
      replayIndex += 1;
    }

    if (replayIndex >= replayedMoves.length) {
      stopReplay();
      return;
    }
  }, replaySpeed);
}

function refreshModeButton() {
  if (!modeToggle) {
    return;
  }

  modeToggle.textContent = vsComputer ? "Play 1v1" : "Play vs Computer";
}

function refreshScoreChip() {
  if (!scoreEl) {
    return;
  }

  if (vsComputer) {
    scoreEl.textContent = `You ${scoreState.vsComputer.you} · AI ${scoreState.vsComputer.ai} · Draw ${scoreState.vsComputer.draw}`;
    return;
  }

  scoreEl.textContent = `X ${scoreState.vsHuman.x} · O ${scoreState.vsHuman.o} · Draw ${scoreState.vsHuman.draw}`;
}

function readSavedScore() {
  if (!window.localStorage) {
    return baseScoreTemplate();
  }

  try {
    const raw = window.localStorage.getItem(scoreKey);
    if (!raw) {
      return baseScoreTemplate();
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return baseScoreTemplate();
    }

    const normalizeSection = (section, expectedKeys) => {
      const normalized = {};
      for (const key of expectedKeys) {
        const value = Number(section?.[key]);
        normalized[key] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
      }
      return normalized;
    };

    return {
      vsComputer: normalizeSection(parsed.vsComputer, ["you", "ai", "draw"]),
      vsHuman: normalizeSection(parsed.vsHuman, ["x", "o", "draw"]),
    };
  } catch (error) {
    console.error("Unable to parse score state:", error);
    return baseScoreTemplate();
  }
}

function loadScoreState() {
  return readSavedScore();
}

function saveScoreState() {
  if (!window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(scoreKey, JSON.stringify(scoreState));
  } catch (error) {
    console.warn("Unable to persist score state:", error);
  }
}

function readSavedSettings() {
  if (!window.localStorage) {
    return { ...SETTINGS_TEMPLATE };
  }

  try {
    const raw = window.localStorage.getItem(settingsKey);
    if (!raw) {
      const legacyQuality = readSavedQuality();
      return {
        soundEnabled: SETTINGS_TEMPLATE.soundEnabled,
        aiDifficulty: SETTINGS_TEMPLATE.aiDifficulty,
        quality: QUALITY_MODES.includes(legacyQuality) ? legacyQuality : SETTINGS_TEMPLATE.quality,
      };
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...SETTINGS_TEMPLATE };
    }

    const value = (key) => {
      const candidate = parsed[key];
      return candidate === undefined ? SETTINGS_TEMPLATE[key] : candidate;
    };

    return {
      soundEnabled: Boolean(value("soundEnabled")),
      aiDifficulty: DIFFICULTY_MODES.includes(value("aiDifficulty")) ? value("aiDifficulty") : SETTINGS_TEMPLATE.aiDifficulty,
      quality: QUALITY_MODES.includes(value("quality")) ? value("quality") : SETTINGS_TEMPLATE.quality,
    };
  } catch (error) {
    console.warn("Unable to read settings:", error);
    return { ...SETTINGS_TEMPLATE };
  }
}

function saveSettings() {
  if (!window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(
      qualityKey,
      qualityMode
    );
    window.localStorage.setItem(
      settingsKey,
      JSON.stringify({
        soundEnabled,
        aiDifficulty,
        quality: qualityMode,
      })
    );
  } catch (error) {
    console.warn("Unable to persist settings:", error);
  }
}

function refreshQualityButton() {
  if (!qualityToggle) {
    return;
  }

  const preset = QUALITY_PRESETS[qualityMode];
  qualityToggle.textContent = `Quality: ${preset.label}`;
}

function refreshDifficultyButton() {
  if (!difficultyToggle) {
    return;
  }

  difficultyToggle.textContent = `AI: ${AI_DIFFICULTY_LABELS[aiDifficulty]}`;
}

function refreshSoundButton() {
  if (!soundToggle) {
    return;
  }

  soundToggle.textContent = `Sound: ${soundEnabled ? "On" : "Off"}`;
}

function refreshReplayButton() {
  if (!replayButton) {
    return;
  }

  replayButton.textContent = isReplaying ? "Stop Replay" : "Replay Last";
}

function readSavedQuality() {
  if (!window.localStorage) {
    return "balanced";
  }

  try {
    const raw = window.localStorage.getItem(qualityKey);
    return QUALITY_PRESETS[raw] ? raw : "balanced";
  } catch (error) {
    console.warn("Unable to load quality mode:", error);
    return "balanced";
  }
}

function applyQualityMode() {
  const preset = QUALITY_PRESETS[qualityMode];
  if (!renderer || !bloomPass || !vignettePass) {
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.maxPixelRatio));
  renderer.shadowMap.enabled = preset.shadows;
  renderer.toneMapping = preset.toneMapping;
  renderer.toneMappingExposure = preset.toneExposure;

  bloomPass.strength = preset.bloom.strength;
  bloomPass.radius = preset.bloom.radius;
  bloomPass.threshold = preset.bloom.threshold;

  vignettePass.uniforms.offset.value = preset.vignette.offset;
  vignettePass.uniforms.darkness.value = preset.vignette.darkness;

  keyLight.intensity = preset.lights.key;
  fillLight.intensity = preset.lights.fill;
  rimLight.intensity = preset.lights.rim;
  ambientLight.intensity = preset.lights.ambient;

  keyLight.castShadow = preset.shadows;
  if (keyLight.shadow && preset.shadows) {
    keyLight.shadow.mapSize.set(Math.round(1024 * preset.maxPixelRatio), Math.round(1024 * preset.maxPixelRatio));
    keyLight.shadow.radius = preset.label === "Performance" ? 2 : 3;
  }
}

function setQualityMode(nextMode) {
  if (!QUALITY_PRESETS[nextMode]) {
    return;
  }

  qualityMode = nextMode;
  applyQualityMode();
  refreshQualityButton();
  saveSettings();
}

function cycleQualityMode() {
  const currentIndex = QUALITY_MODES.indexOf(qualityMode);
  const nextIndex = (currentIndex + 1) % QUALITY_MODES.length;
  setQualityMode(QUALITY_MODES[nextIndex]);
}

function cycleDifficultyMode() {
  const currentIndex = DIFFICULTY_MODES.indexOf(aiDifficulty);
  const nextIndex = (currentIndex + 1) % DIFFICULTY_MODES.length;
  aiDifficulty = DIFFICULTY_MODES[nextIndex];
  refreshDifficultyButton();
  refreshModeChip();
  saveSettings();
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  refreshSoundButton();
  saveSettings();
}

function assignVsComputerRoles() {
  humanPlayerCell = Cell.X;
  aiPlayerCell = Cell.O;
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
  if (!soundEnabled) {
    return;
  }

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
  if (statusPulseTimer) {
    clearTimeout(statusPulseTimer);
  }

  if (!statusEl) {
    return;
  }

  statusEl.classList.remove("status--pulse");

  if (isReplaying) {
    const totalMoves = replayedMoves.length;
    const done = Math.min(replayIndex, totalMoves);
    statusEl.textContent = `Replay ${done}/${totalMoves}`;
    statusEl.classList.add("status--pulse");
    statusPulseTimer = window.setTimeout(() => {
      statusEl.classList.remove("status--pulse");
    }, 120);
    return;
  }

  if (game.winner() !== Cell.Empty) {
    const winnerText = labels[game.winner()];
    const winnerLabel = vsComputer
      ? winnerText === labels[humanPlayerCell]
        ? "You"
        : "Computer"
      : winnerText;
    statusEl.textContent = `${winnerLabel} wins!`;
    statusEl.classList.add("status--pulse");
    statusPulseTimer = window.setTimeout(() => {
      statusEl.classList.remove("status--pulse");
    }, 220);
    return;
  }

  if (game.is_draw()) {
    statusEl.textContent = "Draw game.";
    statusEl.classList.add("status--pulse");
    statusPulseTimer = window.setTimeout(() => {
      statusEl.classList.remove("status--pulse");
    }, 220);
    return;
  }

  const current = game.current_player() === humanPlayerCell ? "You" : "Computer";
  const turn = vsComputer ? `Turn: ${current}` : `Turn: ${labels[game.current_player()]}`;
  statusEl.textContent = turn;
  statusEl.classList.add("status--pulse");
  statusPulseTimer = window.setTimeout(() => {
    statusEl.classList.remove("status--pulse");
  }, 140);
}

function recordScore() {
  if (isReplaying) {
    return;
  }

  if (game.winner() !== Cell.Empty && !scene.userData.scoreRecorded) {
    const winner = game.winner();
    if (vsComputer) {
      if (winner === humanPlayerCell) {
        scoreState.vsComputer.you += 1;
      } else if (winner === aiPlayerCell) {
        scoreState.vsComputer.ai += 1;
      }
    } else {
      if (winner === Cell.X) {
        scoreState.vsHuman.x += 1;
      } else if (winner === Cell.O) {
        scoreState.vsHuman.o += 1;
      }
    }

    saveScoreState();
    refreshScoreChip();
    scene.userData.scoreRecorded = true;
    return;
  }

  if (game.is_draw() && !scene.userData.drawRecorded) {
    if (vsComputer) {
      scoreState.vsComputer.draw += 1;
    } else {
      scoreState.vsHuman.draw += 1;
    }

    saveScoreState();
    refreshScoreChip();
    scene.userData.drawRecorded = true;
  }
}

function maybeSaveMatchState() {
  if (game.winner() !== Cell.Empty || game.is_draw()) {
    saveLastMatch();
  }
}

function buildCellGeometry() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.22, 2.05), baseCellMaterial.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const hoverRing = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1.06, 48),
    new THREE.MeshStandardMaterial({
      color: 0x78ffe4,
      transparent: true,
      opacity: 0,
      emissive: 0x1d8a78,
      emissiveIntensity: 1.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  hoverRing.rotation.x = -Math.PI / 2;
  hoverRing.position.y = 0.11;
  hoverRing.renderOrder = 2;

  mesh.add(hoverRing);
  mesh.userData.hoverRing = hoverRing;
  return mesh;
}

function buildXPiece(material = pbrMaterialX) {
  const group = new THREE.Group();

  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.24, 0.3), material);
    bar.rotation.y = angle;
    bar.castShadow = true;
    group.add(bar);
  }

  group.rotation.y = Math.PI / 12;
  return group;
}

function buildOPiece(material = pbrMaterialO) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.15, 24, 64), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  mesh.scale.set(1.02, 1, 0.96);
  mesh.userData.spin = true;
  return mesh;
}

function buildGhostPiece() {
  const ghostMatX = new THREE.MeshPhysicalMaterial({
    color: 0x8cecff,
    transparent: true,
    opacity: 0.28,
    metalness: 0.72,
    roughness: 0.32,
    envMapIntensity: 1.4,
    emissive: 0x1c6f76,
    emissiveIntensity: 0.35,
  });
  const ghostMatO = new THREE.MeshPhysicalMaterial({
    color: 0xffd48b,
    transparent: true,
    opacity: 0.28,
    metalness: 0.7,
    roughness: 0.33,
    envMapIntensity: 1.4,
    emissive: 0x684311,
    emissiveIntensity: 0.28,
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
  return new THREE.Vector3((col - 1) * 2.32, 0, (row - 1) * 2.32);
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

  if (winner === aiPlayerCell) {
    return 1000 - depth;
  }

  if (winner === humanPlayerCell) {
    return -1000 + depth;
  }

  if (boardMoves(board).length === 0) {
    return 0;
  }

  return null;
}

function chooseEasyMove() {
  const moves = boardMoves(boardFromGame());
  if (moves.length === 0) {
    return -1;
  }

  return moves[Math.floor(Math.random() * moves.length)];
}

function chooseBalancedMove() {
  const board = boardFromGame();
  const moves = boardMoves(board);
  if (moves.length === 0) {
    return -1;
  }

  if (Math.random() < DIFFICULTY_KEY_MAP.smart) {
    return chooseSmartMove();
  }

  return moves[Math.floor(Math.random() * moves.length)];
}

function chooseAIMove() {
  if (aiDifficulty === "easy") {
    return chooseEasyMove();
  }

  if (aiDifficulty === "master") {
    return chooseSmartMove();
  }

  return chooseBalancedMove();
}

function minimax(board, depth, player) {
  const score = evaluateBoard(board, depth);
  if (score !== null) {
    return score;
  }

  const moves = boardMoves(board);
  const maximizing = player === aiPlayerCell;
  let bestScore = maximizing ? -Infinity : Infinity;
  const nextPlayer = player === humanPlayerCell ? aiPlayerCell : humanPlayerCell;

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
    board[move] = aiPlayerCell;
    const score = minimax(board, 1, humanPlayerCell);
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

  if (isReplaying) {
    return;
  }

  if (game.winner() !== Cell.Empty || game.is_draw() || game.current_player() !== aiPlayerCell) {
    return;
  }

  if (aiThinking) {
    return;
  }

  aiThinking = true;
  const token = ++aiMoveToken;
  const move = chooseAIMove();
  statusEl.textContent = "Computer is thinking…";
  const thinkingDelay =
    qualityMode === "performance" ? 150 : qualityMode === "balanced" ? 220 : 320;

  setTimeout(() => {
    if (token !== aiMoveToken) {
      aiThinking = false;
      return;
    }

    if (game.winner() !== Cell.Empty || game.is_draw() || game.current_player() !== aiPlayerCell) {
      aiThinking = false;
      return;
    }

    if (move >= 0 && game.play(move)) {
      appendMoveHistory(move, aiPlayerCell, aiPlayerCell === humanPlayerCell ? "You" : "Computer");
      renderBoardState();
      updateGhost();
    }

    aiThinking = false;
    updateStatus();
    maybeSaveMatchState();
  }, thinkingDelay);
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
      color: winner === Cell.X ? 0x56d9ff : 0xffbf62,
      emissive: winner === Cell.X ? 0x164f62 : 0x624113,
      emissiveIntensity: 0.74,
      transparent: true,
      opacity: 0.95,
      metalness: 0.35,
      roughness: 0.26,
    })
  );

  winBeam.position.set(midpoint.x, 0.52, midpoint.z);
  const flatDirection = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  winBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), flatDirection);
  winBeam.scale.set(1, 0.001, 1);
  winBeam.userData.fullLength = fullLength;
  winBeam.renderOrder = 2;
  scene.add(winBeam);
  winBeamProgress = 0;
}

function spawnConfetti(color, center) {
  const preset = QUALITY_PRESETS[qualityMode];
  const count = Math.max(12, Math.round(140 * preset.confettiScale));
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
    opacity: qualityMode === "performance" ? 0.8 : 0.95,
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
  piece.rotation.x = (Math.random() - 0.5) * 0.06;
  piece.rotation.z = (Math.random() - 0.5) * 0.08;
  piece.userData.player = cell;
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
  const pulse = 0.94 + 0.05 * (1 - Math.abs(Math.sin(performance.now() * 0.008)));
  ghostPiece.group.scale.set(pulse, pulse, pulse);
}

function updateHoverVisuals() {
  for (const cell of cells) {
    const value = cell.userData.value;
    const playable = game.winner() === Cell.Empty && !game.is_draw() && value === Cell.Empty;
    const hoverRing = cell.userData.hoverRing;

    if (!playable) {
      cell.material.color.setHex(0x0c1715);
      if (hoverRing) {
        hoverRing.material.opacity = 0;
        hoverRing.scale.setScalar(1);
      }

      cell.position.y = THREE.MathUtils.lerp(cell.position.y, 0, 0.18);
      continue;
    }

    const isHovered = hoveredCell === cell;
    cell.material.color.setHex(isHovered ? 0x1f5a50 : 0x18302c);
    cell.position.y = THREE.MathUtils.lerp(cell.position.y, isHovered ? 0.08 : 0, 0.18);
    if (hoverRing) {
      hoverRing.material.opacity = isHovered ? 0.96 : 0.12;
      hoverRing.scale.setScalar(isHovered ? 1.08 : 0.92);
      hoverRing.material.color.setHex(isHovered ? 0x91ffe8 : 0x42cbb4);
    }
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
    recordScore();
    const winnerColor = winner === Cell.X ? 0x56d9ff : 0xffbf62;
    spawnConfetti(winnerColor, new THREE.Vector3(0, 0.4, 0));
    showWinBeam(calculateWinningLine());
    playWinSfx();
    tryHaptic([30, 20, 40]);
    scene.userData.winnerCelebrated = true;
  } else if (game.is_draw() && !scene.userData.drawCelebrated) {
    recordScore();
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
  scene.userData.scoreRecorded = false;
  scene.userData.drawRecorded = false;

  boardGroup.rotation.set(0, 0, 0);
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
  if (isReplaying) {
    hoveredCell = null;
    updateGhost();
    return;
  }

  hoveredCell = pickCell(event);
  updateGhost();
}

function onPointerDown(event) {
  if (soundEnabled) {
    ensureAudio();
  }

  hoveredCell = pickCell(event);
  updateGhost();
}

function onClick(event) {
  if (
    isReplaying ||
    aiThinking ||
    (vsComputer && game.current_player() !== humanPlayerCell) ||
    game.winner() !== Cell.Empty ||
    game.is_draw()
  ) {
    return;
  }

  const picked = pickCell(event);
  if (!picked) {
    return;
  }

  const index = picked.userData.index;
  const moving = game.current_player();
  if (game.play(index)) {
    appendMoveHistory(index, moving, vsComputer ? (moving === humanPlayerCell ? "You" : "Computer") : CELL_LABELS[moving] || "X");
    renderBoardState();
    updateGhost();
    maybeSaveMatchState();
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

    const settle = Math.sin(t * Math.PI);
    entry.piece.position.y = 0.28 + 0.06 * (1 - t) * settle;
    entry.piece.rotation.y += 0.03 * (1 - t);
    if (entry.piece.userData.spin) {
      entry.piece.rotation.z += 0.02 * (1 - t);
    } else {
      entry.piece.rotation.x += 0.015 * (1 - t);
    }
  }

  updateConfetti(delta);
  updateHoverVisuals();
  updateGhost();
  animateWinBeam();

  const boardDrift = qualityMode === "performance" ? 0.0005 : 0.0015;
  boardGroup.rotation.y = Math.sin(now * boardDrift) * 0.01;
  boardGroup.rotation.z = Math.cos(now * (boardDrift * 0.7)) * 0.004;

  if (ambientGlow) {
    const glowPulse = 0.52 + 0.08 * Math.sin(now * 0.0011);
    ambientGlow.scale.setScalar(1 + glowPulse * 0.015);
    if (ambientGlow.material) {
      ambientGlow.material.opacity = Math.max(0.38, glowPulse);
    }
  }

  if (starField && starField.material) {
    starField.rotation.y += 0.00022;
    starField.rotation.z += 0.0001;
    starField.material.opacity = qualityMode === "performance" ? 0.32 : 0.42;
  }

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
  scene.background = new THREE.Color(0x04100d);
  scene.userData.winnerCelebrated = false;
  scene.userData.drawCelebrated = false;

  camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
  camera.position.copy(cameraAnchors.intro);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.domElement.style.touchAction = "none";
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

  bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.86);
  composer.addPass(bloomPass);

  vignettePass = new ShaderPass(VignetteShader);
  composer.addPass(vignettePass);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
  keyLight.position.set(7, 12, 8);
  keyLight.castShadow = true;
  scene.add(keyLight);

  fillLight = new THREE.PointLight(0x56d9ff, 0.5, 24, 1.6);
  fillLight.position.set(-5.2, 3.8, -4.2);
  scene.add(fillLight);

  rimLight = new THREE.PointLight(0xffbf62, 0.18, 20, 1.5);
  rimLight.position.set(0, 7, -8.5);
  scene.add(rimLight);

  ambientLight = new THREE.AmbientLight(0xb5ffe2, 0.5);
  scene.add(ambientLight);

  ambientGlow = new THREE.Mesh(
    new THREE.RingGeometry(2.8, 6.8, 72),
    new THREE.MeshBasicMaterial({
      color: 0x46f0c2,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ambientGlow.rotation.x = -Math.PI / 2;
  ambientGlow.position.y = 0.03;
  scene.add(ambientGlow);

  const starCount = qualityMode === "performance" ? 180 : 300;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    const radius = 18 + Math.random() * 26;
    const azimuth = Math.random() * Math.PI * 2;
    const elevation = Math.acos(Math.random() * 2 - 1);
    starPositions[i3] = radius * Math.sin(elevation) * Math.cos(azimuth);
    starPositions[i3 + 1] = radius * Math.cos(elevation);
    starPositions[i3 + 2] = radius * Math.sin(elevation) * Math.sin(azimuth);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starField = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0xd6e5ff,
      size: 0.05,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(starField);

  baseCellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x18302c,
    metalness: 0.32,
    roughness: 0.47,
    clearcoat: 0.58,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.2,
  });

  pbrMaterialX = new THREE.MeshPhysicalMaterial({
    color: 0x56d9ff,
    metalness: 0.82,
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.13,
    envMapIntensity: 1.6,
  });

  pbrMaterialO = new THREE.MeshPhysicalMaterial({
    color: 0xffbf62,
    metalness: 0.78,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.6,
  });

  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8.5, 0.4, 50),
    new THREE.MeshPhysicalMaterial({
      color: 0x091511,
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

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onClick);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", () => {
    hoveredCell = null;
    updateGhost();
  });
  window.addEventListener("resize", onResize);

  onResize();
  requestAnimationFrame(animate);
}

if (modeToggle) {
  modeToggle.addEventListener("click", () => {
    if (isReplaying) {
      stopReplay();
    }

    vsComputer = !vsComputer;
    aiMoveToken += 1;
    aiThinking = false;
    game.reset();
    resetScenePieces();
    resetMoveLog();
    cameraTarget.copy(cameraAnchors.neutral);

    if (vsComputer) {
      assignVsComputerRoles();
    } else {
      humanPlayerCell = Cell.X;
      aiPlayerCell = Cell.O;
    }

    refreshModeChip();
    refreshModeButton();
    refreshScoreChip();
    renderBoardState();

    if (vsComputer && game.current_player() === aiPlayerCell && !game.winner() && !game.is_draw()) {
      playComputerTurn();
    }
  });
}

if (qualityToggle) {
  qualityToggle.addEventListener("click", cycleQualityMode);
}

if (difficultyToggle) {
  difficultyToggle.addEventListener("click", () => {
    if (isReplaying) {
      stopReplay();
    }

    cycleDifficultyMode();
    refreshDifficultyButton();
  });
}

if (soundToggle) {
  soundToggle.addEventListener("click", toggleSound);
}

if (replayButton) {
  replayButton.addEventListener("click", () => {
    if (isReplaying) {
      stopReplay();
      statusEl.textContent = "Replay stopped.";
      return;
    }

    startReplay();
  });
}

if (resetScoreButton) {
  resetScoreButton.addEventListener("click", () => {
    if (isReplaying) {
      stopReplay();
    }

    scoreState = baseScoreTemplate();
    saveScoreState();
    refreshScoreChip();
  });
}

async function run() {
  await init();
  game = new Game();
  setup3D();

  const settings = readSavedSettings();
  soundEnabled = settings.soundEnabled;
  aiDifficulty = settings.aiDifficulty;
  qualityMode = settings.quality;
  setQualityMode(qualityMode);

  refreshDifficultyButton();
  refreshSoundButton();
  if (vsComputer) {
    assignVsComputerRoles();
  } else {
    humanPlayerCell = Cell.X;
    aiPlayerCell = Cell.O;
  }
  resetScenePieces();
  renderBoardState();
  refreshModeChip();
  refreshModeButton();
  refreshScoreChip();
  refreshQualityButton();
  refreshSoundButton();
  refreshReplayButton();
  updateMoveLog();

  if (vsComputer && game.current_player() === aiPlayerCell) {
    playComputerTurn();
  }

  setTimeout(() => {
    cameraTarget.copy(cameraAnchors.neutral);
  }, 260);

  resetButton.addEventListener("click", () => {
    if (isReplaying) {
      stopReplay();
    }

    aiMoveToken += 1;
    aiThinking = false;
    game.reset();
    if (vsComputer) {
      assignVsComputerRoles();
    }
    resetMoveLog();
    resetScenePieces();
    cameraTarget.copy(cameraAnchors.neutral);
    renderBoardState();

    if (vsComputer && game.current_player() === aiPlayerCell) {
      playComputerTurn();
    }
  });
}

run();
