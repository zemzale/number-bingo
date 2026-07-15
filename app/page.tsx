"use client";

import { useEffect, useMemo, useState } from "react";

type Ball = {
  value: number;
  letter: "B" | "I" | "N" | "G" | "O";
};

const columns = [
  { letter: "B", min: 1, max: 15 },
  { letter: "I", min: 16, max: 30 },
  { letter: "N", min: 31, max: 45 },
  { letter: "G", min: 46, max: 60 },
  { letter: "O", min: 61, max: 75 }
] as const;

const winLines = [
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
  [4, 8, 12, 16, 20]
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
  }

  return copy;
}

function makeBall(value: number): Ball {
  const column = columns.find(({ min, max }) => value >= min && value <= max);

  return {
    value,
    letter: column?.letter ?? "B"
  };
}

function makeDeck() {
  return shuffle(
    Array.from({ length: 75 }, (_, index) => makeBall(index + 1))
  );
}

function makeOrderedDeck() {
  return Array.from({ length: 75 }, (_, index) => makeBall(index + 1));
}

function makeCard() {
  const columnValues = columns.map(({ min, max }) =>
    shuffle(
      Array.from({ length: max - min + 1 }, (_, index) => min + index)
    ).slice(0, 5)
  );
  const card = Array.from(
    { length: 25 },
    (_, index) => columnValues[index % 5][Math.floor(index / 5)]
  );

  card[12] = 0;
  return card;
}

function makeStarterCard() {
  const card = [
    1, 16, 31, 46, 61,
    2, 17, 32, 47, 62,
    3, 18, 0, 48, 63,
    4, 19, 34, 49, 64,
    5, 20, 35, 50, 65
  ];

  return card;
}

function getWinningLines(marked: Set<number>) {
  return winLines.filter((line) => line.every((cell) => marked.has(cell)));
}

function formatBall(ball?: Ball) {
  return ball ? `${ball.letter}-${ball.value}` : "Ready";
}

export default function Home() {
  const [deck, setDeck] = useState<Ball[]>(() => makeOrderedDeck());
  const [called, setCalled] = useState<Ball[]>([]);
  const [card, setCard] = useState<number[]>(() => makeStarterCard());
  const [marked, setMarked] = useState<Set<number>>(() => new Set([12]));
  const [gameCode, setGameCode] = useState(1000);

  const calledNumbers = useMemo(
    () => new Set(called.map((ball) => ball.value)),
    [called]
  );
  const winningLines = useMemo(() => getWinningLines(marked), [marked]);
  const winningCells = useMemo(
    () => new Set(winningLines.flat()),
    [winningLines]
  );
  const latestBall = called[0];
  const progress = Math.round((called.length / 75) * 100);

  useEffect(() => {
    newGame();
  }, []);

  function callNextNumber() {
    if (deck.length === 0) {
      return;
    }

    const [next, ...remaining] = deck;
    setDeck(remaining);
    setCalled((current) => [next, ...current]);
    setMarked((current) => {
      const nextMarked = new Set(current);
      card.forEach((value, index) => {
        if (value === next.value) {
          nextMarked.add(index);
        }
      });
      return nextMarked;
    });
  }

  function toggleCell(index: number) {
    if (index === 12) {
      return;
    }

    setMarked((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function newCard() {
    setCard(makeCard());
    setMarked(new Set([12]));
  }

  function newGame() {
    setDeck(makeDeck());
    setCalled([]);
    setCard(makeCard());
    setMarked(new Set([12]));
    setGameCode(randomInt(1000, 9999));
  }

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="game-title">
        <div className="heroCopy">
          <p className="eyebrow">Room #{gameCode}</p>
          <h1 id="game-title">Number Bingo</h1>
          <p>
            A fast browser bingo table for parties, classrooms, streams, and
            lightweight game nights. Generate a card, call numbers, and chase a
            clean five-in-a-row.
          </p>
        </div>
        <div className="callerPanel" aria-live="polite">
          <span className="panelLabel">Now calling</span>
          <strong>{formatBall(latestBall)}</strong>
          <span className="panelMeta">
            {called.length} called · {deck.length} left
          </span>
        </div>
      </section>

      <section className="gameLayout" aria-label="Bingo game">
        <div className="boardPanel">
          <div className="boardToolbar">
            <div>
              <span className="panelLabel">Player card</span>
              <h2>{winningLines.length > 0 ? "Bingo!" : "Mark your hits"}</h2>
            </div>
            <button className="secondaryButton" onClick={newCard} type="button">
              New card
            </button>
          </div>

          <div className="bingoBoard">
            {columns.map(({ letter }) => (
              <div className="boardHeader" key={letter}>
                {letter}
              </div>
            ))}

            {card.map((value, index) => {
              const isMarked = marked.has(index);
              const isCalled = calledNumbers.has(value);
              const isWinning = winningCells.has(index);

              return (
                <button
                  aria-pressed={isMarked}
                  className={[
                    "cell",
                    isMarked ? "marked" : "",
                    isCalled ? "called" : "",
                    isWinning ? "winner" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={`${value}-${index}`}
                  onClick={() => toggleCell(index)}
                  type="button"
                >
                  <span>{value === 0 ? "FREE" : value}</span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="controlPanel" aria-label="Caller controls">
          <div className="actions">
            <button
              className="primaryButton"
              disabled={deck.length === 0}
              onClick={callNextNumber}
              type="button"
            >
              Call number
            </button>
            <button className="secondaryButton" onClick={newGame} type="button">
              Reset game
            </button>
          </div>

          <div className="progressBlock">
            <div className="progressHeader">
              <span>Deck progress</span>
              <strong>{progress}%</strong>
            </div>
            <div className="progressTrack">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="history">
            <div className="historyHeader">
              <span className="panelLabel">Recent calls</span>
              <strong>{called.length || "None yet"}</strong>
            </div>
            <div className="ballGrid">
              {called.slice(0, 15).map((ball) => (
                <span className="ball" key={`${ball.letter}-${ball.value}`}>
                  {formatBall(ball)}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
