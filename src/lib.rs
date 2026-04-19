use wasm_bindgen::prelude::*;

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
        const LINES: [[usize; 3]; 8] = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8],
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8],
            [0, 4, 8],
            [2, 4, 6],
        ];

        for line in LINES {
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

impl Default for Game {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::{Cell, Game};

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
}
