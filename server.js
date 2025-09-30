// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// -----------------------
// App + HTTP server
// -----------------------
const app = express();
const server = http.createServer(app);

// -----------------------
// Middleware
// -----------------------
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5500"],
    credentials: true,
  })
);
app.use(express.json());

// -----------------------
// Socket.IO setup
// -----------------------
const io = new Server(server, {
  path: "/ws/socket.io", // same path as Python code
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5500"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// -----------------------
// Connected users: { userId: socket.id }
// -----------------------
const connectedUsers = {};

// -----------------------
// Socket.IO events
// -----------------------
io.on("connection", (socket) => {
  const userId = socket.handshake.auth?.userId;

  if (!userId) {
    console.log("❌ Connection rejected: No userId");
    socket.disconnect(true);
    return;
  }

  connectedUsers[userId] = socket.id;
  console.log(`✅ User ${userId} connected with SID ${socket.id}`);

  socket.on("disconnect", () => {
    if (connectedUsers[userId] === socket.id) {
      delete connectedUsers[userId];
      console.log(`❌ User ${userId} disconnected (SID ${socket.id})`);
    }
  });

  socket.on("message", (data) => {
    console.log(`📩 Received from ${socket.id}:`, data);
    socket.emit("message", { msg: `Echo: ${data}` });
  });
});

// -----------------------
// REST routes
// -----------------------
app.post("/emit", (req, res) => {
  const { user_id, event, data } = req.body;

  const socketId = connectedUsers[user_id];
  if (!socketId) {
    return res.status(404).json({ error: "User not connected" });
  }

  io.to(socketId).emit(event, data);
  res.json({ status: "success", sent_to: user_id });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", connected_users: Object.keys(connectedUsers) });
});

// -----------------------
// Run server
// -----------------------
const PORT = 8000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
