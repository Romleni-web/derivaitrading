const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Session = require('../models/Session');
const { encrypt, decrypt } = require('../config/crypto');
const auth = require('../middleware/auth');
const passport = require('../config/passport');

const router = express.Router();

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().isLength({ min: 2, max: 50 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { email, password, name } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = await User.create({ email, password, name });
    const token = generateToken(user._id);

    // Create session
    await Session.create({
      user: user._id,
      token,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        subscription: user.subscription,
        riskSettings: user.riskSettings,
        stats: user.stats
      }
    });
  } catch (err) {
    next(err);
  }
});

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account deactivated' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    await Session.create({
      user: user._id,
      token,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        subscription: user.subscription,
        riskSettings: user.riskSettings,
        stats: user.stats
      }
    });
  } catch (err) {
    next(err);
  }
});

// Get current user
router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      subscription: user.subscription,
      riskSettings: user.riskSettings,
      stats: user.stats,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt
    });
  } catch (err) {
    next(err);
  }
});

// Update Deriv token (encrypted)
router.put('/deriv-token', auth, [
  body('token').isLength({ min: 10 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const encrypted = encrypt(req.body.token);
    await User.findByIdAndUpdate(req.user._id, { derivTokenEncrypted: encrypted });

    res.json({ message: 'Deriv token saved securely' });
  } catch (err) {
    next(err);
  }
});

// Logout
router.post('/logout', auth, async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    await Session.findOneAndUpdate({ token }, { isValid: false });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// Logout all sessions
router.post('/logout-all', auth, async (req, res, next) => {
  try {
    await Session.updateMany({ user: req.user._id }, { isValid: false });
    res.json({ message: 'All sessions logged out' });
  } catch (err) {
    next(err);
  }
});


// Change password
router.put('/change-password', auth, [
  body('currentPassword').exists(),
  body('newPassword').isLength({ min: 8 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    // Invalidate all sessions except current
    const currentToken = req.header('Authorization')?.replace('Bearer ', '');
    await Session.updateMany(
      { user: req.user._id, token: { $ne: currentToken } },
      { isValid: false }
    );

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});


// Google OAuth - Initiate
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  prompt: 'select_account'
}));

// Google OAuth - Callback
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=google_auth_failed' }),
  async (req, res) => {
    try {
      const token = generateToken(req.user._id);

      await Session.create({
        user: req.user._id,
        token,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      // Redirect to frontend with token
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}?token=${token}&oauth=success`;
      res.redirect(redirectUrl);
    } catch (err) {
      console.error('Google callback error:', err);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=server_error`);
    }
  }
);

module.exports = router;
