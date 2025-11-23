const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const Message = require('./models/message');
const Contact = require('./models/contact');
const Group = require('./models/group');

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
// Map of userId (string like phone) -> socket.id
const userSocketMap = {};

/**
 * Helper: find socket id for a given userId
 */
function getSocketIdForUser(userId) {
  return userSocketMap[userId];
}

/**
 * Helper: build contact listing for a specific user
 * returns { contacts: [...], groups: [...] }
 */
async function buildContactsAndGroupsForUser(userId) {
  // Contacts where this user is part of users array
  const rawContacts = await Contact.find({
    users: { $in: [userId] }
  }).lean();

  // Map contacts to the shape frontend expects:
  // { _id, users, otherUser, userName }
  const contacts = rawContacts.map(c => {
    // determine the other user in the pair
    const otherUser = c.users.find(u => u !== userId) || c.users[0];
    // userName field in contact currently stores the name of the other user (as per your schema use)
    // But we'll be defensive: if userId matches who stored the userName meaning, pick sensible labels
    return {
      _id: c._id.toString(),
      users: c.users,
      otherUser: otherUser,
      userName: c.userName // may be name of the invited user
    };
  });

  // Groups where user is member
  const rawGroups = await Group.find({
    members: { $in: [userId] }
  }).lean();

  // Map group to frontend-friendly shape:
  // { _id, name, creator, members }
  const groups = rawGroups.map(g => {
    return {
      _id: g._id.toString(),
      name: g.name,
      // ensure creator is a string in the payload so frontend comparison works
      creator: (g.creator && typeof g.creator === 'object' && g.creator.toString) ? g.creator.toString() : String(g.creator),
      members: g.members
    };
  });

  return { contacts, groups };
}

/**
 * Helper: emit updated contacts/groups to a single user (if online)
 */
async function emitUpdateContactsToUser(userId) {
  const socketId = getSocketIdForUser(userId);
  if (!socketId) return;

  try {
    const payload = await buildContactsAndGroupsForUser(userId);
    io.to(socketId).emit('update-contacts', payload);
  } catch (err) {
    console.error('Error emitting update-contacts to', userId, err);
  }
}

/**
 * Helper: broadcast updated contacts/groups to an array of users (if online)
 */
async function emitUpdateContactsToUsers(userIds = []) {
  await Promise.all(userIds.map(uid => emitUpdateContactsToUser(uid)));
}

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // Register user
  socket.on('register', async (userId) => {
    userSocketMap[userId] = socket.id;
    console.log(`User ${userId} connected with socket ID ${socket.id}`);

    // JOIN USER ROOM
    socket.join(userId);

    // Also join all groups the user already has
    const groups = await Group.find({
      members: { $in: [userId] }
    }).lean();

    groups.forEach(g => socket.join(g._id.toString()));

    emitUpdateContactsToUser(userId);
  });


  // Request contacts (frontend uses this on load)
  socket.on('request-contacts', async (userId) => {
    try {
      await emitUpdateContactsToUser(userId);
    } catch (err) {
      console.error('Error in request-contacts for', userId, err);
    }
  });

  // Accept invite (socket version)
  socket.on('accept-invite', async (data) => {
    try {
      const { from, to, name, code } = data; // from = inviter's id, to = invitee's id, name = invitee's name

      // Prevent duplicate contact entries: only create if not exists
      const existing = await Contact.findOne({
        users: { $all: [from, to] }
      });

      if (!existing) {
        // We'll store userName as the name of the invitee for the record.
        // Your existing schema only stores one userName field; we will leave it as-is
        const contact = await Contact.create({
          users: [from, to],
          inviteCode: code,
          userName: name // the name provided by invitee (useful for inviter's view)
        });

        // Emit a lightweight 'new-contact' for immediate UI reaction (if sockets exist)
        // But also trigger full update-contacts for robust syncing.
        // For the invited user (to) — show otherUser = from
        const inviterSocket = getSocketIdForUser(from);
        const inviteeSocket = getSocketIdForUser(to);

        // If inviter is online, tell them they have a new contact (with invitee's name)
        if (inviterSocket) {
          io.to(inviterSocket).emit('new-contact', {
            _id: contact._id.toString(),
            users: contact.users,
            otherUser: to,
            userName: name // the name of the invitee — nice for inviter's UI
          });
        }

        // If invitee is online, tell them they have a new contact (inviter's id as otherUser)
        if (inviteeSocket) {
          io.to(inviteeSocket).emit('new-contact', {
            _id: contact._id.toString(),
            users: contact.users,
            otherUser: from,
            userName: from // we don't have inviter's display name; use their id/phone so it shows
          });
        }
      }

      // Finally, emit updated contact/group lists to both users (if online)
      await emitUpdateContactsToUsers([from, to]);
    } catch (err) {
      console.error('Error accepting invite (socket):', err);
    }
  });

  // Create group
  socket.on('create-group', async (data) => {
    try {
      const { creatorId, groupName, members } = data;

      // Ensure creator present in members
      const uniqueMembers = Array.from(new Set([...(members || []), creatorId]));

      // Save group
      const newGroup = await Group.create({
        name: groupName,
        creator: creatorId,
        members: uniqueMembers,
        createdAt: new Date()
      });

      // Make the creating socket join the room
      socket.join(newGroup._id.toString());

      // Also add any currently-connected member sockets to that room so they receive room emits
      await Promise.all(uniqueMembers.map(async (memberId) => {
        const sId = getSocketIdForUser(memberId); // socket.id of the member
        if (sId) {
          const memberSocket = io.sockets.sockets.get(sId);
          if (memberSocket) {
            memberSocket.join(newGroup._id.toString());
          }
        }
      }));

      // Prepare payload
      const groupPayload = {
        _id: newGroup._id.toString(),
        name: newGroup.name,
        creator: String(newGroup.creator),
        members: newGroup.members
      };

      // Notify (you can still emit individual 'group-created' if you like)
      await Promise.all(uniqueMembers.map(async (memberId) => {
        const sId = getSocketIdForUser(memberId);
        if (sId) {
          io.to(sId).emit('group-created', groupPayload);
        }
      }));

      // Trigger full update-contacts for all members
      await emitUpdateContactsToUsers(uniqueMembers);
    } catch (err) {
      console.error('Error creating group:', err);
      socket.emit('group-error', { error: err.message });
    }
  });

  // Send message
  socket.on('send-message', async (message) => {
    try {
      // message: { from, to, content, [isGroup?] }
      const isGroup = message.isGroup === true || message.isGroup === 'true';
      const newMessage = await Message.create({
        from: message.from,
        to: message.to,
        content: message.content,
        timestamp: new Date(),
        isGroup: isGroup
      });

      // If it is a group message, send to every member's socket (if online)
      if (isGroup) {
        // find group members
        const group = await Group.findById(message.to).lean();
        if (group && Array.isArray(group.members)) {
          io.to(message.to).emit('receive-message', newMessage);
        }
      } else {
        // individual message: send to recipient and to sender
        const recipientSocketId = getSocketIdForUser(message.to);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('receive-message', newMessage);
        }

        const senderSocketId = getSocketIdForUser(message.from);
        if (senderSocketId) {
          io.to(senderSocketId).emit('receive-message', newMessage);
        }
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  // Delete group (optional handler if UI uses it)
  socket.on('delete-group', async ({ groupId, userId }) => {
    try {
      // Only the creator or a member can request deletion in your UI logic; here we'll simply remove group
      const group = await Group.findById(groupId).lean();
      if (!group) {
        socket.emit('group-error', { error: 'Group not found' });
        return;
      }

      // Remove group from DB
      await Group.deleteOne({ _id: groupId });

      // Notify all members to update their group lists
      const members = group.members || [];
      members.forEach(member => {
        const sId = getSocketIdForUser(member);
        if (sId) {
          io.to(sId).emit('group-deleted', { groupId: groupId.toString() });
        }
      });

      // Also emit fresh lists for all members
      await emitUpdateContactsToUsers(members);
    } catch (err) {
      console.error('Error deleting group:', err);
    }
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

    // Prevent duplicate
    const existing = await Contact.findOne({
      users: { $all: [from, to] }
    });

    if (!existing) {
      const contact = await Contact.create({
        users: [from, to],
        inviteCode: code,
        userName: name
      });

      // Emit lightweight new-contact to online sockets (mirrors socket handler)
      const inviterSocket = getSocketIdForUser(from);
      const inviteeSocket = getSocketIdForUser(to);

      if (inviterSocket) {
        io.to(inviterSocket).emit('new-contact', {
          _id: contact._id.toString(),
          users: contact.users,
          otherUser: to,
          userName: name
        });
      }
      if (inviteeSocket) {
        io.to(inviteeSocket).emit('new-contact', {
          _id: contact._id.toString(),
          users: contact.users,
          otherUser: from,
          userName: from
        });
      }
    }

    // Update contacts/groups for both users
    await emitUpdateContactsToUsers([from, to]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error accepting invite (api):', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/messages', async (req, res) => {
  try {
    const { from, to, isGroup } = req.query;

    if (String(isGroup) === 'true' || isGroup === true) {
      // Group messages (to = groupId)
      const messages = await Message.find({
        to: to,
        isGroup: true
      }).sort('timestamp');
      res.json(messages);
    } else {
      // Individual messages
      const messages = await Message.find({
        $or: [
          { from, to },
          { from: to, to: from }
        ]
      }).sort('timestamp');
      res.json(messages);
    }
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

    // Also delete all messages between these users
    await Message.deleteMany({
      $or: [
        { from: userId, to: contactId },
        { from: contactId, to: userId }
      ]
    });

    // Notify both users to update their contact lists
    await emitUpdateContactsToUsers([userId, contactId]);

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
