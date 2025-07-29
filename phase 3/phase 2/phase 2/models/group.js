// models/group.js
const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    name: String,
    admin: String, // User ID of the admin
    members: [String], // Array of user IDs
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Group', groupSchema);