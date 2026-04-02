const express = require('express');
const Profile = require('../models/Profile');
const History = require('../models/History');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// ─── Helper: Log to history ───────────────────────────────────────────────────
async function logHistory(userId, action, category, description) {
  try {
    await History.create({ userId, action, category, description });
  } catch (err) {
    console.error('[HISTORY] Failed to log:', err.message);
  }
}

/**
 * @route   GET /api/profile
 * @desc    Get current user's profile (auto-create if missing)
 * @access  Private
 */
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    let profile = await Profile.findOne({ userId: req.user._id });
    
    // DEV MODE: Auto-create profile if it doesn't exist
    if (!profile) {
      console.log('[PROFILE] Auto-creating profile for user:', req.user._id);
      profile = await Profile.create({
        userId: req.user._id,
        name: req.user.name || 'Researcher',
        title: 'Researcher',
        institution: 'Research Institute',
        about: 'Passionate researcher exploring new frontiers.',
        stats: { hIndex: 0, citations: 0, interest: 0 },
      });
    }

    res.json(profile);
  } catch (err) {
    console.error('[PROFILE] GET / error:', err);
    next(err);
  }
});

/**
 * @route   GET /api/profile/:userId
 * @desc    Get a specific user's profile (auto-create if missing)
 * @access  Public
 */
router.get('/:userId', async (req, res, next) => {
  try {
    let profile = await Profile.findOne({ userId: req.params.userId });
    
    if (!profile) {
      // DEV MODE: Create a placeholder profile
      profile = await Profile.create({
        userId: req.params.userId,
        name: 'Researcher',
        title: 'Researcher',
      });
    }

    res.json(profile);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PUT /api/profile
 * @desc    Create or update user profile — DEV MODE: No required fields
 * @access  Private
 */
router.put('/', authMiddleware, async (req, res, next) => {
  try {
    const { title, institution, about, stats, publications, grants, skills, name, settings } = req.body;

    console.log('[PROFILE] Updating profile for user:', req.user._id);

    const profileFields = {
      userId: req.user._id,
      name: name || req.user.name || 'Researcher',
      avatar: req.user.avatar || '',
    };

    // Only set fields that are provided
    if (title !== undefined) profileFields.title = title;
    if (institution !== undefined) profileFields.institution = institution;
    if (about !== undefined) profileFields.about = about;
    if (stats !== undefined) profileFields.stats = stats;
    if (publications !== undefined) profileFields.publications = publications;
    if (grants !== undefined) profileFields.grants = grants;
    if (skills !== undefined) profileFields.skills = skills;
    if (settings !== undefined) profileFields.settings = settings;

    let profile = await Profile.findOne({ userId: req.user._id });
    if (profile) {
      profile = await Profile.findOneAndUpdate(
        { userId: req.user._id },
        { $set: profileFields },
        { new: true }
      );
    } else {
      profile = new Profile(profileFields);
      await profile.save();
    }

    await logHistory(req.user._id, 'profile_updated', 'profile', 'Updated profile settings');

    console.log('[PROFILE] Profile updated successfully');
    return res.json(profile);
  } catch (err) {
    console.error('[PROFILE] PUT / error:', err);
    next(err);
  }
});

module.exports = router;
