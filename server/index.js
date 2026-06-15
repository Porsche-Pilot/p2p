import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Serve the public/ folder as static files
app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Room storage: roomId -> { sender: socketId }
const rooms = new Map();

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ─── Sender creates a room ───────────────────────────────
  socket.on("create-room", (roomId) => {
    rooms.set(roomId, { sender: socket.id });
    socket.join(roomId);
    console.log(`[room created] ${roomId} by ${socket.id}`);
  });

  // ─── Receiver joins a room ──────────────────────────────
  socket.on("join-room", (roomId) => {
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit("room-not-found");
      return;
    }

    socket.join(roomId);
    room.receiver = socket.id;
    console.log(`[room joined] ${roomId} by ${socket.id}`);

    // Notify sender that a peer has joined
    socket.to(roomId).emit("peer-joined", { receiverId: socket.id });
  });

  // ─── WebRTC SDP offer relay ─────────────────────────────
  socket.on("offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("offer", { offer });
  });

  // ─── WebRTC SDP answer relay ────────────────────────────
  socket.on("answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("answer", { answer });
  });

  // ─── ICE candidate relay ────────────────────────────────
  socket.on("ice-candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("ice-candidate", { candidate });
  });

  // ─── Disconnect cleanup ─────────────────────────────────
  socket.on("disconnect", () => {
    console.log(`[disconnect] ${socket.id}`);

    for (const [roomId, room] of rooms.entries()) {
      if (room.sender === socket.id) {
        // Sender left — destroy room
        io.to(roomId).emit("peer-disconnected", { role: "sender" });
        rooms.delete(roomId);
        console.log(`[room destroyed] ${roomId} (sender left)`);
      } else if (room.receiver === socket.id) {
        // Receiver left — notify sender
        room.receiver = null;
        io.to(roomId).emit("peer-disconnected", { role: "receiver" });
        console.log(`[receiver left] ${roomId}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  🚀 Mars P2P Share — signaling server`);
  console.log(`  ➜ Local:   http://localhost:${PORT}\n`);
});
