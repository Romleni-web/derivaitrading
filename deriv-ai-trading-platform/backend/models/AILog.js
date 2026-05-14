const mongoose = require('mongoose');

const aiLogSchema = new mongoose.Schema({
  trade: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trade',
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  analyzerType: {
    type: String,
    required: true,
    enum: ['forex', 'digit', 'over_under', 'multiplier', 'accumulator', 
           'synthetic', 'boom_crash', 'vanilla', 'step']
  },
  symbol: { type: String, required: true },

  // Analysis data
  tickData: [{
    epoch: Number,
    quote: Number,
    digit: Number
  }],

  analysisResult: {
    probability: { type: Number, min: 0, max: 100 },
    decision: { type: String, enum: ['BUY', 'SELL', 'SKIP'] },
    confidence: { type: Number, min: 0, max: 100 },
    reason: { type: String },
    indicators: {
      volatility: Number,
      trend: Number,
      momentum: Number,
      rsi: Number,
      sma20: Number,
      sma50: Number
    }
  },

  // Performance tracking
  wasCorrect: { type: Boolean },
  actualOutcome: { type: String, enum: ['win', 'loss', 'skip'] },

  createdAt: { type: Date, default: Date.now }
});

aiLogSchema.index({ user: 1, analyzerType: 1, createdAt: -1 });

module.exports = mongoose.model('AILog', aiLogSchema);
