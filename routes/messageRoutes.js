const express = require('express');
const Message = require('../models/Message');
const Profile = require('../models/Profile');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   GET /api/messages/conversations
 * @desc    Get all conversations for the current user (latest message per conversation)
 * @access  Private
 */
router.get('/conversations', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Find all distinct conversations involving the current user
    const messages = await Message.aggregate([
      { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$conversationId',
          lastMessage: { $first: '$content' },
          lastMessageAt: { $first: '$createdAt' },
          sender: { $first: '$sender' },
          receiver: { $first: '$receiver' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$receiver', userId] }, { $eq: ['$read', false] }] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { lastMessageAt: -1 } }
    ]);

    // For each conversation, determine the other user and fetch their profile
    const conversations = await Promise.all(
      messages.map(async (msg) => {
        const otherUserId = msg.sender.toString() === userId.toString() ? msg.receiver : msg.sender;
        const profile = await Profile.findOne({ userId: otherUserId });
        return {
          conversationId: msg._id,
          otherUserId,
          otherUserName: profile?.name || 'User',
          otherUserTitle: profile?.title || 'Researcher',
          otherUserAvatar: profile?.avatar || '',
          lastMessage: msg.lastMessage,
          lastMessageAt: msg.lastMessageAt,
          unreadCount: msg.unreadCount,
        };
      })
    );

    res.json(conversations);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/messages/:userId
 * @desc    Get message history with a specific user
 * @access  Private
 */
router.get('/:userId', authMiddleware, async (req, res, next) => {
  try {
    const conversationId = Message.getConversationId(req.user._id, req.params.userId);

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .limit(100);

    // Mark messages as read that were sent to the current user
    await Message.updateMany(
      { conversationId, receiver: req.user._id, read: false },
      { $set: { read: true } }
    );

    res.json(messages);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/messages/:userId
 * @desc    Send a message to a user (fallback for non-WebSocket clients)
 * @access  Private
 */
router.post('/:userId', authMiddleware, async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    const conversationId = Message.getConversationId(req.user._id, req.params.userId);

    const message = new Message({
      conversationId,
      sender: req.user._id,
      receiver: req.params.userId,
      content: content.trim(),
    });

    await message.save();
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
