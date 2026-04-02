const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = () => process.env.JWT_SECRET;

// ──────────────────────────────────────────────────────────────────────────────
// DEV MODE: Authentication is relaxed for development.
// - If a valid token is provided, the real user is attached.
// - If no token / invalid token, a default dev user is auto-created & attached.
// ──────────────────────────────────────────────────────────────────────────────

const DEV_MODE = true; // TEMPORARY — set to false before production

/**
 * Authentication middleware (DEV MODE).
 * In dev mode, if no token is provided a default dev user is used.
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Try normal JWT flow first
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET());
        const user = await User.findById(decoded.userId);
        if (user && user.isActive) {
          req.user = user;
          console.log(`[AUTH] Authenticated user: ${user.name || user._id}`);
          return next();
        }
      } catch (tokenErr) {
        console.log('[AUTH] Token verification failed:', tokenErr.message);
        // Fall through to dev mode
      }
    }

    // ── DEV MODE: auto-create / find a default dev user ──
    if (DEV_MODE) {
      console.log('[AUTH][DEV] No valid token — using dev bypass');
      const { encrypt, hmacHash } = require('../utils/encryption');
      const devEmail = 'dev@graphium.app';
      let user = await User.findByEmail(devEmail);
      if (!user) {
        user = await User.createUser({
          email: devEmail,
          name: 'Dev User',
          password: 'DevMode!123',
        });
        // Create a profile for the dev user
        const Profile = require('../models/Profile');
        await Profile.create({
          userId: user._id,
          name: 'Dev User',
          title: 'Development Mode Researcher',
        });
        console.log('[AUTH][DEV] Created dev user:', user._id);
      }
      req.user = user;
      return next();
    }

    return res.status(401).json({ error: 'Access denied. No token provided.' });
  } catch (err) {
    console.error('[AUTH] Error:', err);
    if (DEV_MODE) {
      // Even on error, try to continue in dev mode
      return next();
    }
    return res.status(500).json({ error: 'Authentication error.' });
  }
};

/**
 * Optional auth middleware.
 * Attaches user if token is present, but doesn't block if absent.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET());
        const user = await User.findById(decoded.userId);
        if (user && user.isActive) {
          req.user = user;
        }
      } catch {
        // Silently continue
      }
    }
  } catch {
    // Silently continue without user
  }
  next();
};

/**
 * Role-based authorization middleware.
 * DEV MODE: Always passes.
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (DEV_MODE) {
      console.log('[AUTH][DEV] Bypassing role check for roles:', roles);
      return next();
    }
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
};

module.exports = { authMiddleware, optionalAuth, authorize };
