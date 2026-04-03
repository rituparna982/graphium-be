const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  
  // Post type determines the form fields and display
  category: { 
    type: String, 
    enum: ['general', 'paper', 'dataset', 'question', 'milestone', 'event', 'article'],
    default: 'general'
  },
  imageUrl: { type: String, default: '' },

  // Dynamic action text shown under author name
  action: { type: String, default: 'shared an update' },
  target: { type: String, default: '' },
  
  // Engagement counters
  likes: { type: Number, default: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: { type: Number, default: 0 },
  citations: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  views: { type: Number, default: 0 },

  // Tags / hashtags
  tags: [{ type: String }],

  // AI generated flag
  isAi: { type: Boolean, default: false },

  // Repost / Share support
  isRepost: { type: Boolean, default: false },
  originalPost: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },

  // Paper-specific fields
  paper: {
    title: String,
    journal: String,
    doi: String,
    abstract: String,
    coAuthors: [String],
    year: Number
  },

  // Dataset-specific fields
  dataset: {
    title: String,
    source: String,
    url: String,
    size: String,
    format: String,
    license: String
  },

  // Event-specific fields
  event: {
    title: String,
    date: String,
    location: String,
    url: String,
    eventType: { type: String, enum: ['conference', 'workshop', 'seminar', 'webinar', 'other'], default: 'other' }
  },

  // Article-specific fields
  article: {
    title: String,
    subtitle: String,
    url: String
  },

  // Generic attachment (backward compatible)
  attachment: {
    title: String,
    type: { type: String },
    icon: String,
    desc: String,
    url: String
  }
}, { timestamps: true });

// Index for efficient recent-first querying
postSchema.index({ createdAt: -1 });
// Index for author-specific queries
postSchema.index({ author: 1, createdAt: -1 });
// Index for category filtering
postSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
