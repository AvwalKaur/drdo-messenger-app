const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  users: {
    type: [String],
    required: true
  },
  userNames: {
    type: Map,
    of: String
  },
  inviteCode: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Contact', contactSchema);