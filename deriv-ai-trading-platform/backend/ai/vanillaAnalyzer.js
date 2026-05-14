const BaseAnalyzer = require('./baseAnalyzer');

class VanillaAnalyzer extends BaseAnalyzer {
  constructor(symbol) {
    super(symbol, 200);
  }

  analyze() {
    if (this.ticks.length < 100) {
      return this.buildResult(0, 'SKIP', 'Insufficient data for vanilla options analysis', 'neutral');
    }

    const sma20 = this.sma(20);
    const sma50 = this.sma(50);
    const sma200 = this.sma(200);
    const rsi = this.rsi(14);
    const vol = this.volatility(20);
    const trend = this.trendDirection(100);
    const momentum = this.momentum(20);
    const bb = this.bollingerBands(20, 2);
    const atr = this.atr(14);

    // Options-specific: time to expiration consideration (simulated)
    const ivEstimate = this.estimateImpliedVolatility();
    const supportResistance = this.findSupportResistance();

    let probability = 50;
    let decision = 'SKIP';
    let reason = '';
    let optionType = 'neutral';

    // CALL logic
    if (trend === 'up' && sma20 > sma50 && sma50 > sma200 && rsi > 50 && rsi < 70) {
      const distanceToResistance = supportResistance.resistance > 0 ? 
        (supportResistance.resistance - this.ticks[this.ticks.length-1].quote) / atr : 999;

      if (distanceToResistance > 2) { // Not near resistance
        probability = 70 + Math.min(momentum * 50, 15);
        decision = 'BUY';
        optionType = 'call';
        reason = `Bullish trend | SMA alignment | RSI ${rsi.toFixed(1)} | IV estimate ${(ivEstimate * 100).toFixed(1)}% | Distance to resistance: ${distanceToResistance.toFixed(1)} ATR`;
      } else {
        reason = `Near resistance at ${supportResistance.resistance.toFixed(5)} - avoid CALL`;
      }
    }
    // PUT logic
    else if (trend === 'down' && sma20 < sma50 && sma50 < sma200 && rsi < 50 && rsi > 30) {
      const distanceToSupport = supportResistance.support > 0 ?
        (this.ticks[this.ticks.length-1].quote - supportResistance.support) / atr : 999;

      if (distanceToSupport > 2) { // Not near support
        probability = 70 + Math.min(Math.abs(momentum) * 50, 15);
        decision = 'BUY';
        optionType = 'put';
        reason = `Bearish trend | SMA alignment | RSI ${rsi.toFixed(1)} | IV estimate ${(ivEstimate * 100).toFixed(1)}% | Distance to support: ${distanceToSupport.toFixed(1)} ATR`;
      } else {
        reason = `Near support at ${supportResistance.support.toFixed(5)} - avoid PUT`;
      }
    }
    // Mean reversion CALL
    else if (rsi < 30 && bb && this.ticks[this.ticks.length-1].quote < bb.lower * 1.001) {
      probability = 65;
      decision = 'BUY';
      optionType = 'call';
      reason = `Oversold bounce opportunity | RSI ${rsi.toFixed(1)} | Below lower BB | IV ${(ivEstimate * 100).toFixed(1)}%`;
    }
    // Mean reversion PUT
    else if (rsi > 70 && bb && this.ticks[this.ticks.length-1].quote > bb.upper * 0.999) {
      probability = 65;
      decision = 'BUY';
      optionType = 'put';
      reason = `Overbought reversal opportunity | RSI ${rsi.toFixed(1)} | Above upper BB | IV ${(ivEstimate * 100).toFixed(1)}%`;
    }
    else {
      reason = `No clear options signal | Trend: ${trend} | RSI: ${rsi?.toFixed(1)} | SMA alignment: ${sma20 > sma50 ? 'bullish' : 'bearish'}`;
    }

    return this.buildResult(probability, decision, reason, optionType, {
      sma20,
      sma50,
      sma200,
      rsi,
      volatility: vol,
      momentum,
      bb,
      atr,
      ivEstimate,
      supportResistance
    });
  }

  estimateImpliedVolatility() {
    const vol = this.volatility(20);
    if (!vol) return 0.15;
    // Annualized IV estimate
    const annualized = vol * Math.sqrt(252 * 24 * 60 * 60 / 2); // Assuming 2-second ticks
    return Math.min(1, Math.max(0.05, annualized));
  }

  findSupportResistance() {
    const data = this.getLastNTicks(100);
    if (data.length < 50) return { support: 0, resistance: 0 };

    // Simple pivot detection
    const pivots = [];
    for (let i = 2; i < data.length - 2; i++) {
      const prev = data[i-1].quote;
      const curr = data[i].quote;
      const next = data[i+1].quote;

      if (curr > prev && curr > next) pivots.push({ type: 'high', price: curr });
      if (curr < prev && curr < next) pivots.push({ type: 'low', price: curr });
    }

    const highs = pivots.filter(p => p.type === 'high').map(p => p.price);
    const lows = pivots.filter(p => p.type === 'low').map(p => p.price);

    return {
      resistance: highs.length > 0 ? highs[highs.length - 1] : Math.max(...data.map(t => t.quote)),
      support: lows.length > 0 ? lows[lows.length - 1] : Math.min(...data.map(t => t.quote))
    };
  }

  buildResult(probability, decision, reason, optionType, indicators = {}) {
    return {
      probability: Math.min(100, Math.max(0, probability)),
      decision,
      confidence: decision === 'SKIP' ? 0 : probability,
      reason,
      trendDirection: optionType,
      volatilityScore: indicators.volatility ? Math.min(100, indicators.volatility * 10000) : 50,
      patternDetected: indicators.supportResistance ? 'support_resistance' : 'none',
      optionType,
      indicators,
      timestamp: Date.now()
    };
  }
}

module.exports = VanillaAnalyzer;
