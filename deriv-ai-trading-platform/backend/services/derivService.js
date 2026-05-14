const WebSocket = require('ws');
const EventEmitter = require('events');

class DerivService extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.connected = false;
    this.authenticated = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.pingInterval = null;
    this.reqId = 1;
    this.pendingRequests = new Map();
    this.subscriptions = new Map();
    this.tickBuffers = new Map(); // Symbol -> last 100 ticks
    this.balance = null;
    this.currency = 'USD';
  }

  connect(token = null) {
    const endpoint = process.env.NODE_ENV === 'production' 
      ? 'wss://ws.binaryws.com/websockets/v3?app_id=' + process.env.DERIV_APP_ID
      : 'wss://ws.binaryws.com/websockets/v3?app_id=' + process.env.DERIV_APP_ID;

    this.ws = new WebSocket(endpoint);

    this.ws.on('open', () => {
      console.log('Deriv WebSocket connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;

      // Start ping to keep alive
      this.pingInterval = setInterval(() => this.ping(), 30000);

      // Authenticate if token provided
      if (token || process.env.DERIV_API_TOKEN) {
        this.authorize(token || process.env.DERIV_API_TOKEN);
      }

      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      try {
        const response = JSON.parse(data);
        this.handleMessage(response);
      } catch (err) {
        console.error('Failed to parse Deriv message:', err);
      }
    });

    this.ws.on('error', (err) => {
      console.error('Deriv WebSocket error:', err.message);
      this.emit('error', err);
    });

    this.ws.on('close', () => {
      console.log('Deriv WebSocket closed');
      this.connected = false;
      this.authenticated = false;
      clearInterval(this.pingInterval);
      this.emit('disconnected');
      this.reconnect(token);
    });
  }

  reconnect(token) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      this.emit('maxReconnectReached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect(token);
    }, delay);
  }

  disconnect() {
    clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.authenticated = false;
  }

  isConnected() {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  send(request) {
    if (!this.isConnected()) {
      throw new Error('WebSocket not connected');
    }
    const reqId = this.reqId++;
    const msg = { ...request, req_id: reqId };
    this.ws.send(JSON.stringify(msg));
    return reqId;
  }

  sendWithPromise(request) {
    return new Promise((resolve, reject) => {
      const reqId = this.send(request);
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error('Request timeout'));
      }, 30000);

      this.pendingRequests.set(reqId, { resolve, reject, timeout });
    });
  }

  handleMessage(response) {
    // Handle ping response
    if (response.ping) return;

    // Handle errors
    if (response.error) {
      const reqId = response.req_id;
      if (this.pendingRequests.has(reqId)) {
        const { reject, timeout } = this.pendingRequests.get(reqId);
        clearTimeout(timeout);
        this.pendingRequests.delete(reqId);
        reject(new Error(response.error.message || 'Deriv API error'));
      }
      this.emit('error', response.error);
      return;
    }

    // Handle authorization
    if (response.authorize) {
      this.authenticated = true;
      this.balance = response.authorize.balance;
      this.currency = response.authorize.currency;
      this.emit('authorized', response.authorize);
    }

    // Handle balance updates
    if (response.balance) {
      this.balance = response.balance.balance;
      this.emit('balance', response.balance);
    }

    // Handle tick data
    if (response.tick) {
      const symbol = response.tick.symbol;
      this.bufferTick(symbol, response.tick);
      this.emit('tick', response.tick);
      this.emit(`tick:${symbol}`, response.tick);
    }

    // Handle history
    if (response.history) {
      this.emit('history', response.history);
    }

    // Handle proposal
    if (response.proposal) {
      this.emit('proposal', response.proposal);
    }

    // Handle buy response
    if (response.buy) {
      this.emit('buy', response.buy);
    }

    // Handle sell response
    if (response.sell) {
      this.emit('sell', response.sell);
    }

    // Handle open contract updates
    if (response.proposal_open_contract) {
      this.emit('contractUpdate', response.proposal_open_contract);
    }

    // Resolve pending requests
    const reqId = response.req_id;
    if (this.pendingRequests.has(reqId)) {
      const { resolve, timeout } = this.pendingRequests.get(reqId);
      clearTimeout(timeout);
      this.pendingRequests.delete(reqId);
      resolve(response);
    }

    // Handle subscription updates
    if (response.subscription) {
      this.emit('subscription', response);
    }
  }

  bufferTick(symbol, tick) {
    if (!this.tickBuffers.has(symbol)) {
      this.tickBuffers.set(symbol, []);
    }
    const buffer = this.tickBuffers.get(symbol);
    const digit = parseInt(tick.quote.toString().slice(-1));
    buffer.push({
      epoch: tick.epoch,
      quote: tick.quote,
      digit: digit,
      time: new Date(tick.epoch * 1000)
    });
    if (buffer.length > 100) buffer.shift();
  }

  getTickBuffer(symbol) {
    return this.tickBuffers.get(symbol) || [];
  }

  // API Methods
  ping() {
    if (this.isConnected()) {
      this.ws.send(JSON.stringify({ ping: 1 }));
    }
  }

  authorize(token) {
    return this.sendWithPromise({ authorize: token });
  }

  subscribeTicks(symbol) {
    const reqId = this.send({
      ticks: symbol,
      subscribe: 1
    });
    this.subscriptions.set(reqId, { type: 'ticks', symbol });
    return reqId;
  }

  unsubscribeTicks(reqId) {
    this.send({ forget: reqId });
    this.subscriptions.delete(reqId);
  }

  getTickHistory(symbol, count = 100, end = 'latest') {
    return this.sendWithPromise({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: count,
      end: end,
      start: 1,
      style: 'ticks'
    });
  }

  getCandles(symbol, granularity = 60, count = 100) {
    return this.sendWithPromise({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: count,
      end: 'latest',
      style: 'candles',
      granularity: granularity
    });
  }

  getProposal(params) {
    return this.sendWithPromise({
      proposal: 1,
      ...params
    });
  }

  buyContract(proposalId, price) {
    return this.sendWithPromise({
      buy: proposalId,
      price: price
    });
  }

  buyContractDirect(params, price) {
    return this.sendWithPromise({
      buy: 1,
      price: price,
      parameters: params
    });
  }

  sellContract(contractId, price = 0) {
    return this.sendWithPromise({
      sell: contractId,
      price: price
    });
  }

  getBalance() {
    return this.sendWithPromise({
      balance: 1,
      subscribe: 1
    });
  }

  getPortfolio() {
    return this.sendWithPromise({ portfolio: 1 });
  }

  subscribeOpenContracts() {
    return this.sendWithPromise({
      proposal_open_contract: 1,
      subscribe: 1
    });
  }

  getActiveSymbols(brief = true) {
    return this.sendWithPromise({
      active_symbols: brief ? 'brief' : 'full'
    });
  }

  // Helper: Build buy parameters for each contract type
  buildBuyParams(contractType, symbol, amount, duration, durationUnit, options = {}) {
    const params = {
      proposal: 1,
      amount: amount,
      basis: 'stake',
      contract_type: contractType,
      currency: this.currency,
      symbol: symbol
    };

    if (duration) {
      params.duration = duration;
      params.duration_unit = durationUnit;
    }

    if (options.barrier !== undefined) {
      params.barrier = options.barrier;
    }

    if (options.barrier2 !== undefined) {
      params.barrier2 = options.barrier2;
    }

    if (options.digitPrediction !== undefined) {
      params.barrier = options.digitPrediction.toString();
    }

    if (options.multiplier) {
      params.multiplier = options.multiplier;
    }

    if (options.limit_order) {
      params.limit_order = options.limit_order;
    }

    return params;
  }
}

module.exports = new DerivService();
