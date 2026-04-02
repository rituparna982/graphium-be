const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { encrypt, decrypt, hmacHash } = require('../utils/encryption');

const BCRYPT_ROUNDS = 14;

const userSchema = new mongoose.Schema({
  // Deterministic hash of email for indexed lookups (never stores plaintext)
  emailHash: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },
  // AES-256-GCM encrypted email (for display/sending)
  emailEncrypted: {
    type: String,
    required: true,
  },
  // AES-256-GCM encrypted display name
  nameEncrypted: {
    type: String,
    required: true,
  },
  // bcrypt hashed password (null for OAuth-only accounts)
  password: {
    type: String,
    default: null,
    select: false, // Never returned by default in queries
  },
  // Auth provider
  provider: {
    type: String,
    enum: ['local', 'google', 'apple', 'orcid'],
    default: 'local',
  },
  // Provider-specific user ID (for OAuth accounts)
  providerId: {
    type: String,
    default: null,
  },
  // User avatar URL
  avatar: {
    type: String,
    default: '',
  },
  // Short biography
  bio: {
    type: String,
    default: '',
  },
  // User skills/interests
  skills: [{
    type: String
  }],
  // Role-based access control
  role: {
    type: String,
    enum: ['researcher', 'pi', 'admin'],
    default: 'researcher',
  },
  // Saved posts (Bookmarks)
  savedPosts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  }],
  // Hashed refresh tokens (supports multiple sessions)
  refreshTokens: [{
    tokenHash: String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date,
    userAgent: String,
  }],
  // Account status
  isActive: {
    type: Boolean,
    default: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  lastLogin: Date,
}, { timestamps: true });

// ─── Virtuals ─────────────────────────────────────────────────────────────────
// Decrypt fields on the fly when accessed

userSchema.virtual('email').get(function () {
  try {
    return decrypt(this.emailEncrypted);
  } catch {
    return null;
  }
});

userSchema.virtual('name').get(function () {
  try {
    return decrypt(this.nameEncrypted);
  } catch {
    return null;
  }
});

// Include virtuals in JSON and Object output
userSchema.set('toJSON', {
  virtuals: true,
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.emailHash;
    delete ret.emailEncrypted;
    delete ret.nameEncrypted;
    delete ret.refreshTokens;
    delete ret.__v;
    return ret;
  }
});
userSchema.set('toObject', { virtuals: true });

// ─── Static Methods ──────────────────────────────────────────────────────────

/**
 * Find user by email using HMAC hash lookup.
 */
userSchema.statics.findByEmail = async function (email) {
  const hash = hmacHash(email);
  return this.findOne({ emailHash: hash });
};

/**
 * Create a new user with encrypted fields.
 */
userSchema.statics.createUser = async function ({ email, name, password, provider = 'local', providerId = null, avatar = '' }) {
  const emailHash = hmacHash(email);
  const emailEncrypted = encrypt(email);
  const nameEncrypted = encrypt(name);

  let hashedPassword = null;
  if (password) {
    hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  return this.create({
    emailHash,
    emailEncrypted,
    nameEncrypted,
    password: hashedPassword,
    provider,
    providerId,
    avatar,
  });
};

// ─── Instance Methods ────────────────────────────────────────────────────────

/**
 * Compare a candidate password against the stored bcrypt hash.
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Store a hashed refresh token.
 */
userSchema.methods.addRefreshToken = async function (token, userAgent = 'unknown') {
  const tokenHash = await bcrypt.hash(token, 10);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Limit stored sessions to 5
  if (this.refreshTokens.length >= 5) {
    this.refreshTokens.shift();
  }

  this.refreshTokens.push({ tokenHash, expiresAt, userAgent });
  return this.save();
};

/**
 * Verify and consume a refresh token (rotation).
 */
userSchema.methods.verifyRefreshToken = async function (token) {
  // First, clean up expired tokens from the instance
  const now = new Date();
  this.refreshTokens = this.refreshTokens.filter(t => t.expiresAt > now);

  let matchIndex = -1;
  for (let i = 0; i < this.refreshTokens.length; i++) {
    const isMatch = await bcrypt.compare(token, this.refreshTokens[i].tokenHash);
    if (isMatch) {
      matchIndex = i;
      break;
    }
  }

  if (matchIndex === -1) {
    return false;
  }

  // Remove the token after one-time use (Rotation)
  this.refreshTokens.splice(matchIndex, 1);
  
  // Save the changes back to the DB immediately
  // Note: addRefreshToken in the route will further modify and save this instance
  await this.save();
  return true;
};

/**
 * Revoke all refresh tokens (logout from all devices).
 */
userSchema.methods.revokeAllTokens = async function () {
  this.refreshTokens = [];
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
