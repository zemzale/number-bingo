"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import { completedLines, FREE_SPACE, WIN_LINES } from "../convex/gameLogic";

type Session = { code: string; playerToken: string };
type Mode = "create" | "join";

const SESSION_KEY = "number-bingo-session";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BINGO_LETTERS = ["B", "I", "N", "G", "O"];

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

function bingoLabel(number: number) {
  if (number === FREE_SPACE) return "Free";
  return `${BINGO_LETTERS[Math.floor((number - 1) / 15)]}-${number}`;
}

function winningCells(board: number[], selectedNumbers: number[]) {
  return new Set<number>(completedLines(board, selectedNumbers).flat());
}

function boardProgress(board: number[], selectedNumbers: number[]) {
  const selected = new Set(selectedNumbers);
  return Math.max(
    ...WIN_LINES.map((line) =>
      line.filter((index) => board[index] === FREE_SPACE || selected.has(board[index])).length
    )
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
        <p className="eyebrow">Two players · four cards each · one winner</p>
        <h1>Number<br />Bingo</h1>
        <p>Take turns calling numbers from your cards. Complete a bingo before your opponent.</p>
      </section>
      <section className="joinCard">
        <div className="modeTabs" aria-label="Room action">
          <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")} type="button">Create room</button>
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")} type="button">Join room</button>
        </div>
        <form onSubmit={submit}>
          <label>Your name<input maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="Player name" required value={name} /></label>
          {mode === "join" && <label>Room code<input className="codeInput" maxLength={6} onChange={(event) => setCode(event.target.value.toUpperCase())} pattern="[A-Za-z2-9]{6}" placeholder="ABC234" required value={code} /></label>}
          {error && <p className="errorMessage" role="alert">{error}</p>}
          <button className="primaryButton" disabled={busy} type="submit">{busy ? "Connecting…" : mode === "create" ? "Create a room" : "Join the game"}</button>
        </form>
      </section>
    </main>
  );
}

function BingoCard({
  board,
  selectedNumbers,
  disabled,
  onCall,
  compact = false,
}: {
  board: number[];
  selectedNumbers: number[];
  disabled: boolean;
  onCall?: (number: number) => void;
  compact?: boolean;
}) {
  const winning = useMemo(() => winningCells(board, selectedNumbers), [board, selectedNumbers]);
  return (
    <div className={compact ? "bingoCard compact" : "bingoCard"}>
      <div className="bingoHeader" aria-hidden="true">{BINGO_LETTERS.map((letter) => <span key={letter}>{letter}</span>)}</div>
      <div className="numberBoard">
        {board.map((number, index) => {
          const called = number === FREE_SPACE || selectedNumbers.includes(number);
          return (
            <button
              aria-label={number === FREE_SPACE ? "Free space" : `${bingoLabel(number)}${called ? ", called" : ""}`}
              aria-pressed={called}
              className={["numberCell", called ? "called" : "", number === FREE_SPACE ? "free" : "", winning.has(index) ? "winner" : ""].filter(Boolean).join(" ")}
              disabled={disabled || called || number === FREE_SPACE || !onCall}
              key={`${number}-${index}`}
              onClick={() => onCall?.(number)}
              type="button"
            >
              <span>{number === FREE_SPACE ? "★" : number}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Game({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const game = useQuery(api.game.getGame, session);
  const readyUp = useMutation(api.game.readyUp);
  const selectNumber = useMutation(api.game.selectNumber);
  const requestRematch = useMutation(api.game.requestRematch);
  const [activeCard, setActiveCard] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressCall = useRef(false);

  useEffect(() => {
    setActiveCard(0);
  }, [game?.round]);

  if (game === undefined) return <main className="loadingShell">Joining room…</main>;
  if (game === null) return <main className="loadingShell"><p>That room no longer exists.</p><button className="secondaryButton" onClick={onLeave}>Return home</button></main>;
  const currentGame = game;

  const boards = game.me.boards;
  const activeBoard = boards[activeCard];
  const arranging = game.status === "waiting" || game.status === "arranging";
  const finished = game.status === "finished";
  const boardTitle = arranging
    ? game.me.ready ? "Cards dealt" : "Ready for four cards?"
    : finished ? game.isDraw ? "It’s a draw" : game.winner === game.me.name ? "You win!" : `${game.winner} wins`
    : game.isMyTurn ? "Choose a number" : `Waiting for ${game.opponent?.name ?? "opponent"}`;

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function callNumber(number: number) {
    if (suppressCall.current || !currentGame.isMyTurn || currentGame.selectedNumbers.includes(number)) return;
    void mutate(() => selectNumber({ ...session, number }));
  }

  function finishSwipe(clientX: number, clientY: number) {
    if (!touchStart.current) return;
    const deltaX = clientX - touchStart.current.x;
    const deltaY = clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    suppressCall.current = true;
    setActiveCard((current) => Math.max(0, Math.min(3, current + (deltaX < 0 ? 1 : -1))));
    window.setTimeout(() => { suppressCall.current = false; }, 250);
  }

  async function copyCode() {
    await navigator.clipboard.writeText(currentGame.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

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
          <p>{arranging ? "Four standard 75-ball cards are dealt automatically." : "Swipe between your cards and call an open number. Every match is marked automatically."}</p>
        </div>
        <div className="scoreCard">
          <div className="playerScore isMe"><span>{game.me.name} · You</span><strong>{game.me.bestLineProgress}<small>/5</small></strong></div>
          <div className="scoreDivider">VS</div>
          <div className="playerScore"><span>{game.opponent?.name ?? "Waiting for player 2"}</span><strong>{game.opponent?.bestLineProgress ?? 0}<small>/5</small></strong></div>
        </div>
      </section>

      <section className="gameLayout">
        <div className="boardPanel">
          <div className="boardToolbar">
            <div><span className="panelLabel">Your cards</span><h2>{activeBoard ? `Card ${activeCard + 1} · ${boardProgress(activeBoard, game.selectedNumbers)}/5` : boardTitle}</h2></div>
            {activeBoard && <span className="swipeHint">Swipe to change card</span>}
          </div>

          {game.latestCall && <div className="latestCall"><span>{game.latestCall.isMe ? "You called" : `${game.latestCall.callerName} called`}</span><strong>{bingoLabel(game.latestCall.number)}</strong></div>}

          {activeBoard && !finished && (
            <div className={`boardTurnState ${game.status === "playing" && game.isMyTurn ? "active" : ""}`}>
              {game.status === "playing"
                ? game.isMyTurn
                  ? "Your turn · Tap any open number"
                  : `Waiting for ${game.opponent?.name ?? "your opponent"} · Numbers unlock on your turn`
                : game.opponent
                  ? `Waiting for ${game.opponent.name} to get ready`
                  : "Waiting for player 2 · Share the room code to start"}
            </div>
          )}

          {activeBoard ? (
            <div
              className="cardCarousel"
              onPointerDown={(event) => {
                touchStart.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerUp={(event) => finishSwipe(event.clientX, event.clientY)}
              onPointerCancel={() => { touchStart.current = null; }}
            >
              <BingoCard board={activeBoard} selectedNumbers={game.selectedNumbers} disabled={busy || !game.isMyTurn || finished || arranging} onCall={callNumber} />
            </div>
          ) : (
            <div className="undealtCards"><strong>4 cards</strong><span>75-ball bingo · free center</span></div>
          )}

          {activeBoard && <div className="cardDots" aria-label={`Card ${activeCard + 1} of 4`}>{boards.map((card, index) => {
            const affected = game.latestCall !== null && card.includes(game.latestCall.number);
            return <span className={[index === activeCard ? "active" : "", affected ? "affected" : ""].filter(Boolean).join(" ")} key={`${index}-${game.latestCall?.number ?? "none"}`} />;
          })}</div>}
          {error && <p className="errorMessage" role="alert">{error}</p>}
        </div>

        <aside className="controlPanel">
          {arranging && !game.me.ready && <button className="primaryButton" disabled={busy} onClick={() => void mutate(() => readyUp(session))} type="button">{busy ? "Dealing…" : "Deal my cards"}</button>}
          {arranging && game.me.ready && <div className="statusNotice"><span className="statusDot" />{game.opponent ? game.opponent.ready ? "Starting game…" : `Waiting for ${game.opponent.name} to get ready` : "Share the room code with player 2"}</div>}
          {game.status === "playing" && <div className={`turnNotice ${game.isMyTurn ? "active" : ""}`}><span>{game.isMyTurn ? "Your turn" : "Opponent’s turn"}</span><strong>{game.isMyTurn ? "Tap any open number on this card" : "Your cards update automatically"}</strong></div>}
          {finished && <button className="primaryButton" disabled={busy || game.me.rematchReady} onClick={() => void mutate(() => requestRematch(session))} type="button">{game.me.rematchReady ? "Waiting for opponent…" : "Play again"}</button>}

          <details className="history">
            <summary><span className="panelLabel">Numbers called</span><strong>{game.selectedNumbers.length}/75</strong></summary>
            <div className="calledGrid">{Array.from({ length: 75 }, (_, index) => index + 1).map((number) => <span className={game.selectedNumbers.includes(number) ? "called" : ""} key={number}>{number}</span>)}</div>
          </details>
          <div className="rulesCard"><span className="panelLabel">How to win</span><p>Complete one row, column, or diagonal on any card. The free center is already marked.</p></div>
        </aside>
      </section>

      {finished && game.opponent?.boards && (
        <section className="revealPanel">
          <span className="panelLabel">Round reveal</span>
          <h2>{game.opponent.name}’s cards</h2>
          <div className="revealedBoards">{game.opponent.boards.map((board, index) => <div key={index}><h3>Card {index + 1}</h3><BingoCard board={board} selectedNumbers={game.selectedNumbers} disabled compact /></div>)}</div>
        </section>
      )}
    </main>
  );
}
