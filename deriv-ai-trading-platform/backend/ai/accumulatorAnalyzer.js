const BaseAnalyzer = require('./baseAnalyzer');

class AccumulatorAnalyzer extends BaseAnalyzer {
  constructor(symbol) {
    super(symbol, 200);
  }

  analyze() {
    if (this.ticks.length < 100) {
      return this.buildResult(0, 'SKIP', 'Insufficient data for accumulator analysis', 'neutral');
    }

    const sma20 = this.sma(20);
    const sma50 = this.sma(50);
    const vol = this.volatility(20);
    const trend = this.trendDirection(100);
    const momentum = this.momentum(50);
    const bb = this.bollingerBands(20, 2);

    // Accumulator-specific: detect consistent small movements
    const tickChanges = [];
    for (let i = 1; i < this.ticks.length; i++) {
      tickChanges.push(this.ticks[i].quote - this.ticks[i-1].quote);
    }

    const recentChanges = tickChanges.slice(-50);
    const positiveChanges = recentChanges.filter(c => c > 0).length;
    const negativeChanges = recentChanges.filter(c => c < 0).length;
    const avgChange = recentChanges.reduce((s, c) => s + Math.abs(c), 0) / recentChanges.length;

    // Growth rate calculation
    const growthRate = this.calculateGrowthRate();
    const consistency = this.calculateConsistency(recentChanges);

    let probability = 50;
    let decision = 'SKIP';
    let reason = '';
    let recommendedGrowth = 0.01;

    // High consistency with positive bias
    if (consistency > 0.7 && positiveChanges > negativeChanges * 1.5 && avgChange < vol * 2) {
      probability = 75;
      decision = 'BUY';
      recommendedGrowth = Math.min(0.05, avgChange / (this.ticks[this.ticks.length-1].quote) * 100);
      reason = `High consistency ${(consistency * 100).toFixed(0)}% | Positive bias ${positiveChanges}/${recentChanges.length} | Avg change ${avgChange.toFixed(5)}`;
    }
    // Moderate consistency
    else if (consistency > 0.6 && Math.abs(positiveChanges - negativeChanges) < 5) {
      probability = 60;
      decision = 'BUY';
      recommendedGrowth = 0.02;
      reason = `Moderate consistency ${(consistency * 100).toFixed(0)}% | Balanced movements | Growth rate ${growthRate.toFixed(3)}%`;
    }
    // Low consistency - skip
    else if (consistency < 0.4) {
      probability = 35;
      reason = `Low consistency ${(consistency * 100).toFixed(0)}% - too erratic for accumulators`;
    }
    else {
      reason = `Consistency: ${(consistency * 100).toFixed(0)}% | Pos/Neg: ${positiveChanges}/${negativeChanges} | Trend: ${trend}`;
    }

    return this.buildResult(probability, decision, reason, trend, recommendedGrowth, {
      sma20,
      sma50,
      volatility: vol,
      momentum,
      bb,
      consistency,
      growthRate,
      positiveChanges,
      negativeChanges,
      avgChange,
      tickChanges: recentChanges.length
    });
  }

  calculateGrowthRate() {
    const data = this.getLastNTicks(100);
    if (data.length < 2) return 0;
    const start = data[0].quote;
    const end = data[data.length - 1].quote;
    return ((end - start) / start) * 100;
  }

  calculateConsistency(changes) {
    if (changes.length < 10) return 0;
    const avg = changes.reduce((s, c) => s + Math.abs(c), 0) / changes.length;
    const variance = changes.reduce((s, c) => s + Math.pow(Math.abs(c) - avg, 2), 0) / changes.length;
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;
    // Lower CV = higher consistency
    return Math.max(0, 1 - cv);
  }

  buildResult(probability, decision, reason, direction, growthRate, indicators = {}) {
    return {
      probability: Math.min(100, Math.max(0, probability)),
      decision,
      confidence: decision === 'SKIP' ? 0 : probability,
      reason,
      trendDirection: direction,
      volatilityScore: indicators.volatility ? Math.min(100, indicators.volatility * 1000) : 50,
      patternDetected: indicators.consistency > 0.7 ? 'consistent_trend' : 'erratic',
      recommendedGrowthRate: growthRate,
      indicators,
      timestamp: Date.now()
    };
  }
}

module.exports = AccumulatorAnalyzer;
