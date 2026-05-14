const express = require('express');
const User = require('../models/User');
const Trade = require('../models/Trade');
const AILog = require('../models/AILog');
const Session = require('../models/Session');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const router = express.Router();

router.use(auth, admin);

// Get all users
router.get('/users', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password -derivTokenEncrypted')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
});

// Get user details
router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password -derivTokenEncrypted');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const trades = await Trade.find({ user: user._id }).sort({ createdAt: -1 }).limit(20);
    const sessions = await Session.find({ user: user._id }).sort({ lastActive: -1 }).limit(10);

    res.json({ user, trades, sessions });
  } catch (err) {
    next(err);
  }
});

// Update user subscription
router.put('/users/:id/subscription', async (req, res, next) => {
  try {
    const { plan, tradeLimit, expiresAt } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          'subscription.plan': plan,
          'subscription.tradeLimit': tradeLimit,
          'subscription.expiresAt': expiresAt ? new Date(expiresAt) : undefined
        }
      },
      { new: true }
    );
    res.json({ subscription: user.subscription });
  } catch (err) {
    next(err);
  }
});

// Deactivate/activate user
router.put('/users/:id/status', async (req, res, next) => {
  try {
    const { isActive } = req.body;
    await User.findByIdAndUpdate(req.params.id, { isActive });
    await Session.updateMany({ user: req.params.id }, { isValid: isActive });
    res.json({ message: `User ${isActive ? 'activated' : 'deactivated'}` });
  } catch (err) {
    next(err);
  }
});

// Platform statistics
router.get('/stats', async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const totalTrades = await Trade.countDocuments();
    const todayTrades = await Trade.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    const revenue = await Trade.aggregate([
      { $match: { status: { $in: ['won', 'lost'] } } },
      { $group: { _id: null, total: { $sum: '$profit' } } }
    ]);

    const topTraders = await Trade.aggregate([
      { $match: { status: { $in: ['won', 'lost'] } } },
      {
        $group: {
          _id: '$user',
          profit: { $sum: '$profit' },
          trades: { $sum: 1 }
        }
      },
      { $sort: { profit: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $project: { 'user.password': 0, 'user.derivTokenEncrypted': 0 } }
    ]);

    res.json({
      users: { total: totalUsers, active: activeUsers },
      trades: { total: totalTrades, today: todayTrades },
      revenue: revenue[0]?.total || 0,
      topTraders
    });
  } catch (err) {
    next(err);
  }
});

// AI performance metrics
router.get('/ai-performance', async (req, res, next) => {
  try {
    const performance = await AILog.aggregate([
      { $match: { wasCorrect: { $ne: null } } },
      {
        $group: {
          _id: '$analyzerType',
          total: { $sum: 1 },
          correct: { $sum: { $cond: ['$wasCorrect', 1, 0] } },
          avgConfidence: { $avg: '$analysisResult.confidence' },
          avgProbability: { $avg: '$analysisResult.probability' }
        }
      }
    ]);

    const bySymbol = await AILog.aggregate([
      { $match: { wasCorrect: { $ne: null } } },
      {
        $group: {
          _id: '$symbol',
          total: { $sum: 1 },
          correct: { $sum: { $cond: ['$wasCorrect', 1, 0] } }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 20 }
    ]);

    res.json({ byAnalyzer: performance, bySymbol });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
