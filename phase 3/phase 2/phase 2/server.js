
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const Message = require('./models/message');
const Contact = require('./models/contact');
const Group = require('./models/group');
const GroupMessage = require('./models/groupMessage');


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
    socket.join(userId);
    console.log(`User ${userId} connected with socket ID ${socket.id}`);
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


  // Request groups
  socket.on('request-groups', async (userId) => {
    try {
      const groups = await Group.find({ members: userId });
      socket.emit('update-groups', groups);
    } catch (err) {
      console.error('Error fetching groups:', err);
    }
  });


  // Send private message
  socket.on('send-message', async (message) => {
    try {
      const newMessage = await Message.create({
        from: message.from,
        to: message.to,
        content: message.content,
        timestamp: new Date()
      });


      // Send to recipient
      const recipientSocketId = userSocketMap[message.to];
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('receive-message', newMessage);
      }


      // Send back to sender
      const senderSocketId = userSocketMap[message.from];
      if (senderSocketId) {
        io.to(senderSocketId).emit('receive-message', newMessage);
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });


  // Send group message
  socket.on('send-group-message', async (msg) => {
    try {
      const groupMessage = await GroupMessage.create({
        groupId: msg.groupId,
        from: msg.from,
        content: msg.content,
        timestamp: new Date()
      });


      const group = await Group.findById(msg.groupId);
      if (group) {
        group.members.forEach(member => {
          io.to(member).emit('receive-group-message', groupMessage);
        });
      }
    } catch (err) {
      console.error('Error saving group message:', err);
    }
  });


  // Handle group creation notification
  socket.on('group-created', (group) => {
    group.members.forEach(member => {
      io.to(member).emit('update-groups', [group]);
    });
  });


  // Handle group deletion notification
  socket.on('group-deleted', ({ groupId }) => {
    io.to(groupId).emit('group-deleted', { groupId });
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
});


// API Endpoints
app.post('/accept-invite', async (req, res) => {
  try {
    const { from, to, name, code } = req.body;
    const contact = await Contact.create({
      users: [from, to],
      inviteCode: code,
      userName: name
    });


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


app.delete('/delete-contact', async (req, res) => {
  try {
    const { userId, contactId } = req.body;
    await Contact.deleteOne({
      users: { $all: [userId, contactId] }
    });


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


app.get('/contacts', async (req, res) => {
  try {
    const { user } = req.query;
    const contacts = await Contact.find({ users: user });
    const formattedContacts = contacts.map(contact => ({
      _id: contact._id,
      users: contact.users,
      otherUser: contact.users.find(u => u !== user),
      userName: contact.userName
    }));
    res.json(formattedContacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/create-group', async (req, res) => {
  try {
    const { name, admin, members } = req.body;
    const group = new Group({ name, admin, members });
    await group.save();


    members.forEach(member => {
      io.to(member).emit('update-groups', [group]);
    });


    res.status(201).json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.delete('/delete-group', async (req, res) => {
  try {
    const { groupId, adminId } = req.body;
    const group = await Group.findById(groupId);


    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.admin !== adminId) return res.status(403).json({ error: 'Only admin can delete the group' });


    await Group.findByIdAndDelete(groupId);
    await GroupMessage.deleteMany({ groupId });


    io.to(group.members).emit('group-deleted', { groupId });
    res.status(200).json({ message: 'Group deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/group-messages', async (req, res) => {
  try {
    const { groupId } = req.query;
    const messages = await GroupMessage.find({ groupId }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Start server
const PORT = process.env.PORT || 5600;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


// Corrected