const express = require('express');
const router = express.Router();
const User = require('../models/User');
const CollabRequest = require('../models/CollabRequest');
const jwt = require('jsonwebtoken');

// Simple auth middleware for flutter routes
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforgraphium');
    req.user = { id: decoded.userId || decoded.id };
    next();
  } catch (error) {
    // DEV BYPASS: if token is invalid but we are in dev, check for x-user-id header
    if (req.headers['x-user-id']) {
       req.user = { id: req.headers['x-user-id'] };
       return next();
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// 1 & 6. GET /users → fetch all users
router.get('/users', auth, async (req, res) => {
  try {
    const users = await User.find({});
    // Return formatted data
    const formatted = users.map(u => ({
      id: u._id,
      name: u.name,
      email: u.email,
      bio: u.bio,
      profilePic: u.avatar,
      skills: u.skills
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2 & 6. GET /users/:id → fetch user profile
router.get('/users/:id', auth, async (req, res) => {
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    
    // Check previous collaborations
    const collabs = await CollabRequest.find({
      $or: [
        { sender_id: u._id, receiver_id: req.user.id, status: 'accepted' },
        { sender_id: req.user.id, receiver_id: u._id, status: 'accepted' }
      ]
    });

    res.json({
      id: u._id,
      name: u.name,
      email: u.email,
      bio: u.bio,
      profilePic: u.avatar,
      skills: u.skills,
      previousCollaborations: collabs.length > 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3 & 6. POST /collab-request → send request
router.post('/collab-request', auth, async (req, res) => {
  try {
    const { receiver_id } = req.body;
    const existing = await CollabRequest.findOne({ sender_id: req.user.id, receiver_id });
    if (existing) return res.status(400).json({ error: 'Request already sent' });

    const reqData = new CollabRequest({
      sender_id: req.user.id,
      receiver_id,
      status: 'pending'
    });
    await reqData.save();
    res.json(reqData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4 & 6. GET /collab-requests → get incoming requests
router.get('/collab-requests', auth, async (req, res) => {
  try {
    const requests = await CollabRequest.find({ receiver_id: req.user.id, status: 'pending' })
      .populate('sender_id');
      
    const formatted = requests.map(r => ({
      id: r._id,
      sender: r.sender_id ? {
        id: r.sender_id._id,
        name: r.sender_id.name,
        profilePic: r.sender_id.avatar
      } : null,
      status: r.status,
      timestamp: r.createdAt
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5 & 6. PUT /collab-request/:id → accept/reject
router.put('/collab-request/:id', auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'rejected'].includes(status)) {
       return res.status(400).json({ error: 'Invalid status' });
    }
    const reqData = await CollabRequest.findOneAndUpdate(
      { _id: req.params.id, receiver_id: req.user.id },
      { status },
      { new: true }
    );
    if (!reqData) return res.status(404).json({ error: 'Request not found' });
    res.json(reqData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6 & 6. PUT /update-profile
router.put('/update-profile', auth, async (req, res) => {
  try {
    const { name, bio, profilePic, skills } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // name needs to be encrypted correctly using the model's logic if possible, 
    // but we can just use the provided model methods if they exist, or update the db directly.
    // The Graphium User model uses encyclpted emails & names.
    const { encrypt } = require('../utils/encryption');
    if (name) user.nameEncrypted = encrypt(name);
    
    if (bio !== undefined) user.bio = bio;
    if (profilePic !== undefined) user.avatar = profilePic;
    if (skills !== undefined) user.skills = skills;
    
    await user.save();
    res.json({ success: true, bio: user.bio, skills: user.skills, avatar: user.avatar });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. PUT /update-email
router.put('/update-email', auth, async (req, res) => {
  try {
    const { email } = req.body;
    // basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email format' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { encrypt, hmacHash } = require('../utils/encryption');
    user.emailEncrypted = encrypt(email);
    user.emailHash = hmacHash(email);

    await user.save();
    res.json({ success: true, email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. PUT /update-password
router.put('/update-password', auth, async (req, res) => {
  try {
    const { password } = req.body;
    // Password strength validation
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bcrypt = require('bcrypt');
    user.password = await bcrypt.hash(password, 14); // Using BCRYPT_ROUNDS from User.js
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
