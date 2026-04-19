import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const Cell = Object.freeze({
  Empty: 0,
  X: 1,
  O: 2,
});

class FallbackGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = Array(9).fill(Cell.Empty);
    this.current = Cell.X;
    this.gameWinner = Cell.Empty;
    this.draw = false;
  }

  current_player() {
    return this.current;
  }

  winner() {
    return this.gameWinner;
  }

  is_draw() {
    return this.draw;
  }

  get_cell(index) {
    return this.board[index];
  }

  play(index) {
    if (
      index < 0 ||
      index >= this.board.length ||
      this.gameWinner !== Cell.Empty ||
      this.draw ||
      this.board[index] !== Cell.Empty
    ) {
      return false;
    }

    this.board[index] = this.current;
    const winner = this.calculateWinner();
    if (winner !== Cell.Empty) {
      this.gameWinner = winner;
      return true;
    }

    if (this.board.every((cell) => cell !== Cell.Empty)) {
      this.draw = true;
      return true;
    }

    this.current = this.current === Cell.X ? Cell.O : Cell.X;
    return true;
  }

  calculateWinner() {
    for (const [a, b, c] of WIN_LINES) {
      if (
        this.board[a] !== Cell.Empty &&
        this.board[a] === this.board[b] &&
        this.board[b] === this.board[c]
      ) {
        return this.board[a];
      }
    }

    return Cell.Empty;
  }
}

let Game = FallbackGame;

async function loadGameRuntime() {
  try {
    const wasm = await import("./pkg/tic_tac_toe_wasm.js");
    await wasm.default();
    Game = wasm.Game;
  } catch (error) {
    console.warn("WASM package unavailable; using JS game runtime fallback.", error);
    Game = FallbackGame;
  }
}

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
    toneExposure: 0.9,
    toneMapping: THREE.ACESFilmicToneMapping,
    bloom: { strength: 0, radius: 0, threshold: 1 },
    vignette: { offset: 1.06, darkness: 0.96 },
    shadows: false,
    lights: { key: 1.55, fill: 0.12, rim: 0.04, ambient: 0.52 },
    confettiScale: 0,
  },
  balanced: {
    label: "Balanced",
    maxPixelRatio: 1.4,
    toneExposure: 0.92,
    toneMapping: THREE.ACESFilmicToneMapping,
    bloom: { strength: 0.04, radius: 0.18, threshold: 0.94 },
    vignette: { offset: 1.04, darkness: 0.98 },
    shadows: true,
    lights: { key: 1.7, fill: 0.16, rim: 0.06, ambient: 0.58 },
    confettiScale: 0,
  },
  cinematic: {
    label: "Cinematic",
    maxPixelRatio: 1.6,
    toneExposure: 0.96,
    toneMapping: THREE.ACESFilmicToneMapping,
    bloom: { strength: 0.08, radius: 0.24, threshold: 0.9 },
    vignette: { offset: 1.02, darkness: 1.0 },
    shadows: true,
    lights: { key: 1.85, fill: 0.18, rim: 0.08, ambient: 0.62 },
    confettiScale: 0,
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

const ORTHOGRAPHIC_VIEW_SIZE = 8.6;

const cameraAnchors = {
  intro: new THREE.Vector3(0, 8.6, 6.1),
  neutral: new THREE.Vector3(0, 7.2, 5.15),
  xTurn: new THREE.Vector3(-0.45, 7.25, 5.05),
  oTurn: new THREE.Vector3(0.45, 7.25, 5.05),
  win: new THREE.Vector3(0, 6.55, 4.6),
  draw: new THREE.Vector3(0, 7.6, 5.4),
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

function roundedRectangleShape(width, height, radius) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();

  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);

  return shape;
}

function horizontalExtrudeGeometry(shape, options = {}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: options.depth ?? 0.16,
    bevelEnabled: options.bevelEnabled ?? true,
    bevelSize: options.bevelSize ?? 0.035,
    bevelThickness: options.bevelThickness ?? 0.03,
    bevelSegments: options.bevelSegments ?? 8,
    curveSegments: options.curveSegments ?? 64,
  });

  geometry.center();
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function xTokenShape() {
  const s = 0.76;
  const w = 0.24;
  const shape = new THREE.Shape();
  const points = [
    [-s, -s + w],
    [-s + w, -s],
    [0, -w],
    [s - w, -s],
    [s, -s + w],
    [w, 0],
    [s, s - w],
    [s - w, s],
    [0, w],
    [-s + w, s],
    [-s, s - w],
    [-w, 0],
  ];

  shape.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) {
    shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function oTokenShape() {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, 0.72, 0.72, 0, Math.PI * 2, false, 0);

  const hole = new THREE.Path();
  hole.absellipse(0, 0, 0.42, 0.42, 0, Math.PI * 2, true, 0);
  shape.holes.push(hole);

  return shape;
}

function buildCellGeometry() {
  const mesh = new THREE.Mesh(
    horizontalExtrudeGeometry(roundedRectangleShape(2.08, 2.08, 0.18), {
      depth: 0.18,
      bevelSize: 0.045,
      bevelThickness: 0.035,
      bevelSegments: 8,
      curveSegments: 32,
    }),
    baseCellMaterial.clone()
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const hoverRing = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1.06, 48),
    new THREE.MeshStandardMaterial({
      color: 0xf4f1e8,
      transparent: true,
      opacity: 0,
      emissive: 0x25231d,
      emissiveIntensity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  hoverRing.rotation.x = -Math.PI / 2;
  hoverRing.position.y = 0.16;
  hoverRing.renderOrder = 2;

  mesh.add(hoverRing);
  mesh.userData.hoverRing = hoverRing;
  return mesh;
}

function buildXPiece(material = pbrMaterialX) {
  const mesh = new THREE.Mesh(
    horizontalExtrudeGeometry(xTokenShape(), {
      depth: 0.18,
      bevelSize: 0.028,
      bevelThickness: 0.026,
      bevelSegments: 8,
      curveSegments: 16,
    }),
    material
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildOPiece(material = pbrMaterialO) {
  const mesh = new THREE.Mesh(
    horizontalExtrudeGeometry(oTokenShape(), {
      depth: 0.18,
      bevelSize: 0.032,
      bevelThickness: 0.028,
      bevelSegments: 10,
      curveSegments: 96,
    }),
    material
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildGhostPiece() {
  const ghostMatX = new THREE.MeshPhysicalMaterial({
    color: 0xf4f1e8,
    transparent: true,
    opacity: 0.22,
    metalness: 0.04,
    roughness: 0.58,
    envMapIntensity: 0.7,
    emissive: 0x25231d,
    emissiveIntensity: 0.12,
  });
  const ghostMatO = new THREE.MeshPhysicalMaterial({
    color: 0xc8b37a,
    transparent: true,
    opacity: 0.22,
    metalness: 0.04,
    roughness: 0.58,
    envMapIntensity: 0.7,
    emissive: 0x332817,
    emissiveIntensity: 0.12,
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
    new THREE.BoxGeometry(0.08, 0.035, fullLength),
    new THREE.MeshStandardMaterial({
      color: 0xd8bd72,
      emissive: 0x3f3217,
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0.86,
      metalness: 0.48,
      roughness: 0.28,
    })
  );

  winBeam.position.set(midpoint.x, 0.18, midpoint.z);
  const flatDirection = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  winBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), flatDirection);
  winBeam.scale.set(1, 1, 0.001);
  winBeam.renderOrder = 2;
  scene.add(winBeam);
  winBeamProgress = 0;
}

function spawnConfetti(color, center) {
  const preset = QUALITY_PRESETS[qualityMode];
  if (preset.confettiScale <= 0) {
    return;
  }

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
  piece.rotation.set(0, 0, 0);
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
      cell.material.color.setHex(0x11110f);
      if (hoverRing) {
        hoverRing.material.opacity = 0;
        hoverRing.scale.setScalar(1);
      }

      cell.position.y = THREE.MathUtils.lerp(cell.position.y, 0, 0.18);
      continue;
    }

    const isHovered = hoveredCell === cell;
    cell.material.color.setHex(isHovered ? 0x24231f : 0x181815);
    cell.position.y = THREE.MathUtils.lerp(cell.position.y, isHovered ? 0.08 : 0, 0.18);
    if (hoverRing) {
      hoverRing.material.opacity = isHovered ? 0.72 : 0;
      hoverRing.scale.setScalar(isHovered ? 1.08 : 0.92);
      hoverRing.material.color.setHex(isHovered ? 0xf4f1e8 : 0xc8b37a);
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
    const winnerColor = winner === Cell.X ? 0xf4f1e8 : 0xc8b37a;
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
  winBeam.scale.z = THREE.MathUtils.lerp(0.001, 1, winBeamProgress);
  winBeam.material.opacity = 0.18 + 0.68 * Math.sin(winBeamProgress * Math.PI);
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
  }

  updateConfetti(delta);
  updateHoverVisuals();
  updateGhost();
  animateWinBeam();

  boardGroup.rotation.y = 0;
  boardGroup.rotation.z = 0;

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

  if (camera.isOrthographicCamera) {
    const aspect = width / height;
    camera.left = (-ORTHOGRAPHIC_VIEW_SIZE * aspect) / 2;
    camera.right = (ORTHOGRAPHIC_VIEW_SIZE * aspect) / 2;
    camera.top = ORTHOGRAPHIC_VIEW_SIZE / 2;
    camera.bottom = -ORTHOGRAPHIC_VIEW_SIZE / 2;
  } else {
    camera.aspect = width / height;
  }

  camera.updateProjectionMatrix();

  renderer.setSize(width, height, false);
  composer.setSize(width, height);
}

function setup3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090908);
  scene.userData.winnerCelebrated = false;
  scene.userData.drawCelebrated = false;

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
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
  keyLight.position.set(5, 11, 6);
  keyLight.castShadow = true;
  keyLight.shadow.camera.left = -7;
  keyLight.shadow.camera.right = 7;
  keyLight.shadow.camera.top = 7;
  keyLight.shadow.camera.bottom = -7;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 26;
  keyLight.shadow.bias = -0.00035;
  scene.add(keyLight);

  fillLight = new THREE.PointLight(0xf4f1e8, 0.5, 24, 1.6);
  fillLight.position.set(-5.2, 3.8, -4.2);
  scene.add(fillLight);

  rimLight = new THREE.PointLight(0xc8b37a, 0.18, 20, 1.5);
  rimLight.position.set(0, 7, -8.5);
  scene.add(rimLight);

  ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  ambientGlow = new THREE.Mesh(
    new THREE.RingGeometry(2.8, 6.8, 72),
    new THREE.MeshBasicMaterial({
      color: 0xf4f1e8,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ambientGlow.rotation.x = -Math.PI / 2;
  ambientGlow.position.y = 0.03;
  scene.add(ambientGlow);
  ambientGlow.visible = false;

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
  starField.visible = false;

  baseCellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x11100d,
    metalness: 0.18,
    roughness: 0.66,
    clearcoat: 0.55,
    clearcoatRoughness: 0.36,
    envMapIntensity: 0.9,
  });

  pbrMaterialX = new THREE.MeshPhysicalMaterial({
    color: 0xf7f3e8,
    metalness: 0.12,
    roughness: 0.34,
    clearcoat: 0.72,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.1,
  });

  pbrMaterialO = new THREE.MeshPhysicalMaterial({
    color: 0xd3ad58,
    metalness: 0.36,
    roughness: 0.3,
    clearcoat: 0.66,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.2,
  });

  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8.5, 0.4, 50),
    new THREE.MeshPhysicalMaterial({
      color: 0x0d0d0b,
      metalness: 0.02,
      roughness: 0.88,
      envMapIntensity: 0.45,
    })
  );
  floor.position.y = -0.35;
  floor.receiveShadow = true;
  scene.add(floor);

  boardGroup = new THREE.Group();
  scene.add(boardGroup);

  const boardBaseMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x070706,
    metalness: 0.28,
    roughness: 0.42,
    clearcoat: 0.86,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.2,
  });
  const boardBase = new THREE.Mesh(
    horizontalExtrudeGeometry(roundedRectangleShape(7.35, 7.35, 0.38), {
      depth: 0.24,
      bevelSize: 0.08,
      bevelThickness: 0.055,
      bevelSegments: 12,
      curveSegments: 48,
    }),
    boardBaseMaterial
  );
  boardBase.position.y = -0.16;
  boardBase.receiveShadow = true;
  boardBase.castShadow = true;
  boardGroup.add(boardBase);

  const inlayMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xb99a55,
    metalness: 0.58,
    roughness: 0.24,
    clearcoat: 0.6,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.25,
  });
  for (const offset of [-1.16, 1.16]) {
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 6.82), inlayMaterial);
    vertical.position.set(offset, 0.12, 0);
    vertical.castShadow = true;
    boardGroup.add(vertical);

    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(6.82, 0.045, 0.045), inlayMaterial);
    horizontal.position.set(0, 0.12, offset);
    horizontal.castShadow = true;
    boardGroup.add(horizontal);
  }

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
  await loadGameRuntime();
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
