const BaseAnalyzer = require('./baseAnalyzer');

class DigitAnalyzer extends BaseAnalyzer {
  constructor(symbol) {
    super(symbol, 100);
  }

  analyze() {
    const digits = this.getDigits();
    if (digits.length < 50) {
      return this.buildResult(0, 'SKIP', 'Insufficient digit data', 'neutral');
    }

    const freq = this.digitFrequency();
    const dist = this.digitDistribution();
    const lastDigit = digits[digits.length - 1];
    const recent20 = digits.slice(-20);

    // Detect repeating patterns
    const repeatingPattern = this.findRepeatingPattern(digits);
    const clustering = this.detectClustering(digits);
    const statisticalBias = this.detectStatisticalBias(freq);
    const streakAnalysis = this.analyzeStreaks(digits);

    let probability = 50;
    let decision = 'SKIP';
    let reason = '';
    let prediction = null;

    // Strong repeating pattern
    if (repeatingPattern.strength > 0.7) {
      prediction = repeatingPattern.nextDigit;
      probability = 60 + repeatingPattern.strength * 30;
      decision = 'BUY';
      reason = `Strong repeating pattern detected: ${repeatingPattern.pattern} (strength ${(repeatingPattern.strength * 100).toFixed(1)}%)`;
    }
    // Digit clustering
    else if (clustering.isClustered && clustering.confidence > 0.6) {
      prediction = clustering.predictedDigit;
      probability = 55 + clustering.confidence * 25;
      decision = 'BUY';
      reason = `Digit clustering around ${clustering.clusterCenter} | Confidence ${(clustering.confidence * 100).toFixed(1)}%`;
    }
    // Statistical bias
    else if (statisticalBias.isBiased && statisticalBias.confidence > 0.65) {
      prediction = statisticalBias.favoredDigit;
      probability = 55 + statisticalBias.confidence * 20;
      decision = 'BUY';
      reason = `Statistical bias toward digit ${statisticalBias.favoredDigit} | Deviation ${(statisticalBias.deviation * 100).toFixed(1)}%`;
    }
    // Streak analysis - bet against streak continuation
    else if (streakAnalysis.currentStreak > 3) {
      prediction = (lastDigit + 1) % 10; // Bet on different digit
      probability = 55;
      decision = 'BUY';
      reason = `Streak of ${streakAnalysis.currentStreak} same digits - betting on change`;
    }
    else {
      reason = `No strong pattern | Last digit: ${lastDigit} | Distribution std: ${dist?.stdDev?.toFixed(2) || 'N/A'}`;
    }

    return this.buildResult(probability, decision, reason, prediction, {
      frequency: freq,
      distribution: dist,
      repeatingPattern,
      clustering,
      statisticalBias,
      streakAnalysis,
      lastDigit
    });
  }

  findRepeatingPattern(digits) {
    // Look for patterns of length 2-5 that repeat
    for (let len = 5; len >= 2; len--) {
      const recent = digits.slice(-30);
      if (recent.length < len * 2) continue;

      const pattern = recent.slice(-len);
      let matches = 0;
      let checks = 0;

      for (let i = 0; i <= recent.length - len * 2; i += len) {
        checks++;
        const segment = recent.slice(i, i + len);
        if (this.arraysEqual(segment, pattern)) matches++;
      }

      if (checks > 0 && matches / checks > 0.5) {
        return {
          pattern: pattern.join(''),
          strength: matches / checks,
          nextDigit: pattern[0], // Predict first digit of pattern repeats
          length: len
        };
      }
    }
    return { pattern: '', strength: 0, nextDigit: null, length: 0 };
  }

  detectClustering(digits) {
    const recent = digits.slice(-30);
    const windowSize = 5;
    let bestCluster = { center: 0, count: 0 };

    for (let i = 0; i <= recent.length - windowSize; i++) {
      const window = recent.slice(i, i + windowSize);
      const mean = window.reduce((a, b) => a + b, 0) / windowSize;
      const variance = window.reduce((s, d) => s + Math.pow(d - mean, 2), 0) / windowSize;
      if (variance < 2 && window.length > bestCluster.count) {
        bestCluster = { center: Math.round(mean), count: window.length, variance };
      }
    }

    const confidence = bestCluster.count > 0 ? 1 - (bestCluster.variance / 10) : 0;
    return {
      isClustered: bestCluster.count >= 3,
      clusterCenter: bestCluster.center,
      confidence: Math.max(0, confidence),
      predictedDigit: bestCluster.center
    };
  }

  detectStatisticalBias(freq) {
    const expected = 0.1; // 10% for each digit
    let maxDeviation = 0;
    let favoredDigit = 0;

    freq.forEach(f => {
      const deviation = Math.abs(f.probability - expected);
      if (deviation > maxDeviation) {
        maxDeviation = deviation;
        favoredDigit = f.digit;
      }
    });

    return {
      isBiased: maxDeviation > 0.05,
      favoredDigit,
      deviation: maxDeviation,
      confidence: maxDeviation * 5 // Scale to 0-1
    };
  }

  analyzeStreaks(digits) {
    let currentStreak = 1;
    let maxStreak = 1;
    for (let i = digits.length - 2; i >= 0; i--) {
      if (digits[i] === digits[i + 1]) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        break;
      }
    }
    return { currentStreak, maxStreak };
  }

  arraysEqual(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  buildResult(probability, decision, reason, prediction, indicators = {}) {
    return {
      probability: Math.min(100, Math.max(0, probability)),
      decision,
      confidence: decision === 'SKIP' ? 0 : probability,
      reason,
      prediction,
      trendDirection: 'neutral',
      volatilityScore: 50,
      patternDetected: indicators.repeatingPattern?.pattern || 'none',
      indicators,
      timestamp: Date.now()
    };
  }
}

module.exports = DigitAnalyzer;
