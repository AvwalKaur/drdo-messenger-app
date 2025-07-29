// models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phone: { type: String, unique: true },
    name: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);