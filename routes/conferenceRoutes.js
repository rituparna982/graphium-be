const express = require('express');
const ConferencePaper = require('../models/ConferencePaper');
const History = require('../models/History');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// ─── Helper: Log to history ───────────────────────────────────────────────────
async function logHistory(userId, action, description, metadata = {}, targetId = null) {
  try {
    await History.create({ userId, action, category: 'conference', description, metadata, targetId, targetType: 'ConferencePaper' });
  } catch (err) {
    console.error('[HISTORY] Failed to log:', err.message);
  }
}

// GET /api/conference-papers — get ALL papers (DEV MODE: show everything)
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const papers = await ConferencePaper.find()
      .populate('author', 'nameEncrypted avatar')
      .sort({ createdAt: -1 });
    console.log(`[CONFERENCE] Fetched ${papers.length} papers`);
    res.json(papers);
  } catch (err) {
    console.error('[CONFERENCE] GET / error:', err);
    next(err);
  }
});

// POST /api/conference-papers — submit a new paper (always succeeds)
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { title, abstract, conference, fileUrl } = req.body;
    if (!title || !conference) return res.status(400).json({ error: 'Title and conference are required.' });

    console.log('[CONFERENCE] Submitting paper:', title);

    const paper = await ConferencePaper.create({
      author: req.user._id,
      title, abstract, conference,
      fileUrl: fileUrl || '',
      status: 'submitted',
      submittedAt: new Date(),
    });

    await logHistory(req.user._id, 'paper_submitted', `Submitted paper: ${title}`, { conference }, paper._id);

    console.log('[CONFERENCE] Paper submitted:', paper._id);
    res.status(201).json(paper);
  } catch (err) {
    console.error('[CONFERENCE] POST / error:', err);
    next(err);
  }
});

// PATCH /api/conference-papers/:id/revise — submit a revision (DEV: any user)
router.patch('/:id/revise', authMiddleware, async (req, res, next) => {
  try {
    const paper = await ConferencePaper.findById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found.' });
    
    // DEV MODE: Skip author check
    const { note } = req.body;
    paper.revisionHistory.push({ note: note || '', submittedAt: new Date() });
    paper.status = 'resubmitted';
    await paper.save();

    await logHistory(req.user._id, 'paper_revised', `Revised paper: ${paper.title}`, { note }, paper._id);

    res.json(paper);
  } catch (err) { next(err); }
});

// PATCH /api/conference-papers/:id/status — update status (DEV: any user can)
router.patch('/:id/status', authMiddleware, async (req, res, next) => {
  try {
    const paper = await ConferencePaper.findById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found.' });
    const { status, reviewerNotes } = req.body;
    if (status) paper.status = status;
    if (reviewerNotes) paper.reviewerNotes = reviewerNotes;
    await paper.save();

    await logHistory(req.user._id, 'paper_status_updated', `Paper status: ${status}`, { status }, paper._id);

    res.json(paper);
  } catch (err) { next(err); }
});

// DELETE /api/conference-papers/:id (DEV: any user can delete)
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const paper = await ConferencePaper.findById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Not found.' });
    
    // DEV MODE: Skip author check
    await paper.deleteOne();

    await logHistory(req.user._id, 'paper_deleted', `Deleted paper: ${paper.title}`, {}, paper._id);

    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
