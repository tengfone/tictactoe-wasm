use wasm_bindgen::prelude::*;

const WIN_LINES: [[usize; 3]; 8] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];

#[wasm_bindgen]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Cell {
    Empty,
    X,
    O,
}

#[wasm_bindgen]
pub struct Game {
    board: [Cell; 9],
    current: Cell,
    winner: Cell,
    draw: bool,
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            board: [Cell::Empty; 9],
            current: Cell::X,
            winner: Cell::Empty,
            draw: false,
        }
    }

    pub fn reset(&mut self) {
        self.board = [Cell::Empty; 9];
        self.current = Cell::X;
        self.winner = Cell::Empty;
        self.draw = false;
    }

    pub fn current_player(&self) -> Cell {
        self.current
    }

    pub fn winner(&self) -> Cell {
        self.winner
    }

    pub fn is_draw(&self) -> bool {
        self.draw
    }

    pub fn get_cell(&self, index: usize) -> Cell {
        self.board[index]
    }

    pub fn is_cell_playable(&self, index: usize) -> bool {
        index < self.board.len()
            && self.winner == Cell::Empty
            && !self.draw
            && self.board[index] == Cell::Empty
    }

    pub fn play(&mut self, index: usize) -> bool {
        if index >= self.board.len() {
            return false;
        }

        if self.winner != Cell::Empty || self.draw || self.board[index] != Cell::Empty {
            return false;
        }

        self.board[index] = self.current;

        if let Some(winner) = self.calculate_winner() {
            self.winner = winner;
            return true;
        }

        if self.board.iter().all(|cell| *cell != Cell::Empty) {
            self.draw = true;
            return true;
        }

        self.current = match self.current {
            Cell::X => Cell::O,
            Cell::O => Cell::X,
            Cell::Empty => Cell::X,
        };

        true
    }

    fn calculate_winner(&self) -> Option<Cell> {
        for line in WIN_LINES {
            let [a, b, c] = line;
            if self.board[a] != Cell::Empty
                && self.board[a] == self.board[b]
                && self.board[b] == self.board[c]
            {
                return Some(self.board[a]);
            }
        }

        None
    }
}

#[wasm_bindgen]
pub struct UltimateGame {
    cells: [Cell; 81],
    board_winners: [Cell; 9],
    current: Cell,
    winner: Cell,
    active_board: i32,
    draw: bool,
}

#[wasm_bindgen]
impl UltimateGame {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            cells: [Cell::Empty; 81],
            board_winners: [Cell::Empty; 9],
            current: Cell::X,
            winner: Cell::Empty,
            active_board: -1,
            draw: false,
        }
    }

    pub fn reset(&mut self) {
        self.cells = [Cell::Empty; 81];
        self.board_winners = [Cell::Empty; 9];
        self.current = Cell::X;
        self.winner = Cell::Empty;
        self.active_board = -1;
        self.draw = false;
    }

    pub fn current_player(&self) -> Cell {
        self.current
    }

    pub fn winner(&self) -> Cell {
        self.winner
    }

    pub fn is_draw(&self) -> bool {
        self.draw
    }

    pub fn active_board(&self) -> i32 {
        self.active_board
    }

    pub fn get_cell(&self, index: usize) -> Cell {
        self.cells[index]
    }

    pub fn get_board_winner(&self, board_index: usize) -> Cell {
        self.board_winners[board_index]
    }

    pub fn is_board_full(&self, board_index: usize) -> bool {
        self.is_board_full_internal(board_index)
    }

    pub fn is_board_playable(&self, board_index: usize) -> bool {
        board_index < 9 && self.is_board_playable_internal(board_index)
    }

    pub fn is_cell_playable(&self, index: usize) -> bool {
        if index >= self.cells.len()
            || self.winner != Cell::Empty
            || self.draw
            || self.cells[index] != Cell::Empty
        {
            return false;
        }

        let board_index = index / 9;
        if !self.is_board_playable_internal(board_index) {
            return false;
        }

        self.active_board < 0 || self.active_board as usize == board_index
    }

    pub fn play(&mut self, index: usize) -> bool {
        if !self.is_cell_playable(index) {
            return false;
        }

        let board_index = index / 9;
        let local_index = index % 9;

        self.cells[index] = self.current;

        if let Some(winner) = self.calculate_small_board_winner(board_index) {
            self.board_winners[board_index] = winner;
        }

        if let Some(winner) = self.calculate_large_board_winner() {
            self.winner = winner;
            return true;
        }

        if (0..9).all(|board| !self.is_board_playable_internal(board)) {
            self.draw = true;
            return true;
        }

        self.active_board = if self.is_board_playable_internal(local_index) {
            local_index as i32
        } else {
            -1
        };

        self.current = match self.current {
            Cell::X => Cell::O,
            Cell::O => Cell::X,
            Cell::Empty => Cell::X,
        };

        true
    }

    fn is_board_full_internal(&self, board_index: usize) -> bool {
        if board_index >= 9 {
            return false;
        }

        let start = board_index * 9;
        self.cells[start..start + 9]
            .iter()
            .all(|cell| *cell != Cell::Empty)
    }

    fn is_board_playable_internal(&self, board_index: usize) -> bool {
        board_index < 9
            && self.board_winners[board_index] == Cell::Empty
            && !self.is_board_full_internal(board_index)
    }

    fn calculate_small_board_winner(&self, board_index: usize) -> Option<Cell> {
        let start = board_index * 9;
        for [a, b, c] in WIN_LINES {
            let a = start + a;
            let b = start + b;
            let c = start + c;
            if self.cells[a] != Cell::Empty
                && self.cells[a] == self.cells[b]
                && self.cells[b] == self.cells[c]
            {
                return Some(self.cells[a]);
            }
        }

        None
    }

    fn calculate_large_board_winner(&self) -> Option<Cell> {
        for [a, b, c] in WIN_LINES {
            if self.board_winners[a] != Cell::Empty
                && self.board_winners[a] == self.board_winners[b]
                && self.board_winners[b] == self.board_winners[c]
            {
                return Some(self.board_winners[a]);
            }
        }

        None
    }
}

impl Default for UltimateGame {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for Game {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::{Cell, Game, UltimateGame};

    #[test]
    fn x_wins_top_row() {
        let mut game = Game::new();
        assert!(game.play(0));
        assert!(game.play(3));
        assert!(game.play(1));
        assert!(game.play(4));
        assert!(game.play(2));

        assert_eq!(game.winner(), Cell::X);
        assert!(!game.is_draw());
    }

    #[test]
    fn draw_game() {
        let mut game = Game::new();
        for mv in [0, 1, 2, 4, 3, 5, 7, 6, 8] {
            assert!(game.play(mv));
        }

        assert_eq!(game.winner(), Cell::Empty);
        assert!(game.is_draw());
    }

    #[test]
    fn ultimate_forces_next_player_to_matching_board() {
        let mut game = UltimateGame::new();
        assert!(game.play(4));

        assert_eq!(game.active_board(), 4);
        assert!(!game.play(27));
        assert!(game.play(36));
        assert_eq!(game.active_board(), 0);
    }

    #[test]
    fn ultimate_free_choice_when_sent_board_is_unplayable() {
        let mut game = UltimateGame::new();
        game.board_winners[4] = Cell::X;

        assert!(game.play(4));
        assert_eq!(game.active_board(), -1);
        assert!(game.play(72));
    }

    #[test]
    fn ultimate_large_board_win() {
        let mut game = UltimateGame::new();
        game.board_winners[0] = Cell::X;
        game.board_winners[1] = Cell::X;
        game.cells[18] = Cell::X;
        game.cells[19] = Cell::X;

        assert!(game.play(20));
        assert_eq!(game.get_board_winner(2), Cell::X);
        assert_eq!(game.winner(), Cell::X);
    }
}
