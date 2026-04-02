const express = require('express');
const History = require('../models/History');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// History Routes — View & record user activity history (never deleted)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/history
 * @desc    Get current user's full activity history (chronological, newest first)
 * @access  Private
 * @query   page (default 1), limit (default 50), category (optional filter)
 */
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const filter = { userId };
    if (req.query.category) {
      filter.category = req.query.category;
    }

    const [history, total] = await Promise.all([
      History.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      History.countDocuments(filter),
    ]);

    console.log(`[HISTORY] Fetched ${history.length} actions for user ${userId}`);

    res.json({
      history,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + history.length < total,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/history/all
 * @desc    Get ALL history from all users (dev mode / admin)
 * @access  Private
 */
router.get('/all', authMiddleware, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      History.find()
        .populate('userId', 'nameEncrypted avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      History.countDocuments(),
    ]);

    res.json({
      history,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
