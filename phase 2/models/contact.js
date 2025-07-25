const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  users: {
    type: [String],
    required: true,
    index: true // Add index for better performance
  },
  inviteCode: String,
  userName: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create compound index for faster lookups
contactSchema.index({ users: 1 });

module.exports = mongoose.model('Contact', contactSchema);