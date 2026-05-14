const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  contractType: {
    type: String,
    required: true,
    enum: ['rise_fall', 'higher_lower', 'over_under', 'matches_differs', 'even_odd',
           'digit_over_under', 'digit_match', 'digit_differs', 'multipliers',
           'accumulators', 'vanilla_call', 'vanilla_put', 'synthetic_10',
           'synthetic_25', 'synthetic_50', 'synthetic_75', 'synthetic_100',
           'boom_1000', 'crash_1000', 'step_index', 'derived_index']
  },
  symbol: { type: String, required: true },
  direction: { type: String, enum: ['buy', 'sell', 'call', 'put', 'skip'], required: true },
  amount: { type: Number, required: true, min: 0.35 },
  duration: { type: Number },
  durationUnit: { type: String, enum: ['t', 's', 'm', 'h', 'd'] },
  barrier: { type: String },
  digitPrediction: { type: Number, min: 0, max: 9 },
  multiplier: { type: Number },
  stake: { type: Number },

  // AI Analysis
  aiAnalysis: {
    probability: { type: Number, min: 0, max: 100 },
    decision: { type: String, enum: ['BUY', 'SELL', 'SKIP'] },
    confidence: { type: Number, min: 0, max: 100 },
    reason: { type: String },
    volatilityScore: { type: Number },
    trendDirection: { type: String },
    patternDetected: { type: String }
  },

  // Risk management
  riskSettings: {
    stopLoss: { type: Number },
    takeProfit: { type: Number },
    maxDrawdown: { type: Number }
  },

  // Execution
  status: {
    type: String,
    enum: ['pending', 'open', 'won', 'lost', 'cancelled', 'error'],
    default: 'pending'
  },
  derivContractId: { type: String },
  entryPrice: { type: Number },
  exitPrice: { type: Number },
  profit: { type: Number, default: 0 },
  payout: { type: Number },

  // Tick data snapshot
  tickSnapshot: [{
    epoch: Number,
    quote: Number,
    digit: Number
  }],

  // Timestamps
  openedAt: { type: Date },
  closedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

tradeSchema.index({ user: 1, createdAt: -1 });
tradeSchema.index({ status: 1 });
tradeSchema.index({ contractType: 1 });

module.exports = mongoose.model('Trade', tradeSchema);
