const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email']
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  avatar: {
    type: String
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  // email duplicate removed below
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function() { return this.authProvider === 'local'; },
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  subscription: {
    plan: { type: String, enum: ['free', 'basic', 'pro', 'enterprise'], default: 'free' },
    expiresAt: { type: Date },
    tradeLimit: { type: Number, default: 10 }
  },
  riskSettings: {
    maxTradeAmount: { type: Number, default: 100 },
    dailyLossLimit: { type: Number, default: 500 },
    maxOpenTrades: { type: Number, default: 5 },
    stopLossPercent: { type: Number, default: 2 },
    takeProfitPercent: { type: Number, default: 5 }
  },
  derivTokenEncrypted: {
    type: String,
    default: null
  },
  stats: {
    totalTrades: { type: Number, default: 0 },
    winCount: { type: Number, default: 0 },
    lossCount: { type: Number, default: 0 },
    totalProfit: { type: Number, default: 0 },
    totalLoss: { type: Number, default: 0 },
    aiAccuracy: { type: Number, default: 0 }
  },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.updateStats = async function(trade) {
  this.stats.totalTrades += 1;
  if (trade.profit > 0) {
    this.stats.winCount += 1;
    this.stats.totalProfit += trade.profit;
  } else {
    this.stats.lossCount += 1;
    this.stats.totalLoss += Math.abs(trade.profit);
  }
  this.stats.aiAccuracy = this.stats.winCount / this.stats.totalTrades * 100;
  await this.save();
};

module.exports = mongoose.model('User', userSchema);
