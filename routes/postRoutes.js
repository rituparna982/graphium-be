const express = require('express');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const History = require('../models/History');
const { authMiddleware } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

const router = express.Router();

// ─── Helper: Log to history ───────────────────────────────────────────────────
async function logHistory(userId, action, category, description, metadata = {}, targetId = null, targetType = '') {
  try {
    await History.create({ userId, action, category, description, metadata, targetId, targetType });
  } catch (err) {
    console.error('[HISTORY] Failed to log:', err.message);
  }
}

/**
 * @route   GET /api/posts
 * @desc    Get all posts (most recent first), with optional pagination
 * @access  Public (DEV MODE — no auth required for reading)
 */
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      Post.find()
        .populate('author', 'nameEncrypted avatar')
        .populate({
          path: 'originalPost',
          populate: { path: 'author', select: 'nameEncrypted avatar' }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Post.countDocuments()
    ]);

    console.log(`[POSTS] Fetched ${posts.length} posts (page ${page}, total ${total})`);

    res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + posts.length < total
      }
    });
  } catch (err) {
    console.error('[POSTS] GET / error:', err);
    next(err);
  }
});

/**
 * @route   GET /api/posts/user/:userId
 * @desc    Get all posts by a specific user
 * @access  Public
 */
router.get('/user/:userId', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      Post.find({ author: req.params.userId })
        .populate('author', 'nameEncrypted avatar')
        .populate({
          path: 'originalPost',
          populate: { path: 'author', select: 'nameEncrypted avatar' }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Post.countDocuments({ author: req.params.userId })
    ]);

    res.json({
      posts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit), hasMore: skip + posts.length < total }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/posts
 * @desc    Create a post — DEV MODE: always succeeds, logs to history
 * @access  Private
 */
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { content, category, target, attachment, tags, paper, dataset, event, article, imageUrl } = req.body;

    console.log('[POSTS] Creating post:', { userId: req.user._id, category: category || 'general', contentLength: content?.length });

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Post content is required.' });
    }

    const actionMap = {
      general: 'shared an update',
      paper: 'published a paper',
      dataset: 'shared a dataset',
      question: 'asked a question',
      milestone: 'reached a milestone',
      event: 'shared an event',
      article: 'wrote an article'
    };

    const postCategory = category || 'general';

    const postData = {
      author: req.user._id,
      content,
      category: postCategory,
      action: actionMap[postCategory] || 'shared an update',
      target: target || '',
      attachment,
      imageUrl: imageUrl || '',
      tags: tags || [],
    };

    // Attach category-specific fields
    if (postCategory === 'paper' && paper) postData.paper = paper;
    if (postCategory === 'dataset' && dataset) postData.dataset = dataset;
    if (postCategory === 'event' && event) postData.event = event;
    if (postCategory === 'article' && article) postData.article = article;

    const newPost = new Post(postData);
    const savedPost = await newPost.save();
    await savedPost.populate('author', 'nameEncrypted avatar');
    
    // Log to history
    await logHistory(
      req.user._id, 'post_created', 'post',
      `Created ${postCategory} post: ${content.substring(0, 80)}`,
      { category: postCategory, tags: tags || [] },
      savedPost._id, 'Post'
    );

    console.log('[POSTS] Post created successfully:', savedPost._id);
    res.status(201).json(savedPost);
  } catch (err) {
    console.error('[POSTS] Create error:', err);
    next(err);
  }
});

/**
 * @route   PUT /api/posts/:id
 * @desc    Update a post — DEV MODE: any logged-in user can edit
 * @access  Private
 */
router.put('/:id', authMiddleware, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // DEV MODE: Skip ownership check
    const { content, attachment } = req.body;
    if (content) post.content = content;
    if (attachment) post.attachment = attachment;

    const updatedPost = await post.save();
    await updatedPost.populate('author', 'nameEncrypted avatar');

    await logHistory(req.user._id, 'post_updated', 'post', `Updated post: ${post._id}`, {}, post._id, 'Post');

    res.json(updatedPost);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   DELETE /api/posts/:id
 * @desc    Delete a post — DEV MODE: any logged-in user can delete
 * @access  Private
 */
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // DEV MODE: Skip ownership check
    await post.deleteOne();
    await logHistory(req.user._id, 'post_deleted', 'post', `Deleted post: ${req.params.id}`, {}, post._id, 'Post');

    res.json({ message: 'Post removed' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/posts/:id/share
 * @desc    Share/Repost a post
 * @access  Private
 */
router.post('/:id/share', authMiddleware, async (req, res, next) => {
  try {
    const originalPost = await Post.findById(req.params.id);
    if (!originalPost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const { content } = req.body;

    const repost = new Post({
      author: req.user._id,
      content: content || '',
      category: originalPost.category,
      action: 'shared a post',
      isRepost: true,
      originalPost: originalPost._id,
    });

    const savedRepost = await repost.save();
    
    originalPost.shares += 1;
    await originalPost.save();

    await savedRepost.populate('author', 'nameEncrypted avatar');
    await savedRepost.populate({
      path: 'originalPost',
      populate: { path: 'author', select: 'nameEncrypted avatar' }
    });

    await logHistory(req.user._id, 'post_shared', 'post', `Shared post: ${originalPost._id}`, {}, savedRepost._id, 'Post');
    
    res.status(201).json(savedRepost);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/posts/:id/like
 * @desc    Toggle like on a post
 * @access  Private
 */
router.post('/:id/like', authMiddleware, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const userId = req.user._id;
    const index = post.likedBy.indexOf(userId);

    if (index === -1) {
      post.likedBy.push(userId);
      post.likes += 1;
      await logHistory(userId, 'post_liked', 'post', `Liked post: ${post._id}`, {}, post._id, 'Post');
    } else {
      post.likedBy.splice(index, 1);
      post.likes -= 1;
    }

    await post.save();
    res.json({ likes: post.likes, isLiked: index === -1 });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/posts/:id/comments
 * @desc    Get comments for a post
 * @access  Public
 */
router.get('/:id/comments', async (req, res, next) => {
  try {
    const comments = await Comment.find({ post: req.params.id })
      .populate('author', 'nameEncrypted avatar')
      .sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/posts/:id/comment
 * @desc    Add a comment to a post
 * @access  Private
 */
router.post('/:id/comment', authMiddleware, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required.' });
    }

    const newComment = new Comment({
      post: req.params.id,
      author: req.user._id,
      content
    });

    const savedComment = await newComment.save();
    
    post.comments += 1;
    await post.save();

    await savedComment.populate('author', 'nameEncrypted avatar');

    await logHistory(req.user._id, 'comment_added', 'post', `Commented on post: ${post._id}`, { content: content.substring(0, 50) }, post._id, 'Post');

    res.status(201).json(savedComment);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/posts/comment/:commentId/like
 * @desc    Toggle like on a comment
 * @access  Private
 */
router.post('/comment/:commentId/like', authMiddleware, async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const userId = req.user._id;
    const index = comment.likedBy.indexOf(userId);

    if (index === -1) {
      comment.likedBy.push(userId);
      comment.likes += 1;
    } else {
      comment.likedBy.splice(index, 1);
      comment.likes -= 1;
    }

    await comment.save();
    res.json({ likes: comment.likes, isLiked: index === -1 });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/posts/:id/save
 * @desc    Toggle save on a post
 * @access  Private
 */
router.post('/:id/save', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const postId = req.params.id;
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const index = user.savedPosts.indexOf(postId);
    if (index === -1) {
      user.savedPosts.push(postId);
      await logHistory(user._id, 'post_saved', 'post', `Saved post: ${postId}`, {}, post._id, 'Post');
    } else {
      user.savedPosts.splice(index, 1);
    }

    await user.save();
    res.json({ isSaved: index === -1, savedPosts: user.savedPosts });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/posts/ai-chat
 * @desc    Engage in a research conversation with the AI assistant.
 * @access  Private
 */
const { chatWithAi, summarizePDF } = require('../services/aiService');
router.post('/ai-chat', authMiddleware, async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    const aiResponse = await chatWithAi(message);
    res.json({ response: aiResponse });
  } catch (err) {
    console.error('[AI CHAT] Route error:', err);
    next(err);
  }
});

router.post('/summarize-pdf', authMiddleware, async (req, res, next) => {
  try {
    const { pdfData } = req.body;
    if (!pdfData) {
      return res.status(400).json({ error: 'PDF data is required.' });
    }
    // Note: aiService.summarizePDF usually expects the base64 or a path.
    // In our case it handles base64 text extraction or similar.
    const summary = await summarizePDF(pdfData);
    res.json({ summary });
  } catch (err) {
    console.error('[SUMMARIZE PDF] Route error:', err);
    next(err);
  }
});

module.exports = router;
