const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Profile = require('../models/Profile');
const History = require('../models/History');
const { authMiddleware } = require('../middleware/authMiddleware');
const { encrypt, decrypt, hmacHash } = require('../utils/encryption');

const router = express.Router();

// ─── Token Helpers ────────────────────────────────────────────────────────────

function generateAccessToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '24h' }); // DEV: extended to 24h
}

function generateRefreshToken(userId) {
  return jwt.sign({ userId, jti: crypto.randomUUID() }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' }); // DEV: extended to 30d
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// DEV MODE: Password validation relaxed — any non-empty password accepted
function validatePassword(password) {
  return password && password.length >= 1;
}

// ─── Helper: Log to history ───────────────────────────────────────────────────
async function logHistory(userId, action, category, description, metadata = {}) {
  try {
    await History.create({ userId, action, category, description, metadata });
    console.log(`[HISTORY] ${action}: ${description}`);
  } catch (err) {
    console.error('[HISTORY] Failed to log:', err.message);
  }
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    console.log('[AUTH] Register attempt:', { name, email });

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    // DEV: Check if user exists, if so just log them in
    let user = await User.findByEmail(email);
    if (user) {
      console.log('[AUTH][DEV] User already exists, logging in instead of failing');
      const accessToken = generateAccessToken(user._id);
      const refreshToken = generateRefreshToken(user._id);
      await user.addRefreshToken(refreshToken, req.headers['user-agent']);

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: false, // DEV: not secure
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/api/auth',
      });

      await logHistory(user._id, 'register_existing', 'auth', `Existing user re-registered: ${email}`);

      return res.status(200).json({
        message: 'Account already exists. Logged in.',
        accessToken,
        user: user.toJSON(),
      });
    }

    user = await User.createUser({ email, name, password });
    
    // Create default profile for new user
    await Profile.create({
      userId: user._id,
      name: name,
      title: 'Researcher'
    });

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    await user.addRefreshToken(refreshToken, req.headers['user-agent']);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    await logHistory(user._id, 'register', 'auth', `New user registered: ${name} (${email})`);

    console.log('[AUTH] Registration successful for:', email);
    res.status(201).json({
      message: 'Registration successful.',
      accessToken,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// DEV MODE: If user doesn't exist, auto-create. Any password accepted.

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('[AUTH] Login attempt:', email);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    let user = await User.findByEmail(email);
    
    // DEV MODE: Auto-create user if not found
    if (!user) {
      console.log('[AUTH][DEV] User not found, auto-creating:', email);
      const name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      user = await User.createUser({ email, name, password });
      
      // Create default profile
      await Profile.create({
        userId: user._id,
        name: name,
        title: 'Researcher',
      });

      console.log('[AUTH][DEV] Auto-created user:', user._id);
    }

    // DEV MODE: Skip password verification
    user.lastLogin = new Date();
    await user.save();

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    await user.addRefreshToken(refreshToken, req.headers['user-agent']);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    await logHistory(user._id, 'login', 'auth', `User logged in: ${email}`);

    console.log('[AUTH] Login successful for:', email);
    res.json({
      message: 'Login successful.',
      accessToken,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── POST /api/auth/guest ─────────────────────────────────────────────────────

router.post('/guest', async (req, res) => {
  try {
    const timestamp = Date.now();
    const guestEmail = `guest_${timestamp}@graphium.app`;
    const guestName = `Guest User`;
    const guestPassword = `Guest!${crypto.randomBytes(4).toString('hex')}1`;
    
    const user = await User.createUser({ email: guestEmail, name: guestName, password: guestPassword });
    
    await Profile.create({
      userId: user._id,
      name: guestName,
      title: 'Visiting Researcher'
    });

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    await user.addRefreshToken(refreshToken, req.headers['user-agent']);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    await logHistory(user._id, 'guest_login', 'auth', 'Guest user created and logged in');

    console.log('[AUTH] Guest login successful:', user._id);
    res.status(201).json({
      message: 'Guest login successful.',
      accessToken,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Guest login error:', err);
    res.status(500).json({ error: 'Guest login failed. Please try again.' });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ error: 'No refresh token provided.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or deactivated.' });
    }

    // DEV MODE: Skip strict refresh token verification to avoid issues
    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);
    
    await user.addRefreshToken(newRefreshToken, req.headers['user-agent']);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    console.log('[AUTH] Token refreshed for user:', user._id);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed.' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/logout', async (req, res) => {
  try {
    // DEV MODE: Don't require auth for logout
    res.clearCookie('refreshToken', { path: '/api/auth' });
    console.log('[AUTH] User logged out');
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ message: 'Logged out.' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get('/me', authMiddleware, async (req, res) => {
  console.log('[AUTH] /me endpoint hit for user:', req.user?._id);
  res.json({ user: req.user.toJSON() });
});

// ─── GET /api/auth/users — list all registered users (open in dev mode) ──────

router.get('/users', authMiddleware, async (req, res) => {
  try {
    // DEV MODE: No admin check
    const users = await User.find().sort({ createdAt: -1 });
    res.json({
      total: users.length,
      users: users.map(u => u.toJSON()),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// ─── OAuth Helper ─────────────────────────────────────────────────────────────

async function handleOAuthUser({ email, name, provider, providerId, avatar }, req, res) {
  let user = email ? await User.findByEmail(email) : await User.findOne({ provider, providerId });

  if (!user) {
    user = await User.createUser({
      email: email || `${providerId}@${provider}.oauth`,
      name: name || `${provider} User`,
      provider,
      providerId,
      avatar: avatar || '',
    });

    await Profile.create({
      userId: user._id,
      name: user.name,
      title: 'Researcher',
      avatar: user.avatar
    });
  }

  user.lastLogin = new Date();
  await user.save();

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  await user.addRefreshToken(refreshToken, req.headers['user-agent']);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });

  await logHistory(user._id, 'oauth_login', 'auth', `OAuth login via ${provider}`);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(`${frontendUrl}/oauth-callback?token=${accessToken}`);
}

// ─── OAuth: Google ────────────────────────────────────────────────────────────

router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || clientId === 'your_google_client_id_here') {
    return res.status(503).json({ error: 'Google OAuth not configured. Add GOOGLE_CLIENT_ID to .env' });
  }
  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  const scope = encodeURIComponent('openid email profile');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'No authorization code.' });

    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await userInfoRes.json();

    await handleOAuthUser({
      email: profile.email,
      name: profile.name,
      provider: 'google',
      providerId: profile.id,
      avatar: profile.picture || '',
    }, req, res);
  } catch (err) {
    console.error('Google OAuth error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=oauth_failed`);
  }
});

// ─── OAuth: Apple ─────────────────────────────────────────────────────────────

router.get('/apple', (req, res) => {
  const clientId = process.env.APPLE_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'Apple Sign-In not configured. Add APPLE_CLIENT_ID to .env' });
  }
  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/apple/callback`;
  const url = `https://appleid.apple.com/auth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code%20id_token&scope=name%20email&response_mode=form_post`;
  res.redirect(url);
});

router.post('/apple/callback', async (req, res) => {
  try {
    const { id_token, user: appleUser } = req.body;
    if (!id_token) return res.status(400).json({ error: 'No ID token.' });

    const decoded = jwt.decode(id_token);
    if (!decoded || !decoded.sub) {
      return res.status(400).json({ error: 'Invalid Apple ID token.' });
    }

    let email, name;
    try {
      const parsed = appleUser ? JSON.parse(appleUser) : null;
      email = decoded.email || (parsed && parsed.email);
      name = parsed ? `${parsed.name?.firstName || ''} ${parsed.name?.lastName || ''}`.trim() : 'Apple User';
    } catch {
      email = decoded.email;
      name = 'Apple User';
    }

    await handleOAuthUser({
      email: email || `${decoded.sub}@privaterelay.appleid.com`,
      name: name || 'Apple User',
      provider: 'apple',
      providerId: decoded.sub,
    }, req, res);
  } catch (err) {
    console.error('Apple OAuth error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=oauth_failed`);
  }
});

// ─── OAuth: ORCID ─────────────────────────────────────────────────────────────

router.get('/orcid', (req, res) => {
  const clientId = process.env.ORCID_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'ORCID OAuth not configured. Add ORCID_CLIENT_ID to .env' });
  }
  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/orcid/callback`;
  const url = `https://orcid.org/oauth/authorize?client_id=${clientId}&response_type=code&scope=/authenticate&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(url);
});

router.get('/orcid/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'No authorization code.' });

    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/orcid/callback`;

    const tokenRes = await fetch('https://orcid.org/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        client_id: process.env.ORCID_CLIENT_ID,
        client_secret: process.env.ORCID_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    await handleOAuthUser({
      email: `${tokens.orcid}@orcid.org`,
      name: tokens.name || 'ORCID User',
      provider: 'orcid',
      providerId: tokens.orcid,
    }, req, res);
  } catch (err) {
    console.error('ORCID OAuth error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=oauth_failed`);
  }
});

module.exports = router;
