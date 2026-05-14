const BaseAnalyzer = require('./baseAnalyzer');

class SyntheticAnalyzer extends BaseAnalyzer {
  constructor(symbol) {
    super(symbol, 150);
    this.symbolType = this.detectSymbolType();
  }

  detectSymbolType() {
    if (this.symbol.includes('BOOM')) return 'boom';
    if (this.symbol.includes('CRASH')) return 'crash';
    if (this.symbol.includes('stpRNG')) return 'step';
    if (this.symbol.includes('1HZ')) return 'volatility';
    return 'standard';
  }

  analyze() {
    if (this.ticks.length < 80) {
      return this.buildResult(0, 'SKIP', 'Insufficient tick data for synthetic analysis', 'neutral');
    }

    const sma20 = this.sma(20);
    const sma50 = this.sma(50);
    const vol = this.volatility(20);
    const trend = this.trendDirection(50);
    const momentum = this.momentum(10);
    const rsi = this.rsi(14);
    const bb = this.bollingerBands(20, 2);

    // Spike detection for Boom/Crash
    const spikeProb = this.detectSpikeProbability();
    const accumulationZone = this.detectAccumulationZone();
    const tickMomentum = this.calculateTickMomentum();

    let probability = 50;
    let decision = 'SKIP';
    let reason = '';
    let direction = 'neutral';

    // Boom 1000 - buy on dips before spike
    if (this.symbolType === 'boom') {
      if (spikeProb.probability > 0.6 && accumulationZone.isAccumulating) {
        probability = 70;
        decision = 'BUY';
        direction = 'up';
        reason = `Spike probability ${(spikeProb.probability * 100).toFixed(0)}% | Accumulation zone detected | Tick momentum ${tickMomentum.toFixed(2)}`;
      } else if (spikeProb.recentSpike) {
        probability = 30;
        reason = `Recent spike detected - waiting for cooldown | Time since last: ${spikeProb.timeSinceLast}s`;
      } else {
        reason = `Boom analysis | Spike prob: ${(spikeProb.probability * 100).toFixed(0)}% | Accumulating: ${accumulationZone.isAccumulating}`;
      }
    }
    // Crash 1000 - sell on peaks before crash
    else if (this.symbolType === 'crash') {
      if (spikeProb.probability > 0.6 && !accumulationZone.isAccumulating) {
        probability = 70;
        decision = 'BUY';
        direction = 'down';
        reason = `Crash probability ${(spikeProb.probability * 100).toFixed(0)}% | Distribution zone | Tick momentum ${tickMomentum.toFixed(2)}`;
      } else {
        reason = `Crash analysis | Spike prob: ${(spikeProb.probability * 100).toFixed(0)}% | Accumulating: ${accumulationZone.isAccumulating}`;
      }
    }
    // Volatility indices
    else if (this.symbolType === 'volatility') {
      const volNumber = parseInt(this.symbol.match(/\d+/)?.[0] || 50);
      const expectedVol = volNumber / 100;
      const volRatio = vol / expectedVol;

      if (volRatio > 1.2 && trend !== 'neutral') {
        probability = 65;
        decision = 'BUY';
        direction = trend;
        reason = `Elevated volatility ${(volRatio * 100).toFixed(0)}% of expected | ${trend} trend | RSI ${rsi?.toFixed(1)}`;
      } else if (volRatio < 0.8) {
        probability = 35;
        reason = `Subdued volatility ${(volRatio * 100).toFixed(0)}% - waiting for expansion`;
      } else {
        reason = `Volatility at ${(volRatio * 100).toFixed(0)}% of expected | Trend: ${trend}`;
      }
    }
    // Standard synthetic
    else {
      if (trend !== 'neutral' && Math.abs(momentum) > 0.5) {
        probability = 60;
        decision = 'BUY';
        direction = trend;
        reason = `Synthetic trend: ${trend} | Momentum ${momentum.toFixed(2)} | Vol ${(vol * 10000).toFixed(1)}`;
      } else {
        reason = `No clear synthetic signal | Trend: ${trend} | Momentum: ${momentum.toFixed(2)}`;
      }
    }

    return this.buildResult(probability, decision, reason, direction, {
      sma20,
      sma50,
      volatility: vol,
      trend,
      momentum,
      rsi,
      bb,
      spikeProb,
      accumulationZone,
      tickMomentum,
      symbolType: this.symbolType
    });
  }

  detectSpikeProbability() {
    const recent = this.getLastNTicks(50);
    if (recent.length < 20) return { probability: 0, recentSpike: false, timeSinceLast: 0 };

    // Detect recent spikes (large single-tick moves)
    let spikes = 0;
    let lastSpikeTime = 0;
    const threshold = this.symbol.includes('BOOM') || this.symbol.includes('CRASH') ? 5 : 2;

    for (let i = 1; i < recent.length; i++) {
      const change = Math.abs(recent[i].quote - recent[i-1].quote);
      const avgChange = this.getLastNTicks(10).reduce((s, t, idx) => {
        if (idx === 0) return 0;
        return s + Math.abs(t.quote - recent[Math.max(0, recent.indexOf(t) - 1)]?.quote || 0);
      }, 0) / 9;

      if (change > avgChange * threshold) {
        spikes++;
        lastSpikeTime = recent[i].epoch;
      }
    }

    const timeSinceLast = lastSpikeTime ? Date.now() / 1000 - lastSpikeTime : 999;
    const spikeRate = spikes / (recent.length / 10); // spikes per 10 ticks

    // Higher probability if no recent spike and conditions building
    let prob = 0.3;
    if (timeSinceLast > 30) prob += 0.2;
    if (spikeRate > 0.5) prob += 0.2;
    if (this.detectAccumulationZone().isAccumulating) prob += 0.2;

    return {
      probability: Math.min(1, prob),
      recentSpike: timeSinceLast < 10,
      timeSinceLast,
      spikeRate,
      spikes
    };
  }

  detectAccumulationZone() {
    const recent = this.getLastNTicks(30);
    if (recent.length < 20) return { isAccumulating: false, range: 0 };

    const high = Math.max(...recent.map(t => t.quote));
    const low = Math.min(...recent.map(t => t.quote));
    const range = high - low;
    const mean = recent.reduce((s, t) => s + t.quote, 0) / recent.length;
    const rangePercent = range / mean;

    // Tight range = accumulation
    const isAccumulating = rangePercent < 0.001;
    return { isAccumulating, range, rangePercent, mean };
  }

  calculateTickMomentum() {
    const recent = this.getLastNTicks(10);
    if (recent.length < 5) return 0;
    const changes = [];
    for (let i = 1; i < recent.length; i++) {
      changes.push(recent[i].quote - recent[i-1].quote);
    }
    return changes.reduce((s, c) => s + c, 0) / changes.length;
  }

  buildResult(probability, decision, reason, direction, indicators = {}) {
    return {
      probability: Math.min(100, Math.max(0, probability)),
      decision,
      confidence: decision === 'SKIP' ? 0 : probability,
      reason,
      trendDirection: direction,
      volatilityScore: indicators.volatility ? Math.min(100, indicators.volatility * 10000) : 50,
      patternDetected: indicators.spikeProb?.probability > 0.6 ? 'spike_building' : 
                      indicators.accumulationZone?.isAccumulating ? 'accumulation' : 'none',
      indicators,
      timestamp: Date.now()
    };
  }
}

module.exports = SyntheticAnalyzer;
