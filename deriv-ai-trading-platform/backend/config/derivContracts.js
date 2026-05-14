module.exports = {
  // Rise/Fall (Forex/Indices)
  RISE_FALL: {
    type: 'CALL',
    category: 'forex',
    duration: { min: 1, max: 14400, unit: 't' },
    supportedSymbols: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', 
                       '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V',
                       'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD'],
    barrier: false,
    digit: false
  },

  // Higher/Lower
  HIGHER_LOWER: {
    type: 'CALL',
    category: 'forex',
    duration: { min: 1, max: 14400, unit: 't' },
    supportedSymbols: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100',
                       '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V',
                       'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY'],
    barrier: true,
    digit: false
  },

  // Over/Under
  OVER_UNDER: {
    type: 'DIGITOVER',
    category: 'digit',
    duration: { min: 1, max: 10, unit: 't' },
    supportedSymbols: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100',
                       '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'],
    barrier: false,
    digit: true,
    digitRange: { min: 0, max: 9 }
  },

  // Matches/Differs
  MATCHES_DIFFERS: {
    type: 'DIGITMATCH',
    category: 'digit',
    duration: { min: 1, max: 10, unit: 't' },
    supportedSymbols: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100',
                       '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'],
    barrier: false,
    digit: true,
    digitRange: { min: 0, max: 9 }
  },

  // Even/Odd
  EVEN_ODD: {
    type: 'DIGITEVEN',
    category: 'digit',
    duration: { min: 1, max: 10, unit: 't' },
    supportedSymbols: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100',
                       '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'],
    barrier: false,
    digit: false
  },

  // Digit Over/Under
  DIGIT_OVER_UNDER: {
    type: 'DIGITOVER',
    category: 'digit',
    duration: { min: 1, max: 10, unit: 't' },
    supportedSymbols: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100',
                       '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'],
    barrier: false,
    digit: true,
    digitRange: { min: 0, max: 9 }
  },

  // Digit Match
  DIGIT_MATCH: {
    type: 'DIGITMATCH',
    category: 'digit',
    duration: { min: 1, max: 10, unit: 't' },
    supportedSymbols: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100',
                       '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'],
    barrier: false,
    digit: true,
    digitRange: { min: 0, max: 9 }
  },

  // Digit Differs
  DIGIT_DIFFERS: {
    type: 'DIGITDIFF',
    category: 'digit',
    duration: { min: 1, max: 10, unit: 't' },
    supportedSymbols: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100',
                       '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'],
    barrier: false,
    digit: true,
    digitRange: { min: 0, max: 9 }
  },

  // Multipliers
  MULTIPLIERS: {
    type: 'MULTUP',
    category: 'multiplier',
    duration: { min: 1, max: 86400, unit: 's' },
    supportedSymbols: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100',
                       '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V',
                       'BOOM1000', 'CRASH1000', 'stpRNG'],
    barrier: false,
    digit: false,
    multiplierRange: { min: 1, max: 500 }
  },

  // Accumulators
  ACCUMULATORS: {
    type: 'ACCU',
    category: 'accumulator',
    duration: { min: 1, max: 86400, unit: 's' },
    supportedSymbols: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100',
                       '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'],
    barrier: false,
    digit: false,
    growthRate: { min: 0.01, max: 0.05 }
  },

  // Vanilla Call
  VANILLA_CALL: {
    type: 'VANILLALONGCALL',
    category: 'vanilla',
    duration: { min: 1, max: 365, unit: 'd' },
    supportedSymbols: ['frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD',
                       'frxUSDCAD', 'frxEURGBP', 'frxEURJPY'],
    barrier: true,
    digit: false
  },

  // Vanilla Put
  VANILLA_PUT: {
    type: 'VANILLALONGPUT',
    category: 'vanilla',
    duration: { min: 1, max: 365, unit: 'd' },
    supportedSymbols: ['frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD',
                       'frxUSDCAD', 'frxEURGBP', 'frxEURJPY'],
    barrier: true,
    digit: false
  },

  // Synthetic Indices
  SYNTHETIC_10: { type: 'CALL', category: 'synthetic', symbol: 'R_10' },
  SYNTHETIC_25: { type: 'CALL', category: 'synthetic', symbol: 'R_25' },
  SYNTHETIC_50: { type: 'CALL', category: 'synthetic', symbol: 'R_50' },
  SYNTHETIC_75: { type: 'CALL', category: 'synthetic', symbol: 'R_75' },
  SYNTHETIC_100: { type: 'CALL', category: 'synthetic', symbol: 'R_100' },

  // Boom & Crash
  BOOM_1000: { type: 'CALL', category: 'boom_crash', symbol: 'BOOM1000' },
  CRASH_1000: { type: 'PUT', category: 'boom_crash', symbol: 'CRASH1000' },

  // Step Index
  STEP_INDEX: { type: 'CALL', category: 'step', symbol: 'stpRNG' },

  // Derived Indices
  DERIVED_INDEX: { type: 'CALL', category: 'derived', symbol: 'JD10' }
};
