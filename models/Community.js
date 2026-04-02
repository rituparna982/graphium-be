const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema({
  name: String,
  title: String,
  mutual: Number,
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

module.exports = mongoose.model('Community', communitySchema);
