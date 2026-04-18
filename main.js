import init, { Cell, Game } from "./pkg/tic_tac_toe_wasm.js";

const statusEl = document.getElementById("status");
const boardEl = document.getElementById("board");
const resetButton = document.getElementById("reset");

const labels = {
  [Cell.Empty]: "",
  [Cell.X]: "X",
  [Cell.O]: "O",
};

let game;

function updateStatus() {
  if (game.winner() !== Cell.Empty) {
    statusEl.textContent = `${labels[game.winner()]} wins!`;
    return;
  }

  if (game.is_draw()) {
    statusEl.textContent = "It's a draw!";
    return;
  }

  statusEl.textContent = `Current player: ${labels[game.current_player()]}`;
}

function drawBoard() {
  boardEl.innerHTML = "";

  for (let i = 0; i < 9; i++) {
    const button = document.createElement("button");
    button.className = "cell";
    button.textContent = labels[game.get_cell(i)];
    button.disabled = game.winner() !== Cell.Empty || game.is_draw() || game.get_cell(i) !== Cell.Empty;
    button.addEventListener("click", () => {
      if (game.play(i)) {
        drawBoard();
      }
    });
    boardEl.appendChild(button);
  }

  updateStatus();
}

async function run() {
  await init();
  game = new Game();
  drawBoard();

  resetButton.addEventListener("click", () => {
    game.reset();
    drawBoard();
  });
}

run();
