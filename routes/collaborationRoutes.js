const express = require('express');
const Collaboration = require('../models/Collaboration');
const History = require('../models/History');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// ─── Helper: Log to history ───────────────────────────────────────────────────
async function logHistory(userId, action, description, metadata = {}, targetId = null) {
  try {
    await History.create({ userId, action, category: 'collaboration', description, metadata, targetId, targetType: 'Collaboration' });
  } catch (err) {
    console.error('[HISTORY] Failed to log:', err.message);
  }
}

// GET /api/collaborations — get ALL collaborations (DEV MODE: see everything)
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const collabs = await Collaboration.find()
      .populate('requester', 'nameEncrypted avatar')
      .populate('recipient', 'nameEncrypted avatar')
      .sort({ createdAt: -1 });
    console.log(`[COLLAB] Fetched ${collabs.length} collaborations`);
    res.json(collabs);
  } catch (err) { next(err); }
});

// POST /api/collaborations — send a collaboration request (always succeeds)
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { recipientId, message, topic } = req.body;
    if (!recipientId) return res.status(400).json({ error: 'Recipient required.' });

    console.log('[COLLAB] Creating request from', req.user._id, 'to', recipientId);

    // DEV MODE: Skip self-check and duplicate check
    const collab = await Collaboration.create({
      requester: req.user._id,
      recipient: recipientId,
      message: message || '',
      topic: topic || '',
      status: 'pending', 
    });
    await collab.populate('requester', 'nameEncrypted avatar');
    await collab.populate('recipient', 'nameEncrypted avatar');

    await logHistory(req.user._id, 'collab_requested', `Sent collaboration request`, { recipientId, topic }, collab._id);

    // Update collaborator counts for both users
    const Profile = require('../models/Profile');
    await Profile.findOneAndUpdate({ userId: req.user._id }, { $inc: { collaboratorCount: 1 } });
    await Profile.findOneAndUpdate({ userId: recipientId }, { $inc: { collaboratorCount: 1 } });

    console.log('[COLLAB] Request created and counts updated:', collab._id);
    res.status(201).json(collab);
  } catch (err) {
    console.error('[COLLAB] POST / error:', err);
    next(err);
  }
});

// PATCH /api/collaborations/:id — accept or decline
router.patch('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Status must be accepted or declined.' });
    }
    const collab = await Collaboration.findById(req.params.id);
    if (!collab) return res.status(404).json({ error: 'Collaboration not found.' });
    
    // Recipient check
    if (collab.recipient.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      console.error(`[SECURITY] Unauthorized collab status update attempt: User ${req.user._id} on Collab ${collab._id}`);
      return res.status(403).json({ error: 'Only the recipient can accept or decline this request.' });
    }

    collab.status = status;
    await collab.save();
    await collab.populate('requester', 'nameEncrypted avatar');
    await collab.populate('recipient', 'nameEncrypted avatar');

    await logHistory(req.user._id, `collab_${status}`, `Collaboration ${status}`, {}, collab._id);

    res.json(collab);
  } catch (err) { next(err); }
});

// DELETE /api/collaborations/:id — requester or recipient only
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const collab = await Collaboration.findById(req.params.id);
    if (!collab) return res.status(404).json({ error: 'Not found.' });
    
    // Ownership check (Requester or Recipient)
    if (collab.requester.toString() !== req.user._id.toString() && 
        collab.recipient.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      console.error(`[SECURITY] Unauthorized collab delete attempt: User ${req.user._id} on Collab ${collab._id}`);
      return res.status(403).json({ error: 'You are not authorized to remove this collaboration.' });
    }

    // Update collaborator counts for both users
    const Profile = require('../models/Profile');
    await Profile.findOneAndUpdate({ userId: collab.requester }, { $inc: { collaboratorCount: -1 } });
    await Profile.findOneAndUpdate({ userId: collab.recipient }, { $inc: { collaboratorCount: -1 } });

    await collab.deleteOne();
    await logHistory(req.user._id, 'collab_removed', 'Removed collaboration', {}, collab._id);

    res.json({ message: 'Removed.' });
  } catch (err) { next(err); }
});

module.exports = router;
