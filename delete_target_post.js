const mongoose = require('mongoose');
const Post = require('./models/Post');
require('dotenv').config();

async function deletePost() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/researchin');
    console.log('Connected to MongoDB');

    const result = await Post.deleteOne({ content: 'Modi Paglu' });
    
    if (result.deletedCount > 0) {
      console.log('Successfully deleted the post.');
    } else {
      console.log('Post not found.');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error deleting post:', err);
    process.exit(1);
  }
}

deletePost();
