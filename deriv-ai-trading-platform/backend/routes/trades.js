const express = require('express');
const { body, validationResult } = require('express-validator');
const Trade = require('../models/Trade');
const User = require('../models/User');
const AILog = require('../models/AILog');
const auth = require('../middleware/auth');
const AIEngine = require('../ai');
const DerivService = require('../services/derivService');
const { decrypt } = require('../config/crypto');

const router = express.Router();

// Validation helpers
const validateTrade = [
  body('contractType').isIn([
    'rise_fall', 'higher_lower', 'over_under', 'matches_differs', 'even_odd',
    'digit_over_under', 'digit_match', 'digit_differs', 'multipliers',
    'accumulators', 'vanilla_call', 'vanilla_put', 'synthetic_10',
    'synthetic_25', 'synthetic_50', 'synthetic_75', 'synthetic_100',
    'boom_1000', 'crash_1000', 'step_index', 'derived_index'
  ]),
  body('symbol').isString().trim().notEmpty(),
  body('amount').isFloat({ min: 0.35, max: parseFloat(process.env.MAX_TRADE_AMOUNT || 1000) }),
  body('duration').optional().isInt({ min: 1 }),
  body('durationUnit').optional().isIn(['t', 's', 'm', 'h', 'd']),
  body('barrier').optional().isString(),
  body('digitPrediction').optional().isInt({ min: 0, max: 9 }),
  body('multiplier').optional().isFloat({ min: 1, max: 500 }),
  body('useAI').optional().isBoolean()
];

// Get AI analysis for a symbol
router.post('/analyze', auth, async (req, res, next) => {
  try {
    const { contractType, symbol, options = {} } = req.body;

    // Feed recent ticks to analyzer
    const tickBuffer = DerivService.getTickBuffer(symbol);
    tickBuffer.forEach(tick => AIEngine.addTick(symbol, tick));

    const analysis = AIEngine.analyze(contractType, symbol, options);

    res.json({
      symbol,
      contractType,
      analysis,
      tickCount: tickBuffer.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

// Execute trade
router.post('/execute', auth, validateTrade, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const user = await User.findById(req.user._id);
    const {
      contractType, symbol, amount, duration, durationUnit,
      barrier, digitPrediction, multiplier, useAI = true
    } = req.body;

    // Risk validation
    if (amount > user.riskSettings.maxTradeAmount) {
      return res.status(400).json({ 
        error: `Trade amount exceeds max limit of ${user.riskSettings.maxTradeAmount}` 
      });
    }

    // Check open trades limit
    const openTrades = await Trade.countDocuments({ user: user._id, status: { $in: ['pending', 'open'] } });
    if (openTrades >= user.riskSettings.maxOpenTrades) {
      return res.status(400).json({ error: `Max open trades (${user.riskSettings.maxOpenTrades}) reached` });
    }

    // Subscription check
    const todayTrades = await Trade.countDocuments({
      user: user._id,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    if (todayTrades >= user.subscription.tradeLimit) {
      return res.status(403).json({ error: 'Daily trade limit reached for your plan' });
    }

    // AI Analysis
    let aiAnalysis = null;
    if (useAI) {
      const tickBuffer = DerivService.getTickBuffer(symbol);
      tickBuffer.forEach(tick => AIEngine.addTick(symbol, tick));
      aiAnalysis = AIEngine.analyze(contractType, symbol, { threshold: digitPrediction });

      // AI approval gate - skip if probability too low
      if (aiAnalysis.decision === 'SKIP' || aiAnalysis.probability < 55) {
        // Log the AI decision
        await AILog.create({
          user: user._id,
          analyzerType: AIEngine.getCategory(contractType),
          symbol,
          analysisResult: aiAnalysis,
          wasCorrect: null,
          actualOutcome: 'skip'
        });

        return res.status(400).json({
          error: 'AI rejected trade',
          aiAnalysis,
          message: `AI confidence too low (${aiAnalysis.probability}%). ${aiAnalysis.reason}`
        });
      }
    }

    // Build Deriv contract parameters
    let derivContractType;
    const contractMap = {
      'rise_fall': 'CALL',
      'higher_lower': 'CALL',
      'over_under': 'DIGITOVER',
      'matches_differs': 'DIGITMATCH',
      'even_odd': 'DIGITEVEN',
      'digit_over_under': 'DIGITOVER',
      'digit_match': 'DIGITMATCH',
      'digit_differs': 'DIGITDIFF',
      'multipliers': 'MULTUP',
      'accumulators': 'ACCU',
      'vanilla_call': 'VANILLALONGCALL',
      'vanilla_put': 'VANILLALONGPUT',
      'synthetic_10': 'CALL',
      'synthetic_25': 'CALL',
      'synthetic_50': 'CALL',
      'synthetic_75': 'CALL',
      'synthetic_100': 'CALL',
      'boom_1000': 'CALL',
      'crash_1000': 'PUT',
      'step_index': 'CALL',
      'derived_index': 'CALL'
    };
    derivContractType = contractMap[contractType] || 'CALL';

    // Adjust for SELL direction
    let direction = 'buy';
    if (aiAnalysis && aiAnalysis.decision === 'SELL') {
      if (derivContractType === 'CALL') derivContractType = 'PUT';
      else if (derivContractType === 'MULTUP') derivContractType = 'MULTDOWN';
      direction = 'sell';
    }

    // Create trade record
    const trade = await Trade.create({
      user: user._id,
      contractType,
      symbol,
      direction,
      amount,
      duration,
      durationUnit,
      barrier,
      digitPrediction,
      multiplier,
      aiAnalysis: aiAnalysis || { probability: 0, decision: 'MANUAL', confidence: 0, reason: 'Manual trade' },
      riskSettings: {
        stopLoss: user.riskSettings.stopLossPercent,
        takeProfit: user.riskSettings.takeProfitPercent
      },
      tickSnapshot: DerivService.getTickBuffer(symbol).slice(-20),
      status: 'pending'
    });

    // Execute on Deriv if token available
    let derivResult = null;
    if (user.derivTokenEncrypted) {
      const derivToken = decrypt(user.derivTokenEncrypted);
      if (derivToken && DerivService.isConnected()) {
        try {
          const params = DerivService.buildBuyParams(
            derivContractType, symbol, amount, duration, durationUnit,
            { barrier, digitPrediction, multiplier }
          );

          const proposal = await DerivService.getProposal(params);
          if (proposal.proposal) {
            const buy = await DerivService.buyContract(proposal.proposal.id, amount);
            if (buy.buy) {
              trade.derivContractId = buy.buy.contract_id;
              trade.entryPrice = buy.buy.buy_price;
              trade.status = 'open';
              trade.openedAt = new Date();
              await trade.save();
              derivResult = buy.buy;
            }
          }
        } catch (derivErr) {
          console.error('Deriv execution error:', derivErr.message);
          trade.status = 'error';
          trade.aiAnalysis.reason += ` | Deriv error: ${derivErr.message}`;
          await trade.save();
        }
      }
    }

    // Log AI analysis
    if (aiAnalysis) {
      await AILog.create({
        trade: trade._id,
        user: user._id,
        analyzerType: AIEngine.getCategory(contractType),
        symbol,
        tickData: trade.tickSnapshot,
        analysisResult: aiAnalysis
      });
    }

    res.status(201).json({
      trade: {
        id: trade._id,
        contractType: trade.contractType,
        symbol: trade.symbol,
        direction: trade.direction,
        amount: trade.amount,
        status: trade.status,
        aiAnalysis: trade.aiAnalysis,
        derivContractId: trade.derivContractId,
        createdAt: trade.createdAt
      },
      derivResult,
      message: derivResult ? 'Trade executed on Deriv' : 'Trade recorded (Deriv not connected)'
    });
  } catch (err) {
    next(err);
  }
});

// Get trades
router.get('/', auth, async (req, res, next) => {
  try {
    const { status, limit = 50, page = 1, contractType } = req.query;
    const query = { user: req.user._id };
    if (status) query.status = status;
    if (contractType) query.contractType = contractType;

    const trades = await Trade.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Trade.countDocuments(query);

    res.json({
      trades,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    next(err);
  }
});

// Get trade by ID
router.get('/:id', auth, async (req, res, next) => {
  try {
    const trade = await Trade.findOne({ _id: req.params.id, user: req.user._id });
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    res.json(trade);
  } catch (err) {
    next(err);
  }
});

// Update trade status (webhook from Deriv or manual)
router.put('/:id/status', auth, async (req, res, next) => {
  try {
    const { status, profit, exitPrice } = req.body;
    const trade = await Trade.findOne({ _id: req.params.id, user: req.user._id });
    if (!trade) return res.status(404).json({ error: 'Trade not found' });

    trade.status = status;
    if (profit !== undefined) trade.profit = profit;
    if (exitPrice) trade.exitPrice = exitPrice;
    if (status === 'won' || status === 'lost') {
      trade.closedAt = new Date();

      // Update user stats
      const user = await User.findById(req.user._id);
      await user.updateStats(trade);

      // Update AI log
      await AILog.findOneAndUpdate(
        { trade: trade._id },
        {
          wasCorrect: (status === 'won') === (trade.aiAnalysis.decision !== 'SKIP'),
          actualOutcome: status
        }
      );
    }

    await trade.save();
    res.json(trade);
  } catch (err) {
    next(err);
  }
});

// Sell contract early
router.post('/:id/sell', auth, async (req, res, next) => {
  try {
    const trade = await Trade.findOne({ _id: req.params.id, user: req.user._id });
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (!trade.derivContractId) return res.status(400).json({ error: 'No Deriv contract to sell' });

    const user = await User.findById(req.user._id);
    const derivToken = decrypt(user.derivTokenEncrypted);

    if (!derivToken || !DerivService.isConnected()) {
      return res.status(400).json({ error: 'Deriv not connected' });
    }

    const sell = await DerivService.sellContract(trade.derivContractId, 0);

    trade.status = 'sold';
    trade.profit = sell.sell?.sold_for - trade.amount || 0;
    trade.closedAt = new Date();
    await trade.save();

    await User.findById(req.user._id).then(u => u.updateStats(trade));

    res.json({ trade, sellResult: sell.sell });
  } catch (err) {
    next(err);
  }
});

// Get trade statistics
router.get('/stats/summary', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const stats = await Trade.aggregate([
      { $match: { user: user._id } },
      {
        $group: {
          _id: null,
          totalTrades: { $sum: 1 },
          totalProfit: { $sum: { $cond: [{ $gt: ['$profit', 0] }, '$profit', 0] } },
          totalLoss: { $sum: { $cond: [{ $lt: ['$profit', 0] }, { $abs: '$profit' }, 0] } },
          winCount: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
          lossCount: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
          avgProfit: { $avg: { $cond: [{ $gt: ['$profit', 0] }, '$profit', null] } },
          avgLoss: { $avg: { $cond: [{ $lt: ['$profit', 0] }, '$profit', null] } }
        }
      }
    ]);

    const dailyPnL = await Trade.aggregate([
      { $match: { user: user._id, status: { $in: ['won', 'lost'] } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          profit: { $sum: '$profit' },
          trades: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);

    const byContractType = await Trade.aggregate([
      { $match: { user: user._id, status: { $in: ['won', 'lost'] } } },
      {
        $group: {
          _id: '$contractType',
          trades: { $sum: 1 },
          profit: { $sum: '$profit' },
          wins: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      summary: stats[0] || {},
      dailyPnL,
      byContractType,
      userStats: user.stats
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
