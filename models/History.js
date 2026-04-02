const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────────────────────────
// History Model — stores ALL user actions permanently (never deleted).
// Tracks: posts, logins, lab actions, collaborations, comments, etc.
// ──────────────────────────────────────────────────────────────────────────────

const historySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true }, // e.g. 'login', 'post_created', 'lab_joined', etc.
  category: {
    type: String,
    enum: ['auth', 'post', 'lab', 'collaboration', 'message', 'conference', 'profile', 'other'],
    default: 'other',
  },
  description: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, // Flexible extra data
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null }, // ID of the related entity
  targetType: { type: String, default: '' }, // 'Post', 'Lab', 'Collaboration', etc.
}, { timestamps: true });

// Index for efficient chronological queries per user
historySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('History', historySchema);
