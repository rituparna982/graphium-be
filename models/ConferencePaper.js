const mongoose = require('mongoose');

const conferencePaperSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  abstract: { type: String, default: '' },
  conference: { type: String, required: true },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'revision_requested', 'resubmitted', 'accepted', 'rejected'],
    default: 'draft'
  },
  reviewerNotes: { type: String, default: '' },
  revisionHistory: [{
    note: String,
    submittedAt: { type: Date, default: Date.now }
  }],
  submittedAt: Date,
  fileUrl: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('ConferencePaper', conferencePaperSchema);
