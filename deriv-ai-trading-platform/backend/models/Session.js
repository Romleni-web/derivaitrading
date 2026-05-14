const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  token: { type: String, required: true, index: true },
  ipAddress: { type: String },
  userAgent: { type: String },
  isValid: { type: Boolean, default: true },
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now, expires: '7d' }
});

sessionSchema.index({ token: 1 });
sessionSchema.index({ user: 1, isValid: 1 });

module.exports = mongoose.model('Session', sessionSchema);
