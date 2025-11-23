const mongoose = require('mongoose');

// Define schema for contact (sender and receiver)
const contactSchema = new mongoose.Schema({
  users: {
    type: [String],           // Expect an array: [sender, receiver]
    required: true,
    validate: {
      validator: function (arr) {
        return arr.length === 2;
      },
      message: 'Users array must contain exactly two usernames.'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Export model, avoiding overwrite issues in dev mode
module.exports = mongoose.models.Contact || mongoose.model('Contact', contactSchema);
