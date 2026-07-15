export const WIN_LINES = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
] as const;

export function validateBoard(board: number[]) {
  if (
    board.length !== 25 ||
    board.some((number) => !Number.isInteger(number))
  ) {
    return false;
  }

  const sorted = [...board].sort((a, b) => a - b);
  return sorted.every((number, index) => number === index + 1);
}

export function completedLines(board: number[], selectedNumbers: number[]) {
  const selected = new Set(selectedNumbers);
  return WIN_LINES.filter((line) =>
    line.every((cellIndex) => selected.has(board[cellIndex]))
  );
}
