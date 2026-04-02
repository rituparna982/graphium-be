const express = require('express');
const Lab = require('../models/Lab');
const History = require('../models/History');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// ─── Helper: Log to history ───────────────────────────────────────────────────
async function logHistory(userId, action, category, description, metadata = {}, targetId = null) {
  try {
    await History.create({ userId, action, category, description, metadata, targetId, targetType: 'Lab' });
  } catch (err) {
    console.error('[HISTORY] Failed to log:', err.message);
  }
}

// GET /api/labs — list ALL labs (DEV MODE: no filter by isPublic)
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const labs = await Lab.find()
      .populate('host', 'nameEncrypted avatar')
      .populate('members', 'nameEncrypted avatar')
      .sort({ createdAt: -1 });
    console.log(`[LABS] Fetched ${labs.length} labs`);
    res.json(labs);
  } catch (err) {
    console.error('[LABS] GET / error:', err);
    next(err);
  }
});

// POST /api/labs — create a new lab (always succeeds)
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { name, description, researchFocus, tags, isPublic } = req.body;
    if (!name) return res.status(400).json({ error: 'Lab name is required.' });

    console.log('[LABS] Creating lab:', name);

    const lab = await Lab.create({
      name, description, researchFocus,
      tags: tags || [],
      isPublic: true, // DEV MODE: always public
      host: req.user._id,
      members: [req.user._id],
    });
    await lab.populate('host', 'nameEncrypted avatar');
    await lab.populate('members', 'nameEncrypted avatar');

    await logHistory(req.user._id, 'lab_created', 'lab', `Created lab: ${name}`, { labName: name }, lab._id);

    console.log('[LABS] Lab created:', lab._id);
    res.status(201).json(lab);
  } catch (err) {
    console.error('[LABS] POST / error:', err);
    next(err);
  }
});

// POST /api/labs/:id/join — join a lab (always succeeds)
router.post('/:id/join', authMiddleware, async (req, res, next) => {
  try {
    const lab = await Lab.findById(req.params.id);
    if (!lab) return res.status(404).json({ error: 'Lab not found.' });

    const userId = req.user._id.toString();
    if (lab.members.map(m => m.toString()).includes(userId)) {
      return res.status(400).json({ error: 'Already a member.' });
    }
    lab.members.push(req.user._id);
    lab.joinRequests = lab.joinRequests.filter(r => r.toString() !== userId);
    await lab.save();
    await lab.populate('host', 'nameEncrypted avatar');
    await lab.populate('members', 'nameEncrypted avatar');

    await logHistory(req.user._id, 'lab_joined', 'lab', `Joined lab: ${lab.name}`, {}, lab._id);

    console.log('[LABS] User joined lab:', lab.name);
    res.json(lab);
  } catch (err) {
    console.error('[LABS] JOIN error:', err);
    next(err);
  }
});

// POST /api/labs/:id/leave — leave a lab
router.post('/:id/leave', authMiddleware, async (req, res, next) => {
  try {
    const lab = await Lab.findById(req.params.id);
    if (!lab) return res.status(404).json({ error: 'Lab not found.' });

    // DEV MODE: Allow host to leave too
    lab.members = lab.members.filter(m => m.toString() !== req.user._id.toString());
    await lab.save();

    await logHistory(req.user._id, 'lab_left', 'lab', `Left lab: ${lab.name}`, {}, lab._id);

    res.json({ message: 'Left lab successfully.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/labs/:id/announce — any member can post announcements (DEV MODE)
router.post('/:id/announce', authMiddleware, async (req, res, next) => {
  try {
    const lab = await Lab.findById(req.params.id);
    if (!lab) return res.status(404).json({ error: 'Lab not found.' });
    
    // DEV MODE: Skip host-only check
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required.' });
    lab.announcements.push({ content, author: req.user._id });
    await lab.save();

    await logHistory(req.user._id, 'lab_announcement', 'lab', `Posted announcement in lab: ${lab.name}`, { content: content.substring(0, 50) }, lab._id);

    console.log('[LABS] Announcement posted in:', lab.name);
    res.json(lab);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/labs/:id — any user can delete (DEV MODE)
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const lab = await Lab.findById(req.params.id);
    if (!lab) return res.status(404).json({ error: 'Lab not found.' });
    
    // DEV MODE: Skip host check
    await lab.deleteOne();

    await logHistory(req.user._id, 'lab_deleted', 'lab', `Deleted lab: ${lab.name}`, {}, lab._id);

    res.json({ message: 'Lab deleted.' });
  } catch (err) { next(err); }
});

// POST /api/labs/:id/lab-posts — post content in classroom-style stream
router.post('/:id/lab-posts', authMiddleware, async (req, res, next) => {
  try {
    const lab = await Lab.findById(req.params.id);
    if (!lab) return res.status(404).json({ error: 'Lab not found.' });
    
    const { title, content } = req.body;
    const Post = require('../models/Post');
    
    // Create a new post specifically for the lab
    const post = await Post.create({
      title,
      content,
      author: req.user._id,
      category: 'research',
      tags: ['lab_hosted', lab.name]
    });
    
    lab.posts.push(post._id);
    await lab.save();
    
    res.status(201).json(post);
  } catch (err) { next(err); }
});

// POST /api/labs/:id/files — Share files in lab
router.post('/:id/files', authMiddleware, async (req, res, next) => {
  try {
    const lab = await Lab.findById(req.params.id);
    if (!lab) return res.status(404).json({ error: 'Lab not found.' });
    
    const { name, url, type, size } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Name and URL required.' });
    
    const newFile = {
      name,
      url,
      type: type || 'application/octet-stream',
      size: size || 0,
      uploadedBy: req.user._id
    };
    
    lab.files.push(newFile);
    await lab.save();
    
    res.status(201).json(newFile);
  } catch (err) { next(err); }
});

module.exports = router;
