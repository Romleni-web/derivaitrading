const ForexAnalyzer = require('./forexAnalyzer');
const DigitAnalyzer = require('./digitAnalyzer');
const OverUnderAnalyzer = require('./overUnderAnalyzer');
const MultiplierAnalyzer = require('./multiplierAnalyzer');
const AccumulatorAnalyzer = require('./accumulatorAnalyzer');
const SyntheticAnalyzer = require('./syntheticAnalyzer');
const VanillaAnalyzer = require('./vanillaAnalyzer');

class AIEngine {
  constructor() {
    this.analyzers = new Map(); // symbol -> analyzer instance
  }

  getAnalyzer(contractType, symbol, options = {}) {
    const key = `${contractType}_${symbol}`;

    if (this.analyzers.has(key)) {
      return this.analyzers.get(key);
    }

    let analyzer;
    const category = this.getCategory(contractType);

    switch (category) {
      case 'forex':
        analyzer = new ForexAnalyzer(symbol);
        break;
      case 'digit':
        if (contractType.includes('over_under') || contractType.includes('overUnder')) {
          analyzer = new OverUnderAnalyzer(symbol, options.threshold || 5);
        } else {
          analyzer = new DigitAnalyzer(symbol);
        }
        break;
      case 'multiplier':
        analyzer = new MultiplierAnalyzer(symbol);
        break;
      case 'accumulator':
        analyzer = new AccumulatorAnalyzer(symbol);
        break;
      case 'synthetic':
      case 'boom_crash':
      case 'step':
      case 'derived':
        analyzer = new SyntheticAnalyzer(symbol);
        break;
      case 'vanilla':
        analyzer = new VanillaAnalyzer(symbol);
        break;
      default:
        analyzer = new ForexAnalyzer(symbol);
    }

    this.analyzers.set(key, analyzer);
    return analyzer;
  }

  getCategory(contractType) {
    const map = {
      'rise_fall': 'forex',
      'higher_lower': 'forex',
      'over_under': 'digit',
      'matches_differs': 'digit',
      'even_odd': 'digit',
      'digit_over_under': 'digit',
      'digit_match': 'digit',
      'digit_differs': 'digit',
      'multipliers': 'multiplier',
      'accumulators': 'accumulator',
      'vanilla_call': 'vanilla',
      'vanilla_put': 'vanilla',
      'synthetic_10': 'synthetic',
      'synthetic_25': 'synthetic',
      'synthetic_50': 'synthetic',
      'synthetic_75': 'synthetic',
      'synthetic_100': 'synthetic',
      'boom_1000': 'boom_crash',
      'crash_1000': 'boom_crash',
      'step_index': 'step',
      'derived_index': 'derived'
    };
    return map[contractType] || 'forex';
  }

  addTick(symbol, tick) {
    this.analyzers.forEach((analyzer, key) => {
      if (key.includes(symbol)) {
        analyzer.addTick(tick);
      }
    });
  }

  analyze(contractType, symbol, options = {}) {
    const analyzer = this.getAnalyzer(contractType, symbol, options);
    return analyzer.analyze();
  }

  getAnalysisHistory(contractType, symbol) {
    const key = `${contractType}_${symbol}`;
    const analyzer = this.analyzers.get(key);
    return analyzer ? analyzer.analysisHistory : [];
  }

  clear() {
    this.analyzers.clear();
  }
}

module.exports = new AIEngine();
