const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Profile = require('../models/Profile');
const History = require('../models/History');
const { authMiddleware } = require('../middleware/authMiddleware');
const { encrypt, hmacHash } = require('../utils/encryption');

const router = express.Router();

const BCRYPT_ROUNDS = 14;

// ─── Helper: Log to history ───────────────────────────────────────────────────
async function logHistory(userId, action, description, metadata = {}) {
  try {
    await History.create({ userId, action, category: 'profile', description, metadata });
  } catch (err) {
    console.error('[HISTORY] Failed to log:', err.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/settings
// Returns aggregated settings for the current user (account + preferences).
// This is the single endpoint the Settings page calls on load.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;
    let profile = await Profile.findOne({ userId: user._id });

    // Auto-create profile if missing (defensive — should already exist)
    if (!profile) {
      profile = await Profile.create({
        userId: user._id,
        name: user.name || 'Researcher',
        title: 'Researcher',
      });
    }

    res.json({
      account: {
        email: user.email,               // decrypted via virtual
        userId: user._id,
        accountType: user.role,           // 'researcher' | 'pi' | 'admin'
        memberSince: user.createdAt,
        isVerified: user.isVerified,
      },
      activity: {
        lastLogin: user.lastLogin,
      },
      preferences: {
        visibility: profile.settings?.visibility || 'public',
        notifications: profile.settings?.notifications !== undefined ? profile.settings.notifications : true,
        theme: profile.settings?.theme || 'system',
        language: profile.settings?.language || 'en',
      },
    });
  } catch (err) {
    console.error('[SETTINGS] GET / error:', err);
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/settings/email
// Update the current user's email address.
// Requires: { email, password } — password is verified before allowing change.
// Re-encrypts email and re-hashes for indexed lookup.
// ──────────────────────────────────────────────────────────────────────────────
router.put('/email', authMiddleware, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    // Fetch user with password field included
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Verify password before allowing email change
    if (user.password) {
      if (!password) {
        return res.status(400).json({ error: 'Current password is required to change email.' });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(403).json({ error: 'Incorrect password.' });
      }
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Check if the new email is already taken by another user
    const existingUser = await User.findByEmail(trimmedEmail);
    if (existingUser && existingUser._id.toString() !== user._id.toString()) {
      return res.status(409).json({ error: 'This email is already in use.' });
    }

    // Re-encrypt and re-hash
    user.emailEncrypted = encrypt(trimmedEmail);
    user.emailHash = hmacHash(trimmedEmail);
    await user.save();

    // Also update profile name display if needed
    await logHistory(user._id, 'email_updated', 'Email address updated', { newEmail: trimmedEmail });

    console.log('[SETTINGS] Email updated for user:', user._id);
    res.json({ message: 'Email updated successfully.', email: trimmedEmail });
  } catch (err) {
    console.error('[SETTINGS] PUT /email error:', err);
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/settings/password
// Change the current user's password.
// Requires: { currentPassword, newPassword }
// Verifies old password before setting the new one.
// ──────────────────────────────────────────────────────────────────────────────
router.put('/password', authMiddleware, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    // Fetch user with password field included
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // If user has an existing password, verify it first
    if (user.password) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required.' });
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(403).json({ error: 'Current password is incorrect.' });
      }
    }

    // Prevent setting the same password
    if (user.password && currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from current password.' });
    }

    // Hash and save new password
    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.save();

    await logHistory(user._id, 'password_changed', 'Password changed successfully');

    console.log('[SETTINGS] Password changed for user:', user._id);
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('[SETTINGS] PUT /password error:', err);
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/settings/preferences
// Update personal preferences: visibility, notifications, theme, language.
// Only updates fields that are provided — partial updates are safe.
// ──────────────────────────────────────────────────────────────────────────────
router.put('/preferences', authMiddleware, async (req, res, next) => {
  try {
    const { visibility, notifications, theme, language } = req.body;

    // Validate enum values if provided
    if (visibility !== undefined && !['public', 'private', 'connections'].includes(visibility)) {
      return res.status(400).json({ error: 'Visibility must be one of: public, private, connections.' });
    }
    if (theme !== undefined && !['light', 'dark', 'system'].includes(theme)) {
      return res.status(400).json({ error: 'Theme must be one of: light, dark, system.' });
    }
    if (notifications !== undefined && typeof notifications !== 'boolean') {
      return res.status(400).json({ error: 'Notifications must be a boolean.' });
    }
    if (language !== undefined && (typeof language !== 'string' || language.trim().length === 0)) {
      return res.status(400).json({ error: 'Language must be a non-empty string.' });
    }

    let profile = await Profile.findOne({ userId: req.user._id });

    // Auto-create profile if missing
    if (!profile) {
      profile = await Profile.create({
        userId: req.user._id,
        name: req.user.name || 'Researcher',
        title: 'Researcher',
      });
    }

    // Build the update — only set fields that were provided
    const settingsUpdate = {};
    if (visibility !== undefined) settingsUpdate['settings.visibility'] = visibility;
    if (notifications !== undefined) settingsUpdate['settings.notifications'] = notifications;
    if (theme !== undefined) settingsUpdate['settings.theme'] = theme;
    if (language !== undefined) settingsUpdate['settings.language'] = language;

    if (Object.keys(settingsUpdate).length === 0) {
      return res.status(400).json({ error: 'No preference fields provided.' });
    }

    profile = await Profile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: settingsUpdate },
      { new: true }
    );

    const changedFields = Object.keys(req.body).filter(k => ['visibility', 'notifications', 'theme', 'language'].includes(k));
    await logHistory(req.user._id, 'preferences_updated', `Updated preferences: ${changedFields.join(', ')}`, req.body);

    console.log('[SETTINGS] Preferences updated for user:', req.user._id);
    res.json({
      message: 'Preferences updated successfully.',
      preferences: {
        visibility: profile.settings?.visibility || 'public',
        notifications: profile.settings?.notifications !== undefined ? profile.settings.notifications : true,
        theme: profile.settings?.theme || 'system',
        language: profile.settings?.language || 'en',
      },
    });
  } catch (err) {
    console.error('[SETTINGS] PUT /preferences error:', err);
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/settings/account-type
// Returns the current user's account type (role). Users cannot self-change role.
// This is a read-only endpoint for the Settings page display.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/account-type', authMiddleware, async (req, res) => {
  res.json({
    accountType: req.user.role,
    availableTypes: ['researcher', 'pi', 'admin'],
    message: 'Account type can only be changed by an administrator.',
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/settings/account
// Soft-deactivate the current user's account.
// Sets isActive = false. Does NOT delete data (preserves referential integrity).
// Requires password confirmation for safety.
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/account', authMiddleware, async (req, res, next) => {
  try {
    const { password } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Verify password before deactivation
    if (user.password) {
      if (!password) {
        return res.status(400).json({ error: 'Password is required to deactivate account.' });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(403).json({ error: 'Incorrect password.' });
      }
    }

    // Soft deactivate — do NOT delete data
    user.isActive = false;
    user.refreshTokens = []; // Revoke all sessions
    await user.save();

    await logHistory(user._id, 'account_deactivated', 'User deactivated their account');

    console.log('[SETTINGS] Account deactivated for user:', user._id);
    res.json({ message: 'Account deactivated successfully. Your data is preserved and you can contact support to reactivate.' });
  } catch (err) {
    console.error('[SETTINGS] DELETE /account error:', err);
    next(err);
  }
});

module.exports = router;
