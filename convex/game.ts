import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { completedLines, validateBoard } from "./gameLogic";

const cleanCode = (code: string) => code.trim().toUpperCase();
const cleanName = (name: string) => name.trim().slice(0, 24);

function validateCredentials(code: string, name: string, token: string) {
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    throw new ConvexError("Room codes must contain six letters or numbers.");
  }
  if (name.length < 1) {
    throw new ConvexError("Enter a player name.");
  }
  if (token.length < 32 || token.length > 128) {
    throw new ConvexError("Invalid player token.");
  }
}

async function roomByCode(ctx: QueryCtx | MutationCtx, code: string) {
  return await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", cleanCode(code)))
    .unique();
}

async function authenticatedPlayer(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
  token: string
) {
  const player = await ctx.db
    .query("players")
    .withIndex("by_room_token", (q) =>
      q.eq("roomId", roomId).eq("token", token)
    )
    .unique();

  if (!player) {
    throw new ConvexError("This device does not have a seat in that room.");
  }
  return player;
}

function publicPlayer(
  player: Doc<"players">,
  selectedNumbers: number[],
  revealBoard: boolean
) {
  const lines = player.board
    ? completedLines(player.board, selectedNumbers).length
    : 0;

  return {
    id: player._id,
    name: player.name,
    seat: player.seat,
    ready: player.ready,
    rematchReady: player.rematchReady,
    completedLines: lines,
    board: revealBoard ? player.board : undefined,
  };
}

export const createRoom = mutation({
  args: { code: v.string(), name: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const code = cleanCode(args.code);
    const name = cleanName(args.name);
    validateCredentials(code, name, args.playerToken);

    if (await roomByCode(ctx, code)) {
      throw new ConvexError("That room code is already in use. Try another.");
    }

    const roomId = await ctx.db.insert("rooms", {
      code,
      status: "waiting",
      isDraw: false,
      selectedNumbers: [],
      turnNumber: 0,
      round: 1,
    });
    const playerId = await ctx.db.insert("players", {
      roomId,
      token: args.playerToken,
      name,
      seat: 1,
      ready: false,
      rematchReady: false,
    });
    await ctx.db.patch(roomId, { hostPlayerId: playerId });

    return { code, playerId };
  },
});

export const joinRoom = mutation({
  args: { code: v.string(), name: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const code = cleanCode(args.code);
    const name = cleanName(args.name);
    validateCredentials(code, name, args.playerToken);

    const room = await roomByCode(ctx, code);
    if (!room) throw new ConvexError("Room not found.");

    const existingPlayer = await ctx.db
      .query("players")
      .withIndex("by_room_token", (q) =>
        q.eq("roomId", room._id).eq("token", args.playerToken)
      )
      .unique();
    if (existingPlayer) return { code, playerId: existingPlayer._id };

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    if (players.length >= 2 || room.status !== "waiting") {
      throw new ConvexError("That room already has two players.");
    }

    const playerId = await ctx.db.insert("players", {
      roomId: room._id,
      token: args.playerToken,
      name,
      seat: 2,
      ready: false,
      rematchReady: false,
    });
    await ctx.db.patch(room._id, { status: "arranging" });
    return { code, playerId };
  },
});

export const getGame = query({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) return null;

    const me = await authenticatedPlayer(ctx, room._id, args.playerToken);
    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    const opponent = players.find((player) => player._id !== me._id);

    return {
      code: room.code,
      status: room.status,
      selectedNumbers: room.selectedNumbers,
      turnNumber: room.turnNumber,
      round: room.round,
      isMyTurn: room.currentPlayerId === me._id,
      winner: room.winnerPlayerId
        ? players.find((player) => player._id === room.winnerPlayerId)?.name
        : undefined,
      isDraw: room.isDraw,
      me: {
        ...publicPlayer(me, room.selectedNumbers, true),
        board: me.board,
      },
      opponent: opponent
        ? publicPlayer(opponent, room.selectedNumbers, room.status === "finished")
        : null,
    };
  },
});

export const submitBoard = mutation({
  args: { code: v.string(), playerToken: v.string(), board: v.array(v.number()) },
  handler: async (ctx, args) => {
    if (!validateBoard(args.board)) {
      throw new ConvexError("The board must contain every number from 1 to 25 once.");
    }

    const room = await roomByCode(ctx, args.code);
    if (!room) throw new ConvexError("Room not found.");
    if (room.status !== "waiting" && room.status !== "arranging") {
      throw new ConvexError("Boards are locked while a game is running.");
    }

    const me = await authenticatedPlayer(ctx, room._id, args.playerToken);
    await ctx.db.patch(me._id, { board: args.board, ready: true });

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    const bothReady =
      players.length === 2 &&
      players.every((player) => player._id === me._id || player.ready);

    if (bothReady) {
      await ctx.db.patch(room._id, {
        status: "playing",
        currentPlayerId: room.hostPlayerId,
      });
    }
  },
});

export const selectNumber = mutation({
  args: { code: v.string(), playerToken: v.string(), number: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.number) || args.number < 1 || args.number > 25) {
      throw new ConvexError("Choose a number from 1 to 25.");
    }

    const room = await roomByCode(ctx, args.code);
    if (!room) throw new ConvexError("Room not found.");
    if (room.status !== "playing") throw new ConvexError("The game is not active.");

    const me = await authenticatedPlayer(ctx, room._id, args.playerToken);
    if (room.currentPlayerId !== me._id) {
      throw new ConvexError("Wait for your turn.");
    }
    if (room.selectedNumbers.includes(args.number)) {
      throw new ConvexError("That number has already been selected.");
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    if (players.length !== 2 || players.some((player) => !player.board)) {
      throw new ConvexError("Both players need a locked board.");
    }

    const selectedNumbers = [...room.selectedNumbers, args.number];
    const winners = players.filter(
      (player) => completedLines(player.board!, selectedNumbers).length >= 5
    );

    await ctx.db.insert("moves", {
      roomId: room._id,
      playerId: me._id,
      number: args.number,
      turnNumber: room.turnNumber + 1,
      round: room.round,
    });

    if (winners.length > 0) {
      await ctx.db.patch(room._id, {
        selectedNumbers,
        turnNumber: room.turnNumber + 1,
        status: "finished",
        currentPlayerId: undefined,
        winnerPlayerId: winners.length === 1 ? winners[0]._id : undefined,
        isDraw: winners.length > 1,
      });
      return;
    }

    const opponent = players.find((player) => player._id !== me._id)!;
    await ctx.db.patch(room._id, {
      selectedNumbers,
      turnNumber: room.turnNumber + 1,
      currentPlayerId: opponent._id,
    });
  },
});

export const requestRematch = mutation({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) throw new ConvexError("Room not found.");
    if (room.status !== "finished") throw new ConvexError("Finish this game first.");

    const me = await authenticatedPlayer(ctx, room._id, args.playerToken);
    await ctx.db.patch(me._id, { rematchReady: true });

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    const bothReady = players.every(
      (player) => player._id === me._id || player.rematchReady
    );

    if (players.length === 2 && bothReady) {
      await Promise.all(
        players.map((player) =>
          ctx.db.patch(player._id, {
            board: undefined,
            ready: false,
            rematchReady: false,
          })
        )
      );
      await ctx.db.patch(room._id, {
        status: "arranging",
        selectedNumbers: [],
        turnNumber: 0,
        round: room.round + 1,
        currentPlayerId: undefined,
        winnerPlayerId: undefined,
        isDraw: false,
      });
    }
  },
});
