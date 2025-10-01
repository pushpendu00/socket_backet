// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5500"],
    credentials: true,
  })
);
app.use(express.json());

const io = new Server(server, {
  path: "/ws/socket.io",
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
// Helper: send to multiple users
// -----------------------
function emitToUsers(userIds, event, message) {
  userIds.forEach((uid) => {
    const socketId = connectedUsers[uid];
    if (socketId) {
      io.to(socketId).emit(event, message);
      console.log(`📤 Sent ${event} to ${uid}`);
    } else {
      console.log(`⚠️ User ${uid} not connected`);
    }
  });
}

// Helper: log with timestamp
function getTimeString() {
  const now = new Date();
  return now.toLocaleTimeString("en-GB", { hour12: false }); // HH:MM:SS
}

function logWithTime(message) {
  console.log(`[${getTimeString()}] ${message}`);
}

// -----------------------
// REST routes
// -----------------------
app.post("/webhook/emit", (req, res) => {
  const { event, message, routing } = req.body;
  console.log( event, message, routing);

  if (!event || !message || !routing) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  let recipients = [];

  switch (routing.type) {
    case "partner": // Employee → Partner
      recipients = routing.user_ids || [];
      break;

    case "all": // Partner → Employee (no mentions) OR Employee→@all OR Superadmin
      recipients = routing.user_ids || [];
      break;

    case "mentions": // Partner → Employee (mentions)
      recipients = routing.user_ids || [];
      break;

    case "department": // Employee → Department-specific
      recipients = routing.user_ids || [];
      break;

    default:
      return res
        .status(400)
        .json({ error: `Unknown routing type: ${routing.type}` });
  }

  if (recipients.length > 0) {
    emitToUsers(recipients, event, message);
  }

  res.json({
    status: "success",
    sent_to: recipients,
    routing_type: routing.type,
  });
});

// Webhook endpoint (async sending)
app.post("/emit", (req, res) => {
  const { event, message, routing } = req.body;

  if (!event || !message || !routing) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  let recipients = [];

  switch (routing.type) {
    case "partner":
    case "all":
    case "mentions":
    case "department":
      recipients = routing.user_ids || [];
      break;
    default:
      return res
        .status(400)
        .json({ error: `Unknown routing type: ${routing.type}` });
  }

  // ✅ Response immediately with timestamp
  const responseTime = getTimeString();
  res.json({
    status: "accepted",
    total_recipients: recipients.length,
    routing_type: routing.type,
    received_at: responseTime,
  });

  // ✅ Background async emit
  setImmediate(() => {
    recipients.forEach((uid, idx) => {
      const socketId = connectedUsers[uid];
      if (socketId) {
        io.to(socketId).emit(event, message);
      }

      //   if (idx % 100 === 0) {
      //     logWithTime(`Progress: sent to ${idx} users`);
      //   }
    });

    logWithTime(`📤 Completed sending ${event} to ${recipients.length} users`);
  });
});

// -----------------------
// Run server
// -----------------------
const PORT = 8000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});


