// models/groupMessage.js
const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
    groupId: String, // Reference to the group
    from: String,    // Sender's user ID
    content: String,
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GroupMessage', groupMessageSchema);