/**
 * socket.js — JeevanSaathiHub Socket.io manager
 *
 * Attach to an existing HTTP server:
 *   const { initSocket } = require("./socket");
 *   initSocket(httpServer);
 *
 * Emit to a specific user from any controller:
 *   const { emitToUser } = require("./socket");
 *   emitToUser(userId, "new_interest", { ... });
 */

const { Server } = require("socket.io");
const jwt        = require("jsonwebtoken");

// userId (string) → Set of socketIds
// One user can have multiple tabs open
const userSockets = new Map();

let io = null;

// ── Initialize Socket.io ──────────────────────────────────────────
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin:      process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
      methods:     ["GET", "POST"],
    },
    pingTimeout:  60000,
    pingInterval: 25000,
  });

  // ── Auth middleware — verify JWT before socket connects ──────────
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.cookie
          ?.split(";")
          .find(c => c.trim().startsWith("token="))
          ?.split("=")[1];

      if (!token) return next(new Error("Authentication required"));

      const decoded  = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId  = String(decoded.id);
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  // ── Connection handler ───────────────────────────────────────────
  io.on("connection", (socket) => {
    const userId = socket.userId;
    console.log(`🔌 Socket connected: user=${userId} socket=${socket.id}`);

    // Register socket for this user
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);

    // Join a personal room named by userId for easy targeting
    socket.join(userId);

    // ── Client events ────────────────────────────────────────────
    // User joins a private chat room
    socket.on("join_chat", ({ roomId }) => {
      if (roomId) socket.join(roomId);
    });

    // User leaves a chat room
    socket.on("leave_chat", ({ roomId }) => {
      if (roomId) socket.leave(roomId);
    });

    // Typing indicator
    socket.on("typing", ({ roomId, isTyping }) => {
      socket.to(roomId).emit("user_typing", {
        userId,
        isTyping,
      });
    });

    // ── Disconnect ───────────────────────────────────────────────
    socket.on("disconnect", () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) userSockets.delete(userId);
      }
      console.log(`🔌 Socket disconnected: user=${userId} socket=${socket.id}`);
    });
  });

  console.log("✅ Socket.io initialized");
  return io;
}

// ── Emit event to a specific user (all their tabs) ────────────────
// Called from controllers — no need to import io directly
function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(String(userId)).emit(event, data);
}

// ── Emit to a chat room ───────────────────────────────────────────
function emitToRoom(roomId, event, data) {
  if (!io) return;
  io.to(roomId).emit(event, data);
}

// ── Get socket instance ───────────────────────────────────────────
function getIO() {
  return io;
}

// ── Check if user is online ───────────────────────────────────────
function isUserOnline(userId) {
  return userSockets.has(String(userId));
}

module.exports = { initSocket, emitToUser, emitToRoom, getIO, isUserOnline };