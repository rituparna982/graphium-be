const express = require('express');
const Community = require('../models/Community');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   GET /api/community
 * @desc    Get all communities
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const Profile = require('../models/Profile');
    const profiles = await Profile.find().populate('userId', 'nameEncrypted avatar provider').lean();
    const users = profiles.map(p => ({
      _id: p.userId?._id,
      id: p.userId?._id,
      name: p.name,
      title: p.title,
      avatar: p.avatar,
      mutual: 0,
    })).filter(u => u._id);
    res.json(users);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/community/:id/join
 * @desc    Join a community
 * @access  Private
 */
router.post('/:id/join', authMiddleware, async (req, res, next) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) {
      const err = new Error('Community not found');
      err.statusCode = 404;
      throw err;
    }

    if (community.members.includes(req.user._id)) {
      const err = new Error('Already a member');
      err.statusCode = 400;
      throw err;
    }

    community.members.push(req.user._id);
    await community.save();
    res.json({ message: 'Joined successfully', community });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
