const BaseAnalyzer = require('./baseAnalyzer');

class ForexAnalyzer extends BaseAnalyzer {
  constructor(symbol) {
    super(symbol, 200);
    this.spreadThreshold = 0.0003; // 3 pips for forex
    this.minVolatility = 0.0001;
    this.maxVolatility = 0.005;
  }

  analyze() {
    if (this.ticks.length < 50) {
      return this.buildResult(0, 'SKIP', 'Insufficient tick data', 'neutral');
    }

    const sma20 = this.sma(20);
    const sma50 = this.sma(50);
    const rsi = this.rsi(14);
    const vol = this.volatility(20);
    const trend = this.trendDirection(50);
    const momentum = this.momentum(10);
    const bb = this.bollingerBands(20, 2);
    const atr = this.atr(14);
    const session = this.getCurrentSession();

    // Spread filter - skip if spread too wide (simulated)
    const spread = this.estimateSpread();
    if (spread > this.spreadThreshold) {
      return this.buildResult(30, 'SKIP', `Spread too wide: ${(spread * 10000).toFixed(1)} pips`, trend);
    }

    // Volatility filter
    if (vol < this.minVolatility) {
      return this.buildResult(25, 'SKIP', 'Market too flat - low volatility', 'neutral');
    }
    if (vol > this.maxVolatility) {
      return this.buildResult(35, 'SKIP', 'Volatility too high - avoid trading', trend);
    }

    // Session filter
    if (session === 'asia' && !this.symbol.includes('JPY')) {
      return this.buildResult(40, 'SKIP', 'Asian session - low liquidity for non-JPY pairs', trend);
    }

    // Break of structure detection
    const recentHigh = Math.max(...this.getLastNTicks(20).map(t => t.quote));
    const recentLow = Math.min(...this.getLastNTicks(20).map(t => t.quote));
    const current = this.ticks[this.ticks.length - 1].quote;
    const breakUp = current > recentHigh * 0.999;
    const breakDown = current < recentLow * 1.001;

    // Moving average confirmation
    const maBullish = sma20 > sma50;
    const maBearish = sma20 < sma50;

    // RSI confirmation
    const rsiBullish = rsi > 50 && rsi < 70;
    const rsiBearish = rsi < 50 && rsi > 30;
    const rsiOverbought = rsi > 70;
    const rsiOversold = rsi < 30;

    // Bollinger position
    const bbPosition = bb ? (current - bb.lower) / (bb.upper - bb.lower) : 0.5;

    let probability = 50;
    let decision = 'SKIP';
    let reason = '';

    // BUY logic
    if (breakUp && maBullish && rsiBullish && bbPosition > 0.3 && bbPosition < 0.8) {
      probability = 65 + Math.min(momentum * 100, 20);
      if (probability > 75) {
        decision = 'BUY';
        reason = `Break of structure UP | MA bullish | RSI ${rsi.toFixed(1)} | Momentum ${momentum.toFixed(4)} | ${session} session`;
      }
    }
    // SELL logic
    else if (breakDown && maBearish && rsiBearish && bbPosition > 0.2 && bbPosition < 0.7) {
      probability = 65 + Math.min(Math.abs(momentum) * 100, 20);
      if (probability > 75) {
        decision = 'SELL';
        reason = `Break of structure DOWN | MA bearish | RSI ${rsi.toFixed(1)} | Momentum ${momentum.toFixed(4)} | ${session} session`;
      }
    }
    // Mean reversion - oversold
    else if (rsiOversold && bbPosition < 0.1 && maBullish) {
      probability = 70;
      decision = 'BUY';
      reason = `Oversold bounce | RSI ${rsi.toFixed(1)} | BB lower touch | ${session}`;
    }
    // Mean reversion - overbought
    else if (rsiOverbought && bbPosition > 0.9 && maBearish) {
      probability = 70;
      decision = 'SELL';
      reason = `Overbought reversal | RSI ${rsi.toFixed(1)} | BB upper touch | ${session}`;
    }
    else {
      reason = `No clear signal | Trend: ${trend} | RSI: ${rsi?.toFixed(1)} | Vol: ${(vol * 10000).toFixed(1)} pips`;
    }

    const result = this.buildResult(probability, decision, reason, trend, {
      volatility: vol,
      trend: trend === 'up' ? 1 : trend === 'down' ? -1 : 0,
      momentum,
      rsi,
      sma20,
      sma50,
      bb,
      atr,
      session,
      spread
    });

    this.lastAnalysis = result;
    this.analysisHistory.push({ ...result, timestamp: Date.now() });
    if (this.analysisHistory.length > 50) this.analysisHistory.shift();

    return result;
  }

  estimateSpread() {
    // Simulated spread estimation from tick variance
    const recent = this.getLastNTicks(10);
    if (recent.length < 2) return 0;
    let maxDiff = 0;
    for (let i = 1; i < recent.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(recent[i].quote - recent[i-1].quote));
    }
    return maxDiff * 0.3; // Approximate spread as 30% of max tick diff
  }

  buildResult(probability, decision, reason, trend, indicators = {}) {
    return {
      probability: Math.min(100, Math.max(0, probability)),
      decision,
      confidence: decision === 'SKIP' ? 0 : probability,
      reason,
      trendDirection: trend,
      volatilityScore: indicators.volatility ? Math.min(100, indicators.volatility * 10000) : 50,
      patternDetected: this.detectPattern(),
      indicators,
      timestamp: Date.now()
    };
  }

  detectPattern() {
    if (this.ticks.length < 20) return 'none';
    const recent = this.getLastNTicks(20);
    // Check for double top/bottom
    const highs = recent.map((t, i) => ({ idx: i, val: t.quote }));
    const sorted = [...highs].sort((a, b) => b.val - a.val);
    if (sorted[0].val > 0 && Math.abs(sorted[0].val - sorted[1].val) / sorted[0].val < 0.001) {
      if (sorted[0].idx > sorted[1].idx) return 'double_top';
      return 'double_bottom';
    }
    return 'none';
  }
}

module.exports = ForexAnalyzer;
