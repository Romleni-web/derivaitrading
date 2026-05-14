const BaseAnalyzer = require('./baseAnalyzer');

class OverUnderAnalyzer extends BaseAnalyzer {
  constructor(symbol, threshold = 5) {
    super(symbol, 100);
    this.threshold = threshold;
  }

  analyze() {
    const digits = this.getDigits();
    if (digits.length < 50) {
      return this.buildResult(0, 'SKIP', 'Insufficient digit data', 'neutral');
    }

    const freq = this.digitFrequency();
    const last20 = digits.slice(-20);
    const last50 = digits.slice(-50);

    // Calculate over/under ratios
    const overCount20 = last20.filter(d => d > this.threshold).length;
    const underCount20 = last20.filter(d => d < this.threshold).length;
    const overCount50 = last50.filter(d => d > this.threshold).length;
    const underCount50 = last50.filter(d => d < this.threshold).length;

    const ratio20 = overCount20 / (overCount20 + underCount20 || 1);
    const ratio50 = overCount50 / (overCount50 + underCount50 || 1);

    // Detect imbalance
    const imbalance20 = Math.abs(ratio20 - 0.5);
    const imbalance50 = Math.abs(ratio50 - 0.5);

    // Threshold frequency analysis
    const thresholdFreq = freq[this.threshold].probability;
    const expectedFreq = 0.1;

    let probability = 50;
    let decision = 'SKIP';
    let reason = '';
    let direction = 'neutral';

    // Strong short-term imbalance reverting to mean
    if (imbalance20 > 0.25 && imbalance50 < 0.15) {
      if (ratio20 > 0.7) {
        probability = 65;
        decision = 'BUY';
        direction = 'under';
        reason = `Over-representation of OVER in last 20 ticks (${(ratio20 * 100).toFixed(0)}%) - reverting to UNDER`;
      } else if (ratio20 < 0.3) {
        probability = 65;
        decision = 'BUY';
        direction = 'over';
        reason = `Over-representation of UNDER in last 20 ticks (${((1 - ratio20) * 100).toFixed(0)}%) - reverting to OVER`;
      }
    }
    // Long-term trend following
    else if (imbalance50 > 0.2 && imbalance20 > 0.15) {
      if (ratio50 > 0.65) {
        probability = 60;
        decision = 'BUY';
        direction = 'over';
        reason = `Sustained OVER trend in last 50 ticks (${(ratio50 * 100).toFixed(0)}%) - following trend`;
      } else if (ratio50 < 0.35) {
        probability = 60;
        decision = 'BUY';
        direction = 'under';
        reason = `Sustained UNDER trend in last 50 ticks (${((1 - ratio50) * 100).toFixed(0)}%) - following trend`;
      }
    }
    // Threshold digit frequency anomaly
    else if (Math.abs(thresholdFreq - expectedFreq) > 0.03) {
      if (thresholdFreq > expectedFreq) {
        probability = 58;
        decision = 'BUY';
        direction = 'over';
        reason = `Threshold digit ${this.threshold} appearing more frequently (${(thresholdFreq * 100).toFixed(1)}%) - favor OVER`;
      } else {
        probability = 58;
        decision = 'BUY';
        direction = 'under';
        reason = `Threshold digit ${this.threshold} appearing less frequently (${(thresholdFreq * 100).toFixed(1)}%) - favor UNDER`;
      }
    }
    else {
      reason = `Balanced distribution | Over ratio 20: ${(ratio20 * 100).toFixed(0)}% | Over ratio 50: ${(ratio50 * 100).toFixed(0)}%`;
    }

    return this.buildResult(probability, decision, reason, direction, {
      overRatio20: ratio20,
      overRatio50: ratio50,
      imbalance20,
      imbalance50,
      thresholdFreq,
      freq,
      threshold: this.threshold
    });
  }

  buildResult(probability, decision, reason, direction, indicators = {}) {
    return {
      probability: Math.min(100, Math.max(0, probability)),
      decision,
      confidence: decision === 'SKIP' ? 0 : probability,
      reason,
      trendDirection: direction,
      volatilityScore: 50,
      patternDetected: indicators.imbalance20 > 0.2 ? 'distribution_imbalance' : 'none',
      indicators,
      timestamp: Date.now()
    };
  }
}

module.exports = OverUnderAnalyzer;
