"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../convex/_generated/api";
import { WIN_LINES } from "../convex/gameLogic";

type Session = { code: string; playerToken: string };
type Mode = "create" | "join";

const SESSION_KEY = "number-bingo-session";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function shuffledBoard() {
  const board = Array.from({ length: 25 }, (_, index) => index + 1);
  for (let index = board.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
    [board[index], board[swapIndex]] = [board[swapIndex], board[index]];
  }
  return board;
}

function randomCode() {
  const values = crypto.getRandomValues(new Uint32Array(6));
  return Array.from(values, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
}

function randomToken() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const match = error.message.match(/Uncaught ConvexError: (.+?)(?:\n|$)/);
    return match?.[1] ?? error.message;
  }
  return "Something went wrong. Please try again.";
}

function winningCells(board: number[], selectedNumbers: number[]) {
  const selected = new Set(selectedNumbers);
  return new Set<number>(
    WIN_LINES.filter((line) => line.every((index) => selected.has(board[index]))).flat()
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        setSession(JSON.parse(saved) as Session);
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
      }
    }
    setHydrated(true);
  }, []);

  function saveSession(next: Session) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  }

  function leaveRoom() {
    window.localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  if (!hydrated) return <main className="loadingShell">Loading…</main>;
  if (!session) return <Welcome onConnected={saveSession} />;
  return <Game session={session} onLeave={leaveRoom} />;
}

function Welcome({ onConnected }: { onConnected: (session: Session) => void }) {
  const createRoom = useMutation(api.game.createRoom);
  const joinRoom = useMutation(api.game.joinRoom);
  const [mode, setMode] = useState<Mode>("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const playerToken = randomToken();

    try {
      if (mode === "create") {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const roomCode = randomCode();
          try {
            await createRoom({ code: roomCode, name, playerToken });
            onConnected({ code: roomCode, playerToken });
            return;
          } catch (caught) {
            if (attempt === 2) throw caught;
          }
        }
      } else {
        const roomCode = code.trim().toUpperCase();
        await joinRoom({ code: roomCode, name, playerToken });
        onConnected({ code: roomCode, playerToken });
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="welcomeShell">
      <section className="welcomeHero">
        <p className="eyebrow">Two players · two boards · one winner</p>
        <h1>Number<br />Bingo</h1>
        <p>Arrange 1–25, take turns calling numbers, and complete five lines first.</p>
      </section>

      <section className="joinCard">
        <div className="modeTabs" aria-label="Room action">
          <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")} type="button">Create room</button>
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")} type="button">Join room</button>
        </div>
        <form onSubmit={submit}>
          <label>
            Your name
            <input maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="Player name" required value={name} />
          </label>
          {mode === "join" && (
            <label>
              Room code
              <input className="codeInput" maxLength={6} onChange={(event) => setCode(event.target.value.toUpperCase())} pattern="[A-Za-z2-9]{6}" placeholder="ABC234" required value={code} />
            </label>
          )}
          {error && <p className="errorMessage" role="alert">{error}</p>}
          <button className="primaryButton" disabled={busy} type="submit">
            {busy ? "Connecting…" : mode === "create" ? "Create a room" : "Join the game"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Game({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const game = useQuery(api.game.getGame, session);
  const submitBoard = useMutation(api.game.submitBoard);
  const selectNumber = useMutation(api.game.selectNumber);
  const requestRematch = useMutation(api.game.requestRematch);
  const [board, setBoard] = useState<number[]>([]);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (game && !game.me.ready && board.length === 0) setBoard(shuffledBoard());
  }, [game, board.length]);

  const activeBoard = game?.me.board ?? board;
  const winning = useMemo(
    () => winningCells(activeBoard, game?.selectedNumbers ?? []),
    [activeBoard, game?.selectedNumbers]
  );

  if (game === undefined) return <main className="loadingShell">Joining room…</main>;
  if (game === null) {
    return <main className="loadingShell"><p>That room no longer exists.</p><button className="secondaryButton" onClick={onLeave}>Return home</button></main>;
  }

  function swapCell(index: number) {
    if (game!.me.ready) return;
    if (selectedCell === null) {
      setSelectedCell(index);
      return;
    }
    const next = [...board];
    [next[selectedCell], next[index]] = [next[index], next[selectedCell]];
    setBoard(next);
    setSelectedCell(null);
  }

  async function lockBoard() {
    setBusy(true);
    setError("");
    try {
      await submitBoard({ ...session, board });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function callNumber(number: number) {
    if (!game!.isMyTurn || game!.selectedNumbers.includes(number)) return;
    setBusy(true);
    setError("");
    try {
      await selectNumber({ ...session, number });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function rematch() {
    setBusy(true);
    setError("");
    try {
      await requestRematch(session);
      setBoard([]);
      setSelectedCell(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    await navigator.clipboard.writeText(game!.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const arranging = game.status === "waiting" || game.status === "arranging";
  const finished = game.status === "finished";
  const boardTitle = arranging
    ? game.me.ready ? "Board locked" : selectedCell === null ? "Arrange your board" : "Choose a number to swap"
    : finished ? game.isDraw ? "It’s a draw" : game.winner === game.me.name ? "You win!" : `${game.winner} wins`
    : game.isMyTurn ? "Choose a number" : `Waiting for ${game.opponent?.name ?? "opponent"}`;

  return (
    <main className="shell">
      <header className="roomBar">
        <div><span className="panelLabel">Room code</span><button className="roomCode" onClick={copyCode} type="button">{game.code} <small>{copied ? "Copied" : "Copy"}</small></button></div>
        <div className="roundLabel">Round {game.round}</div>
        <button className="textButton" onClick={onLeave} type="button">Leave room</button>
      </header>

      <section className="gameHero">
        <div>
          <p className="eyebrow">{game.status === "playing" ? `Turn ${game.turnNumber + 1}` : game.status}</p>
          <h1>{boardTitle}</h1>
          <p>{arranging ? "Tap any two cells to swap them. Lock your arrangement when it feels right." : "Every called number is marked on both boards. First to five completed lines wins."}</p>
        </div>
        <div className="scoreCard">
          <div className="playerScore isMe"><span>{game.me.name} · You</span><strong>{game.me.completedLines}<small>/5</small></strong></div>
          <div className="scoreDivider">VS</div>
          <div className="playerScore"><span>{game.opponent?.name ?? "Waiting for player 2"}</span><strong>{game.opponent?.completedLines ?? 0}<small>/5</small></strong></div>
        </div>
      </section>

      <section className="gameLayout">
        <div className="boardPanel">
          <div className="boardToolbar">
            <div><span className="panelLabel">Your 5 × 5 grid</span><h2>{boardTitle}</h2></div>
            {!game.me.ready && arranging && <button className="secondaryButton" onClick={() => { setBoard(shuffledBoard()); setSelectedCell(null); }} type="button">Shuffle</button>}
          </div>
          <div className="numberBoard">
            {activeBoard.map((number, index) => {
              const called = game.selectedNumbers.includes(number);
              return (
                <button
                  aria-label={`${number}${called ? ", called" : ""}`}
                  aria-pressed={selectedCell === index || called}
                  className={["numberCell", selectedCell === index ? "selected" : "", called ? "called" : "", winning.has(index) ? "winner" : ""].filter(Boolean).join(" ")}
                  disabled={busy || (arranging && game.me.ready) || (game.status === "playing" && (!game.isMyTurn || called)) || finished}
                  key={`${number}-${index}`}
                  onClick={() => arranging ? swapCell(index) : callNumber(number)}
                  type="button"
                >
                  <span>{number}</span>
                </button>
              );
            })}
          </div>
          {error && <p className="errorMessage" role="alert">{error}</p>}
        </div>

        <aside className="controlPanel">
          {arranging && !game.me.ready && <button className="primaryButton" disabled={busy || board.length !== 25} onClick={lockBoard} type="button">{busy ? "Locking…" : "Lock my board"}</button>}
          {arranging && game.me.ready && <div className="statusNotice"><span className="statusDot" />{game.opponent ? game.opponent.ready ? "Starting game…" : `Waiting for ${game.opponent.name} to lock their board` : "Share the room code with player 2"}</div>}
          {game.status === "playing" && <div className={`turnNotice ${game.isMyTurn ? "active" : ""}`}><span>{game.isMyTurn ? "Your turn" : "Opponent’s turn"}</span><strong>{game.isMyTurn ? "Select any open number" : "The board updates automatically"}</strong></div>}
          {finished && <button className="primaryButton" disabled={busy || game.me.rematchReady} onClick={rematch} type="button">{game.me.rematchReady ? "Waiting for opponent…" : "Play again"}</button>}

          <div className="history">
            <div className="historyHeader"><span className="panelLabel">Numbers called</span><strong>{game.selectedNumbers.length}/25</strong></div>
            <div className="calledGrid">
              {Array.from({ length: 25 }, (_, index) => index + 1).map((number) => <span className={game.selectedNumbers.includes(number) ? "called" : ""} key={number}>{number}</span>)}
            </div>
          </div>

          <div className="rulesCard"><span className="panelLabel">How to win</span><p>Complete any five rows, columns, or diagonals before your opponent. If both reach five on the same call, the round is a draw.</p></div>
        </aside>
      </section>
    </main>
  );
}
