const BaseAnalyzer = require('./baseAnalyzer');

class MultiplierAnalyzer extends BaseAnalyzer {
  constructor(symbol) {
    super(symbol, 150);
    this.trendStrengthThreshold = 0.6;
    this.momentumThreshold = 0.001;
  }

  analyze() {
    if (this.ticks.length < 80) {
      return this.buildResult(0, 'SKIP', 'Insufficient data for multiplier analysis', 'neutral');
    }

    const sma20 = this.sma(20);
    const sma50 = this.sma(50);
    const sma100 = this.sma(100);
    const rsi = this.rsi(14);
    const vol = this.volatility(20);
    const trend = this.trendDirection(100);
    const momentum = this.momentum(20);
    const atr = this.atr(14);
    const bb = this.bollingerBands(20, 2);

    // Detect strong trend momentum
    const trendAlignment = this.checkTrendAlignment();
    const momentumStrength = Math.abs(momentum) / (atr || 1);
    const isSideways = this.detectSidewaysMarket();

    // Avoid sideways markets
    if (isSideways.isSideways) {
      return this.buildResult(30, 'SKIP', `Sideways market detected (range ${isSideways.range.toFixed(4)}) - avoid multipliers`, 'neutral');
    }

    // Calculate safe multiplier level based on volatility
    const safeMultiplier = this.calculateSafeMultiplier(vol, atr);

    let probability = 50;
    let decision = 'SKIP';
    let reason = '';
    let direction = 'neutral';

    // Strong uptrend with momentum
    if (trend === 'up' && trendAlignment.score > 0.7 && momentumStrength > 1.5 && rsi > 50 && rsi < 75) {
      probability = 70 + Math.min(trendAlignment.score * 20, 20);
      decision = 'BUY';
      direction = 'up';
      reason = `Strong uptrend | Alignment ${(trendAlignment.score * 100).toFixed(0)}% | Momentum strength ${momentumStrength.toFixed(2)} | Safe multiplier: ${safeMultiplier}x`;
    }
    // Strong downtrend with momentum
    else if (trend === 'down' && trendAlignment.score > 0.7 && momentumStrength > 1.5 && rsi < 50 && rsi > 25) {
      probability = 70 + Math.min(trendAlignment.score * 20, 20);
      decision = 'BUY';
      direction = 'down';
      reason = `Strong downtrend | Alignment ${(trendAlignment.score * 100).toFixed(0)}% | Momentum strength ${momentumStrength.toFixed(2)} | Safe multiplier: ${safeMultiplier}x`;
    }
    // Moderate trend but good alignment
    else if (trendAlignment.score > 0.6 && momentumStrength > 1.0) {
      probability = 60;
      decision = 'BUY';
      direction = trend;
      reason = `Moderate ${trend} trend | Alignment ${(trendAlignment.score * 100).toFixed(0)}% | Multiplier: ${safeMultiplier}x`;
    }
    else {
      reason = `No strong trend | Alignment: ${(trendAlignment.score * 100).toFixed(0)}% | Momentum: ${momentumStrength.toFixed(2)} | RSI: ${rsi?.toFixed(1)}`;
    }

    return this.buildResult(probability, decision, reason, direction, safeMultiplier, {
      sma20,
      sma50,
      sma100,
      rsi,
      volatility: vol,
      momentum,
      atr,
      trendAlignment,
      momentumStrength,
      isSideways,
      bb
    });
  }

  checkTrendAlignment() {
    const data = this.getLastNTicks(100);
    if (data.length < 50) return { score: 0 };

    let upCount = 0, downCount = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i].quote > data[i-1].quote) upCount++;
      else if (data[i].quote < data[i-1].quote) downCount++;
    }
    const total = upCount + downCount;
    const score = total > 0 ? Math.max(upCount, downCount) / total : 0;
    const direction = upCount > downCount ? 'up' : 'down';
    return { score, direction, upCount, downCount };
  }

  detectSidewaysMarket() {
    const data = this.getLastNTicks(50);
    if (data.length < 30) return { isSideways: true, range: 0 };
    const high = Math.max(...data.map(t => t.quote));
    const low = Math.min(...data.map(t => t.quote));
    const range = high - low;
    const mean = data.reduce((s, t) => s + t.quote, 0) / data.length;
    const rangePercent = range / mean;
    return { isSideways: rangePercent < 0.002, range, rangePercent };
  }

  calculateSafeMultiplier(volatility, atr) {
    if (!volatility || !atr) return 10;
    const volScore = Math.min(volatility * 1000, 100);
    const atrScore = Math.min(atr * 100, 100);
    const riskScore = (volScore + atrScore) / 2;
    // Lower multiplier for higher volatility
    if (riskScore > 80) return 5;
    if (riskScore > 60) return 10;
    if (riskScore > 40) return 25;
    if (riskScore > 20) return 50;
    return 100;
  }

  buildResult(probability, decision, reason, direction, safeMultiplier, indicators = {}) {
    return {
      probability: Math.min(100, Math.max(0, probability)),
      decision,
      confidence: decision === 'SKIP' ? 0 : probability,
      reason,
      trendDirection: direction,
      volatilityScore: indicators.volatility ? Math.min(100, indicators.volatility * 1000) : 50,
      patternDetected: indicators.isSideways?.isSideways ? 'sideways' : direction + '_trend',
      safeMultiplier,
      indicators,
      timestamp: Date.now()
    };
  }
}

module.exports = MultiplierAnalyzer;
