const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

// Store users with their socket ID
const users = new Map();

io.on("connection", (socket) => {
  console.log("A user connected");

  // When user sets their name
  socket.on("set name", (name) => {
    users.set(socket.id, name);
    io.emit("online users", Array.from(users.values()));
  });

  // When user sends a chat message
  socket.on("chat message", (data) => {
    const { name, message } = data;
    console.log(`${name}: ${message}`);
    io.emit("chat message", { name, message });
  });

  // When user disconnects
  socket.on("disconnect", () => {
    users.delete(socket.id);
    io.emit("online users", Array.from(users.values()));
    console.log("A user disconnected");
  });
});

http.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
