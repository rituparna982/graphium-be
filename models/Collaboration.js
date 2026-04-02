const mongoose = require('mongoose');

const collaborationSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  message: { type: String, default: '' },
  topic: { type: String, default: '' },
}, { timestamps: true });

collaborationSchema.index({ requester: 1, recipient: 1 }, { unique: true });

module.exports = mongoose.model('Collaboration', collaborationSchema);
