const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, required: true },
  avatar: { type: String, default: '' },
  title: { type: String, default: 'Researcher' },
  institution: { type: String, default: 'Quantum Institute' },
  about: String,
  stats: {
    hIndex: { type: Number, default: 0 },
    citations: { type: Number, default: 0 },
    interest: { type: Number, default: 0 }
  },
  publications: [{
    title: String,
    journal: String,
    date: Date,
    citations: { type: Number, default: 0 },
    abstract: String
  }],
  grants: [{
    name: String,
    agency: String,
    amount: String,
    period: String
  }],
  skills: [{
    name: String,
    level: { type: Number, default: 1 }
  }],
  // User settings (stored with profile)
  settings: {
    visibility: { type: String, enum: ['public', 'private', 'connections'], default: 'public' },
    notifications: { type: Boolean, default: true },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    language: { type: String, default: 'en' },
  }
}, { timestamps: true });

module.exports = mongoose.model('Profile', profileSchema);
