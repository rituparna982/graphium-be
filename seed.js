require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs').promises;
const connectDB = require('./config/db');

const Profile = require('./models/Profile');
const Post = require('./models/Post');
const Community = require('./models/Community');

const seedDB = async () => {
  await connectDB();
  try {
    const data = await fs.readFile('./db.json', 'utf-8');
    const { profile, feed, community } = JSON.parse(data);

    await Profile.deleteMany();
    await Post.deleteMany();
    await Community.deleteMany();
    const User = require('./models/User');
    await User.deleteMany();

    // Create a default researcher user
    const user = await User.createUser({
      email: 'dr.researcher@quantum.edu',
      name: 'Dr. Researcher',
      password: 'Password123!',
      role: 'researcher'
    });

    console.log(`Default user created: ${user.email}`);

    // Link profile to user
    const profileToCreate = { ...profile, userId: user._id };
    await Profile.create(profileToCreate);

    // Link posts to user
    const postsToCreate = feed.map(p => ({ ...p, author: user._id }));
    await Post.insertMany(postsToCreate);

    await Community.insertMany(community);

    console.log('Database seeded successfully with relational data!');
    process.exit();
  } catch (err) {
    console.error('Error seeding database:', err.message);
    process.exit(1);
  }
};

seedDB();
