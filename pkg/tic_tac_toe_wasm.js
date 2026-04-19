const Cell = Object.freeze({
  Empty: 0,
  X: 1,
  O: 2,
});

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

class Game {
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

async function init() {
  return undefined;
}

export { Cell, Game };
export default init;
