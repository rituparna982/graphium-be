const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Conversation participants (sorted pair for consistent lookup)
  conversationId: { type: String, required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  read: { type: Boolean, default: false },
}, { timestamps: true });

// Index for fetching conversation messages in order
messageSchema.index({ conversationId: 1, createdAt: 1 });
// Index for unread message counts
messageSchema.index({ receiver: 1, read: 1 });

// Static: generate a consistent conversation ID from two user IDs
messageSchema.statics.getConversationId = function (userId1, userId2) {
  return [userId1.toString(), userId2.toString()].sort().join('_');
};

module.exports = mongoose.model('Message', messageSchema);
