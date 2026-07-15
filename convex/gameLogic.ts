export const BOARD_COUNT = 4;
export const FREE_SPACE = 0;

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

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledRange(start: number, end: number, random: () => number) {
  const values = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

export function dealBoards(seed: string) {
  const random = seededRandom(seed);
  return Array.from({ length: BOARD_COUNT }, () => {
    const columns = Array.from({ length: 5 }, (_, column) =>
      shuffledRange(column * 15 + 1, column * 15 + 15, random).slice(0, 5)
    );
    const board = Array.from({ length: 25 }, (_, index) => {
      const row = Math.floor(index / 5);
      const column = index % 5;
      return columns[column][row];
    });
    board[12] = FREE_SPACE;
    return board;
  });
}

export function isMarked(number: number, selectedNumbers: number[]) {
  return number === FREE_SPACE || selectedNumbers.includes(number);
}

export function completedLines(board: number[], selectedNumbers: number[]) {
  return WIN_LINES.filter((line) =>
    line.every((cellIndex) => isMarked(board[cellIndex], selectedNumbers))
  );
}

export function bestLineProgress(boards: number[][], selectedNumbers: number[]) {
  return Math.max(
    0,
    ...boards.flatMap((board) =>
      WIN_LINES.map(
        (line) => line.filter((cellIndex) => isMarked(board[cellIndex], selectedNumbers)).length
      )
    )
  );
}

export function hasBingo(boards: number[][], selectedNumbers: number[]) {
  return boards.some((board) => completedLines(board, selectedNumbers).length > 0);
}
