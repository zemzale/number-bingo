import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { bestLineProgress, dealBoards, hasBingo } from "./gameLogic";

const cleanCode = (code: string) => code.trim().toUpperCase();
const cleanName = (name: string) => name.trim().slice(0, 24);

function validateCredentials(code: string, name: string, token: string) {
  if (!/^[A-Z2-9]{6}$/.test(code)) throw new ConvexError("Room codes must contain six letters or numbers.");
  if (name.length < 1) throw new ConvexError("Enter a player name.");
  if (token.length < 32 || token.length > 128) throw new ConvexError("Invalid player token.");
}

function startingSeat(code: string) {
  return [...code].reduce((total, character) => total + character.charCodeAt(0), 0) % 2 + 1;
}

async function roomByCode(ctx: QueryCtx | MutationCtx, code: string) {
  return await ctx.db.query("rooms").withIndex("by_code", (q) => q.eq("code", cleanCode(code))).unique();
}

async function authenticatedPlayer(ctx: QueryCtx | MutationCtx, roomId: Id<"rooms">, token: string) {
  const player = await ctx.db
    .query("players")
    .withIndex("by_room_token", (q) => q.eq("roomId", roomId).eq("token", token))
    .unique();
  if (!player) throw new ConvexError("This device does not have a seat in that room.");
  return player;
}

function playerBoards(player: Doc<"players">) {
  return player.boards ?? [];
}

function publicPlayer(player: Doc<"players">, selectedNumbers: number[], revealBoards: boolean) {
  const boards = playerBoards(player);
  return {
    id: player._id,
    name: player.name,
    seat: player.seat,
    ready: player.ready,
    rematchReady: player.rematchReady,
    bestLineProgress: bestLineProgress(boards, selectedNumbers),
    boards: revealBoards ? boards : undefined,
  };
}

export const createRoom = mutation({
  args: { code: v.string(), name: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const code = cleanCode(args.code);
    const name = cleanName(args.name);
    validateCredentials(code, name, args.playerToken);
    if (await roomByCode(ctx, code)) throw new ConvexError("That room code is already in use. Try another.");

    const roomId = await ctx.db.insert("rooms", {
      code,
      status: "waiting",
      isDraw: false,
      initialStartingSeat: startingSeat(code),
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
      .withIndex("by_room_token", (q) => q.eq("roomId", room._id).eq("token", args.playerToken))
      .unique();
    if (existingPlayer) return { code, playerId: existingPlayer._id };

    const players = await ctx.db.query("players").withIndex("by_room", (q) => q.eq("roomId", room._id)).collect();
    if (players.length >= 2 || room.status !== "waiting") throw new ConvexError("That room already has two players.");

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
    const players = await ctx.db.query("players").withIndex("by_room", (q) => q.eq("roomId", room._id)).collect();
    const opponent = players.find((player) => player._id !== me._id);
    const lastCaller = players.find((player) => player._id === room.lastCallerId);
    const lastNumber = room.selectedNumbers.at(-1);

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
      latestCall: lastNumber === undefined ? null : {
        number: lastNumber,
        callerName: lastCaller?.name ?? "Player",
        isMe: lastCaller?._id === me._id,
      },
      me: { ...publicPlayer(me, room.selectedNumbers, true), boards: playerBoards(me) },
      opponent: opponent ? publicPlayer(opponent, room.selectedNumbers, room.status === "finished") : null,
    };
  },
});

export const readyUp = mutation({
  args: { code: v.string(), playerToken: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) throw new ConvexError("Room not found.");
    if (room.status !== "waiting" && room.status !== "arranging") throw new ConvexError("The round is already running.");
    const me = await authenticatedPlayer(ctx, room._id, args.playerToken);
    if (!me.ready || playerBoards(me).length !== 4) {
      await ctx.db.patch(me._id, {
        boards: dealBoards(`${room.code}:${room.round}:${me.token}`),
        board: undefined,
        ready: true,
      });
    }

    const players = await ctx.db.query("players").withIndex("by_room", (q) => q.eq("roomId", room._id)).collect();
    const bothReady = players.length === 2 && players.every((player) => player._id === me._id || player.ready);
    if (bothReady) {
      const initialSeat = room.initialStartingSeat ?? 1;
      const roundStartingSeat = room.round % 2 === 1 ? initialSeat : initialSeat === 1 ? 2 : 1;
      const starter = players.find((player) => player.seat === roundStartingSeat);
      if (!starter) throw new ConvexError("Could not choose the starting player.");
      await ctx.db.patch(room._id, { status: "playing", currentPlayerId: starter._id });
    }
  },
});

export const selectNumber = mutation({
  args: { code: v.string(), playerToken: v.string(), number: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.number) || args.number < 1 || args.number > 75) throw new ConvexError("Choose a number from 1 to 75.");
    const room = await roomByCode(ctx, args.code);
    if (!room) throw new ConvexError("Room not found.");
    if (room.status !== "playing") throw new ConvexError("The game is not active.");
    const me = await authenticatedPlayer(ctx, room._id, args.playerToken);
    if (room.currentPlayerId !== me._id) throw new ConvexError("Wait for your turn.");
    if (room.selectedNumbers.includes(args.number)) throw new ConvexError("That number has already been selected.");
    if (!playerBoards(me).some((board) => board.includes(args.number))) throw new ConvexError("Choose a number from one of your cards.");

    const players = await ctx.db.query("players").withIndex("by_room", (q) => q.eq("roomId", room._id)).collect();
    if (players.length !== 2 || players.some((player) => playerBoards(player).length !== 4)) throw new ConvexError("Both players need four dealt cards.");
    const selectedNumbers = [...room.selectedNumbers, args.number];
    const winners = players.filter((player) => hasBingo(playerBoards(player), selectedNumbers));

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
        lastCallerId: me._id,
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
      lastCallerId: me._id,
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
    const players = await ctx.db.query("players").withIndex("by_room", (q) => q.eq("roomId", room._id)).collect();
    const bothReady = players.every((player) => player._id === me._id || player.rematchReady);
    if (players.length === 2 && bothReady) {
      await Promise.all(players.map((player) => ctx.db.patch(player._id, {
        board: undefined,
        boards: undefined,
        ready: false,
        rematchReady: false,
      })));
      await ctx.db.patch(room._id, {
        status: "arranging",
        selectedNumbers: [],
        lastCallerId: undefined,
        turnNumber: 0,
        round: room.round + 1,
        currentPlayerId: undefined,
        winnerPlayerId: undefined,
        isDraw: false,
      });
    }
  },
});
