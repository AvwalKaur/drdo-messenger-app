const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const Message = require('./models/message');
const Contact = require('./models/contact');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/secure-chat', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB Connection Error:', err));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Socket.io Logic
const userSocketMap = {};

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // Register user
  socket.on('register', (userId) => {
    userSocketMap[userId] = socket.id;
    console.log(`User ${userId} connected with socket ID ${socket.id}`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    for (const [userId, socketId] of Object.entries(userSocketMap)) {
      if (socketId === socket.id) {
        delete userSocketMap[userId];
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  });

  // Request contacts
  socket.on('request-contacts', async (userId) => {
    try {
      const contacts = await Contact.find({ users: userId });
      const formattedContacts = contacts.map(contact => ({
        _id: contact._id,
        users: contact.users,
        otherUser: contact.users.find(user => user !== userId),
        userName: contact.userName
      }));
      socket.emit('update-contacts', formattedContacts);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    }
  });

  // Send message
  socket.on('send-message', async (message) => {
    try {
      // Save message to database
      const newMessage = await Message.create({
        from: message.from,
        to: message.to,
        content: message.content,
        timestamp: new Date()
      });

      // Send to recipient if online
      const recipientSocketId = userSocketMap[message.to];
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('receive-message', newMessage);
      }

      // Send back to sender for UI update
      const senderSocketId = userSocketMap[message.from];
      if (senderSocketId) {
        io.to(senderSocketId).emit('receive-message', newMessage);
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });
});

// API Endpoints
app.post('/accept-invite', async (req, res) => {
  try {
    const { from, to, name, code } = req.body;

    // Create new contact
    const contact = await Contact.create({
      users: [from, to],
      inviteCode: code,
      userName: name
    });

    // Notify both users
    [from, to].forEach(userId => {
      const socketId = userSocketMap[userId];
      if (socketId) {
        io.to(socketId).emit('new-contact', {
          _id: contact._id,
          users: contact.users,
          otherUser: contact.users.find(u => u !== userId),
          userName: name
        });
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error accepting invite:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/messages', async (req, res) => {
  try {
    const { from, to } = req.query;
    const messages = await Message.find({
      $or: [
        { from, to },
        { from: to, to: from }
      ]
    }).sort('timestamp');
    res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete contact endpoint
app.delete('/delete-contact', async (req, res) => {
  try {
    const { userId, contactId } = req.body;

    // Remove the contact relationship
    await Contact.deleteOne({
      users: { $all: [userId, contactId] }
    });

    // Notify both users to update their contact lists
    [userId, contactId].forEach(user => {
      const socketId = userSocketMap[user];
      if (socketId) {
        io.to(socketId).emit('contact-deleted', {
          deletedUserId: user === userId ? contactId : userId
        });
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting contact:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 5600;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});