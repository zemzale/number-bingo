import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const gameStatus = v.union(
  v.literal("waiting"),
  v.literal("arranging"),
  v.literal("playing"),
  v.literal("finished")
);

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    status: gameStatus,
    hostPlayerId: v.optional(v.id("players")),
    currentPlayerId: v.optional(v.id("players")),
    winnerPlayerId: v.optional(v.id("players")),
    isDraw: v.boolean(),
    initialStartingSeat: v.optional(v.number()),
    lastCallerId: v.optional(v.id("players")),
    selectedNumbers: v.array(v.number()),
    turnNumber: v.number(),
    round: v.number(),
  }).index("by_code", ["code"]),

  players: defineTable({
    roomId: v.id("rooms"),
    token: v.string(),
    name: v.string(),
    seat: v.number(),
    board: v.optional(v.array(v.number())),
    boards: v.optional(v.array(v.array(v.number()))),
    ready: v.boolean(),
    rematchReady: v.boolean(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_token", ["roomId", "token"]),

  moves: defineTable({
    roomId: v.id("rooms"),
    playerId: v.id("players"),
    number: v.number(),
    turnNumber: v.number(),
    round: v.number(),
  }).index("by_room_round", ["roomId", "round"]),
});
