const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

const router = express.Router();

/**
 * @route   POST /api/upload
 * @desc    Upload an image
 * @access  Private
 */
router.post('/', authMiddleware, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Return the URL to the uploaded file
    // In production, this would be a full URL (e.g., https://api.graphium.com/uploads/...)
    // For local dev, a relative path which the frontend can prefix with API_URL
    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.json({ 
      message: 'File uploaded successfully',
      url: fileUrl,
      filename: req.file.filename
    });
  } catch (err) {
    console.error('[UPLOAD] Error:', err.message);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

module.exports = router;
