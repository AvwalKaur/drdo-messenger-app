// models/group.js
const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    // Changed creator from ObjectId to String so it matches the rest of your app (phone/id string)
    creator: {
        type: String,
        required: true
    },
    // Members are stored as strings (phone/id), which matches your frontend usage
    members: [{
        type: String,
        required: true
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Group', groupSchema);
