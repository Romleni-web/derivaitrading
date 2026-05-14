const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Update risk settings
router.put('/risk-settings', auth, [
  body('maxTradeAmount').optional().isFloat({ min: 0.35, max: 10000 }),
  body('dailyLossLimit').optional().isFloat({ min: 0 }),
  body('maxOpenTrades').optional().isInt({ min: 1, max: 50 }),
  body('stopLossPercent').optional().isFloat({ min: 0.1, max: 100 }),
  body('takeProfitPercent').optional().isFloat({ min: 0.1, max: 1000 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const updates = {};
    const allowed = ['maxTradeAmount', 'dailyLossLimit', 'maxOpenTrades', 'stopLossPercent', 'takeProfitPercent'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) updates[`riskSettings.${field}`] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    );

    res.json({ riskSettings: user.riskSettings });
  } catch (err) {
    next(err);
  }
});

// Update profile
router.put('/profile', auth, [
  body('name').optional().trim().isLength({ min: 2, max: 50 })
], async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { name: req.body.name } },
      { new: true }
    );
    res.json({ name: user.name, email: user.email });
  } catch (err) {
    next(err);
  }
});

// Get performance dashboard data
router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const Trade = require('../models/Trade');
    const AILog = require('../models/AILog');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTrades = await Trade.find({
      user: user._id,
      createdAt: { $gte: today }
    });

    const openTrades = await Trade.countDocuments({
      user: user._id,
      status: { $in: ['pending', 'open'] }
    });

    const aiAccuracy = await AILog.aggregate([
      { $match: { user: user._id, wasCorrect: { $ne: null } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          correct: { $sum: { $cond: ['$wasCorrect', 1, 0] } }
        }
      }
    ]);

    res.json({
      user: {
        name: user.name,
        email: user.email,
        subscription: user.subscription,
        riskSettings: user.riskSettings,
        stats: user.stats
      },
      today: {
        trades: todayTrades.length,
        profit: todayTrades.reduce((s, t) => s + (t.profit || 0), 0)
      },
      openTrades,
      aiAccuracy: aiAccuracy[0] ? {
        total: aiAccuracy[0].total,
        correct: aiAccuracy[0].correct,
        percentage: (aiAccuracy[0].correct / aiAccuracy[0].total * 100).toFixed(2)
      } : { total: 0, correct: 0, percentage: 0 }
    });
  } catch (err) {
    next(err);
  }
});


// Update profile
router.put('/profile', auth, [
  body('name').optional().trim().isLength({ min: 2, max: 50 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { name: req.body.name } },
      { new: true }
    );
    res.json({ name: user.name, email: user.email });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
