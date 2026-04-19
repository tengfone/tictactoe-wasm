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

  is_cell_playable(index) {
    return (
      index >= 0 &&
      index < this.board.length &&
      this.gameWinner === Cell.Empty &&
      !this.draw &&
      this.board[index] === Cell.Empty
    );
  }

  play(index) {
    if (!this.is_cell_playable(index)) {
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

class UltimateGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.cells = Array(81).fill(Cell.Empty);
    this.boardWinners = Array(9).fill(Cell.Empty);
    this.current = Cell.X;
    this.gameWinner = Cell.Empty;
    this.activeBoard = -1;
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

  active_board() {
    return this.activeBoard;
  }

  get_cell(index) {
    return this.cells[index];
  }

  get_board_winner(index) {
    return this.boardWinners[index];
  }

  is_board_full(index) {
    if (index < 0 || index >= 9) {
      return false;
    }

    const start = index * 9;
    return this.cells.slice(start, start + 9).every((cell) => cell !== Cell.Empty);
  }

  is_board_playable(index) {
    return (
      index >= 0 &&
      index < 9 &&
      this.boardWinners[index] === Cell.Empty &&
      !this.is_board_full(index)
    );
  }

  is_cell_playable(index) {
    if (
      index < 0 ||
      index >= this.cells.length ||
      this.gameWinner !== Cell.Empty ||
      this.draw ||
      this.cells[index] !== Cell.Empty
    ) {
      return false;
    }

    const boardIndex = Math.floor(index / 9);
    if (!this.is_board_playable(boardIndex)) {
      return false;
    }

    return this.activeBoard < 0 || this.activeBoard === boardIndex;
  }

  play(index) {
    if (!this.is_cell_playable(index)) {
      return false;
    }

    const boardIndex = Math.floor(index / 9);
    const localIndex = index % 9;

    this.cells[index] = this.current;

    const smallWinner = this.calculateSmallBoardWinner(boardIndex);
    if (smallWinner !== Cell.Empty) {
      this.boardWinners[boardIndex] = smallWinner;
    }

    const largeWinner = this.calculateLargeBoardWinner();
    if (largeWinner !== Cell.Empty) {
      this.gameWinner = largeWinner;
      return true;
    }

    if (!this.boardWinners.some((_, i) => this.is_board_playable(i))) {
      this.draw = true;
      return true;
    }

    this.activeBoard = this.is_board_playable(localIndex) ? localIndex : -1;
    this.current = this.current === Cell.X ? Cell.O : Cell.X;
    return true;
  }

  calculateSmallBoardWinner(boardIndex) {
    const start = boardIndex * 9;
    for (const [a, b, c] of WIN_LINES) {
      const aVal = this.cells[start + a];
      if (
        aVal !== Cell.Empty &&
        aVal === this.cells[start + b] &&
        aVal === this.cells[start + c]
      ) {
        return aVal;
      }
    }

    return Cell.Empty;
  }

  calculateLargeBoardWinner() {
    for (const [a, b, c] of WIN_LINES) {
      const aVal = this.boardWinners[a];
      if (
        aVal !== Cell.Empty &&
        aVal === this.boardWinners[b] &&
        aVal === this.boardWinners[c]
      ) {
        return aVal;
      }
    }

    return Cell.Empty;
  }
}

async function init() {
  return undefined;
}

export { Cell, Game, UltimateGame };
export default init;
