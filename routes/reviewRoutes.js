const express = require('express');
const Review = require('../models/Review');
const History = require('../models/History');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/reviews/:targetId — get all reviews for a specific post
router.get('/:targetId', async (req, res, next) => {
  try {
    const reviews = await Review.find({ targetId: req.params.targetId })
      .populate('reviewerId', 'name avatar')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) { next(err); }
});

// POST /api/reviews — create a new review
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { targetId, content, rating } = req.body;
    if (!targetId || !content || !rating) {
      return res.status(400).json({ error: 'Post ID, content, and rating are required.' });
    }

    const review = await Review.create({
      targetId,
      reviewerId: req.user._id,
      content,
      rating
    });
    
    await review.populate('reviewerId', 'name avatar');
    
    await History.create({
      userId: req.user._id,
      action: 'review_created',
      category: 'research',
      description: `Reviewed post: ${targetId}`,
      targetId: review._id,
      targetType: 'Review'
    });

    res.status(201).json(review);
  } catch (err) { next(err); }
});

module.exports = router;
