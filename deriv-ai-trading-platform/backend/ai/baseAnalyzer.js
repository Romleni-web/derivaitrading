class BaseAnalyzer {
  constructor(symbol, tickBufferSize = 100) {
    this.symbol = symbol;
    this.ticks = [];
    this.maxTicks = tickBufferSize;
    this.lastAnalysis = null;
    this.analysisHistory = [];
  }

  addTick(tick) {
    this.ticks.push(tick);
    if (this.ticks.length > this.maxTicks) this.ticks.shift();
  }

  getLastNTicks(n) {
    return this.ticks.slice(-n);
  }

  // Technical indicators
  sma(period) {
    const data = this.getLastNTicks(period);
    if (data.length < period) return null;
    return data.reduce((sum, t) => sum + t.quote, 0) / period;
  }

  ema(period) {
    const data = this.getLastNTicks(period);
    if (data.length < period) return null;
    const k = 2 / (period + 1);
    let ema = data[0].quote;
    for (let i = 1; i < data.length; i++) {
      ema = data[i].quote * k + ema * (1 - k);
    }
    return ema;
  }

  rsi(period = 14) {
    const data = this.getLastNTicks(period + 1);
    if (data.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i < data.length; i++) {
      const change = data[i].quote - data[i - 1].quote;
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }

  volatility(period = 20) {
    const data = this.getLastNTicks(period);
    if (data.length < period) return null;
    const mean = data.reduce((s, t) => s + t.quote, 0) / data.length;
    const variance = data.reduce((s, t) => s + Math.pow(t.quote - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
  }

  atr(period = 14) {
    const data = this.getLastNTicks(period + 1);
    if (data.length < 2) return null;
    let sum = 0;
    for (let i = 1; i < data.length; i++) {
      sum += Math.abs(data[i].quote - data[i - 1].quote);
    }
    return sum / (data.length - 1);
  }

  bollingerBands(period = 20, stdDev = 2) {
    const sma = this.sma(period);
    if (!sma) return null;
    const data = this.getLastNTicks(period);
    const variance = data.reduce((s, t) => s + Math.pow(t.quote - sma, 2), 0) / period;
    const sd = Math.sqrt(variance);
    return { upper: sma + stdDev * sd, middle: sma, lower: sma - stdDev * sd };
  }

  trendDirection(period = 20) {
    const data = this.getLastNTicks(period);
    if (data.length < period) return 'neutral';
    const first = data[0].quote;
    const last = data[data.length - 1].quote;
    const change = ((last - first) / first) * 100;
    if (change > 0.5) return 'up';
    if (change < -0.5) return 'down';
    return 'neutral';
  }

  momentum(period = 10) {
    const data = this.getLastNTicks(period);
    if (data.length < period) return null;
    return data[data.length - 1].quote - data[0].quote;
  }

  // Digit analysis helpers
  getDigits() {
    return this.ticks.map(t => t.digit).filter(d => d !== undefined);
  }

  digitFrequency() {
    const digits = this.getDigits();
    const freq = Array(10).fill(0);
    digits.forEach(d => freq[d]++);
    return freq.map((count, i) => ({ digit: i, count, probability: count / digits.length }));
  }

  digitDistribution() {
    const freq = this.digitFrequency();
    const total = freq.reduce((s, f) => s + f.count, 0);
    if (total === 0) return null;
    const mean = freq.reduce((s, f) => s + f.digit * f.count, 0) / total;
    const variance = freq.reduce((s, f) => s + f.count * Math.pow(f.digit - mean, 2), 0) / total;
    return { mean, variance, stdDev: Math.sqrt(variance) };
  }

  // Session detection (UTC based)
  getCurrentSession() {
    const hour = new Date().getUTCHours();
    if (hour >= 8 && hour < 17) return 'london';
    if (hour >= 13 && hour < 22) return 'new_york';
    if (hour >= 0 && hour < 9) return 'asia';
    return 'overlap';
  }

  analyze() {
    throw new Error('analyze() must be implemented by subclass');
  }

  getResult() {
    if (!this.lastAnalysis) return this.analyze();
    return this.lastAnalysis;
  }
}

module.exports = BaseAnalyzer;
