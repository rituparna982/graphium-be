const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  isPublished: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Review', reviewSchema);
