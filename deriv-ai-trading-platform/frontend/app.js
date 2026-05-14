// ==================== CONFIG ====================
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : '/api';
const WS_URL = 'wss://ws.binaryws.com/websockets/v3?app_id=1089';

// ==================== STATE ====================
const state = {
  token: localStorage.getItem('token'),
  user: null,
  currentContract: 'rise_fall',
  currentSymbol: 'R_100',
  ws: null,
  wsConnected: false,
  ticks: [],
  maxTicks: 200,
  aiEnabled: false,
  manualMode: true,
  trades: [],
  openTrades: [],
  tradeInterval: null,
  chart: null,
  pnlChart: null,
  aiAnalysis: null,
  lastTick: null,
  derivAuthorized: false
};

// ==================== DOM HELPERS ====================
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

// ==================== API ====================
async function api(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const opts = {
    headers: {
      'Content-Type': 'application/json',
      ...(state.token && { 'Authorization': `Bearer ${state.token}` })
    },
    ...options
  };
  if (opts.body && typeof opts.body === 'object') opts.body = JSON.stringify(opts.body);

  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ==================== AUTH ====================

// Handle OAuth callback token from URL
function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const oauth = params.get('oauth');

  if (token && oauth === 'success') {
    localStorage.setItem('token', token);
    state.token = token;
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
    hide($('#login-screen'));
    show($('#main-screen'));
    initApp();
    return true;
  }
  return false;
}

function initAuth() {
  $$('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const formId = tab.dataset.tab === 'login' ? 'login-form' : 'register-form';
      $$('.auth-form').forEach(f => hide(f));
      show($(`#${formId}`));
    });
  });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email: fd.get('email'), password: fd.get('password') }
      });
      loginSuccess(data);
    } catch (err) {
      $('#login-form .auth-error').textContent = err.message;
    }
  });

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        body: { email: fd.get('email'), password: fd.get('password'), name: fd.get('name') }
      });
      loginSuccess(data);
    } catch (err) {
      $('#register-form .auth-error').textContent = err.message;
    }
  });
}

function loginSuccess(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('token', data.token);
  hide($('#login-screen'));
  show($('#main-screen'));
  initApp();
}

function logout() {
  localStorage.removeItem('token');
  state.token = null;
  state.user = null;
  if (state.ws) state.ws.close();
  location.reload();
}

// ==================== APP INIT ====================
async function initApp() {
  try {
    const data = await api('/auth/me');
    state.user = data;
    updateUserUI();
  } catch (err) {
    if (err.message.includes('token')) logout();
    return;
  }

  setupSidebar();
  setupHeader();
  setupChart();
  setupTradeForm();
  setupRiskSettings();
  setupWebSocket();
  loadTrades();
  loadStats();
  startAutoRefresh();
}

function updateUserUI() {
  if (!state.user) return;
  $('#header-balance').textContent = `$${(state.user.stats?.totalProfit || 0).toFixed(2)}`;
  $('#sub-badge').textContent = state.user.subscription?.plan?.toUpperCase() || 'FREE';
  if (state.user.avatar) {
    $('#user-btn').innerHTML = `<img src="${state.user.avatar}" alt="">`;
    $('#user-btn').classList.add('has-image');
  } else {
    $('#user-btn').textContent = state.user.name?.charAt(0).toUpperCase() || 'U';
    $('#user-btn').classList.remove('has-image');
  }
  if (state.user.role === 'admin') show($('#admin-link'));

  const rs = state.user.riskSettings || {};
  $('#risk-max-amount').value = rs.maxTradeAmount || 100;
  $('#risk-daily-loss').value = rs.dailyLossLimit || 500;
  $('#risk-max-open').value = rs.maxOpenTrades || 5;
  $('#risk-sl').value = rs.stopLossPercent || 2;
  $('#risk-tp').value = rs.takeProfitPercent || 5;
}


function showTestResult(success, status, details = '') {
  const resultDiv = $('#deriv-test-result');
  show(resultDiv);
  resultDiv.className = 'deriv-test-result ' + (success ? 'success' : 'error');
  $('#test-status').textContent = status;
  $('#test-status').style.color = success ? 'var(--success)' : 'var(--danger)';
  $('#test-details').textContent = details;
}

function loadSettingsData() {
  if (!state.user) return;
  $('#settings-name').value = state.user.name || '';
  $('#settings-email').value = state.user.email || '';

  // Check if Deriv token is saved (we can infer from backend status)
  // For now, show disconnected until user connects
  $('#deriv-status-card').classList.remove('connected');
  $('#deriv-status-icon').textContent = '🔗';
  $('#deriv-status-title').textContent = 'Not Connected';
  $('#deriv-status-desc').textContent = 'Connect your Deriv API token to enable live trading';
}

function setupHeader() {
  $('#sidebar-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('collapsed');
  });

  $('#user-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#user-dropdown').classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    $('#user-dropdown').classList.add('hidden');
  });

  $('#logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  $('#bot-toggle').addEventListener('click', () => {
    state.aiEnabled = !state.aiEnabled;
    $('#bot-toggle .switch-track').classList.toggle('active', state.aiEnabled);
    if (state.aiEnabled) startAIBot(); else stopAIBot();
  });

  $$('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.manualMode = btn.dataset.mode === 'manual';
      renderTradeForm();
    });
  });

  
  // Settings modal
  const settingsModal = $('#settings-modal');

  $('[data-page="settings"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    $('#user-dropdown').classList.add('hidden');
    show(settingsModal);
    loadSettingsData();
  });

  $('.modal-close')?.addEventListener('click', () => {
    hide(settingsModal);
  });

  $('.modal-overlay')?.addEventListener('click', () => {
    hide(settingsModal);
  });

  // Settings tabs
  $$('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.settings-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $$('.settings-section').forEach(s => hide(s));
      show($(`#settings-${tab.dataset.tab}`));
    });
  });

  // Toggle token visibility
  $('#toggle-token-vis')?.addEventListener('click', () => {
    const input = $('#deriv-token-input');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // Test Deriv connection
  $('#btn-test-deriv')?.addEventListener('click', async () => {
    const token = $('#deriv-token-input').value.trim();
    const appId = $('#deriv-appid-input').value.trim() || '1089';

    if (!token) {
      showTestResult(false, 'Please enter a Deriv API token');
      return;
    }

    const resultDiv = $('#deriv-test-result');
    show(resultDiv);
    resultDiv.className = 'deriv-test-result';
    $('#test-status').textContent = 'Testing...';
    $('#test-details').textContent = 'Connecting to Deriv API...';

    try {
      const ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${appId}`);

      ws.onopen = () => {
        ws.send(JSON.stringify({ authorize: token }));
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.authorize) {
          const data = msg.authorize;
          showTestResult(true, 
            `Connected successfully!`,
            `Account: ${data.loginid} | Balance: ${data.currency} ${data.balance} | Country: ${data.country}`
          );
          ws.close();
        } else if (msg.error) {
          showTestResult(false, msg.error.message || 'Invalid token');
          ws.close();
        }
      };

      ws.onerror = () => {
        showTestResult(false, 'Connection failed. Check your internet or app ID.');
      };

      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          showTestResult(false, 'Connection timeout. Deriv API may be down.');
          ws.close();
        }
      }, 10000);

    } catch (err) {
      showTestResult(false, err.message);
    }
  });

  // Save Deriv token
  $('#btn-save-deriv')?.addEventListener('click', async () => {
    const token = $('#deriv-token-input').value.trim();
    if (!token) {
      alert('Please enter a Deriv API token');
      return;
    }

    try {
      await api('/auth/deriv-token', {
        method: 'PUT',
        body: { token }
      });

      // Update status
      $('#deriv-status-card').classList.add('connected');
      $('#deriv-status-icon').textContent = '✓';
      $('#deriv-status-title').textContent = 'Connected';
      $('#deriv-status-desc').textContent = 'Your Deriv account is linked for live trading';

      alert('Deriv token saved and encrypted successfully');
    } catch (err) {
      alert(err.message);
    }
  });

  // Save profile
  $('#btn-save-profile')?.addEventListener('click', async () => {
    try {
      await api('/users/profile', {
        method: 'PUT',
        body: { name: $('#settings-name').value }
      });
      alert('Profile updated');
      state.user.name = $('#settings-name').value;
      updateUserUI();
    } catch (err) {
      alert(err.message);
    }
  });

  // Change password
  $('#btn-change-password')?.addEventListener('click', async () => {
    const curr = $('#curr-password').value;
    const neu = $('#new-password').value;
    const conf = $('#confirm-password').value;

    if (!curr || !neu) { alert('Fill all fields'); return; }
    if (neu !== conf) { alert('Passwords do not match'); return; }
    if (neu.length < 8) { alert('Min 8 characters'); return; }

    try {
      await api('/auth/change-password', {
        method: 'PUT',
        body: { currentPassword: curr, newPassword: neu }
      });
      alert('Password changed');
      $('#curr-password').value = '';
      $('#new-password').value = '';
      $('#confirm-password').value = '';
    } catch (err) {
      alert(err.message);
    }
  });

  // Logout all
  $('#btn-logout-all')?.addEventListener('click', async () => {
    if (!confirm('Logout from all devices?')) return;
    try {
      await api('/auth/logout-all', { method: 'POST' });
      logout();
    } catch (err) {
      alert(err.message);
    }
  });

  $('#admin-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showAdminPanel();
  });
}

// ==================== SIDEBAR ====================
function setupSidebar() {
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      $$('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      state.currentContract = item.dataset.contract;
      updateSymbolForContract();
      renderTradeForm();
      requestAIAnalysis();
    });
  });
}

function updateSymbolForContract() {
  const map = {
    'rise_fall': 'R_100', 'higher_lower': 'R_100', 'over_under': 'R_100',
    'matches_differs': 'R_100', 'even_odd': 'R_100',
    'digit_over_under': 'R_100', 'digit_match': 'R_100', 'digit_differs': 'R_100',
    'multipliers': 'R_100', 'accumulators': 'R_100',
    'vanilla_call': 'frxEURUSD', 'vanilla_put': 'frxEURUSD',
    'synthetic_10': 'R_10', 'synthetic_25': 'R_25', 'synthetic_50': 'R_50',
    'synthetic_75': 'R_75', 'synthetic_100': 'R_100',
    'boom_1000': 'BOOM1000', 'crash_1000': 'CRASH1000',
    'step_index': 'stpRNG', 'derived_index': 'JD10'
  };
  state.currentSymbol = map[state.currentContract] || 'R_100';
  $('#chart-title').textContent = state.currentSymbol;

  $$('.symbol-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.symbol === state.currentSymbol);
  });

  if (state.wsConnected) {
    subscribeTicks(state.currentSymbol);
  }
}

// ==================== WEBSOCKET ====================
function setupWebSocket() {
  state.ws = new WebSocket(WS_URL);

  state.ws.onopen = () => {
    state.wsConnected = true;
    updateConnectionStatus('connected');
    subscribeTicks(state.currentSymbol);
  };

  state.ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleWSMessage(msg);
  };

  state.ws.onclose = () => {
    state.wsConnected = false;
    updateConnectionStatus('disconnected');
    setTimeout(setupWebSocket, 3000);
  };

  state.ws.onerror = () => {
    updateConnectionStatus('error');
  };
}

function updateConnectionStatus(status) {
  const dot = $('#ws-status .status-dot');
  const text = $('#ws-status .status-text');
  dot.className = 'status-dot ' + status;
  text.textContent = status === 'connected' ? 'Connected' : status === 'error' ? 'Error' : 'Connecting';
}

function subscribeTicks(symbol) {
  if (!state.wsConnected) return;
  state.ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
}

function handleWSMessage(msg) {
  if (msg.tick) {
    const tick = msg.tick;
    state.lastTick = tick;
    state.ticks.push({
      epoch: tick.epoch,
      quote: tick.quote,
      digit: parseInt(tick.quote.toString().slice(-1)),
      time: new Date(tick.epoch * 1000)
    });
    if (state.ticks.length > state.maxTicks) state.ticks.shift();
    updateTickDisplay(tick);
    drawChart();

    if (state.aiEnabled && state.ticks.length % 5 === 0) {
      requestAIAnalysis();
    }
  }
  if (msg.authorize) {
    state.derivAuthorized = true;
  }
}

function updateTickDisplay(tick) {
  $('#live-tick').textContent = tick.quote.toFixed(5);
  const prev = state.ticks.length > 1 ? state.ticks[state.ticks.length - 2].quote : tick.quote;
  const change = tick.quote - prev;
  const changeEl = $('#tick-change');
  changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(5);
  changeEl.className = 'tick-change ' + (change >= 0 ? 'up' : 'down');
}

// ==================== CHART ====================
function setupChart() {
  state.chart = $('#tick-chart');
  state.pnlChart = $('#pnl-chart');

  $$('.symbol-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.symbol-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentSymbol = btn.dataset.symbol;
      $('#chart-title').textContent = state.currentSymbol;
      state.ticks = [];
      subscribeTicks(state.currentSymbol);
    });
  });
}

function drawChart() {
  const canvas = state.chart;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth;
  const h = canvas.height = canvas.offsetHeight;

  ctx.clearRect(0, 0, w, h);

  if (state.ticks.length < 2) return;

  const data = state.ticks.slice(-100);
  const min = Math.min(...data.map(t => t.quote));
  const max = Math.max(...data.map(t => t.quote));
  const range = max - min || 1;

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    const y = h - (h * i / 4);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#00d4aa';
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((tick, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((tick.quote - min) / range) * (h - 40) - 20;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = 'rgba(0, 212, 170, 0.1)';
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  const last = data[data.length - 1];
  const lx = w;
  const ly = h - ((last.quote - min) / range) * (h - 40) - 20;
  ctx.fillStyle = '#00d4aa';
  ctx.beginPath();
  ctx.arc(lx - 3, ly, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawPnLChart(dailyData) {
  const canvas = state.pnlChart;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth;
  const h = canvas.height = canvas.offsetHeight;

  ctx.clearRect(0, 0, w, h);

  if (!dailyData || dailyData.length < 2) return;

  const values = dailyData.map(d => d.profit);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;

  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  dailyData.forEach((d, i) => {
    const x = (i / (dailyData.length - 1)) * w;
    const y = h - ((d.profit - min) / range) * (h - 30) - 15;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const zeroY = h - ((0 - min) / range) * (h - 30) - 15;
  ctx.strokeStyle = '#64748b';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, zeroY);
  ctx.lineTo(w, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ==================== AI ANALYSIS ====================
async function requestAIAnalysis() {
  try {
    $('#ai-status').textContent = 'Analyzing...';
    const data = await api('/trades/analyze', {
      method: 'POST',
      body: {
        contractType: state.currentContract,
        symbol: state.currentSymbol,
        options: { threshold: 5 }
      }
    });
    state.aiAnalysis = data.analysis;
    updateAIDisplay(data.analysis);
  } catch (err) {
    $('#ai-status').textContent = 'Analysis failed';
    console.error('AI analysis error:', err);
  }
}

function updateAIDisplay(analysis) {
  if (!analysis) return;

  const prob = analysis.probability || 0;
  const decision = analysis.decision || 'WAIT';

  const circle = $('#confidence-circle');
  const circumference = 283;
  const offset = circumference - (prob / 100) * circumference;
  circle.style.strokeDashoffset = offset;
  circle.style.stroke = prob > 70 ? '#22c55e' : prob > 50 ? '#f59e0b' : '#ef4444';

  $('#confidence-value').textContent = `${Math.round(prob)}%`;
  $('#confidence-value').style.color = prob > 70 ? '#22c55e' : prob > 50 ? '#f59e0b' : '#ef4444';

  const decEl = $('#ai-decision');
  decEl.textContent = decision;
  decEl.className = 'ai-decision ' + decision;

  $('#ai-probability').textContent = `${prob.toFixed(1)}%`;
  $('#ai-trend').textContent = analysis.trendDirection || 'neutral';
  $('#ai-volatility').textContent = analysis.volatilityScore ? `${analysis.volatilityScore.toFixed(1)}` : '--';
  $('#ai-pattern').textContent = analysis.patternDetected || 'none';
  $('#ai-reason').textContent = analysis.reason || '--';
  $('#ai-status').textContent = 'Analysis complete';

  if (state.aiEnabled && !state.manualMode && decision !== 'SKIP' && prob > 65) {
    executeAITrade(decision);
  }
}

// ==================== TRADE FORM ====================
function setupTradeForm() {
  renderTradeForm();
}

function renderTradeForm() {
  const container = $('#trade-form-container');
  const contract = state.currentContract;

  let fields = '';

  fields += `
    <div class="form-group">
      <label>Amount ($)</label>
      <input type="number" id="trade-amount" step="0.01" min="0.35" value="1" max="${state.user?.riskSettings?.maxTradeAmount || 1000}">
    </div>
  `;

  if (['rise_fall', 'higher_lower', 'over_under', 'matches_differs', 'even_odd',
       'digit_over_under', 'digit_match', 'digit_differs'].includes(contract)) {
    fields += `
      <div class="form-group">
        <label>Duration</label>
        <div class="form-row">
          <input type="number" id="trade-duration" value="5" min="1" style="flex:2">
          <select id="trade-duration-unit">
            <option value="t">Ticks</option>
            <option value="s">Seconds</option>
            <option value="m">Minutes</option>
          </select>
        </div>
      </div>
    `;
  }

  if (contract === 'higher_lower' || contract.includes('vanilla')) {
    fields += `
      <div class="form-group">
        <label>Barrier</label>
        <input type="text" id="trade-barrier" placeholder="+0.005 or -0.005">
      </div>
    `;
  }

  if (['over_under', 'matches_differs', 'digit_over_under', 'digit_match', 'digit_differs'].includes(contract)) {
    fields += `
      <div class="form-group">
        <label>Digit Prediction (0-9)</label>
        <input type="number" id="trade-digit" min="0" max="9" value="5">
      </div>
    `;
  }

  if (contract === 'multipliers') {
    fields += `
      <div class="form-group">
        <label>Multiplier</label>
        <select id="trade-multiplier">
          <option value="5">5x</option>
          <option value="10">10x</option>
          <option value="25">25x</option>
          <option value="50">50x</option>
          <option value="100">100x</option>
          <option value="200">200x</option>
          <option value="500">500x</option>
        </select>
      </div>
    `;
  }

  if (contract === 'accumulators') {
    fields += `
      <div class="form-group">
        <label>Growth Rate</label>
        <select id="trade-growth">
          <option value="0.01">1%</option>
          <option value="0.02">2%</option>
          <option value="0.03">3%</option>
          <option value="0.04">4%</option>
          <option value="0.05">5%</option>
        </select>
      </div>
    `;
  }

  if (state.aiAnalysis) {
    fields += `
      <div class="form-group">
        <label>AI Recommendation</label>
        <div style="padding:10px;background:var(--bg-tertiary);border-radius:8px;font-size:13px;color:var(--text-secondary)">
          <strong style="color:${state.aiAnalysis.decision === 'BUY' ? '#22c55e' : state.aiAnalysis.decision === 'SELL' ? '#ef4444' : '#f59e0b'}">${state.aiAnalysis.decision}</strong> 
          (${state.aiAnalysis.probability?.toFixed(0)}% confidence)
        </div>
      </div>
    `;
  }

  if (state.manualMode) {
    fields += `
      <div class="trade-actions">
        <button class="btn-buy" id="btn-buy">Buy</button>
        <button class="btn-sell" id="btn-sell">Sell</button>
      </div>
    `;
  } else {
    fields += `
      <div class="trade-actions">
        <button class="btn-buy" id="btn-ai-trade" disabled>AI Trading Active</button>
      </div>
    `;
  }

  container.innerHTML = `<div class="trade-form">${fields}</div>`;

  $('#btn-buy')?.addEventListener('click', () => executeTrade('buy'));
  $('#btn-sell')?.addEventListener('click', () => executeTrade('sell'));
}

async function executeTrade(direction) {
  const amount = parseFloat($('#trade-amount').value);
  if (!amount || amount < 0.35) {
    alert('Minimum trade amount is $0.35');
    return;
  }

  const payload = {
    contractType: state.currentContract,
    symbol: state.currentSymbol,
    amount,
    useAI: !state.manualMode
  };

  const duration = $('#trade-duration')?.value;
  const durationUnit = $('#trade-duration-unit')?.value;
  if (duration) {
    payload.duration = parseInt(duration);
    payload.durationUnit = durationUnit;
  }

  const barrier = $('#trade-barrier')?.value;
  if (barrier) payload.barrier = barrier;

  const digit = $('#trade-digit')?.value;
  if (digit !== undefined) payload.digitPrediction = parseInt(digit);

  const multiplier = $('#trade-multiplier')?.value;
  if (multiplier) payload.multiplier = parseFloat(multiplier);

  try {
    const data = await api('/trades/execute', {
      method: 'POST',
      body: payload
    });

    state.trades.unshift(data.trade);
    if (data.trade.status === 'open' || data.trade.status === 'pending') {
      state.openTrades.push(data.trade);
    }
    renderOpenTrades();
    renderHistory();
    alert(`Trade ${data.trade.status}: ${data.message}`);
  } catch (err) {
    alert(err.message);
  }
}

async function executeAITrade(decision) {
  const amount = parseFloat($('#trade-amount')?.value || 1);

  try {
    await api('/trades/execute', {
      method: 'POST',
      body: {
        contractType: state.currentContract,
        symbol: state.currentSymbol,
        amount,
        useAI: true
      }
    });
    loadTrades();
  } catch (err) {
    console.error('AI trade error:', err);
  }
}

// ==================== AI BOT ====================
function startAIBot() {
  if (state.tradeInterval) clearInterval(state.tradeInterval);
  state.tradeInterval = setInterval(() => {
    if (state.aiAnalysis && state.aiAnalysis.decision !== 'SKIP' && state.aiAnalysis.probability > 65) {
      executeAITrade(state.aiAnalysis.decision);
    }
  }, 10000);
}

function stopAIBot() {
  if (state.tradeInterval) {
    clearInterval(state.tradeInterval);
    state.tradeInterval = null;
  }
}

// ==================== TRADES DISPLAY ====================
async function loadTrades() {
  try {
    const [openData, historyData] = await Promise.all([
      api('/trades?status=open,pending'),
      api('/trades?status=won,lost&limit=50')
    ]);
    state.openTrades = openData.trades || [];
    state.trades = historyData.trades || [];
    renderOpenTrades();
    renderHistory();
  } catch (err) {
    console.error('Load trades error:', err);
  }
}

function renderOpenTrades() {
  const tbody = $('#open-trades-table tbody');
  $('#open-count').textContent = state.openTrades.length;

  tbody.innerHTML = state.openTrades.map(t => `
    <tr>
      <td>${t.symbol}</td>
      <td>${t.contractType.replace(/_/g, ' ')}</td>
      <td>$${t.amount}</td>
      <td>${t.direction.toUpperCase()}</td>
      <td class="status-${t.status}">${t.status}</td>
      <td>${t.aiAnalysis?.decision || 'MANUAL'}</td>
      <td><button class="btn-secondary" style="padding:4px 8px;font-size:11px" onclick="sellTrade('${t._id}')">Sell</button></td>
    </tr>
  `).join('');
}

function renderHistory() {
  const tbody = $('#history-table tbody');
  const filter = $('#history-filter')?.value || 'all';

  let trades = state.trades;
  if (filter !== 'all') {
    trades = trades.filter(t => t.status === filter);
  }

  tbody.innerHTML = trades.slice(0, 20).map(t => `
    <tr>
      <td>${new Date(t.createdAt).toLocaleTimeString()}</td>
      <td>${t.symbol}</td>
      <td>${t.contractType.replace(/_/g, ' ')}</td>
      <td>$${t.amount}</td>
      <td class="status-${t.status}">${t.status}</td>
      <td class="${t.profit >= 0 ? 'pl-positive' : 'pl-negative'}">${t.profit >= 0 ? '+' : ''}$${t.profit?.toFixed(2) || '0.00'}</td>
    </tr>
  `).join('');
}

async function sellTrade(tradeId) {
  try {
    await api(`/trades/${tradeId}/sell`, { method: 'POST' });
    loadTrades();
    loadStats();
  } catch (err) {
    alert(err.message);
  }
}

window.sellTrade = sellTrade;

// ==================== STATS ====================
async function loadStats() {
  try {
    const data = await api('/trades/stats/summary');
    const s = data.summary || {};
    const total = s.winCount + s.lossCount || 1;

    $('#win-rate').textContent = `${((s.winCount / total) * 100).toFixed(1)}%`;
    $('#total-pnl').textContent = `$${(s.totalProfit - s.totalLoss || 0).toFixed(2)}`;
    $('#total-trades').textContent = s.totalTrades || 0;
    $('#ai-accuracy').textContent = `${data.userStats?.aiAccuracy?.toFixed(1) || 0}%`;

    drawPnLChart(data.dailyPnL || []);
  } catch (err) {
    console.error('Load stats error:', err);
  }
}

// ==================== RISK SETTINGS ====================
function setupRiskSettings() {
  $('#save-risk').addEventListener('click', async () => {
    try {
      await api('/users/risk-settings', {
        method: 'PUT',
        body: {
          maxTradeAmount: parseFloat($('#risk-max-amount').value),
          dailyLossLimit: parseFloat($('#risk-daily-loss').value),
          maxOpenTrades: parseInt($('#risk-max-open').value),
          stopLossPercent: parseFloat($('#risk-sl').value),
          takeProfitPercent: parseFloat($('#risk-tp').value)
        }
      });
      alert('Risk settings saved');
    } catch (err) {
      alert(err.message);
    }
  });
}

// ==================== ADMIN ====================
function showAdminPanel() {
  hide($('#dashboard-view'));
  show($('#admin-view'));
  loadAdminUsers();

  $$('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.admin-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $$('.admin-section').forEach(s => hide(s));
      show($(`#admin-${tab.dataset.tab}`));
      if (tab.dataset.tab === 'stats') loadAdminStats();
      if (tab.dataset.tab === 'ai') loadAdminAI();
    });
  });
}

async function loadAdminUsers() {
  try {
    const data = await api('/admin/users');
    const tbody = $('#admin-users-table tbody');
    tbody.innerHTML = data.users.map(u => `
      <tr>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td><span class="badge">${u.subscription?.plan?.toUpperCase()}</span></td>
        <td>${u.stats?.totalTrades || 0}</td>
        <td>${u.isActive ? 'Active' : 'Inactive'}</td>
        <td>
          <button class="btn-secondary" style="padding:4px 8px;font-size:11px" onclick="toggleUser('${u._id}', ${!u.isActive})">${u.isActive ? 'Deactivate' : 'Activate'}</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Admin users error:', err);
  }
}

async function loadAdminStats() {
  try {
    const data = await api('/admin/stats');
    $('#platform-stats').innerHTML = `
      <div class="stat-box"><span class="stat-label">Total Users</span><span class="stat-value">${data.users?.total || 0}</span></div>
      <div class="stat-box"><span class="stat-label">Active Users</span><span class="stat-value">${data.users?.active || 0}</span></div>
      <div class="stat-box"><span class="stat-label">Total Trades</span><span class="stat-value">${data.trades?.total || 0}</span></div>
      <div class="stat-box"><span class="stat-label">Today's Trades</span><span class="stat-value">${data.trades?.today || 0}</span></div>
      <div class="stat-box"><span class="stat-label">Platform P/L</span><span class="stat-value">$${data.revenue?.toFixed(2) || '0.00'}</span></div>
    `;
  } catch (err) {
    console.error('Admin stats error:', err);
  }
}

async function loadAdminAI() {
  try {
    const data = await api('/admin/ai-performance');
    const container = $('#ai-performance-charts');
    container.innerHTML = (data.byAnalyzer || []).map(a => `
      <div class="card" style="margin-bottom:12px">
        <div class="card-header"><h3>${a._id.toUpperCase()} Analyzer</h3></div>
        <div style="padding:16px">
          <div class="perf-stats" style="grid-template-columns:repeat(4,1fr);padding:0">
            <div class="stat-box"><span class="stat-label">Total</span><span class="stat-value">${a.total}</span></div>
            <div class="stat-box"><span class="stat-label">Correct</span><span class="stat-value">${a.correct}</span></div>
            <div class="stat-box"><span class="stat-label">Accuracy</span><span class="stat-value">${((a.correct/a.total)*100).toFixed(1)}%</span></div>
            <div class="stat-box"><span class="stat-label">Avg Confidence</span><span class="stat-value">${a.avgConfidence?.toFixed(1) || 0}%</span></div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Admin AI error:', err);
  }
}

window.toggleUser = async (id, isActive) => {
  try {
    await api(`/admin/users/${id}/status`, {
      method: 'PUT',
      body: { isActive }
    });
    loadAdminUsers();
  } catch (err) {
    alert(err.message);
  }
};

// ==================== AUTO REFRESH ====================
function startAutoRefresh() {
  setInterval(() => {
    if (state.user) {
      loadTrades();
      loadStats();
    }
  }, 30000);
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  initAuth();

  // Check for OAuth callback first
  if (handleOAuthCallback()) return;

  if (state.token) {
    hide($('#login-screen'));
    show($('#main-screen'));
    initApp();
  }
});
