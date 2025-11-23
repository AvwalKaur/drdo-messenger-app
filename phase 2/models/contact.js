const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  users: {
    type: [String],
    required: true
  },
  inviteCode: {
    type: String,
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Contact', contactSchema);